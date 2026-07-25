// War room. Vanilla, cero dependencias, cero CDN — el wifi del venue no es de fiar.
//
// Regla de oro de este archivo: TODO texto que venga del servidor entra por
// textContent, nunca por innerHTML. `payload` es z.unknown() y las citas son
// texto de clientas: una comilla mal puesta no puede tumbar el demo en escenario.

const $ = (id) => document.getElementById(id);

/** Crea un nodo con clase y texto. Es el único constructor que usamos. */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

const ROLES = [
  ["panorama", "Panorama"],
  ["miner_map", "Oído · map"],
  ["miner_reduce", "Oído · reduce"],
  ["angles", "Banco de ángulos"],
  ["strategist", "Estratega"],
  ["paid", "Paid"],
  ["organic", "Orgánico"],
  ["creators", "Creators"],
  ["email", "Email"],
  ["blog", "Blog"],
  ["generator", "Generador"],
  ["mutator", "Mutación"],
  ["memory", "Memoria"],
];

const PHASES = [
  ["ingesta", "ingesta"],
  ["panorama", "panorama"],
  ["oido", "oído"],
  ["angulos", "ángulos"],
  ["estrategia", "estrategia"],
  ["ejercito", "ejército"],
  ["evolution", "evolución"],
  ["memoria", "memoria"],
];

const nodes = new Map();
const steps = new Map();
/** role → última nota de inventario ("18 insights"). Alimenta la tira de cierre. */
const tallies = new Map();
/** angle_id → payload del ángulo. Da los chips de evidencia/familia a los ads. */
const angles = new Map();
/** Marca + dominio para el pie de consultor de cada artefacto. */
let brand = null;
/** Umbral de graduación, leído de la estrategia. Colorea la sparkline. */
let roasMin = 3.5;
/** El volcado de backlog no debe marcar 12 tarjetas como "nuevas". */
let firstPaintDone = false;
/** true = servidor local con SSE · false = deploy estático reproduciendo el NDJSON. */
let hasBackend = false;

/* ───────────────────────── organigrama ───────────────────────── */

function buildOrg() {
  const org = $("org");
  for (const [id, label] of ROLES) {
    const row = el("div", "agent idle");
    row.append(el("span", "dot"), el("span", "name", label), el("span", "note"));
    org.appendChild(row);
    nodes.set(id, row);
  }
}

/**
 * El subtítulo de un agente es SIEMPRE un inventario contable, nunca un estado.
 * "18 insights", jamás "corriendo" ni "listo" — esa es la diferencia entre un
 * dashboard y una bandeja de entrada. El filtro `/^\d/` lo garantiza aunque el
 * pipeline real mande otra cosa.
 */
function setAgent(role, state, note) {
  const row = nodes.get(role);
  if (!row) return;
  row.className = `agent ${state}`;
  const slot = row.querySelector(".note");
  slot.className = "note";
  slot.textContent = "";
  if (note && /^\d/.test(note)) {
    slot.textContent = note;
    tallies.set(role, note);
  } else if (state === "thinking") {
    // Skeleton = promesa, no loader: "aquí va a haber un inventario".
    slot.className = "note skel";
  }
}

/* ───────────────────────── stepper de fases ───────────────────────── */

function buildStepper() {
  const box = $("stepper");
  PHASES.forEach(([id, label], i) => {
    if (i) box.appendChild(el("span", "sep", "›"));
    const s = el("span", "step", label);
    s.dataset.state = "next";
    box.appendChild(s);
    steps.set(id, s);
  });
}

function setPhase(name) {
  const idx = PHASES.findIndex(([id]) => id === name);
  if (idx < 0) return;
  PHASES.forEach(([id], i) => {
    const s = steps.get(id);
    s.dataset.state = i < idx ? "past" : i === idx ? "now" : "next";
  });
}

/* ───────────────────────── el terminal ─────────────────────────
 * Dos estados del mismo componente: protagonista durante la corrida, y una
 * línea en el header al terminar. Las líneas se tipean; el prefijo "> " de la
 * narración y la sangría ámbar de la prueba literal son puro CSS.
 */

const queue = [];
let typing = false;
let lastRole = null;

function setStage(stage) {
  document.body.dataset.stage = stage;
}

function enqueue(role, line, kind) {
  queue.push({ role, line, kind });
  if (!typing) pump();
}

/**
 * Política anti-ráfaga. El servidor replica hasta 5000 eventos de backlog SIN
 * delay a cada cliente nuevo: si alguien recarga a mitad del demo, aquí llegan
 * cientos de líneas de golpe. Se vuelcan todas menos las últimas dos.
 */
function pump() {
  const reduced =
    document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (queue.length > 6 || reduced) {
    const tail = reduced ? [] : queue.splice(-2);
    while (queue.length) paint(queue.shift(), false);
    queue.push(...tail);
  }

  const item = queue.shift();
  if (!item) {
    typing = false;
    return;
  }
  typing = true;
  paint(item, true, () => pump());
}

function paint(item, animate, done) {
  const box = $("log");
  const wasBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;

  if (item.role !== lastRole) {
    box.appendChild(el("div", "rolediv", item.role));
    lastRole = item.role;
  }

  const row = el("div", "line");
  row.dataset.kind = item.kind || "plain";
  const what = el("span", "what");
  row.appendChild(what);
  box.appendChild(row);
  while (box.childElementCount > 500) box.removeChild(box.firstChild);

  setTicker(item.line);

  const stick = () => {
    if (wasBottom) box.scrollTop = box.scrollHeight;
  };

  if (!animate) {
    what.textContent = item.line;
    stick();
    if (done) done();
    return;
  }

  // ~2.5ms por carácter, con tope: una línea nunca se roba más de 220ms.
  const text = item.line;
  const step = Math.max(1, Math.ceil(text.length / (220 / 2.5)));
  let i = 0;
  row.classList.add("typing");
  const tick = () => {
    i = Math.min(text.length, i + step);
    what.textContent = text.slice(0, i);
    stick();
    if (i < text.length) {
      setTimeout(tick, 2.5 * step);
    } else {
      row.classList.remove("typing");
      if (done) done();
    }
  };
  tick();
}

function setTicker(line) {
  $("ticker").textContent = `> ${line}`;
}

/* ───────────────────────── cobertura ───────────────────────── */

const COV_NAMES = {
  web: "web",
  conversations: "conversaciones",
  posts_csv: "posts CSV",
  reviews_csv: "reseñas CSV",
  category_benchmarks: "benchmarks de categoría",
  ig_scrape: "IG scraping",
};
const COV_MARK = { ok: "✓", skipped: "⨯", failed: "✕" };

function renderCoverage(entries) {
  const box = $("coverage");
  box.classList.remove("empty");
  box.textContent = "";
  for (const e of entries) {
    const row = el("div", `cov ${e.status}`);
    row.append(
      el("span", "mark", COV_MARK[e.status] ?? "?"),
      el("span", "src", COV_NAMES[e.source] ?? e.source),
    );
    row.title = e.note ?? "";
    box.appendChild(row);
  }
}

/* ───────────────────────── artefactos ─────────────────────────
 * Okara difumina el payload para cobrarlo. DARWIN hace lo inverso: la cita es
 * el elemento más grande de la tarjeta, porque la cita ES el diferenciador.
 * El ad no existe sin ella — así lo dice el schema y así se ve en pantalla.
 */

const KIND_LABEL = {
  brand_research: "panorama",
  insight: "insight",
  angle: "ángulo",
  strategy: "estrategia",
  ad_draft: "ad",
  content_calendar: "calendario",
  influencer_prospect: "creadora",
  email_flow: "flujo de email",
  blog_draft: "blog",
  memory: "memoria",
};

function foot(env) {
  const when = new Date(env.created_at).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const who = brand ? `${brand.name} · ${brand.url.replace(/^https?:\/\//, "")}` : "la marca";
  return el("div", "foot", `Documento preparado para ${who} · Generado ${when}`);
}

/** Resumen legible por tipo. Nunca un volcado crudo de JSON en primer plano. */
function summarize(kind, p) {
  try {
    switch (kind) {
      case "brand_research": {
        const ok = p.coverage.filter((c) => c.status === "ok").length;
        return [
          `${p.brand_brief.name} · ${p.brand_brief.vertical}`,
          `${p.formats_ranked.length} formatos rankeados · ${ok}/${p.coverage.length} fuentes en pie`,
          p.formats_ranked[0] ? p.formats_ranked[0].signal : "",
        ];
      }
      case "insight":
        return [p.summary, `${p.occurrence_count} conversaciones · prioridad ${p.priority}/5`];
      case "strategy":
        return [
          p.channel_mix
            .map((c) => `${c.channel} ${Math.round(c.effort_share * 100)}%`)
            .join(" · "),
          `${p.testing_plan.n_ads} ads · $${p.testing_plan.budget_per_adset_usd}/día · graduar a ${p.testing_plan.graduation.roas_min}x`,
        ];
      case "content_calendar": {
        const by = {};
        for (const i of p.items) by[i.format] = (by[i.format] ?? 0) + 1;
        return [
          `${p.items.length} piezas en 2 semanas`,
          Object.entries(by)
            .map(([f, n]) => `${n} ${f}`)
            .join(" · "),
        ];
      }
      case "influencer_prospect":
        return [p.handle, p.why_her];
      case "email_flow":
        return [p.flow_name, `${p.emails.length} correos · "${p.emails[0].subject}"`];
      case "blog_draft":
        return [p.title, `${p.keywords.length} keywords · ${p.outline.length} secciones`];
      default:
        return [];
    }
  } catch {
    return [];
  }
}

function addArtifact(env) {
  const box = $("artifacts");
  if (box.classList.contains("empty")) {
    box.classList.remove("empty");
    box.textContent = "";
  }

  // Índices que alimentan a otras tarjetas y a la sparkline.
  if (env.kind === "brand_research" && env.payload?.brand_brief) brand = env.payload.brand_brief;
  if (env.kind === "angle" && env.payload?.id) angles.set(env.payload.id, env.payload);
  if (env.kind === "strategy" && env.payload?.testing_plan?.graduation?.roas_min) {
    roasMin = env.payload.testing_plan.graduation.roas_min;
  }

  let card = $(`art-${env.id}`);
  const isNew = !card;
  if (!card) {
    card = el("div", "art");
    card.id = `art-${env.id}`;
    box.prepend(card);
  }
  card.textContent = "";
  card.dataset.status = env.status;
  card.dataset.kind = env.kind;

  const p = env.payload || {};
  const angle = angles.get(p.angle_id) || (env.kind === "angle" ? p : null);

  /* cabecera + chips */
  const head = el("div", "art-head");
  head.appendChild(el("span", "kind", KIND_LABEL[env.kind] ?? env.kind));
  const badges = el("span", "badges");
  if (isNew && firstPaintDone) {
    const b = el("span", "badge new", "nuevo");
    badges.appendChild(b);
    setTimeout(() => b.remove(), 12000);
  }
  if (angle?.evidence_strength) {
    const s = angle.evidence_strength;
    badges.appendChild(
      el("span", `badge sev-${s >= 4 ? "hi" : s === 3 ? "mid" : "lo"}`, `evidencia ${s}/5`),
    );
  }
  if (angle?.angle_family) badges.appendChild(el("span", "badge cat", angle.angle_family));
  head.appendChild(badges);
  card.appendChild(head);

  /* el cuerpo: la cita manda */
  const quote = env.source_quote || p.source_quote;
  const promise = env.kind === "ad_draft" ? p.headline : env.kind === "angle" ? p.hook_text : null;

  if (quote && promise) {
    card.appendChild(el("div", "ev-label", "evidencia"));
    card.appendChild(el("blockquote", "quote", `“${quote}”`));
    card.appendChild(el("div", "arrow", "↓"));
    card.appendChild(el("div", "promise", promise));
    if (env.kind === "ad_draft") {
      card.appendChild(
        el(
          "div",
          "meta",
          `${p.headline.length}/54 · ${p.sub.length}/90 · ${p.format} · ${p.cta}`,
        ),
      );
    }
  } else {
    if (quote) card.appendChild(el("blockquote", "quote sm", `“${quote}”`));
    for (const line of summarize(env.kind, p)) {
      if (line) card.appendChild(el("div", "sum", line));
    }
  }

  /* el JSON crudo existe, pero plegado */
  const det = el("details", "raw");
  det.appendChild(el("summary", null, "detalle"));
  det.appendChild(el("pre", null, JSON.stringify(env.payload, null, 1)));
  card.appendChild(det);

  card.appendChild(foot(env));

  const btn = el("button", null, "GO");
  btn.disabled = env.status === "approved";
  btn.onclick = () => {
    if (hasBackend) {
      // El servidor responde con un evento `go` que dispara markApproved.
      fetch("/api/go", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artifact_id: env.id }),
      });
    } else {
      // Sin backend no hay a quién aprobarle. Se marca local — que es
      // exactamente lo que hace el servidor: prender una bandera en memoria.
      markApproved(env.id);
    }
  };
  card.appendChild(btn);

  const n = box.querySelectorAll(".art").length;
  $("art-count").textContent = String(n);
}

function markApproved(id) {
  const card = $(`art-${id}`);
  if (!card) return;
  card.dataset.status = "approved";
  const btn = card.querySelector("button");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "aprobado";
  }
}

/* ───────────────────────── evolución ─────────────────────────
 * El motor manda un snapshot COMPLETO de todos los ads cada día, así que este
 * renderer es un upsert puro: recargar la página reconstruye la grilla exacta.
 */

const BLOCKS = "▁▂▃▄▅▆▇█";
/** El motor gasta en COP (budget_per_adset_usd × usd_cop), no en dólares.
 *  Mostrar "$120000" a secas se lee como dólares y es media hora de confusión. */
const cop = (v) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);
/** Techo FIJO, no por ad. Normalizar por ad haría que un muerto plano en 0 se
 *  viera idéntico a un ganador — y ese contraste es todo el gráfico. */
const SPARK_CEIL = 7;
const evoRows = new Map();
const evoSpark = new Map();
let evoReady = false;

function ensureEvoGrid() {
  if (evoReady) return;
  evoReady = true;
  document.body.dataset.evo = "on";
  const grid = $("evo-grid");
  if (grid.childElementCount) return;
  for (let i = 0; i < 6; i++) {
    const r = el("div", "evorow skelrow");
    r.appendChild(el("span", "skel"));
    grid.appendChild(r);
  }
}

function sparkline(vals) {
  const box = el("span", "spark");
  for (let d = 0; d < 7; d++) {
    const v = vals[d];
    if (v == null) {
      box.appendChild(el("span", "sp void", "·"));
      continue;
    }
    const lvl = Math.min(7, Math.max(0, Math.round((v / SPARK_CEIL) * 7)));
    const cls = v >= roasMin ? "hi" : v > 0 ? "lo" : "zero";
    box.appendChild(el("span", `sp ${cls}`, BLOCKS[lvl]));
  }
  return box;
}

/** Los hijos se llaman `<padre>-h` (mutó el hook) o `<padre>-f` (mutó el formato).
 *  El snapshot no trae parent_id, así que el linaje se deriva del sufijo.
 *  Va acoplado a mutate() en src/evolution/engine.ts — si cambia allá, cambia acá. */
const parentOf = (id) => (/-(h|f)$/.test(id) ? id.replace(/-(h|f)$/, "") : null);

function evoRow(id) {
  let row = evoRows.get(id);
  if (row) return row;

  const grid = $("evo-grid");
  grid.querySelectorAll(".skelrow").forEach((n) => n.remove());

  row = el("div", "evorow");
  row.id = `evo-${id}`;
  const parent = parentOf(id);
  if (parent) row.classList.add("child");

  const name = el("span", "adid");
  if (parent) name.appendChild(el("span", "lineage", "└─ "));
  name.appendChild(el("span", null, id));
  row.append(
    name,
    el("span", "spark-cell"),
    el("span", "num roas"),
    el("span", "num buys"),
    el("span", "num atc"),
    el("span", "num spend"),
    el("span", "num freq"),
    el("span", "rule"),
  );

  // Las hijas entran justo debajo del padre, no al final de la grilla.
  const anchor = parent ? evoRows.get(parent) : null;
  if (anchor) {
    let after = anchor;
    while (after.nextSibling && after.nextSibling.classList.contains("child")) {
      after = after.nextSibling;
    }
    after.after(row);
  } else {
    grid.appendChild(row);
  }

  row.onclick = () => {
    const card = $(`art-${id}`);
    if (!card) return;
    card.scrollIntoView({ block: "center", behavior: "smooth" });
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 1200);
  };

  evoRows.set(id, row);
  evoSpark.set(id, []);
  return row;
}

function renderSim(e) {
  ensureEvoGrid();
  $("evo-day").textContent = `día ${e.day}/7`;

  for (const a of e.ads) {
    const row = evoRow(a.ad_id);
    const spark = evoSpark.get(a.ad_id);
    spark[e.day - 1] = a.roas;

    row.dataset.verdict = a.verdict;
    const cell = row.querySelector(".spark-cell");
    cell.textContent = "";
    cell.appendChild(sparkline(spark));
    row.querySelector(".roas").textContent = `${a.roas.toFixed(1)}x`;
    row.querySelector(".buys").textContent = a.purchases;
    row.querySelector(".atc").textContent = a.atc;
    row.querySelector(".spend").textContent = cop(a.spend);
    row.querySelector(".freq").textContent = a.frequency.toFixed(1);
    row.querySelector(".rule").textContent = a.rule_fired || "";
  }

  // El tally se recalcula desde el snapshot, jamás se incrementa por evento:
  // los `verdict` no son idempotentes cuando el servidor replica el backlog.
  const dead = e.ads.filter((a) => a.verdict === "kill").length;
  const grad = e.ads.filter((a) => a.verdict === "graduate").length;
  const kids = e.ads.filter((a) => parentOf(a.ad_id)).length;
  $("evo-tally").textContent = `${dead} muertos · ${grad} graduado${
    grad === 1 ? "" : "s"
  } · ${kids} hijos`;
  tallies.set("_evo", { dead, grad, kids });
}

function renderVerdict(e) {
  const row = evoRows.get(e.ad_id);
  if (!row || row.dataset.flashed === e.verdict) return;
  row.dataset.flashed = e.verdict;
  const cls = e.verdict === "graduate" ? "born" : e.verdict === "kill" ? "dying" : null;
  if (!cls) return;
  row.classList.add(cls);
  setTimeout(() => row.classList.remove(cls), 900);
}

/* ───────────────────────── memoria ───────────────────────── */

function renderMemory(e) {
  $("mem-title").hidden = false;
  const box = $("memory");
  box.hidden = false;
  box.textContent = "";
  const added = new Set(e.added_lines || []);
  for (const line of (e.markdown || "").split("\n")) {
    const row = el("div", added.has(line) ? "ml added" : "ml", line);
    box.appendChild(row);
  }
}

/* ───────────────────────── cierre ───────────────────────── */

function renderSummary() {
  const evo = tallies.get("_evo");
  const parts = [
    tallies.get("miner_reduce"),
    tallies.get("angles"),
    tallies.get("paid"),
    evo ? `${evo.dead} muertos` : null,
    evo ? `${evo.grad} graduado` : null,
    evo ? `${evo.kids} hijos` : null,
    $("cost").textContent,
  ].filter(Boolean);
  const box = $("summary");
  box.textContent = parts.join("  ·  ");
  box.hidden = false;
}

/* ─────────────────────────────── SSE ─────────────────────────────── */

/** Un solo despachador para las dos fuentes: SSE en vivo y replay en el cliente. */
const HANDLERS = {
  phase: (e) => {
    if (e.name === "replay") {
      const b = $("banner");
      b.hidden = false;
      b.textContent = `▶ ${e.detail}`;
      return;
    }
    setStage("run");
    setPhase(e.name);
    $("phase").textContent = e.detail ? `${e.name} · ${e.detail}` : e.name;
    if (e.name === "evolution") ensureEvoGrid();
    enqueue("darwin", `— ${e.name}${e.detail ? " · " + e.detail : ""} —`, "phase");
  },
  agent: (e) => setAgent(e.role, e.state, e.note),
  log: (e) => enqueue(e.role, e.line, e.kind),
  cost: (e) => {
    $("cost").textContent = `$${e.total_usd.toFixed(2)}`;
  },
  coverage: (e) => renderCoverage(e.entries),
  artifact: (e) => addArtifact(e.envelope),
  go: (e) => markApproved(e.artifact_id),
  sim: renderSim,
  verdict: renderVerdict,
  memory: renderMemory,
  done: () => {
    $("phase").textContent = "listo";
    setStage("review");
    renderSummary();
  },
};

function handle(e) {
  const fn = HANDLERS[e.type];
  if (!fn) return;
  try {
    fn(e);
  } catch (err) {
    console.error(e.type, err);
  }
}

/* ── fuente A: el servidor local, en vivo por SSE ── */
function connectSSE() {
  const es = new EventSource("/events");
  const conn = $("conn");
  es.onopen = () => {
    conn.textContent = "en vivo";
    conn.className = "pill on";
  };
  es.onerror = () => {
    conn.textContent = "reconectando";
    conn.className = "pill off";
  };
  for (const type of Object.keys(HANDLERS)) {
    es.addEventListener(type, (ev) => {
      try {
        handle(JSON.parse(ev.data));
      } catch (err) {
        console.error(type, err);
      }
    });
  }
}

/* ── fuente B: replay en el navegador, sin backend ──
 * Es lo que corre en el deploy estático. Misma lógica de tiempos que
 * src/replay.ts: solo los `log` traen `ts`, y el que no tiene hereda el
 * offset del último que sí. Si las dos implementaciones divergen, el demo
 * hospedado deja de coincidir con el local — mantenerlas iguales.
 */
async function replayInBrowser(url) {
  const conn = $("conn");
  conn.textContent = "cargando";
  conn.className = "pill off";

  const raw = await fetch(url, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} al leer ${url}`);
    return r.text();
  });

  const events = [];
  let t0 = null;
  for (const line of raw.split("\n")) {
    if (!line) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = e.type === "log" ? e.ts : null;
    if (ts !== null && t0 === null) t0 = ts;
    events.push({ e, offset: ts !== null && t0 !== null ? ts - t0 : -1 });
  }
  let last = 0;
  for (const r of events) {
    if (r.offset < 0) r.offset = last;
    else last = r.offset;
  }
  if (!events.length) throw new Error("el fixture está vacío");

  const speed = Math.max(1, Number(new URLSearchParams(location.search).get("speed")) || 8);
  conn.textContent = `replay ${speed}×`;
  conn.className = "pill on";
  handle({
    type: "phase",
    name: "replay",
    detail: `corrida real pre-grabada · ${speed}× · ${events.length} eventos`,
  });

  let clock = 0;
  for (const { e, offset } of events) {
    const wait = Math.max(0, (offset - clock) / speed);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    clock = offset;
    handle(e);
  }
}

/**
 * ¿Hay backend de verdad?
 *
 * NO basta con que /api/health devuelva 200: los hosts estáticos suelen servir
 * index.html con 200 para CUALQUIER ruta desconocida. Con esa sonda ingenua el
 * deploy elegía SSE, EventSource intentaba parsear HTML y la página se quedaba
 * en "reconectando" — cargando bien y sin reproducir nada.
 *
 * Solo nuestro servidor responde JSON con ok:true.
 */
async function probeBackend() {
  try {
    const r = await fetch("/api/health", { cache: "no-store" });
    if (!r.ok) return false;
    if (!(r.headers.get("content-type") || "").includes("application/json")) return false;
    return (await r.json())?.ok === true;
  } catch {
    return false;
  }
}

/* ── fuente C: una corrida real en Supabase ──
 * Polling incremental (seq=gt.N) en vez de websockets: sin dependencias, sin
 * bundler, y aguanta mejor una red mala. Los eventos son la fuente de verdad;
 * `runs.status` solo dice en qué punto del flujo estamos.
 */
const CFG = window.DARWIN_CFG ?? {};
const sbHeaders = () => ({ apikey: CFG.key, authorization: `Bearer ${CFG.key}` });

async function pollSupabase(runId) {
  const conn = $("conn");
  let lastSeq = -1;
  let asked = false;
  let finished = false;

  const tick = async () => {
    try {
      const [events, runs] = await Promise.all([
        fetch(
          `${CFG.url}/rest/v1/events?run_id=eq.${runId}&seq=gt.${lastSeq}&order=seq.asc&select=seq,payload`,
          { headers: sbHeaders(), cache: "no-store" },
        ).then((r) => r.json()),
        fetch(`${CFG.url}/rest/v1/runs?id=eq.${runId}&select=status,error,cost_usd`, {
          headers: sbHeaders(),
          cache: "no-store",
        }).then((r) => r.json()),
      ]);

      for (const row of events) {
        lastSeq = row.seq;
        handle(row.payload);
      }

      const run = runs[0];
      if (!run) {
        conn.textContent = "corrida no encontrada";
        conn.className = "pill off";
        return;
      }

      const label = {
        queued: "en cola",
        running: "en vivo",
        awaiting_conversations: "esperándote",
        queued_full: "en cola",
        done: "listo",
        error: "error",
        rejected: "rechazada",
      };
      conn.textContent = label[run.status] ?? run.status;
      conn.className = `pill ${run.status === "error" ? "off" : "on"}`;

      if (run.status === "awaiting_conversations" && !asked) {
        asked = true;
        showAsk(runId);
      }
      if (run.status === "running" || run.status === "queued_full") hideAsk();

      if (run.status === "error") {
        const b = $("banner");
        b.hidden = false;
        b.textContent = `✕ ${run.error ?? "la corrida falló"}`;
        finished = true;
      }
      if (run.status === "done") finished = true;
    } catch (err) {
      console.error("poll", err);
    }
    // Rápido mientras algo se mueve; lento cuando ya no hay nada que esperar.
    setTimeout(tick, finished ? 5000 : 900);
  };

  conn.textContent = "conectando";
  conn.className = "pill off";
  tick();
}

/* ── el momento del producto: pedir las conversaciones ── */

function hideAsk() {
  $("ask").hidden = true;
  $("ask-mini").hidden = true;
}

function showAsk(runId) {
  const box = $("ask");
  const mini = $("ask-mini");

  /* "Todavía no tengo clientes" es una respuesta legítima, no una evasiva:
   * quien acaba de lanzar un producto no tiene conversaciones que entregar.
   * La tarjeta se pliega a un recordatorio de una línea y el panorama —que ya
   * está listo— queda a la vista. Reversible de un clic. */
  $("ask-later").onclick = () => {
    box.hidden = true;
    mini.hidden = false;
  };
  mini.onclick = () => {
    mini.hidden = true;
    box.hidden = false;
  };
  // Tarjeta y recordatorio son excluyentes: nunca los dos a la vez.
  mini.hidden = true;

  const input = $("convs");
  const btn = $("ask-go");
  const note = (m, kind) => {
    const el = $("ask-note");
    el.textContent = m ?? "";
    el.dataset.kind = kind ?? "";
  };
  let text = null;

  box.hidden = false;

  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    // 4 MB es el tope de la columna; un export típico de 400 chats pesa ~1 MB.
    if (file.size > 4_000_000) {
      note("el archivo pesa más de 4 MB · exporta el chat SIN archivos multimedia", "err");
      return;
    }
    text = await file.text();
    const lines = text.split("\n").length;
    $("convs-label").textContent = `${file.name} · ${(file.size / 1024).toFixed(0)} KB · ${lines} líneas`;
    note("");
    btn.disabled = false;
  };

  btn.onclick = async () => {
    if (!text) return;
    btn.disabled = true;
    btn.textContent = "subiendo…";
    try {
      const res = await fetch(`${CFG.url}/rest/v1/runs?id=eq.${runId}`, {
        method: "PATCH",
        headers: { ...sbHeaders(), "content-type": "application/json", prefer: "return=minimal" },
        // La política de RLS solo permite este salto exacto:
        // awaiting_conversations → queued_full con phase 2.
        body: JSON.stringify({ conversations: text, status: "queued_full", phase: 2 }),
      });
      if (!res.ok) throw new Error(`el servidor respondió ${res.status}`);
      hideAsk();
    } catch (err) {
      note(err.message ?? String(err), "err");
      btn.disabled = false;
      btn.textContent = "extraer mis ángulos";
    }
  };
}

/**
 * Elige la fuente y arranca. Se decide con una petición explícita en vez de
 * esperar a que EventSource falle: EventSource reintenta solo, para siempre.
 */
async function boot() {
  buildOrg();
  buildStepper();
  setTimeout(() => {
    firstPaintDone = true;
  }, 1500);

  // Una corrida real de Supabase manda sobre todo lo demás.
  const runId = new URLSearchParams(location.search).get("run");
  if (runId && CFG.url && CFG.key) return pollSupabase(runId);

  hasBackend = await probeBackend();
  if (hasBackend) return connectSSE();

  try {
    await replayInBrowser("events.ndjson");
  } catch (err) {
    console.error(err);
    const b = $("banner");
    b.hidden = false;
    b.textContent = `✕ no se pudo cargar la corrida: ${err.message}`;
  }
}

boot();

// El ticker reabre el terminal: en el Q&A siempre preguntan "¿qué hizo ahí?".
$("ticker").onclick = () => setStage("run");
