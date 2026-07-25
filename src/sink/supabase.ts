/**
 * Sumidero: bus → Supabase.
 *
 * Se engancha al mismo EventBus que alimenta el war room local. Todo lo que la
 * corrida emite se persiste, y el navegador lo lee por polling. `events` es
 * append-only y es la fuente de verdad: una corrida se reconstruye entera
 * desde ahí, igual que desde el NDJSON.
 *
 * Dos cosas que importan:
 *
 * 1. `seq` lo asigna este proceso, no la base. Dos eventos del mismo
 *    milisegundo tienen que reproducirse en el orden en que ocurrieron, y un
 *    timestamp no lo garantiza.
 *
 * 2. Los inserts van en LOTES. Una corrida emite ~160 eventos; uno por request
 *    serían 160 round trips que además desordenarían el terminal. Se acumulan
 *    y se descargan cada FLUSH_MS o cada FLUSH_N eventos.
 *
 * Persistir nunca puede tumbar la corrida: si Supabase falla, se registra y se
 * sigue. El NDJSON local es el respaldo.
 */
import { bus } from "../bus";
import type { ArtifactEnvelope, DarwinEvent } from "../schemas";
import { db, type SupabaseConfig } from "../supabase";

const FLUSH_MS = 400;
const FLUSH_N = 25;

interface Row {
  run_id: string;
  seq: number;
  type: string;
  payload: DarwinEvent;
}

export interface Sink {
  /** Vacía lo pendiente. Llamar antes de terminar el proceso. */
  flush: () => Promise<void>;
  stop: () => Promise<void>;
  failures: () => number;
}

export function attachSupabaseSink(cfg: SupabaseConfig, runId: string): Sink {
  let seq = 0;
  let pending: Row[] = [];
  let timer: NodeJS.Timeout | null = null;
  let inFlight: Promise<void> = Promise.resolve();
  let failures = 0;

  async function drain() {
    const batch = pending;
    pending = [];
    if (!batch.length) return;
    try {
      await db.insert(cfg, "events", batch);
    } catch (err) {
      failures++;
      // Sin bus.log aquí: emitir dentro del sumidero se realimenta solo.
      console.error(`  [sink] no pude escribir ${batch.length} eventos: ${String(err)}`);
    }
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      inFlight = inFlight.then(drain);
    }, FLUSH_MS);
  }

  const unsubscribe = bus.subscribe((e: DarwinEvent) => {
    pending.push({ run_id: runId, seq: seq++, type: e.type, payload: e });

    // Las proyecciones se escriben aparte para poder consultarlas sin releer
    // el stream. No bloquean: si fallan, el evento sigue en `events`.
    if (e.type === "artifact") void projectArtifact(cfg, runId, e.envelope);
    if (e.type === "go") void approveArtifact(cfg, runId, e.artifact_id);
    if (e.type === "cost") void patchRun(cfg, runId, { cost_usd: e.total_usd });

    if (pending.length >= FLUSH_N) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      inFlight = inFlight.then(drain);
    } else {
      schedule();
    }
  });

  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    inFlight = inFlight.then(drain);
    await inFlight;
  };

  return {
    flush,
    failures: () => failures,
    stop: async () => {
      unsubscribe();
      await flush();
    },
  };
}

/* ─────────────────────── proyecciones ─────────────────────── */

async function projectArtifact(cfg: SupabaseConfig, runId: string, env: ArtifactEnvelope) {
  try {
    await db.upsert(cfg, "artifacts", {
      run_id: runId,
      id: env.id,
      kind: env.kind,
      status: env.status,
      payload: env.payload ?? null,
      source_quote: env.source_quote ?? null,
      created_by: env.created_by,
      created_at: env.created_at,
    });
  } catch (err) {
    console.error(`  [sink] artefacto ${env.id}: ${String(err)}`);
  }
}

async function approveArtifact(cfg: SupabaseConfig, runId: string, artifactId: string) {
  try {
    await db.update(cfg, "artifacts", `run_id=eq.${runId}&id=eq.${artifactId}`, {
      status: "approved",
      approved_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`  [sink] GO ${artifactId}: ${String(err)}`);
  }
}

export async function patchRun(cfg: SupabaseConfig, runId: string, patch: Record<string, unknown>) {
  try {
    await db.update(cfg, "runs", `id=eq.${runId}`, patch);
  } catch (err) {
    console.error(`  [sink] runs ${runId}: ${String(err)}`);
  }
}
