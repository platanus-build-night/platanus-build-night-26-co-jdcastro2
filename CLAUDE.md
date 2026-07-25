# DARWIN — contexto para Claude Code

**DARWIN: el marketing evoluciona solo.** Le das la web de un producto, el export de
conversaciones con sus clientes y (opcional) sus posts y reseñas; DARWIN investiga la marca,
extrae los ángulos de venta con evidencia real (citas + frecuencia), arma la estrategia de
distribución y despliega 5 agentes que la ejecutan — paid, orgánico, creators/UGC, email, blog.
Los ads compiten bajo selección natural, cada resultado se escribe en una Memoria, y **nada se
publica sin GO humano.**

Es la generalización open source del sistema de growth que Julian opera en producción en
Dosmicos hace más de un año. Platanus Build Night Bogotá, 12 horas, en solitario, MIT.

## El discurso (no menciona competidores)

"Hoy crear aplicaciones no es el problema; el problema es la distribución." DARWIN la automatiza.
Diferenciador: todo "AI marketer" **inventa** el marketing; DARWIN lo **extrae de evidencia** —
cita textual del cliente → hook del ad, con trazabilidad obligatoria en el schema.

## Invariantes (no romper)

1. **`AdDraft.source_quote` es obligatorio en Zod.** Un ad sin la cita que lo originó no existe.
   La mecánica núcleo es invertir la frase del cliente en promesa: "se destapa toda la noche" →
   "la cobijita que sí se queda puesta".
2. **Los enums están blindados de nacimiento** (`schemas.ts`). Un enum abierto se corrompe en
   producción. Si el modelo inventa un valor, Zod lo rechaza y `llm.ts` reintenta.
3. **Ninguna fuente del panorama es requerida.** Las 4 corren con `Promise.allSettled` + timeout;
   cada una que falla registra `coverage[].status` y el pipeline sigue. Con solo web +
   conversaciones DARWIN entrega estrategia completa.
4. **IG scraping jamás es dependencia** — va detrás de `--ig-scrape`, apagado por defecto.
   Fue el riesgo #1 identificado; está eliminado por diseño.
5. **Los testimonios nunca se agrupan** — cada voz es una fila (`is_testimonial`).
6. **Nada sale de `draft` sin GO humano.**
7. **Sin pronóstico de CAC.** Sin historial sería falsa precisión. El sim se rotula SIEMPRE como
   "simulación con supuestos de categoría", nunca como predicción.
8. **Sin programa de referidos** (fuera del MVP, decisión de Julian).

## Gotchas de la API que ya están cableados en `llm.ts`

Leer antes de tocar ese archivo — cada uno costó un 400 en potencia:

- **fable-5 piensa siempre**: mandar el parámetro `thinking` explícito es 400. Tampoco acepta
  `temperature`/`top_p`/`top_k` ni prefill de assistant.
- **fable-5 exige retención de datos de 30 días**: bajo zero-data-retention TODA llamada da 400.
  Por eso `DARWIN_JUDGE_MODEL` es configurable → si la key del evento es ZDR, cambiar a
  `claude-opus-5` y seguir.
- **haiku-4-5 NO acepta `output_config.effort`**: es 400. `llm.ts` solo lo manda a los de juicio.
- **`strict: true` no se usa a propósito**: los schemas tienen `.max()`/`.min()` y structured
  outputs no soporta esas restricciones. Zod las valida del lado cliente, que es donde queremos
  el control.
- Precios (USD/MTok): fable-5 $10/$50 · opus-5 $5/$25 · sonnet-5 $3/$15 · haiku-4-5 $1/$5.
  Corrida completa ≈ $1.8–2.3. Hard stop a $4.

## Stack

Node 22 + TypeScript vía `tsx` (cero build) · Hono + `@hono/node-server` (SSE nativo) ·
frontend vanilla sin React ni CDN (wifi hostil) · storage = JSON en `runs/<id>/` · Zod valida
cada write · Claude vía `@anthropic-ai/sdk` crudo con tool-use forzado (`tool_choice`) → JSON
garantizado. **No Agent SDK**: el pipeline es un DAG determinista; un "agente" = system prompt +
schema Zod + modelo, y `callRole()` es todo el runtime que necesitan.

## Estado

Hecho y verificado: `schemas.ts` (contrato, 10 schemas pasan a JSON Schema sin `$ref`),
`llm.ts` (callRole + costo + hard stop + retry con error de parse inyectado), `bus.ts`
(EventBus → SSE + NDJSON, con `say`/`show`/`tally` para la narración y `useClock` para el
fixture), `server.ts` (Hono + SSE + /api/go + estáticos), `replay.ts`, `pipeline/ingest.ts`
(WhatsApp iOS/Android + CSV, cero red), `evolution/engine.ts`, `config/darwin.config.ts`
(ojo: en `config/`, NO en `src/config/`), `data/category-benchmarks.json`, `demo/generate.ts`
(corrida oficial a `runs/demo/events.ndjson`, cero tokens), los 3 scripts de `scripts/`, y el
**war room completo** en `public/` — terminal narrado, grilla de evolución con sparkline,
tarjetas con la cita como elemento principal, diff de memoria y tira de cierre.

Falta: `pipeline/run.ts` (el entrypoint de `npm run pipeline`), `pipeline/panorama.ts`,
`pipeline/miner.ts`, `pipeline/angles.ts`, `pipeline/strategist.ts`, `army.ts`,
`memory/store.ts`. Es decir: el war room y el demo funcionan de punta a punta contra el
fixture; lo que falta es la corrida en vivo contra la API.

### Contrato de presentación (no romper)

- El terminal **narra**, no loguea: `bus.say()` para la voz del agente, `bus.show()` para la
  prueba literal (cita, url, conteo). Es el anti-alucinación en pantalla.
- Los subtítulos del organigrama son **inventario contable** (`bus.tally(role, n, sustantivo)`).
  `app.js` descarta cualquier nota que no empiece con dígito: nunca aparece "corriendo".
- `replay.ts` cronometra **solo** desde los `log`. Quien emita eventos sin `ts` en ráfaga
  (artifact/sim/cost) los verá pintarse en un solo frame. Ver el inyector de latidos en
  `demo/generate.ts`.
- Todo texto del servidor entra a la UI por `textContent`. `payload` es `z.unknown()`.

## Orden de escritura (por si hay que recortar)

1. `src/schemas.ts` — el contrato ✅
2. `src/llm.ts` — único punto de contacto con la API ✅
3. `src/bus.ts` — habilita replay y desarrollo de UI ✅
4. `src/evolution/engine.ts` — la tesis del nombre, el minuto ganador del demo
5. `public/app.js` — lo que ven los 24 hackers

**Recortes en orden si hay atraso:** 1º reseñas → 2º blog+email (dejar 1 email) → 3º creators a
2 prospects pre-generados → 4º análisis del posts CSV → 5º organigrama animado (lista plana).

**Intocable:** miner→angles con `source_quote`, el Estratega cruzando ángulos×formatos×canales,
Evolution en vivo, la Memoria con su diff, panel de cobertura, feed SSE, botones GO, contador de
costo.

## Comandos

```bash
npm run check      # valida el contrato sin gastar un token
npm run gen        # regraba runs/demo/events.ndjson (cero tokens, ~5s)
npm run server     # war room en :3000
npm run demo       # replay de la corrida oficial a 8x  (~60s)
SPEED=4 npm run demo   # el mismo replay a 4x (~2 min), para el escenario
npm run typecheck
```

`gen` es idempotente y **assertea el beat del demo**: si la semilla deja de producir
4 muertos · 1 graduado · 2 hijos, sale con código 1 en vez de grabar un fixture mudo.
Corre `gen` después de tocar `AD_SPEC`: la semilla depende del batch exacto.
