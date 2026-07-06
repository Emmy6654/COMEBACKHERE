#!/usr/bin/env bash
# Regenerate committed ABI metadata under abis/ from contract sources.
# Contract sources live in the sibling COMEBACKHERE-contracts/ directory.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$(cd "$ROOT_DIR/../COMEBACKHERE-contracts" && pwd)"
OUT_DIR="${1:-"$ROOT_DIR/abis"}"

export LC_ALL=C
export LANG=C

echo "Building COMEBACKHERE contracts (workspace test build)..."
(cd "$CONTRACTS_DIR" && cargo test --no-run --workspace)

mkdir -p "$OUT_DIR"
python3 "$ROOT_DIR/scripts/generate_abi_metadata.py" "$OUT_DIR"

echo "ABI metadata written to $OUT_DIR"
