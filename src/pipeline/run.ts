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
import { runArmy, toSimAds } from "../army";
import { bus } from "../bus";
import type { RunContext } from "../contract";
import { runSimulation } from "../evolution/engine";
import { cost } from "../llm";
import { commitMemory, digestMemory, loadMemory } from "../memory/store";
import type { ArtifactKind, CoverageEntry, Role } from "../schemas";
import { angles as buildAngles } from "./angles";
import { ingest } from "./ingest";
import { miner } from "./miner";
import { panorama } from "./panorama";
import { strategist } from "./strategist";

/* ─────────────────────────── argumentos ─────────────────────────── */

const argv = process.argv.slice(2);
const arg = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (name: string) => argv.includes(`--${name}`);

const brandName = arg("brand") ?? "la marca";
const brandUrl = arg("url") ?? "";
const runId = arg("run") ?? `run-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}`;

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

async function main() {
  if (flag("serve")) {
    // Importar server.ts lo arranca. Debe ir ANTES de emitir nada para que el
    // backlog del SSE tenga la corrida completa.
    await import("../server");
  }

  bus.record(`runs/${runId}/events.ndjson`);

  /* ── 1. ingesta ── */
  bus.phase("ingesta", "leyendo lo que ya existe · sin red");
  const data = ingest({
    conversations: arg("conversations"),
    posts: arg("posts"),
    reviews: arg("reviews"),
    site: arg("site"),
    brandName,
  });
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
  for (const a of angleBank) {
    bus.show("angles", "invirtiendo", `"${a.source_quote}" → "${a.hook_text}"`);
    art("angle", "angles", a, a.source_quote, `art_angle_${a.id}`);
  }
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
  const outcome = await runSimulation(toSimAds(out.ads, angleBank), { paceMs: 900 });
  bus.tally("mutator", outcome.children.length, "hijos");

  /* ── 7. la memoria ── */
  bus.phase("memoria", "lo aprendido queda escrito para la próxima corrida");
  bus.agent("memory", "thinking");
  const diff = commitMemory(brandName, { angles: angleBank, ads: out.ads, outcome });
  bus.emit({ type: "memory", markdown: diff.markdown, added_lines: diff.added_lines });
  bus.tally("memory", diff.added_lines.length, "aprendizajes");

  bus.say("darwin", `corrida completa · $${cost.total.toFixed(2)} · nada se publicó sin GO humano`);
  bus.emit({ type: "done", run_id: runId });

  if (!flag("serve")) {
    console.log(`\n  grabado en runs/${runId}/events.ndjson`);
    console.log(`  míralo con:  npx tsx src/server.ts --replay runs/${runId}/events.ndjson\n`);
  }
}

main().catch((err) => {
  // Un stub sin implementar llega acá con el nombre del worktree que falta.
  bus.agent("darwin", "error", String(err?.message ?? err));
  console.error(`\n  ✕ ${err?.message ?? err}\n`);
  process.exit(1);
});
