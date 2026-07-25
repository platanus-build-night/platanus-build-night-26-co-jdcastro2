/**
 * ¿Sirve este modelo para DARWIN?
 *
 * No mide inteligencia general: mide las DOS cosas de las que depende el
 * sistema, y que ningún benchmark reporta.
 *
 *  1. Tool-use forzado → JSON que pasa Zod, incluidos .max() y enums cerrados.
 *  2. FIDELIDAD DE LA CITA. angles.ts y army.ts descartan todo ad cuya
 *     source_quote no coincida con la evidencia real. Un modelo con manía de
 *     pulir texto devuelve "se destapa durante la noche" donde la clienta
 *     escribió "se le destapa toda la noche y amanece heladita" — y DARWIN,
 *     correctamente, tira ese ad. Con un modelo así terminas con cero anuncios
 *     y una corrida "exitosa". Eso es lo que esto detecta, por centavos.
 *
 *   npm run check:models
 *   npm run check:models -- x-ai/grok-4.5 moonshotai/kimi-k3
 */
import { z } from "zod";
import { callOpenRouter } from "../src/llm-openrouter";
import { CTA, HookPattern } from "../src/schemas";

try {
  process.loadEnvFile(".env");
} catch {
  /* usa el entorno */
}

const QUOTE = "se le destapa toda la noche y amanece heladita, no sé qué hacer";

const Out = z.object({
  hook_text: z.string().max(54).describe("Máximo 54 caracteres. Cuéntalos."),
  hook_pattern: HookPattern,
  cta: CTA,
  source_quote: z.string().describe("La cita del cliente, copiada carácter por carácter."),
});

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”"'`´]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const models = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      process.env.DARWIN_JUDGE_MODEL ?? "x-ai/grok-4.5",
      process.env.DARWIN_VOLUME_MODEL ?? "moonshotai/kimi-k2.5",
    ];

let bad = 0;
console.log(`\n  cita de prueba: "${QUOTE}"\n`);

for (const model of models) {
  const t0 = Date.now();
  let spent = 0;
  try {
    const r = await callOpenRouter({
      role: "angles",
      model,
      system:
        "Eres el Banco de Ángulos de DARWIN. Inviertes la queja del cliente en promesa, " +
        "usando SUS palabras. Ejemplo: 'se destapa toda la noche' → 'la cobijita que sí se queda puesta'.\n" +
        "REGLA CRÍTICA: 'source_quote' es la cita del cliente copiada CARÁCTER POR CARÁCTER. " +
        "No la corrijas, no la acortes, no la mejores. Se verifica.",
      user: `Cita del cliente:\n"${QUOTE}"\n\nInvierte esto en una promesa de marca.`,
      schema: Out,
      jsonSchema: z.toJSONSchema(Out, { target: "draft-7", io: "input" }) as Record<
        string,
        unknown
      >,
      toolName: "entregar_angulo",
      toolDescription: "Entrega el ángulo estructurado.",
      maxTokens: 1200,
      onCost: (_r, usd) => {
        spent = usd;
      },
    });

    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const fiel = norm(r.source_quote) === norm(QUOTE);
    const largo = r.hook_text.length <= 54;

    console.log(`  ${model}`);
    console.log(`     schema        ok · ${secs}s · $${spent.toFixed(5)}`);
    console.log(`     hook          "${r.hook_text}" (${r.hook_text.length}/54)${largo ? "" : "  ← SE PASÓ"}`);
    console.log(`     cita intacta  ${fiel ? "sí" : "NO"}`);
    if (!fiel) {
      console.log(`       devolvió:   "${r.source_quote}"`);
      console.log(`       DARWIN descartaría este ángulo.`);
      bad++;
    }
    if (!largo) bad++;
    console.log();
  } catch (err) {
    console.log(`  ${model}`);
    console.log(`     ✕ ${(err as Error).message.slice(0, 220)}\n`);
    bad++;
  }
}

console.log(bad === 0 ? "  MODELOS OK\n" : `  ${bad} PROBLEMAS\n`);
process.exit(bad === 0 ? 0 : 1);
