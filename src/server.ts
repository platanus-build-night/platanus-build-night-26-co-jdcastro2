/**
 * El war room. Hono + SSE nativo + estáticos servidos a mano (3 archivos, cero
 * dependencias de más — el wifi del venue no es de fiar).
 *
 *   npm run server            # servidor vivo
 *   npm run demo              # reproduce la corrida oficial grabada
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bus } from "./bus";
import { cost } from "./llm";
import type { ArtifactEnvelope, DarwinEvent } from "./schemas";

try {
  process.loadEnvFile(".env");
} catch {
  // sin .env el server igual levanta; solo las llamadas a la API fallarán
}

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC = join(process.cwd(), "public");

/** Artefactos vivos de la corrida actual: el botón GO muta aquí. */
export const artifacts = new Map<string, ArtifactEnvelope>();

/** Últimos eventos, para que un browser que llega tarde vea la corrida. */
const backlog: DarwinEvent[] = [];
const BACKLOG_MAX = 5000;
bus.subscribe((e) => {
  backlog.push(e);
  if (backlog.length > BACKLOG_MAX) backlog.shift();
  if (e.type === "artifact") artifacts.set(e.envelope.id, e.envelope);
});

const app = new Hono();

/* ─────────────────────────────── estáticos ─────────────────────────────── */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function serveFile(name: string) {
  const path = join(PUBLIC, name);
  if (!existsSync(path)) return null;
  const ext = name.slice(name.lastIndexOf("."));
  return { body: readFileSync(path), type: MIME[ext] ?? "application/octet-stream" };
}

app.get("/", (c) => {
  const f = serveFile("index.html");
  if (!f) return c.text("falta public/index.html", 500);
  return c.body(f.body, 200, { "content-type": f.type });
});

app.get("/:file{.+\\.(js|css|html|json)}", (c) => {
  const f = serveFile(c.req.param("file"));
  if (!f) return c.notFound();
  return c.body(f.body, 200, { "content-type": f.type });
});

/* ─────────────────────────────────── SSE ─────────────────────────────────── */

app.get("/events", (c) =>
  streamSSE(c, async (stream) => {
    let alive = true;
    stream.onAbort(() => {
      alive = false;
    });

    const send = (e: DarwinEvent) =>
      stream.writeSSE({ event: e.type, data: JSON.stringify(e) }).catch(() => {
        alive = false;
      });

    // Un browser que abre a mitad de corrida ve todo lo anterior.
    for (const e of backlog) await send(e);

    const unsubscribe = bus.subscribe((e) => void send(e));

    // Heartbeat: sin esto los proxies matan la conexión.
    while (alive) {
      await stream.writeSSE({ event: "ping", data: String(Date.now()) }).catch(() => {
        alive = false;
      });
      await new Promise((r) => setTimeout(r, 15000));
    }
    unsubscribe();
  }),
);

/* ─────────────────────────────────── API ─────────────────────────────────── */

/** El humano aprueba. Nada sale de draft sin pasar por aquí. */
app.post("/api/go", async (c) => {
  const { artifact_id } = await c.req.json<{ artifact_id: string }>();
  const env = artifacts.get(artifact_id);
  if (!env) return c.json({ error: "no existe ese artefacto" }, 404);
  env.status = "approved";
  bus.emit({ type: "go", artifact_id, status: "approved" });
  return c.json({ ok: true, artifact_id });
});

app.get("/api/artifacts", (c) => c.json([...artifacts.values()]));

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    cost_usd: Number(cost.total.toFixed(4)),
    artifacts: artifacts.size,
    events: backlog.length,
  }),
);

/** Prueba de vida del bus: dispara eventos falsos para desarrollar la UI. */
app.post("/api/echo", async (c) => {
  bus.phase("echo", "prueba del bus");
  bus.agent("panorama", "thinking");
  bus.log("panorama", "si ves esto en pantalla, el bus funciona");
  await new Promise((r) => setTimeout(r, 400));
  bus.agent("panorama", "done", "0.4s");
  bus.emit({ type: "cost", total_usd: 0.0123, by_role: { panorama: 0.0123 } });
  return c.json({ ok: true });
});

/* ────────────────────────────────── arranque ────────────────────────────────── */

const replayArg = process.argv.indexOf("--replay");
const replayPath = replayArg > -1 ? process.argv[replayArg + 1] : null;

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`\n  DARWIN war room  →  http://localhost:${info.port}\n`);
  if (replayPath) {
    if (!existsSync(replayPath)) {
      console.error(`  no existe ${replayPath} — ¿ya grabaste la corrida oficial?\n`);
      return;
    }
    console.log(`  replay: ${replayPath}\n`);
    void import("./replay").then((m) => m.replay(replayPath, Number(process.env.SPEED ?? 8)));
  }
});
