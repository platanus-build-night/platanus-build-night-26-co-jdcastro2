/**
 * El Estratega — cruza ángulos × formatos × canales.
 *
 * Las reglas duras (presupuesto, kill rules, umbral de graduación) NO se las
 * inventa el modelo: salen de config/darwin.config.ts, que es un playbook real
 * con su evidencia escrita al lado. El modelo decide el REPARTO y el porqué.
 *
 * Invariante #7: aquí no se pronostica CAC ni ROAS. `success_metrics` dice qué
 * se va a medir, nunca qué va a pasar. Sin historial de la marca, un pronóstico
 * es falsa precisión — y la falsa precisión es lo primero que un operador huele.
 */
import { z } from "zod";
import { config } from "../../config/darwin.config";
import { VOICE, ask } from "../agent";
import { bus } from "../bus";
import type { RunContext, StrategistFn } from "../contract";
import { ChannelPlan, type Strategy } from "../schemas";

/** Lo que el modelo SÍ decide. El resto lo pone el playbook. */
const StrategyDraft = z.object({
  channel_mix: z.array(ChannelPlan).min(3).max(5),
  rationale: z
    .string()
    .describe(
      "Por qué este reparto y no otro, amarrado a los ángulos y formatos con evidencia. Máximo 5 frases.",
    ),
  success_metrics: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe("Qué se mide para decidir. NUNCA un pronóstico de resultados."),
  memory_applied: z
    .array(z.string())
    .default([])
    .describe("Qué aprendizajes previos se usaron. Vacío si no había memoria."),
});

export const strategist: StrategistFn = async (
  ctx: RunContext,
  { research, angles, memory },
) => {
  bus.say(
    "strategist",
    `cruzando ${angles.length} ángulos contra ${research.formats_ranked.length} formatos con evidencia`,
  );
  bus.show(
    "strategist",
    "regla",
    `1 ad = 1 ad set · $${config.testing.budget_per_adset_usd}/día · techo de testing ${Math.round(config.testing.lane_pct_max * 100)}% del spend`,
  );

  if (memory) {
    bus.say("strategist", `aplicando ${memory.learnings.length} aprendizajes de corridas previas`);
    for (const l of memory.learnings.slice(0, 3)) bus.show("strategist", "memoria", l);
  } else {
    bus.say("strategist", "primera corrida de esta marca: la memoria está vacía");
  }

  const draft = await ask("strategist", {
    system: `${VOICE}

Eres el Estratega de DARWIN. Repartes el esfuerzo entre canales y explicas por qué.

Los canales posibles son exactamente: paid, organic, creators, email, blog.

Cómo decidir:
- Los formatos con evidence="own_metrics" pesan más que los de benchmark. Si un
  formato rinde en ESTA cuenta, el canal que lo explota sube.
- Los ángulos con "evidence_strength" alto justifican invertir; los de evidencia
  1 o 2 son apuestas y no deben cargar el mix.
- "paid" es el único canal que da veredicto en días: si hay que aprender rápido,
  se lleva la mayor parte.
- "creators" tiene sentido cuando el dolor necesita PRUEBA que la marca no puede
  fabricarse a sí misma (testimonio real).
- "email" solo si hay una fricción de compra concreta que un correo resuelve.
- "blog" es el más lento: dale la menor parte salvo que haya una búsqueda
  evidente que los clientes ya están haciendo.

Reglas duras:
- "effort_share" son fracciones que suman ≈ 1.0.
- "what_to_test" es UNA prueba concreta y ejecutable, no un objetivo.
- "rationale" cita ángulos y formatos por su nombre, con sus números cuando
  existan. Máximo 5 frases.
- "success_metrics": qué se MIDE. Está PROHIBIDO pronosticar CAC, ROAS, ventas o
  crecimiento: no hay historial de esta marca que lo respalde. "ROAS por ad set a
  7 días" es una métrica; "ROAS esperado 3.5x" es una mentira.
- Si te di memoria de corridas anteriores, dime en "memory_applied" qué usaste,
  en frases cortas. Si no había, déjalo vacío.`,
    user: `Marca: ${research.brand_brief.name} · ${research.brand_brief.vertical}
Audiencia: ${research.brand_brief.audience}

FORMATOS CON EVIDENCIA:
${JSON.stringify(research.formats_ranked, null, 1)}

MÉTRICAS PROPIAS:
${research.own_content_stats ? JSON.stringify(research.own_content_stats, null, 1) : "(no hay)"}

ÁNGULOS DISPONIBLES:
${JSON.stringify(
  angles.map((a) => ({
    id: a.id,
    hook_text: a.hook_text,
    angle_family: a.angle_family,
    evidence_strength: a.evidence_strength,
    source_quote: a.source_quote,
  })),
  null,
  1,
)}

MEMORIA DE CORRIDAS ANTERIORES:
${memory ? JSON.stringify(memory, null, 1) : "(primera corrida)"}

Presupuesto de testing: $${config.testing.budget_per_adset_usd}/día por ad set, ${config.testing.n_ads_first_round} ads en la primera ronda.`,
    schema: StrategyDraft,
    toolName: "entregar_estrategia",
  });

  /* El plan de testing sale del playbook, no del modelo: son reglas medidas en
   * operación real y cada una lleva su evidencia en config/darwin.config.ts. */
  const strategy: Strategy = {
    channel_mix: draft.channel_mix,
    testing_plan: {
      budget_per_adset_usd: config.testing.budget_per_adset_usd,
      n_ads: config.testing.n_ads_first_round,
      lane_pct_max: config.testing.lane_pct_max,
      kill_rules: config.kill_rules.map((k) => ({
        tier: k.tier,
        condition: k.condition,
        action: k.action,
        window: k.window,
      })),
      graduation: {
        roas_min: config.graduation.roas_min,
        purchases_min: config.graduation.purchases_min,
        scale_pct_day: config.graduation.scale_pct_day,
      },
      success_metrics: draft.success_metrics,
    },
    rationale: draft.rationale,
    memory_applied: draft.memory_applied,
  };

  const mix = strategy.channel_mix
    .map((c) => `${c.channel} ${Math.round(c.effort_share * 100)}%`)
    .join(" · ");
  bus.show("strategist", "reparto", mix);
  return strategy;
};
