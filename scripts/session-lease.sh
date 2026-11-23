#!/usr/bin/env bash
# Gestión manual del lease de sesión por checkout (una-sesión-por-checkout).
# Uso: scripts/session-lease.sh [status|release]
set -euo pipefail

GIT_DIR="$(git rev-parse --git-dir)"
LEASE_FILE="$GIT_DIR/session-lease"

case "${1:-status}" in
  status)
    if [ -f "$LEASE_FILE" ]; then
      echo "lease: $(cat "$LEASE_FILE")"
    else
      echo "lease: (libre)"
    fi
    ;;
  release)
    if [ -f "$LEASE_FILE" ]; then
      rm -f "$LEASE_FILE"
      echo "✅ lease liberado"
    else
      echo "ℹ️  no había lease"
    fi
    ;;
  *)
    echo "uso: scripts/session-lease.sh [status|release]" >&2
    exit 1
    ;;
esac
