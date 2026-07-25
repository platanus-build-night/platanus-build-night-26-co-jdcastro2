/**
 * El Ejército — los 5 agentes que ejecutan la estrategia.
 *
 * Corren en paralelo: ninguno depende de otro, solo de la estrategia y los
 * ángulos. Cada uno emite su propio inventario al cerrar.
 *
 * `paid` es el crítico y por eso tiene verificación propia: un AdDraft sin la
 * cita que lo originó no existe (invariante #1). El schema lo exige y aquí se
 * comprueba además que la cita sea REAL, no una que el modelo mejoró.
 *
 * Recortes en orden si hay atraso (CLAUDE.md): blog+email primero, luego
 * creators. La firma no cambia: los agentes recortados devuelven [].
 */
import { z } from "zod";
import { config } from "../config/darwin.config";
import { VOICE, ask } from "./agent";
import { bus } from "./bus";
import type { ArmyFn, ArmyOutput, RunContext, ToSimAdsFn } from "./contract";
import { DarwinLLMError } from "./llm";
import type { SimAd } from "./evolution/engine";
import {
  AdDraft,
  BlogDraft,
  ContentCalendarItem,
  EmailFlow,
  InfluencerProspect,
  type Angle,
  type ContentFormat,
  type Strategy,
} from "./schemas";

const AdsOut = z.object({ ads: z.array(AdDraft).min(1) });
const CalendarOut = z.object({ items: z.array(ContentCalendarItem).min(4).max(14) });
const CreatorsOut = z.object({ prospects: z.array(InfluencerProspect).min(1).max(4) });
const EmailOut = z.object({ flow: EmailFlow });
const BlogOut = z.object({ draft: BlogDraft });

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”"'`´]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Contexto compartido que todos los agentes de ejecución necesitan ver. */
function brief(ctx: RunContext, angles: Angle[], strategy: Strategy, research: unknown) {
  return `Marca: ${ctx.brand.name}${ctx.brand.url ? ` (${ctx.brand.url})` : ""}

ÁNGULOS (cada uno con la cita real que lo originó):
${JSON.stringify(
  angles.map((a) => ({
    id: a.id,
    hook_text: a.hook_text,
    source_quote: a.source_quote,
    angle_family: a.angle_family,
    hook_pattern: a.hook_pattern,
    proof_type: a.proof_type,
    evidence_strength: a.evidence_strength,
  })),
  null,
  1,
)}

ESTRATEGIA:
${JSON.stringify({ channel_mix: strategy.channel_mix, rationale: strategy.rationale }, null, 1)}

PANORAMA:
${JSON.stringify(research, null, 1).slice(0, 3000)}`;
}

/* ─────────────────────────────── paid ─────────────────────────────── */

async function paid(ctx: RunContext, angles: Angle[], strategy: Strategy, research: unknown) {
  bus.agent("paid", "thinking");
  bus.say("paid", `escribiendo ${config.testing.n_ads_first_round} ads, uno por ángulo`);

  const { ads } = await ask("paid", {
    system: `${VOICE}

Eres el agente de Paid de DARWIN. Escribes anuncios que van a competir de verdad.

LA REGLA QUE MANDA: cada ad lleva en "source_quote" la cita TEXTUAL del cliente
que lo originó, copiada carácter por carácter del ángulo. Sin esa cita el ad no
existe. Se verifica contra los ángulos: si la reescribes, el ad se descarta.

Formato:
- "headline": máximo ${config.ad_limits.headline_max} caracteres. Cuéntalos. Es
  el hook del ángulo, afinado para leerse en un feed.
- "sub": máximo ${config.ad_limits.sub_max} caracteres. Aterriza la promesa con
  lo concreto (qué es, para quién, qué lo hace cierto).
- "format": "ugc" si funciona con una persona real grabando con su celular;
  "static" si es una imagen de producto.
- "cta": elige el que corresponda a la intención real del ángulo.
- "ugc_brief": SOLO para format="ugc". "pain_points" son dolores REALES sacados
  de las citas, no inventados. "riff" es lo que queda libre para que la creadora
  hable con sus palabras.

PROHIBIDO FABRICAR TESTIMONIOS. El "sub" es voz de MARCA, no de cliente. No
escribas en primera persona como si una clienta contara su experiencia ("la pedí
y llegó a tiempo") salvo que sea una cita textual del material. Inventar un
testimonio es exactamente lo que DARWIN existe para no hacer: si nadie lo dijo,
no puede sonar a que alguien lo dijo. La voz de cliente va en "ugc_brief.riff",
que es un guion para que una persona real lo diga con sus palabras.

Escribe ${config.testing.n_ads_first_round} ads cubriendo al menos
${Math.max(4, config.testing.n_ads_first_round - 2)} ÁNGULOS DISTINTOS.
Priorizar los de más evidencia está bien, pero seis ads del mismo tema no son un
test de ángulo: son un test de formato disfrazado, y desperdician la ronda.
Como máximo DOS ads por ángulo, y solo si cambian de formato.`,
    user: brief(ctx, angles, strategy, research),
    schema: AdsOut,
    toolName: "entregar_ads",
  });

  const byQuote = new Map(angles.map((a) => [norm(a.source_quote), a]));
  /* Máximo 2 ads por ángulo. Medido en la primera corrida real: con 9 ángulos
   * disponibles el modelo escribió 6 ads sobre solo 3, y los 3 del mismo tema.
   * El prompt lo pide; esto lo garantiza. */
  const perAngle = new Map<string, number>();
  const kept = ads.filter((ad, i) => {
    const n = norm(ad.source_quote);
    const ok = [...byQuote.keys()].some((k) => k === n || k.includes(n) || n.includes(k));
    if (!ok) {
      bus.say("paid", `descarto "${ad.headline}": su cita no coincide con ningún ángulo`);
      return false;
    }
    const used = perAngle.get(ad.angle_id) ?? 0;
    if (used >= 2) {
      bus.say("paid", `descarto "${ad.headline}": ya hay 2 ads del ángulo ${ad.angle_id}`);
      return false;
    }
    perAngle.set(ad.angle_id, used + 1);
    bus.show(
      "paid",
      ad.id || `ad_${i + 1}`,
      `headline ${ad.headline.length}/${config.ad_limits.headline_max} · ${ad.format} · ${ad.angle_id}`,
    );
    return true;
  });

  if (!kept.length) {
    throw new DarwinLLMError(
      "Ningún ad conservó una cita verificable. Un ad sin la cita que lo originó no existe.",
      "parse",
    );
  }
  bus.tally("paid", kept.length, "ads listos");
  return kept;
}

/* ───────────────────────────── organic ───────────────────────────── */

async function organic(ctx: RunContext, angles: Angle[], strategy: Strategy, research: unknown) {
  bus.agent("organic", "thinking");
  const { items } = await ask("organic", {
    system: `${VOICE}

Eres el agente de Orgánico de DARWIN. Armas un calendario de 2 semanas.

- "day_offset" de 0 a 13. No pongas todo el mismo día.
- Carga el calendario al formato que el Panorama muestra que RINDE en esta
  cuenta. Si un formato tiene índice alto con muestra decente, ahí va el grueso.
- "brief_short": qué se graba o se arma, en dos frases máximo. Concreto y
  filmable con un celular. Nada de "contenido inspiracional".
- Cada pieza cuelga de un "angle_id" existente.`,
    user: brief(ctx, angles, strategy, research),
    schema: CalendarOut,
    toolName: "entregar_calendario",
  });
  bus.tally("organic", items.length, "piezas");
  return items;
}

/* ───────────────────────────── creators ───────────────────────────── */

async function creators(ctx: RunContext, angles: Angle[], strategy: Strategy, research: unknown) {
  bus.agent("creators", "thinking");
  const { prospects } = await ask("creators", {
    system: `${VOICE}

Eres el agente de Creators de DARWIN. Propones PERFILES de creadoras a buscar.

Importante: NO inventes cuentas reales. "handle" es el perfil TIPO que hay que
buscar, descrito como handle plausible (@mamadedos_bogota). Quien ejecute va a
buscar a alguien así; no estás afirmando que esa cuenta existe.

- "why_her": por qué ESE perfil y no cualquiera, amarrado a un ángulo concreto.
- "personalized_dm_draft": el DM listo para enviar, en primera persona, corto,
  sin plantilla obvia y sin promesas de pago que nadie autorizó. Que suene a
  persona escribiéndole a otra persona.
- "suggested_brief": qué grabaría, en una frase.`,
    user: brief(ctx, angles, strategy, research),
    schema: CreatorsOut,
    toolName: "entregar_prospectos",
  });
  bus.tally("creators", prospects.length, "prospectos");
  return prospects;
}

/* ────────────────────────────── email ────────────────────────────── */

async function email(ctx: RunContext, angles: Angle[], strategy: Strategy, research: unknown) {
  bus.agent("email", "thinking");
  const { flow } = await ask("email", {
    system: `${VOICE}

Eres el agente de Email de DARWIN. Escribes UN flujo de 2 a 4 correos.

Elige la fricción de compra más concreta que veas en los ángulos (una duda que
frena la compra) y resuélvela correo a correo.

- "subject": máximo 60 caracteres. Que sea la pregunta que el cliente ya tiene
  en la cabeza, no un eslogan.
- "preview": máximo 90 caracteres. Complementa el subject, no lo repite.
- "body": texto plano con saltos de línea. Corto. Sin "Estimado cliente".
- "send_offset_days": 0 para el primero.`,
    user: brief(ctx, angles, strategy, research),
    schema: EmailOut,
    toolName: "entregar_flujo_de_email",
  });
  bus.tally("email", flow.emails.length, "emails");
  return [flow];
}

/* ─────────────────────────────── blog ─────────────────────────────── */

async function blog(ctx: RunContext, angles: Angle[], strategy: Strategy, research: unknown) {
  bus.agent("blog", "thinking");
  const { draft } = await ask("blog", {
    system: `${VOICE}

Eres el agente de Blog de DARWIN. Escribes UN artículo.

Apunta a una pregunta que los clientes YA están haciendo en las conversaciones
—esa es la búsqueda real— no a una keyword genérica de la categoría.

- "body": markdown, 400 a 700 palabras. Responde la pregunta en los primeros dos
  párrafos; no la guardes para el final.
- Si el tema admite una tabla de referencia, ponla: es lo que la gente vuelve a
  buscar.
- Nada de relleno SEO ni de repetir la keyword.`,
    user: brief(ctx, angles, strategy, research),
    schema: BlogOut,
    toolName: "entregar_borrador_de_blog",
  });
  bus.tally("blog", 1, "borrador");
  return [draft];
}

/* ─────────────────────────── orquestación ─────────────────────────── */

/** Los canales que la estrategia no incluyó no se ejecutan: el reparto manda. */
export const runArmy: ArmyFn = async (ctx, { research, angles, strategy }) => {
  const active = new Set(strategy.channel_mix.map((c) => c.channel));
  bus.say("darwin", `desplegando ${active.size} agentes en paralelo: ${[...active].join(", ")}`);

  const run = <T>(ch: string, fn: () => Promise<T>, empty: T) =>
    active.has(ch as never)
      ? fn().catch((err) => {
          // Un canal que falla no tumba la corrida: se reporta y sigue.
          bus.agent(ch, "error", String(err?.message ?? err));
          bus.say(ch, `falló: ${err?.message ?? err}`);
          return empty;
        })
      : Promise.resolve(empty);

  // paid NO va en el catch: sin ads no hay evolución ni demo.
  const [ads, calendar, prospects, flows, drafts] = await Promise.all([
    paid(ctx, angles, strategy, research),
    run("organic", () => organic(ctx, angles, strategy, research), []),
    run("creators", () => creators(ctx, angles, strategy, research), []),
    run("email", () => email(ctx, angles, strategy, research), []),
    run("blog", () => blog(ctx, angles, strategy, research), []),
  ]);

  const out: ArmyOutput = {
    ads,
    calendar,
    creators: prospects,
    emails: flows,
    blogs: drafts,
  };
  return out;
};

/* ─────────────────────── puente al motor de evolución ─────────────────────── */

/**
 * AdFormat (static|ugc) → ContentFormat (5 valores), y adjunta el
 * evidence_strength del ángulo, que es lo que el motor usa para modular la
 * verdad oculta del ad.
 *
 * `format_fit` sale del ranking del Panorama: qué tan bien encaja el formato
 * elegido con lo que le rinde a ESTA cuenta. Es el segundo factor que decide
 * quién sobrevive, y por eso no puede ser un número inventado.
 */
export const toSimAds: ToSimAdsFn = (ads, angles) => {
  const byId = new Map(angles.map((a) => [a.id, a]));
  return ads.map((ad): SimAd => {
    const angle = byId.get(ad.angle_id);
    return {
      id: ad.id,
      angle_id: ad.angle_id,
      format: (ad.format === "ugc" ? "ugc_video" : "static") as ContentFormat,
      hook_pattern: angle?.hook_pattern,
      headline: ad.headline,
      evidence_strength: angle?.evidence_strength ?? 1,
      format_fit: 0.5,
      generation: 1,
    };
  });
};

/**
 * Igual que toSimAds pero usando el ranking de formatos del Panorama para el
 * format_fit real. Se usa desde run.ts, que sí tiene el research a mano.
 */
export function toSimAdsWithFit(
  ads: Parameters<ToSimAdsFn>[0],
  angles: Angle[],
  formatScores: Map<ContentFormat, number>,
): SimAd[] {
  return toSimAds(ads, angles).map((s) => ({
    ...s,
    format_fit: formatScores.get(s.format) ?? 0.5,
  }));
}
