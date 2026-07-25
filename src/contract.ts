/**
 * EL CONTRATO ENTRE ETAPAS.
 *
 * Por qué existe: el trabajo que falta se reparte en worktrees paralelos
 * (pipeline · army · memory). Los archivos son disjuntos, así que git nunca
 * reportará un conflicto — pero si cada worktree inventa su propia firma, el
 * merge no compila y nadie se entera hasta el final.
 *
 * Este archivo hace que TypeScript sea el árbitro. Cada módulo se declara así:
 *
 *     import type { PanoramaFn } from "../contract";
 *     export const panorama: PanoramaFn = async (ctx) => { ... };
 *
 * Si alguien se desvía de la firma, `npm run typecheck` falla EN SU WORKTREE,
 * no en el merge. Esa es toda la idea.
 *
 * REGLA: este archivo solo se toca en `main`, y con acuerdo previo. Es el único
 * punto donde tres worktrees se pisan.
 *
 * Los TIPOS DE DATOS no se discuten: ya están fijos en schemas.ts. Aquí solo se
 * fija QUIÉN recibe qué y QUÉ devuelve.
 */
import type { SimAd, SimOutcome } from "./evolution/engine";
import type {
  AdDraft,
  Angle,
  BlogDraft,
  BrandResearch,
  ContentCalendarItem,
  EmailFlow,
  InfluencerProspect,
  IngestResult,
  Insight,
  MemoryDigest,
  MemoryEntry,
  Strategy,
} from "./schemas";

/* ─────────────────────────── el contexto ───────────────────────────
 * Lo que TODA etapa recibe. Si una etapa necesita algo que no está aquí, se
 * agrega acá y se avisa — no se pasa por un canal lateral.
 */
export interface RunContext {
  runId: string;
  brand: { name: string; url: string };
  /** Lo que salió de pipeline/ingest.ts. Cada fuente puede venir vacía. */
  data: IngestResult;
}

/* ─────────────────────────── las etapas ───────────────────────────
 * El DAG está decidido: cada firma dice exactamente de qué depende.
 * panorama y miner son independientes → corren en paralelo.
 */

/** Qué vende la marca y qué formato le rinde. Lee data.site_text y data.posts. */
export type PanoramaFn = (ctx: RunContext) => Promise<BrandResearch>;

/**
 * Map+reduce sobre las conversaciones. Devuelve insights con cita textual.
 * Los testimonios JAMÁS se agrupan: cada voz es una fila (is_testimonial).
 */
export type MinerFn = (ctx: RunContext) => Promise<Insight[]>;

/**
 * LA MECÁNICA NÚCLEO: invierte la frase del cliente en promesa.
 * Recibe `research` porque el tono de marca condiciona el hook.
 */
export type AnglesFn = (
  ctx: RunContext,
  input: { insights: Insight[]; research: BrandResearch },
) => Promise<Angle[]>;

/** Cruza ángulos × formatos × canales. `memory` es null en la primera corrida. */
export type StrategistFn = (
  ctx: RunContext,
  input: {
    research: BrandResearch;
    angles: Angle[];
    memory: MemoryDigest | null;
  },
) => Promise<Strategy>;

/* ─────────────────────────── el ejército ─────────────────────────── */

/**
 * Lo que producen los 5 agentes de ejecución.
 * `ads` alimenta DOS cosas y por eso importa: las tarjetas del war room y —
 * vía `toSimAds` — la grilla de evolución. El `id` tiene que ser el mismo en
 * ambos lados o el cruce fila↔tarjeta se rompe.
 */
export interface ArmyOutput {
  ads: AdDraft[];
  calendar: ContentCalendarItem[];
  creators: InfluencerProspect[];
  emails: EmailFlow[];
  blogs: BlogDraft[];
}

export type ArmyFn = (
  ctx: RunContext,
  input: { research: BrandResearch; angles: Angle[]; strategy: Strategy },
) => Promise<ArmyOutput>;

/**
 * Puente ejército → motor de evolución.
 * `AdDraft.format` es AdFormat (2 valores) y `SimAd.format` es ContentFormat
 * (5 valores): son enums distintos para el mismo concepto y alguien tiene que
 * traducir. Vive del lado del ejército, que es quien conoce el formato real.
 */
export type ToSimAdsFn = (ads: AdDraft[], angles: Angle[]) => SimAd[];

/* ─────────────────────────── la memoria ─────────────────────────── */

/** Lo de corridas anteriores. Devuelve [] si la marca es nueva. */
export type MemoryLoadFn = (brand: string) => MemoryEntry[];

/** Destila las entradas en algo que el Estratega pueda usar. */
export type MemoryDigestFn = (entries: MemoryEntry[]) => Promise<MemoryDigest>;

/**
 * Escribe lo aprendido y devuelve el diff que pinta el war room.
 * `added_lines` tiene que ser un subconjunto EXACTO de las líneas de `markdown`
 * — app.js las compara por igualdad de string para marcarlas en verde.
 */
export type MemoryCommitFn = (
  brand: string,
  input: { angles: Angle[]; ads: AdDraft[]; outcome: SimOutcome },
) => { markdown: string; added_lines: string[] };

/* ─────────────────────── quién emite qué ───────────────────────
 * El war room ya está construido y espera ESTE vocabulario. La corrida en vivo
 * tiene que emitir lo mismo que emite demo/generate.ts — la grabación es la
 * especificación, no una maqueta.
 *
 *   etapa        bus.phase()    tally al cerrar          artefactos
 *   ─────────────────────────────────────────────────────────────────────
 *   ingest       "ingesta"      —                        (evento coverage)
 *   panorama     "panorama"     n "formatos"             brand_research
 *   miner        "oido"         n "insights"             insight
 *   angles       "angulos"      n "ángulos con cita"     angle
 *   strategist   "estrategia"   n "canales"              strategy
 *   army         "ejercito"     n "ads listos", etc.     ad_draft, content_calendar,
 *                                                        influencer_prospect,
 *                                                        email_flow, blog_draft
 *   evolution    "evolution"    n "hijos"                (sim + verdict, los emite
 *                               ← lo emite el motor       runSimulation solo)
 *   memory       "memoria"      n "aprendizajes"         (evento memory)
 *
 * Reglas que el war room impone y no son negociables:
 *  · El tally va por bus.tally(): la nota TIENE que empezar con dígito o app.js
 *    la descarta. Nunca "listo", nunca "corriendo".
 *  · Narración por bus.say(), prueba literal por bus.show(). Un `log` pelado
 *    sale sin formato.
 *  · replay.ts cronometra SOLO desde los `log`. Emitir artifact/cost en ráfaga
 *    sin un say/show entre medio los apila en un frame al grabar.
 *  · Ningún artefacto sale de "draft". El GO es humano.
 */

/** Se lanza desde los stubs. Que el error diga qué worktree falta, no "undefined". */
export class NotImplemented extends Error {
  constructor(what: string, worktree: string) {
    super(`${what} todavía no está implementado — va en el worktree "${worktree}"`);
    this.name = "NotImplemented";
  }
}
