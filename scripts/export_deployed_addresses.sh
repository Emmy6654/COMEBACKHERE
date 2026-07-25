#!/usr/bin/env bash
# export_deployed_addresses.sh — write deployed contract IDs to artifacts/addresses.json
# and validate the output against the artifacts/addresses.json.example schema.
#
# Required environment variables:
#   STELLAR_NETWORK        — target network name (e.g. testnet, mainnet)
#   INVOICE_CONTRACT_ID    — deployed invoice contract address   (C…)
#   TREASURY_CONTRACT_ID   — deployed treasury contract address  (C…)
#   COMPLIANCE_CONTRACT_ID — deployed compliance contract address (C…)
#
# Optional:
#   DEPLOYED_ADDRESSES_FILE — override output path (default: artifacts/addresses.json)
#   DEPLOYED_ADDRESSES_ENV  — override shell env output path (default: artifacts/addresses.env)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_FILE="${DEPLOYED_ADDRESSES_FILE:-$ROOT_DIR/artifacts/addresses.json}"
ENV_FILE="${DEPLOYED_ADDRESSES_ENV:-$ROOT_DIR/artifacts/addresses.env}"
EXAMPLE_FILE="$ROOT_DIR/artifacts/addresses.json.example"

: "${STELLAR_NETWORK:?STELLAR_NETWORK is required}"
: "${INVOICE_CONTRACT_ID:?INVOICE_CONTRACT_ID is required}"
: "${TREASURY_CONTRACT_ID:?TREASURY_CONTRACT_ID is required}"
: "${COMPLIANCE_CONTRACT_ID:?COMPLIANCE_CONTRACT_ID is required}"

mkdir -p "$(dirname "$OUT_FILE")"
export LC_ALL=C
export LANG=C

# ── Write addresses.json ──────────────────────────────────────────────────────
python3 - "$OUT_FILE" <<'PY'
import json
import os
import sys

out_path = sys.argv[1]
payload = {
    "network": os.environ["STELLAR_NETWORK"],
    "contracts": [
        {"name": "invoice",    "address": os.environ["INVOICE_CONTRACT_ID"]},
        {"name": "treasury",   "address": os.environ["TREASURY_CONTRACT_ID"]},
        {"name": "compliance", "address": os.environ["COMPLIANCE_CONTRACT_ID"]},
    ],
}
with open(out_path, "w", encoding="utf-8", newline="\n") as handle:
    json.dump(payload, handle, indent=2, ensure_ascii=True)
    handle.write("\n")
PY

echo "Deployed addresses written to $OUT_FILE"

echo "Writing shell exports to $ENV_FILE"
cat > "$ENV_FILE" <<EOF
export STELLAR_NETWORK="$STELLAR_NETWORK"
export INVOICE_CONTRACT_ID="$INVOICE_CONTRACT_ID"
export TREASURY_CONTRACT_ID="$TREASURY_CONTRACT_ID"
export COMPLIANCE_CONTRACT_ID="$COMPLIANCE_CONTRACT_ID"
EOF

# ── Schema validation against addresses.json.example ─────────────────────────
if [[ ! -f "$EXAMPLE_FILE" ]]; then
  echo "WARNING: $EXAMPLE_FILE not found; skipping schema validation." >&2
  exit 0
fi

python3 - "$OUT_FILE" "$EXAMPLE_FILE" <<'PY'
import json
import sys

out_path = sys.argv[1]
example_path = sys.argv[2]

with open(out_path, encoding="utf-8") as f:
    actual = json.load(f)
with open(example_path, encoding="utf-8") as f:
    example = json.load(f)

errors = []

# Top-level key presence
for key in example:
    if key not in actual:
        errors.append(f"Missing top-level field: '{key}'")

# 'network' must be a non-empty string
if not isinstance(actual.get("network"), str) or not actual["network"].strip():
    errors.append("'network' must be a non-empty string")

# 'contracts' must be a list
if not isinstance(actual.get("contracts"), list):
    errors.append("'contracts' must be an array")
else:
    # Collect expected contract names from the example
    expected_names = {c["name"] for c in example.get("contracts", [])}
    actual_names   = {c.get("name") for c in actual["contracts"]}

    for name in expected_names:
        if name not in actual_names:
            errors.append(f"Missing contract entry: '{name}'")

    for entry in actual["contracts"]:
        cname   = entry.get("name", "<unnamed>")
        address = entry.get("address", "")
        if not address or not isinstance(address, str):
            errors.append(f"Contract '{cname}': 'address' is missing or empty")
        elif address.startswith("C...") or address == "C...":
            errors.append(f"Contract '{cname}': 'address' is still a placeholder ('{address}')")
        elif not address.startswith("C"):
            errors.append(f"Contract '{cname}': 'address' does not look like a Soroban contract ID (expected C…, got '{address[:8]}…')")

if errors:
    print("ERROR: artifacts/addresses.json schema validation failed:", file=sys.stderr)
    for e in errors:
        print(f"  - {e}", file=sys.stderr)
    sys.exit(1)

print("Schema validation passed.")
PY
