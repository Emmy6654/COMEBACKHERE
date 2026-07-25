#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source scripts/validate_env.sh .env.local standalone deployment

mkdir -p abis

: "${SOROBAN_RPC_URL:=http://localhost:8000/soroban/rpc}"
: "${STELLAR_NETWORK:=standalone}"

echo "Building COMEBACKHERE contracts for local standalone network via $SOROBAN_RPC_URL"
# Build from the contracts repo (sibling directory)
(cd ../COMEBACKHERE-contracts && cargo build --target wasm32-unknown-unknown --release)

cat > abis/deployed.local.json <<JSON
{
  "network": "$STELLAR_NETWORK",
  "rpc_url": "$SOROBAN_RPC_URL",
  "invoice_contract_id": "${INVOICE_CONTRACT_ID:-C...}",
  "treasury_contract_id": "${TREASURY_CONTRACT_ID:-C...}",
  "compliance_contract_id": "${COMPLIANCE_CONTRACT_ID:-C...}",
  "generated_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
JSON

echo "Local contract deployment metadata written to abis/deployed.local.json"
echo "Replace placeholder IDs with actual deployed contract IDs before backend integration."

genenv() {
  if [ -f .env.local ]; then
    # shellcheck disable=SC1091
    set -a
    source .env.local
    set +a
  fi
}

genenv

export STELLAR_NETWORK="${STELLAR_NETWORK:-standalone}"
export INVOICE_CONTRACT_ID="${INVOICE_CONTRACT_ID:-C...}"
export TREASURY_CONTRACT_ID="${TREASURY_CONTRACT_ID:-C...}"
export COMPLIANCE_CONTRACT_ID="${COMPLIANCE_CONTRACT_ID:-C...}"

scripts/export_deployed_addresses.sh
