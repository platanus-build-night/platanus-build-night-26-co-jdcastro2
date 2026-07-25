/**
 * Verifica el contrato SIN gastar un token:
 *  1. cada schema que va a una tool convierte a JSON Schema válido (raíz object,
 *     sin $ref — la API los digiere mal)
 *  2. los enums blindados rechazan valores inventados
 *  3. los .default() se aplican cuando el modelo omite el campo
 *
 *   npm run check
 */
import { z } from "zod";
import * as S from "../src/schemas";

const targets: [string, z.ZodType][] = [
  ["InsightBatch", S.InsightBatch],
  ["AngleBank", S.AngleBank],
  ["BrandResearch", S.BrandResearch],
  ["Strategy", S.Strategy],
  ["AdBatch", S.AdBatch],
  ["ContentCalendar", S.ContentCalendar],
  ["CreatorList", S.CreatorList],
  ["EmailFlow", S.EmailFlow],
  ["BlogDraft", S.BlogDraft],
  ["MemoryDigest", S.MemoryDigest],
];

let bad = 0;

for (const [name, schema] of targets) {
  try {
    const json = z.toJSONSchema(schema, {
      target: "draft-7",
      io: "input",
      unrepresentable: "any",
      reused: "inline",
    }) as Record<string, unknown>;
    const okRoot = json.type === "object";
    const hasRefs = JSON.stringify(json).includes("$ref");
    const size = JSON.stringify(json).length;
    console.log(
      `${okRoot && !hasRefs ? "ok " : "BAD"} ${name.padEnd(18)} ${String(size).padStart(6)}b  refs=${hasRefs}`,
    );
    if (!okRoot || hasRefs) bad++;
  } catch (e) {
    console.log(`BAD ${name.padEnd(18)} THREW: ${(e as Error).message}`);
    bad++;
  }
}

const base = {
  id: "envio_regalo_sabado",
  type: "customer_objection",
  sentiment: "negative",
  priority: 4,
  summary: "preguntan si llega antes del sábado",
  evidence: [{ quote_redacted: "¿llega antes del sábado?", conv_id: "c1" }],
  occurrence_count: 12,
  is_testimonial: false,
};

const evil = { insights: [{ ...base, type: "tipo_inventado" }] };
if (S.InsightBatch.safeParse(evil).success) {
  console.log("BAD enum inventado ACEPTADO");
  bad++;
} else {
  console.log("ok  enum inventado rechazado");
}

const good = S.InsightBatch.safeParse({ insights: [base] });
if (!good.success) {
  console.log(`BAD válido rechazado: ${good.error.issues[0]?.message}`);
  bad++;
} else if (JSON.stringify(good.data.insights[0]!.sub_tags) !== "[]") {
  console.log("BAD default de sub_tags no se aplicó");
  bad++;
} else {
  console.log("ok  válido aceptado + defaults aplicados");
}

// La regla intocable: un ad sin cita no existe.
const adSinCita = S.AdDraft.safeParse({
  id: "a1",
  angle_id: "x",
  format: "static",
  headline: "hola",
  sub: "mundo",
  cta: "comprar_ahora",
  source_quote: "",
});
if (adSinCita.success) {
  console.log("BAD AdDraft sin source_quote ACEPTADO");
  bad++;
} else {
  console.log("ok  AdDraft sin source_quote rechazado");
}

console.log(bad === 0 ? "\nCONTRATO OK" : `\n${bad} PROBLEMAS`);
process.exit(bad === 0 ? 0 : 1);
