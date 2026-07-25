import type { Invoice } from "../types"
import { StatusBadge } from "./StatusBadge"
import { CopyableText } from "./CopyableText"

interface RefundConfirmationModalProps {
  invoice: Invoice
  onConfirm: () => void
  onCancel: () => void
  submitting: boolean
}

export function RefundConfirmationModal({
  invoice,
  onConfirm,
  onCancel,
  submitting,
}: RefundConfirmationModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="refund-confirm-title">
        <h2 id="refund-confirm-title">Request Refund</h2>
        <p className="modal-desc">
          You are about to request a refund for this paid invoice. This will
          transition the invoice to{" "}
          <strong>RefundRequested</strong> status and initiate the escrow
          dispute process.
        </p>

        <div className="modal-details">
          <div className="detail-row">
            <span className="detail-label">Invoice ID</span>
            <span className="detail-value">#<CopyableText text={String(invoice.id)} label="Copy invoice ID" /></span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Paid Amount (USDC)</span>
            <span className="detail-value">{invoice.gross_usdc}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Merchant</span>
            <span className="detail-value detail-value--address">
              <CopyableText text={invoice.merchant} label="Copy merchant address" />
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Current Status</span>
            <StatusBadge status={invoice.status} />
          </div>
        </div>

        <div className="modal-actions" role="group" aria-label="Refund confirmation actions">
          <button
            className="btn btn--secondary"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Cancel refund request"
          >
            Cancel
          </button>
          <button
            className="btn btn--danger"
            onClick={onConfirm}
            disabled={submitting}
            aria-label={submitting ? "Submitting refund request" : "Confirm refund request"}
          >
            {submitting ? "Submitting..." : "Confirm Refund Request"}
          </button>
        </div>
      </div>
    </div>
  )
}
