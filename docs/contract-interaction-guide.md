# Contract Interaction Guide

Step-by-step guide for calling COMEBACKHERE Protocol contracts via `soroban-cli` and the backend API.

## Prerequisites

- Funded Stellar account on the target network
- Deployed contracts — IDs available in `artifacts/addresses.json`
- Configured `.env` (copy from `.env.local.example` or `.env.testnet.example`)
- `soroban-cli` installed: `cargo install soroban-cli`

Placeholder values used throughout:

| Placeholder           | Replace with                                     |
| --------------------- | ------------------------------------------------ |
| `$INVOICE_CONTRACT`   | Invoice contract ID from `artifacts/addresses.json` |
| `$TREASURY_CONTRACT`  | Treasury contract ID                             |
| `$COMPLIANCE_CONTRACT`| Compliance contract ID                           |
| `$SOURCE_ACCOUNT`     | Your funded Stellar public key                   |
| `$SECRET_KEY`         | Your Stellar secret key                          |
| `$RPC_URL`            | Soroban RPC endpoint (e.g. `http://localhost:8000/soroban/rpc`) |
| `$NETWORK_PASSPHRASE` | Network passphrase from your `.env`              |

---

## Invoice Contract

### Create an invoice

#### soroban-cli

```sh
soroban contract invoke \
  --id $INVOICE_CONTRACT \
  --source $SECRET_KEY \
  --rpc-url $RPC_URL \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- create_invoice \
  --merchant $SOURCE_ACCOUNT \
  --customer GCUSTOMER... \
  --amount 1000000 \
  --token CUSDC... \
  --expires_at 1750000000 \
  --nonce 1
```

#### API

```sh
curl -X POST http://localhost:3000/invoices \
  -H "Content-Type: application/json" \
  -d '{
    "merchant_address": "$SOURCE_ACCOUNT",
    "token": "USDC",
    "amount": 1000000,
    "due_date": 1750000000
  }'
```

Response includes `invoice_id` to use in subsequent calls.

---

### Get invoice status

#### soroban-cli

```sh
soroban contract invoke \
  --id $INVOICE_CONTRACT \
  --source $SECRET_KEY \
  --rpc-url $RPC_URL \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- get_invoice_status \
  --invoice_id 1
```

#### API

```sh
curl http://localhost:3000/invoices/1
```

---

### Mark invoice as paid

#### soroban-cli

```sh
soroban contract invoke \
  --id $INVOICE_CONTRACT \
  --source $SECRET_KEY \
  --rpc-url $RPC_URL \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- mark_paids \
  --invoice_ids '[1]'
```

---

### Raise a dispute

Calling `raise_dispute` on the invoice contract atomically calls
`raise_dispute` on the treasury contract, placing the referenced
settlement `OnHold`.

#### soroban-cli

```sh
soroban contract invoke \
  --id $INVOICE_CONTRACT \
  --source $SECRET_KEY \
  --rpc-url $RPC_URL \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- raise_dispute \
  --invoice_id 1 \
  --settlement_id 3 \
  --claimant $SOURCE_ACCOUNT \
  --reason 1
```

#### API

```sh
curl -X POST http://localhost:3000/disputes \
  -H "Content-Type: application/json" \
  -d '{
    "claimant_address": "$SOURCE_ACCOUNT",
    "settlement_id": "3",
    "reason": "Goods not delivered"
  }'
```

---

### Configure treasury address (admin only)

```sh
soroban contract invoke \
  --id $INVOICE_CONTRACT \
  --source $SECRET_KEY \
  --rpc-url $RPC_URL \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- set_treasury \
  --caller $SOURCE_ACCOUNT \
  --treasury $TREASURY_CONTRACT
```

---

## Treasury Contract

### Propose a settlement

#### soroban-cli

```sh
soroban contract invoke \
  --id $TREASURY_CONTRACT \
  --source $SECRET_KEY \
  --rpc-url $RPC_URL \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- propose_settlement \
  --signer $SOURCE_ACCOUNT \
  --token CUSDC... \
  --amount 5000000 \
  --merchant GMERCHANT...
```

Returns the `settlement_id`.

---

### Approve a settlement

#### soroban-cli

```sh
soroban contract invoke \
  --id $TREASURY_CONTRACT \
  --source $SECRET_KEY \
  --rpc-url $RPC_URL \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- approve_settlement \
  --signer $SOURCE_ACCOUNT \
  --settlement_id 1
```

#### API

```sh
curl -X POST http://localhost:3000/api/treasury/approve-settlement \
  -H "Content-Type: application/json" \
  -d '{ "settlement_id": 1 }'
```

---

### Execute a settlement

#### soroban-cli

```sh
soroban contract invoke \
  --id $TREASURY_CONTRACT \
  --source $SECRET_KEY \
  --rpc-url $RPC_URL \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- execute_settlement \
  --signer $SOURCE_ACCOUNT \
  --settlement_id 1 \
  --token_contract CUSDC...
```

#### API

The execute endpoint validates the treasury USDC balance before submitting.

```sh
curl -X POST http://localhost:3000/api/treasury/execute-settlement \
  -H "Content-Type: application/json" \
  -d '{ "settlement_id": 1 }'
```

---


### Place a settlement on hold

Calls `hold_settlement` on the treasury contract, preventing execution until
explicitly released or escalated.

#### soroban-cli

```sh
soroban contract invoke \\
  --id $TREASURY_CONTRACT \\
  --source $SECRET_KEY \\
  --rpc-url $RPC_URL \\
  --network-passphrase "$NETWORK_PASSPHRASE" \\
  -- hold_settlement \\
  --signer $SOURCE_ACCOUNT \\
  --settlement_id 7 \\
  --reason "Awaiting KYC confirmation"
```

---

### Release a hold

Calls `release_hold` on the treasury contract, returning the settlement to `Pending`
so the normal approval and execution flow can resume.

#### soroban-cli

```sh
soroban contract invoke \\
  --id $TREASURY_CONTRACT \\
  --source $SECRET_KEY \\
  --rpc-url $RPC_URL \\
  --network-passphrase "$NETWORK_PASSPHRASE" \\
  -- release_hold \\
  --signer $SOURCE_ACCOUNT \\
  --settlement_id 7
```

#### API

```sh
curl -X POST http://localhost:3000/api/treasury/release-hold \\
  -H "Content-Type: application/json" \\
  -d '{ "settlement_id": 7 }'
```

---

### Raise a dispute (escalate hold)

Calls `raise_dispute` on the treasury contract, escalating the hold to the
governance dispute-resolution flow and beginning a multi-sig vote.

#### soroban-cli

```sh
soroban contract invoke \\
  --id $TREASURY_CONTRACT \\
  --source $SECRET_KEY \\
  --rpc-url $RPC_URL \\
  --network-passphrase "$NETWORK_PASSPHRASE" \\
  -- raise_dispute \\
  --signer $SOURCE_ACCOUNT \\
  --settlement_id 7 \\
  --reason "Merchant disputes the invoice amount"
```

#### API

```sh
curl -X POST http://localhost:3000/api/treasury/escalate-hold \\
  -H "Content-Type: application/json" \\
  -d '{ "settlement_id": 7, "reason": "Merchant disputes the invoice amount" }'
```

---

### Get / set approval threshold

#### soroban-cli — read

```sh
soroban contract invoke \
  --id $TREASURY_CONTRACT \
  --source $SECRET_KEY \
  --rpc-url $RPC_URL \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- get_threshold
```

#### soroban-cli — update

```sh
soroban contract invoke \
  --id $TREASURY_CONTRACT \
  --source $SECRET_KEY \
  --rpc-url $RPC_URL \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- update_threshold \
  --admin $SOURCE_ACCOUNT \
  --new_threshold 3
```

#### API — read

```sh
curl http://localhost:3000/api/treasury/threshold
```

#### API — update

```sh
curl -X POST http://localhost:3000/api/treasury/threshold \
  -H "Content-Type: application/json" \
  -d '{ "threshold": 3 }'
```

---

## Compliance Contract

### Allow an address

#### soroban-cli

```sh
soroban contract invoke \
  --id $COMPLIANCE_CONTRACT \
  --source $SECRET_KEY \
  --rpc-url $RPC_URL \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- allow_address \
  --admin $SOURCE_ACCOUNT \
  --address GTARGET...
```

---

### Block an address

#### soroban-cli

```sh
soroban contract invoke \
  --id $COMPLIANCE_CONTRACT \
  --source $SECRET_KEY \
  --rpc-url $RPC_URL \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- block_address \
  --admin $SOURCE_ACCOUNT \
  --address GTARGET...
```

---

## Invoice grace window

### Read

#### soroban-cli

```sh
soroban contract invoke \
  --id $INVOICE_CONTRACT \
  --source $SECRET_KEY \
  --rpc-url $RPC_URL \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- get_grace_window
```

#### API

```sh
curl http://localhost:3000/api/invoice/grace-window
```

### Update (admin only)

#### soroban-cli

```sh
soroban contract invoke \
  --id $INVOICE_CONTRACT \
  --source $SECRET_KEY \
  --rpc-url $RPC_URL \
  --network-passphrase "$NETWORK_PASSPHRASE" \
  -- set_grace_window \
  --caller $SOURCE_ACCOUNT \
  --window 172800
```

#### API

```sh
curl -X POST http://localhost:3000/api/invoice/grace-window \
  -H "Content-Type: application/json" \
  -d '{ "grace_window_seconds": 172800 }'
```

---

## Tips

- All contract write operations require `--source` to be a funded account with sufficient XLM for fees.
- Use `--network testnet` instead of `--rpc-url` / `--network-passphrase` flags when targeting Testnet via the CLI default configuration.
- Contract IDs and addresses are exported to `artifacts/addresses.json` after running a deployment script.
