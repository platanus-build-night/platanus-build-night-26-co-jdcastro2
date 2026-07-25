/**
 * ¿Qué se le escapa a redact() antes de que un modelo de TERCEROS vea el texto?
 *
 * Esto no es un test de unidad: es la última barrera entre las clientas reales
 * de una marca y un proveedor externo. Se corre sobre el archivo de verdad.
 *
 *   npx tsx scripts/check-redact.ts <archivo.csv>
 */
import { readFileSync } from "node:fs";
import { redact } from "../src/pipeline/ingest";

const raw = readFileSync(process.argv[2] ?? "", "utf8");

const PATTERNS: [string, RegExp][] = [
  ["email", /[\w.+-]+@[\w-]+\.[\w.]{2,}/g],
  ["teléfono CO", /\b(?:\+?57[\s-]?)?3\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g],
  ["cédula", /\b\d{7,11}\b/g],
  ["url con token", /https?:\/\/\S*(?:token|key|auth)=\S+/gi],
];

let hits = 0;
console.log(`\n  archivo: ${(raw.length / 1e6).toFixed(1)} MB\n`);
for (const [name, re] of PATTERNS) {
  const antes = (raw.match(re) ?? []).length;
  const despues = (redact(raw).text.match(re) ?? []).length;
  const pasa = despues === 0;
  if (!pasa) hits++;
  console.log(
    `  ${pasa ? "ok " : "FUGA"} ${name.padEnd(14)} ${String(antes).padStart(5)} antes → ${String(despues).padStart(5)} después`,
  );
}

const r = redact(raw);
console.log(`\n  redacciones aplicadas: ${r.count}`);
console.log(hits === 0 ? "\n  REDACCIÓN OK\n" : `\n  ${hits} PATRONES SE ESCAPAN\n`);
process.exit(hits === 0 ? 0 : 1);
