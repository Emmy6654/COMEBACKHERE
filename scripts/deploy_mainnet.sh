#!/usr/bin/env bash
# Mainnet deployment entry point for COMEBACKHERE Protocol.
#
# Live deployment requires governance approval, multi-sig signing, and a recorded
# signing ceremony — this script intentionally refuses to submit transactions from
# a single local shell.
#
# Use --dry-run to print the planned actions (contracts, addresses, network config)
# without submitting any transaction.  The output is formatted to be easy to paste
# into a deployment-checklist PR or issue.
#
# Usage:
#   scripts/deploy_mainnet.sh --dry-run   # preview only — zero network-mutating calls
#   scripts/deploy_mainnet.sh             # refuses; live deploy requires multi-sig ceremony
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--dry-run]" >&2
      exit 1
      ;;
  esac
done

# ── resolve env ───────────────────────────────────────────────────────────────

# shellcheck disable=SC1091
source scripts/validate_env.sh .env.mainnet mainnet deployment

# ── dry-run mode ──────────────────────────────────────────────────────────────

if [ "$DRY_RUN" -eq 1 ]; then
  ADMIN_PUBLIC_KEY="${ADMIN_PUBLIC_KEY:-<not set>}"
  USDC_CONTRACT_ID="${USDC_CONTRACT_ID:-<not set>}"
  TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  cat <<DRYRUN
========================================================
  COMEBACKHERE MAINNET DEPLOYMENT — DRY RUN
  Generated: $TIMESTAMP
  ** No transactions will be submitted **
========================================================

NETWORK CONFIGURATION
  STELLAR_NETWORK            : ${STELLAR_NETWORK:-<not set>}
  SOROBAN_RPC_URL            : ${SOROBAN_RPC_URL:-<not set>}
  SOROBAN_NETWORK_PASSPHRASE : ${SOROBAN_NETWORK_PASSPHRASE:-<not set>}

SIGNING AUTHORITY
  ADMIN_PUBLIC_KEY           : $ADMIN_PUBLIC_KEY

CONTRACT ADDRESSES
  INVOICE_CONTRACT_ID        : ${INVOICE_CONTRACT_ID:-<not set>}
  TREASURY_CONTRACT_ID       : ${TREASURY_CONTRACT_ID:-<not set>}
  COMPLIANCE_CONTRACT_ID     : ${COMPLIANCE_CONTRACT_ID:-<not set>}
  USDC_CONTRACT_ID           : $USDC_CONTRACT_ID

PLANNED ACTIONS
  [1] Verify WASM hashes match deployment-issue expectations
  [2] Verify Soroban RPC is reachable at ${SOROBAN_RPC_URL:-<not set>}
  [3] Verify ADMIN_PUBLIC_KEY is funded and authorised on ${STELLAR_NETWORK:-mainnet}
  [4] Deploy invoice contract       → INVOICE_CONTRACT_ID
  [5] Deploy treasury contract      → TREASURY_CONTRACT_ID
  [6] Deploy compliance contract    → COMPLIANCE_CONTRACT_ID
  [7] Initialize contracts with admin $ADMIN_PUBLIC_KEY
  [8] Export deployed addresses to artifacts/addresses.json
  [9] Run smoke tests (GET /health/rpc + low-value payment)

DRY RUN COMPLETE — review the above before running the signing ceremony.
Paste this output into the deployment-checklist PR as the pre-flight record.
========================================================
DRYRUN
  exit 0
fi

# ── live deploy — refused ─────────────────────────────────────────────────────

echo "Mainnet deployment requires multi-sig approval and an external signing ceremony."
echo "Refusing to deploy from a single local shell."
echo ""
echo "Run with --dry-run to preview planned actions without submitting transactions."
echo "See docs/MAINNET_DEPLOYMENT.md for the full ceremony checklist."
exit 1
