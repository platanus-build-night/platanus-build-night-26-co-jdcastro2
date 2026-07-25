/**
 * El Oído — map+reduce sobre las conversaciones.
 *
 * Es el agente que hace que DARWIN no sea otro "AI marketer". Todo lo que sale
 * de aquí arrastra la cita textual de donde salió, y esa cita viaja intacta
 * hasta el hook del ad. Sin cita no hay insight; Zod lo exige (evidence.min(1))
 * y el war room la pinta como el elemento más grande de la tarjeta.
 *
 * Map: lotes de conversaciones a un modelo barato, en paralelo acotado.
 * Reduce: un modelo de juicio agrupa lo repetido y cuenta frecuencias.
 *
 * Los testimonios NO se agrupan (invariante #5): cada voz es su propia fila.
 */
import { z } from "zod";
import { config } from "../../config/darwin.config";
import { VOICE, ask } from "../agent";
import { bus } from "../bus";
import type { MinerFn, RunContext } from "../contract";
import { DarwinLLMError } from "../llm";
import { Insight, type Conversation } from "../schemas";

/**
 * Máximo de lotes en vuelo. El Oído domina el tiempo de la corrida: 8 lotes a
 * ~100s con concurrencia 4 son ~4 minutos de los ~6 totales. Subirlo lo parte
 * casi a la mitad; el techo real es el 429 del proveedor, no el nuestro.
 * Configurable para poder medirlo sin recompilar.
 */
const CONCURRENCY = Number(process.env.DARWIN_MINER_CONCURRENCY ?? 8);

const MapOut = z.object({
  insights: z
    .array(Insight)
    .describe("Lo que este lote muestra. Si el lote no dice nada útil, devuelve []."),
});
const ReduceOut = z.object({ insights: z.array(Insight).min(1) });

/** Serializa un lote dejando SOLO lo que aporta señal: lo que dice el cliente. */
function renderBatch(convs: Conversation[]): string {
  return convs
    .map((c) => {
      const lines = c.messages
        .filter((m) => m.from !== "system")
        .map((m) => `${m.from === "customer" ? "CLIENTE" : "marca"}: ${m.text}`)
        .join("\n");
      return `===== ${c.conv_id} =====\n${lines}`;
    })
    .join("\n\n");
}

async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

export const miner: MinerFn = async (ctx: RunContext) => {
  // Una conversación sin mensajes del cliente no tiene evidencia que extraer.
  const useful = ctx.data.conversations.filter((c) =>
    c.messages.some((m) => m.from === "customer" && m.text.trim().length > 3),
  );
  if (!useful.length) {
    throw new DarwinLLMError(
      "No hay conversaciones con mensajes de clientes. DARWIN no inventa marketing: sin voz del cliente no hay de dónde extraer.",
      "empty",
    );
  }

  /* Los lotes se arman por PRESUPUESTO DE CARACTERES, no por número de
   * conversaciones. `batch_size` fue calibrado para exports de WhatsApp, donde
   * un hilo son 4 mensajes cortos; en un export de plataforma un hilo puede
   * traer 20 mensajes y 25 hilos se van a 11k tokens — que es lo que hizo
   * expirar la primera corrida real. El tope de caracteres aguanta las dos
   * formas de dato sin tocar el playbook. */
  const CHAR_BUDGET = 14_000;
  const size = config.miner_funnel.batch_size;
  const batches: Conversation[][] = [];
  let cur: Conversation[] = [];
  let curChars = 0;
  for (const c of useful) {
    const chars = c.messages.reduce((s, m) => s + m.text.length + 12, 40);
    if (cur.length && (curChars + chars > CHAR_BUDGET || cur.length >= size)) {
      batches.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(c);
    curChars += chars;
  }
  if (cur.length) batches.push(cur);

  bus.say(
    "miner_map",
    `${useful.length} conversaciones con voz de cliente en ${batches.length} lotes de ${size} · voy a leerlas todas`,
  );

  /* ── map ── */
  let done = 0;
  const mapped = await pool(batches, CONCURRENCY, async (batch, i) => {
    const { insights } = await ask("miner_map", {
      system: `${VOICE}

Eres el Oído de DARWIN. Lees conversaciones REALES de WhatsApp entre una marca
y sus clientes, y extraes lo que se repite.

Qué es un insight aquí: algo que un cliente quiso, pidió, temió, objetó o
celebró. NO es un resumen de la conversación.

Reglas duras:
- "evidence[].quote_redacted" es la cita TEXTUAL del cliente. Cópiala tal cual,
  con sus errores de tipeo y su forma de hablar. NO la parafrasees, no la
  corrijas, no la traduzcas. Esa cita es la materia prima del anuncio.
- "evidence[].conv_id" es el id que aparece en el separador "===== ... =====".
- Un insight SIN cita no existe. Si no puedes citar, no lo reportes.
- "is_testimonial": true cuando el cliente cuenta su propia experiencia con el
  producto ("me la regalaron y ya compré dos más"). Los testimonios se reportan
  uno por uno, JAMÁS agrupados: cada voz vale por sí sola.
- "occurrence_count": cuántas conversaciones DE ESTE LOTE lo muestran.
- "priority": 5 solo si mueve dinero ya (bloquea una compra o la desbloquea).
- "id": slug corto y estable en snake_case, del tema ("envio_regalo_sabado").

Ignora saludos, agradecimientos y coordinación de logística sin fricción.`,
      user: `Lote ${i + 1} de ${batches.length}.\n\n${renderBatch(batch)}`,
      schema: MapOut,
      toolName: "extraer_insights_del_lote",
    });

    done++;
    bus.agent("miner_map", "thinking", `${done}/${batches.length} lotes`);
    const top = insights.find((x) => x.evidence[0]?.quote_redacted);
    if (top) {
      bus.show("miner_map", top.evidence[0]!.conv_id, `"${top.evidence[0]!.quote_redacted}"`);
    }
    return insights;
  });

  const raw = mapped.flat();
  bus.tally("miner_map", batches.length, "lotes");
  bus.say("miner_reduce", `${raw.length} señales sin agrupar · ahora consolido`);

  if (!raw.length) {
    throw new DarwinLLMError(
      "Los lotes no produjeron ni un insight con cita. Revisa que el export tenga mensajes de clientes.",
      "empty",
    );
  }

  /* ── reduce ──
   * El modelo de juicio ve TODO junto: es la única forma de contar frecuencias
   * reales y de detectar que dos lotes están diciendo lo mismo con otras palabras. */
  const [lo, hi] = config.miner_funnel.expected_insights;
  const { insights } = await ask("miner_reduce", {
    system: `${VOICE}

Eres el Oído de DARWIN en modo consolidación. Recibes insights crudos extraídos
por lotes y los conviertes en la lista definitiva de la marca.

Tu trabajo:
- Fusiona los que dicen LO MISMO aunque usen otras palabras. Al fusionar, suma
  los "occurrence_count" y conserva las MEJORES citas (las más textuales y
  específicas), hasta 4 por insight.
- NO fusiones testimonios. Si "is_testimonial" es true, cada uno queda como su
  propia fila aunque se parezcan: son voces distintas, no un patrón.
- Reordena por "priority": arriba lo que bloquea o desbloquea una compra.
- Apunta a entre ${lo} y ${hi} insights. Si hay menos señal real, devuelve menos:
  inflar la lista con relleno es peor que una lista corta.
- Toda cita debe venir de la entrada. NO escribas citas nuevas.

El "id" final debe ser estable y descriptivo: otros agentes lo van a referenciar.`,
    user: `Marca: ${ctx.brand.name}

INSIGHTS CRUDOS (${raw.length}, de ${batches.length} lotes):
${JSON.stringify(raw, null, 1)}`,
    schema: ReduceOut,
    toolName: "consolidar_insights",
  });

  /* Red de seguridad del invariante: si algo llegó sin cita, no pasa. */
  const clean = insights.filter((i) => i.evidence.some((e) => e.quote_redacted.trim().length > 0));
  if (clean.length < insights.length) {
    bus.say("miner_reduce", `descarté ${insights.length - clean.length} insights sin cita textual`);
  }

  const testimonios = clean.filter((i) => i.is_testimonial).length;
  bus.show(
    "miner_reduce",
    "consolidado",
    `${clean.length} insights · ${testimonios} testimonios sin agrupar`,
  );
  const top = [...clean].sort((a, b) => b.occurrence_count - a.occurrence_count)[0];
  if (top) {
    bus.show(
      "miner_reduce",
      "frecuencia",
      `"${top.evidence[0]!.quote_redacted}" y equivalentes: ${top.occurrence_count} conversaciones`,
    );
  }
  return clean;
};
