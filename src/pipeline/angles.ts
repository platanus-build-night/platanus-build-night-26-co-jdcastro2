/**
 * Banco de ángulos — LA MECÁNICA NÚCLEO.
 *
 * Toma la queja literal del cliente y la invierte en promesa:
 *   "se le destapa toda la noche"  →  "la cobijita que sí se queda puesta"
 *
 * Nada de esto es generación creativa: es traducción. La promesa vive dentro de
 * la frase del cliente y el trabajo del agente es encontrarla, no inventarla.
 * Por eso el schema exige "source_quote" y por eso este archivo verifica, con
 * código, que cada cita devuelta exista de verdad entre los insights.
 */
import { z } from "zod";
import { VOICE, ask } from "../agent";
import { bus } from "../bus";
import type { AnglesFn, RunContext } from "../contract";
import { DarwinLLMError } from "../llm";
import { Angle, type Insight } from "../schemas";

const AnglesOut = z.object({ angles: z.array(Angle).min(1).max(12) });

/** Normaliza para comparar citas sin castigar tildes, comillas ni espacios. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[“”"'`´]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const angles: AnglesFn = async (ctx: RunContext, { insights, research }) => {
  bus.say("angles", "cada ángulo tiene que nacer de una cita — sin cita no hay ángulo");

  const quotes = insights.flatMap((i) =>
    i.evidence.map((e) => ({ insight_id: i.id, quote: e.quote_redacted })),
  );
  const haystack = quotes.map((q) => norm(q.quote));

  const { angles: raw } = await ask("angles", {
    system: `${VOICE}

Eres el Banco de Ángulos de DARWIN. Haces UNA cosa: invertir la frase del
cliente en promesa de marca.

Ejemplo de la mecánica, apréndela bien:
  cliente: "se le destapa toda la noche y amanece heladita"
  hook:    "la cobijita que sí se queda puesta"

Fíjate qué pasó ahí: el hook usa las MISMAS palabras del cliente ("se queda
puesta" responde a "se destapa"), no introduce vocabulario de marca, y promete
exactamente lo que faltaba. No dice "sueño reparador" ni "confort nocturno".

Reglas:
- "hook_text": máximo 12 palabras, en el español del cliente, sin adjetivos de
  marca. Si suena a agencia, está mal.
- "source_quote": la cita TEXTUAL que originó el ángulo, copiada carácter por
  carácter de la evidencia que te doy. NO la reescribas. Se verifica.
- "insight_ids": los ids de los insights que sostienen el ángulo.
- "evidence_strength": 1 si lo dijo una persona; 5 si lo dicen todo el tiempo.
  Guíate por "occurrence_count", no por lo bonito que quedó el hook.
- "confidence": qué tan seguro estás de que este ángulo vende. Es distinto de
  la evidencia: un dolor muy repetido puede ser difícil de convertir.

Un ángulo por dolor o deseo distinto. NO hagas dos ángulos del mismo insight con
otras palabras: eso es relleno y se nota en el test.
Cubre también lo positivo: un testimonio fuerte es un ángulo de social_proof.`,
    user: `Marca: ${research.brand_brief.name} · ${research.brand_brief.vertical}
Tono actual: ${research.brand_brief.tone}
Audiencia: ${research.brand_brief.audience}
Productos: ${research.brand_brief.products.join(", ")}

INSIGHTS CON SU EVIDENCIA:
${JSON.stringify(insights, null, 1)}`,
    schema: AnglesOut,
    toolName: "entregar_banco_de_angulos",
  });

  /* ── verificación del invariante #1 ──
   * El schema garantiza que source_quote existe; esto garantiza que es REAL.
   * Un modelo que "mejora" la cita rompe la trazabilidad en silencio, que es
   * justo el fallo que DARWIN existe para no cometer. */
  const kept = raw.filter((a) => {
    const n = norm(a.source_quote);
    const hit = haystack.some((h) => h === n || h.includes(n) || n.includes(h));
    if (!hit) {
      bus.say("angles", `descarto "${a.hook_text}": su cita no aparece en la evidencia`);
    }
    return hit;
  });

  if (!kept.length) {
    throw new DarwinLLMError(
      "Ningún ángulo conservó una cita verificable. El banco de ángulos sin trazabilidad no sirve.",
      "parse",
    );
  }

  for (const a of kept) {
    bus.show("angles", "invirtiendo", `"${a.source_quote}" → "${a.hook_text}"`);
  }
  const fuertes = kept.filter((a) => a.evidence_strength >= 4).length;
  bus.say("angles", `${kept.length} ángulos con cita verificada · ${fuertes} con evidencia fuerte`);
  return kept;
};

/** Para los checks: la comparación de citas no debe depender del LLM. */
export const _norm = norm;
