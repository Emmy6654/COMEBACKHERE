import type { Invoice } from "../types"
import { StatusBadge } from "./StatusBadge"
import { CopyableText } from "./CopyableText"

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
    <div className="modal-overlay" onClick={onCancel} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pay-confirm-title">
        <h2 id="pay-confirm-title">Confirm Payment</h2>
        <p className="modal-desc">
          You are about to pay this invoice. Please review the details before
          confirming.
        </p>

        <div className="modal-details">
          <div className="detail-row">
            <span className="detail-label">Invoice ID</span>
            <span className="detail-value">#<CopyableText text={String(invoice.id)} label="Copy invoice ID" /></span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Amount (USDC)</span>
            <span className="detail-value">{invoice.gross_usdc}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Merchant</span>
            <span className="detail-value detail-value--address">
              <CopyableText text={invoice.merchant} label="Copy merchant address" />
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Status</span>
            <StatusBadge status={invoice.status} />
          </div>
        </div>

        <div className="modal-actions" role="group" aria-label="Payment confirmation actions">
          <button
            className="btn btn--secondary"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Cancel payment"
          >
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={onConfirm}
            disabled={submitting}
            aria-label={submitting ? "Submitting payment" : "Confirm payment"}
          >
            {submitting ? "Submitting..." : "Confirm Payment"}
          </button>
        </div>
      </div>
    </div>
  )
}
