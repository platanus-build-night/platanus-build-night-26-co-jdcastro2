{
  "summary": "Rediseñar el war room de DARWIN con la estructura de presentación de Okara",
  "agentCount": 10,
  "logs": [],
  "result": "Verifiqué cada afirmación disputada contra el código y el fixture. Aquí está el plan final.

---

# WAR ROOM v2 — "EL CIRCUITO". Plan de implementación

**Base estructural:** la de `progresivo` (columnas arriba + bandas abajo, layout único, `#ask` en la columna central), **corregida con el hallazgo que compartieron los jueces de `fiel` y `progresivo`: la evolución no puede vivir en una columna angosta.** Se le injerta la etiqueta de mutación de `bucle` (el mejor valor por línea de las cuatro propuestas), la verificación de cita contra `insight.evidence[]` que exigió el juez de `fiel`, y la tira de retorno con `memory_applied` — **con el fixture resembrado**, que es la enmienda que pidieron los cuatro jueces.

### Hechos verificados (contra `runs/demo/events.ndjson`, no contra las propuestas)

| Afirmación en las propuestas | Realidad medida |
|---|---|
| "18 insights sin ángulo" | Se emiten **3** artefactos `insight`; los 3 resuelven. El 18 es un tally, no artefactos. |
| "23 insights → 9 ángulos → 6 ads" | **18 insights (tally) · 6 ángulos · 6 ads**. Nunca escribir un número que no se pueda respaldar con tarjetas en pantalla. |
| "1 ángulo → 1 ad" | `regalo_a_tiempo` tiene **2 ads**; `hecho_aqui` tiene **0**. El diseño debe soportar 0..N. |
| "`ad_regalo_static` trae cita distinta = fallo" | **Falso positivo.** Su cita `"¿alcanza a llegar para el baby shower del viernes?"` es la **segunda `evidence[]` del insight `regalo_con_fecha`**. La verificación correcta es pertenencia a `insight.evidence[].quote_redacted`, no igualdad con `angle.source_quote`. |
| "cambiar la tarjeta a `art-<angle_id>`" | **Rompe 3 contratos.** `env.id === payload.id === sim.ad_id` para los 6 ads (`ad_noche_reel`, etc.). `evoRow().onclick`, `markApproved()` y `HANDLERS.go` cuelgan de `art-<env.id>`. **El id de la tarjeta no se toca jamás.** |
| `memory_applied` | `[]` en `demo/generate.ts:562`. Pero el markdown de memoria ya dice *"static muere en las dos corridas"*: **el fixture ya se narra como corrida 2 y el campo se quedó vacío.** Es un bug del fixture, no una decisión. |
| El assert de `npm run gen` | Solo valida `killed/graduated/children` (`generate.ts:833`). **Resembrar `memory_applied` es seguro.** |
| R1 (autoscroll) | Confirmado. `.panel{overflow-y:auto}` hace scroller a `#terminal`; `paint()` escribe sobre `#log`. `wasBottom` siempre `true`, `scrollTop` no-op. |
| R2 (`.ask-mini`) | Confirmado, `style.css:1046` `display:block` gana a `[hidden]`. Se pinta hoy en todos los replays. |

---

## 1. LA REJILLA FINAL

Reemplaza `style.css:156-231` completo.

```css
/* ═════════════ EL CIRCUITO ═════════════
 * Una sola forma. No hay data-stage. No hay data-evo. Ninguna regla en todo
 * el archivo reescribe grid-template-*. La forma de t=0 es la del Q&A.
 *
 * Recorrido: fuente → cadena → plan (arriba, L→R)
 *            arena → memoria    (banda media)
 *            ↰ ciclo            (riel de retorno, vuelve a fuente)
 *
 * El scope body:not(.landing) es OBLIGATORIO: index.html y landing.html
 * comparten un único style.css sin scoping (R9).
 */
body:not(.landing) main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-areas:
    "fuente cadena  plan"
    "arena  arena   memoria"
    "ciclo  ciclo   ciclo";
  grid-template-columns: 300px minmax(320px, 1fr) 340px;
  grid-template-rows: minmax(0, 1fr) minmax(206px, 30vh) 30px;
  gap: 1px;
  background: var(--line);          /* bordes falsos: funciona, se queda */
}

#z-fuente  { grid-area: fuente; }
#z-cadena  { grid-area: cadena; }
#z-plan    { grid-area: plan; }
#z-arena   { grid-area: arena; }
#z-memoria { grid-area: memoria; }
#z-ciclo   { grid-area: ciclo; }

/* Toda zona = cabeza fija + cuerpo con scroll propio.
   Esto DEFINE quién es el scroller, que es exactamente lo que hoy está mal. */
.zone {
  background: var(--panel);
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px 14px 0;
}
.zone-head { flex: none; padding-bottom: 8px; }
.zone-body { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 14px; }
```

**Suma de mínimos: 300 + 320 + 340 + 2 de gap = 962px.** Entra en un proyector de 1024 sin scroll horizontal — el número que hoy no existe (R3: a 722px el terminal se calculaba en 0px).

**Presupuesto vertical a 768px (proyector):** header 46 + tickbar 32 + fila 1 (451) + arena/memoria 206 + ciclo 30 + 3 gaps = 768. Cierra exacto.

**La arena mide 683px a 1024 y 1082px a 1440** — suficiente para la grilla de 8 columnas alineadas, que es lo que hace legible la selección natural desde el fondo del salón. Ese es el punto que las cuatro propuestas perdían al meter B en una columna de 340-400px.

### Un solo breakpoint, y no cambia la forma

```css
/* La grilla de 8 columnas de la arena no cabe bajo ~1280.
   NO se apila la rejilla: se parte la FILA del ad en dos renglones.
   Los 8 spans siguen existiendo → renderSim() no se toca, R5 intacto. */
@media (max-width: 1280px) {
  .evo-cols { display: none; }
  .evorow {
    grid-template-columns: minmax(0, 1fr) 96px 54px 56px 66px;
    grid-template-areas:
      "id   spark roas buys spend"
      "rule rule  rule rule rule";
    row-gap: 2px;
  }
  .evorow .adid  { grid-area: id; }
  .evorow .spark-cell { grid-area: spark; }
  .evorow .roas  { grid-area: roas; }
  .evorow .buys  { grid-area: buys; }
  .evorow .spend { grid-area: spend; }
  .evorow .rule  { grid-area: rule; white-space: normal; }
  .evorow .atc, .evorow .freq { display: none; }
  .evorow .buys::after  { content: " compras"; }
  .evorow .spend::before{ content: "· "; }
}
@media (max-width: 960px) {   /* no es escenario: que no se rompa */
  body:not(.landing) main {
    grid-template-areas: "cadena" "fuente" "plan" "arena" "memoria" "ciclo";
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
  }
  body:not(.landing) main { overflow-y: auto; }
}
```

### Fase 1 vs fase 2 — la forma no cambia, el contenido sí

| zona | fase 1 (solo `brand_research`, ~40s) | fase 2 (~6 min) |
|---|---|---|
| fuente | **LLENA**: marca, vertical, tono, 4 formatos con badge de evidencia, 6 fuentes de cobertura con nota inline, 8 roles del pipeline | idem + tallies contables |
| cadena | `#ask` arriba + 3 hilos fantasma que enseñan la forma cita→hook→ad | 6 hilos reales; `#ask` se pliega a `#ask-mini` |
| plan | 5 canales nombrados, barra en 0, `—%`; plan de testing con etiquetas y `—` | mix con %, rationale, 3 tiers, entregables por canal |
| arena | 6 carriles punteados + rótulo del sim (estático) + `día —/7` + la promesa de la reproducción | 8 carriles vivos (6 padres + 2 hijos) |
| memoria | promesa de dos lados | diff con `+` en verde |
| ciclo | `↰ corrida 1 · sin memoria previa` | `↰ corrida 2 · aplicó 3 aprendizajes: …` |

Ninguna zona nace ni muere. Ningún `hidden` de contenedor. Lo único que cambia de estado es `#ask`/`#ask-mini` (excluyentes, ya existentes) y el drawer del terminal, que es **overlay `position:fixed` y no toca la rejilla**.

---

## 2. EL HTML DE `index.html`

```html
<body>
  <header>
    <h1>DARWIN</h1>
    <p class="tagline">el marketing evoluciona solo</p>
    <div class="meters">
      <span id="phase" class="pill">esperando</span>
      <span id="art-count" class="pill count">0</span>
      <span id="cost" class="pill cost">$0.000</span>
      <span id="conn" class="pill off">sin conexión</span>
    </div>
  </header>

  <!-- La narración: UNA línea, permanente. 32px de 768 = 4% del alto. -->
  <div id="tickbar">
    <button id="ticker" type="button" title="abrir la narración completa">
      > esperando la primera señal
    </button>
    <span class="tick-hint">narración ⌄</span>
  </div>

  <div id="banner" class="banner" hidden></div>

  <main>
    <!-- ① DE DÓNDE SALIÓ ─────────────────────────────────────── -->
    <section class="zone" id="z-fuente">
      <div class="zone-head"><h2>① la fuente</h2></div>
      <div class="zone-body">
        <div id="brand-art" class="slot"><div class="skel-block"></div></div>

        <h3>formatos que rinden</h3>
        <div id="formats" class="slot"><div class="skel-block"></div></div>

        <h3>cobertura</h3>
        <!-- Las 6 fuentes se conocen de antemano (COV_NAMES). Escribirlas en
             el HTML es honesto y llena la zona en t=0. -->
        <div id="coverage" class="coverage">
          <div class="cov pending"><span class="mark">·</span><span class="src">web</span></div>
          <div class="cov pending"><span class="mark">·</span><span class="src">conversaciones</span></div>
          <div class="cov pending"><span class="mark">·</span><span class="src">posts CSV</span></div>
          <div class="cov pending"><span class="mark">·</span><span class="src">reseñas CSV</span></div>
          <div class="cov pending"><span class="mark">·</span><span class="src">benchmarks de categoría</span></div>
          <div class="cov pending"><span class="mark">·</span><span class="src">IG scraping</span></div>
        </div>

        <h3>el pipeline</h3>
        <div id="org"></div>          <!-- 8 roles no-canal, buildRoster() -->
      </div>
    </section>

    <!-- ② LA CADENA — zona dominante ────────────────────────── -->
    <section class="zone" id="z-cadena">
      <div class="zone-head">
        <h2>② la cadena · <span class="h2sub">lo que dijo tu clienta → el ad que salió de ahí</span></h2>
      </div>
      <div class="zone-body">
        <!-- El ask vive EXACTAMENTE en el hueco donde van a caer las citas.
             7 ids intactos: showAsk()/hideAsk() no se tocan. -->
        <div id="ask" class="ask" hidden>… idéntico a hoy, los 7 ids …</div>
        <button id="ask-mini" class="ask-mini" hidden type="button">
          + entregar conversaciones para extraer ángulos
        </button>

        <div id="chain">
          <p id="chain-promise" class="promise-copy">
            Aquí va la voz de tu clienta, textual. Cada ad de DARWIN nace de una de estas
            frases y la carga pegada para siempre: si no hay cita, el schema rechaza el ad.
          </p>
          <!-- 3 hilos fantasma: enseñan la FORMA del argumento antes de que exista -->
          <div class="thread skel-thread"><span class="skel q"></span><span class="arrow">↓</span><span class="skel h"></span><span class="arrow">↓</span><span class="skel a"></span></div>
          <div class="thread skel-thread"><span class="skel q"></span><span class="arrow">↓</span><span class="skel h"></span><span class="arrow">↓</span><span class="skel a"></span></div>
          <div class="thread skel-thread"><span class="skel q"></span><span class="arrow">↓</span><span class="skel h"></span><span class="arrow">↓</span><span class="skel a"></span></div>
        </div>

        <details id="chain-raw"><summary>la materia prima · <span id="ins-count">—</span> insights</summary>
          <div id="chain-insights"></div>
        </details>
      </div>
    </section>

    <!-- ③ EL PLAN ────────────────────────────────────────────── -->
    <section class="zone" id="z-plan">
      <div class="zone-head"><h2>③ el plan · <span class="h2sub">solo corren los canales que el mix activó</span></h2></div>
      <div class="zone-body">
        <div id="army"></div>          <!-- 5 filas de canal, buildRoster() -->
        <p id="plan-note" class="promise-copy">
          el mix lo decide el Estratega, y el Estratega necesita tus conversaciones.
        </p>
        <h3>plan de testing</h3>
        <div id="plan-test" class="kv">
          <div><span>1 ad =</span><b>1 ad set</b></div>
          <div><span>presupuesto</span><b id="pt-budget">—</b></div>
          <div><span>techo de testing</span><b id="pt-lane">—</b></div>
          <div><span>gradúa</span><b id="pt-grad">—</b></div>
        </div>
        <details id="plan-rules"><summary>3 reglas de muerte</summary><div id="pt-kills"></div></details>
        <div id="plan-art" class="slot"></div>   <!-- la tarjeta de estrategia, con su GO -->
      </div>
    </section>

    <!-- ④ LA ARENA — ancho de 2 columnas, presente desde t=0 ─── -->
    <section class="zone" id="z-arena">
      <div class="zone-head evo-head">
        <h2>④ selección natural</h2>
        <!-- Invariante #7: estático, no depende de que llegue un evento. -->
        <span class="evo-label">simulación con supuestos de categoría · no es un pronóstico</span>
        <span id="evo-day" class="evo-day">día —/7</span>
        <span id="evo-tally" class="evo-tally">—</span>
      </div>
      <div class="evo-cols">
        <span>ad</span><span>roas acum.</span><span class="num">roas</span>
        <span class="num">compras</span><span class="num">atc</span>
        <span class="num">gasto COP</span><span class="num">freq</span>
        <span>regla que se disparó</span>
      </div>
      <div class="zone-body" id="evo-grid"></div>
      <p id="arena-promise" class="promise-copy">
        Cada ad se lleva su propio ad set y su propio presupuesto. A los 7 días los que no
        compran mueren. El que gradúa no se queda quieto: se reproduce en 2 hijos, cada uno
        mutando UNA sola variable — el hook o el formato. De ahí sale el nombre.
      </p>
    </section>

    <!-- ⑤ LA MEMORIA ─────────────────────────────────────────── -->
    <section class="zone" id="z-memoria">
      <div class="zone-head"><h2 id="mem-title">⑤ la memoria</h2></div>
      <div class="zone-body">
        <div id="memory"></div>
        <p id="mem-promise" class="promise-copy">
          Aquí se escribe qué ángulo × formato × canal graduó y cuál murió.
          La próxima corrida arranca leyendo esto.
        </p>
      </div>
    </section>

    <!-- ⑥ EL RIEL DE RETORNO ─────────────────────────────────── -->
    <div id="z-ciclo">
      <span class="ciclo-back">↰</span>
      <span id="ciclo-run">corrida 1</span>
      <span class="ciclo-rail"></span>
      <span id="ciclo-applied"></span>
      <span id="summary" class="summary" hidden></span>
    </div>
  </main>

  <!-- Overlay. NO es zona de la rejilla: abrirlo no cambia la forma de nada. -->
  <div id="logdrawer"><div id="log"></div></div>

  <script src="app.js"></script>
</body>
```

Ids conservados **verbatim** (por eso el 80% de los renderers no se toca): `#phase #cost #conn #banner #ticker #log #coverage #art-count #org #evo-day #evo-tally #evo-grid #mem-title #memory #summary` y los 7 de `#ask`.

---

## 3. QUÉ SE BORRA — explícito

| qué | dónde exactamente | por qué |
|---|---|---|
| `#stepper` | `index.html:23` · `app.js:33-42` (`PHASES`), `45` (`steps`), `95-104` (`buildStepper`), `106-113` (`setPhase`), llamada en `899` **y en `611`** | Un stepper lineal contradice un circuito. **`HANDLERS.phase:611` va en el mismo borrado** — el juez de `bucle` detectó que omitirla deja un `ReferenceError` que `handle()` se traga: el pill de fase y las 8 separaciones del terminal desaparecen en silencio. |
| `setStage()` + `body[data-stage]` | `app.js:125-127`, llamadas `610`, `629`, `924` · `style.css:76-78, 193-207, 217-224, 413-415, 425-427` | El layout ya no tiene segunda forma. Mata **R4** y **R7**. |
| `body[data-evo]` | `app.js:444` · `style.css:185-191` | La arena existe desde t=0. Mata **R11**. |
| `#org-panel`, `#terminal`, `#side`, `#evolution` como wrappers de grid-area | `index.html:27,32,36,80` · `style.css:170-183, 210-225, 226-231, 332-334` | Sustituidos por `.zone`. Muere el hack de `order:-2/-1` de la memoria y el scroll de 5699px (**R10**). |
| `.panel` como scroller | `style.css:226-231` | El scroller pasa a `.zone-body` y a `#log`. **Mata R1.** |
| `#artifacts` como contenedor único | `index.html:73` · `app.js:313-317`, `410-411` | Cada artefacto se monta en su zona. El contador pasa a un `Set`. |
| `.tagline` en el header | — | **NO se borra**, pero `h1` baja de 22px a 17px: en DARWIN el nombre del producto es más chico que las palabras del cliente. |

**NO se borra** (contra lo que proponían tres de los cuatro documentos):

- **`#summary` / `renderSummary()`** — es el único remate en una línea de toda la corrida. Se muda al riel `#ciclo`. **R6 se mata cambiando la fuente del dato, no borrando el render**: `HANDLERS.cost` guarda `costUsd` en una variable y `renderSummary` lee de ahí en vez de `$("cost").textContent`.
- **`.evo-cols` y la grilla de 8 columnas** — es lo que hace escaneable la competencia. Solo se oculta bajo 1280px, donde la fila se parte en dos renglones.
- **`ROLES` (los 13)** — se reparten en dos contenedores. `setAgent()` no se toca y ningún tally se pierde.
- **`foot(env)`** — se conserva; borrarla (como proponía `progresivo`) quita la firma de consultor que hace que el artefacto parezca entregable.

**Dos arreglos de una línea, en el mismo commit:**
```css
.ask-mini[hidden] { display: none; }   /* R2: hoy se pinta SIEMPRE, incluso en replay */
body.landing { min-width: 0; }         /* R9: la landing comparte style.css sin scoping */
```

---

## 4. CAMBIOS EN `app.js` — función por función

### Intactas, ni una línea (≈600 de 924)

`el()` · `setAgent()` (incluido el filtro `/^\\d/`) · `enqueue()` · `pump()` · `summarize()` · `foot()` · `markApproved()` · `sparkline()` · **`renderSim()`** · **`renderVerdict()`** · **`renderMemory()`** · `parentOf()` · `cop()` · `handle()` · `connectSSE()` · `replayInBrowser()` · `probeBackend()` · `pollSupabase()` · `showAsk()` / `hideAsk()` · `KIND_LABEL` · `COV_NAMES` / `COV_MARK` · `BLOCKS` / `SPARK_CEIL`.

> `renderSim` sobrevive verbatim porque escribe a `#evo-day`, `#evo-tally` y usa `row.querySelector(".roas")` — **descendiente, no hijo directo**: re-anidar los spans no lo afecta. `renderMemory` sobrevive porque `#mem-title`/`#memory` conservan sus ids (nacen sin `hidden`; la función los des-oculta igual, sin error).

### Cambian de contenedor padre (1-2 líneas cada una)

| función | línea | cambio |
|---|---|---|
| `renderCoverage()` | `222-235` | +2 líneas: `row.append(el("span","cov-note", e.note ?? ""))` además del `title`. Saca la prueba literal del tooltip (diferenciador F legible de lejos). Borra `.pending` del skeleton. |
| `ensureEvoGrid()` | `441-452` | −1 línea: fuera `document.body.dataset.evo = "on"`. Se llama desde `boot()`, no desde `HANDLERS.phase`. |
| `paint()` | `158-204` | −1/+1: `setTicker(item.line, item.kind)`. El resto (anti-ráfaga, typewriter, poda a 500) intacto. **R1 se arregla en CSS, no aquí.** |
| `setTicker()` | `206-208` | 3 líneas: `const t=$("ticker"); t.textContent = (kind==="literal"?"› ":"> ")+line; t.dataset.kind = kind||"say";` |

### Cambian de verdad

**1. `buildOrg()` → `buildRoster()`** (~14 líneas). `ROLES` gana un tercer campo con el contenedor:
```js
const ROLES = [
  ["panorama","Panorama","org"], ["miner_map","Oído · map","org"],
  ["miner_reduce","Oído · reduce","org"], ["angles","Banco de ángulos","org"],
  ["strategist","Estratega","org"], ["generator","Generador","org"],
  ["mutator","Mutación","org"], ["memory","Memoria","org"],
  ["paid","Paid","army"], ["organic","Orgánico","army"],
  ["creators","Creators","army"], ["email","Email","army"], ["blog","Blog","army"],
];
function buildRoster() {
  for (const [id, label, host] of ROLES) {
    const row = el("div", host === "army" ? "agent chrow idle" : "agent idle");
    row.append(el("span","dot"), el("span","name",label), el("span","note"));
    if (host === "army") row.dataset.ch = id;      // ancla para la barra de mix
    $(host).appendChild(row);
    nodes.set(id, row);
  }
}
```
`setAgent()` **no se toca**: opera contra el Map `nodes`.

**2. `addArtifact()` (`312-412`) se parte en tres.** El cuerpo de la tarjeta (cabecera, badges, cita, `<details>` crudo, `foot`, botón GO) se conserva casi verbatim como `artCard(env)`. Lo nuevo es el ruteo y los índices:

```js
const artIds  = new Set();          // reemplaza box.querySelectorAll(".art").length
const threads = new Map();          // angle_id → { wrap, ads }
const insights = new Map();         // insight.id → payload
const evidenceQuotes = new Set();   // TODAS las citas con respaldo real

function mountFor(env, p) {
  switch (env.kind) {
    case "brand_research":     return $("brand-art");
    case "insight":            return $("chain-insights");
    case "angle":              return threadFor(p.id).wrap;        // la cabeza del hilo
    case "ad_draft":           return threadFor(p.angle_id).ads;
    case "strategy":           return $("plan-art");
    case "content_calendar":   return chBody("organic");
    case "influencer_prospect":return chBody("creators");
    case "email_flow":         return chBody("email");
    case "blog_draft":         return chBody("blog");
    default:                   return $("plan-art");
  }
}

function addArtifact(env) {
  const p = env.payload || {};
  /* índices — los 3 de hoy + 3 nuevos */
  if (env.kind === "brand_research" && p.brand_brief) { brand = p.brand_brief; renderBrand(p); }
  if (env.kind === "angle" && p.id) { angles.set(p.id, p); evidenceQuotes.add(p.source_quote); }
  if (env.kind === "insight" && p.id) {
    insights.set(p.id, p);
    for (const ev of p.evidence || []) evidenceQuotes.add(ev.quote_redacted);
    $("ins-count").textContent = String(insights.size);
  }
  if (env.kind === "strategy") {
    if (p.testing_plan?.graduation?.roas_min) roasMin = p.testing_plan.graduation.roas_min;
    renderPlan(p); renderCiclo(p);
  }
  const card = artCard(env, p);                 // ← el cuerpo de hoy, casi verbatim
  mountFor(env, p).appendChild(card);           // append, no prepend (ver R7 abajo)
  artIds.add(env.id);
  $("art-count").textContent = String(artIds.size);
}
```

Reglas de hierro dentro de `artCard()`:
- **`card.id = \\`art-${env.id}\\`` no cambia jamás.** Es lo que mantienen vivos `evoRow().onclick:513`, `markApproved():415` y `HANDLERS.go`. Los 6 ads tienen `env.id === payload.id === sim.ad_id` — verificado.
- **El botón GO se emite para TODOS los kinds**, incluidos `brand_research` y `strategy` (el juez de `progresivo` detectó que el `return` temprano de esa propuesta los dejaba sin GO: invariante #3/#6 roto). `renderBrand()` y `renderPlan()` pintan la vista *bonita*; la tarjeta con su GO se monta igual en `#brand-art` / `#plan-art`.

**3. NUEVA `threadFor(angleId)`** (~22 líneas) — el hilo, que resuelve A:
```js
function threadFor(id) {
  let t = threads.get(id);
  if (t) return t;
  $("chain").querySelectorAll(".skel-thread").forEach(n => n.remove());
  $("chain-promise").hidden = true;
  const wrap = el("section", "thread");
  wrap.id = `th-${id}`;
  const ads = el("div", "thread-ads");
  wrap.appendChild(ads);
  $("chain").appendChild(wrap);
  t = { wrap, ads };
  threads.set(id, t);
  return t;
}
```
- La tarjeta del **ángulo** se monta en `wrap` (queda arriba de `.thread-ads` por orden de llegada: los 6 ángulos llegan antes que los 6 ads — verificado en el fixture).
- **0..N ads por hilo funcionan solos.** `regalo_a_tiempo` recibe 2, `hecho_aqui` recibe 0 → CSS: `.thread-ads:empty::before { content: "sin ad en esta ronda · el mix dio 6 ad sets" }`.
- **El chip de frecuencia solo se pinta si resuelve.** En `artCard`, para `angle`: `const ins = insights.get((p.insight_ids||[])[0])` → si existe, `×23 conversaciones · prioridad 5/5`; si no (3 de 6 ángulos del fixture), **se omite. Nunca se inventa un número.**

**4. Verificación de cita en la tarjeta de ad** (~10 líneas, dentro de `artCard`) — el arreglo del falso positivo:
```js
const q  = env.source_quote || p.source_quote;
const aq = angles.get(p.angle_id)?.source_quote;
if (env.kind === "ad_draft" && q && aq && q !== aq) {
  card.appendChild(el("blockquote", "quote", `“${q}”`));          // 19px, la SUYA
  card.appendChild(el("div",
    evidenceQuotes.has(q) ? "ev-note" : "ev-note bad",
    evidenceQuotes.has(q) ? "otra cita del mismo insight"
                          : "⚠ cita sin respaldo en la evidencia"));
} else if (env.kind === "ad_draft") {
  card.appendChild(el("div", "ev-inherit", "↳ nace de la cita de arriba"));
}
```
Con el fixture real: `ad_regalo_static` cae en la primera rama y sale en verde ("otra cita del mismo insight"), **no en ámbar**. La rama ámbar solo dispara si un ad trae una cita que no está en ninguna `evidence[]` ni en ningún ángulo — que es exactamente lo que `angles.ts`/`army.ts` impiden. La UI *puede* mostrar el fallo; eso es la prueba de que no se maquilla.

**5. `evoRow()` (`474-523`)** — +4 líneas, el mayor retorno por línea del rediseño:
```js
const MUT = { h: "mutó el hook", f: "mutó el formato" };
if (parent) {
  name.appendChild(el("span", "lineage", "└─ "));
  name.appendChild(el("span", "mut", MUT[id.slice(-1)] ?? "mutó"));
}
```
Hoy los 2 hijos aparecen como dos filas nuevas sin explicación, y **no tienen tarjeta en ninguna parte** (solo se emiten 6 `ad_draft`, el sim trae 8 ads). Con esto, "aparecieron dos filas" se convierte en "se reprodujo, y aquí está qué mutó cada hijo". El resto de `evoRow` (los 8 spans, el orden, las clases, la inserción por adyacencia) **no se toca**.

**6. `HANDLERS`** — 4 líneas menos:
```js
phase: (e) => {
  if (e.name === "replay") { …idéntico… return; }
  $("phase").textContent = e.detail ? `${e.name} · ${e.detail}` : e.name;
  enqueue("darwin", `— ${e.name}${e.detail ? " · " + e.detail : ""} —`, "phase");
},                                        // fuera setStage y setPhase
cost: (e) => { costUsd = e.total_usd; $("cost").textContent = `$${costUsd.toFixed(2)}`; },
done: () => { $("phase").textContent = "listo"; renderSummary(); },
```

**7. Nuevas** (~90 líneas en total):
- `renderBrand(p)` (~24): nombre a 17px accent, `vertical · audience`, tono, y `formats_ranked` → fila por formato con `signal` + badge de `evidence` (`own_metrics` verde / `category_benchmark` ámbar / `visible_content` dim). Es lo que hace que la **fase 1 se vea llena** — el defecto que el juez de `evidencia` marcó como bloqueante.
- `renderPlan(p)` (~26): por cada `channel_mix[]`, escribe `row.style.setProperty("--share", pct)` en la fila de canal que `buildRoster` ya creó con `data-ch`, más el `%`. Un canal ausente del mix o con 0% recibe `.off` y la nota `el estratega no lo activó` — diferenciador D, sin gastar una columna. Además llena `#pt-budget/#pt-lane/#pt-grad` y las 3 `kill_rules` en `#pt-kills`. Esconde `#plan-note`.
- `renderCiclo(p)` (~14): `memory_applied`. `applied.length ? "corrida 2" : "corrida 1"` + el texto de aprendizajes aplicados.
- `renderSummary()` (`583-597`): 1 línea cambiada — `costUsd.toFixed(2)` en vez de `$("cost").textContent`. **Mata R6.**
- `boot()`: `buildRoster()` + `ensureEvoGrid()`, fuera `buildStepper()`.
- El onclick del ticker: `$("ticker").onclick = () => { const b=document.body; b.dataset.log = b.dataset.log==="open"?"":"open"; if(b.dataset.log) $("log").scrollTop = $("log").scrollHeight; }` + `Esc` cierra.

**Total: ~135 líneas nuevas o cambiadas sobre 924. La capa de transporte y despacho (SSE, replay, Supabase, `handle`) no se toca en absoluto** — cero riesgo de regresión en las 3 fuentes.

---

## 5. CSS NUEVO — dentro de las 8 variables

```css
/* ── header y ticker ── */
h1 { font-size: 17px; }               /* la cita tiene que ganarle al logo */
#tickbar {
  flex: none; height: 32px; display: flex; align-items: center; gap: 12px;
  padding: 0 20px; border-bottom: 1px solid var(--line); background: var(--panel);
}
#ticker {
  flex: 1; min-width: 0; background: none; border: 0; padding: 0; cursor: pointer;
  font: 14.5px/1 var(--mono); color: var(--accent); text-align: left;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#ticker[data-kind="literal"] { color: var(--warn); }   /* el anti-alucinación, en una línea */
.tick-hint { flex: none; font-size: 12px; color: var(--dim); }

/* ── el cajón: overlay, NO zona de la rejilla ── */
#logdrawer {
  position: fixed; left: 0; right: 0; bottom: 0; height: 46vh; z-index: 40;
  background: var(--panel); border-top: 1px solid var(--line);
  transform: translateY(101%); transition: transform .28s ease;
}
body[data-log="open"] #logdrawer { transform: none; }
/* R1: ESTE es el arreglo. paint() (app.js:160,177) mide y escribe sobre #log;
   hoy #log no scrollea y el guard wasBottom siempre da true. */
#log { height: 100%; overflow-y: auto; min-height: 0; padding: 16px 20px;
       font-size: 15px; line-height: 1.6; }

/* ── el hilo: la cadena A ── */
.thread { border-left: 2px solid var(--line); padding: 0 0 2px 12px; margin-bottom: 18px; }
.thread:hover { border-left-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
.thread-ads { padding-left: 14px; border-left: 1px dashed var(--line); margin-top: 6px; }
.thread-ads:empty::before {
  content: "sin ad en esta ronda · el mix dio 6 ad sets";
  display: block; font-size: 12.5px; color: var(--dim); padding: 6px 0;
}
.thread .art { border: 0; padding: 6px 0; }
.art[data-kind="angle"] .quote { font-size: 19px; }   /* el texto más grande de la pantalla */
.ev-note    { font-size: 12.5px; color: var(--accent); opacity: .8; margin-top: 4px; }
.ev-note.bad{ color: var(--warn); opacity: 1; }
.ev-inherit { font-size: 12.5px; color: var(--dim); margin: 2px 0 6px; }
.freq-chip  { font-size: 12.5px; color: var(--text); opacity: .7; }

/* ── el plan: la barra ES la fila, no un elemento aparte ── */
.agent.chrow {
  --share: 0;
  position: relative; padding: 7px 8px; margin-bottom: 2px;
  background: linear-gradient(to right,
    color-mix(in srgb, var(--accent) 16%, transparent) calc(var(--share) * 1%),
    transparent calc(var(--share) * 1%));
}
.agent.chrow .pct { margin-left: auto; font-size: 12.5px; color: var(--text); opacity: .75; }
.agent.chrow.off { opacity: .42; }
.agent.chrow.off .note::after { content: "el estratega no lo activó"; color: var(--dim); }
.kv > div { display: flex; justify-content: space-between; font-size: 12.5px; padding: 3px 0; }
.kv span  { color: var(--dim); }

/* ── el riel de retorno: el bucle, dibujado ── */
#z-ciclo {
  grid-area: ciclo; display: flex; align-items: center; gap: 12px;
  padding: 0 20px; background: var(--panel); font-size: 12.5px; color: var(--dim);
}
.ciclo-back  { color: var(--accent); font-size: 17px; line-height: 1; }
.ciclo-rail  { flex: 1; border-top: 1px dashed color-mix(in srgb, var(--accent) 35%, var(--line)); }
#ciclo-run   { color: var(--text); letter-spacing: .12em; text-transform: uppercase; }
#ciclo-applied { color: var(--accent); }
#ciclo-applied:empty::before {
  content: "sin memoria previa · esta corrida la escribe"; color: var(--dim);
}

/* ── promesas (el skeleton que dice qué forma tendrá la respuesta) ── */
.promise-copy { font-size: 12.5px; line-height: 1.55; color: var(--text);
                opacity: .55; margin: 10px 0; max-width: 62ch; }
.skel-block { height: 46px; border-radius: 3px; animation: skel 1.4s infinite; }
.skel-thread { display: flex; flex-direction: column; gap: 6px; opacity: .35; }
.skel-thread .q { height: 20px; width: 78% } .skel-thread .h { height: 15px; width: 52% }
.skel-thread .a { height: 34px; width: 88% }
.cov.pending .mark { color: var(--dim); }

/* ── proyector: nada cargado de significado bajo 12.5px (style.css:2) ── */
.evorow .rule { font-size: 12.5px; opacity: .68; }
.evo-label    { font-size: 12.5px; }
.evo-cols     { font-size: 11px; }        /* rótulos de columna, no significado */
.ml           { font-size: 12.5px; }
h3 { margin: 16px 0 6px; font-size: 11px; letter-spacing: .18em;
     text-transform: uppercase; color: var(--dim); font-weight: 400; }
.h2sub { text-transform: none; letter-spacing: 0; opacity: .7; }

/* ── colisiones que hay que cerrar en el mismo commit ── */
.ask-mini[hidden] { display: none; }   /* R2 */
body.landing      { min-width: 0; }    /* R9 */
.art .foot        { line-height: 1.45; }  /* fuga del .foot de la landing (css:931) */
.badge.sev-lo     { color: var(--dim); border-color: var(--line); }  /* el GAP del inventario */
```

---

## 6. EL ESTADO SKELETON (t=0, cero eventos)

| zona | qué se ve, sin un solo dato |
|---|---|
| header | `DARWIN` · `el marketing evoluciona solo` · `esperando` `0` `$0.000` `sin conexión` |
| tickbar | `> esperando la primera señal` · `narración ⌄` |
| ① fuente | `① LA FUENTE` · bloque skeleton de marca · `FORMATOS QUE RINDEN` skeleton · **`COBERTURA` con las 6 fuentes ya escritas en gris** (COV_NAMES es constante: no hay excusa para "sin corrida") · `EL PIPELINE` con los 8 roles nombrados y punto idle |
| ② cadena | `② LA CADENA · lo que dijo tu clienta → el ad que salió de ahí` · el párrafo de promesa de la cita · **3 hilos fantasma con las flechas `↓` ya dibujadas** (barra de 20px = la cita, barra de 15px = el hook, barra de 34px = el ad) |
| ③ plan | `③ EL PLAN · solo corren los canales que el mix activó` · **los 5 canales ya nombrados** con barra en 0 y `—%` · `PLAN DE TESTING` con sus 4 etiquetas y valores `—` · `▸ 3 reglas de muerte` plegado · la nota *"el mix lo decide el Estratega"* |
| ④ arena | `④ SELECCIÓN NATURAL` · **el rótulo del invariante #7, estático** · `día —/7` · `—` · la cabecera de 8 columnas · **6 carriles punteados** · el párrafo de la reproducción |
| ⑤ memoria | `⑤ LA MEMORIA` · el párrafo *"la próxima corrida arranca leyendo esto"* |
| ⑥ ciclo | `↰ CORRIDA 1 ─────── sin memoria previa · esta corrida la escribe` |
| cajón | cerrado |

El skeleton **no dice "cargando": dice qué forma va a tener la respuesta.** Los 6 títulos numerados + los 5 nombres de canal + los 6 nombres de fuente + los 3 hilos fantasma están escritos antes del primer evento. El único que pulsa es `.skel` de los tallies — promesa de inventario, no spinner (`app.js:88`).

---

## 7. ORDEN DE EJECUCIÓN Y LÍNEA DE CORTE

Todo se valida contra `runs/demo/events.ndjson` (versionado) abriendo `public/index.html?speed=4`, sin gastar un token.

| # | paso | tiempo | criterios que gana |
|---|---|---|---|
| **0** | **Resembrar el fixture.** `demo/generate.ts:562` → `memory_applied: ["problem_solution × reel: la corrida anterior lo graduó a 3.7x", "no volver a gastar la primera ronda en static", "ugc_video sostiene sin escalar: mantener presupuesto plano"]` (consistente con `runs/memory/dosmicos.json`, que ya trae `runs: 2` y verdicts reales, y con el markdown que ya dice *"static muere en las dos corridas"*). `npm run gen` — el assert de `generate.ts:833` solo mira killed/graduated/children, no se toca. | **15 min** | **3-C y 4.** Sin esto el riel de retorno sale en blanco en escenario y el bucle es una frase con una flecha. Los cuatro jueces lo pidieron. |
| **1** | Rejilla + 6 zonas + `.zone-head/.zone-body` + el HTML skeleton estático completo + los 3 arreglos de una línea (R1, R2, R9). Sin tocar `app.js` salvo borrar `setStage`/`buildStepper`/`setPhase` y las 4 líneas de `HANDLERS`. | **70 min** | **1, 5, 7.** Mata R1, R2, R3, R4, R9, R10, R11. |
| **2** | `buildRoster()` + el cajón del terminal + `setTicker(line,kind)` + `renderSummary` leyendo `costUsd` (R6). | **30 min** | **2.** El proceso pasa de 48% de la pantalla a una línea de 32px. |
| **3** | `evoRow()` + la etiqueta de mutación + el breakpoint de 1280 de `.evorow`. `renderSim`/`renderVerdict` sin tocar. | **25 min** | **3-B.** El nombre del proyecto, visible por primera vez. |
| **4** | `renderCiclo()` + la banda de memoria. | **20 min** | **3-C, 4.** |
| **5** | `renderBrand()` + formatos con badge de evidencia + nota inline de cobertura. | **40 min** | **5.** Es lo que hace que la fase 1 entregue un resultado, no una promesa. |
| **6** | `renderPlan()` + barras de mix + plan de testing + kill rules. | **35 min** | **D, E.** |
| **7** | `mountFor()` + `threadFor()` + la verificación de cita. | **55 min** | **3-A.** |
| | **total** | **≈4h50** | |

### LÍNEA DE CORTE — qué se sacrifica primero

1. **El paso 7 (los hilos).** Es el más riesgoso y el peor apalancado contra el fixture real: 3 de 6 hilos no pueden mostrar su chip de frecuencia y uno no tiene ads. **El fallback está a 3 líneas de distancia:** `mountFor()` devuelve `$("chain")` para `insight|angle|ad_draft` y las tarjetas quedan planas, en orden insight→ángulo→ad. Se pierde la agrupación; **no se pierde la cita**, que sigue siendo el elemento más grande de la pantalla y sigue pegada a su ad. Y un `card.dataset.family = p.angle_id` con un borde izquierdo de color por familia da el 70% del efecto por el 10% del riesgo.
2. **El paso 6** → el plan queda en el `<details>` de la tarjeta de estrategia; las 5 filas de canal quedan solo con nombre + tally (que `setAgent` ya escribe gratis).
3. **La verificación de cita** (el bloque `.ev-note`) → el ad pinta su propia cita y ya.
4. **Los badges de evidencia por formato** en `renderBrand`.

**Nunca se cae, en ningún escenario:** la rejilla de 6 zonas, la arena de ancho completo presente desde t=0, la banda de memoria, el riel `↰` con `memory_applied` no vacío, la cita a 19px, y los arreglos de R1/R2.

---

## 8. RIESGOS Y MITIGACIÓN

**R-A · Cambiar el id de la tarjeta rompe 3 contratos en silencio.** `env.id === payload.id === sim.ad_id` para los 6 ads. Si una tarjeta pasa a `art-<angle_id>`, `evoRow().onclick:513`, `markApproved():415` y `HANDLERS.go` fallan por el guard `if (!card) return` — sin error en consola, y **el botón GO nunca pasa a "aprobado" contra backend real** (invariante #3 degradado de hecho). *Mitigación:* `card.id = \\`art-${env.id}\\`` es inmutable; el hilo es un wrapper con id propio `th-<angle_id>`. Verificar en el replay que un clic en `ad_noche_reel` de la arena hace scroll+flash a su tarjeta.

**R-B · `#evo-grid` debe seguir siendo un contenedor plano de hermanos `.evorow`.** `evoRow:504` hace `after.nextSibling.classList.contains("child")` **sin guard**. Cualquier wrapper, `order`, `flex-wrap` o multicolumna rompe el linaje padre→hijo sin error visible: los 2 hijos aparecen sueltos al final. *Mitigación:* el anidamiento del rediseño ocurre en `#chain`, nunca en `#evo-grid`. Y añadir `?.` en `after.nextSibling?.classList` — 1 carácter, elimina el `TypeError` latente si algún día entra un nodo de texto.

**R-C · Borrar `#stepper` sin borrar `HANDLERS.phase:611`.** `setPhase` lanza `ReferenceError: PHASES is not defined`, `handle()` lo traga con su `try/catch:637`, y el pill de fase + las 8 separaciones del terminal desaparecen **en silencio** en los 8 eventos `phase`. Es el bug de las 3am. *Mitigación:* borrar `buildStepper`, `setPhase`, `PHASES`, `steps` y la línea 611 **en el mismo edit**, y verificar con el replay que el pill recorre las 8 fases.

**R-D · La landing comparte `style.css` sin scoping.** `body.landing main` (`css:789`) deshace `display:grid` y `grid-template-*`, pero no un `min-width` del body. *Mitigación:* `body:not(.landing)` en el selector de `main` + `body.landing{min-width:0}`, y **abrir `landing.html` en el mismo commit** antes de dar el paso por cerrado.

**R-E · El `#ask` empuja los hilos justo en el momento más mirado.** En la ruta Supabase, `#ask` ocupa ~150px arriba de la cadena y desaparece al arrancar la fase 2. *Mitigación:* al plegarse a `#ask-mini` (35px) la diferencia es de una tarjeta; los hilos ya tienen scroll propio y no reordenan. No hay cambio de forma de la rejilla, solo de contenido dentro de un cuerpo con scroll.

**R-F · El número de hilos no está acotado.** El skeleton asume ~6, pero `miner.ts` podría emitir más ángulos en una corrida real. *Mitigación:* `.zone-body` tiene scroll propio; el `<details>` de insights está plegado; ningún cap CSS (el `nth-of-type(n+4)` se borra). Nunca escribir un total en la cabecera que no se pueda contar en tarjetas — el encabezado de la cadena dice `② la cadena`, no `18 insights → 9 ángulos`.

**R-G · `append` en vez de `prepend` invierte el orden.** Hoy `addArtifact:331` hace `prepend` (más nuevo arriba) y el cap CSS `nth-of-type(n+4)` depende de eso. *Mitigación:* el cap se borra en el paso 1; la cadena usa `append` a propósito (orden narrativo: los ángulos llegan por prioridad de evidencia, el primero es el que gradúa). Verificar que `noche_completa` queda arriba en el replay.

**R-H · Envoltura de la fila de canal.** `orgánico ██████ 25% 10 piezas` son ~37 chars; a 13px mono en 340px−28 de padding = 312px caben ~40. Va justo. *Mitigación:* la barra **es el fondo de la fila** (`linear-gradient` con `--share`), no un elemento que ocupe ancho. El texto es solo `nombre · % · tally`. Y las `kill_rules` reales miden 68, **86** y 52 caracteres (los mocks de las propuestas inventaban versiones de 25) — por eso van en un `<details>` con `white-space: normal`, no en una línea.

---

**Dos cosas que este plan hace y ninguna de las cuatro propuestas hacía:** el paso 0 (resembrar `memory_applied`, sin lo cual el diferenciador C sale en blanco en el escenario) y mantener la arena de ancho completo (sin lo cual el diferenciador B — el nombre del proyecto — sale **peor** que hoy, que fue el hallazgo medido de dos jueces independientes).",
  "workflowProgress": [
    {
      "type": "workflow_phase",
      "index": 1,
      "title": "Leer"
    },
    {
      "type": "workflow_phase",
      "index": 2,
      "title": "Diseñar"
    },
    {
      "type": "workflow_phase",
      "index": 3,
      "title": "Juzgar"
    },
    {
      "type": "workflow_phase",
      "index": 4,
      "title": "Sintetizar"
    },
    {
      "type": "workflow_agent",
      "index": 1,
      "label": "Lee el frontend de DARWIN en /Users/juliancastro/Code/Darwin",
      "phaseIndex": 1,
      "phaseTitle": "Leer",
      "agentId": "a043ba2d3ce5c685d",
      "model": "claude-opus-5",
      "state": "done",
      "startedAt": 1784950235236,
      "queuedAt": 1784950230907,
      "attempt": 1,
      "lastToolName": "StructuredOutput",
      "promptPreview": "Lee el frontend de DARWIN en /Users/juliancastro/Code/Darwin/public/ (index.html, app.js,
style.css) y haz un inventario PRECISO para un rediseño de layout.


ESTADO ACTUAL DE DARWIN (repo en /Users/juliancastro/Code/Darwin).

FRONTEND: public/index.html, public/app.js (~900 lineas), public/style.css (~1060 lineas),
public/landing.html, public/landing.js. Vanilla, SIN bundler, SIN CDN, SIN webfont…",
      "lastProgressAt": 1784950732928,
      "tokens": 97886,
      "toolCalls": 30,
      "durationMs": 497692,
      "resultPreview": "{"contenedores":[{"id":"body[data-stage] / body[data-evo]","lineas":"/Users/juliancastro/Code/Darwin/public/index.html:9","llenadoPor":"setStage() app.js:125-127 — invocado en app.js:611 ('run'), app.js:629 ('review') y app.js:924 (click del ticker → 'run'). data-evo lo pone ensureEvoGrid() app.js:444 y NUNCA se apaga. Son los 2 unicos interruptores de layout que maneja el JS."},{"id":"#ticker","l…"
    },
    {
      "type": "workflow_agent",
      "index": 2,
      "label": "diseño:fiel",
      "phaseIndex": 2,
      "phaseTitle": "Diseñar",
      "agentId": "aa33eb3b9b0abf40c",
      "model": "claude-opus-5",
      "state": "done",
      "startedAt": 1784950738069,
      "queuedAt": 1784950734970,
      "attempt": 1,
      "lastToolName": "Bash",
      "lastToolSummary": "python3 - <<'EOF' import json p='runs/demo/events.ndjson' n…",
      "promptPreview": "Diseña el nuevo layout del war room de DARWIN.


OBSERVACIONES DE OKARA (okara.ai), tomadas en vivo hoy. Son la referencia a copiar.

FLUJO DE ENTRADA
- Landing: headline + subtitulo + UN input tipo pill con el boton DENTRO ("www.website.com" | "Get Started ->").
- Microcopy debajo: "Free to start · No credit card required".
- Al escribir el dominio aparece el FAVICON del sitio dentro del input (f…",
      "lastProgressAt": 1784951221425,
      "tokens": 90715,
      "toolCalls": 9,
      "durationMs": 483355,
      "resultPreview": "## Tesis del rediseño

Okara pone el proceso en una línea y le da toda la pantalla al resultado. DARWIN copia esa proporción **pero cambia la cuarta columna**: donde Okara pone un chat abierto, DARWIN pone lo que Okara no tiene — la competencia y la memoria. Las 4 columnas se leen como una frase de izquierda a derecha:

**quién es la marca → qué dijeron sus clientes → quién ejecuta → quién sobrevi…"
    },
    {
      "type": "workflow_agent",
      "index": 3,
      "label": "diseño:evidencia",
      "phaseIndex": 2,
      "phaseTitle": "Diseñar",
      "agentId": "aee1d1ccd8b4125ef",
      "model": "claude-opus-5",
      "state": "done",
      "startedAt": 1784950738959,
      "queuedAt": 1784950734971,
      "attempt": 1,
      "lastToolName": "Bash",
      "lastToolSummary": "rm -rf /Users/juliancastro/Code/Darwin/.scratch && ls /priv…",
      "promptPreview": "Diseña el nuevo layout del war room de DARWIN.


OBSERVACIONES DE OKARA (okara.ai), tomadas en vivo hoy. Son la referencia a copiar.

FLUJO DE ENTRADA
- Landing: headline + subtitulo + UN input tipo pill con el boton DENTRO ("www.website.com" | "Get Started ->").
- Microcopy debajo: "Free to start · No credit card required".
- Al escribir el dominio aparece el FAVICON del sitio dentro del input (f…",
      "lastProgressAt": 1784951719743,
      "tokens": 158573,
      "toolCalls": 50,
      "durationMs": 980784,
      "resultPreview": "# LA CADENA — rediseño del war room de DARWIN

Prototipos ejecutables y medidos en navegador (abrir con `file://`, cero dependencias):
- `/private/tmp/claude-501/-Users-juliancastro-Code-Darwin/c157f2a5-ac7f-44c5-b88a-ae212b6c435c/scratchpad/warroom-v2.html` — fase 2 completa, datos reales del fixture
- `/private/tmp/claude-501/-Users-juliancastro-Code-Darwin/c157f2a5-ac7f-44c5-b88a-ae212b6c435c/s…"
    },
    {
      "type": "workflow_agent",
      "index": 4,
      "label": "diseño:bucle",
      "phaseIndex": 2,
      "phaseTitle": "Diseñar",
      "agentId": "ac1da5ecd3668418c",
      "model": "claude-opus-5",
      "state": "done",
      "startedAt": 1784950740535,
      "queuedAt": 1784950734971,
      "attempt": 1,
      "lastToolName": "Bash",
      "lastToolSummary": "python3 -c " import json for l in open('runs/demo/events.nd…",
      "promptPreview": "Diseña el nuevo layout del war room de DARWIN.


OBSERVACIONES DE OKARA (okara.ai), tomadas en vivo hoy. Son la referencia a copiar.

FLUJO DE ENTRADA
- Landing: headline + subtitulo + UN input tipo pill con el boton DENTRO ("www.website.com" | "Get Started ->").
- Microcopy debajo: "Free to start · No credit card required".
- Al escribir el dominio aparece el FAVICON del sitio dentro del input (f…",
      "lastProgressAt": 1784951222491,
      "tokens": 92775,
      "toolCalls": 10,
      "durationMs": 481956,
      "resultPreview": "# EL ANILLO — rediseño del war room de DARWIN

## 0. La tesis en una frase

Okara pone 4 columnas porque 4 cabe. DARWIN pone 4 columnas porque el bucle tiene 4 estaciones y una vía de retorno. La pantalla se lee de izquierda a derecha como el proceso, y una franja inferior de 44px devuelve el ojo al punto de partida. **La rejilla no cambia jamás** — no hay `data-stage` que la reescriba, no hay fil…"
    },
    {
      "type": "workflow_agent",
      "index": 5,
      "label": "diseño:progresivo",
      "phaseIndex": 2,
      "phaseTitle": "Diseñar",
      "agentId": "a6de15b9dda98c3e4",
      "model": "claude-opus-5",
      "state": "done",
      "startedAt": 1784950741963,
      "queuedAt": 1784950734971,
      "attempt": 1,
      "lastToolName": "Bash",
      "lastToolSummary": "python3 -c " import json sim_ids=set() for l in open('runs/…",
      "promptPreview": "Diseña el nuevo layout del war room de DARWIN.


OBSERVACIONES DE OKARA (okara.ai), tomadas en vivo hoy. Son la referencia a copiar.

FLUJO DE ENTRADA
- Landing: headline + subtitulo + UN input tipo pill con el boton DENTRO ("www.website.com" | "Get Started ->").
- Microcopy debajo: "Free to start · No credit card required".
- Al escribir el dominio aparece el FAVICON del sitio dentro del input (f…",
      "lastProgressAt": 1784951430010,
      "tokens": 113823,
      "toolCalls": 10,
      "durationMs": 688047,
      "resultPreview": "# Rediseño del war room de DARWIN — **la pantalla es el bucle**

## 0. La decisión de fondo

Okara es una línea recta y por eso le sirve un dashboard de 4 columnas paralelas. DARWIN es un circuito, así que la rejilla tiene que **dibujar el circuito**: se recorre de izquierda a derecha por arriba (entrada → cadena → arena), baja por la derecha y **vuelve hacia la izquierda por una banda inferior qu…"
    },
    {
      "type": "workflow_agent",
      "index": 6,
      "label": "juez:fiel",
      "phaseIndex": 3,
      "phaseTitle": "Juzgar",
      "agentId": "af860d8ff6f8323dc",
      "model": "claude-opus-5",
      "state": "done",
      "startedAt": 1784951729185,
      "queuedAt": 1784951722023,
      "attempt": 1,
      "lastToolName": "Bash",
      "lastToolSummary": "ls src/ src/pipeline 2>&1; echo "--- memory/army ---"; ls s…",
      "promptPreview": "Eres un juez severo. Evalua esta propuesta de rediseño para DARWIN.


OBSERVACIONES DE OKARA (okara.ai), tomadas en vivo hoy. Son la referencia a copiar.

FLUJO DE ENTRADA
- Landing: headline + subtitulo + UN input tipo pill con el boton DENTRO ("www.website.com" | "Get Started ->").
- Microcopy debajo: "Free to start · No credit card required".
- Al escribir el dominio aparece el FAVICON del siti…",
      "lastProgressAt": 1784952041303,
      "tokens": 99254,
      "toolCalls": 11,
      "durationMs": 312118,
      "resultPreview": "Verified everything against the code and the actual fixture. Here's the judgment.

---

# Veredicto: buena diagnosis, propuesta sobredimensionada, y B sale peor que hoy

Primero, una corrección de premisa a mi favor y del autor: **`CLAUDE.md` está desactualizado.** `src/pipeline/{run,panorama,miner,angles,strategist}.ts`, `src/army.ts` y `src/memory/store.ts` **ya existen**. Iba a matar la propues…"
    },
    {
      "type": "workflow_agent",
      "index": 7,
      "label": "juez:evidencia",
      "phaseIndex": 3,
      "phaseTitle": "Juzgar",
      "agentId": "a3881750955fa9f77",
      "model": "claude-opus-5",
      "state": "done",
      "startedAt": 1784951725384,
      "queuedAt": 1784951722024,
      "attempt": 1,
      "lastToolName": "Bash",
      "lastToolSummary": "pkill -f "http.server 8791" 2>/dev/null; echo ok",
      "promptPreview": "Eres un juez severo. Evalua esta propuesta de rediseño para DARWIN.


OBSERVACIONES DE OKARA (okara.ai), tomadas en vivo hoy. Son la referencia a copiar.

FLUJO DE ENTRADA
- Landing: headline + subtitulo + UN input tipo pill con el boton DENTRO ("www.website.com" | "Get Started ->").
- Microcopy debajo: "Free to start · No credit card required".
- Al escribir el dominio aparece el FAVICON del siti…",
      "lastProgressAt": 1784952224362,
      "tokens": 109231,
      "toolCalls": 39,
      "durationMs": 498977,
      "resultPreview": "# VEREDICTO: APROBADA CON RECORTES OBLIGATORIOS — pero no como está escrita, y probablemente no hoy

Medí los dos prototipos en navegador real (1440×900 y 1024×768) y crucé cada afirmación contra `public/app.js`, `public/style.css` y `runs/demo/events.ndjson`. La tesis es correcta y la mayoría de los números que declara son ciertos. Los problemas están en lo que **no** declara.

---

## Lo que ver…"
    },
    {
      "type": "workflow_agent",
      "index": 8,
      "label": "juez:bucle",
      "phaseIndex": 3,
      "phaseTitle": "Juzgar",
      "agentId": "af34eaec6713331c1",
      "model": "claude-opus-5",
      "state": "done",
      "startedAt": 1784951726140,
      "queuedAt": 1784951722024,
      "attempt": 1,
      "lastToolName": "Bash",
      "lastToolSummary": "python3 -c " import json arts=[] for l in open('runs/demo/e…",
      "promptPreview": "Eres un juez severo. Evalua esta propuesta de rediseño para DARWIN.


OBSERVACIONES DE OKARA (okara.ai), tomadas en vivo hoy. Son la referencia a copiar.

FLUJO DE ENTRADA
- Landing: headline + subtitulo + UN input tipo pill con el boton DENTRO ("www.website.com" | "Get Started ->").
- Microcopy debajo: "Free to start · No credit card required".
- Al escribir el dominio aparece el FAVICON del siti…",
      "lastProgressAt": 1784952021442,
      "tokens": 93981,
      "toolCalls": 9,
      "durationMs": 295302,
      "resultPreview": "He verificado la propuesta contra el código y contra el fixture oficial, no contra su propia narrativa. Resumen: la mitad estructural es buena, pero **el diferenciador C — la tesis entera — queda vacío en pantalla**, y hay tres defectos verificables que el documento no ve.

---

# VEREDICTO: aprobar pasos 1–5, rechazar el paso 6 como está escrito, y arreglar C antes de tocar nada

## Lo que está v…"
    },
    {
      "type": "workflow_agent",
      "index": 9,
      "label": "juez:progresivo",
      "phaseIndex": 3,
      "phaseTitle": "Juzgar",
      "agentId": "a4c1c4668137f4abf",
      "model": "claude-opus-5",
      "state": "done",
      "startedAt": 1784951727836,
      "queuedAt": 1784951722024,
      "attempt": 1,
      "lastToolName": "Bash",
      "lastToolSummary": "python3 -c " import json for l in open('runs/demo/events.nd…",
      "promptPreview": "Eres un juez severo. Evalua esta propuesta de rediseño para DARWIN.


OBSERVACIONES DE OKARA (okara.ai), tomadas en vivo hoy. Son la referencia a copiar.

FLUJO DE ENTRADA
- Landing: headline + subtitulo + UN input tipo pill con el boton DENTRO ("www.website.com" | "Get Started ->").
- Microcopy debajo: "Free to start · No credit card required".
- Al escribir el dominio aparece el FAVICON del siti…",
      "lastProgressAt": 1784952073162,
      "tokens": 97794,
      "toolCalls": 12,
      "durationMs": 345326,
      "resultPreview": "## Veredicto ejecutivo

**Adoptar con 4 enmiendas obligatorias. No es un rediseño malo — es un buen diagnóstico con una ejecución desigual.** El diagnóstico (el terminal se come el 48% de la pantalla, evolución y memoria son invisibles) es correcto y la solución estructural (matar `data-stage="review"`, terminal a overlay) es la jugada acertada. Pero rompe un invariante, tiene un bug de CSS medibl…"
    },
    {
      "type": "workflow_agent",
      "index": 10,
      "label": "Sintetiza el diseño FINAL del war room de DARWIN a partir de",
      "phaseIndex": 4,
      "phaseTitle": "Sintetizar",
      "agentId": "a3f806f4b9330ebe9",
      "model": "claude-opus-5",
      "state": "done",
      "startedAt": 1784952231210,
      "queuedAt": 1784952226759,
      "attempt": 1,
      "lastToolName": "Bash",
      "lastToolSummary": "tail -40 demo/generate.ts && echo "=== 1100-1062 css tail =…",
      "promptPreview": "Sintetiza el diseño FINAL del war room de DARWIN a partir de tres propuestas y sus juicios.


OBSERVACIONES DE OKARA (okara.ai), tomadas en vivo hoy. Son la referencia a copiar.

FLUJO DE ENTRADA
- Landing: headline + subtitulo + UN input tipo pill con el boton DENTRO ("www.website.com" | "Get Started ->").
- Microcopy debajo: "Free to start · No credit card required".
- Al escribir el dominio apa…",
      "lastProgressAt": 1784952704205,
      "tokens": 148876,
      "toolCalls": 18,
      "durationMs": 472995,
      "resultPreview": "Verifiqué cada afirmación disputada contra el código y el fixture. Aquí está el plan final.

---

# WAR ROOM v2 — "EL CIRCUITO". Plan de implementación

**Base estructural:** la de `progresivo` (columnas arriba + bandas abajo, layout único, `#ask` en la columna central), **corregida con el hallazgo que compartieron los jueces de `fiel` y `progresivo`: la evolución no puede vivir en una columna ang…"
    }
  ],
  "totalTokens": 1102908,
  "totalToolCalls": 198
}