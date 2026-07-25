/**
 * Transporte OpenRouter (API compatible con OpenAI).
 *
 * Mismo contrato que la ruta de Anthropic: tool-use FORZADO → JSON garantizado
 * → Zod valida → si falla, se reinyecta el error de parse y el modelo se
 * corrige. Lo único que cambia es el cable.
 *
 * Por qué un archivo aparte: llm.ts está verificado contra los gotchas de la
 * API de Anthropic (el `thinking` de fable-5, el ZDR, el `effort` de haiku).
 * Nada de eso aplica aquí, y mezclarlo haría ilegibles los dos caminos.
 *
 * Notas de esta API que ya están cableadas:
 * - `tool_choice: {type:"function", function:{name}}` es lo que garantiza que
 *   la respuesta venga como llamada a la tool y no como texto suelto.
 * - `usage: {include: true}` hace que OpenRouter devuelva el COSTO REAL en USD.
 *   Es mejor que estimarlo con una tabla de precios que se desactualiza sola.
 * - Los argumentos llegan como STRING de JSON, no como objeto. Hay modelos que
 *   lo devuelven envuelto en ```json — se limpia antes de parsear.
 */
import type { z } from "zod";
import { bus } from "./bus";
import type { Role } from "./schemas";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface ORCallOptions<T> {
  role: Role;
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  toolName: string;
  toolDescription: string;
  maxTokens: number;
  /** Reporta el gasto real que devuelve OpenRouter. */
  onCost: (role: string, usd: number, inTok: number, outTok: number) => void;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** Algunos modelos envuelven el JSON en una valla de markdown. */
function clean(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("```")) return t.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
  return t;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export async function callOpenRouter<T>(opts: ORCallOptions<T>): Promise<T> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new OpenRouterError(
      "Falta OPENROUTER_API_KEY. Pégala en .env (https://openrouter.ai/keys).",
      0,
    );
  }

  const messages: Record<string, unknown>[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];

  const tool = {
    type: "function",
    function: {
      name: opts.toolName,
      description: opts.toolDescription,
      parameters: opts.jsonSchema,
    },
  };

  let lastIssues = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        // OpenRouter los usa para atribución; no son obligatorios.
        "http-referer": "https://darwin-phi.vercel.app",
        "x-title": "DARWIN",
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        tools: [tool],
        tool_choice: { type: "function", function: { name: opts.toolName } },
        max_tokens: opts.maxTokens,
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(180_000),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new OpenRouterError(`HTTP ${res.status}: ${text.slice(0, 400)}`, res.status);
    }

    let body: {
      choices?: { message?: { tool_calls?: ToolCall[]; content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      error?: { message?: string };
    };
    try {
      body = JSON.parse(text);
    } catch {
      throw new OpenRouterError(`respuesta no es JSON: ${text.slice(0, 200)}`, res.status);
    }
    if (body.error) throw new OpenRouterError(body.error.message ?? "error de OpenRouter", 200);

    const usage = body.usage ?? {};
    opts.onCost(
      opts.role,
      usage.cost ?? 0,
      usage.prompt_tokens ?? 0,
      usage.completion_tokens ?? 0,
    );

    const call = body.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) {
      throw new OpenRouterError(
        `${opts.role}: el modelo no llamó la tool` +
          (body.choices?.[0]?.message?.content
            ? ` · respondió texto: "${body.choices[0].message.content.slice(0, 160)}"`
            : ""),
        200,
      );
    }

    let raw: unknown;
    try {
      raw = JSON.parse(clean(call.function.arguments));
    } catch {
      raw = null;
    }

    const parsed = opts.schema.safeParse(raw);
    if (parsed.success) return parsed.data;

    lastIssues = parsed.error.issues
      .slice(0, 12)
      .map((i) => `- ${i.path.join(".") || "(raíz)"}: ${i.message}`)
      .join("\n");

    if (attempt === 1) break;

    bus.log(opts.role, `schema inválido, reintentando · ${parsed.error.issues.length} problemas`);
    messages.push(
      { role: "assistant", tool_calls: [call] },
      {
        role: "tool",
        tool_call_id: call.id,
        name: opts.toolName,
        content:
          `El resultado no pasó validación. Corrige EXACTAMENTE esto y vuelve a llamar la tool:\n${lastIssues}\n\n` +
          `Recuerda: los enums solo aceptan los valores listados y los límites de caracteres se cuentan.`,
      },
    );
  }

  throw new OpenRouterError(`${opts.role}: schema inválido tras retry\n${lastIssues}`, 200);
}
