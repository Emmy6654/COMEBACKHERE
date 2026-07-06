#!/usr/bin/env bash
# Ensure committed ABI metadata stays paired with contract source edits.
set -euo pipefail

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
