#!/usr/bin/env bash
# Ensure committed ABI metadata stays paired with contract source edits.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ---------------------------------------------------------------------------
# 1. Existence check — fail loudly if any required ABI file is missing.
# ---------------------------------------------------------------------------
REQUIRED_ABIS=(
  abis/invoice.json
  abis/treasury.json
  abis/compliance.json
)

missing=0
for abi_file in "${REQUIRED_ABIS[@]}"; do
  if [ ! -f "$REPO_ROOT/$abi_file" ]; then
    echo "ERROR: required ABI snapshot is missing: $abi_file" >&2
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "" >&2
  echo "One or more required ABI snapshots are missing from abis/." >&2
  echo "Restore the files or regenerate them with:" >&2
  echo "  scripts/generate_abi_metadata.sh abis" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Staged-pairing check — ABI and contract source changes must go together.
# ---------------------------------------------------------------------------
abi_changed="$(git diff --cached --name-only -- 'abis/*.json' || true)"
contract_src_changed="$(git diff --cached --name-only -- '../COMEBACKHERE-contracts/contracts/*/src/' || true)"

if [ -n "$abi_changed" ] && [ -z "$contract_src_changed" ]; then
  echo "ABI metadata changed without a matching COMEBACKHERE-contracts/contracts/*/src/ change."
  echo "Staged ABI files:"
  printf '  %s\n' $abi_changed
  exit 1
fi

if [ -n "$contract_src_changed" ] && [ -z "$abi_changed" ]; then
  echo "Contract source changed without updating abis/*.json."
  echo "Run: scripts/generate_abi_metadata.sh"
  echo "Staged contract sources:"
  printf '  %s\n' $contract_src_changed
  exit 1
fi
