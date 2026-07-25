# Integration Tests

Workspace-level integration tests that run against the local Soroban
environment started by `docker-compose`.

## Prerequisites

1. Docker and Docker Compose installed.
2. `soroban` CLI installed.
3. Local environment running:

   ```sh
   docker-compose up -d
   ```

4. Contracts deployed locally:

   ```sh
   cp .env.local.example .env.local
   scripts/deploy_local.sh
   ```

## Running Tests

Export the deployed contract addresses, then run the test script:

```sh
export INVOICE_CONTRACT_ID=<deployed invoice contract>
export TREASURY_CONTRACT_ID=<deployed treasury contract>
export USDC_CONTRACT_ID=<deployed USDC token contract>

./tests/invoice_lifecycle.sh
```

## Test Coverage

| Test | Description |
| --- | --- |
| Create invoice | Creates a valid invoice with minimum amount |
| Pay invoice | Pays the invoice with USDC via the payer account |
| Escrow release | Proposes, approves, and executes a treasury settlement |
| Invalid amount | Verifies rejection of invoices below the minimum amount |
