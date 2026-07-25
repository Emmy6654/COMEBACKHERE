# Contract Interaction Guide

This guide provides realistic `soroban` CLI examples for interacting with the three COMEBACKHERE contracts — **invoice**, **treasury**, and **compliance** — deployed on Stellar testnet or mainnet.

> **Prerequisites**
>
> - [Soroban CLI](https://developers.stellar.org/docs/soroban/soroban-cli) installed
> - Contract IDs for each deployed contract
> - A funded Stellar account with its secret key configured locally:
>
>   ```sh
>   soroban config identity generate alice
>   soroban config identity fund alice
>   ```

---

## Common Flags

All examples assume the following aliased flags. Adjust values for your network.

```sh
# Testnet
NETWORK="--network testnet"
RPC="--rpc-url https://soroban-testnet.stellar.org"
PASSPHRASE="--network-passphrase 'Test SDF Network ; September 2025'"

# Mainnet
# NETWORK="--network mainnet"
# RPC="--rpc-url https://soroban-mainnet.stellar.org"
# PASSPHRASE="--network-passphrase 'Public Global Stellar Network ; September 2025'"

# Shortcut alias
SOROBAN="soroban contract invoke $NETWORK $RPC $PASSPHRASE"
```

---

## Invoice Contract

### Create an Invoice

```sh
$SOROBAN \
  --id <INVOICE_CONTRACT_ID> \
  --source alice \
  -- \
  create_invoice \
  --merchant "$(soroban config identity address alice)" \
  --amount_usdc 10000000 \
  --gross_usdc 10500000 \
  --expires_in_seconds 3600 \
  --metadata_hash "0xabcd...1234" \
  --payment_link_hash "0xef56...7890"
```

### Mark an Invoice as Paid

```sh
$SOROBAN \
  --id <INVOICE_CONTRACT_ID> \
  --source admin \
  -- \
  mark_paid \
  --invoice_id 1 \
  --payer "$(soroban config identity address bob)"
```

### Request a Refund

```sh
$SOROBAN \
  --id <INVOICE_CONTRACT_ID> \
  --source bob \
  -- \
  request_refund \
  --invoice_id 1
```

### Release Escrow

```sh
$SOROBAN \
  --id <INVOICE_CONTRACT_ID> \
  --source admin \
  -- \
  release_escrow \
  --invoice_id 1
```

---

## Treasury Contract

### Propose a Settlement

```sh
$SOROBAN \
  --id <TREASURY_CONTRACT_ID> \
  --source signer_a \
  -- \
  propose_settlement \
  --merchant_address "$(soroban config identity address merchant)" \
  --token_contract "$(soroban config identity address usdc)" \
  --amount 10000000 \
  --memo "Invoice #1 settlement"
```

### Approve a Settlement

```sh
$SOROBAN \
  --id <TREASURY_CONTRACT_ID> \
  --source signer_b \
  -- \
  approve_settlement \
  --settlement_id 1
```

### Execute a Settlement

```sh
$SOROBAN \
  --id <TREASURY_CONTRACT_ID> \
  --source signer_a \
  -- \
  execute_settlement \
  --settlement_id 1
```

### Raise a Dispute

```sh
$SOROBAN \
  --id <TREASURY_CONTRACT_ID> \
  --source bob \
  -- \
  raise_dispute \
  --settlement_id 1 \
  --reason "Goods not received"
```

---

## Compliance Contract

The **compliance** contract maintains an allowlist of Stellar addresses permitted to participate in the protocol. It supports temporary grants, full blocking, and secure admin delegation.

### Check if an Address Is Allowed

```sh
$SOROBAN \
  --id <COMPLIANCE_CONTRACT_ID> \
  --source alice \
  -- \
  is_allowed \
  --address "$(soroban config identity address alice)"
```

Returns `true` if the address is currently allowlisted.

### Add an Address to the Allowlist (`allow_address`)

Permanently adds a Stellar address to the allowlist. Only the contract admin may call this.

```sh
$SOROBAN \
  --id <COMPLIANCE_CONTRACT_ID> \
  --source admin \
  -- \
  allow_address \
  --address "$(soroban config identity address merchant)"
```

After execution, `is_allowed` returns `true` for the merchant address.

### Block an Address (`block_address`)

Removes a Stellar address from the allowlist entirely, revoking all participation rights.

```sh
$SOROBAN \
  --id <COMPLIANCE_CONTRACT_ID> \
  --source admin \
  -- \
  block_address \
  --address "$(soroban config identity address malicious_actor)"
```

The blocked address can be re-added later with another `allow_address` call.

### Allow an Address Until a Specific Time (`allow_address_until`)

Grants temporary access until a specified Unix timestamp (in seconds). After the timestamp passes, `is_allowed` returns `false` for that address.

```sh
# Allow merchant until January 1, 2027 00:00:00 UTC
$SOROBAN \
  --id <COMPLIANCE_CONTRACT_ID> \
  --source admin \
  -- \
  allow_address_until \
  --address "$(soroban config identity address merchant)" \
  --until 1798761600
```

### Clear an Address (`clear_address`)

Resets an address's compliance state to its default (neither explicitly allowed nor blocked). This is useful for cleaning up after a temporary grant expires or resetting a test address.

```sh
$SOROBAN \
  --id <COMPLIANCE_CONTRACT_ID> \
  --source admin \
  -- \
  clear_address \
  --address "$(soroban config identity address merchant)"
```

### Admin Transfer Flow (`transfer_admin` / `accept_admin`)

Admin ownership of the compliance contract is transferred in two steps to prevent accidental lockout.

**Step 1 — Current admin nominates a new admin:**

```sh
$SOROBAN \
  --id <COMPLIANCE_CONTRACT_ID> \
  --source admin \
  -- \
  transfer_admin \
  --new_admin "$(soroban config identity address new_admin)"
```

**Step 2 — The nominated admin accepts the role:**

```sh
$SOROBAN \
  --id <COMPLIANCE_CONTRACT_ID> \
  --source new_admin \
  -- \
  accept_admin
```

After step 2 completes, `new_admin` becomes the contract admin and the previous admin loses admin privileges.

> **Note:** If `accept_admin` is never called, the original admin remains in control. There is no timeout on the pending transfer.

---

## Cross-Contract Workflow

A typical end-to-end flow touches all three contracts:

1. **Compliance**: Admin adds the merchant to the allowlist (`allow_address`).
2. **Invoice**: Merchant creates an invoice (`create_invoice`).
3. **Invoice**: Admin marks the invoice as paid (`mark_paid`).
4. **Invoice**: Admin releases escrow (`release_escrow`).
5. **Treasury**: A signer proposes settlement (`propose_settlement`).
6. **Treasury**: Additional signers approve (`approve_settlement`).
7. **Treasury**: A signer executes the settlement (`execute_settlement`).

```sh
# 1. Allowlist the merchant
$SOROBAN --id <COMPLIANCE_CONTRACT_ID> --source admin -- \
  allow_address --address "$(soroban config identity address merchant)"

# 2. Create and process the invoice
$SOROBAN --id <INVOICE_CONTRACT_ID> --source merchant -- \
  create_invoice --merchant "$(soroban config identity address merchant)" \
  --amount_usdc 10000000 --gross_usdc 10500000 --expires_in_seconds 86400

$SOROBAN --id <INVOICE_CONTRACT_ID> --source admin -- \
  mark_paid --invoice_id 1 --payer "$(soroban config identity address payer)"

# 3. Settle through the treasury
$SOROBAN --id <TREASURY_CONTRACT_ID> --source signer_a -- \
  propose_settlement --merchant_address "$(soroban config identity address merchant)" \
  --token_contract <USDC_CONTRACT_ID> --amount 10000000 --memo "Invoice #1"

$SOROBAN --id <TREASURY_CONTRACT_ID> --source signer_b -- \
  approve_settlement --settlement_id 1

$SOROBAN --id <TREASURY_CONTRACT_ID> --source signer_a -- \
  execute_settlement --settlement_id 1
```

## Reference: Function Signatures

| Contract     | Function               | Key Parameters                                                                                                                      |
|--------------|------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| Invoice      | `create_invoice`       | `merchant`, `amount_usdc`, `gross_usdc`, `expires_in_seconds`, `metadata_hash?`, `payment_link_hash?`                               |
| Invoice      | `mark_paid`            | `invoice_id`, `payer`                                                                                                               |
| Invoice      | `request_refund`       | `invoice_id`                                                                                                                        |
| Invoice      | `release_escrow`       | `invoice_id`                                                                                                                        |
| Treasury     | `propose_settlement`   | `merchant_address`, `token_contract`, `amount`, `memo?`                                                                             |
| Treasury     | `approve_settlement`   | `settlement_id`                                                                                                                     |
| Treasury     | `execute_settlement`   | `settlement_id`                                                                                                                     |
| Treasury     | `raise_dispute`        | `settlement_id`, `reason?`                                                                                                          |
| Compliance   | `is_allowed`           | `address` — returns `true` if the address is allowlisted                                                                            |
| Compliance   | `allow_address`        | `address`                                                                                                                           |
| Compliance   | `block_address`        | `address`                                                                                                                           |
| Compliance   | `allow_address_until`  | `address`, `until: u64`                                                                                                             |
| Compliance   | `transfer_admin`       | `new_admin`                                                                                                                         |
| Compliance   | `accept_admin`         | _(no params)_                                                                                                                       |
| Compliance   | `clear_address`        | `address`                                                                                                                           |
