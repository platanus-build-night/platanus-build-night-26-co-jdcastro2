// La puerta de entrada.
//
// Port a vanilla del diseño `DARWIN Landing.dc.html` (Claude Design). El
// original usa `<x-dc>`, bindings {{ }}, <sc-for>/<sc-if> y una clase DCLogic
// que necesitan support.js como runtime. Aquí eso se traduce a DOM directo:
// el proyecto no tiene bundler ni CDN, así que meter un runtime de terceros
// habría roto el invariante del wifi hostil.
//
// Lo único que NO es demo: el formulario encola una corrida REAL en Supabase y
// redirige al war room. Todo lo demás de esta página es ilustración honesta —
// datos de ejemplo rotulados como tales.

const CFG = window.DARWIN_CFG ?? {};
const $ = (id) => document.getElementById(id);

/* Modo demo (`?demo=1`): el formulario acepta la URL y en vez de encolar una
 * corrida lleva al war room a reproducir la corrida grabada.
 *
 * Existe porque en un escenario la corrida de verdad es una mala demo: la
 * primera fase son ~60 segundos donde no pasa casi nada en pantalla, y depende
 * de que el worker esté despierto y de que el wifi del venue aguante. El modo
 * demo enseña el circuito completo en 58 segundos, sin red y sin gastar tokens.
 *
 * No es un "modo mentira": el war room rotula la grabación con la marca real de
 * la que salió, y dice qué dirección se pidió. Lo que se enseña es una corrida
 * real de Dosmicos, no un análisis inventado de la página del que mira. */
const DEMO = (() => {
  // Pegajoso durante la sesión del navegador: en un escenario, volver atrás o
  // apretar el logo no puede devolverte sin avisar a la corrida lenta que
  // depende de la red del venue. Se apaga con ?demo=0 o cerrando la pestaña.
  const q = new URLSearchParams(location.search).get("demo");
  try {
    if (q === "1") sessionStorage.setItem("darwin_demo", "1");
    if (q === "0") sessionStorage.removeItem("darwin_demo");
    return sessionStorage.getItem("darwin_demo") === "1";
  } catch {
    return q === "1"; // sessionStorage bloqueado (modo privado estricto)
  }
})();
const REPLAY_URL = "war-room.html?speed=10";
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const GREEN = "#6fcf87";

/* ─────────────────────────── los datos de la demo ─────────────────────────── */

/* Los datos son la corrida real de Dosmicos que reproduce el war room —
 * demo/generate.ts, el mismo fixture. Landing y dashboard cuentan la misma
 * historia, con los mismos números.
 *
 * NO se usan las citas de la corrida contra el export real: traen
 * circunstancias personales de clientas ("viajaré el domingo", "me veo con mi
 * papá que vive en Bogotá") y esta es una página pública. Redactamos nombres y
 * teléfonos; publicar la vida de la gente es otra cosa. */

const SIGNALS = [
  {
    id: "ad_noche_reel", who: "Clienta · WhatsApp", time: "21:04", kind: "FRENO", freq: 23,
    quote: "se le destapa toda la noche y amanece heladita, no sé qué hacer",
    short: "se destapa · amanece helada",
    promise: "La cobijita que sí se queda puesta",
    platform: "META · REEL", head: "la cobijita que sí se queda puesta",
    body: "duerme tapada toda la noche, sin cobijas sueltas",
    cta: "Ver más",
  },
  {
    id: "ad_regalo_ugc", who: "Clienta · WhatsApp", time: "08:12", kind: "FRENO", freq: 31,
    quote: "lo necesito antes del sábado que es el cumpleaños de mi sobrina",
    short: "regalo con fecha · urgencia",
    promise: "El regalo que sí llega a tiempo",
    platform: "META · UGC", head: "el regalo que sí llega a tiempo",
    body: "pídelo hoy, llega antes del sábado",
    cta: "Comprar ahora",
  },
  {
    id: "ad_calidad_ugc", who: "Clienta · WhatsApp", time: "19:33", kind: "MOTIVO", freq: 14,
    quote: "la tela después de tres lavadas quedó igualita, muy buena",
    short: "aguanta lavadas · sigue igual",
    promise: "Tres lavadas y quedó igualita",
    platform: "META · UGC", head: "tres lavadas y quedó igualita",
    body: "algodón colombiano que aguanta el uso diario",
    cta: "Ver más",
  },
  {
    id: "ad_talla_carrusel", who: "Clienta · WhatsApp", time: "13:47", kind: "FRENO", freq: 9,
    quote: "le queda grande la 2, ¿manejan 18 meses?",
    short: "la talla no corresponde",
    promise: "La talla que sí le queda",
    platform: "META · ESTÁTICO", head: "la talla que sí le queda",
    body: "guía real por edad, de 0 a 9 años",
    cta: "Más información",
  },
];

const STEPS = [
  { num: "01", tag: "INGESTA", title: "Conecta tu web y sube tu chat de WhatsApp",
    body: "Sin instalaciones ni permisos complejos. El chat se exporta desde el propio teléfono en dos toques.",
    detail: "input: dosmicos.co + chat-export.txt · 412 conversaciones" },
  { num: "02", tag: "LECTURA", title: "Lee los mensajes y anota por qué la gente compra",
    body: "Detecta motivos, preguntas y frenos. De cada uno guarda la frase textual de la clienta y cuántas veces se repite.",
    detail: "salida: 18 insights · cada uno con su cita y su frecuencia" },
  { num: "03", tag: "TRADUCCIÓN", title: "Convierte los problemas en promesas de venta",
    body: "El dolor dicho con las palabras de la clienta se vuelve el ángulo del anuncio.",
    isTransform: true },
  { num: "04", tag: "PRODUCCIÓN", title: "Escribe todo el material con esas promesas",
    body: "Anuncios pagados, calendario de contenido, correos, un artículo y a qué creadoras contactar. Cada pieza vinculada a su frase de origen.",
    detail: "6 ads · 10 piezas · 2 prospectos · 3 emails · 1 borrador" },
];

const TRACES = [
  { slot: 0, kind: "FRENO", freq: 23, quote: "se le destapa toda la noche y amanece heladita",
    copy: "la cobijita que sí se queda puesta", channel: "META · REEL" },
  { slot: 2, kind: "FRENO", freq: 31, quote: "lo necesito antes del sábado que es el cumpleaños",
    copy: "el regalo que sí llega a tiempo", channel: "META · UGC" },
  { slot: 3, kind: "FRENO", freq: 9, quote: "le queda grande la 2, ¿manejan 18 meses?",
    copy: "la talla que sí le queda", channel: "META · ESTÁTICO" },
  { slot: 1, kind: "MOTIVO", freq: 14, quote: "la tela después de tres lavadas quedó igualita",
    copy: "tres lavadas y quedó igualita", channel: "META · UGC" },
];

/* La evolución real del fixture: 4 mueren, ad_noche_reel gradúa a 5.4x y se
 * reproduce en dos hijos que mutan UNA variable cada uno. */
const SIM = [
  { id: "noche", copy: "la cobijita que sí se queda puesta", src: "cita ×23", born: 1,
    ctr: [0, 1.2, 1.8, 2.4, 2.7, 3.0, 3.1, 3.2] },
  { id: "calidad", copy: "tres lavadas y quedó igualita", src: "cita ×14", born: 1,
    ctr: [0, 0.9, 1.1, 1.3, 1.4, 1.5, 1.6, 1.6] },
  { id: "regalo·ugc", copy: "el regalo que sí llega a tiempo", src: "cita ×31", born: 1, dies: 7, dieCtr: "0.96",
    ctr: [0, 1.0, 1.0, 0.98, 0.96, 0.96, 0.96, 0.96] },
  { id: "talla", copy: "la talla que sí le queda", src: "cita ×9", born: 1, dies: 4, dieCtr: "0.38",
    ctr: [0, 0.5, 0.45, 0.38, 0.38, 0.38, 0.38, 0.38] },
  { id: "precio", copy: "combo de dos, envío gratis", src: "cita ×6", born: 1, dies: 3, dieCtr: "0.42",
    ctr: [0, 0.6, 0.5, 0.42, 0.42, 0.42, 0.42, 0.42] },
  { id: "noche·h", copy: "la cobijita que sí se queda puesta", parent: "noche", born: 5,
    src: "MUTÓ EL HOOK", ctr: [0, 0, 0, 0, 0, 1.9, 3.4, 3.6] },
  { id: "noche·f", copy: "la cobijita que sí se queda puesta", parent: "noche", born: 6,
    src: "MUTÓ EL FORMATO", ctr: [0, 0, 0, 0, 0, 0, 2.1, 3.9] },
];

const NOTES = [
  "D0 · 6 anuncios en cola · 1 ad = 1 ad set · $5/día cada uno",
  "D1 · al aire · recolectando señal",
  "D2 · sin descartes todavía · ventana de evaluación abierta",
  "D3 · precio descartado por regla · presupuesto redistribuido",
  "D4 · talla descartada: 22 carritos y 0 compras",
  "D5 · noche gradúa a ROAS 5.4x · se reproduce mutando el hook",
  "D6 · noche·h supera al padre · nace noche·f mutando el formato",
  "D7 · 4 muertos · 1 graduado · 2 hijos vivos · aprendizaje guardado",
];

/* ─────────────────────────── estado ─────────────────────────── */

const S = { sig: 0, trace: 0, day: 0, play: true, tracePlay: true, hasChat: false, busy: false };
let traceTimer = null;

/* ─────────────────── hero: conversaciones y señales ─────────────────── */

function renderHero() {
  const chat = $("chat-col");
  chat.textContent = "";
  SIGNALS.forEach((s, i) => {
    const d = el("div", `msg${i === S.sig ? " on" : ""}`);
    d.appendChild(el("div", null, s.quote));
    const m = el("div", "msg-meta");
    m.append(el("span", null, s.who), el("span", null, s.time));
    d.appendChild(m);
    d.onclick = () => {
      S.sig = i;
      renderHero();
    };
    chat.appendChild(d);
  });

  const sig = $("sig-col");
  sig.textContent = "";
  // Se calcula del dataset: hardcodearlo dejaba todas las barras cortas al cambiar los datos.
  const maxFreq = Math.max(...SIGNALS.map((x) => x.freq));
  SIGNALS.forEach((s, i) => {
    const d = el("div", `sig${i === S.sig ? " on" : ""}`);
    const top = el("div", "sig-top");
    top.append(
      el("span", `kind ${s.kind === "MOTIVO" ? "motivo" : "freno"}`, s.kind),
      el("span", "sig-short", s.short),
    );
    const row = el("div", "bar-row");
    const bar = el("div", "bar");
    const fill = el("i");
    fill.style.width = `${Math.round((s.freq / maxFreq) * 100)}%`;
    bar.appendChild(fill);
    row.append(bar, el("span", "freq", `×${s.freq}`));
    d.append(top, row);
    d.onclick = () => {
      S.sig = i;
      renderHero();
    };
    sig.appendChild(d);
  });

  const s = SIGNALS[S.sig];
  $("sel-promise").textContent = s.promise;
  $("sel-platform").textContent = s.platform;
  $("sel-id").textContent = s.id;
  $("sel-head").textContent = s.head;
  $("sel-body").textContent = s.body;
  $("sel-cta").textContent = s.cta;
  $("sel-quote").textContent = `“${s.quote}”`;
  $("sel-freq").textContent = `· ×${s.freq} menciones · ${s.id}`;
}

/* ─────────────────── cómo funciona ─────────────────── */

function renderSteps() {
  const box = $("steps");
  box.textContent = "";
  for (const p of STEPS) {
    const d = el("div", "step");
    const top = el("div", "step-top");
    top.append(el("span", "num", p.num), el("span", "rule"), el("span", "tag", p.tag));
    d.append(top, el("h3", null, p.title), el("p", null, p.body), el("div", "spacer"));
    if (p.isTransform) {
      const t = el("div", "transform");
      t.append(
        el("span", "a", "“se le destapa toda la noche”"),
        el("span", null, "→"),
        el("span", "b", "“la cobijita que sí se queda puesta”"),
      );
      d.appendChild(t);
    }
    if (p.detail) d.appendChild(el("div", "detail", p.detail));
    box.appendChild(d);
  }
}

/* ─────────────────── trazabilidad ─────────────────── */

function renderTrace() {
  const q = $("q-col");
  q.textContent = "";
  TRACES.forEach((t, i) => {
    const d = el("div", `tcard q${i === S.trace ? " on" : ""}`);
    d.appendChild(el("div", "q-txt", `“${t.quote}”`));
    const m = el("div", "meta");
    const k = el("span", null, t.kind);
    k.style.color = t.kind === "MOTIVO" ? GREEN : "var(--amber)";
    m.append(k, el("span", null, `×${t.freq} menciones`));
    d.appendChild(m);
    d.onclick = () => pickTrace(i);
    q.appendChild(d);
  });

  const a = $("a-col");
  a.textContent = "";
  TRACES.slice()
    .sort((x, y) => x.slot - y.slot)
    .forEach((t) => {
      const i = TRACES.indexOf(t);
      const d = el("div", `tcard a${i === S.trace ? " on" : ""}`);
      d.appendChild(el("div", "a-txt", t.copy));
      const m = el("div", "meta split");
      const tag = el("span", null, i === S.trace ? "TRAZA ACTIVA ←" : "CON FUENTE");
      tag.style.color = i === S.trace ? GREEN : "var(--ink-3)";
      m.append(el("span", null, t.channel), tag);
      d.appendChild(m);
      d.onclick = () => pickTrace(i);
      a.appendChild(d);
    });

  // Los cables: solo el de la traza activa se ilumina y fluye.
  const Y = [44, 146, 248, 350];
  const ENDY = [44, 248, 350, 146];
  for (let i = 0; i < 4; i++) {
    const p = $(`p${i}`);
    const f = $(`f${i}`);
    p.setAttribute("stroke", i === S.trace ? "#2c5f3c" : "#22242e");
    p.setAttribute("stroke-width", i === S.trace ? "1.6" : "1");
    f.setAttribute("stroke", i === S.trace ? GREEN : "transparent");
  }
  $("beat-start").setAttribute("cy", Y[S.trace]);
  $("beat-end").setAttribute("cy", ENDY[S.trace]);
}

function pickTrace(i) {
  S.trace = i;
  renderTrace();
  startTrace();
}

function startTrace() {
  clearInterval(traceTimer);
  traceTimer = setInterval(() => {
    if (!S.tracePlay) return;
    S.trace = (S.trace + 1) % TRACES.length;
    renderTrace();
  }, 3200);
}

/* ─────────────────── simulación ─────────────────── */

const liveAt = (d) => SIM.filter((r) => d >= r.born && !(r.dies && d >= r.dies)).length || 1;

function imprOf(r, upto) {
  let t = 0;
  for (let d = r.born; d <= upto; d++) {
    if (r.dies && d > r.dies) break;
    t += 2350 / liveAt(d);
  }
  return Math.round(t / 10) * 10;
}

function renderSim() {
  const days = $("days");
  days.textContent = "";
  for (let d = 1; d <= 7; d++) {
    const c = el("span", `day${d === S.day ? " on" : ""}`, `D${d}`);
    c.onclick = () => {
      S.day = d;
      S.play = false;
      renderSim();
    };
    days.appendChild(c);
  }
  $("play").textContent = S.play ? "❙❙ PAUSA" : "▶ REPRODUCIR";

  let winnerId = null;
  let best = 0;
  if (S.day >= 5) {
    for (const r of SIM) {
      if (S.day < r.born || (r.dies && S.day >= r.dies)) continue;
      const c = r.ctr[Math.min(S.day, 7)];
      if (c > best) {
        best = c;
        winnerId = r.id;
      }
    }
  }

  const box = $("sim-rows");
  box.textContent = "";
  for (const r of SIM.filter((x) => x.born === 1 || S.day >= x.born)) {
    const alive = S.day >= r.born;
    const dead = r.dies && S.day >= r.dies;
    const eff = dead ? r.dies : S.day;
    const ctr = alive ? r.ctr[Math.min(eff, 7)] : 0;
    const impr = alive ? imprOf(r, eff) : 0;
    const isNew = alive && S.day === r.born && r.born > 1;
    const isWin = !dead && r.id === winnerId;

    const row = el("div", `simrow${dead ? " dead" : isWin ? " win" : isNew ? " new" : ""}`);

    const idc = el("div", "idcell");
    idc.appendChild(el("span", null, r.id));
    if (r.parent) idc.appendChild(el("span", "parent", `← ${r.parent}`));

    const cc = el("div", "copycell");
    cc.appendChild(el("span", "copy", `“${r.copy}”`));
    cc.appendChild(
      el("span", "sub",
        dead
          ? `CTR ${r.dieCtr}% · ${impr.toLocaleString("en-US")} impr · bajo el umbral`
          : r.src),
    );

    const ctrc = el("div", "ctrcell");
    const track = el("div", "track");
    track.appendChild(el("div", "thresh"));
    const fill = el("i");
    fill.style.width = `${Math.min(100, (ctr / 4) * 100)}%`;
    track.appendChild(fill);
    ctrc.append(track, el("span", "ctr", alive ? `${ctr.toFixed(2)}%` : "—"));

    let status = "ACTIVA";
    if (S.day === 0) status = "EN COLA";
    else if (dead) status = "DESCARTADA";
    else if (isWin) status = "GANADORA · SE REPRODUCE";
    else if (isNew) status = "NUEVA VARIANTE";

    const st = el("div", "st");
    st.appendChild(el("span", null, status));

    row.append(idc, cc, ctrc, el("span", "impr", impr ? impr.toLocaleString("en-US") : "—"), st);
    box.appendChild(row);
  }
  $("daynote").textContent = NOTES[S.day];
}

/* ─────────────────── el formulario: esto SÍ es real ─────────────────── */

const setStatus = (msg, kind) => {
  $("status-line").textContent = msg;
  $("status").className = `status${kind ? " " + kind : ""}`;
  $("status").querySelector(".dot").style.background = kind === "err" ? "var(--orange)" : "#3a3d4c";
};

const idleStatus = () =>
  setStatus(
    S.hasChat
      ? "listo: web + chat. DARWIN lee ambos y devuelve promesas con la frase real al lado."
      : "con la web ya arranca. El chat se pide en el panel, y ahí las promesas dejan de ser suposiciones.",
  );

/** Acepta "dosmicos.co", "www.dosmicos.co", "https://dosmicos.co/algo". */
function normalizeUrl(raw) {
  const s = raw.trim().replace(/\s+/g, "");
  if (!s) return null;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!u.hostname.includes(".")) return null;
  return { url: u.origin + (u.pathname === "/" ? "" : u.pathname), host: u.hostname };
}

/** "dosmicos.co" → "Dosmicos". Punto de partida; el Panorama lo corrige. */
function brandFromHost(host) {
  const bare = host.replace(/^www\./, "").split(".")[0] ?? host;
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

async function submit(ev) {
  ev.preventDefault();
  if (S.busy) return;
  const parsed = normalizeUrl($("url").value);
  if (!parsed) {
    setStatus("eso no parece una dirección web · prueba con algo como dosmicos.co", "err");
    $("url").focus();
    return;
  }
  // Sin backend configurado no hay a dónde encolar, pero sí hay algo que
  // enseñar. Mejor la corrida grabada que un callejón sin salida.
  if (!CFG.url || !CFG.key) {
    setStatus(`${parsed.host} · sin backend configurado, abro una corrida grabada`);
    location.href = `${REPLAY_URL}&demo=${encodeURIComponent(parsed.host)}`;
    return;
  }

  S.busy = true;
  $("go").disabled = true;
  $("go").textContent = "LEYENDO…";

  /* La dirección viaja al war room aunque la corrida sea grabada: ahí se dice
   * qué se pidió y de dónde salió lo que se está viendo. */
  if (DEMO) {
    setStatus(`${parsed.host} · abriendo una corrida completa grabada`);
    location.href = `${REPLAY_URL}&demo=${encodeURIComponent(parsed.host)}`;
    return;
  }

  setStatus(`encolando ${parsed.host} · DARWIN va a leer tu página`);

  try {
    const res = await fetch(`${CFG.url}/rest/v1/runs`, {
      method: "POST",
      headers: {
        apikey: CFG.key,
        authorization: `Bearer ${CFG.key}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify({ brand_name: brandFromHost(parsed.host), brand_url: parsed.url }),
    });
    if (!res.ok) {
      // El tope por hora vive en la política de RLS: un cliente no puede ser la
      // única defensa del gasto.
      const body = await res.text();
      throw new Error(
        /row-level security|violates/i.test(body)
          ? "hay demasiadas corridas en cola ahora mismo · intenta en un rato"
          : `el servidor respondió ${res.status}`,
      );
    }
    const [run] = await res.json();
    location.href = `war-room.html?run=${run.id}`;
  } catch (err) {
    /* La cola llena o el worker dormido no pueden dejar la página muerta: se
     * dice qué pasó y se ofrece la corrida grabada en el mismo renglón. */
    setStatus(`${err.message ?? String(err)} · `, "err");
    const a = el("a", "st-link", "ver una corrida completa grabada →");
    a.href = `${REPLAY_URL}&demo=${encodeURIComponent(parsed.host)}`;
    // Va DENTRO de status-line: el próximo setStatus lo borra con el texto y
    // no se apilan enlaces si el usuario reintenta.
    $("status-line").appendChild(a);
    S.busy = false;
    $("go").disabled = false;
    $("go").textContent = "ANALIZAR GRATIS";
  }
}

/* ─────────────────────────── arranque ─────────────────────────── */

renderHero();
renderSteps();
renderTrace();
renderSim();
idleStatus();

$("demo-flag").hidden = !DEMO;
$("gate-form").addEventListener("submit", submit);
$("url").addEventListener("focus", () => $("gate-form").classList.add("focus"));
$("url").addEventListener("blur", () => $("gate-form").classList.remove("focus"));

$("chat-chip").onclick = () => {
  S.hasChat = !S.hasChat;
  $("chat-chip").classList.toggle("on", S.hasChat);
  $("chip-icon").textContent = S.hasChat ? "✓" : "+";
  $("chip-label").textContent = S.hasChat ? "CON CHAT" : "TENGO CHAT";
  idleStatus();
};

$("trace-btn").onclick = () => {
  S.tracePlay = !S.tracePlay;
  $("trace-btn").classList.toggle("on", S.tracePlay);
  $("trace-btn-label").textContent = S.tracePlay ? "RECORRIENDO TRAZAS" : "RECORRIDO EN PAUSA";
};

$("play").onclick = () => {
  S.play = !S.play;
  if (S.play && S.day >= 7) S.day = 0;
  renderSim();
};

// El hero rota solo; la simulación avanza un día por segundo y descansa al final.
setInterval(() => {
  S.sig = (S.sig + 1) % SIGNALS.length;
  renderHero();
}, 4600);

let hold = 0;
setInterval(() => {
  if (!S.play) return;
  if (S.day >= 7) {
    if (++hold < 3) return;
    hold = 0;
    S.day = 0;
  } else S.day++;
  renderSim();
}, 1000);

startTrace();
