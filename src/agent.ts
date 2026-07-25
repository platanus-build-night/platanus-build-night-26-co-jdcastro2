/**
 * Un agente = system prompt + schema Zod + modelo.
 *
 * `ask()` es todo el runtime que necesitan: resuelve el modelo y el presupuesto
 * de tokens desde config/darwin.config.ts según el tier del rol (volume o judge)
 * y delega en callRole, que fuerza tool-use y valida con Zod.
 *
 * No hay Agent SDK ni framework: el pipeline es un DAG determinista y esto es
 * la única indirección que hace falta.
 */
import type { z } from "zod";
import { config } from "../config/darwin.config";
import { MODELS, callRole } from "./llm";
import type { Role } from "./schemas";

export interface AskOptions<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  toolName?: string;
  toolDescription?: string;
  /** Sobrescribe el max_tokens del rol cuando una llamada puntual necesita más. */
  maxTokens?: number;
}

export async function ask<T>(role: Role, opts: AskOptions<T>): Promise<T> {
  const r = config.roles[role];
  return callRole({
    role,
    model: r.tier === "judge" ? MODELS.judge : MODELS.volume,
    maxTokens: opts.maxTokens ?? r.max_tokens,
    effort: r.effort,
    system: opts.system,
    user: opts.user,
    schema: opts.schema,
    toolName: opts.toolName,
    toolDescription: opts.toolDescription,
  });
}

/**
 * La voz compartida de todos los agentes.
 *
 * Va al principio de cada system prompt. Es lo que impide que el modelo caiga
 * en jerga de agencia — que es exactamente el fracaso que DARWIN existe para
 * evitar: marketing que suena a marca en vez de a cliente.
 */
export const VOICE = `Eres parte de DARWIN, un sistema que extrae marketing de EVIDENCIA REAL.

Reglas que no se negocian:
- Escribe en el español del cliente, no en el de una agencia. Nada de "potencia",
  "eleva", "descubre", "revoluciona", "solución integral", "experiencia única".
- Si un dato no está en el material que te dieron, NO existe. No inventes cifras,
  ni testimonios, ni beneficios que nadie mencionó.
- Prefiere la frase corta y concreta. Si una madre no lo diría en un WhatsApp,
  no lo escribas.
- Nunca prometas resultados de negocio (ventas, ROAS, crecimiento). No hay
  historial que lo respalde y la falsa precisión destruye la confianza.`;
