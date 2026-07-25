# Changelog

All notable changes to the COMEBACKHERE Protocol will be documented in this
file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Changes are organized by component: **Contract**, **Backend**, and **Frontend**.

---

## [Unreleased]

### Contract

#### Added

- Invoice contract with `create_invoice` supporting minimum amount validation.
- Treasury contract with multi-sig settlement proposals, approvals, and
  execution.
- Dispute lifecycle: `raise_dispute` and `resolve_dispute` on treasury.
- Token allowlist management (`add_token_to_allowlist`,
  `remove_token_from_allowlist`).
- Compliance contract for address verification.
- Contract pause/unpause functionality.
- Paginated `get_pending_settlements` query with configurable offset and limit.

### Backend

#### Added

- Redis-backed event consumer for contract event streaming.
- REST API for treasury operations (settlements, disputes, signers).
- Webhook delivery pipeline via Redis pub/sub.

### Frontend

#### Added

- Merchant dashboard with stats overview (pending invoices, total settled, open
  disputes).
- Sidebar navigation with route-based active state.
- Settlement proposal form with approval workflow.
- Dispute voting panel with real-time weight tracking.
- Signer management UI (add, remove, rotate).
- ABI Explorer for inspecting deployed contract interfaces.
- Onboarding wizard for new merchant setup.

---

## [0.1.0] - 2026-06-26

Initial release of the COMEBACKHERE Protocol workspace.

### Contract

#### Added

- Soroban invoice contract scaffold with `InvoiceStatus` enum and
  `InvoiceError` definitions.
- Treasury contract with settlement lifecycle and multi-sig governance.

### Backend

#### Added

- Docker Compose environment with Soroban standalone node and Redis.
- Deployment scripts for local, testnet, and mainnet environments.
- ABI snapshot generation and verification tooling.

### Frontend

#### Added

- React + Vite project setup with TypeScript.
- Dashboard layout with sidebar navigation.
- Settlement, dispute, and signer management views.
