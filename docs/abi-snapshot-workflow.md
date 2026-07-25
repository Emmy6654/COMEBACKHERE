# ABI Snapshot Workflow

This document explains how ABI snapshots in `abis/` are generated, when to update them, how CI enforces freshness, and what breaks downstream if they go stale.

## What Are ABI Snapshots?

The `abis/` directory contains JSON metadata files for each smart contract (invoice, treasury, compliance). These files describe each contract's exported functions, events, error codes, and version. They are the single source of truth that downstream services (backend, frontend) use to interact with deployed contracts.

## How Snapshots Are Generated

Snapshots are produced by `scripts/generate_abi_metadata.sh`, which:

1. Builds the contract workspace in the sibling `COMEBACKHERE-contracts/` directory using `cargo test --no-run --workspace` (a deterministic build with `LC_ALL=C`).
2. Runs `scripts/generate_abi_metadata.py` to extract function signatures, events, and error codes from the compiled contract artifacts.
3. Writes the resulting JSON files to the target directory (defaults to `abis/`).

The output is fully deterministic: given the same contract source, the same JSON is produced regardless of platform.

## When and Why to Run `update-abi-snapshots`

Run the snapshot update **any time contract source code changes** — specifically when functions, events, error codes, or contract versions are added, removed, or renamed in `COMEBACKHERE-contracts/`.

```sh
# From the COMEBACKHERE repo root
make update-abi-snapshots

# Or using just
just snapshot
```

Both commands invoke the same underlying script. The `COMEBACKHERE-contracts/` repo must be cloned as a sibling directory.

### Common triggers

- Adding or removing a contract function
- Changing function signatures or parameter types
- Adding or renaming events or error codes
- Bumping a contract version

You do **not** need to regenerate snapshots for changes that don't affect the contract's public interface (internal logic, tests, comments).

## CI Enforcement

The GitHub Actions workflow `.github/workflows/ci-abi-snapshots.yml` runs on every pull request targeting `main`. It:

1. Checks out both this repo and `COMEBACKHERE-contracts` at `main`.
2. Runs `make check-abi-snapshots`, which generates fresh metadata into a temporary directory and diffs it against the committed `abis/` files.
3. Runs `git diff --exit-code abis/` as a second guard to catch any uncommitted drift.

If the committed snapshots do not match what the contracts produce, the CI job fails and the PR cannot be merged.

### Fixing a CI failure

```sh
# 1. Ensure COMEBACKHERE-contracts/ is up to date
cd ../COMEBACKHERE-contracts && git pull origin main

# 2. Regenerate snapshots
cd ../COMEBACKHERE && make update-abi-snapshots

# 3. Commit the updated files
git add abis/
git commit -m "chore: update ABI snapshots"
```

## What Breaks Downstream if Snapshots Are Stale

The `comebackhere-backend` service reads `abis/*.json` at startup to build its Soroban contract clients. Stale snapshots cause:

| Scenario | Downstream impact |
| --- | --- |
| New function added to contract but missing from snapshot | Backend cannot call the new function; API endpoints that depend on it return errors |
| Function signature changed but snapshot not updated | Backend sends malformed transactions; Soroban RPC rejects them with simulation failures |
| Function removed from contract but still in snapshot | Backend attempts calls to a non-existent function; transactions fail at the ledger level |
| Event renamed but snapshot not updated | Backend event listener misses events; webhook deliveries and transaction history stop updating |
| Error codes changed but snapshot not updated | Backend maps wrong error codes to user-facing messages; users see incorrect error descriptions |

The frontend `ABIExplorer` component also renders function lists from hardcoded data that mirrors these snapshots. While the explorer is informational only, stale data there misleads developers inspecting available contract functions.

## Verifying Snapshots Locally

To check whether your committed snapshots are up to date without overwriting them:

```sh
make check-abi-snapshots

# Or using just
just check-snapshot
```

This generates metadata to a temp directory and diffs it against `abis/`. If there is no output and the exit code is 0, your snapshots are current.
