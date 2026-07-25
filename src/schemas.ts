/**
 * DARWIN — el contrato del sistema.
 *
 * Todo lo que un agente produce pasa por aquí. Los enums están blindados de
 * nacimiento: un enum abierto se corrompe en producción (lección aprendida a
 * la mala). Si el modelo inventa un valor, Zod lo rechaza y llm.ts reintenta
 * inyectando el error de parse.
 *
 * Las descripciones (.describe) NO son documentación decorativa: viajan al
 * modelo dentro del JSON Schema de la tool. Son el prompt de cada campo.
 */
import { z } from "zod";

/* ─────────────────────────── enums blindados ─────────────────────────── */

export const InsightType = z.enum([
  "product_request",
  "catalog_gap",
  "answer_improvement",
  "quality_feedback",
  "customer_objection",
  "operations_friction",
  "positive_signal",
  "general",
]);
export type InsightType = z.infer<typeof InsightType>;

export const Sentiment = z.enum(["positive", "neutral", "negative", "mixed"]);

export const AngleFamily = z.enum([
  "problem_solution",
  "product_benefit",
  "use_case",
  "gift",
  "social_proof",
  "technical_education",
  "lifestyle",
  "offer",
]);
export type AngleFamily = z.infer<typeof AngleFamily>;

export const HookPattern = z.enum([
  "antes_despues",
  "pregunta_problema",
  "pov_comprador",
  "demo_rapida",
  "error_comun",
  "comparacion",
  "recomendacion_amiga",
]);
export type HookPattern = z.infer<typeof HookPattern>;

export const ProofType = z.enum([
  "testimonio",
  "demo_producto",
  "dato_duro",
  "comparacion_visual",
  "autoridad",
]);

export const Lifecycle = z.enum([
  "descubierto",
  "testing",
  "winner",
  "fatigado",
  "muerto",
]);

export const ContentFormat = z.enum([
  "reel",
  "carousel",
  "static",
  "story",
  "ugc_video",
]);
export type ContentFormat = z.infer<typeof ContentFormat>;

export const AdFormat = z.enum(["static", "ugc"]);

export const Channel = z.enum(["paid", "organic", "creators", "email", "blog"]);
export type Channel = z.infer<typeof Channel>;

export const Platform = z.enum([
  "instagram",
  "tiktok",
  "facebook",
  "email",
  "blog",
  "whatsapp",
]);
export type Platform = z.infer<typeof Platform>;

export const CTA = z.enum([
  "comprar_ahora",
  "ver_mas",
  "mas_informacion",
  "enviar_mensaje",
  "comprar_ya",
  "ver_coleccion",
]);

export const EvidenceSource = z.enum([
  "own_metrics",
  "category_benchmark",
  "visible_content",
]);

export const CoverageStatus = z.enum(["ok", "skipped", "failed"]);

export const Verdict = z.enum([
  "continue",
  "kill",
  "graduate",
  "fatigue_rotate",
]);
export type Verdict = z.infer<typeof Verdict>;

export const ArtifactKind = z.enum([
  "brand_research",
  "insight",
  "angle",
  "strategy",
  "ad_draft",
  "content_calendar",
  "influencer_prospect",
  "email_flow",
  "blog_draft",
  "memory",
]);
export type ArtifactKind = z.infer<typeof ArtifactKind>;

export const Role = z.enum([
  "panorama",
  "miner_map",
  "miner_reduce",
  "angles",
  "strategist",
  "paid",
  "organic",
  "creators",
  "email",
  "blog",
  "mutator",
  "memory",
  "generator",
]);
export type Role = z.infer<typeof Role>;

/* ────────────────────────── ingest (0 LLM) ────────────────────────── */

export const Conversation = z.object({
  conv_id: z.string(),
  messages: z.array(
    z.object({
      ts: z.string(),
      from: z.enum(["customer", "brand", "system"]),
      text: z.string(),
    }),
  ),
});
export type Conversation = z.infer<typeof Conversation>;

export const PostMetric = z.object({
  post_id: z.string(),
  platform: Platform,
  format: ContentFormat,
  posted_at: z.string(),
  caption: z.string().default(""),
  reach: z.number().default(0),
  likes: z.number().default(0),
  comments: z.number().default(0),
  saves: z.number().default(0),
  shares: z.number().default(0),
});
export type PostMetric = z.infer<typeof PostMetric>;

export const Review = z.object({
  review_id: z.string(),
  rating: z.number().min(1).max(5),
  text: z.string(),
  date: z.string().optional(),
});
export type Review = z.infer<typeof Review>;

export const IngestResult = z.object({
  conversations: z.array(Conversation),
  posts: z.array(PostMetric),
  reviews: z.array(Review),
  site_text: z.string().default(""),
  stats: z.object({
    conversations_total: z.number(),
    conversations_with_customer_msg: z.number(),
    messages_total: z.number(),
    posts_total: z.number(),
    reviews_total: z.number(),
    pii_redactions: z.number(),
  }),
});
export type IngestResult = z.infer<typeof IngestResult>;

/* ─────────────────────── panorama (BrandResearch) ─────────────────────── */

export const BrandBrief = z.object({
  name: z.string().describe("Nombre de la marca"),
  url: z.string().describe("URL del sitio, o cadena vacía si no se conoce"),
  vertical: z
    .string()
    .describe("Vertical de e-commerce: moda, hogar, belleza, food, otro"),
  products: z
    .array(z.string())
    .describe("Productos o líneas principales, máximo 6"),
  tone: z.string().describe("Tono de voz observado en el sitio, una frase"),
  audience: z.string().describe("A quién le vende, una frase concreta"),
});
export type BrandBrief = z.infer<typeof BrandBrief>;

export const FormatInsight = z.object({
  platform: Platform,
  format: ContentFormat,
  evidence: EvidenceSource.describe(
    "De dónde sale el veredicto: métricas propias, benchmark de categoría o contenido visible",
  ),
  signal: z
    .string()
    .describe(
      "El dato duro en una frase, con números si existen. Ej: 'reels 3.1x el reach de carruseles (n=12)'",
    ),
  recommendation: z
    .string()
    .describe("Qué hacer al respecto, en imperativo y en una frase"),
  confidence: z.number().min(0).max(1),
});
export type FormatInsight = z.infer<typeof FormatInsight>;

export const OwnContentStats = z.object({
  posts_analyzed: z.number(),
  by_format: z.array(
    z.object({
      format: ContentFormat,
      n: z.number(),
      avg_reach: z.number(),
      avg_engagement_rate: z.number(),
      index_vs_mean: z
        .number()
        .describe("1.0 = promedio de la marca; 3.1 = rinde 3.1x el promedio"),
    }),
  ),
  winner_format: ContentFormat.optional(),
  missing_formats: z
    .array(ContentFormat)
    .describe("Formatos que la marca NO está usando"),
});
export type OwnContentStats = z.infer<typeof OwnContentStats>;

export const CoverageEntry = z.object({
  source: z.enum([
    "web",
    "conversations",
    "posts_csv",
    "reviews_csv",
    "category_benchmarks",
    "ig_scrape",
  ]),
  status: CoverageStatus,
  note: z.string(),
});
export type CoverageEntry = z.infer<typeof CoverageEntry>;

export const BrandResearch = z.object({
  brand_brief: BrandBrief,
  formats_ranked: z.array(FormatInsight),
  own_content_stats: OwnContentStats.optional(),
  category_benchmarks: z.array(
    z.object({
      format: ContentFormat,
      claim: z.string(),
      source: z.string(),
    }),
  ),
  reviews_summary: z
    .object({
      top_quotes: z.array(z.string()),
      avg_sentiment: z.number().min(-1).max(1),
      n: z.number(),
    })
    .optional(),
  coverage: z.array(CoverageEntry),
});
export type BrandResearch = z.infer<typeof BrandResearch>;

/* ───────────────────────────── miner ───────────────────────────── */

export const Evidence = z.object({
  quote_redacted: z
    .string()
    .describe(
      "Cita TEXTUAL del cliente, sin nombres ni teléfonos. Es la materia prima del ad: no la parafrasees.",
    ),
  conv_id: z.string().describe("Id de la conversación de donde sale la cita"),
});

export const Insight = z.object({
  id: z.string().describe("slug corto y estable, ej: 'envio_regalo_sabado'"),
  type: InsightType,
  sentiment: Sentiment,
  priority: z.number().min(1).max(5).describe("5 = mueve dinero ya"),
  summary: z.string().describe("Qué pasa, en una frase de cliente, no de marca"),
  evidence: z
    .array(Evidence)
    .min(1)
    .describe("Al menos una cita textual. Sin cita no hay insight."),
  occurrence_count: z
    .number()
    .min(1)
    .describe("Cuántas conversaciones distintas muestran esto"),
  sub_tags: z.array(z.string()).default([]),
  is_testimonial: z
    .boolean()
    .describe(
      "true si es un testimonio. Los testimonios JAMÁS se agrupan: cada voz es una fila.",
    ),
});
export type Insight = z.infer<typeof Insight>;

export const InsightBatch = z.object({
  insights: z.array(Insight),
});

/* ───────────────────────────── angles ───────────────────────────── */

export const Angle = z.object({
  id: z.string().describe("slug corto, ej: 'regalo_llega_antes'"),
  insight_ids: z.array(z.string()).min(1),
  angle_family: AngleFamily,
  hook_pattern: HookPattern,
  proof_type: ProofType,
  hook_text: z
    .string()
    .describe(
      "LA MECÁNICA NÚCLEO: la frase del cliente invertida en promesa. " +
        "'se destapa toda la noche' → 'la cobijita que sí se queda puesta'. " +
        "Máximo 12 palabras, en el español del cliente, sin adjetivos de marca.",
    ),
  source_quote: z
    .string()
    .describe("La cita textual del cliente que originó este ángulo"),
  evidence_strength: z
    .number()
    .min(1)
    .max(5)
    .describe("1 = una persona lo dijo; 5 = lo dicen todo el tiempo"),
  confidence: z.number().min(0).max(1),
  lifecycle: Lifecycle.default("descubierto"),
});
export type Angle = z.infer<typeof Angle>;

export const AngleBank = z.object({
  angles: z.array(Angle),
});

/* ─────────────────────────── strategist ─────────────────────────── */

export const ChannelPlan = z.object({
  channel: Channel,
  effort_share: z
    .number()
    .min(0)
    .max(1)
    .describe("Fracción del esfuerzo total. La suma de todos ≈ 1.0"),
  role_in_mix: z.string().describe("Para qué sirve este canal aquí, una frase"),
  what_to_test: z.string().describe("La primera prueba concreta de este canal"),
});
export type ChannelPlan = z.infer<typeof ChannelPlan>;

export const KillRule = z.object({
  tier: z.number().min(1).max(3),
  condition: z.string(),
  action: z.string(),
  window: z.string(),
});

export const TestingPlan = z.object({
  budget_per_adset_usd: z.number().describe("1 ad = 1 ad set, ~5 USD/día"),
  n_ads: z.number().describe("Cuántos anuncios entran a la primera ronda"),
  lane_pct_max: z
    .number()
    .describe("Techo del spend total dedicado a testing, ej 0.15"),
  kill_rules: z.array(KillRule),
  graduation: z.object({
    roas_min: z.number(),
    purchases_min: z.number(),
    scale_pct_day: z.number(),
  }),
  success_metrics: z
    .array(z.string())
    .describe("Qué se mide para decidir. NO es un pronóstico de CAC."),
});
export type TestingPlan = z.infer<typeof TestingPlan>;

export const Strategy = z.object({
  channel_mix: z.array(ChannelPlan),
  testing_plan: TestingPlan,
  rationale: z
    .string()
    .describe(
      "Por qué este reparto y no otro, amarrado a los ángulos y formatos con evidencia. Máximo 5 frases.",
    ),
  memory_applied: z
    .array(z.string())
    .default([])
    .describe(
      "Qué aprendizajes de corridas anteriores se usaron. Vacío en la primera corrida.",
    ),
});
export type Strategy = z.infer<typeof Strategy>;

/* ─────────────────────────── el ejército ─────────────────────────── */

export const UGCBrief = z.object({
  hook: z.string(),
  pain_points: z.array(z.string()).describe("Dolores REALES sacados de citas"),
  outcome: z.string(),
  visual_proof: z.string().describe("Qué se tiene que ver en cámara"),
  riff: z
    .string()
    .describe("Qué queda libre para que la creadora hable en sus palabras"),
});

export const AdDraft = z.object({
  id: z.string(),
  angle_id: z.string(),
  format: AdFormat,
  headline: z.string().max(54).describe("Máximo 54 caracteres. Cuéntalos."),
  sub: z.string().max(90).describe("Máximo 90 caracteres. Cuéntalos."),
  cta: CTA,
  source_quote: z
    .string()
    .min(1)
    .describe(
      "OBLIGATORIO: la cita textual del cliente que inspiró este ad. Sin cita, el ad no existe.",
    ),
  ugc_brief: UGCBrief.optional(),
});
export type AdDraft = z.infer<typeof AdDraft>;

export const AdBatch = z.object({ ads: z.array(AdDraft) });

export const ContentCalendarItem = z.object({
  day_offset: z.number().min(0).max(13).describe("Día 0 a 13 (2 semanas)"),
  platform: Platform,
  format: ContentFormat,
  angle_id: z.string(),
  hook: z.string(),
  brief_short: z.string().describe("Qué se graba/arma, dos frases máximo"),
});
export type ContentCalendarItem = z.infer<typeof ContentCalendarItem>;

export const ContentCalendar = z.object({
  items: z.array(ContentCalendarItem),
});

export const InfluencerStatus = z.enum([
  "prospect",
  "contacted",
  "negotiating",
  "brief_sent",
  "content_received",
  "approved",
  "published",
]);

export const InfluencerProspect = z.object({
  handle: z.string(),
  why_her: z.string().describe("Por qué ESTA persona y no cualquier otra"),
  outreach_angle: z.string(),
  personalized_dm_draft: z
    .string()
    .describe("El DM listo para enviar, en primera persona, sin plantilla obvia"),
  suggested_brief: z.string(),
  status: InfluencerStatus.default("prospect"),
});
export type InfluencerProspect = z.infer<typeof InfluencerProspect>;

export const CreatorList = z.object({
  prospects: z.array(InfluencerProspect),
});

export const EmailFlow = z.object({
  flow_name: z.string(),
  angle_id: z.string(),
  emails: z.array(
    z.object({
      subject: z.string().max(60),
      preview: z.string().max(90),
      body: z.string(),
      send_offset_days: z.number(),
    }),
  ),
});
export type EmailFlow = z.infer<typeof EmailFlow>;

export const BlogDraft = z.object({
  title: z.string(),
  angle_id: z.string(),
  keywords: z.array(z.string()),
  outline: z.array(z.string()),
  body: z.string().describe("Markdown, 400-700 palabras"),
});
export type BlogDraft = z.infer<typeof BlogDraft>;

/* ─────────────────────────── evolución ─────────────────────────── */

export const SimResult = z.object({
  ad_id: z.string(),
  day: z.number(),
  spend: z.number(),
  impressions: z.number(),
  ctr: z.number(),
  atc: z.number(),
  purchases: z.number(),
  cpa: z.number(),
  roas: z.number(),
  frequency: z.number(),
  verdict: Verdict,
  rule_fired: z.string(),
});
export type SimResult = z.infer<typeof SimResult>;

/* ─────────────────────────── la memoria ─────────────────────────── */

export const MemoryEntry = z.object({
  angle_id: z.string(),
  angle_family: AngleFamily,
  format: ContentFormat,
  channel: Channel,
  stats: z.object({
    spend: z.number(),
    purchases: z.number(),
    roas: z.number(),
    runs: z.number().default(1),
  }),
  verdicts: z.array(Verdict).default([]),
  learnings: z.array(z.string()).default([]),
});
export type MemoryEntry = z.infer<typeof MemoryEntry>;

export const MemoryDigest = z.object({
  learnings: z
    .array(z.string())
    .describe(
      "Frases accionables para la PRÓXIMA corrida. Concretas: 'regalo + ugc_video rinde; carruseles mueren en esta marca'. Máximo 6.",
    ),
  prioritize: z.array(z.string()).describe("Combinaciones a priorizar"),
  deprioritize: z.array(z.string()).describe("Combinaciones a evitar"),
});
export type MemoryDigest = z.infer<typeof MemoryDigest>;

/* ─────────────────────────── el sobre ─────────────────────────── */

export const ArtifactEnvelope = z.object({
  id: z.string(),
  kind: ArtifactKind,
  status: z.enum(["draft", "approved"]).default("draft"),
  payload: z.unknown(),
  source_quote: z.string().optional(),
  created_by: Role,
  cost_usd: z.number().default(0),
  created_at: z.string(),
});
export type ArtifactEnvelope = z.infer<typeof ArtifactEnvelope>;

/* ─────────────────────────── eventos SSE ─────────────────────────── */

export type AgentState = "idle" | "thinking" | "done" | "error";

export type DarwinEvent =
  | { type: "phase"; name: string; detail?: string }
  | { type: "agent"; role: Role | string; state: AgentState; note?: string }
  /**
   * `kind` decide cómo se pinta la línea en el war room:
   *   say     → narración en primera persona, prefijo "> " en verde
   *   literal → la prueba textual (cita, url, conteo), indentada y en ámbar
   *   undefined → línea plana, como siempre
   * Es opcional a propósito: ningún call-site existente se rompe.
   */
  | {
      type: "log";
      ts: number;
      role: string;
      line: string;
      kind?: "say" | "literal";
    }
  | { type: "artifact"; envelope: ArtifactEnvelope }
  | { type: "coverage"; entries: CoverageEntry[] }
  | { type: "cost"; total_usd: number; by_role: Record<string, number> }
  | { type: "sim"; day: number; ads: SimResult[] }
  | { type: "verdict"; ad_id: string; verdict: Verdict; rule_fired: string }
  | { type: "go"; artifact_id: string; status: "approved" }
  | { type: "memory"; markdown: string; added_lines: string[] }
  | { type: "done"; run_id: string };
