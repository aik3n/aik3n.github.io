#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO="$SCRIPT_DIR/aik3n.github.io"

echo "=== ZeNode ==="
echo

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: no encuentro npm."
  echo "Instala Node.js/npm y vuelve a intentarlo."
  read -r -p "Pulsa Enter para cerrar..."
  exit 1
fi

if [ ! -d "$REPO" ]; then
  echo "ERROR: no encuentro la carpeta:"
  echo "  $REPO"
  echo
  echo "Pon este archivo al mismo nivel que aik3n.github.io"
  read -r -p "Pulsa Enter para cerrar..."
  exit 1
fi

if [ ! -f "$REPO/package.json" ]; then
  echo "ERROR: no encuentro package.json dentro de aik3n.github.io"
  read -r -p "Pulsa Enter para cerrar..."
  exit 1
fi

cd "$REPO"

echo "Iniciando ZeNode..."
echo
npm run dev
