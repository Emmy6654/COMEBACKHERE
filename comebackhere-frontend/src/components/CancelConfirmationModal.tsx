import type { Invoice } from "../types"
import { StatusBadge } from "./StatusBadge"

interface CancelConfirmationModalProps {
  invoice: Invoice
  onConfirm: () => void
  onCancel: () => void
  submitting: boolean
}

export function CancelConfirmationModal({
  invoice,
  onConfirm,
  onCancel,
  submitting,
}: CancelConfirmationModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Cancel Invoice</h2>
        <p className="modal-desc">
          You are about to cancel this invoice. This action cannot be undone and
          will transition the invoice to <strong>Cancelled</strong> status.
        </p>

        <div className="modal-details">
          <div className="detail-row">
            <span className="detail-label">Invoice ID</span>
            <span className="detail-value">#{invoice.id}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Amount (USDC)</span>
            <span className="detail-value">{invoice.gross_usdc}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Merchant</span>
            <span className="detail-value detail-value--address">
              {invoice.merchant}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Current Status</span>
            <StatusBadge status={invoice.status} />
          </div>
        </div>

        <div className="modal-actions">
          <button
            className="btn btn--secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Go Back
          </button>
          <button
            className="btn btn--danger"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? "Cancelling..." : "Confirm Cancellation"}
          </button>
        </div>
      </div>
    </div>
  )
}
