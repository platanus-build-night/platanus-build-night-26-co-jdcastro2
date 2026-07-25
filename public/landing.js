// La puerta de entrada. Pide UNA cosa: la web.
//
// Por qué solo la URL y no también el export de WhatsApp: un cargador de
// archivos antes del primer clic mata la conversión, y —más importante—
// entierra el diferenciador. Con la web sola DARWIN puede describir la marca y
// rankear formatos, que es exactamente lo que hace cualquier "AI marketer".
// El momento en que pide las conversaciones es el argumento del producto, y
// ese momento merece su propia pantalla.

const CFG = window.DARWIN_CFG ?? {};
const $ = (id) => document.getElementById(id);

const note = (msg, kind) => {
  const el = $("gate-note");
  el.textContent = msg ?? "";
  el.dataset.kind = kind ?? "";
};

/** Acepta "dosmicos.co", "www.dosmicos.co", "https://dosmicos.co/algo". */
function normalizeUrl(raw) {
  const s = raw.trim().replace(/\s+/g, "");
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  let u;
  try {
    u = new URL(withProto);
  } catch {
    return null;
  }
  // Un host sin punto no es un dominio ("localhost" no nos sirve aquí).
  if (!u.hostname.includes(".")) return null;
  return { url: u.origin + (u.pathname === "/" ? "" : u.pathname), host: u.hostname };
}

/** "dosmicos.co" → "Dosmicos". Es un punto de partida; el Panorama lo corrige. */
function brandFromHost(host) {
  const bare = host.replace(/^www\./, "").split(".")[0] ?? host;
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

async function submit(ev) {
  ev.preventDefault();
  const btn = $("go");
  const parsed = normalizeUrl($("url").value);

  if (!parsed) {
    note("eso no parece una dirección web · prueba con algo como dosmicos.co", "err");
    $("url").focus();
    return;
  }

  if (!CFG.url || !CFG.key) {
    note("falta configurar el backend (SUPABASE_URL / SUPABASE_ANON_KEY en el build)", "err");
    return;
  }

  btn.disabled = true;
  btn.textContent = "encolando…";
  note("");

  try {
    const res = await fetch(`${CFG.url}/rest/v1/runs`, {
      method: "POST",
      headers: {
        apikey: CFG.key,
        authorization: `Bearer ${CFG.key}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify({
        brand_name: brandFromHost(parsed.host),
        brand_url: parsed.url,
      }),
    });

    if (!res.ok) {
      // El tope por hora vive en la política de RLS, no en este archivo:
      // un cliente no puede ser la única defensa del gasto.
      const body = await res.text();
      if (/row-level security|violates/i.test(body)) {
        throw new Error("hay demasiadas corridas en cola ahora mismo · intenta en un rato");
      }
      throw new Error(`el servidor respondió ${res.status}`);
    }

    const [run] = await res.json();
    location.href = `index.html?run=${run.id}`;
  } catch (err) {
    note(err.message ?? String(err), "err");
    btn.disabled = false;
    btn.textContent = "empezar";
  }
}

$("gate-form").addEventListener("submit", submit);
$("url").focus();
