#!/usr/bin/env bash
# Regenerate committed ABI metadata under abis/ from contract sources.
# Contract sources are searched in two locations (CI checkout and local sibling):
#   1. $ROOT_DIR/COMEBACKHERE-contracts  (GitHub Actions checkout path)
#   2. $ROOT_DIR/../COMEBACKHERE-contracts  (local sibling directory)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-"$ROOT_DIR/abis"}"

if [ -d "$ROOT_DIR/COMEBACKHERE-contracts" ]; then
  CONTRACTS_DIR="$ROOT_DIR/COMEBACKHERE-contracts"
elif [ -d "$ROOT_DIR/../COMEBACKHERE-contracts" ]; then
  CONTRACTS_DIR="$(cd "$ROOT_DIR/../COMEBACKHERE-contracts" && pwd)"
else
  echo "ERROR: COMEBACKHERE-contracts directory not found." >&2
  echo "  Looked in: $ROOT_DIR/COMEBACKHERE-contracts" >&2
  echo "  Looked in: $ROOT_DIR/../COMEBACKHERE-contracts" >&2
  echo "  Clone it with: git clone https://github.com/WHEELBACK/COMEBACKHERE-contracts ../COMEBACKHERE-contracts" >&2
  exit 1
fi

export LC_ALL=C
export LANG=C

echo "Building COMEBACKHERE contracts (workspace test build)..."
(cd "$CONTRACTS_DIR" && cargo test --no-run --workspace)

mkdir -p "$OUT_DIR"
python3 "$ROOT_DIR/scripts/generate_abi_metadata.py" "$OUT_DIR"

echo "ABI metadata written to $OUT_DIR"
