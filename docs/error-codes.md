# Error Codes

This document maps every `InvoiceError` variant (and other contract error codes) to its numeric value, the condition that triggers it, and the recommended remediation steps for integrators.

> Cross-reference: see [docs/api-reference.md](./api-reference.md) for HTTP-level error shapes returned by the backend.

---

## InvoiceError

Defined in `contracts/invoice/src/lib.rs` and `COMEBACKHERE-contracts/contracts/invoice/src/lib.rs`.

| Code | Name | Trigger condition | Remediation |
| ------ | ------ | ------------------- | ------------- |
| 1 | `Unauthorized` | Caller is not the merchant, admin, or payer for the operation. | Ensure the signing key matches the expected role. Merchants must sign `create_invoice`; the admin must sign `mark_paid` / `release_escrow`; the payer must sign `request_refund`. |
| 2 | `ContractPaused` | A state-changing call was made while the contract is in a paused state. | Check contract status before submitting. Contact the admin to unpause the contract. Do not retry until the contract is unpaused. |
| 3 | `InvalidAmount` | `amount_usdc` ≤ 0, or `gross_usdc` < `amount_usdc`. | Verify that both amounts are positive and that `gross_usdc ≥ amount_usdc`. Amounts are denominated in USDC stroops (1 USDC = 10 000 000 stroops). |
| 4 | `NotPending` | An operation that requires `Pending` status (e.g. `mark_paid`, `cancel`) was called on an invoice in another state. | Fetch the current invoice status before acting. If the invoice has already been paid, expired, or cancelled, no further action is needed. |
| 5 | `Expired` | Payment was attempted after the invoice's `expires_at` timestamp. | Create a new invoice with a future `expires_in_seconds`. Do not attempt to pay an invoice that has already expired. |
| 6 | `NotFound` | No invoice exists for the supplied ID. | Confirm the invoice ID with the merchant. IDs are sequential `u64` values returned by `create_invoice`. |
| 7 | `AlreadyInitialized` | `initialize` was called on a contract that is already set up. | This is a deployment-time error. Remove the extra `initialize` call; the contract can only be initialised once. |
| 8 | `ZeroDuration` | `expires_in_seconds` was 0 on invoice creation. | Pass a positive duration. Typical values are 3 600 (1 hour) to 2 592 000 (30 days). |
| 9 | `ExpiryOverflow` | `ledger_timestamp + expires_in_seconds` overflows `u64`. | Reduce the expiry duration. Any duration that would place the expiry beyond year 2554 will overflow. |
| 10 | `NotPaid` | `request_refund` or `release_escrow` was called on an invoice that is not in `Paid` status. | Confirm the invoice status is `Paid` before requesting a refund or releasing escrow. |
| 12 | `AmountPrecision` | Amount is below the minimum of 1 USDC (10 000 000 stroops). | Set `amount_usdc` ≥ 10 000 000. Fractional-USDC invoices are not supported. |
| 13 | `DuplicateNonce` | A merchant nonce has already been used for a previous invoice. | Generate a fresh nonce for each invoice. Reusing a nonce is rejected to prevent replay attacks. |

---

## SettlementError

Defined in `contracts/settlement/src/lib.rs`.

| Code | Name | Trigger condition | Remediation |
| ------ | ------ | ------------------- | ------------- |
| 1 | `NotFound` | No settlement exists for the supplied ID. | Confirm the settlement ID returned by `propose`. |
| 2 | `Unauthorized` | Caller has no registered weight in the treasury signer set. | Use a key that was registered via `initialize` or a subsequent signer-rotation call. |
| 3 | `AlreadyApproved` | The same signer attempted to approve the same settlement twice. | Each signer may approve a settlement only once. |
| 4 | `NotPending` | `approve_settlement` or `cancel` was called on a settlement that is not in `Pending` status. | Check the settlement status before calling approve or cancel. |

---

## Error shape in API responses

Backend endpoints return errors as JSON:

```json
{
  "error": "Human-readable message",
  "code": 6
}
```

`code` corresponds directly to the numeric values in the tables above. When `code` is `null` or absent the error originates from the RPC layer rather than the contract.

---

## Quick-reference: HTTP status mapping

| HTTP status | Typical contract code(s) | Meaning |
| ------------- | -------------------------- | --------- |
| 400 | — | Invalid request body (validation failed before hitting the contract). |
| 403 | 1 (`Unauthorized`) | Caller is not authorised for the operation. |
| 404 | 6 (`NotFound`), Settlement 1 | Resource does not exist. |
| 422 | 3, 4, 5, 8, 9, 10, 12, 13 | Contract rejected the transaction. |
| 503 | — | Backend misconfiguration (missing env vars). |
| 504 | — | Transaction confirmation timeout waiting for Soroban. |
