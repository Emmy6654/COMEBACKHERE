import type { Invoice } from "../types"
import { StatusBadge } from "./StatusBadge"

interface PayConfirmationModalProps {
  invoice: Invoice
  onConfirm: () => void
  onCancel: () => void
  submitting: boolean
}

export function PayConfirmationModal({
  invoice,
  onConfirm,
  onCancel,
  submitting,
}: PayConfirmationModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Confirm Payment</h2>
        <p className="modal-desc">
          You are about to pay this invoice. Please review the details before
          confirming.
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
            <span className="detail-label">Status</span>
            <StatusBadge status={invoice.status} />
          </div>
        </div>

        <div className="modal-actions">
          <button
            className="btn btn--secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Confirm Payment"}
          </button>
        </div>
      </div>
    </div>
  )
}
