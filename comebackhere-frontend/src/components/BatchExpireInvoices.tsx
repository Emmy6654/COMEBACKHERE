import { useState } from "react"
import { StatusBadge } from "./StatusBadge"
import { fetchInvoice, batchExpireInvoices } from "../utils/soroban"
import type { Invoice } from "../types"
import { InvoiceStatus } from "../types"

const CONTRACT_ID = import.meta.env.VITE_INVOICE_CONTRACT_ID as string

interface BatchExpireInvoicesProps {
  walletAddress: string | null
}

interface ConfirmationState {
  show: boolean
  invoiceIds: string[]
  invoiceCount: number
}

interface ResultSummary {
  total: number
  succeeded: number
  failed: number
  errors: { id: string; msg: string }[]
}

export function BatchExpireInvoices({ walletAddress }: BatchExpireInvoicesProps) {
  const [idInput, setIdInput] = useState("")
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadingIds, setLoadingIds] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [batchResult, setBatchResult] = useState<{
    success: boolean
    hash?: string
    errorMsg?: string
  } | null>(null)
  const [errors, setErrors] = useState<{ id: string; msg: string }[]>([])
  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    show: false,
    invoiceIds: [],
    invoiceCount: 0,
  })
  const [resultSummary, setResultSummary] = useState<ResultSummary | null>(null)

  const pendingInvoices = invoices.filter((inv) => inv.status === InvoiceStatus.Pending)
  const allSelected =
    pendingInvoices.length > 0 && pendingInvoices.every((inv) => selected.has(inv.id))

  const handleLoadInvoices = async () => {
    setLoadError(null)
    setInvoices([])
    setSelected(new Set())
    setBatchResult(null)
    setErrors([])
    setProgress(null)
    setConfirmation({ show: false, invoiceIds: [], invoiceCount: 0 })
    setResultSummary(null)

    const ids = idInput
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)

    if (ids.length === 0) {
      setLoadError("Enter at least one valid invoice ID.")
      return
    }

    setLoadingIds(true)
    const loaded: Invoice[] = []
    for (const id of ids) {
      try {
        const inv = await fetchInvoice(CONTRACT_ID, id)
        loaded.push(inv)
      } catch {
        // skip invoices that can't be fetched
      }
    }
    setLoadingIds(false)
    setInvoices(loaded)

    if (loaded.length === 0) {
      setLoadError("No invoices found for the given IDs.")
    }
  }

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(pendingInvoices.map((inv) => inv.id)))
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleShowConfirmation = () => {
    const selectedIds = Array.from(selected).sort((a, b) => Number(a) - Number(b))
    setConfirmation({
      show: true,
      invoiceIds: selectedIds,
      invoiceCount: selectedIds.length,
    })
  }

  const handleCancelConfirmation = () => {
    setConfirmation({ show: false, invoiceIds: [], invoiceCount: 0 })
  }

  const handleBatchExpire = async () => {
    if (!walletAddress || selected.size === 0) return

    const selectedIds = Array.from(selected).map(Number)
    setBatchResult(null)
    setErrors([])
    setProgress({ done: 0, total: selectedIds.length })
    setSubmitting(true)
    setConfirmation({ show: false, invoiceIds: [], invoiceCount: 0 })

    const result = await batchExpireInvoices(CONTRACT_ID, selectedIds, walletAddress)

    if (!result.success) {
      setSubmitting(false)
      setProgress(null)
      setBatchResult({ success: false, errorMsg: result.error })
      setResultSummary(null)
      return
    }

    const errorList: { id: string; msg: string }[] = []
    let done = 0
    let succeeded = 0

    for (const id of selectedIds) {
      try {
        const updated = await fetchInvoice(CONTRACT_ID, id)
        setInvoices((prev) =>
          prev.map((inv) => (inv.id === updated.id ? updated : inv))
        )
        if (updated.status !== InvoiceStatus.Expired) {
          errorList.push({
            id: String(id),
            msg: `Invoice #${id} was not expired (status: ${updated.status})`,
          })
        } else {
          succeeded++
        }
      } catch (err: unknown) {
        errorList.push({
          id: String(id),
          msg: `Invoice #${id}: ${err instanceof Error ? err.message : "failed to verify"}`,
        })
      }
      done++
      setProgress({ done, total: selectedIds.length })
    }

    setSubmitting(false)
    setErrors(errorList)
    setBatchResult({ success: true, hash: result.transaction_hash })
    setResultSummary({
      total: selectedIds.length,
      succeeded,
      failed: errorList.length,
      errors: errorList,
    })
    setSelected(new Set())
  }

  return (
    <div className="batch-expire">
      <h1>Batch Expire Invoices</h1>

      <div className="invoice-lookup">
        <input
          type="text"
          placeholder="Invoice IDs (comma-separated, e.g. 1, 2, 3)"
          value={idInput}
          onChange={(e) => setIdInput(e.target.value)}
        />
        <button
          className="btn btn--secondary"
          onClick={handleLoadInvoices}
          disabled={loadingIds || !idInput.trim()}
        >
          {loadingIds ? "Loading..." : "Load Invoices"}
        </button>
      </div>

      {loadError && <div className="message message--error">{loadError}</div>}

      {batchResult && (
        <div
          className={`message message--${batchResult.success ? "success" : "error"}`}
        >
          {batchResult.success ? (
            <>
              Batch expire submitted.
              <br />
              Transaction hash:{" "}
              <code className="tx-hash">{batchResult.hash}</code>
            </>
          ) : (
            <>Batch expire failed: {batchResult.errorMsg}</>
          )}
        </div>
      )}

      {resultSummary && (
        <div className="batch-result-summary" role="status" aria-live="polite">
          <h3>Batch Processing Summary</h3>
          <div className="summary-stats">
            <div className="summary-stat">
              <span className="stat-label">Total Invoices</span>
              <span className="stat-value">{resultSummary.total}</span>
            </div>
            <div className="summary-stat summary-stat--success">
              <span className="stat-label">Successfully Expired</span>
              <span className="stat-value">{resultSummary.succeeded}</span>
            </div>
            <div className={`summary-stat${resultSummary.failed > 0 ? " summary-stat--error" : ""}`}>
              <span className="stat-label">Failed</span>
              <span className="stat-value">{resultSummary.failed}</span>
            </div>
          </div>
          {resultSummary.errors.length > 0 && (
            <div className="summary-errors">
              <strong>Errors:</strong>
              <ul className="error-list">
                {resultSummary.errors.map((e) => (
                  <li key={e.id}>{e.msg}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {errors.length > 0 && !resultSummary && (
        <div className="message message--error">
          <strong>Some invoices could not be expired:</strong>
          <ul className="error-list">
            {errors.map((e) => (
              <li key={e.id}>{e.msg}</li>
            ))}
          </ul>
        </div>
      )}

      {progress && (
        <div className="progress-bar-wrapper">
          <p className="status-text">
            Processing {progress.done} of {progress.total} invoices...
          </p>
          <div className="progress-bar">
            <div
              className="progress-bar__fill"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
              role="progressbar"
              aria-valuenow={progress.done}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-label="Batch expiration progress"
            />
          </div>
        </div>
      )}

      {confirmation.show && (
        <div className="modal-overlay" onClick={handleCancelConfirmation} role="presentation">
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-batch-title"
          >
            <h2 id="confirm-batch-title">Confirm Batch Expiration</h2>
            <p className="modal-desc">
              You are about to expire{" "}
              <strong>{confirmation.invoiceCount}</strong> invoice{confirmation.invoiceCount !== 1 ? "s" : ""}.
              This action cannot be undone.
            </p>

            <div className="confirmation-details">
              <h3>Invoices to be expired:</h3>
              <div className="invoice-ids-list">
                {confirmation.invoiceIds.map((id) => (
                  <span key={id} className="invoice-id-badge">
                    #{id}
                  </span>
                ))}
              </div>
            </div>

            <div className="modal-actions" role="group" aria-label="Batch expiration confirmation actions">
              <button
                className="btn btn--secondary"
                onClick={handleCancelConfirmation}
                disabled={submitting}
                aria-label="Cancel batch expiration"
              >
                Cancel
              </button>
              <button
                className="btn btn--danger"
                onClick={handleBatchExpire}
                disabled={submitting}
                aria-label={submitting ? "Processing batch expiration" : "Confirm batch expiration"}
              >
                {submitting ? "Processing..." : "Confirm Expiration"}
              </button>
            </div>
          </div>
        </div>
      )}

      {invoices.length > 0 && (
        <>
          <div className="batch-expire__actions">
            <button
              className="btn btn--danger"
              onClick={handleShowConfirmation}
              disabled={submitting || selected.size === 0 || !walletAddress}
              aria-label={`Expire ${selected.size} selected invoices`}
            >
              {submitting
                ? "Expiring..."
                : `Batch Expire (${selected.size} selected)`}
            </button>
            {!walletAddress && (
              <p className="status-text">Connect wallet to batch expire.</p>
            )}
          </div>

          <div className="managed-table-wrapper">
            <table className="managed-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all pending invoices"
                    />
                  </th>
                  <th>ID</th>
                  <th>Merchant</th>
                  <th>Amount (USDC)</th>
                  <th>Expires At</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const isPending = inv.status === InvoiceStatus.Pending
                  return (
                    <tr key={inv.id} className={isPending ? "" : "row--disabled"}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                          disabled={!isPending}
                          aria-label={`Select invoice ${inv.id}`}
                        />
                      </td>
                      <td>#{inv.id}</td>
                      <td className="address-cell">{inv.merchant}</td>
                      <td>{inv.amount_usdc}</td>
                      <td>{new Date(inv.expires_at * 1000).toLocaleString()}</td>
                      <td>
                        <StatusBadge status={inv.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
