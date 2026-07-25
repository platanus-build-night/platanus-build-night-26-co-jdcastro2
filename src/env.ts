/**
 * Carga .env ANTES que cualquier otro módulo.
 *
 * Por qué existe como archivo aparte: en ES modules los imports se evalúan
 * antes que cualquier sentencia del archivo que los importa. Un
 * `process.loadEnvFile(".env")` escrito arriba del todo en worker.ts corre
 * DESPUÉS de que llm.ts ya leyó process.env.DARWIN_PROVIDER — y entonces el
 * pipeline intenta hablar con Anthropic aunque .env diga openrouter.
 *
 * La única forma de garantizar el orden es que esto sea un import, y que sea
 * el PRIMERO de cada entrypoint:
 *
 *     import "./env";        ← siempre primero
 *     import { ... } from "./llm";
 */
try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env se usan las variables del entorno. Es lo normal en CI.
}

export {};
