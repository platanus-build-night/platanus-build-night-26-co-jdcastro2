#!/usr/bin/env bash
#
# Arma web/ — el sitio estático que se despliega en Vercel.
#
#   index.html     →  la puerta: pide la URL y encola la corrida
#   war-room.html  →  el war room (Supabase · SSE local · o el replay grabado)
#
# El trabajo pesado NO corre aquí: lo hace `npm run worker` en la máquina que
# tiene la API key. Este build es solo la cara.
#
# Todo el manejo de archivos va por node a propósito: `sed -i ''` es sintaxis
# de BSD y en el Linux de Vercel falla el build entero. Ya pasó una vez.
#
#   npm run build:web && npm run preview:web
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# En local las variables salen de .env; en Vercel, del entorno del proyecto.
# shellcheck disable=SC1091
[ -f .env ] && set -a && . ./.env && set +a

FIXTURE="runs/demo/events.ndjson"
[ -f "$FIXTURE" ] || {
  echo "  ✕ falta $FIXTURE — corre: npm run gen" >&2
  exit 1
}

rm -rf web
mkdir -p web
cp public/index.html public/landing.html public/app.js public/landing.js public/style.css web/
cp "$FIXTURE" web/events.ndjson

DARWIN_ANON="${SUPABASE_ANON_KEY:-${SUPABASE_PUBLISHABLE_KEY:-}}" node -e '
const fs = require("fs");

// La puerta es la raíz; el war room queda en /war-room.html.
fs.renameSync("web/index.html", "web/war-room.html");
fs.renameSync("web/landing.html", "web/index.html");

const patch = (f, fn) => fs.writeFileSync(f, fn(fs.readFileSync(f, "utf8")));

patch("web/landing.js", s => s.replace(/index\.html\?run=/g, "war-room.html?run="));

// SOLO claves públicas. La anon está protegida por RLS: encola y lee, nunca
// aprueba ni escribe eventos. La service_role no puede llegar aquí jamás.
const cfg = { url: process.env.SUPABASE_URL || null, key: process.env.DARWIN_ANON || null };
fs.writeFileSync("web/config.js",
  "// Generado por scripts/build-web.sh — no editar a mano.\n" +
  "window.DARWIN_CFG = " + JSON.stringify(cfg, null, 2) + ";\n");

// config.js se carga antes que cualquier script que lo use.
for (const f of ["web/index.html", "web/war-room.html"]) {
  patch(f, s => s.includes("config.js") ? s
    : s.replace(/(\s*)<script src=/, "$1<script src=\"config.js\"></script>$1<script src="));
}
'

# Guarda: si un secreto se coló al build, no se despliega.
for secret in "${SUPABASE_SERVICE_ROLE_KEY:-}" "${OPENROUTER_API_KEY:-}" "${ANTHROPIC_API_KEY:-}"; do
  if [ -n "$secret" ] && grep -rqF "$secret" web/ 2>/dev/null; then
    echo "  ✕ ABORTADO: un secreto se filtró a web/" >&2
    rm -rf web
    exit 1
  fi
done

ANON="${SUPABASE_ANON_KEY:-${SUPABASE_PUBLISHABLE_KEY:-}}"
echo "  ✓ web/ listo · $(du -sh web | cut -f1) · $(wc -l <web/events.ndjson | tr -d ' ') eventos"
if [ -n "$ANON" ]; then
  echo "    backend: ${SUPABASE_URL:-?}"
else
  echo "    ⚠ sin SUPABASE_ANON_KEY: la landing no podrá encolar corridas"
fi
