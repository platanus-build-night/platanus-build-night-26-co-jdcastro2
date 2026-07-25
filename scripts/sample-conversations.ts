/**
 * Recorta un export de conversaciones a las N primeras conversaciones COMPLETAS.
 *
 * Para probar calidad antes de gastar en el archivo entero. Nunca parte una
 * conversación por la mitad: un hilo cortado produce insights falsos.
 *
 *   npx tsx scripts/sample-conversations.ts <entrada.csv> <salida.csv> [n=100]
 */
import { readFileSync, writeFileSync } from "node:fs";

const [input, output, nStr] = process.argv.slice(2);
if (!input || !output) {
  console.error("uso: sample-conversations <entrada.csv> <salida.csv> [n]");
  process.exit(1);
}
const N = Number(nStr ?? 100);
const raw = readFileSync(input, "utf8");

/* CSV con comillas y saltos de línea embebidos: hay que respetar el estado de
 * comilla o un mensaje multilínea rompe el corte. */
function rowsWithText(text: string): { cells: string[]; text: string }[] {
  const out: { cells: string[]; text: string }[] = [];
  let cells: string[] = [];
  let cur = "";
  let start = 0;
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { cells.push(cur); cur = ""; }
    else if (c === "\n") {
      cells.push(cur);
      out.push({ cells, text: text.slice(start, i + 1) });
      cells = []; cur = ""; start = i + 1;
    } else if (c !== "\r") cur += c;
  }
  if (cur || cells.length) { cells.push(cur); out.push({ cells, text: text.slice(start) }); }
  return out;
}

const rows = rowsWithText(raw);
const header = rows[0]!;
const cols = header.cells.map((h) => h.replace(/^﻿/, ""));
const convIx = cols.findIndex((c) => c === "conversation_id");
if (convIx < 0) { console.error("no encontré la columna conversation_id"); process.exit(1); }

const keep = new Set<string>();
const chunks: string[] = [header.text];
for (const r of rows.slice(1)) {
  const id = r.cells[convIx];
  if (!id) continue;
  if (!keep.has(id)) {
    if (keep.size >= N) continue;
    keep.add(id);
  }
  chunks.push(r.text);
}

writeFileSync(output, chunks.join(""));
const kb = (chunks.join("").length / 1024).toFixed(0);
console.log(`  ${keep.size} conversaciones · ${chunks.length - 1} mensajes · ${kb} KB → ${output}`);
