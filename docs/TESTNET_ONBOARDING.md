# COMEBACKHERE Testnet Onboarding Guide

This guide walks you through the complete end-to-end flow on the Stellar testnet:
funding an account, deploying contracts, creating an invoice, paying it with USDC,
and executing a settlement.

## Prerequisites

- [Rust](https://rustup.rs/) with the `wasm32-unknown-unknown` target installed
- [Stellar CLI (`stellar`)](https://github.com/stellar/stellar-cli) v21+
- [Docker & Docker Compose](https://docs.docker.com/get-docker/) (for local Soroban node, optional)
- A text editor and terminal

## 1. Create and Fund a Testnet Account

Stellar testnet provides Friendbot, a faucet that funds any testnet account with
10,000 XLM.

### Generate a keypair

```sh
stellar keys generate testnet-admin --network testnet
stellar keys address testnet-admin
# Outputs: GXXXX... (your public key)
```

### Fund via Friendbot

```sh
curl "https://friendbot.stellar.org/?addr=$(stellar keys address testnet-admin)"
```

You should receive a JSON response confirming the account was created and funded.
Verify the balance:

```sh
stellar keys address testnet-admin
# Check on https://horizon-testnet.stellar.org/accounts/<YOUR_PUBLIC_KEY>
```

### Create additional accounts

You will need at least two accounts for the full flow — one acts as the merchant
(invoice creator) and one acts as the payer.

```sh
stellar keys generate testnet-merchant --network testnet
curl "https://friendbot.stellar.org/?addr=$(stellar keys address testnet-merchant)"

stellar keys generate testnet-payer --network testnet
curl "https://friendbot.stellar.org/?addr=$(stellar keys address testnet-payer)"
```

## 2. Configure Environment

Copy the testnet example environment and fill in your keys:

```sh
cp .env.testnet.example .env.testnet
```

Edit `.env.testnet`:

```env
STELLAR_NETWORK=testnet
HORIZON_URL=https://horizon-testnet.stellar.org
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
ADMIN_PUBLIC_KEY=<testnet-admin public key>
ADMIN_SECRET_KEY=<testnet-admin secret key>
```

Leave the contract ID fields empty for now — they will be populated after deployment.

## 3. Build the COMEBACKHERE Contracts

The Soroban smart contracts live in the `COMEBACKHERE-contracts/` directory.

```sh
cd COMEBACKHERE-contracts/

# Ensure you have the WASM target
rustup target add wasm32-unknown-unknown

# Run checks
cargo fmt --all -- --check
cargo clippy -- -D warnings
cargo test

# Build WASM artifacts
cargo build --target wasm32-unknown-unknown --release
```

The compiled WASM binaries are output to
`target/wasm32-unknown-unknown/release/`. You should see:

- `comebackhere_invoice.wasm`
- `comebackhere_treasury.wasm`
- `comebackhere_compliance.wasm`

## 4. Deploy Contracts to Testnet

Deploy each contract using the Stellar CLI. Replace `<WASM_PATH>` with the actual
path to each compiled `.wasm` file.

### Deploy the Invoice contract

```sh
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/comebackhere_invoice.wasm \
  --network testnet \
  --source testnet-admin
# Outputs: CXXXX... (INVOICE_CONTRACT_ID)
```

### Deploy the Treasury contract

```sh
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/comebackhere_treasury.wasm \
  --network testnet \
  --source testnet-admin
# Outputs: CXXXX... (TREASURY_CONTRACT_ID)
```

### Deploy the Compliance contract

```sh
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/comebackhere_compliance.wasm \
  --network testnet \
  --source testnet-admin
# Outputs: CXXXX... (COMPLIANCE_CONTRACT_ID)
```

### Update your environment

Add the contract IDs to `.env.testnet`:

```env
INVOICE_CONTRACT_ID=CXXXX...
TREASURY_CONTRACT_ID=CXXXX...
COMPLIANCE_CONTRACT_ID=CXXXX...
```

### Alternative: use the deploy script

You can also use the provided deploy script, which builds and deploys in one step:

```sh
cd ..  # back to repo root
scripts/deploy_testnet.sh
```

The script writes deployment metadata to `abis/deployed.testnet.json` and exports
addresses to `artifacts/addresses.json`.

## 5. Initialize the Contracts

After deployment, initialize each contract with the admin account and required
configuration.

### Initialize the Invoice contract

```sh
stellar contract invoke \
  --id $INVOICE_CONTRACT_ID \
  --network testnet \
  --source testnet-admin \
  -- initialize \
  --admin $(stellar keys address testnet-admin) \
  --treasury $TREASURY_CONTRACT_ID \
  --compliance $COMPLIANCE_CONTRACT_ID \
  --usdc_token $USDC_CONTRACT_ID
```

### Initialize the Treasury contract

```sh
stellar contract invoke \
  --id $TREASURY_CONTRACT_ID \
  --network testnet \
  --source testnet-admin \
  -- initialize \
  --admin $(stellar keys address testnet-admin)
```

### Initialize the Compliance contract

```sh
stellar contract invoke \
  --id $COMPLIANCE_CONTRACT_ID \
  --network testnet \
  --source testnet-admin \
  -- initialize \
  --admin $(stellar keys address testnet-admin)
```

### Allow the payer address in compliance

```sh
stellar contract invoke \
  --id $COMPLIANCE_CONTRACT_ID \
  --network testnet \
  --source testnet-admin \
  -- allow_address \
  --addr $(stellar keys address testnet-payer) \
  --caller $(stellar keys address testnet-admin)
```

## 6. Obtain Testnet USDC

On testnet, you need a USDC token contract. If the COMEBACKHERE team has deployed
a testnet USDC mock, use that contract ID. Otherwise, deploy a simple SAC
(Stellar Asset Contract) wrapper for a custom USDC asset:

```sh
# Create a USDC issuer
stellar keys generate usdc-issuer --network testnet
curl "https://friendbot.stellar.org/?addr=$(stellar keys address usdc-issuer)"

# Wrap the asset as a Soroban token
stellar contract asset deploy \
  --asset USDC:$(stellar keys address usdc-issuer) \
  --network testnet \
  --source usdc-issuer
# Outputs: CXXXX... (USDC_CONTRACT_ID)
```

Add `USDC_CONTRACT_ID` to your `.env.testnet`.

### Mint USDC to the payer

Establish a trustline and send USDC to the payer account:

```sh
# Payer establishes trustline
stellar tx new change-trust \
  --asset USDC:$(stellar keys address usdc-issuer) \
  --source testnet-payer \
  --network testnet \
  --sign \
  --send

# Issuer sends USDC to the payer
stellar tx new payment \
  --destination $(stellar keys address testnet-payer) \
  --asset USDC:$(stellar keys address usdc-issuer) \
  --amount 10000 \
  --source usdc-issuer \
  --network testnet \
  --sign \
  --send
```

## 7. Create an Invoice

Use the merchant account to create an invoice:

```sh
stellar contract invoke \
  --id $INVOICE_CONTRACT_ID \
  --network testnet \
  --source testnet-merchant \
  -- create_invoice \
  --merchant $(stellar keys address testnet-merchant) \
  --amount 1000000000 \
  --memo "Test invoice #1"
# Outputs: invoice ID (e.g. 1)
```

The amount is in stroops (1 USDC = 10,000,000 stroops), so `1000000000` = 100 USDC.

### Verify the invoice

```sh
stellar contract invoke \
  --id $INVOICE_CONTRACT_ID \
  --network testnet \
  --source testnet-admin \
  -- get_invoice \
  --invoice_id 1
```

You should see the invoice details including status `Pending`, the merchant
address, and the amount.

## 8. Pay the Invoice with USDC

The payer approves the USDC transfer and pays the invoice:

```sh
# Approve the invoice contract to spend payer's USDC
stellar contract invoke \
  --id $USDC_CONTRACT_ID \
  --network testnet \
  --source testnet-payer \
  -- approve \
  --from $(stellar keys address testnet-payer) \
  --spender $INVOICE_CONTRACT_ID \
  --amount 1000000000 \
  --expiration_ledger 999999999

# Pay the invoice
stellar contract invoke \
  --id $INVOICE_CONTRACT_ID \
  --network testnet \
  --source testnet-payer \
  -- mark_paid \
  --invoice_id 1 \
  --payer $(stellar keys address testnet-payer)
```

### Verify payment

```sh
stellar contract invoke \
  --id $INVOICE_CONTRACT_ID \
  --network testnet \
  --source testnet-admin \
  -- get_invoice_status \
  --invoice_id 1
# Should return: "Paid"
```

## 9. Execute a Settlement

Once an invoice is paid, the treasury admin proposes and executes a settlement
to release funds to the merchant.

### Propose the settlement

```sh
stellar contract invoke \
  --id $TREASURY_CONTRACT_ID \
  --network testnet \
  --source testnet-admin \
  -- propose_settlement \
  --invoice_id 1 \
  --merchant $(stellar keys address testnet-merchant) \
  --amount 1000000000 \
  --token $USDC_CONTRACT_ID
```

### Approve the settlement

If multi-sig is configured, each required signer must approve:

```sh
stellar contract invoke \
  --id $TREASURY_CONTRACT_ID \
  --network testnet \
  --source testnet-admin \
  -- approve_settlement \
  --settlement_id 1
```

### Execute the settlement

```sh
stellar contract invoke \
  --id $TREASURY_CONTRACT_ID \
  --network testnet \
  --source testnet-admin \
  -- execute_settlement \
  --settlement_id 1
```

### Verify the settlement

Check that funds arrived in the merchant's account:

```sh
stellar contract invoke \
  --id $USDC_CONTRACT_ID \
  --network testnet \
  --source testnet-admin \
  -- balance \
  --id $(stellar keys address testnet-merchant)
```

## 10. Using the Frontend

You can also test the flow through the COMEBACKHERE frontend:

```sh
cd comebackhere-frontend/
npm install
npm run dev
```

1. Open the app in your browser (default: `http://localhost:5173`)
2. Connect your wallet (Freighter extension recommended)
3. Enter the invoice ID in the "Pay Invoice" tab
4. Confirm payment in the wallet popup
5. Verify the invoice status updates to "Paid"

## Troubleshooting

### "Account not found" errors

Your testnet account may have been reset. Stellar testnet is periodically wiped.
Re-fund via Friendbot:

```sh
curl "https://friendbot.stellar.org/?addr=<YOUR_PUBLIC_KEY>"
```

### Contract invocation fails with "not initialized"

Make sure you ran the `initialize` step for each contract (Step 5).

### USDC approval errors

The token approval may have expired. Re-run the `approve` invocation with a higher
`expiration_ledger`.

### Transaction simulation fails

Check that the Soroban RPC endpoint is healthy:

```sh
curl https://soroban-testnet.stellar.org/health
```

If the RPC is degraded, wait and retry. Testnet RPC can be intermittently slow.

### Testnet was reset

Stellar resets the testnet periodically. When this happens, all accounts and
contracts are wiped. You must re-run the full flow from Step 1.
