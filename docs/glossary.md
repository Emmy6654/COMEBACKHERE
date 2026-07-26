# Glossary: Invoice, Settlement, Dispute, and Escrow Terms

This glossary defines the domain terms used across the COMEBACKHERE contracts (`invoice`, `treasury`, `compliance`). Definitions are derived directly from the Soroban contract types in `COMEBACKHERE-contracts/`.

---

## Invoice Terms

**Invoice**
A payment request created by a merchant. Stored on-chain with a unique numeric ID, the merchant's address, a net amount (`amount_usdc`), a gross amount (`gross_usdc`), an expiry timestamp, and an optional metadata hash and payment-link hash.

**Merchant**
The Stellar address that creates an invoice and receives payment. Must authorise the `create_invoice` call.

**Payer**
The Stellar address that pays an invoice. Recorded on the invoice when `mark_paid` is called. The payer may later raise a refund request.

**amount_usdc**
The net settlement amount (in USDC stroops) that the merchant expects to receive.

**gross_usdc**
The gross invoice amount before fees. Must be ≥ `amount_usdc`. Both must be positive.

**expires_at**
The ledger timestamp (Unix seconds) after which the invoice can no longer be paid. Payment at exactly `expires_at` is rejected; the boundary is exclusive.

**metadata_hash**
An optional SHA-256 (or equivalent) hash of off-chain invoice metadata (e.g. line items, PO number). Stored as raw bytes; not interpreted by the contract.

**payment_link_hash**
An optional hash of a payment-link URI, enabling deterministic linking between on-chain state and an off-chain checkout page.

**Grace Window**
The duration (in seconds) after an invoice's `expires_at` during which payment is still accepted. Set by the contract admin via `set_grace_window`. A grace window allows for ledger drift and network congestion without forcing merchants to reissue invoices. Configurable per deployment; default matches the invoice contract's `DEFAULT_GRACE_WINDOW` constant.

### InvoiceStatus

|      Status       |                                   Meaning                                   |
|-------------------|-----------------------------------------------------------------------------|
| `Pending`         | Created and awaiting payment. Can be paid, cancelled, or expired.           |
| `Paid`            | Marked paid by the admin. Payer and `paid_at` timestamp are recorded.       |
| `Expired`         | The ledger passed `expires_at` before payment. Set by `batch_expire`.       |
| `Cancelled`       | Cancelled by the merchant or admin before payment.                          |
| `RefundRequested` | The payer requested a refund on a paid invoice (initiates escrow dispute).  |
| `Released`        | Escrow funds have been released to the merchant after payment confirmation. |

### InvoiceError

| Code |         Name         |                               Trigger                                |
|------|----------------------|----------------------------------------------------------------------|
| 1    | `Unauthorized`       | Caller is not the merchant, admin, or payer.                         |
| 2    | `ContractPaused`     | A state-changing call was made while the contract is paused.         |
| 3    | `InvalidAmount`      | `amount_usdc` ≤ 0 or `gross_usdc` < `amount_usdc`.                   |
| 4    | `NotPending`         | Operation requires `Pending` status but invoice is in another state. |
| 5    | `Expired`            | Payment attempted after `expires_at`.                                |
| 6    | `NotFound`           | No invoice exists for the given ID.                                  |
| 7    | `AlreadyInitialized` | `initialize` called when the contract is already set up.             |
| 8    | `ZeroDuration`       | `expires_in_seconds` was 0 on invoice creation.                      |
| 9    | `ExpiryOverflow`     | `ledger_timestamp + expires_in_seconds` overflows `u64`.             |
| 10   | `NotPaid`            | `request_refund` or `release_escrow` called on a non-`Paid` invoice. |
| 12   | `AmountPrecision`    | Amount is below 1 USDC (10,000,000 stroops).                         |
| 13   | `DuplicateNonce`     | Merchant nonce has already been used for a previous invoice.         |

---

## Settlement Terms

**Settlement**
A multi-sig treasury disbursement to a merchant. Created by an authorised signer via `propose_settlement`; funds are transferred only after the cumulative approval weight meets the configured threshold.

**Signer**
A Stellar address registered in the treasury with a positive weight. Signers propose, approve, and execute settlements.

**approval_weight**
The running sum of the weights of all unique signers who have approved a settlement or dispute resolution. A settlement can be executed only when `approval_weight ≥ threshold`.

**Threshold**
The minimum cumulative signer weight required to execute a settlement. Set at initialisation; updateable by the admin via `update_threshold` (must be > 0).

**Token Allowlist**
An optional list of token contract addresses accepted for settlement. If non-empty, any unlisted token is rejected with `TokenNotAllowed`.

**On-Hold Settlement**
A settlement whose status is `OnHold`, meaning execution is blocked pending review. A settlement enters the on-hold state automatically when a dispute is raised against it. It can also be placed on hold by an admin for compliance, fraud, or KYC reasons (see `SettlementHoldReason`). An on-hold settlement cannot be executed until the hold is lifted.

### SettlementStatus

|       Status        |                           Meaning                           |
|---------------------|-------------------------------------------------------------|
| `Pending`           | Proposed and awaiting sufficient approvals.                 |
| `Executed`          | Full amount transferred to the merchant.                    |
| `PartiallyExecuted` | A partial amount was transferred.                           |
| `OnHold`            | Blocked from execution (compliance review or open dispute). |
| `Cancelled`         | Cancelled by an authorised signer before execution.         |

### SettlementHoldReason

|      Variant       |                   Meaning                   |
|--------------------|---------------------------------------------|
| `None`             | Not on hold (default state).                |
| `ComplianceReview` | Held pending a compliance review.           |
| `FraudCheck`       | Held for fraud investigation.               |
| `KycPending`       | Held until KYC verification is complete.    |
| `AdminHold`        | Held by an admin for an unspecified reason. |

---

## Dispute Terms

**Dispute**
An on-chain record raised by a claimant against a counterparty over a specific settlement. Raising a dispute automatically places the referenced settlement `OnHold`.

**resolution_weight**
Cumulative weight of signers who have voted on the dispute resolution. When it reaches the treasury threshold the dispute transitions to `ResolvedClaimant` or `ResolvedCounterparty`.

**Dispute Quorum**
The minimum cumulative signer weight required to finalise a dispute resolution. This is the same value as the treasury's `threshold` — when the `resolution_weight` of signers who have voted reaches this threshold, the dispute transitions from `Raised` to `ResolvedClaimant` or `ResolvedCounterparty`.

### DisputeStatus

|         Status         |                      Meaning                       |
|------------------------|----------------------------------------------------|
| `Raised`               | Dispute created and awaiting resolution votes.     |
| `ResolvedClaimant`     | Resolved in favour of the claimant.                |
| `ResolvedCounterparty` | Resolved in favour of the counterparty (merchant). |

---

## Escrow Terms

**Escrow**
The treasury's role as a neutral custodian of funds between payment receipt and merchant settlement.

**Escrow Release**
When `release_escrow` is called on a `Paid` invoice, the status transitions to `Released`, signalling that the escrow funds have been disbursed to the merchant.

**Merchant Payout Address**
An optional override address where a merchant's settlement funds are sent. Set via `update_merchant_payout_address`.

**Signer Rotation**
A governance process for replacing one authorised signer with another. The old signer's weight transfers to the new signer and the old signer's weight is set to 0.

---

## Compliance Terms

**Allowlist (Compliance)**
The set of Stellar addresses permitted to interact with protocol contracts. Maintained by the compliance contract's admin via `allow_address`, `block_address`, `allow_address_until`, and `clear_address`. The contract exposes `is_allowed` to query whether a given address is currently on the allowlist. The invoice contract checks the compliance allowlist before marking invoices as paid. An address not on the allowlist (or explicitly blocked) is rejected with an `Unauthorized` error.

**Allowlist (Token)**
See _Token Allowlist_ under Settlement Terms.

---

## Cross-Contract Workflow Summary

```
Merchant           InvoiceContract         TreasuryContract
   |                    |                        |
   |-- create_invoice ->|                        |
   |                    |                        |
Payer pays off-chain    |                        |
   |                    |                        |
Admin -- mark_paid ---->|                        |
Admin -- release_escrow->|                      |
   |                    |                        |
Signer ----- propose_settlement --------------->|
Signer ----- approve_settlement --------------->|
Signer ----- execute_settlement --------------->|-- token transfer --> Merchant
   |                    |                        |
[If payer disputes]     |                        |
Payer -- request_refund->|                      |
Payer ----- raise_dispute ---------------------->| (settlement -> OnHold)
Signers -- vote_dispute_resolution ------------->| (threshold met -> Resolved)
```
