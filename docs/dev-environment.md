# Development Environment Setup

This guide covers setting up a full local development environment for the COMEBACKHERE protocol, spanning the contracts, backend, and frontend repositories.

## Prerequisites

- Rust 1.70+ with `wasm32-unknown-unknown` target:

  ```sh
  rustup install stable
  rustup target add wasm32-unknown-unknown
  ```

- Soroban CLI: `cargo install soroban-cli`
- Node.js 18+ (for frontend)
- Docker (for local Soroban sandbox)
- Stellar testnet account with funded testnet USDC

## Directory Layout

Create a workspace directory and clone in this order:

```
~/comebackhere/
  ├── COMEBACKHERE-contracts/   # Smart contracts repo
  ├── COMEBACKHERE/             # Tooling, scripts, ABIs repo
  ├── comebackhere-backend/     # Backend API
  └── comebackhere-frontend/    # Frontend UI
```

```sh
mkdir ~/comebackhere && cd ~/comebackhere
git clone https://github.com/dreamgeneX/COMEBACKHERE-contracts.git
git clone https://github.com/dreamgeneX/COMEBACKHERE.git
git clone https://github.com/dreamgeneX/comebackhere-backend.git
git clone https://github.com/dreamgeneX/comebackhere-frontend.git
```

## Local Soroban Sandbox

Start a local Soroban sandbox for testing without testnet:

```sh
soroban-cli start --standalone
```

This runs Soroban RPC on `http://localhost:8000` and Horizon on `http://localhost:8001`.

## Environment Setup

### Contracts

Copy the testnet configuration and generate a test account:

```sh
cd COMEBACKHERE
cp .env.testnet.example .env.testnet
```

Generate a new testnet keypair for local testing:

```sh
soroban config identity generate dev
soroban config set --scope testnet RPC_URL http://localhost:8000
soroban config set --scope testnet NETWORK_PASSPHRASE "Standalone Network ; February 2025"
```

Export your account ID for use in backend/frontend configuration:

```sh
ADMIN_PUBLIC_KEY=$(soroban config identity show dev)
echo "ADMIN_PUBLIC_KEY=$ADMIN_PUBLIC_KEY"
```

### Deploy Contracts Locally

```sh
cd COMEBACKHERE

# Build WASM artifacts (from the contracts repo)
(cd ../COMEBACKHERE-contracts && cargo build --target wasm32-unknown-unknown --release)

# Deploy to local sandbox
./scripts/deploy_testnet.sh
```

This outputs contract IDs. Save them:

```sh
export INVOICE_CONTRACT_ID=<id>
export TREASURY_CONTRACT_ID=<id>
export COMPLIANCE_CONTRACT_ID=<id>
```

### Backend

```sh
cd comebackhere-backend

cat > .env <<EOF
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=http://localhost:8000
HORIZON_URL=http://localhost:8001
ADMIN_PUBLIC_KEY=$ADMIN_PUBLIC_KEY
INVOICE_CONTRACT_ID=$INVOICE_CONTRACT_ID
TREASURY_CONTRACT_ID=$TREASURY_CONTRACT_ID
COMPLIANCE_CONTRACT_ID=$COMPLIANCE_CONTRACT_ID
USDC_CONTRACT_ID=CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4
MONGO_URI=mongodb://localhost:27017/comebackhere
REDIS_URL=redis://localhost:6379
WEBHOOK_SECRET=<generate-a-32-char-or-longer-secret>
EOF
```

Before starting the backend, validate all required environment variables:

```sh
cd ../COMEBACKHERE
scripts/validate_backend_env.sh ../comebackhere-backend/.env
```

A missing or blank required variable causes the script to exit with a clear error message.
To also enforce the optional contract ID variables (e.g. in CI), run with `STRICT=1`:

```sh
STRICT=1 scripts/validate_backend_env.sh ../comebackhere-backend/.env
```

Then start the backend:

```sh
cd ../comebackhere-backend
cargo build && cargo run
```

Backend listens on `http://localhost:3000`.

#### Required backend variables

| Variable         | Description                                                        |
|------------------|--------------------------------------------------------------------|
| `MONGO_URI`      | MongoDB connection string (`mongodb://` or `mongodb+srv://`)       |
| `REDIS_URL`      | Redis connection string (`redis://`)                               |
| `WEBHOOK_SECRET` | HMAC secret for signing outgoing webhook payloads (≥ 32 chars)     |

#### Optional contract integration variables

| Variable                | Description                             |
|-------------------------|-----------------------------------------|
| `INVOICE_CONTRACT_ID`   | Deployed invoice contract address       |
| `TREASURY_CONTRACT_ID`  | Deployed treasury contract address      |
| `COMPLIANCE_CONTRACT_ID`| Deployed compliance contract address    |

### Frontend

```sh
cd comebackhere-frontend

cat > .env <<EOF
VITE_API_URL=http://localhost:3000
VITE_SOROBAN_RPC=http://localhost:8000
VITE_HORIZON_URL=http://localhost:8001
VITE_NETWORK_PASSPHRASE=Standalone Network ; February 2025
EOF

npm install && npm run dev
```

Frontend runs on `http://localhost:5173`.

## Running Contract Tests

```sh
cd COMEBACKHERE-contracts

# Run all contract tests
cargo test

# Generate coverage report
cd ../COMEBACKHERE && scripts/coverage.sh
```

## Development Workflow

1. **Make contract changes** in `COMEBACKHERE-contracts/contracts/*/src/`
2. **Rebuild and redeploy**:

   ```sh
   cd COMEBACKHERE-contracts
   cargo build --target wasm32-unknown-unknown --release
   cd ../COMEBACKHERE && ./scripts/deploy_testnet.sh
   ```

3. **Regenerate ABI metadata**:

   ```sh
   cd COMEBACKHERE && make update-abi-snapshots
   ```

4. **Restart backend** to reload new contract IDs (if changed)
5. **Test in frontend** UI

## Troubleshooting

- **"Soroban RPC not reachable"**: Ensure sandbox is running with `soroban-cli start --standalone`
- **"Contract not found"**: Verify contract IDs in `.env` match deployed IDs from deployment script
- **"USDC balance insufficient"**: Fund your testnet account at [Stellar Lab](https://laboratory.stellar.org/#create-account)
- **Port already in use**: Change the port in backend/frontend env files if 3000 or 5173 are taken

## Further Reading

- [Soroban Docs](https://developers.stellar.org/soroban)
- [Mainnet Deployment](./MAINNET_DEPLOYMENT.md)
