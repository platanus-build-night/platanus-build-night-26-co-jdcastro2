/**
 * Sirve web/ como lo haría Vercel: archivos estáticos y NADA más.
 *
 * Sirve para verificar el build antes de desplegar. Es importante que NO tenga
 * /api/health: así app.js elige la ruta de replay en el navegador, que es
 * exactamente lo que va a pasar en producción.
 *
 *   npm run build:web && npm run preview:web
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const DIR = join(process.cwd(), "web");
const PORT = Number(process.env.PORT ?? 4000);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ndjson": "application/x-ndjson; charset=utf-8",
};

createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const rel = normalize(path === "/" ? "index.html" : path).replace(/^(\.\.[/\\])+/, "");
  try {
    const body = await readFile(join(DIR, rel));
    res.writeHead(200, { "content-type": MIME[extname(rel)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404");
  }
}).listen(PORT, () => {
  console.log(`\n  build estático  →  http://localhost:${PORT}\n`);
});
