/**
 * Genera la corrida oficial del demo a runs/demo/events.ndjson — sin gastar un
 * solo token y sin tocar la red.
 *
 * Por qué existe: `npm run demo` reproduce este archivo a 8× con el banner de
 * honestidad en pantalla, y es además el fixture contra el que se desarrolla
 * todo el war room. Sin él la UI se construye a ciegas.
 *
 * ── INVARIANTE DE PACING, leer antes de tocar el guión ──
 * `replay.ts` cronometra ÚNICAMENTE desde los `log` (son los únicos eventos con
 * `ts`). Un evento sin `ts` hereda el offset del último que sí lo tenía, así que
 * una ráfaga de `artifact`/`coverage`/`cost` sin un `log` entre medio se pinta
 * entera en un solo frame. Regla: nunca más de 2 eventos seguidos sin un
 * say/show/log. Cada `beat()` mueve el reloj virtual del bus.
 *
 *   npm run gen
 */
import { rmSync } from "node:fs";
import { config } from "../config/darwin.config";
import { bus } from "../src/bus";
import { findDemoSeed, runSimulation, type SimAd } from "../src/evolution/engine";
import type {
  AdDraft,
  Angle,
  ArtifactEnvelope,
  ArtifactKind,
  CoverageEntry,
  Role,
} from "../src/schemas";

const OUT = "runs/demo/events.ndjson";

/* `bus.record` es append-only: sin esto, correr `gen` dos veces duplica la
 * corrida entera y el replay la reproduce dos veces sin quejarse. */
rmSync(OUT, { force: true });
bus.record(OUT);

/* ─────────────────────── reloj virtual ───────────────────────
 * Fabricamos los timestamps de una corrida de ~10 minutos en menos de un
 * segundo de reloj real. El bus lee la hora de aquí, no de Date.now.
 */
let T = Date.parse("2026-07-25T09:12:00-05:00");
bus.useClock(() => T);

/**
 * Ritmo global de la corrida grabada.
 *
 * Multiplica TODOS los huecos, así que `?speed=N` sigue significando lo mismo
 * y cualquier enlace que ya exista se hace más lento por igual — no hay que
 * repartir un número nuevo. A 1.2 la corrida pasa de 48s a 58s en el enlace
 * de la landing (`speed=10`), que es el ritmo con el que se lee en proyector
 * sin que la gente pierda el hilo.
 */
const PACE = Number(process.env.DARWIN_PACE ?? 1.2);
const beat = (ms: number) => {
  T += Math.round(ms * PACE);
};
const stamp = () => new Date(T).toISOString();

/* ─────────────────────── el corpus ───────────────────────
 * La materia prima. Cada cita es un mensaje real de WhatsApp de una clienta de
 * Dosmicos, redactada. De aquí salen las líneas literales del terminal, los
 * insights, los ángulos y — obligatoriamente — el `source_quote` de cada ad.
 * Regla: si no suena a mensaje real, no entra. Todo el diferenciador está aquí.
 */
const CORPUS = [
  { conv: "conv_0412", q: "se le destapa toda la noche y amanece heladita, no sé qué hacer" },
  { conv: "conv_0455", q: "me da miedo taparlo con cobija, la pediatra dijo que no" },
  { conv: "conv_0399", q: "el niño se sale del sleeping caminando, ¿tienen con piecitos?" },
  { conv: "conv_0264", q: "¿el TOG 2.0 para cuántos grados sirve? en Bogotá hace mucho frío" },
  { conv: "conv_0501", q: "lo necesito antes del sábado que es el cumpleaños de mi sobrina" },
  { conv: "conv_0188", q: "¿alcanza a llegar para el baby shower del viernes?" },
  { conv: "conv_0388", q: "le queda grande la 2, ¿manejan 18 meses?" },
  { conv: "conv_0233", q: "la tela después de tres lavadas quedó igualita, muy buena" },
  { conv: "conv_0142", q: "me la regalaron y ya le compré dos más a mis sobrinos" },
  { conv: "conv_0508", q: "¿es hecho en Colombia? eso es lo que estoy buscando" },
  { conv: "conv_0311", q: "está un poquito caro, ¿tienen combo o promoción?" },
  { conv: "conv_0290", q: "¿hacen envío a Pereira? ¿cuánto se demora?" },
] as const;

const cite = (conv: string) => CORPUS.find((c) => c.conv === conv)!.q;

/* ─────────────────────── AD_SPEC: fuente única ───────────────────────
 * Un solo array del que salen TANTO los SimAd (que come el motor) COMO los
 * AdDraft (que se pintan como tarjetas). Dos razones:
 *
 *  1. `SimAd.format` es ContentFormat (5 valores) y `AdDraft.format` es
 *     AdFormat (2 valores). Son enums distintos para el mismo concepto.
 *  2. El `id` tiene que ser idéntico en ambos lados o la fila de la grilla de
 *     evolución no se puede cruzar con su tarjeta — y ese cruce es el remate
 *     del pitch ("el que se graduó nació de ESTA cita").
 *
 * El orden y los pares (evidence_strength, format_fit, format) están calibrados
 * en scripts/check-evolution.ts. NO reordenar sin volver a correr `npm run gen`:
 * la semilla del demo depende del batch exacto.
 * Bajo la semilla 11 el que se gradúa es el índice 2 — evidencia 4, reel.
 */
const AD_SPEC = [
  {
    id: "ad_regalo_ugc",
    angle_id: "regalo_a_tiempo",
    conv: "conv_0501",
    headline: "el regalo que sí llega a tiempo",
    sub: "pídelo hoy, llega antes del sábado",
    cta: "comprar_ahora" as const,
    sim_format: "ugc_video" as const,
    ad_format: "ugc" as const,
    evidence_strength: 5,
    format_fit: 0.95,
  },
  {
    id: "ad_regalo_static",
    angle_id: "regalo_a_tiempo",
    conv: "conv_0188",
    headline: "llega antes del baby shower",
    sub: "envío en 48h a toda Colombia",
    cta: "ver_coleccion" as const,
    sim_format: "static" as const,
    ad_format: "static" as const,
    evidence_strength: 5,
    format_fit: 0.45,
  },
  {
    /* ★ el ganador bajo la semilla 11 — y es la mecánica núcleo de CLAUDE.md:
     * "se destapa toda la noche" → "la cobijita que sí se queda puesta" */
    id: "ad_noche_reel",
    angle_id: "noche_completa",
    conv: "conv_0412",
    headline: "la cobijita que sí se queda puesta",
    sub: "duerme tapada toda la noche, sin cobijas sueltas",
    cta: "ver_mas" as const,
    sim_format: "reel" as const,
    ad_format: "ugc" as const,
    evidence_strength: 4,
    format_fit: 0.8,
  },
  {
    id: "ad_calidad_ugc",
    angle_id: "aguanta_lavadas",
    conv: "conv_0233",
    headline: "tres lavadas y quedó igualita",
    sub: "algodón colombiano que aguanta el uso diario",
    cta: "ver_mas" as const,
    sim_format: "ugc_video" as const,
    ad_format: "ugc" as const,
    evidence_strength: 3,
    format_fit: 0.9,
  },
  {
    id: "ad_talla_carrusel",
    angle_id: "talla_real",
    conv: "conv_0388",
    headline: "la talla que sí le queda",
    sub: "guía real por edad, de 0 a 9 años",
    cta: "mas_informacion" as const,
    sim_format: "carousel" as const,
    ad_format: "static" as const,
    evidence_strength: 2,
    format_fit: 0.3,
  },
  {
    id: "ad_precio_static",
    angle_id: "precio_justo",
    conv: "conv_0311",
    headline: "combo de dos, envío gratis",
    sub: "sale mejor que comprarlas por separado",
    cta: "comprar_ya" as const,
    sim_format: "static" as const,
    ad_format: "static" as const,
    evidence_strength: 1,
    format_fit: 0.4,
  },
];

const SIM_ADS: SimAd[] = AD_SPEC.map((a) => ({
  id: a.id,
  angle_id: a.angle_id,
  format: a.sim_format,
  hook_pattern: "pov_comprador",
  headline: a.headline,
  evidence_strength: a.evidence_strength,
  format_fit: a.format_fit,
  generation: 1,
}));

/* ─────────────────────── contador de costo ─────────────────────── */

const byRole: Record<string, number> = {};
let total = 0;
function spend(role: Role, usd: number) {
  byRole[role] = Number(((byRole[role] ?? 0) + usd).toFixed(4));
  total = Number((total + usd).toFixed(4));
  bus.emit({ type: "cost", total_usd: total, by_role: { ...byRole } });
}

/* ─────────────────────── artefactos ─────────────────────── */

let artN = 0;
function art(
  kind: ArtifactKind,
  created_by: Role,
  payload: unknown,
  source_quote?: string,
  id?: string,
) {
  const envelope: ArtifactEnvelope = {
    id: id ?? `art_${String(++artN).padStart(2, "0")}`,
    kind,
    status: "draft",
    payload,
    source_quote,
    created_by,
    cost_usd: 0,
    created_at: stamp(),
  };
  bus.emit({ type: "artifact", envelope });
}

/* ══════════════════════════ el guión ══════════════════════════ */

/* ── 1. ingesta ── */
bus.phase("ingesta", "export de WhatsApp + web · sin red, sin scraping");
bus.agent("panorama", "thinking");
bus.say("ingesta", "abriendo el export de WhatsApp de Dosmicos");
beat(2600);
bus.show("ingesta", "archivo", "dosmicos-export.txt · 412 conversaciones · 8.417 mensajes");
beat(3100);
bus.say("ingesta", "separando lo que escribe la marca de lo que escribe la clienta");
beat(2800);
bus.show("ingesta", "redactado", "31 teléfonos y 12 nombres propios reemplazados");
beat(2400);
bus.say("ingesta", "reviews.csv no vino en el paquete — sigo sin él, no es requisito");
beat(1800);

const coverage: CoverageEntry[] = [
  { source: "web", status: "ok", note: "dosmicos.co · 34 páginas leídas" },
  { source: "conversations", status: "ok", note: "412 conversaciones · 8.417 mensajes" },
  { source: "posts_csv", status: "ok", note: "posts.csv · 68 publicaciones con métricas" },
  { source: "reviews_csv", status: "skipped", note: "no se entregó el archivo" },
  { source: "category_benchmarks", status: "ok", note: "vertical moda · 5 formatos" },
  { source: "ig_scrape", status: "skipped", note: "apagado por defecto (--ig-scrape)" },
];
bus.emit({ type: "coverage", entries: coverage });
beat(1500);
bus.say("ingesta", "4 de 6 fuentes en pie. Con eso alcanza para una estrategia completa");
beat(2200);

/* ── 2. panorama ── */
bus.phase("panorama", "qué vende la marca y qué formato le rinde");

/* La propuesta de inversión sale del playbook, no de la evidencia: puede
 * mostrarse desde el primer segundo. Sin esto ③el plan se quedaba mudo toda
 * la fase 1 y la pantalla parecía congelada. */
bus.say("strategist", "mientras leo tu web, esta es la ronda de prueba que propongo");
bus.show("strategist", "volumen", "6 ads · 1 ad = 1 ad set");
beat(900);
bus.show("strategist", "inversión", "$5/día por ad set · $30/día · $210 la semana");
beat(900);
bus.show("strategist", "gradúa", "ROAS 3.5x con 3 compras · escala +25%/día");
beat(1200);
bus.say("panorama", "recorriendo el sitio para entender qué vende exactamente");
beat(2900);
bus.show("panorama", "leyendo", "dosmicos.co/collections/sleeping-bags · 4.812 caracteres");
beat(3400);
bus.show("panorama", "leyendo", "dosmicos.co/collections/ruanas · 3.210 caracteres");
beat(3100);
bus.say("panorama", "ahora cruzo posts.csv contra los benchmarks de la categoría moda");
beat(3600);
bus.show("panorama", "señal", "reel 3.1× el reach del carrusel en esta cuenta (n=68)");
beat(2700);
bus.show("panorama", "señal", "ugc_video 2.4× el engagement del static (n=68)");
beat(2500);
bus.say("panorama", "la marca no está usando story ni ugc_video — ahí hay espacio");
beat(2400);

art("brand_research", "panorama", {
  brand_brief: {
    name: "Dosmicos",
    url: "https://dosmicos.co",
    vertical: "moda infantil",
    products: ["sleeping bags", "sleeping walkers", "ruanas", "chaquetas", "vestidos", "zapatos"],
    tone: "cálido, práctico, orgulloso de lo hecho en Colombia",
    audience: "mamás colombianas de 25 a 40 con hijos de 0 a 9 años",
  },
  formats_ranked: [
    {
      platform: "instagram",
      format: "reel",
      evidence: "own_metrics",
      signal: "reel 3.1× el reach del carrusel en la cuenta (n=68)",
      recommendation: "mover el grueso del calendario a reel",
      confidence: 0.86,
    },
    {
      platform: "tiktok",
      format: "ugc_video",
      evidence: "own_metrics",
      signal: "ugc_video 2.4× el engagement del static (n=68)",
      recommendation: "arrancar UGC con clientas reales, no con modelos",
      confidence: 0.79,
    },
    {
      platform: "instagram",
      format: "carousel",
      evidence: "category_benchmark",
      signal: "el carrusel sostiene guía de tallas mejor que el video",
      recommendation: "reservarlo para contenido de referencia, no para alcance",
      confidence: 0.61,
    },
    {
      platform: "instagram",
      format: "story",
      evidence: "visible_content",
      signal: "la marca no está publicando stories",
      recommendation: "abrir el canal: es el más barato de sostener a diario",
      confidence: 0.55,
    },
  ],
  own_content_stats: {
    posts_analyzed: 68,
    by_format: [
      { format: "reel", n: 21, avg_reach: 18400, avg_engagement_rate: 0.061, index_vs_mean: 3.1 },
      { format: "ugc_video", n: 9, avg_reach: 12100, avg_engagement_rate: 0.074, index_vs_mean: 2.4 },
      { format: "carousel", n: 24, avg_reach: 5900, avg_engagement_rate: 0.028, index_vs_mean: 1.0 },
      { format: "static", n: 14, avg_reach: 4200, avg_engagement_rate: 0.019, index_vs_mean: 0.7 },
    ],
    winner_format: "reel",
    missing_formats: ["story"],
  },
  category_benchmarks: [
    { format: "reel", claim: "el video corto domina alcance en moda infantil", source: "patron_categoria" },
    { format: "ugc_video", claim: "UGC convierte mejor que producción de marca", source: "operacion_propia" },
  ],
  coverage,
});
beat(1400);
bus.tally("panorama", 4, "formatos");
spend("panorama", 0.21);
beat(1900);

/* ── 3. el oído: minar las conversaciones ── */
bus.phase("oido", "extraer los insights con cita textual");
bus.say("miner_map", "412 conversaciones en 8 lotes de 25 · voy a leerlas todas");
beat(2100);

const MINED: [string, string][] = [
  ["conv_0412", "duerme destapada"],
  ["conv_0455", "miedo a la cobija suelta"],
  ["conv_0399", "se sale del sleeping caminando"],
  ["conv_0264", "no entiende el TOG"],
  ["conv_0501", "el regalo tiene fecha"],
  ["conv_0188", "el regalo tiene fecha"],
  ["conv_0388", "la talla no corresponde"],
  ["conv_0233", "la tela aguanta"],
];
MINED.forEach(([conv, tag], i) => {
  bus.agent("miner_map", "thinking", `${i + 1}/8 lotes`);
  bus.show("miner_map", conv, `"${cite(conv)}"`);
  beat(2500 + (i % 3) * 400);
  bus.say("miner_map", `lote ${i + 1}: ${tag}`);
  beat(1600);
});

bus.tally("miner_map", 8, "lotes");
bus.agent("miner_reduce", "thinking");
bus.say("miner_reduce", "agrupando lo repetido — los testimonios NO se agrupan, cada voz es una fila");
beat(3200);
bus.show("miner_reduce", "frecuencia", '"se destapa" o equivalente aparece en 23 conversaciones');
beat(2800);
bus.show("miner_reduce", "frecuencia", '"para cuándo llega" con fecha límite: 31 conversaciones');
beat(2600);

art(
  "insight",
  "miner_reduce",
  {
    id: "duerme_destapada",
    type: "customer_objection",
    sentiment: "negative",
    priority: 5,
    summary: "el bebé se destapa de noche y amanece frío",
    evidence: [
      { quote_redacted: cite("conv_0412"), conv_id: "conv_0412" },
      { quote_redacted: cite("conv_0455"), conv_id: "conv_0455" },
    ],
    occurrence_count: 23,
    sub_tags: ["sueño", "seguridad", "frío"],
    is_testimonial: false,
  },
  cite("conv_0412"),
);
beat(1300);
bus.say("miner_reduce", "este es el dolor número uno de la marca, y nadie lo está diciendo en un ad");
beat(2400);

art(
  "insight",
  "miner_reduce",
  {
    id: "regalo_con_fecha",
    type: "operations_friction",
    sentiment: "mixed",
    priority: 5,
    summary: "compran de regalo y la fecha del evento manda sobre todo lo demás",
    evidence: [
      { quote_redacted: cite("conv_0501"), conv_id: "conv_0501" },
      { quote_redacted: cite("conv_0188"), conv_id: "conv_0188" },
    ],
    occurrence_count: 31,
    sub_tags: ["regalo", "envío", "urgencia"],
    is_testimonial: false,
  },
  cite("conv_0501"),
);
beat(1300);

art(
  "insight",
  "miner_reduce",
  {
    id: "aguanta_lavadas",
    type: "positive_signal",
    sentiment: "positive",
    priority: 4,
    summary: "la tela aguanta el lavado y eso genera recompra",
    evidence: [
      { quote_redacted: cite("conv_0233"), conv_id: "conv_0233" },
      { quote_redacted: cite("conv_0142"), conv_id: "conv_0142" },
    ],
    occurrence_count: 14,
    sub_tags: ["calidad", "recompra"],
    is_testimonial: true,
  },
  cite("conv_0233"),
);
beat(1600);
bus.tally("miner_reduce", 18, "insights");
spend("miner_reduce", 0.54);
beat(2000);

/* ── 4. ángulos: la inversión frase → promesa ── */
bus.phase("angulos", "invertir la frase del cliente en promesa");
bus.agent("angles", "thinking");
bus.say("angles", "cada ángulo tiene que nacer de una cita. Sin cita no hay ángulo");
beat(2600);

const ANGLES: (Angle & { conv: string })[] = [
  {
    id: "noche_completa",
    conv: "conv_0412",
    insight_ids: ["duerme_destapada"],
    angle_family: "problem_solution",
    hook_pattern: "pov_comprador",
    proof_type: "demo_producto",
    hook_text: "la cobijita que sí se queda puesta",
    source_quote: cite("conv_0412"),
    evidence_strength: 4,
    confidence: 0.83,
    lifecycle: "descubierto",
  },
  {
    id: "regalo_a_tiempo",
    conv: "conv_0501",
    insight_ids: ["regalo_con_fecha"],
    angle_family: "gift",
    hook_pattern: "pregunta_problema",
    proof_type: "dato_duro",
    hook_text: "el regalo que sí llega a tiempo",
    source_quote: cite("conv_0501"),
    evidence_strength: 5,
    confidence: 0.88,
    lifecycle: "descubierto",
  },
  {
    id: "aguanta_lavadas",
    conv: "conv_0233",
    insight_ids: ["aguanta_lavadas"],
    angle_family: "social_proof",
    hook_pattern: "recomendacion_amiga",
    proof_type: "testimonio",
    hook_text: "tres lavadas y quedó igualita",
    source_quote: cite("conv_0233"),
    evidence_strength: 3,
    confidence: 0.71,
    lifecycle: "descubierto",
  },
  {
    id: "talla_real",
    conv: "conv_0388",
    insight_ids: ["talla_no_corresponde"],
    angle_family: "product_benefit",
    hook_pattern: "error_comun",
    proof_type: "comparacion_visual",
    hook_text: "la talla que sí le queda",
    source_quote: cite("conv_0388"),
    evidence_strength: 2,
    confidence: 0.64,
    lifecycle: "descubierto",
  },
  {
    id: "hecho_aqui",
    conv: "conv_0508",
    insight_ids: ["orgullo_local"],
    angle_family: "lifestyle",
    hook_pattern: "pov_comprador",
    proof_type: "autoridad",
    hook_text: "hecho en Colombia, hecho para el frío de aquí",
    source_quote: cite("conv_0508"),
    evidence_strength: 3,
    confidence: 0.69,
    lifecycle: "descubierto",
  },
  {
    id: "precio_justo",
    conv: "conv_0311",
    insight_ids: ["objecion_precio"],
    angle_family: "offer",
    hook_pattern: "comparacion",
    proof_type: "dato_duro",
    hook_text: "combo de dos, envío gratis",
    source_quote: cite("conv_0311"),
    evidence_strength: 1,
    confidence: 0.52,
    lifecycle: "descubierto",
  },
];

for (const a of ANGLES) {
  const { conv: _conv, ...angle } = a;
  bus.show("angles", "invirtiendo", `"${a.source_quote}" → "${a.hook_text}"`);
  beat(2900);
  art("angle", "angles", angle, a.source_quote, `art_angle_${a.id}`);
  beat(900);
}
bus.tally("angles", 6, "ángulos con cita");
spend("angles", 0.31);
beat(2100);

/* ── 5. estrategia ── */
bus.phase("estrategia", "cruzar ángulos × formatos × canales");
bus.agent("strategist", "thinking");
bus.say("strategist", "cruzando 6 ángulos contra 4 formatos con evidencia y 5 canales");
beat(3400);
bus.show("strategist", "regla", "1 ad = 1 ad set · $5/día · techo de testing 15% del spend");
beat(2700);
bus.say("strategist", "primera corrida: la memoria está vacía, no hay nada que reusar todavía");
beat(2500);

art("strategy", "strategist", {
  channel_mix: [
    { channel: "paid", effort_share: 0.4, role_in_mix: "encontrar el ángulo ganador rápido", what_to_test: "6 ads, un ángulo por ad set, $5/día" },
    { channel: "organic", effort_share: 0.25, role_in_mix: "sostener la marca entre campañas", what_to_test: "reel diario sobre el dolor del sueño" },
    { channel: "creators", effort_share: 0.2, role_in_mix: "prueba social que la marca no puede fabricar", what_to_test: "2 mamás reales grabando la noche completa" },
    { channel: "email", effort_share: 0.1, role_in_mix: "recuperar el carrito del que compra de regalo", what_to_test: "flujo de 3 correos con fecha de entrega" },
    { channel: "blog", effort_share: 0.05, role_in_mix: "capturar la búsqueda de TOG y tallas", what_to_test: "guía de TOG para clima colombiano" },
  ],
  testing_plan: {
    budget_per_adset_usd: config.testing.budget_per_adset_usd,
    n_ads: config.testing.n_ads_first_round,
    lane_pct_max: config.testing.lane_pct_max,
    kill_rules: config.kill_rules.map((k) => ({
      tier: k.tier,
      condition: k.condition,
      action: k.action,
      window: k.window,
    })),
    graduation: {
      roas_min: config.graduation.roas_min,
      purchases_min: config.graduation.purchases_min,
      scale_pct_day: config.graduation.scale_pct_day,
    },
    success_metrics: [
      "ROAS por ad set a 7 días",
      "compras por ad set (mínimo 3 para graduar)",
      "ATC sin compra: señal de fricción en checkout, no de ángulo malo",
    ],
  },
  rationale:
    "El dolor del sueño aparece en 23 conversaciones y no está en ningún ad de la categoría: ahí " +
    "va el grueso del testing. El formato reel manda porque en esta cuenta rinde 3.1× el carrusel, " +
    "con métricas propias, no con benchmark prestado. Paid se lleva 40% porque es el único canal " +
    "que da veredicto en días. Creators pesa 20% porque el testimonio es la única prueba que la " +
    "marca no puede escribirse a sí misma. Nada de esto pronostica CAC: no hay historial que lo sostenga.",
  /* El fixture SE NARRA como corrida 2 — su propio markdown de memoria dice
   * "static muere en las dos corridas" y runs/memory/dosmicos.json trae runs:2.
   * Dejarlo vacío hacía que el riel de retorno saliera en blanco justo en el
   * momento del pitch: el bucle quedaba en una flecha sin contenido. */
  memory_applied: [
    "problem_solution × reel graduó a 3.7x en la corrida anterior: repetir la apuesta",
    "static murió en las dos corridas: no volver a gastarle la primera ronda",
    "ugc_video sostiene sin escalar: mantenerlo con presupuesto plano, no matarlo",
  ],
});
beat(1500);
bus.tally("strategist", 5, "canales");
spend("strategist", 0.22);
beat(2200);

/* ── 6. el ejército ── */
bus.phase("ejercito", "5 agentes ejecutan la estrategia en paralelo");

bus.agent("paid", "thinking");
bus.say("paid", "escribiendo 6 ads, uno por ángulo. Cada uno carga la cita que lo originó");
beat(2400);
for (const a of AD_SPEC) {
  const quote = cite(a.conv);
  bus.show("paid", a.id, `headline ${a.headline.length}/54 · sub ${a.sub.length}/90`);
  beat(2100);
  const draft: AdDraft = {
    id: a.id,
    angle_id: a.angle_id,
    format: a.ad_format,
    headline: a.headline,
    sub: a.sub,
    cta: a.cta,
    source_quote: quote,
    ...(a.ad_format === "ugc"
      ? {
          ugc_brief: {
            hook: a.headline,
            pain_points: [quote],
            outcome: "la mamá muestra al bebé tapado a las 6am",
            visual_proof: "cuna real, luz de madrugada, sin producción",
            riff: "que cuente con sus palabras cómo dormía antes",
          },
        }
      : {}),
  };
  art("ad_draft", "paid", draft, quote, a.id);
  beat(1100);
}
bus.tally("paid", 6, "ads listos");
spend("paid", 0.19);
beat(1800);

bus.agent("organic", "thinking");
bus.say("organic", "calendario de 2 semanas, cargado a reel porque es lo que rinde aquí");
beat(2600);
bus.show("organic", "reparto", "10 piezas · 6 reel · 2 ugc_video · 2 story");
beat(2200);
art("content_calendar", "organic", {
  items: [
    { day_offset: 0, platform: "instagram", format: "reel", angle_id: "noche_completa", hook: "la cobijita que sí se queda puesta", brief_short: "Timelapse de una noche. Cuna, 10pm a 6am, el bebé tapado todo el tiempo." },
    { day_offset: 1, platform: "instagram", format: "story", angle_id: "talla_real", hook: "la talla que sí le queda", brief_short: "Encuesta: ¿qué talla le queda hoy? Link a la guía por edad." },
    { day_offset: 2, platform: "tiktok", format: "ugc_video", angle_id: "aguanta_lavadas", hook: "tres lavadas y quedó igualita", brief_short: "Clienta muestra la prenda nueva y la de hace un año, lado a lado." },
    { day_offset: 4, platform: "instagram", format: "reel", angle_id: "noche_completa", hook: "sin cobijas sueltas en la cuna", brief_short: "Voz en off de la pediatra explicando por qué no se tapa con cobija." },
    { day_offset: 6, platform: "instagram", format: "reel", angle_id: "hecho_aqui", hook: "hecho en Colombia para el frío de aquí", brief_short: "Taller en Bogotá, manos cosiendo, 20 segundos sin locución." },
    { day_offset: 8, platform: "tiktok", format: "reel", angle_id: "regalo_a_tiempo", hook: "el regalo que sí llega a tiempo", brief_short: "Cuenta regresiva al baby shower, empaque y entrega." },
    { day_offset: 9, platform: "instagram", format: "story", angle_id: "precio_justo", hook: "combo de dos, envío gratis", brief_short: "Comparación de precio: dos sueltas vs combo." },
    { day_offset: 10, platform: "instagram", format: "reel", angle_id: "talla_real", hook: "de 0 a 9 años, guía real", brief_short: "Tres niños de distintas edades con la misma referencia." },
    { day_offset: 12, platform: "tiktok", format: "ugc_video", angle_id: "noche_completa", hook: "así dormía antes", brief_short: "Testimonio de una mamá, sin guion, grabado con celular." },
    { day_offset: 13, platform: "instagram", format: "reel", angle_id: "aguanta_lavadas", hook: "un año después", brief_short: "Prenda usada un año, sin retoque, con la clienta hablando." },
  ],
});
beat(1400);
bus.tally("organic", 10, "piezas");
spend("organic", 0.12);
beat(1700);

bus.agent("creators", "thinking");
bus.say("creators", "busco mamás que ya hablan del sueño del bebé, no influencers de moda");
beat(2900);
bus.show("creators", "criterio", "audiencia colombiana · habla de crianza · menos de 40k seguidores");
beat(2400);
art(
  "influencer_prospect",
  "creators",
  {
    handle: "@mamadedosbogota",
    why_her: "publica sobre rutinas de sueño y vive en Bogotá: el frío es su tema, no un guion.",
    outreach_angle: "noche_completa",
    personalized_dm_draft:
      "Hola! Vi tu reel de la rutina de las 7pm y me quedó sonando lo de las cobijas que se " +
      "salen. Trabajo con Dosmicos, hacemos sleeping bags en Colombia. ¿Te mando uno para que lo " +
      "pruebes una semana? Sin compromiso de publicar — si no te sirve me lo dices y ya.",
    suggested_brief: "Una noche real grabada con celular: acostada 8pm, despertar 6am, tapada.",
    status: "prospect",
  },
  cite("conv_0412"),
);
beat(1600);
art(
  "influencer_prospect",
  "creators",
  {
    handle: "@pediatra.ana",
    why_her: "responde dudas de seguridad del sueño; su palabra resuelve la objeción de la cobija.",
    outreach_angle: "noche_completa",
    personalized_dm_draft:
      "Hola Ana, muchas clientas nuestras nos escriben con la misma duda que tú respondes seguido: " +
      "que les da miedo tapar al bebé con cobija. ¿Te interesaría revisar nuestro sleeping bag y " +
      "decirnos si te parece seguro? Si no lo es, preferimos saberlo.",
    suggested_brief: "Explicación de 30s sobre por qué el saco reemplaza la cobija suelta.",
    status: "prospect",
  },
  cite("conv_0455"),
);
beat(1400);
bus.tally("creators", 2, "prospectos");
spend("creators", 0.11);
beat(1700);

bus.agent("email", "thinking");
bus.say("email", "el que compra de regalo abandona carrito por miedo a que no llegue a tiempo");
beat(2800);
art(
  "email_flow",
  "email",
  {
    flow_name: "Carrito abandonado · regalo con fecha",
    angle_id: "regalo_a_tiempo",
    emails: [
      {
        subject: "¿Alcanza para el sábado?",
        preview: "Sí: si lo pides hoy antes de las 4pm, llega el viernes.",
        body: "Vimos que dejaste algo en el carrito.\n\nSi es para un cumpleaños o un baby shower, la pregunta real es una sola: ¿alcanza a llegar?\n\nPidiendo hoy antes de las 4pm, sale mañana y llega el viernes a las principales ciudades.\n\nSi la fecha es más apretada, respóndenos este correo y te decimos con honestidad si llegamos o no.",
        send_offset_days: 0,
      },
      {
        subject: "Te guardamos el combo un día más",
        preview: "Envío gratis desde $150.000, por si sumas el segundo.",
        body: "Seguimos con tu selección guardada.\n\nSi vas a regalar, el combo de dos sale mejor que comprarlas por separado y cruza el umbral de envío gratis.\n\nY si el bebé ya tiene uno: la talla siguiente nunca sobra.",
        send_offset_days: 1,
      },
      {
        subject: "Último recordatorio (y una guía de tallas)",
        preview: "La duda más común: qué talla pedir si no conoces al bebé.",
        body: "Cerramos el carrito mañana.\n\nAntes de irte, la duda que más nos escriben cuando el regalo es para otro: qué talla pedir.\n\nRegla simple: si no sabes la edad exacta, pide una talla arriba. Se usa más tiempo y nadie ha devuelto uno por grande.",
        send_offset_days: 3,
      },
    ],
  },
  cite("conv_0501"),
);
beat(1500);
bus.tally("email", 3, "emails");
spend("email", 0.07);
beat(1600);

bus.agent("blog", "thinking");
bus.say("blog", "una sola pieza, apuntada a la búsqueda que ya nos hacen por WhatsApp");
beat(2600);
bus.show("blog", "búsqueda", '"TOG sleeping bag bebé clima Bogotá" · pregunta real de conv_0264');
beat(2500);
art(
  "blog_draft",
  "blog",
  {
    title: "Qué significa el TOG y cuál necesita tu bebé en el clima colombiano",
    angle_id: "noche_completa",
    keywords: ["TOG sleeping bag", "saco de dormir bebé", "temperatura cuarto bebé", "clima Bogotá bebé"],
    outline: [
      "Qué es el TOG y por qué aparece en la etiqueta",
      "La tabla: TOG por temperatura del cuarto",
      "Bogotá, Medellín y costa: tres climas, tres respuestas",
      "Por qué el saco reemplaza a la cobija suelta",
      "Cómo saber si el bebé tiene frío (y por qué las manos no sirven de medida)",
    ],
    body: "## Qué significa TOG\n\nTOG mide qué tanto abriga una tela. No es una marca ni una talla: es una unidad térmica...\n\n## La tabla\n\n| Temperatura del cuarto | TOG recomendado |\n|---|---|\n| 24-27 °C | 0.5 |\n| 20-23 °C | 1.0 |\n| 16-19 °C | 2.0 |\n| menos de 16 °C | 2.5 |\n\n## Bogotá, Medellín y la costa\n\nUn cuarto en Bogotá a las 3am está entre 12 y 16 °C...",
  },
  cite("conv_0264"),
);
beat(1400);
bus.tally("blog", 1, "borrador");
spend("blog", 0.09);
beat(2400);

/* ══════════════════════════ 7. evolución ══════════════════════════
 * Aquí NO se fabrica nada: corre el motor real de src/evolution/engine.ts, el
 * mismo que verifica scripts/check-evolution.ts.
 */
bus.say("darwin", "los 6 ads entran a competir. Nadie decide cuál gana: gana el que rinda");
beat(3000);

const seed = await findDemoSeed(SIM_ADS);
console.log(`\n  SEED DEL DEMO: ${seed}\n`);

/* ── el inyector de latidos ──
 * El motor emite un `sim` por día, pero solo emite `log` los días en que algún
 * ad cambia de estado. Como replay.ts cronometra únicamente desde los `log`,
 * los días silenciosos heredarían el offset del día anterior y se pintarían
 * todos en el mismo frame: la simulación entera en tres destellos.
 *
 * Este suscriptor le pone latido a cada día. Funciona porque bus.emit escribe
 * el NDJSON ANTES de notificar a los listeners: el log queda después del sim en
 * el archivo y le pone timestamp al hueco que el sim del día siguiente hereda.
 * No hay recursión: el listener emite `log`, nunca `sim`.
 */
const DAY_GAP = [0, 25_000, 25_000, 28_000, 30_000, 55_000, 30_000, 70_000];
const unheartbeat = bus.subscribe((e) => {
  beat(400);
  if (e.type !== "sim") return;
  beat((DAY_GAP[e.day] ?? 25_000) - 400);
  const dead = e.ads.filter((a) => a.verdict === "kill").length;
  const grad = e.ads.filter((a) => a.verdict === "graduate").length;
  const alive = e.ads.length - dead;
  bus.log(
    "evolution",
    `día ${e.day}/7 · ${alive} vivos · ${dead} muertos${grad ? ` · ${grad} graduado` : ""}`,
  );
});

const out = await runSimulation(SIM_ADS, { seed, emit: true });
unheartbeat();

bus.tally("mutator", out.children.length, "hijos");
spend("mutator", 0.06);
beat(2600);

/* ══════════════════════════ 8. memoria ══════════════════════════ */
bus.phase("memoria", "lo aprendido queda escrito para la próxima corrida");
bus.agent("memory", "thinking");
bus.say("memory", "escribiendo lo que esta corrida enseñó. La próxima arranca desde aquí");
beat(3100);

const winner = out.ads.find((a) => a.status === "graduated");
const added = [
  `- ${winner?.angle_id ?? "noche_completa"} + reel graduó a ROAS 5.4x con 4 compras en 7 días`,
  "- problem_solution con evidencia >=4 es la familia que más aguanta en esta marca",
  "- static muere en las dos corridas: no volver a gastar la primera ronda ahí",
  "- 26 ATC sin una sola compra en precio_justo → revisar checkout antes de culpar al ángulo",
  "- el ángulo de regalo tiene la evidencia más fuerte y aun así murió: probarlo en otro formato",
  "- ugc_video sigue vivo sin escalar: sostener, no matar todavía",
];
bus.emit({
  type: "memory",
  markdown: [
    "# Memoria · Dosmicos",
    "",
    "## Corrida 2026-07-25",
    ...added,
    "",
    "## Priorizar",
    "- problem_solution × reel",
    "- testimonio de clienta real sobre el dolor del sueño",
    "",
    "## Despriorizar",
    "- offer × static en primera ronda",
  ].join("\n"),
  added_lines: added,
});
beat(2200);
bus.show("memory", "diff", `${added.length} líneas nuevas en la memoria de la marca`);
beat(1900);
bus.tally("memory", added.length, "aprendizajes");
spend("memory", 0.08);
beat(1600);

bus.say("darwin", `corrida completa · $${total.toFixed(2)} · nada se publicó sin GO humano`);
beat(1200);
bus.emit({ type: "done", run_id: "demo-2026-07-25" });

/* ══════════════════════════ el beat obligatorio ══════════════════════════
 * Si la semilla no produce el beat, el fixture es mudo y no queremos enterarnos
 * en el escenario.
 */
if (out.killed < 3 || out.graduated !== 1 || out.children.length !== 2) {
  console.error(
    `\n  FIXTURE MALO: el beat del demo no salió ` +
      `(${out.killed} muertos · ${out.graduated} graduados · ${out.children.length} hijos)\n`,
  );
  process.exit(1);
}

const dur = (T - Date.parse("2026-07-25T09:12:00-05:00")) / 1000;
console.log(
  `  ${OUT} · ${dur.toFixed(0)}s de corrida → ${(dur / 8).toFixed(0)}s a 8× · $${total.toFixed(2)}`,
);
console.log(
  `  beat: ${out.killed} muertos · ${out.graduated} graduado (${winner?.id}) · ${out.children.length} hijos\n`,
);
