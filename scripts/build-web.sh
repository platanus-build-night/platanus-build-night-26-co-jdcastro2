#!/usr/bin/env bash
#
# Arma web/ — el sitio estático que se despliega en Vercel.
#
#   landing.html  →  pide la URL y encola la corrida
#   index.html    →  el war room (SSE local · Supabase · o el replay grabado)
#
# Por qué estático y no el servidor: en serverless el stream SSE vive en una
# invocación y POST /api/go cae en otra, así que el evento `go` nunca vuelve al
# cliente. El trabajo pesado corre en el worker (npm run worker), que es donde
# vive la API key.
#
#   npm run build:web && npm run preview:web
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Las variables del build salen de .env, pero SOLO las públicas llegan a web/.
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

# La puerta de entrada es la raíz; el war room queda en /index.html.
mv web/index.html web/war-room.html
mv web/landing.html web/index.html
sed -i '' 's|index.html?run=|war-room.html?run=|' web/landing.js

# ── config pública ──
# SUPABASE_ANON_KEY (o la publicable) es de lectura y está protegida por RLS:
# puede encolar y leer, nunca aprobar ni escribir eventos. Eso lo verifica
# scripts/check-keys.ts.
#
# GUARDA: la service_role JAMÁS puede llegar aquí. Se comprueba abajo.
ANON="${SUPABASE_ANON_KEY:-${SUPABASE_PUBLISHABLE_KEY:-}}"
# Con node, no con heredoc: JSON.stringify escapa bien y no hay que pelear con
# la expansión de bash (${V:-x} devuelve el VALOR cuando está seteado, no el
# default — eso ya generó un config.js corrupto una vez).
DARWIN_ANON="$ANON" node -e '
const fs = require("fs");
const cfg = { url: process.env.SUPABASE_URL || null, key: process.env.DARWIN_ANON || null };
fs.writeFileSync("web/config.js",
  "// Generado por scripts/build-web.sh — no editar a mano.\n" +
  "window.DARWIN_CFG = " + JSON.stringify(cfg, null, 2) + ";\n");
'

if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && grep -qF "$SUPABASE_SERVICE_ROLE_KEY" web/config.js; then
  echo "  ✕ ABORTADO: la service_role se filtró a web/config.js" >&2
  rm -rf web
  exit 1
fi

# config.js se carga antes que los scripts que lo usan.
for f in web/index.html web/war-room.html; do
  grep -q 'config.js' "$f" || sed -i '' 's|<script src=|<script src="config.js"></script>\n    <script src=|' "$f"
done

echo "  ✓ web/ listo · $(du -sh web | cut -f1) · $(wc -l <web/events.ndjson | tr -d ' ') eventos"
[ -n "$ANON" ] && echo "    backend: ${SUPABASE_URL}" || echo "    ⚠ sin SUPABASE_ANON_KEY: la landing no podrá encolar"
