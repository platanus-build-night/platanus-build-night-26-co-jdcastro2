/**
 * El worker — donde corre el trabajo pesado.
 *
 * La web pública ENCOLA corridas; este proceso las EJECUTA. Esa separación no
 * es un rodeo, es el diseño: una corrida son 6-10 minutos de llamadas a Claude
 * y ~$2. Ninguna función serverless dura eso (Vercel corta a 60s, las Edge
 * Functions de Supabase a ~150s), y una API key en un servidor con formulario
 * abierto es una cuenta vaciada por un for loop.
 *
 * Aquí la key nunca sale de tu máquina, no hay límite de tiempo, y cada corrida
 * pasa por tus ojos antes de gastar.
 *
 *   npm run worker            # pregunta antes de cada corrida
 *   npm run worker -- --auto  # las toma solas (úsalo solo si vigilas el gasto)
 *
 * Estados: queued → (tu aprobación) → running → done | error
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { config } from "../config/darwin.config";
import { bus } from "./bus";
import { cost } from "./llm";
import { runPanorama, runPipeline } from "./pipeline/run";
import { attachSupabaseSink, patchRun } from "./sink/supabase";
import { db, supabaseFromEnv, type SupabaseConfig } from "./supabase";

try {
  process.loadEnvFile(".env");
} catch {
  /* sin .env se usa el entorno */
}

const argv = process.argv.slice(2);
const AUTO = argv.includes("--auto");
const POLL_MS = 4000;
const WORKER_ID = `${process.env.USER ?? "worker"}@${process.pid}`;

interface RunRow {
  id: string;
  brand_name: string;
  brand_url: string | null;
  conversations: string | null;
  status: string;
  phase: number | null;
  created_at: string;
}

/** queued = fase 1 (solo url) · queued_full = fase 2 (con conversaciones) */
const phaseOf = (r: RunRow) => (r.status === "queued_full" ? 2 : 1);

const cfg = supabaseFromEnv();
if (!cfg) {
  console.error(`
  ✕ Falta la configuración de Supabase.

  Agrega a .env:
    SUPABASE_URL=https://ezozlvywdihxdwwbtyql.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=...

  La service_role está en el dashboard → Project Settings → API Keys.
  Es SECRETA: solo la usa este proceso, nunca el navegador.
`);
  process.exit(1);
}

const NEEDED_KEY =
  (process.env.DARWIN_PROVIDER ?? "anthropic").toLowerCase() === "openrouter"
    ? "OPENROUTER_API_KEY"
    : "ANTHROPIC_API_KEY";
if (!process.env[NEEDED_KEY]) {
  console.error(`\n  ✕ Falta ${NEEDED_KEY} en .env — el worker no puede ejecutar nada.\n`);
  process.exit(1);
}

const sb: SupabaseConfig = cfg;

/* ─────────────────────────── el ciclo ─────────────────────────── */

/** Fase 2 primero: una marca que ya entregó sus conversaciones está esperando
 *  lo que de verdad vino a buscar, y esa espera pesa más que una fase 1 nueva. */
async function nextQueued(): Promise<RunRow | null> {
  const full = await db.select<RunRow>(
    sb,
    "runs",
    "status=eq.queued_full&order=created_at.asc&limit=1",
  );
  if (full[0]) return full[0];
  const first = await db.select<RunRow>(
    sb,
    "runs",
    "status=eq.queued&claimed_by=is.null&order=created_at.asc&limit=1",
  );
  return first[0] ?? null;
}

async function confirm(run: RunRow): Promise<boolean> {
  const convs = (run.conversations ?? "").length;
  console.log(`
  ── ${phaseOf(run) === 1 ? "fase 1 · panorama (solo web)" : "fase 2 · corrida completa"} ──
    marca         ${run.brand_name}
    url           ${run.brand_url || "(ninguna)"}
    conversaciones ${convs ? `${(convs / 1024).toFixed(0)} KB` : "(ninguna)"}
    encolada      ${new Date(run.created_at).toLocaleString("es-CO")}

    costo estimado ${phaseOf(run) === 1 ? "~$0.02" : "~$0.50"} · hard stop $${process.env.DARWIN_HARD_STOP ?? 4}
  ───────────────────────────────────────────────────`);

  if (AUTO) {
    console.log("  --auto: la tomo sin preguntar\n");
    return true;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("  ¿La ejecuto? [s/N] ")).trim().toLowerCase();
  rl.close();
  return answer === "s" || answer === "si" || answer === "sí" || answer === "y";
}

/**
 * Reclama la corrida. El filtro `status=eq.queued` en el PATCH hace las veces
 * de compare-and-swap: si otro worker la tomó primero, no devuelve filas.
 */
async function claim(run: RunRow): Promise<boolean> {
  const rows = await db.update<RunRow>(sb, "runs", `id=eq.${run.id}&status=eq.${run.status}`, {
    status: "running",
    claimed_by: WORKER_ID,
    claimed_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
  });
  return rows.length > 0;
}

async function execute(run: RunRow) {
  const dir = mkdtempSync(join(tmpdir(), "darwin-"));
  const sink = attachSupabaseSink(sb, run.id);
  cost.reset();

  try {
    if (phaseOf(run) === 1) {
      /* Fase 1: solo la web. Termina pidiendo las conversaciones, no fallando
       * por no tenerlas. */
      const res = await runPanorama({
        brandName: run.brand_name,
        brandUrl: run.brand_url ?? undefined,
        runId: run.id,
        record: false,
      });
      await sink.flush();
      await patchRun(sb, run.id, {
        status: "awaiting_conversations",
        phase: 1,
        cost_usd: Number(res.cost.toFixed(4)),
        claimed_by: null,
      });
      console.log(
        `\n  ◐ ${run.brand_name} · panorama listo · $${res.cost.toFixed(3)} · esperando conversaciones\n`,
      );
      return;
    }

    let conversations: string | undefined;
    if (run.conversations) {
      conversations = join(dir, "conversations.txt");
      writeFileSync(conversations, run.conversations);
    }

    // record:false — la verdad de esta corrida vive en Supabase, no en disco.
    const res = await runPipeline({
      brandName: run.brand_name,
      brandUrl: run.brand_url ?? undefined,
      runId: run.id,
      conversations,
      record: false,
    });

    await sink.flush();
    await patchRun(sb, run.id, {
      status: "done",
      cost_usd: Number(res.cost.toFixed(4)),
      finished_at: new Date().toISOString(),
    });
    console.log(
      `\n  ✓ ${run.brand_name} · $${res.cost.toFixed(2)} · ${res.ads} ads · ${res.outcome.killed} muertos · ${res.outcome.graduated} graduado\n`,
    );
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    bus.agent("darwin", "error", message);
    await sink.flush();
    await patchRun(sb, run.id, {
      status: "error",
      error: message.slice(0, 2000),
      cost_usd: Number(cost.total.toFixed(4)),
      finished_at: new Date().toISOString(),
    });
    console.error(`\n  ✕ ${run.brand_name}: ${message}\n`);
  } finally {
    await sink.stop();
    if (sink.failures()) {
      console.error(`  ⚠ ${sink.failures()} lotes de eventos no llegaron a Supabase`);
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  console.log(`
  DARWIN worker · ${WORKER_ID}
  ${sb.url}
  ${AUTO ? "modo AUTO — toma corridas sin preguntar" : "modo manual — pregunta antes de gastar"}

  esperando corridas…`);

  for (;;) {
    try {
      const run = await nextQueued();
      if (run) {
        if (await confirm(run)) {
          if (await claim(run)) await execute(run);
          else console.log("  · otro worker la tomó primero");
        } else {
          await patchRun(sb, run.id, { status: "rejected", finished_at: new Date().toISOString() });
          console.log("  · rechazada\n");
        }
      }
    } catch (err) {
      console.error(`  ⚠ ciclo: ${String(err)}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
