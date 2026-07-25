import { useState, useEffect } from "react"
import { useInvoice } from "../hooks/useInvoice"
import { useWallet } from "../hooks/useWallet"
import { StatusBadge } from "./StatusBadge"
import { CopyableText } from "./CopyableText"
import { PayConfirmationModal } from "./PayConfirmationModal"
import { CancelConfirmationModal } from "./CancelConfirmationModal"
import { TransactionHistory } from "./TransactionHistory"
import { InvoiceQRCode } from "./InvoiceQRCode"

export function InvoicePayment() {
  const { invoice, loading, error, loadInvoice, pay, cancel } = useInvoice()
  const { address, connected, connecting, connect } = useWallet()
  const [invoiceId, setInvoiceId] = useState("")
  const [showConfirm, setShowConfirm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [timeLeft, setTimeLeft] = useState<{
    days: number
    hours: number
    minutes: number
    seconds: number
  } | null>(null)
  const [result, setResult] = useState<{
    success: boolean
    hash?: string
    errorMsg?: string
  } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get("invoiceId")
    if (id) {
      setInvoiceId(id)
      loadInvoice(Number(id))
    }
  }, [loadInvoice])

  useEffect(() => {
    if (!invoice?.expires_at) {
      setTimeLeft(null)
      return
    }

    const updateTimer = () => {
      const diff = invoice.expires_at * 1000 - Date.now()
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        if (invoice.status === "Pending") {
          void loadInvoice(Number(invoice.id))
        }
        return
      }

      const totalSeconds = Math.floor(diff / 1000)
      setTimeLeft({
        days: Math.floor(totalSeconds / 86400),
        hours: Math.floor((totalSeconds % 86400) / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60,
      })
    }

    updateTimer()
    const timer = window.setInterval(updateTimer, 1000)

    return () => window.clearInterval(timer)
  }, [invoice?.expires_at, invoice?.id, invoice?.status, loadInvoice])

  const handleLoadInvoice = async () => {
    setResult(null)
    await loadInvoice(Number(invoiceId))
  }

  const handlePayClick = () => {
    setResult(null)
    setShowConfirm(true)
  }

  const handleConfirmPayment = async () => {
    if (!address) return
    setSubmitting(true)
    const res = await pay(address)
    setSubmitting(false)
    setShowConfirm(false)
    setResult({
      success: res.success,
      hash: res.transaction_hash,
      errorMsg: res.error,
    })
  }

  const handleCancelClick = () => {
    setResult(null)
    setShowCancelConfirm(true)
  }

  const handleConfirmCancel = async () => {
    if (!address) return
    setSubmitting(true)
    const res = await cancel(address)
    setSubmitting(false)
    setShowCancelConfirm(false)
    setResult({
      success: res.success,
      hash: res.transaction_hash,
      errorMsg: res.error,
    })
  }

  const canPay =
    connected && invoice?.status === "Pending"

  const isMerchant =
    connected &&
    address != null &&
    invoice?.merchant != null &&
    address.toLowerCase() === invoice.merchant.toLowerCase()

  const canCancel = isMerchant && invoice?.status === "Pending"

  return (
    <div className="payment-flow">
      <h1>Invoice Payment</h1>

      <div className="invoice-lookup" role="search" aria-label="Invoice lookup">
        <label htmlFor="payment-invoice-id" className="sr-only">Invoice ID</label>
        <input
          id="payment-invoice-id"
          type="number"
          placeholder="Enter Invoice ID"
          value={invoiceId}
          onChange={(e) => setInvoiceId(e.target.value)}
          aria-label="Invoice ID for payment"
        />
        <button
          className="btn btn--primary"
          onClick={handleLoadInvoice}
          disabled={!invoiceId || loading}
          aria-label={loading ? "Loading invoice" : "Load invoice"}
        >
          {loading ? "Loading..." : "Load Invoice"}
        </button>
      </div>

      {loading && <p className="status-text" aria-live="polite">Loading invoice...</p>}

      {error && <div className="message message--error" role="alert">{error}</div>}

      {result && (
        <div
          className={`message message--${result.success ? "success" : "error"}`}
          role="status"
          aria-live="polite"
        >
          {result.success ? (
            <>
              {invoice?.status === "Cancelled" ? "Invoice cancelled successfully!" : "Payment successful!"}
              <br />
              Transaction hash:{" "}
              <code className="tx-hash"><CopyableText text={result.hash!} label="Copy transaction hash" /></code>
            </>
          ) : (
            <>Operation failed: {result.errorMsg}</>
          )}
        </div>
      )}

      {invoice && (
        <div className="invoice-card">
          <div className="invoice-card__header">
            <h2>Invoice #<CopyableText text={String(invoice.id)} label="Copy invoice ID" /></h2>
            <StatusBadge status={invoice.status} />
          </div>

          <div className="invoice-card__body">
            <div className="detail-row">
              <span className="detail-label">Amount (USDC)</span>
              <span className="detail-value">{invoice.amount_usdc}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Countdown</span>
              <span className="detail-value">
                {invoice.status === "Expired" || (timeLeft && timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0) ? (
                  <span className="badge badge--expired">Expired</span>
                ) : timeLeft ? (
                  `${timeLeft.days}d ${timeLeft.hours}h ${timeLeft.minutes}m ${timeLeft.seconds}s`
                ) : (
                  "--"
                )}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Gross Amount (USDC)</span>
              <span className="detail-value">{invoice.gross_usdc}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Merchant</span>
              <span className="detail-value detail-value--address">
                <CopyableText text={invoice.merchant} label="Copy merchant address" />
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Expiry</span>
              <span className="detail-value">
                {new Date(invoice.expires_at * 1000).toLocaleString()}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status</span>
              <StatusBadge status={invoice.status} />
            </div>
          </div>

          <div className="invoice-card__actions" role="group" aria-label="Invoice actions">
            {!connected && (
              <button
                className="btn btn--primary"
                onClick={connect}
                disabled={connecting}
                aria-label="Connect wallet to pay invoice"
              >
                {connecting ? "Connecting..." : "Connect Wallet"}
              </button>
            )}

            {connected && canPay && (
              <button className="btn btn--primary" onClick={handlePayClick} aria-label={`Pay invoice #${invoice.id}`}>
                Pay Invoice
              </button>
            )}

            {canCancel && (
              <button className="btn btn--danger" onClick={handleCancelClick}>
                Cancel Invoice
              </button>
            )}

            {connected && invoice.status !== "Pending" && (
              <p className="status-text">
                This invoice is not available for payment
                (status: {invoice.status}).
              </p>
            )}
          </div>
        </div>
      )}

      {invoice && (
        <InvoiceQRCode invoiceId={invoice.id} />
      )}

      {invoice && <TransactionHistory invoice={invoice} />}

      {showConfirm && invoice && (
        <PayConfirmationModal
          invoice={invoice}
          onConfirm={handleConfirmPayment}
          onCancel={() => setShowConfirm(false)}
          submitting={submitting}
        />
      )}

      {showCancelConfirm && invoice && (
        <CancelConfirmationModal
          invoice={invoice}
          onConfirm={handleConfirmCancel}
          onCancel={() => setShowCancelConfirm(false)}
          submitting={submitting}
        />
      )}
    </div>
  )
}
