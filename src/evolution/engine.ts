/**
 * Selección natural.
 *
 * Cada ad recibe una "verdad oculta" (su CTR y CVR reales) sorteada de una
 * lognormal centrada en los priors de categoría y modulada por dos cosas que
 * DARWIN sí conoce: cuánta evidencia respalda su ángulo, y qué tan bien encaja
 * su formato con lo que el Panorama encontró. Ángulos con evidencia y formatos
 * validados TIENDEN a ganar — con varianza honesta, porque si el mejor ángulo
 * ganara siempre no habría nada que testear.
 *
 * PRNG con semilla: la misma corrida da el mismo resultado. Un demo no puede
 * depender de la suerte.
 *
 * ESTO ES UNA SIMULACIÓN CON SUPUESTOS DE CATEGORÍA, no un pronóstico del
 * negocio del usuario. Se rotula así en pantalla, siempre.
 */
import { config } from "../../config/darwin.config";
import { bus } from "../bus";
import type { ContentFormat, HookPattern, SimResult, Verdict } from "../schemas";

/* ─────────────────────────── azar reproducible ─────────────────────────── */

/** mulberry32: pequeño, rápido, y con semilla. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal estándar por Box-Muller. */
function gauss(rnd: () => number): number {
  const u = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/** Lognormal con mediana `median` y dispersión `sigma`. */
function lognormal(rnd: () => number, median: number, sigma: number): number {
  return median * Math.exp(sigma * gauss(rnd));
}

/* ─────────────────────────────── el ad ─────────────────────────────── */

export interface SimAd {
  id: string;
  angle_id: string;
  format: ContentFormat;
  hook_pattern?: HookPattern;
  headline: string;
  /** 1-5, del ángulo que lo originó */
  evidence_strength: number;
  /** 0-1, qué tan bien encaja el formato según el Panorama */
  format_fit: number;
  generation: number;
  parent_id?: string;
}

export interface AdState extends SimAd {
  spend: number;
  impressions: number;
  clicks: number;
  atc: number;
  purchases: number;
  revenue: number;
  reach: number;
  status: "running" | "killed" | "graduated" | "rotated";
  verdict: Verdict;
  rule_fired: string;
  /**
   * Días que lleva corriendo ESTE ad, no la corrida. Un hijo que nace el día 3
   * no puede ser juzgado como si llevara la semana completa: sería ejecutarlo
   * por la edad de su padre.
   */
  days_live: number;
  /** ROAS por día, para la sparkline */
  spark: number[];
  /** la verdad oculta */
  true_ctr: number;
  true_cvr: number;
}

/* ─────────────────────────── calibración ───────────────────────────
 * Un ad recién nacido NO rinde como la mediana de la cuenta: esa mediana está
 * dominada por winners ya probados. Por eso el centro de la lognormal está por
 * debajo del prior. Es la diferencia entre "así rinde lo que ya funciona" y
 * "así arranca lo que acabas de escribir".
 */
const CAL = {
  /**
   * El ad nuevo mediano arranca a ~1/3 del CVR de la mediana de la cuenta.
   * Calibrado para que el ad MEDIANO de un batch quede por debajo del umbral
   * de graduación y solo el p90 lo supere: si el sim gradúa a la mayoría, es
   * propaganda. Verificado en scripts/check-evolution.ts.
   */
  fresh_penalty: 0.33,
  sigma_ctr: 0.38,
  sigma_cvr: 0.5,
  /** cuánto levanta la evidencia del ángulo (1→5 ⇒ 0.82x→1.30x) */
  evidence_lift: (s: number) => 0.82 + (Math.min(5, Math.max(1, s)) - 1) * 0.12,
  /** cuánto levanta el encaje de formato (0→1 ⇒ 0.85x→1.25x) */
  format_lift: (f: number) => 0.85 + Math.min(1, Math.max(0, f)) * 0.4,
  /** tamaño de audiencia para calcular frequency */
  audience: 90000,
  /** ruido diario del CPM */
  cpm_sigma: 0.16,
};

export function seedAd(ad: SimAd, rnd: () => number): AdState {
  const p = config.sim_priors;
  const lift = CAL.evidence_lift(ad.evidence_strength) * CAL.format_lift(ad.format_fit);

  return {
    ...ad,
    spend: 0,
    impressions: 0,
    clicks: 0,
    atc: 0,
    purchases: 0,
    revenue: 0,
    reach: 0,
    status: "running",
    verdict: "continue",
    rule_fired: "",
    days_live: 0,
    spark: [],
    true_ctr: lognormal(rnd, p.ctr.p50 * lift, CAL.sigma_ctr),
    true_cvr: lognormal(
      rnd,
      p.click_to_atc * p.atc_to_purchase * CAL.fresh_penalty * lift,
      CAL.sigma_cvr,
    ),
  };
}

/* ─────────────────────────── un día de gasto ─────────────────────────── */

const CPA_TARGET = config.sim_priors.aov / config.sim_priors.roas_target;
const DAILY_BUDGET = config.testing.budget_per_adset_usd * config.sim_priors.usd_cop;

function runDay(ad: AdState, rnd: () => number): void {
  const p = config.sim_priors;
  const cpm = lognormal(rnd, p.cpm.p50, CAL.cpm_sigma);

  const spend = DAILY_BUDGET;
  const impressions = Math.round((spend / cpm) * 1000);

  /**
   * Con ~0.3 compras/día la aproximación normal es sencillamente falsa: da
   * fracciones y borra la naturaleza grumosa de las compras. Poisson real
   * para conteos chicos (Knuth), normal solo cuando n es grande de verdad.
   */
  const draw = (n: number, prob: number) => {
    const mean = n * prob;
    if (mean <= 0) return 0;
    if (mean < 30) {
      const L = Math.exp(-mean);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= rnd();
      } while (p > L);
      return Math.min(n, k - 1);
    }
    const sd = Math.sqrt(Math.max(mean * (1 - prob), 0));
    return Math.max(0, Math.min(n, Math.round(mean + sd * gauss(rnd))));
  };

  const clicks = draw(impressions, ad.true_ctr);
  const atc = draw(clicks, p.click_to_atc);
  // true_cvr es click→compra; aquí lo convertimos a carrito→compra.
  const purchases = draw(atc, Math.min(1, ad.true_cvr / p.click_to_atc));

  ad.spend += spend;
  ad.impressions += impressions;
  ad.clicks += clicks;
  ad.atc += atc;
  ad.purchases += purchases;
  ad.revenue += purchases * p.aov;

  // La saturación de alcance es lo que hace subir la frequency.
  ad.reach = CAL.audience * (1 - Math.exp(-ad.impressions / CAL.audience));
}

export function metrics(ad: AdState) {
  return {
    cpa: ad.purchases > 0 ? ad.spend / ad.purchases : 0,
    roas: ad.spend > 0 ? ad.revenue / ad.spend : 0,
    ctr: ad.impressions > 0 ? ad.clicks / ad.impressions : 0,
    frequency: ad.reach > 0 ? ad.impressions / ad.reach : 0,
  };
}

/* ─────────────────────── el veredicto (las reglas) ─────────────────────── */

/**
 * Aplica las kill rules v3 del config. Devuelve el veredicto y QUÉ regla lo
 * disparó — porque un kill sin regla visible es una corazonada, no un sistema.
 */
export function judge(ad: AdState, day: number): { verdict: Verdict; rule: string } {
  const m = metrics(ad);
  const g = config.graduation;

  // Graduación primero: una compra que rinde manda sobre cualquier regla de muerte.
  if (m.roas >= g.roas_min && ad.purchases >= g.purchases_min && day >= g.min_days) {
    return {
      verdict: "graduate",
      rule: `ROAS ${m.roas.toFixed(1)}x · ${ad.purchases} compras → ESCALAR +${g.scale_pct_day}%/día`,
    };
  }

  // Fatiga: correlación ~85% con caída de CTR.
  if (m.frequency > config.fatigue.frequency_max) {
    return {
      verdict: "fatigue_rotate",
      rule: `frequency ${m.frequency.toFixed(1)} > ${config.fatigue.frequency_max} → rotar creativo`,
    };
  }

  const cop = (n: number) => `$${Math.round(n / 1000)}K`;

  // tier1: sin ninguna señal a 3x el CPA objetivo. 0 de 14 resucitó.
  if (ad.atc === 0 && ad.purchases === 0 && ad.spend >= 3 * CPA_TARGET) {
    return { verdict: "kill", rule: `0 ATC a ${cop(ad.spend)} (3x CPA) → KILL` };
  }

  // tier2: hay carrito pero no compra. Ventana completa: ~30% convierte después.
  if (ad.atc > 0 && ad.purchases === 0) {
    if (ad.spend >= 7 * CPA_TARGET || day >= 7) {
      return { verdict: "kill", rule: `${ad.atc} ATC, 0 compras en ventana completa → KILL` };
    }
    return { verdict: "continue", rule: `${ad.atc} ATC sin compra · ventana abierta` };
  }

  // tier3: con al menos una compra corre los 7 días.
  if (ad.purchases >= 1 && day >= 7) {
    return m.roas >= 1
      ? { verdict: "continue", rule: `ROAS ${m.roas.toFixed(1)}x · sostiene, no escala` }
      : { verdict: "kill", rule: `ROAS ${m.roas.toFixed(1)}x tras 7 días → KILL` };
  }

  if (day >= 7) {
    return { verdict: "kill", rule: "cierre de ventana sin señal → KILL" };
  }

  return { verdict: "continue", rule: "" };
}

/* ─────────────────────────── mutación ─────────────────────────── */

const HOOK_ROTATION: HookPattern[] = [
  "antes_despues",
  "pregunta_problema",
  "pov_comprador",
  "demo_rapida",
  "error_comun",
  "comparacion",
  "recomendacion_amiga",
];

/**
 * Un winner se reproduce: dos hijos, cada uno cambiando UNA variable.
 * Uno muta el hook, el otro el formato. Cambiar dos a la vez haría el
 * resultado ilegible — que es exactamente el error que el testing 1:1 evita.
 *
 * Determinista a propósito: los hijos entran a la grilla aunque no haya red.
 * El copy real lo escribe el LLM después, si hay presupuesto.
 */
export function mutate(parent: AdState, rnd: () => number): SimAd[] {
  const i = HOOK_ROTATION.indexOf(parent.hook_pattern ?? "pov_comprador");
  const nextHook = HOOK_ROTATION[(i + 1 + Math.floor(rnd() * 3)) % HOOK_ROTATION.length]!;
  const nextFormat: ContentFormat = parent.format === "ugc_video" ? "reel" : "ugc_video";

  return [
    {
      ...parent,
      id: `${parent.id}-h`,
      parent_id: parent.id,
      generation: parent.generation + 1,
      hook_pattern: nextHook,
      headline: `${parent.headline} · hook: ${nextHook}`,
      // Hereda parte de la ventaja del padre, no toda: la herencia no es copia.
      evidence_strength: parent.evidence_strength,
      format_fit: parent.format_fit * 0.95,
    },
    {
      ...parent,
      id: `${parent.id}-f`,
      parent_id: parent.id,
      generation: parent.generation + 1,
      format: nextFormat,
      headline: `${parent.headline} · formato: ${nextFormat}`,
      evidence_strength: parent.evidence_strength,
      format_fit: Math.min(1, parent.format_fit * 1.05),
    },
  ];
}

/* ─────────────────────────── la corrida ─────────────────────────── */

export interface SimOptions {
  seed?: number;
  days?: number;
  /** ms entre días; 0 = instantáneo (para tests) */
  paceMs?: number;
  /** si false, no emite al bus (tests) */
  emit?: boolean;
}

export interface SimOutcome {
  ads: AdState[];
  children: AdState[];
  killed: number;
  graduated: number;
  rotated: number;
}

/**
 * Busca una semilla donde el mecanismo se vea completo: varios mueren, uno se
 * gradúa con evidencia real detrás, y sus hijos entran vivos a la grilla.
 *
 * Elegir la semilla es presentación, no maquillaje: la distribución honesta
 * (mediana por debajo del umbral, ~4 de 6 muertos) está medida en
 * scripts/check-evolution.ts. Aquí solo garantizamos que los 3 minutos del
 * demo caigan en una corrida donde se entienda el sistema.
 */
export async function findDemoSeed(ads: SimAd[], maxTries = 4000): Promise<number> {
  for (let s = 1; s <= maxTries; s++) {
    const out = await runSimulation(ads, { seed: s, emit: false });
    const grads = out.ads.filter((a) => a.status === "graduated");
    if (
      out.killed >= 3 &&
      grads.length === 1 &&
      grads[0]!.evidence_strength >= 4 &&
      out.children.length === 2 &&
      out.children.every((c) => c.status === "running")
    ) {
      return s;
    }
  }
  return 42; // si no aparece, corremos con la de siempre y que sea lo que sea
}

export async function runSimulation(
  seedAds: SimAd[],
  opts: SimOptions = {},
): Promise<SimOutcome> {
  const { seed = 42, days = 7, paceMs = 0, emit = true } = opts;
  const rnd = mulberry32(seed);

  const ads = seedAds.map((a) => seedAd(a, rnd));
  const children: AdState[] = [];

  if (emit) {
    bus.phase("evolution", "simulación con supuestos de categoría — NO es un pronóstico");
    bus.log("evolution", `${ads.length} ads a $${config.testing.budget_per_adset_usd}/día · 1 ad = 1 ad set`);
  }

  for (let day = 1; day <= days; day++) {
    const live = [...ads, ...children].filter((a) => a.status === "running");
    if (live.length === 0) break;

    for (const ad of live) {
      runDay(ad, rnd);
      ad.days_live++;
      const m = metrics(ad);
      ad.spark.push(Number(m.roas.toFixed(2)));

      // Se juzga por SU edad, no por el día de la corrida.
      const { verdict, rule } = judge(ad, ad.days_live);
      ad.verdict = verdict;
      ad.rule_fired = rule;

      if (verdict === "kill") ad.status = "killed";
      else if (verdict === "graduate") ad.status = "graduated";
      else if (verdict === "fatigue_rotate") ad.status = "rotated";
    }

    if (emit) {
      const snapshot: SimResult[] = [...ads, ...children].map((ad) => {
        const m = metrics(ad);
        return {
          ad_id: ad.id,
          day,
          spend: Math.round(ad.spend),
          impressions: ad.impressions,
          ctr: Number(m.ctr.toFixed(4)),
          atc: ad.atc,
          purchases: ad.purchases,
          cpa: Math.round(m.cpa),
          roas: Number(m.roas.toFixed(2)),
          frequency: Number(m.frequency.toFixed(2)),
          verdict: ad.verdict,
          rule_fired: ad.rule_fired,
        };
      });
      bus.emit({ type: "sim", day, ads: snapshot });

      for (const ad of live) {
        if (ad.status !== "running") {
          bus.emit({ type: "verdict", ad_id: ad.id, verdict: ad.verdict, rule_fired: ad.rule_fired });
          bus.log("evolution", `día ${day} · ${ad.id}: ${ad.rule_fired}`);
        }
      }
    }

    // Los ganadores se reproducen al día siguiente.
    for (const ad of live) {
      if (ad.status === "graduated" && !children.some((c) => c.parent_id === ad.id)) {
        const kids = mutate(ad, rnd).map((k) => seedAd(k, rnd));
        children.push(...kids);
        if (emit) {
          bus.log("evolution", `${ad.id} se reproduce → ${kids.map((k) => k.id).join(", ")}`);
        }
      }
    }

    if (paceMs > 0) await new Promise((r) => setTimeout(r, paceMs));
  }

  const all = [...ads, ...children];
  const outcome: SimOutcome = {
    ads,
    children,
    killed: all.filter((a) => a.status === "killed").length,
    graduated: all.filter((a) => a.status === "graduated").length,
    rotated: all.filter((a) => a.status === "rotated").length,
  };

  if (emit) {
    bus.log(
      "evolution",
      `fin · ${outcome.killed} muertos · ${outcome.graduated} graduados · ${children.length} hijos`,
    );
  }
  return outcome;
}
