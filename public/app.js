// War room. Vanilla, cero dependencias, cero CDN — el wifi del venue no es de fiar.
//
// Port del diseño `DARWIN Analisis.dc.html` (Claude Design). El original usa
// <x-dc>, bindings {{ }}, <sc-for>/<sc-if> y una clase DCLogic sobre support.js;
// aquí eso es DOM directo. Mismo circuito de 6 zonas, misma paleta que la landing.
//
// La capa de transporte (SSE · replay del NDJSON · polling a Supabase) NO cambió:
// las tres fuentes entran por el mismo despachador y el render se enteró de nada.

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/* Roles del pipeline (caminan por el riel) y canales (filas con barra de mix). */
const ROLES = [
  ["panorama", "panorama"],
  ["miner_map", "oído·map"],
  ["miner_reduce", "oído·red"],
  ["angles", "ángulos"],
  ["strategist", "estratega"],
  ["paid", "paid"],
  ["organic", "orgánico"],
  ["creators", "creators"],
  ["email", "email"],
  ["blog", "blog"],
  ["memory", "memoria"],
];
const CHANNELS = [
  ["paid", "Paid"],
  ["organic", "Orgánico"],
  ["creators", "Creators"],
  ["email", "Email"],
  ["blog", "Blog"],
];
const COV_NAMES = {
  web: "web",
  conversations: "conversaciones",
  posts_csv: "posts CSV",
  reviews_csv: "reseñas CSV",
  category_benchmarks: "benchmarks de categoría",
  ig_scrape: "IG scraping",
};

const bots = new Map();
const prows = new Map();
const chans = new Map();
/** angle_id → payload. Alimenta las pestañas y la cadena. */
const angles = new Map();
/** insight.id → payload. Da frecuencia y resumen al eslabón del miner. */
const insights = new Map();
/** angle_id → [ad]. Lo que Paid escribió para cada ángulo. */
const adsByAngle = new Map();
/** ad_id → última fila del sim. Da el estado del ad dentro de la cadena. */
const simById = new Map();
/** ad_id → [roas por día]. El sim no manda la serie: se acumula aquí. */
const spark = new Map();
const evoRows = new Map();
const artIds = new Set();
const tallies = new Map();

let brand = null;
let costUsd = 0;
let spendCop = 0;
let currentTab = null;
let firstPaintDone = false;
let hasBackend = false;
let maxDay = 0;

const cop = (n) => "$" + Math.round(n).toLocaleString("es-CO");

/* ───────────────────────── construcción inicial ───────────────────────── */

function buildBots() {
  for (const [id, label] of ROLES) {
    const b = el("div", "bot");
    b.dataset.state = "idle";
    const body = el("div", "body");
    for (const c of ["led", "ant", "head", "eye l", "eye r", "arm l", "arm r", "torso", "leg l", "leg r"]) {
      body.appendChild(el("i", c));
    }
    b.append(body, el("span", "lbl2", label));
    $("org").appendChild(b);
    bots.set(id, b);
  }
}

function buildPipeline() {
  for (const [id, label] of ROLES) {
    const row = el("div", "prow");
    row.dataset.s = "idle";
    row.append(el("span", "d"), el("span", "r", label), el("span", "o"), el("span", "c"));
    $("pipeline").appendChild(row);
    prows.set(id, row);
  }
}

function buildChannels() {
  for (const [id, name] of CHANNELS) {
    const c = el("div", "ch");
    c.dataset.on = "0";
    const fill = el("div", "fill");
    const inner = el("div", "in");
    inner.append(el("span", "d"), el("span", "n", name), el("span", "o", "—"));
    c.append(fill, inner);
    $("army").appendChild(c);
    chans.set(id, c);
  }
}

function buildDays() {
  for (let d = 1; d <= 7; d++) {
    const s = el("span", "day", `D${d}`);
    s.dataset.d = String(d);
    $("days").appendChild(s);
  }
}

/* ───────────────────────── estado de un agente ───────────────────────── */

function setAgent(role, state, note) {
  const b = bots.get(role);
  if (b) b.dataset.state = state;

  const p = prows.get(role);
  if (p) {
    p.dataset.s = state;
    // Inventario contable: la nota tiene que empezar con dígito o no se pinta.
    if (note && /^\d/.test(note)) {
      p.querySelector(".o").textContent = note;
      tallies.set(role, note);
    }
  }

  const c = chans.get(role);
  if (c) {
    c.dataset.s = state;
    if (note && /^\d/.test(note)) {
      c.dataset.on = "1";
      c.querySelector(".o").textContent = note;
    }
  }
  if (role === "memory" && state === "done") $("mem-state").textContent = "ESCRITA";

  // Cada zona recorta (así lo define el diseño) y en una corrida real el
  // contenido pasa de su alto. Sin esto el proyector muestra el principio de
  // la lista mientras la acción ocurre abajo, fuera de cuadro. `nearest` no
  // mueve nada si ya se ve: no hay salto gratuito.
  if (state === "thinking") {
    p?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    c?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

/* ───────────────────────── ① la fuente ───────────────────────── */

function renderCoverage(entries) {
  const box = $("inputs");
  box.textContent = "";
  let ok = 0;
  for (const e of entries) {
    const row = el("div", `src ${e.status}`);
    row.append(
      el("span", "mk", e.status === "ok" ? "✓" : e.status === "failed" ? "✕" : "·"),
      el("span", "nm", COV_NAMES[e.source] ?? e.source),
      el("span", "ct", e.note ?? ""),
    );
    box.appendChild(row);
    if (e.status === "ok") ok++;
  }
  $("src-count").textContent = `${ok}/${entries.length}`;
}

function renderBrand(p) {
  const b = p.brand_brief;
  if (!b) return;
  brand = b;
  if (b.url || b.name) $("brand-host").textContent = (b.url || b.name).replace(/^https?:\/\//, "");
  $("brand-sub").textContent = [b.vertical, b.audience].filter(Boolean).join(" · ");
}

/* ───────────────────────── ② la cadena ───────────────────────── */

function renderTabs() {
  const box = $("chain-tabs");
  box.textContent = "";
  for (const [id, a] of angles) {
    const ins = insights.get((a.insight_ids || [])[0]);
    const t = el("span", `tab${id === currentTab ? " on" : ""}`);
    t.append(el("span", null, id), el("span", "f", ins ? `×${ins.occurrence_count}` : ""));
    t.onclick = () => {
      currentTab = id;
      renderTabs();
      renderChain();
    };
    box.appendChild(t);
  }
  $("chain-count").textContent =
    `${insights.size} señales · ${angles.size} ángulos · ${[...adsByAngle.values()].flat().length} ads`;
}

function stepArrow(text) {
  const d = el("div", "step-arrow");
  d.append(el("span", "a", "↓"), el("span", "t", text));
  return d;
}

function renderChain() {
  const a = angles.get(currentTab);
  const box = $("chain");
  if (!a) return;
  $("chain-empty").hidden = true;
  box.hidden = false;
  box.textContent = "";

  const ins = insights.get((a.insight_ids || [])[0]);

  /* el eslabón 1: la frase textual */
  const q = el("div", "quote-box");
  const meta = el("div", "meta");
  meta.append(
    el("span", "k", "FRASE TEXTUAL"),
    el("span", "c", ins?.evidence?.[0]?.conv_id ?? ""),
  );
  q.append(meta, el("div", "q", `“${a.source_quote}”`));
  box.append(q);

  /* el eslabón 2: el miner agrupa y cuenta */
  if (ins) {
    box.appendChild(stepArrow("MINER · AGRUPA Y CUENTA"));
    const m = el("div", "link-box");
    const row = el("div", "row");
    const pos = ins.sentiment === "positive";
    row.append(
      el("span", `kchip${pos ? " pos" : ""}`, ins.type),
      el("span", "id", ins.id),
      el("div", "grow"),
      el("span", "freq", `×${ins.occurrence_count} conversaciones`),
    );
    m.append(row, el("div", "summary", ins.summary));
    box.append(m);
  }

  /* el eslabón 3: el ángulo traduce a promesa */
  box.appendChild(stepArrow("ANGLES · TRADUCE A PROMESA"));
  const ab = el("div", "link-box");
  const arow = el("div", "row");
  arow.append(
    el("span", "id", a.id),
    el("span", "fam", a.angle_family),
    el("div", "grow"),
    el("span", "conf-l", "evidencia"),
    el("span", "conf", `${a.evidence_strength}/5`),
  );
  ab.append(arow, el("div", "hook", a.hook_text));
  box.append(ab);

  /* el eslabón 4: los ads, con su cita verificada */
  const ads = adsByAngle.get(currentTab) || [];
  box.appendChild(stepArrow(ads.length ? "PAID · ESCRIBE EL AD" : "PAID · NO LE ASIGNÓ PRESUPUESTO"));

  if (!ads.length) {
    const n = el("div", "noads");
    n.append(
      el("div", "k", "0 ADS · EL ESTRATEGA NO LE ASIGNÓ PRESUPUESTO"),
      el("p", null,
        "El ángulo existe y queda guardado, pero no compite esta corrida: la evidencia no alcanzó para pagarle un ad set propio."),
    );
    box.append(n);
    return;
  }

  for (const env of ads) {
    const p = env.payload || {};
    const sim = simById.get(p.id);
    const v = sim?.verdict;
    const card = el("div", `adcard${v === "graduate" ? " grad" : v === "kill" ? " dead" : ""}`);
    card.id = `art-${env.id}`;
    card.dataset.status = env.status;

    const top = el("div", "top");
    top.append(
      el("span", "id", p.id),
      el("span", "fmt", p.format),
      el("div", "grow"),
      el("span", "st", v === "graduate" ? "GRADUÓ" : v === "kill" ? "MURIÓ" : sim ? "CORRE" : "BORRADOR"),
    );

    const body = el("div", "body");
    body.append(el("div", "h", p.headline), el("div", "s", p.sub));

    const ver = el("div", "verified");
    ver.append(
      el("span", "k", "CITA VERIFICADA"),
      el("span", "q", `“${env.source_quote || p.source_quote}” · ${ins ? ins.id : a.id}`),
    );

    card.append(top, body, ver);
    box.append(card);

    /* Nada sale de draft sin GO humano. */
    const btn = el("button", "go", env.status === "approved" ? "aprobado" : "GO");
    btn.disabled = env.status === "approved";
    btn.onclick = () => {
      if (hasBackend) {
        fetch("/api/go", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ artifact_id: env.id }),
        });
      } else markApproved(env.id);
    };
    box.append(btn);
  }
}

function markApproved(id) {
  const card = $(`art-${id}`);
  if (!card) return;
  card.dataset.status = "approved";
  const btn = card.nextElementSibling;
  if (btn && btn.classList.contains("go")) {
    btn.textContent = "aprobado";
    btn.disabled = true;
  }
}

/* ───────────────────────── ③ el plan ───────────────────────── */

function renderPlan(p) {
  const active = new Set();
  for (const c of p.channel_mix || []) {
    active.add(c.channel);
    const row = chans.get(c.channel);
    if (!row) continue;
    row.dataset.on = "1";
    row.querySelector(".fill").style.width = `${Math.round((c.effort_share || 0) * 100)}%`;
    row.title = c.role_in_mix || "";
  }
  $("plan-count").textContent = `${active.size}/${CHANNELS.length} activos`;

  const t = p.testing_plan;
  if (!t) return;
  $("pt-budget").textContent = `$${t.budget_per_adset_usd}/día`;
  const g = t.graduation || {};
  $("rule-grad").textContent = `GRADÚA · ROAS ≥ ${g.roas_min} CON ${g.purchases_min}+ COMPRAS`;
  const rules = t.kill_rules || [];
  if (rules[0]) $("rule-roas").textContent = `MUERE · ${rules[0].condition}`.toUpperCase();
  if (rules[1]) $("rule-atc").textContent = `MUERE · ${rules[1].condition}`.toUpperCase();
}

function renderCiclo(p) {
  const applied = p.memory_applied || [];
  $("ciclo-run").textContent = applied.length ? "CORRIDA 2" : "CORRIDA 1";
  $("ciclo-applied").textContent = applied.length
    ? `aplicó ${applied.length} aprendizajes`
    : "sin memoria previa";
}

/* ───────────────────────── ④ la arena ───────────────────────── */

/** El hijo se llama `<padre>-h` (mutó el hook) o `-f` (mutó el formato). */
const parentOf = (id) => (/-(h|f)$/.test(id) ? id.replace(/-(h|f)$/, "") : null);

/** Polilínea del ROAS acumulado. Techo fijo: normalizar por ad haría que un
 *  muerto plano en 0 se viera igual que un ganador. */
function sparkPoints(vals) {
  const W = 104, H = 26, TOP = 3, BASE = 22.3, CEIL = 7;
  if (!vals.length) return { points: "", x: 0, y: BASE };
  const step = vals.length > 1 ? W / (vals.length - 1) : W;
  const pts = vals.map((v, i) => {
    const y = BASE - Math.min(1, (v || 0) / CEIL) * (BASE - TOP);
    return [i * step, y];
  });
  const last = pts[pts.length - 1];
  return { points: pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" "), x: last[0], y: last[1] };
}

function evoRow(id) {
  let row = evoRows.get(id);
  if (row) return row;
  const parent = parentOf(id);

  row = el("div", "evorow");
  const idcell = el("div", "idcell");
  const idline = el("div", "idline");
  if (parent) idline.appendChild(el("span", "lineage", "↳"));
  idline.appendChild(el("span", "adid", id));
  idcell.append(idline, el("span", "copy"));

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 104 26");
  svg.setAttribute("width", "104");
  svg.setAttribute("height", "26");
  svg.setAttribute("class", "sparkcell");
  const base = document.createElementNS("http://www.w3.org/2000/svg", "line");
  base.setAttribute("x1", "0"); base.setAttribute("y1", "22.3");
  base.setAttribute("x2", "104"); base.setAttribute("y2", "22.3");
  base.setAttribute("stroke", "#22242E"); base.setAttribute("stroke-dasharray", "2 4");
  const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  poly.setAttribute("fill", "none"); poly.setAttribute("stroke-width", "1.5");
  poly.setAttribute("stroke-linejoin", "round");
  const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  dot.setAttribute("r", "2.2");
  svg.append(base, poly, dot);

  const rulecell = el("div", "rulecell");
  rulecell.append(el("span", "st"), el("span", "rule"));

  row.append(
    idcell, svg,
    el("span", "roas r"), el("span", "num buys r"), el("span", "num atc r"),
    el("span", "num spend r"), el("span", "num freq r"), rulecell,
  );

  // Las hijas entran justo debajo del padre, no al final.
  const anchor = parent ? evoRows.get(parent) : null;
  if (anchor) {
    let after = anchor;
    while (after.nextSibling && after.nextSibling.querySelector?.(".lineage")) after = after.nextSibling;
    after.after(row);
  } else {
    $("evo-grid").appendChild(row);
  }
  evoRows.set(id, row);
  spark.set(id, []);
  return row;
}

function renderSim(e) {
  $("arena-empty").hidden = true;
  $("arena-foot").hidden = false;
  maxDay = Math.max(maxDay, e.day);
  $("p-day").textContent = `día ${e.day}/7`;
  $("ciclo-fill").style.width = `${Math.min(100, (e.day / 7) * 100)}%`;
  for (const d of $("days").children) d.classList.toggle("on", Number(d.dataset.d) === e.day);

  let live = 0;
  spendCop = 0;
  for (const a of e.ads) {
    simById.set(a.ad_id, a);
    const row = evoRow(a.ad_id);
    const s = spark.get(a.ad_id);
    s[e.day - 1] = a.roas;

    row.dataset.v = a.verdict;
    const ad = adsByAngle.get(angleOfAd(a.ad_id))?.find((x) => x.payload?.id === a.ad_id);
    row.querySelector(".copy").textContent = ad?.payload?.headline ?? "";

    const sp = sparkPoints(s.filter((x) => x !== undefined));
    const poly = row.querySelector("polyline");
    const dot = row.querySelector("circle");
    const color = a.verdict === "graduate" ? "#6fcf87" : a.verdict === "kill" ? "#e8623a" : "#3a3d4c";
    poly.setAttribute("points", sp.points);
    poly.setAttribute("stroke", color);
    dot.setAttribute("cx", sp.x); dot.setAttribute("cy", sp.y); dot.setAttribute("fill", color);

    row.querySelector(".roas").textContent = `${a.roas.toFixed(2)}x`;
    row.querySelector(".buys").textContent = a.purchases || "—";
    row.querySelector(".atc").textContent = a.atc;
    row.querySelector(".spend").textContent = cop(a.spend);
    row.querySelector(".freq").textContent = a.frequency.toFixed(2);
    row.querySelector(".st").textContent =
      a.verdict === "graduate" ? "GRADUÓ" : a.verdict === "kill" ? "MURIÓ" : "CORRE";
    row.querySelector(".rule").textContent = a.rule_fired || "";

    if (a.verdict !== "kill") live++;
    spendCop += a.spend;
  }
  $("p-live").textContent = `${live} ads vivos`;
  $("p-spend").textContent = `${cop(spendCop)} COP`;
  if (e.ads.some((a) => parentOf(a.ad_id))) {
    $("mut-h").classList.add("on");
    $("mut-f").classList.add("on");
  }
  // El veredicto del día es lo que hay que ver: manda el que acaba de graduar
  // y si no hubo, el último que murió.
  const hit =
    e.ads.find((a) => a.verdict === "graduate") ??
    [...e.ads].reverse().find((a) => a.verdict === "kill");
  if (hit) evoRows.get(hit.ad_id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });

  // Si la cadena está abierta, el estado del ad cambió: repintar.
  if (currentTab) renderChain();
}

function angleOfAd(adId) {
  const root = adId.replace(/-(h|f)$/, "");
  for (const [ang, list] of adsByAngle) {
    if (list.some((x) => x.payload?.id === root)) return ang;
  }
  return null;
}

function renderVerdict() {
  /* El tally se recalcula desde el snapshot `sim`, que sí es idempotente. */
}

/* ───────────────────────── ⑤ la memoria ───────────────────────── */

function renderMemory(e) {
  $("mem-pending").hidden = true;
  const box = $("memory");
  box.hidden = false;
  box.textContent = "";
  $("mem-state").textContent = "ESCRITA";

  const grad = [], died = [];
  for (const [id, a] of simById) {
    if (a.verdict === "graduate") grad.push(a);
    else if (a.verdict === "kill") died.push(a);
  }

  if (grad[0]) {
    const g = grad[0];
    const ang = angleOfAd(g.ad_id);
    const c = el("div", "memcard grad");
    c.append(
      el("div", "k", "GRADUÓ"),
      el("div", "t", `${ang ?? g.ad_id} × paid`),
      el("div", "s", `ROAS ${g.roas.toFixed(1)}x · ${g.purchases} compras`),
    );
    box.append(c);
  }
  if (died.length) {
    const c = el("div", "memcard died");
    c.append(el("div", "k", "MURIÓ"));
    const list = el("div", "list");
    for (const d of died) list.appendChild(el("span", null, `${d.ad_id} · ${d.rule_fired}`));
    c.append(list);
    box.append(c);
  }
  const never = [...angles.keys()].filter((id) => !(adsByAngle.get(id) || []).length);
  if (never.length) {
    const c = el("div", "memcard never");
    c.append(el("div", "k", "NUNCA SALIÓ"), el("div", "list", ""));
    for (const n of never) c.querySelector(".list").appendChild(el("span", null, `${n} · 0 ads`));
    box.append(c);
  }
  // El markdown completo, por si alguien quiere leerlo entero.
  const lines = (e.markdown || "").split("\n").filter((l) => l.trim());
  if (lines.length) {
    const c = el("div", "memcard");
    c.append(el("div", "k", "DIFF"));
    const list = el("div", "list");
    for (const l of lines.slice(0, 4)) list.appendChild(el("span", null, l));
    c.append(list);
    box.append(c);
  }
}

/* ───────────────────────── artefactos ───────────────────────── */

function addArtifact(env) {
  const p = env.payload || {};
  artIds.add(env.id);

  if (env.kind === "brand_research") renderBrand(p);
  if (env.kind === "insight" && p.id) insights.set(p.id, p);
  if (env.kind === "angle" && p.id) {
    angles.set(p.id, p);
    if (!currentTab) currentTab = p.id;
    renderTabs();
    renderChain();
  }
  if (env.kind === "ad_draft" && p.angle_id) {
    const list = adsByAngle.get(p.angle_id) || [];
    if (!list.some((x) => x.id === env.id)) list.push(env);
    adsByAngle.set(p.angle_id, list);
    renderTabs();
    if (currentTab === p.angle_id) renderChain();
  }
  if (env.kind === "strategy") {
    renderPlan(p);
    renderCiclo(p);
  }
}

function renderSummary() {
  const parts = [
    tallies.get("miner_reduce"),
    tallies.get("angles"),
    tallies.get("paid"),
    `$${costUsd.toFixed(2)}`,
  ].filter(Boolean);
  $("summary").textContent = parts.join(" · ");
}

const queue = [];
let typing = false;
let lastRole = null;

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

  pushLog(item.role, item.line, item.kind);

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



/** Un solo despachador para las tres fuentes: SSE, replay y Supabase. */
const HANDLERS = {
  phase: (e) => {
    // Honestidad: que esto sea una grabación se dice desde el primer segundo
    // y no se va de la pantalla. Es un banner persistente, no una píldora que
    // la siguiente fase pisa.
    if (e.name === "replay") {
      const b = $("banner");
      b.hidden = false;
      b.textContent = `▶ REPLAY · ${e.detail}`;
      return;
    }
    $("ciclo-phase").textContent = e.name;
    // La rejilla sigue la historia: cuando empieza la selección natural, la
    // arena le roba alto a la fila de arriba, que para entonces ya está fija.
    document.body.dataset.phase = e.name;
    $("p-state").dataset.s = "run";
    $("p-state-t").textContent = e.name.toUpperCase();
    enqueue("darwin", `— ${e.name}${e.detail ? " · " + e.detail : ""} —`, "phase");
  },
  agent: (e) => setAgent(e.role, e.state, e.note),
  log: (e) => enqueue(e.role, e.line, e.kind),
  cost: (e) => {
    costUsd = e.total_usd;
    $("p-cost").textContent = `run $${costUsd.toFixed(2)}`;
  },
  coverage: (e) => renderCoverage(e.entries),
  artifact: (e) => addArtifact(e.envelope),
  go: (e) => markApproved(e.artifact_id),
  sim: renderSim,
  verdict: renderVerdict,
  memory: renderMemory,
  done: () => {
    $("p-state").dataset.s = "done";
    $("p-state-t").textContent = "VENTANA CERRADA";
    $("ciclo-phase").textContent = "listo";
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

/** El indicador de conexión vive en la píldora de estado del topbar. */
function setConn(text, ok) {
  $("p-state").dataset.s = ok ? "run" : "off";
  $("p-state-t").textContent = text.toUpperCase();
}

/* ── fuente A: el servidor local, en vivo por SSE ── */
function connectSSE() {
  const es = new EventSource("/events");
  es.onopen = () => {
    setConn("en vivo", true);
  };
  es.onerror = () => {
    setConn("reconectando", false);
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
  setConn("cargando", false);

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
  setConn(`replay ${speed}×`, true);
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
        setConn("corrida no encontrada", false);
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
      setConn(label[run.status] ?? run.status, run.status !== "error");

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

  setConn("conectando", false);
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
  buildBots();
  buildPipeline();
  buildChannels();
  buildDays();
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


/* ── la banda del log: tres líneas, la última en verde con cursor ──
 * Reemplaza al ticker de una línea. Las dos anteriores quedan en gris: el
 * proceso se lee de un vistazo sin robarle espacio al resultado. */
const band = [];
function pushLog(role, line, kind) {
  band.push({ role, line, kind });
  while (band.length > 3) band.shift();
  const rows = document.querySelectorAll(".logline");
  for (let i = 0; i < 3; i++) {
    const item = band[band.length - 3 + i];
    const row = rows[i];
    if (!row) continue;
    row.querySelector(".who").textContent = item ? item.role : "";
    row.querySelector(".txt").textContent = item ? item.line : "";
    row.dataset.kind = item?.kind ?? "";
  }
}

/* El cajón con la narración completa: en el Q&A siempre preguntan "¿qué hizo ahí?". */
document.querySelector(".loglines").onclick = () => {
  const b = document.body;
  b.dataset.log = b.dataset.log === "open" ? "" : "open";
  if (b.dataset.log) $("log").scrollTop = $("log").scrollHeight;
};
addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.body.dataset.log = "";
});

/* Correr de nuevo: recarga el replay desde el principio. */
$("replay-btn").onclick = () => location.reload();

/* Los chips de día saltan dentro de la corrida grabada recargando con ?speed
 * alto — el replay no tiene scrubbing, y fingirlo sería mentir sobre lo que es. */
for (const d of $("days").children) {
  d.title = "la corrida se reproduce completa; los días se marcan al pasar";
}

boot();
