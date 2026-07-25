/**
 * El DAG. Entrypoint de `npm run pipeline`.
 *
 * Este archivo decide el orden y quién le pasa qué a quién. Vive en `main` y
 * NO se toca desde los worktrees: cada worktree implementa su módulo contra la
 * firma de contract.ts y run.ts los compone sin enterarse.
 *
 *   npm run pipeline -- --conversations data/export.txt --brand Dosmicos --serve
 *
 * Con --serve levanta el war room en el MISMO proceso, que es la única forma de
 * que el bus (un singleton de módulo) llegue al SSE. Sin él la corrida solo
 * queda grabada en runs/<id>/events.ndjson, lista para `npm run demo`.
 */
import "../env"; // PRIMERO: los imports se evalúan antes que las sentencias
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../config/darwin.config";
import { runArmy, toSimAdsWithFit } from "../army";
import { bus } from "../bus";
import type { RunContext } from "../contract";
import { runSimulation } from "../evolution/engine";
import { cost } from "../llm";
import { commitMemory, digestMemory, loadMemory } from "../memory/store";
import type { ArtifactKind, ContentFormat, CoverageEntry, Role } from "../schemas";
import { angles as buildAngles } from "./angles";
import { htmlToText, ingest } from "./ingest";
import { miner } from "./miner";
import { panorama } from "./panorama";
import { strategist } from "./strategist";

/* ─────────────────────────── entrada ───────────────────────────
 * El pipeline es una FUNCIÓN, no solo un CLI: el worker lo invoca directo con
 * la corrida que sacó de Supabase. El CLI de abajo es un envoltorio.
 */

export interface RunOptions {
  brandName: string;
  brandUrl?: string;
  runId?: string;
  conversations?: string;
  posts?: string;
  reviews?: string;
  site?: string;
  /** Graba runs/<id>/events.ndjson. El worker lo apaga: su verdad es Supabase. */
  record?: boolean;
}

/* ─────────────────────────── utilidades ─────────────────────────── */

let artN = 0;
/** Todo artefacto nace en draft. Nada sale de ahí sin GO humano. */
function art(kind: ArtifactKind, by: Role, payload: unknown, source_quote?: string, id?: string) {
  bus.emit({
    type: "artifact",
    envelope: {
      id: id ?? `${kind}_${String(++artN).padStart(2, "0")}`,
      kind,
      status: "draft",
      payload,
      source_quote,
      created_by: by,
      cost_usd: 0,
      created_at: new Date().toISOString(),
    },
  });
}

/**
 * Descarga la web de la marca. Es la ÚNICA salida a red del pipeline y falla
 * sola: sin sitio, el Panorama deduce la marca de las conversaciones y la
 * corrida sigue (invariante #3).
 */
async function fetchSite(url: string): Promise<string> {
  if (!url) return "";
  const full = /^https?:\/\//.test(url) ? url : `https://${url}`;
  try {
    const res = await fetch(full, {
      signal: AbortSignal.timeout(config.panorama_timeout_ms),
      headers: { "user-agent": "DARWIN/0.1 (+https://github.com/platanus-build-night)" },
      redirect: "follow",
    });
    if (!res.ok) {
      bus.say("ingesta", `la web respondió ${res.status} — sigo sin ella`);
      return "";
    }
    return htmlToText(await res.text(), 16000);
  } catch (err) {
    bus.say("ingesta", `no pude leer ${full}: ${String((err as Error).message)} — sigo sin ella`);
    return "";
  }
}

/**
 * FASE 1 — solo con la URL.
 *
 * Es todo lo que se puede saber de una marca sin oír a sus clientes: qué vende
 * y qué formato le rinde. Deliberadamente NO produce ángulos ni anuncios,
 * porque sin evidencia eso sería inventarlo — que es exactamente lo que DARWIN
 * existe para no hacer.
 *
 * Cuesta ~$0.02 y existe para que la puerta de entrada no pida un archivo antes
 * del primer clic.
 */
export async function runPanorama(opts: RunOptions) {
  const brandName = opts.brandName;
  const brandUrl = opts.brandUrl ?? "";
  const runId = opts.runId ?? `run-${Date.now()}`;
  if (opts.record !== false) bus.record(`runs/${runId}/events.ndjson`);

  bus.phase("ingesta", "leyendo la web de la marca");
  bus.say("ingesta", `descargando ${brandUrl || "(sin url)"}`);
  const site_text = await fetchSite(brandUrl);
  if (site_text) bus.show("ingesta", "web", `${site_text.length} caracteres leídos`);
  else bus.say("ingesta", "no pude leer la web — necesito al menos eso para empezar");

  const data = {
    conversations: [],
    posts: [],
    reviews: [],
    site_text,
    stats: {
      conversations_total: 0,
      conversations_with_customer_msg: 0,
      messages_total: 0,
      posts_total: 0,
      reviews_total: 0,
      pii_redactions: 0,
    },
  };
  const ctx: RunContext = { runId, brand: { name: brandName, url: brandUrl }, data };

  bus.phase("panorama", "qué vende la marca y qué formato le rinde");
  bus.agent("panorama", "thinking");
  const research = await panorama(ctx);
  art("brand_research", "panorama", research);
  bus.tally("panorama", research.formats_ranked.length, "formatos");
  bus.emit({ type: "coverage", entries: research.coverage });

  /* El momento que define el producto: DARWIN dice explícitamente hasta dónde
   * llega sin evidencia, en vez de rellenar el hueco inventando. */
  bus.say("darwin", "hasta aquí llego con tu web: sé qué vendes y qué formato te rinde");
  bus.say(
    "darwin",
    "lo que NO sé es qué te dicen tus clientas. Dame ese export y dejo de adivinar",
  );

  return { runId, research, cost: cost.total };
}

/** FASE 2 — con las conversaciones. Aquí DARWIN deja de adivinar. */
export async function runPipeline(opts: RunOptions) {
  const brandName = opts.brandName;
  const brandUrl = opts.brandUrl ?? "";
  const runId =
    opts.runId ?? `run-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}`;

  if (opts.record !== false) bus.record(`runs/${runId}/events.ndjson`);

  /* ── 1. ingesta ── */
  bus.phase("ingesta", "leyendo lo que ya existe · sin red");
  const base = ingest({
    conversations: opts.conversations,
    posts: opts.posts,
    reviews: opts.reviews,
    site: opts.site,
    brandName,
  });

  // El sitio puede venir de un archivo (--site) o de la URL (--url).
  let site_text = base.site_text;
  if (!site_text && brandUrl) {
    bus.say("ingesta", `descargando ${brandUrl}`);
    site_text = await fetchSite(brandUrl);
    if (site_text) bus.show("ingesta", "web", `${site_text.length} caracteres leídos`);
  }
  const data = { ...base, site_text };

  bus.say("ingesta", `${data.stats.conversations_total} conversaciones abiertas`);
  bus.show(
    "ingesta",
    "archivo",
    `${data.stats.messages_total} mensajes · ${data.stats.pii_redactions} datos personales redactados`,
  );

  const ctx: RunContext = { runId, brand: { name: brandName, url: brandUrl }, data };

  /* Cobertura preliminar: lo que depende de archivos ya se sabe aquí.
   * Panorama completa el resto (web, benchmarks, ig_scrape) en su BrandResearch. */
  const fileCoverage: CoverageEntry[] = [
    {
      source: "conversations",
      status: data.conversations.length ? "ok" : "skipped",
      note: `${data.stats.conversations_total} conversaciones`,
    },
    {
      source: "posts_csv",
      status: data.posts.length ? "ok" : "skipped",
      note: `${data.stats.posts_total} posts`,
    },
    {
      source: "reviews_csv",
      status: data.reviews.length ? "ok" : "skipped",
      note: data.reviews.length ? `${data.stats.reviews_total} reseñas` : "no se entregó el archivo",
    },
  ];
  bus.emit({ type: "coverage", entries: fileCoverage });

  /* ── 2. panorama y oído: independientes, van juntos ── */
  bus.phase("panorama", "qué vende la marca y qué formato le rinde");
  bus.agent("panorama", "thinking");
  bus.agent("miner_map", "thinking");

  const [research, insights] = await Promise.all([panorama(ctx), miner(ctx)]);

  art("brand_research", "panorama", research);
  bus.tally("panorama", research.formats_ranked.length, "formatos");
  // Cobertura completa: la de archivos + la que reportó Panorama.
  bus.emit({ type: "coverage", entries: [...fileCoverage, ...research.coverage] });

  bus.phase("oido", "insights con cita textual");
  for (const i of insights) art("insight", "miner_reduce", i, i.evidence[0]?.quote_redacted);
  bus.tally("miner_reduce", insights.length, "insights");

  /* ── 3. ángulos: la inversión frase → promesa ── */
  bus.phase("angulos", "invertir la frase del cliente en promesa");
  bus.agent("angles", "thinking");
  const angleBank = await buildAngles(ctx, { insights, research });
  // La narración la hace angles.ts, que es quien conoce el trabajo. Aquí solo
  // se emiten los artefactos: narrar también duplicaba cada inversión en pantalla.
  for (const a of angleBank) art("angle", "angles", a, a.source_quote, `art_angle_${a.id}`);
  bus.tally("angles", angleBank.length, "ángulos con cita");

  /* ── 4. estrategia, con la memoria de corridas anteriores ── */
  bus.phase("estrategia", "cruzar ángulos × formatos × canales");
  bus.agent("strategist", "thinking");
  const past = loadMemory(brandName);
  const memory = past.length ? await digestMemory(past) : null;
  if (memory) bus.say("strategist", `aplicando ${memory.learnings.length} aprendizajes previos`);
  else bus.say("strategist", "primera corrida de esta marca: la memoria está vacía");

  const strategy = await strategist(ctx, { research, angles: angleBank, memory });
  art("strategy", "strategist", strategy);
  bus.tally("strategist", strategy.channel_mix.length, "canales");

  /* ── 5. el ejército ── */
  bus.phase("ejercito", "5 agentes ejecutan la estrategia");
  const out = await runArmy(ctx, { research, angles: angleBank, strategy });
  for (const a of out.ads) art("ad_draft", "paid", a, a.source_quote, a.id);
  bus.tally("paid", out.ads.length, "ads listos");
  if (out.calendar.length) {
    art("content_calendar", "organic", { items: out.calendar });
    bus.tally("organic", out.calendar.length, "piezas");
  }
  for (const c of out.creators) art("influencer_prospect", "creators", c);
  if (out.creators.length) bus.tally("creators", out.creators.length, "prospectos");
  for (const f of out.emails) art("email_flow", "email", f);
  if (out.emails.length) bus.tally("email", out.emails.length, "flujos");
  for (const b of out.blogs) art("blog_draft", "blog", b);
  if (out.blogs.length) bus.tally("blog", out.blogs.length, "borradores");

  /* ── 6. selección natural ──
   * runSimulation emite su propio phase/sim/verdict. paceMs le da ritmo en
   * pantalla; el motor es determinista, la pausa es solo presentación. */
  /* format_fit sale del ranking real del Panorama, no de un número inventado:
   * es el segundo factor que decide quién sobrevive en el motor. */
  const formatScores = new Map<ContentFormat, number>(
    research.formats_ranked.map((f) => [f.format, f.confidence]),
  );
  const outcome = await runSimulation(toSimAdsWithFit(out.ads, angleBank, formatScores), {
    paceMs: 900,
  });
  bus.tally("mutator", outcome.children.length, "hijos");

  /* ── 7. la memoria ── */
  bus.phase("memoria", "lo aprendido queda escrito para la próxima corrida");
  bus.agent("memory", "thinking");
  const diff = commitMemory(brandName, { angles: angleBank, ads: out.ads, outcome });
  bus.emit({ type: "memory", markdown: diff.markdown, added_lines: diff.added_lines });
  bus.tally("memory", diff.added_lines.length, "aprendizajes");

  bus.say("darwin", `corrida completa · $${cost.total.toFixed(2)} · nada se publicó sin GO humano`);
  bus.emit({ type: "done", run_id: runId });

  return { runId, cost: cost.total, ads: out.ads.length, outcome };
}

/* ─────────────────────────── el CLI ───────────────────────────
 * `npm run pipeline -- --brand X --url Y --conversations Z [--serve]`
 * Solo corre cuando este archivo es el entrypoint; el worker importa
 * runPipeline() directamente.
 */

async function cli() {
  const argv = process.argv.slice(2);
  const arg = (n: string) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  if (argv.includes("--serve")) {
    // Importar server.ts lo arranca. Va ANTES de emitir nada para que el
    // backlog del SSE tenga la corrida completa.
    await import("../server");
  }

  const res = await runPipeline({
    brandName: arg("brand") ?? "la marca",
    brandUrl: arg("url"),
    runId: arg("run"),
    conversations: arg("conversations"),
    posts: arg("posts"),
    reviews: arg("reviews"),
    site: arg("site"),
  });

  if (!argv.includes("--serve")) {
    console.log(`\n  grabado en runs/${res.runId}/events.ndjson`);
    console.log(`  míralo con:  npx tsx src/server.ts --replay runs/${res.runId}/events.ndjson\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  cli().catch((err) => {
    // Un stub sin implementar llega acá con el nombre del worktree que falta.
    bus.agent("darwin", "error", String(err?.message ?? err));
    console.error(`\n  ✕ ${err?.message ?? err}\n`);
    process.exit(1);
  });
}

