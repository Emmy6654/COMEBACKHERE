# Testnet Onboarding Guide

This guide walks through setting up a browser wallet on Stellar testnet for use with **comebackhere-frontend** — the payer-facing application where users pay invoices and request refunds.

> **Note:** For the merchant dashboard (admin/signer UI), see `comebackhere-frontend`'s own setup docs in that repository. This guide focuses on the **payer** experience.

---

## Prerequisites

- A browser-based Stellar wallet (e.g., [Freighter](https://www.freighter.app/) or [xBull](https://xbull.app/))
- Chrome, Firefox, or Brave browser

---

## Step 1: Install and Configure a Wallet

### Freighter (Recommended)

1. Install the [Freighter](https://www.freighter.app/) browser extension.
2. Open Freighter and click **"Create a new wallet"** (or import an existing one).
3. Save your seed phrase in a secure location.
4. Once the wallet is created, click the network dropdown in the top-left corner and select **"Testnet"**.

### xBull Wallet

1. Install the [xBull](https://xbull.app/) browser extension.
2. Create a new wallet or import an existing one.
3. Open settings and switch the network to **"Testnet"**.

---

## Step 2: Fund Your Wallet on Testnet

Stellar provides a **Friendbot** service that sends free testnet XLM to any new account.

### Via Freighter (Built-in)

1. Open Freighter and navigate to your account.
2. Click the **"Fund with Friendbot"** button (only visible when the wallet is set to Testnet).

### Via Stellar Laboratory

1. Copy your Stellar public address (G...) from your wallet.
2. Open the [Stellar Laboratory Friendbot](https://laboratory.stellar.org/#create-account?network=testnet).
3. Paste your address into the **"Fund an account using Friendbot"** field.
4. Click **"Get testnet funds"**.

### Via Stellar Quest

1. Visit [Stellar Quest](https://quest.stellar.org/) and connect your wallet.
2. Complete any quest to earn testnet funds and USDC.

### Verify the Funding

After funding, check your balance in the wallet extension. You should see at least 10,000 testnet XLM.

---

## Step 3: Obtain Testnet USDC

Most invoices require USDC. You can obtain testnet USDC from the Stellar Testnet USDC issuer.

### Via Laboratory Swap

1. Go to the [Stellar Laboratory Payments page](https://laboratory.stellar.org/#xdr-viewer?network=testnet).
2. Use the **"Build Transaction"** tool to create a `ManageSellOffer` or trustline operation.
3. Alternatively, use the **Stellar Expert** or contact the protocol team for testnet USDC faucet access.

### Via the COMEBACKHERE Testnet Faucet

If a testnet faucet endpoint is available:

```sh
curl -X POST https://faucet.testnet.comebackhere.dev/fund \
  -H "Content-Type: application/json" \
  -d '{"address": "G...YOUR_ADDRESS...", "amount_usdc": "10000000"}'
```

---

## Step 4: Connect Your Wallet to comebackhere-frontend

### Network Configuration

The frontend application (`comebackhere-frontend`) expects the following configuration. These values are already set in the testnet deployment, but you can verify them in the app's settings or `.env`:

|         Variable          |                       Testnet Value                        |
|---------------------------|------------------------------------------------------------|
| `VITE_SOROBAN_RPC`        | `https://soroban-testnet.stellar.org`                      |
| `VITE_HORIZON_URL`        | `https://horizon-testnet.stellar.org`                      |
| `VITE_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2025`                        |
| `VITE_API_URL`            | Backend URL (e.g., `https://api.testnet.comebackhere.dev`) |

> These variables are defined in `comebackhere-frontend/src/utils/soroban.ts`. If you are running the frontend locally, verify your `.env` values match the table above.

### Connecting in the Browser

1. Navigate to the **comebackhere-frontend** URL (e.g., `https://pay.testnet.comebackhere.dev`).
2. Click **"Connect Wallet"**.
3. Your browser wallet (Freighter/xBull) will prompt you to connect — approve the connection.
4. The app will verify that your wallet is on the **Testnet** network. If it detects `Public Global Stellar Network ; September 2025`, it will prompt you to switch to testnet.
5. Once connected, you will see your Stellar public address and balance in the top-right corner.

---

## Step 5: Make a Test Payment

1. Open a payment link or navigate to an invoice in the app.
2. Review the invoice details (merchant, amount, description).
3. Click **"Pay Invoice"**.
4. Your wallet will display the transaction for approval — verify the details and confirm.
5. Wait for the transaction to be confirmed (typically 3–5 seconds on testnet).
6. You will see a success confirmation. The invoice now shows as **Paid**.

---

## Troubleshooting

|               Problem                |               Likely Cause                |                    Solution                    |
|--------------------------------------|-------------------------------------------|------------------------------------------------|
| Wallet shows "Mainnet"               | Network not switched to Testnet           | Change wallet network to Testnet               |
| "Insufficient balance"               | No XLM or no USDC                         | Fund with Friendbot and obtain testnet USDC    |
| "Network passphrase mismatch"        | Wallet on wrong network                   | Reconnect wallet or switch to Testnet          |
| Transaction fails with "Not allowed" | Payer address not on compliance allowlist | Contact the protocol admin to add your address |
| App shows "Connecting..." forever    | Browser wallet extension not installed    | Install Freighter or xBull and refresh         |

---

## Network Details

- **Soroban RPC**: `https://soroban-testnet.stellar.org`
- **Horizon**: `https://horizon-testnet.stellar.org`
- **Network Passphrase**: `Test SDF Network ; September 2025`
- **Friendbot URL**: `https://friendbot.stellar.org`
- **Faucet (Stellar Lab)**: <https://laboratory.stellar.org/#create-account?network=testnet>
