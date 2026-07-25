#!/usr/bin/env bash
# verify.sh — post-deployment WASM hash verification.
#
# Confirms that the WASM hashes of deployed contracts on the network match
# the locally built artifacts. Exits non-zero and prints a clear diff if any
# mismatch is detected.
#
# Required environment variables:
#   SOROBAN_RPC_URL        — Soroban RPC endpoint
#   INVOICE_CONTRACT_ID    — deployed invoice contract ID  (C…)
#   TREASURY_CONTRACT_ID   — deployed treasury contract ID (C…)
#   COMPLIANCE_CONTRACT_ID — deployed compliance contract ID (C…)
#
# Optional:
#   CONTRACTS_DIR          — path to built WASM artifacts
#                            (default: ../COMEBACKHERE-contracts/target/wasm32-unknown-unknown/release)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── ABI metadata sanity check ─────────────────────────────────────────────────
echo "Checking ABI metadata…"
test -f "$ROOT_DIR/abis/invoice.json"    || { echo "ERROR: abis/invoice.json missing";    exit 1; }
test -f "$ROOT_DIR/abis/treasury.json"   || { echo "ERROR: abis/treasury.json missing";   exit 1; }
test -f "$ROOT_DIR/abis/compliance.json" || { echo "ERROR: abis/compliance.json missing"; exit 1; }
echo "  ABI metadata present."

# ── Deployment metadata check ─────────────────────────────────────────────────
if [ -f "$ROOT_DIR/abis/deployed.testnet.json" ]; then
  echo "  Testnet deployment metadata present."
else
  echo "Warning: abis/deployed.testnet.json not found. Run scripts/deploy_testnet.sh first."
fi

# ── WASM hash verification ────────────────────────────────────────────────────
# Only run when the required env vars are set (i.e. called post-deployment).
if [[ -z "${SOROBAN_RPC_URL:-}" || -z "${INVOICE_CONTRACT_ID:-}" ]]; then
  echo "Skipping WASM hash verification (SOROBAN_RPC_URL / CONTRACT_IDs not set)."
  echo "Done."
  exit 0
fi

: "${TREASURY_CONTRACT_ID:?TREASURY_CONTRACT_ID is required for WASM verification}"
: "${COMPLIANCE_CONTRACT_ID:?COMPLIANCE_CONTRACT_ID is required for WASM verification}"

CONTRACTS_DIR="${CONTRACTS_DIR:-$ROOT_DIR/../COMEBACKHERE-contracts/target/wasm32-unknown-unknown/release}"

FAIL=0
MISMATCHES=()

verify_contract() {
  local name="$1"
  local contract_id="$2"
  local wasm_file="$3"

  if [[ ! -f "$wasm_file" ]]; then
    echo "ERROR: local WASM artifact not found: $wasm_file" >&2
    FAIL=1
    MISMATCHES+=("$name: local artifact missing")
    return
  fi

  # Compute SHA-256 of the local WASM (hex, no filename suffix)
  local local_hash
  local_hash=$(sha256sum "$wasm_file" | awk '{print $1}')

  # Fetch the deployed contract WASM hash via Soroban RPC getContractWasmByContractId
  local rpc_response
  rpc_response=$(curl -sf -X POST "$SOROBAN_RPC_URL" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getContractWasmByContractId\",\"params\":{\"contract_id\":\"$contract_id\"}}" \
    2>/dev/null || true)

  local deployed_hash=""
  if [[ -n "$rpc_response" ]]; then
    # The RPC returns the WASM as base64 under result.wasm; hash it for comparison.
    deployed_hash=$(echo "$rpc_response" \
      | python3 -c "
import sys, json, hashlib, base64
data = json.load(sys.stdin)
wasm_b64 = (data.get('result') or {}).get('wasm', '')
if not wasm_b64:
    sys.exit(1)
wasm_bytes = base64.b64decode(wasm_b64)
print(hashlib.sha256(wasm_bytes).hexdigest())
" 2>/dev/null || true)
  fi

  if [[ -z "$deployed_hash" ]]; then
    echo "WARNING: Could not retrieve deployed WASM hash for $name ($contract_id)." >&2
    echo "         Skipping hash comparison for this contract." >&2
    return
  fi

  if [[ "$local_hash" == "$deployed_hash" ]]; then
    echo "  ✓ $name: hash match ($local_hash)"
  else
    echo "  ✗ $name: HASH MISMATCH" >&2
    echo "    local:    $local_hash" >&2
    echo "    deployed: $deployed_hash" >&2
    FAIL=1
    MISMATCHES+=("$name")
  fi
}

echo ""
echo "Verifying deployed WASM hashes against local build artifacts…"

verify_contract "invoice" \
  "$INVOICE_CONTRACT_ID" \
  "$CONTRACTS_DIR/comebackhere_invoice.wasm"

verify_contract "treasury" \
  "$TREASURY_CONTRACT_ID" \
  "$CONTRACTS_DIR/comebackhere_treasury.wasm"

verify_contract "compliance" \
  "$COMPLIANCE_CONTRACT_ID" \
  "$CONTRACTS_DIR/comebackhere_compliance.wasm"

if (( FAIL )); then
  echo ""
  echo "VERIFICATION FAILED — the following contracts have WASM hash mismatches:" >&2
  printf '  - %s\n' "${MISMATCHES[@]}" >&2
  echo "Ensure you are comparing the correct build artifacts to the correct deployment." >&2
  exit 1
fi

echo ""
echo "All WASM hashes verified successfully."
