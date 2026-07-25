import { useState } from "react"
import { useInvoice } from "../hooks/useInvoice"
import { useWallet } from "../hooks/useWallet"
import { StatusBadge } from "./StatusBadge"
import { InvoiceStatus } from "../types"

export function EscrowRelease() {
  const { invoice, loading, error, loadInvoice, release } = useInvoice()
  const { address, connected, connecting, connect } = useWallet()
  const [invoiceId, setInvoiceId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    hash?: string
    errorMsg?: string
  } | null>(null)

  const handleLoadInvoice = async () => {
    setResult(null)
    await loadInvoice(Number(invoiceId))
  }

  const handleRelease = async () => {
    if (!address) return
    setSubmitting(true)
    setResult(null)
    const res = await release(address)
    setSubmitting(false)
    setResult({
      success: res.success,
      hash: res.transaction_hash,
      errorMsg: res.error,
    })
  }

  const canRelease = connected && invoice?.status === InvoiceStatus.Paid

  return (
    <div className="escrow-release">
      <h1>Escrow Release</h1>

      <div className="invoice-lookup">
        <input
          type="number"
          placeholder="Enter Invoice ID"
          value={invoiceId}
          onChange={(e) => setInvoiceId(e.target.value)}
        />
        <button
          className="btn btn--secondary"
          onClick={handleLoadInvoice}
          disabled={!invoiceId || loading}
        >
          {loading ? "Loading..." : "Load Invoice"}
        </button>
      </div>

      {loading && <p className="status-text">Loading invoice...</p>}

      {error && <div className="message message--error">{error}</div>}

      {result && (
        <div
          className={`message message--${result.success ? "success" : "error"}`}
        >
          {result.success ? (
            <>
              Escrow released successfully!
              <br />
              Transaction hash:{" "}
              <code className="tx-hash">{result.hash}</code>
            </>
          ) : (
            <>Release failed: {result.errorMsg}</>
          )}
        </div>
      )}

      {invoice && (
        <div className="invoice-card">
          <div className="invoice-card__header">
            <h2>Invoice #{invoice.id}</h2>
            <StatusBadge status={invoice.status} />
          </div>

          <div className="invoice-card__body">
            <div className="detail-row">
              <span className="detail-label">Merchant</span>
              <span className="detail-value detail-value--address">
                {invoice.merchant}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Amount (USDC)</span>
              <span className="detail-value">{invoice.amount_usdc}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status</span>
              <StatusBadge status={invoice.status} />
            </div>
          </div>

          <div className="invoice-card__actions">
            {!connected && (
              <button
                className="btn btn--primary"
                onClick={connect}
                disabled={connecting}
              >
                {connecting ? "Connecting..." : "Connect Wallet"}
              </button>
            )}

            {connected && canRelease && (
              <button
                className="btn btn--primary"
                onClick={handleRelease}
                disabled={submitting}
              >
                {submitting ? "Releasing..." : "Release Escrow"}
              </button>
            )}

            {connected && invoice.status !== InvoiceStatus.Paid && (
              <p className="status-text">
                Escrow release is available on Paid invoices
                (current status: {invoice.status}).
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
