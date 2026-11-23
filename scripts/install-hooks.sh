#!/usr/bin/env bash
# Instala los hooks del repo vía core.hooksPath (apunta a .githooks/).
# Uso: scripts/install-hooks.sh [ruta-al-repo]  (por defecto, el repo actual).
set -euo pipefail

REPO_DIR="${1:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

if [ ! -d "$REPO_DIR/.githooks" ]; then
  echo "❌ install-hooks: no se encontró $REPO_DIR/.githooks — no se instaló nada." >&2
  exit 1
fi

git -C "$REPO_DIR" config core.hooksPath .githooks
echo "✅ install-hooks: core.hooksPath=.githooks en $REPO_DIR"
