/**
 * El ÚNICO punto de contacto con la API de Claude.
 *
 * Un "agente" en DARWIN no es un framework: es system prompt + schema Zod +
 * modelo. Esta función es todo el runtime que necesitan.
 *
 * Garantía de JSON: tool-use forzado (`tool_choice: {type:"tool"}`) → el modelo
 * NO puede responder texto libre, solo llamar la tool con el shape del schema.
 * Zod valida lo que vuelve; si falla, un retry con el error de parse inyectado.
 *
 * Notas de la API que están cableadas aquí (no las cambies sin leer esto):
 *  - fable-5 piensa SIEMPRE: mandar `thinking` explícito es 400. Tampoco acepta
 *    temperature/top_p/top_k ni prefill de assistant.
 *  - haiku-4-5 NO acepta `output_config.effort`: es 400. Solo va a los de juicio.
 *  - fable-5 exige retención de datos de 30 días: bajo ZDR TODA llamada da 400.
 *    Por eso el modelo de juicio es configurable por env (DARWIN_JUDGE_MODEL).
 *  - `strict: true` en la tool NO se usa a propósito: nuestros schemas tienen
 *    .max()/.min() y structured outputs no soporta esas restricciones. Zod las
 *    valida del lado cliente, que es donde queremos el control.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { bus } from "./bus";
import type { Role } from "./schemas";

/* ─────────────────────────── modelos y precios ─────────────────────────── */

/** USD por millón de tokens. */
export const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  "claude-fable-5": { in: 10, out: 50 },
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

export const MODELS = {
  /** volumen: miner map, email, blog, generador */
  volume: process.env.DARWIN_VOLUME_MODEL ?? "claude-haiku-4-5",
  /** juicio: miner reduce, ángulos, estratega, paid, mutaciones, memoria */
  judge: process.env.DARWIN_JUDGE_MODEL ?? "claude-fable-5",
} as const;

/** Modelos que aceptan output_config.effort (haiku-4-5 NO). */
const SUPPORTS_EFFORT = new Set([
  "claude-fable-5",
  "claude-opus-5",
  "claude-sonnet-5",
]);

/* ─────────────────────────── contador de costo ─────────────────────────── */

export const HARD_STOP_USD = Number(process.env.DARWIN_HARD_STOP ?? 4);

class CostMeter {
  total = 0;
  byRole: Record<string, number> = {};
  calls = 0;

  add(role: string, model: string, inTok: number, outTok: number, cacheRead = 0) {
    const p = MODEL_PRICING[model] ?? { in: 5, out: 25 };
    // lecturas de caché a ~0.1x del precio de input
    const usd =
      (inTok / 1e6) * p.in + (outTok / 1e6) * p.out + (cacheRead / 1e6) * p.in * 0.1;
    this.total += usd;
    this.byRole[role] = (this.byRole[role] ?? 0) + usd;
    this.calls++;
    bus.emit({ type: "cost", total_usd: this.total, by_role: { ...this.byRole } });
    return usd;
  }

  check() {
    if (this.total >= HARD_STOP_USD) {
      throw new DarwinLLMError(
        `HARD STOP: $${this.total.toFixed(2)} >= $${HARD_STOP_USD}. ` +
          `Sube DARWIN_HARD_STOP si esto es a propósito.`,
        "budget",
      );
    }
  }

  reset() {
    this.total = 0;
    this.byRole = {};
    this.calls = 0;
  }
}

export const cost = new CostMeter();

/* ─────────────────────────────── errores ─────────────────────────────── */

export type LLMErrorKind = "budget" | "refusal" | "parse" | "api" | "empty";

export class DarwinLLMError extends Error {
  constructor(
    message: string,
    public kind: LLMErrorKind,
  ) {
    super(message);
    this.name = "DarwinLLMError";
  }
}

/* ───────────────────────────── el cliente ───────────────────────────── */

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new DarwinLLMError(
        "Falta ANTHROPIC_API_KEY. Copia .env.example a .env y pega la key del evento.",
        "api",
      );
    }
    _client = new Anthropic({ maxRetries: 2 });
  }
  return _client;
}

/**
 * Zod → JSON Schema para el input_schema de la tool.
 * Las .describe() de schemas.ts viajan aquí dentro: son el prompt de cada campo.
 */
function toolSchema(schema: z.ZodType): Record<string, unknown> {
  let json: Record<string, unknown>;
  try {
    json = z.toJSONSchema(schema, {
      target: "draft-7",
      io: "input",
      unrepresentable: "any",
      reused: "inline",
    }) as Record<string, unknown>;
  } catch {
    json = z.toJSONSchema(schema) as Record<string, unknown>;
  }
  // La API exige un object en la raíz.
  if (json.type !== "object") {
    return { type: "object", properties: { value: json }, required: ["value"] };
  }
  delete json.$schema;
  return json;
}

export interface CallRoleOptions<T> {
  role: Role;
  model?: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Nombre de la tool. Solo cosmético para el modelo, pero ayuda: usa un verbo. */
  toolName?: string;
  toolDescription?: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  /** Modelo al que caer si el principal se rehúsa o revienta 2 veces. */
  fallbackModel?: string;
}

/**
 * Una llamada = un agente. Devuelve T validado por Zod o lanza DarwinLLMError.
 */
export async function callRole<T>(opts: CallRoleOptions<T>): Promise<T> {
  const {
    role,
    model = MODELS.judge,
    system,
    user,
    schema,
    toolName = "emitir_resultado",
    toolDescription = "Entrega el resultado estructurado. Es la ÚNICA forma de responder.",
    maxTokens = 8000,
    effort = "low",
    fallbackModel,
  } = opts;

  cost.check();
  bus.agent(role, "thinking");
  const started = Date.now();

  const input_schema = toolSchema(schema);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];

  let lastErr: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const useModel = attempt === 1 && fallbackModel ? fallbackModel : model;

    const req: Anthropic.MessageCreateParamsNonStreaming = {
      model: useModel,
      max_tokens: maxTokens,
      system,
      messages,
      tools: [{ name: toolName, description: toolDescription, input_schema } as Anthropic.Tool],
      tool_choice: { type: "tool", name: toolName },
      // effort solo donde existe; en haiku-4-5 es un 400.
      // `thinking` NO se manda nunca: fable-5 piensa siempre y rechaza el param.
      ...(SUPPORTS_EFFORT.has(useModel) ? { output_config: { effort } } : {}),
    };

    try {
      const res = await client().messages.create(req);

      cost.add(
        role,
        useModel,
        res.usage.input_tokens,
        res.usage.output_tokens,
        res.usage.cache_read_input_tokens ?? 0,
      );

      if (res.stop_reason === "refusal") {
        throw new DarwinLLMError(`${role}: la API rehusó la petición`, "refusal");
      }

      const block = res.content.find((b) => b.type === "tool_use");
      if (!block || block.type !== "tool_use") {
        throw new DarwinLLMError(
          `${role}: no llegó tool_use (stop_reason=${res.stop_reason})`,
          "empty",
        );
      }

      const parsed = schema.safeParse(block.input);
      if (parsed.success) {
        const ms = Date.now() - started;
        bus.agent(role, "done", `${(ms / 1000).toFixed(1)}s`);
        bus.log(role, `ok en ${(ms / 1000).toFixed(1)}s · $${cost.total.toFixed(3)} acumulado`);
        return parsed.data;
      }

      // Re-inyectamos el error de parse: el modelo se corrige solo casi siempre.
      const issues = parsed.error.issues
        .slice(0, 12)
        .map((i) => `- ${i.path.join(".") || "(raíz)"}: ${i.message}`)
        .join("\n");
      bus.log(role, `schema inválido, reintentando · ${parsed.error.issues.length} problemas`);
      messages.push(
        { role: "assistant", content: [block] },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: block.id,
              is_error: true,
              content:
                `El resultado no pasó validación. Corrige EXACTAMENTE esto y vuelve a llamar la tool:\n${issues}\n\n` +
                `Recuerda: los enums solo aceptan los valores listados y los límites de caracteres se cuentan.`,
            },
          ],
        },
      );
      lastErr = new DarwinLLMError(`${role}: schema inválido tras retry`, "parse");
    } catch (err) {
      lastErr = err;
      if (err instanceof DarwinLLMError && err.kind === "budget") throw err;

      const detail =
        err instanceof Anthropic.APIError
          ? `HTTP ${err.status} ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      bus.log(role, `error: ${detail}`);

      if (attempt === 1) break;
      if (!(err instanceof DarwinLLMError)) {
        // error de red/API: reintentamos igual (el SDK ya hizo sus 2 retries)
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  bus.agent(role, "error");
  throw lastErr instanceof Error
    ? lastErr
    : new DarwinLLMError(`${role}: falló`, "api");
}

/** Igual que callRole pero devuelve null en vez de lanzar. Para fuentes opcionales. */
export async function callRoleSafe<T>(opts: CallRoleOptions<T>): Promise<T | null> {
  try {
    return await callRole(opts);
  } catch (err) {
    if (err instanceof DarwinLLMError && err.kind === "budget") throw err;
    return null;
  }
}
