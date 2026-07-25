#!/usr/bin/env bash
#
# Worktrees listos para correr, en un comando.
#
# Un `git worktree add` pelado NO sirve en este repo: el worktree nace sin
# node_modules (gitignored), sin .env, y peleando por el puerto 3000 con las
# demás sesiones. Este script resuelve las tres cosas.
#
#   ./scripts/wt.sh pipeline      # crea rama wt/pipeline en ../darwin-wt/pipeline
#   ./scripts/wt.sh army 3002     # con puerto fijo
#   ./scripts/wt.sh --list
#   ./scripts/wt.sh --rm army
#
# node_modules se SYMLINKEA, no se instala: este proyecto no tiene addons
# nativos (.node), solo ejecutables por plataforma que son los mismos en todo
# worktree de esta máquina. Ahorra 67 MB y ~20s por worktree.
set -euo pipefail

# Anclado al checkout PRINCIPAL, no a donde se invoque. Si se resolviera con
# BASH_SOURCE, correr el script desde dentro de un worktree crearía
# darwin-wt/darwin-wt/<nombre>. `--git-common-dir` apunta siempre al .git del
# repo principal, incluso desde un worktree.
ROOT="$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)"
WT_HOME="$(dirname "$ROOT")/darwin-wt"
cd "$ROOT"

die() {
  echo "  ✕ $*" >&2
  exit 1
}

case "${1:-}" in
"" | -h | --help)
  echo "uso: ./scripts/wt.sh <nombre> [puerto]   crea el worktree"
  echo "     ./scripts/wt.sh --list              lista los que hay"
  echo "     ./scripts/wt.sh --rm <nombre>       lo borra (solo si está limpio)"
  exit 0
  ;;
--list)
  git worktree list
  exit 0
  ;;
--rm)
  NAME="${2:?falta el nombre}"
  DIR="$WT_HOME/$NAME"
  [ -d "$DIR" ] || die "no existe $DIR"
  # El symlink se va con el directorio; git worktree remove se niega si hay
  # cambios sin commitear, que es exactamente lo que queremos.
  git worktree remove "$DIR"
  git branch -d "wt/$NAME" 2>/dev/null || echo "  · rama wt/$NAME conservada (no está mergeada)"
  echo "  ✓ $NAME eliminado"
  exit 0
  ;;
esac

NAME="$1"
[[ "$NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "nombre inválido: usa minúsculas, números, - y _"
BRANCH="wt/$NAME"
DIR="$WT_HOME/$NAME"

# Puerto: el explícito, o uno derivado del nombre en el rango 3001-3099.
# Determinista, así que el mismo worktree siempre usa el mismo puerto.
if [ -n "${2:-}" ]; then
  PORT="$2"
else
  HASH=$(printf '%s' "$NAME" | cksum | cut -d' ' -f1)
  PORT=$((3001 + HASH % 99))
fi

[ -d "$DIR" ] && die "$DIR ya existe · usa: ./scripts/wt.sh --rm $NAME"

mkdir -p "$WT_HOME"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "  · la rama $BRANCH ya existe, la reutilizo"
  git worktree add "$DIR" "$BRANCH"
else
  git worktree add -b "$BRANCH" "$DIR" main
fi

# node_modules compartido con la raíz.
ln -s "$ROOT/node_modules" "$DIR/node_modules"

# .env propio: hereda las claves de la raíz si existen, y fija SU puerto.
if [ -f "$ROOT/.env" ]; then
  grep -v '^PORT=' "$ROOT/.env" >"$DIR/.env" || true
fi
echo "PORT=$PORT" >>"$DIR/.env"

cat <<EOF

  ✓ worktree listo

    rama      $BRANCH
    carpeta   $DIR
    puerto    $PORT

    cd $DIR
    npm run check && npm run demo

  El fixture (runs/demo/events.ndjson) viene versionado, así que el demo
  corre de una. Para volver a main:  cd $ROOT

EOF
