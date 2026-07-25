#!/usr/bin/env bash
#
# Integration test: full invoice lifecycle against a local Soroban environment.
#
# Prerequisites:
#   - docker-compose up -d  (Soroban standalone + Redis)
#   - soroban CLI installed
#   - Contracts deployed locally (scripts/deploy_local.sh)
#
# Usage:
#   ./tests/invoice_lifecycle.sh
#
# Environment:
#   SOROBAN_RPC_HOST      — Horizon endpoint (default: http://localhost:8000)
#   SOROBAN_NETWORK       — Network passphrase (default: standalone)
#   INVOICE_CONTRACT_ID   — Deployed invoice contract address
#   TREASURY_CONTRACT_ID  — Deployed treasury contract address
#   USDC_CONTRACT_ID      — Deployed USDC token contract address

set -euo pipefail

SOROBAN_RPC_HOST="${SOROBAN_RPC_HOST:-http://localhost:8000}"
SOROBAN_NETWORK="${SOROBAN_NETWORK:-standalone}"
NETWORK_PASSPHRASE="${NETWORK_PASSPHRASE:-Standalone Network ; February 2025}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass_count=0
fail_count=0

log_pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  pass_count=$((pass_count + 1))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  fail_count=$((fail_count + 1))
}

log_info() {
  echo -e "${YELLOW}[INFO]${NC} $1"
}

check_required_vars() {
  local missing=0
  for var in INVOICE_CONTRACT_ID TREASURY_CONTRACT_ID USDC_CONTRACT_ID; do
    if [ -z "${!var:-}" ]; then
      log_fail "Required environment variable $var is not set"
      missing=1
    fi
  done
  if [ "$missing" -eq 1 ]; then
    echo ""
    echo "Set these variables by running scripts/deploy_local.sh first, then:"
    echo "  source artifacts/addresses.env  # or export them manually"
    exit 1
  fi
}

wait_for_soroban() {
  log_info "Waiting for Soroban node at $SOROBAN_RPC_HOST ..."
  local retries=30
  while [ "$retries" -gt 0 ]; do
    if curl -sf "$SOROBAN_RPC_HOST/health" > /dev/null 2>&1; then
      log_pass "Soroban node is healthy"
      return 0
    fi
    retries=$((retries - 1))
    sleep 2
  done
  log_fail "Soroban node did not become healthy within 60 seconds"
  exit 1
}

generate_keypair() {
  local name="$1"
  soroban keys generate "$name" \
    --network "$SOROBAN_NETWORK" \
    --rpc-url "$SOROBAN_RPC_HOST/soroban/rpc" \
    --network-passphrase "$NETWORK_PASSPHRASE" 2>/dev/null || true
  soroban keys address "$name"
}

fund_account() {
  local address="$1"
  curl -sf "$SOROBAN_RPC_HOST/friendbot?addr=$address" > /dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------
# Test 1: Create an invoice
# ---------------------------------------------------------------------------
test_create_invoice() {
  log_info "Test 1: Creating an invoice ..."

  local merchant_address
  merchant_address=$(generate_keypair "test-merchant")
  fund_account "$merchant_address"

  local amount=10000000      # 10 USDC (7 decimal stroops)
  local gross=10500000       # 10.5 USDC including fees
  local expires_in=3600      # 1 hour

  local result
  result=$(soroban contract invoke \
    --id "$INVOICE_CONTRACT_ID" \
    --source test-merchant \
    --rpc-url "$SOROBAN_RPC_HOST/soroban/rpc" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- \
    create_invoice \
    --merchant "$merchant_address" \
    --amount_usdc "$amount" \
    --gross_usdc "$gross" \
    --expires_in_seconds "$expires_in" 2>&1) || true

  if echo "$result" | grep -qE '^[0-9]+$'; then
    INVOICE_ID="$result"
    log_pass "Invoice created with ID: $INVOICE_ID"
  else
    log_fail "Failed to create invoice: $result"
    INVOICE_ID=""
  fi

  MERCHANT_KEY="test-merchant"
  MERCHANT_ADDRESS="$merchant_address"
}

# ---------------------------------------------------------------------------
# Test 2: Pay the invoice with USDC
# ---------------------------------------------------------------------------
test_pay_invoice() {
  log_info "Test 2: Paying invoice with USDC ..."

  if [ -z "${INVOICE_ID:-}" ]; then
    log_fail "Skipped — no invoice ID from previous step"
    return
  fi

  local payer_address
  payer_address=$(generate_keypair "test-payer")
  fund_account "$payer_address"

  # Mint USDC to payer (assumes token contract has a mint or faucet function)
  soroban contract invoke \
    --id "$USDC_CONTRACT_ID" \
    --source test-payer \
    --rpc-url "$SOROBAN_RPC_HOST/soroban/rpc" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- \
    mint \
    --to "$payer_address" \
    --amount 50000000 2>/dev/null || log_info "USDC mint skipped (may require admin)"

  # Approve USDC transfer to invoice contract
  soroban contract invoke \
    --id "$USDC_CONTRACT_ID" \
    --source test-payer \
    --rpc-url "$SOROBAN_RPC_HOST/soroban/rpc" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- \
    approve \
    --from "$payer_address" \
    --spender "$INVOICE_CONTRACT_ID" \
    --amount 50000000 \
    --expiration_ledger 999999 2>/dev/null || log_info "USDC approve may not be needed"

  # Pay the invoice
  local result
  result=$(soroban contract invoke \
    --id "$INVOICE_CONTRACT_ID" \
    --source test-payer \
    --rpc-url "$SOROBAN_RPC_HOST/soroban/rpc" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- \
    pay_invoice \
    --invoice_id "${INVOICE_ID}" \
    --payer "$payer_address" 2>&1) || true

  if echo "$result" | grep -qiE 'error|fail|panic'; then
    log_fail "Payment failed: $result"
  else
    log_pass "Invoice $INVOICE_ID paid by $payer_address"
  fi

  PAYER_KEY="test-payer"
  PAYER_ADDRESS="$payer_address"
}

# ---------------------------------------------------------------------------
# Test 3: Trigger escrow release via treasury settlement
# ---------------------------------------------------------------------------
test_escrow_release() {
  log_info "Test 3: Triggering escrow release ..."

  if [ -z "${INVOICE_ID:-}" ]; then
    log_fail "Skipped — no invoice ID from previous steps"
    return
  fi

  local signer_address
  signer_address=$(generate_keypair "test-signer")
  fund_account "$signer_address"

  # Propose a settlement for the paid invoice amount
  local settlement_id
  settlement_id=$(soroban contract invoke \
    --id "$TREASURY_CONTRACT_ID" \
    --source test-signer \
    --rpc-url "$SOROBAN_RPC_HOST/soroban/rpc" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- \
    propose_settlement \
    --signer "$signer_address" \
    --token "$USDC_CONTRACT_ID" \
    --amount 10000000 \
    --merchant "$MERCHANT_ADDRESS" 2>&1) || true

  if ! echo "$settlement_id" | grep -qE '^[0-9]+$'; then
    log_fail "Failed to propose settlement: $settlement_id"
    return
  fi

  log_info "Settlement proposed with ID: $settlement_id"

  # Approve the settlement
  soroban contract invoke \
    --id "$TREASURY_CONTRACT_ID" \
    --source test-signer \
    --rpc-url "$SOROBAN_RPC_HOST/soroban/rpc" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- \
    approve_settlement \
    --signer "$signer_address" \
    --settlement_id "$settlement_id" 2>/dev/null || log_fail "Settlement approval failed"

  # Execute the settlement (escrow release)
  local result
  result=$(soroban contract invoke \
    --id "$TREASURY_CONTRACT_ID" \
    --source test-signer \
    --rpc-url "$SOROBAN_RPC_HOST/soroban/rpc" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- \
    execute_settlement \
    --signer "$signer_address" \
    --settlement_id "$settlement_id" \
    --token_contract "$USDC_CONTRACT_ID" 2>&1) || true

  if echo "$result" | grep -qiE 'error|fail|panic'; then
    log_fail "Escrow release failed: $result"
  else
    log_pass "Escrow released — settlement $settlement_id executed"
  fi
}

# ---------------------------------------------------------------------------
# Test 4: Verify invoice is below minimum amount (negative test)
# ---------------------------------------------------------------------------
test_invalid_invoice_amount() {
  log_info "Test 4: Rejecting invoice below minimum amount ..."

  local merchant_address
  merchant_address=$(generate_keypair "test-merchant-2")
  fund_account "$merchant_address"

  local result
  result=$(soroban contract invoke \
    --id "$INVOICE_CONTRACT_ID" \
    --source test-merchant-2 \
    --rpc-url "$SOROBAN_RPC_HOST/soroban/rpc" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- \
    create_invoice \
    --merchant "$merchant_address" \
    --amount_usdc 100 \
    --gross_usdc 100 \
    --expires_in_seconds 3600 2>&1) || true

  if echo "$result" | grep -qiE 'error|AmountPrecision|fail'; then
    log_pass "Correctly rejected invoice below minimum amount"
  else
    log_fail "Expected rejection for sub-minimum amount, got: $result"
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  echo "============================================"
  echo " COMEBACKHERE Integration Tests"
  echo " Invoice Lifecycle (Local Soroban)"
  echo "============================================"
  echo ""

  check_required_vars
  wait_for_soroban

  echo ""
  test_create_invoice
  echo ""
  test_pay_invoice
  echo ""
  test_escrow_release
  echo ""
  test_invalid_invoice_amount

  echo ""
  echo "============================================"
  echo -e " Results: ${GREEN}${pass_count} passed${NC}, ${RED}${fail_count} failed${NC}"
  echo "============================================"

  if [ "$fail_count" -gt 0 ]; then
    exit 1
  fi
}

main "$@"
