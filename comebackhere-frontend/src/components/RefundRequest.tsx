import { useState } from "react"
import type { Invoice, InvoiceStatus } from "../types"
import { StatusBadge } from "./StatusBadge"
import { CopyableText } from "./CopyableText"
import { RefundConfirmationModal } from "./RefundConfirmationModal"

interface RefundRequestProps {
  invoice: Invoice
  walletAddress: string | null
  onRequestRefund: () => Promise<{
    success: boolean
    transaction_hash?: string
    error?: string
  }>
}

// Configurable refund constraints
const REFUND_CONSTRAINTS = {
  MIN_REASON_LENGTH: 10,
  MAX_REASON_LENGTH: 500,
  FULL_REFUND_ONLY: true, // Contract only supports full refunds
}

export function RefundRequest({
  invoice,
  walletAddress,
  onRequestRefund,
}: RefundRequestProps) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    hash?: string
    errorMsg?: string
  } | null>(null)
  const [reason, setReason] = useState("")
  const [reasonError, setReasonError] = useState<string | null>(null)

  const isPayer =
    walletAddress?.toLowerCase() === invoice.payer.toLowerCase()
  const canRequestRefund =
    isPayer && invoice.status === "Paid"

  // Validate reason field
  const validateReason = (value: string): string | null => {
    if (!value.trim()) {
      return "Reason is required"
    }
    if (value.length < REFUND_CONSTRAINTS.MIN_REASON_LENGTH) {
      return `Reason must be at least ${REFUND_CONSTRAINTS.MIN_REASON_LENGTH} characters`
    }
    if (value.length > REFUND_CONSTRAINTS.MAX_REASON_LENGTH) {
      return `Reason must not exceed ${REFUND_CONSTRAINTS.MAX_REASON_LENGTH} characters`
    }
    return null
  }

  const handleReasonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setReason(value)
    // Validate as user types
    const error = validateReason(value)
    setReasonError(error)
  }

  const handleRefundClick = () => {
    setResult(null)
    setReason("")
    setReasonError(null)
    setShowConfirm(true)
  }

  const handleConfirmRefund = async () => {
    // Final validation before submission
    const error = validateReason(reason)
    if (error) {
      setReasonError(error)
      return
    }

    setSubmitting(true)
    const res = await onRequestRefund()
    setSubmitting(false)
    setShowConfirm(false)
    setResult({
      success: res.success,
      hash: res.transaction_hash,
      errorMsg: res.error,
    })
    
    // Clear form on success
    if (res.success) {
      setReason("")
      setReasonError(null)
    }
  }

  return (
    <div className="refund-section">
      {result && (
        <div
          className={`message message--${result.success ? "success" : "error"}`}
          role="status"
          aria-live="polite"
        >
          {result.success ? (
            <>
              Refund requested successfully!
              <br />
              Transaction hash:{" "}
              <code className="tx-hash"><CopyableText text={result.hash!} label="Copy transaction hash" /></code>
            </>
          ) : (
            <>Refund request failed: {result.errorMsg}</>
          )}
        </div>
      )}

      {canRequestRefund && !result?.success && (
        <>
          <div className="refund-form">
            <label htmlFor="refund-reason" className="refund-form__label">
              Reason for Refund <span className="required" aria-label="required">*</span>
              <span className="refund-form__hint">
                Full refund only. Provide a reason (minimum {REFUND_CONSTRAINTS.MIN_REASON_LENGTH} characters).
              </span>
            </label>
            <textarea
              id="refund-reason"
              className={`refund-form__textarea ${reasonError ? "refund-form__textarea--error" : ""}`}
              value={reason}
              onChange={handleReasonChange}
              placeholder="e.g., Product was not as described, duplicate charge, etc."
              maxLength={REFUND_CONSTRAINTS.MAX_REASON_LENGTH}
              disabled={submitting}
              aria-invalid={!!reasonError}
              aria-describedby={reasonError ? "reason-error" : "reason-hint"}
            />
            {reasonError && (
              <p id="reason-error" className="refund-form__error" role="alert">
                {reasonError}
              </p>
            )}
            <p id="reason-hint" className="refund-form__counter">
              {reason.length} / {REFUND_CONSTRAINTS.MAX_REASON_LENGTH} characters
            </p>
          </div>
          <button 
            className="btn btn--danger" 
            onClick={handleRefundClick}
            disabled={!reason.trim() || !!reasonError || submitting}
            aria-label={`Request refund for invoice #${invoice.id}`}
          >
            Request Refund
          </button>
        </>
      )}

      {invoice.status === "RefundRequested" && (
        <div className="status-info">
          <StatusBadge status={invoice.status as InvoiceStatus} />
          <p>Your refund request has been submitted and is being processed.</p>
        </div>
      )}

      {!canRequestRefund &&
        invoice.status !== "RefundRequested" &&
        isPayer && (
          <p className="status-text">
            Refund can only be requested on Paid invoices.
          </p>
        )}

      {showConfirm && (
        <RefundConfirmationModal
          invoice={invoice}
          onConfirm={handleConfirmRefund}
          onCancel={() => setShowConfirm(false)}
          submitting={submitting}
        />
      )}
    </div>
  )
}
