#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
source scripts/validate_env.sh .env.testnet testnet deployment

mkdir -p abis

: "${SOROBAN_RPC_URL:=https://soroban-testnet.stellar.org}"
: "${STELLAR_NETWORK:=testnet}"

echo "Building COMEBACKHERE contracts for $STELLAR_NETWORK via $SOROBAN_RPC_URL"
# Build from the contracts repo (sibling directory)
(cd ../COMEBACKHERE-contracts && cargo build --target wasm32-unknown-unknown --release)

cat > abis/deployed.testnet.json <<JSON
{
  "network": "$STELLAR_NETWORK",
  "rpc_url": "$SOROBAN_RPC_URL",
  "invoice_contract_id": "${INVOICE_CONTRACT_ID:-C...}",
  "treasury_contract_id": "${TREASURY_CONTRACT_ID:-C...}",
  "compliance_contract_id": "${COMPLIANCE_CONTRACT_ID:-C...}",
  "generated_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
JSON

echo "Contract deployment metadata written to abis/deployed.testnet.json"
echo "Replace placeholder IDs with soroban contract deploy output before backend integration."

if [ -f .env.testnet ]; then
  # shellcheck disable=SC1091
  set -a
  source .env.testnet
  set +a
fi

export STELLAR_NETWORK="${STELLAR_NETWORK:-testnet}"
export INVOICE_CONTRACT_ID="${INVOICE_CONTRACT_ID:-C...}"
export TREASURY_CONTRACT_ID="${TREASURY_CONTRACT_ID:-C...}"
export COMPLIANCE_CONTRACT_ID="${COMPLIANCE_CONTRACT_ID:-C...}"
scripts/export_deployed_addresses.sh
