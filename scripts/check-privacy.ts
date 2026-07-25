/**
 * La última barrera antes de que un modelo de TERCEROS vea texto de clientas
 * reales. Se corre sobre el archivo de verdad, no sobre un fixture.
 *
 *   npx tsx scripts/check-privacy.ts <archivo>
 */
import { readFileSync } from "node:fs";
import { ingest } from "../src/pipeline/ingest";
import { parseCSV } from "../src/pipeline/ingest";

const file = process.argv[2];
if (!file) { console.error("uso: check-privacy <archivo>"); process.exit(1); }

const raw = readFileSync(file, "utf8");
const res = ingest({ conversations: file, brandName: "marca" });

// Lo que REALMENTE viaja al modelo: el texto de todos los mensajes.
const outgoing = res.conversations.flatMap(c => c.messages.map(m => m.text)).join("\n");

const names = new Set(
  parseCSV(raw).map(r => (r.customer_name ?? "").trim()).filter(n => n.length >= 3),
);

let bad = 0;
const ok = (c: boolean, label: string, detail = "") => {
  console.log(`  ${c ? "ok  " : "FUGA"} ${label.padEnd(22)} ${detail}`);
  if (!c) bad++;
};

console.log(`\n  ${res.stats.conversations_total} conversaciones · ${res.stats.messages_total} mensajes · ${res.stats.pii_redactions} redacciones\n`);

const emails = outgoing.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g) ?? [];
ok(emails.length === 0, "emails", `${emails.length} en el texto que sale`);

const tels = outgoing.match(/\b(?:\+?57[\s-]?)?3\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g) ?? [];
ok(tels.length === 0, "teléfonos", `${tels.length}`);

const leaked = [...names].filter(n => outgoing.includes(n));
ok(leaked.length === 0, "nombres de clienta", `${leaked.length} de ${names.size} conocidos`);
if (leaked.length) console.log(`       ejemplos: ${leaked.slice(0, 3).map(n => n[0] + "***").join(", ")}`);

console.log(bad === 0 ? "\n  PRIVACIDAD OK\n" : `\n  ${bad} FUGAS — no mandes esto a un modelo\n`);
process.exit(bad === 0 ? 0 : 1);
