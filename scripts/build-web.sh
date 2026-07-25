#!/usr/bin/env bash
#
# Arma web/ — el war room como sitio estático, para Vercel.
#
# Por qué estático y no el servidor: en serverless el stream SSE vive en una
# invocación y `POST /api/go` cae en otra, así que el evento `go` nunca vuelve
# al cliente. El botón se vería funcionar sin hacer nada, justo en la parte del
# demo que dice "nada se publica sin GO humano". Reproducir el NDJSON en el
# navegador evita el problema entero: sin backend no hay nada que desincronizar.
#
#   npm run build:web && npm run preview:web
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FIXTURE="runs/demo/events.ndjson"
[ -f "$FIXTURE" ] || {
  echo "  ✕ falta $FIXTURE — corre: npm run gen" >&2
  exit 1
}

rm -rf web
mkdir -p web
cp public/index.html public/app.js public/style.css web/
cp "$FIXTURE" web/events.ndjson

echo "  ✓ web/ listo · $(du -sh web | cut -f1) · $(wc -l <web/events.ndjson | tr -d ' ') eventos"
