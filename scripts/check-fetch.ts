/**
 * Verifica la única salida a red del pipeline: descargar la web de la marca y
 * convertirla en texto legible. Cero tokens.
 *
 *   npx tsx scripts/check-fetch.ts dosmicos.co
 */
import { htmlToText } from "../src/pipeline/ingest";

const url = process.argv[2] ?? "dosmicos.co";
const full = /^https?:\/\//.test(url) ? url : `https://${url}`;
const t0 = Date.now();

const res = await fetch(full, {
  signal: AbortSignal.timeout(15000),
  headers: { "user-agent": "DARWIN/0.1" },
  redirect: "follow",
});
console.log(`  HTTP ${res.status} · ${Date.now() - t0} ms · ${full}`);

const html = await res.text();
const text = htmlToText(html, 16000);
console.log(`  html ${html.length} → texto ${text.length} caracteres`);
console.log("  ───");
console.log("  " + text.slice(0, 600).replace(/\s+/g, " "));
