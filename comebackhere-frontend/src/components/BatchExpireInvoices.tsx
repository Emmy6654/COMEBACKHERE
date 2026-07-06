import { useState } from "react"
import { StatusBadge } from "./StatusBadge"
import { fetchInvoice, batchExpireInvoices } from "../utils/soroban"
import type { Invoice } from "../types"
import { InvoiceStatus } from "../types"

const CONTRACT_ID = import.meta.env.VITE_INVOICE_CONTRACT_ID as string

interface BatchExpireInvoicesProps {
  walletAddress: string | null
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

  const handleBatchExpire = async () => {
    if (!walletAddress || selected.size === 0) return

    const selectedIds = Array.from(selected).map(Number)
    setBatchResult(null)
    setErrors([])
    setProgress({ done: 0, total: selectedIds.length })
    setSubmitting(true)

    const result = await batchExpireInvoices(CONTRACT_ID, selectedIds, walletAddress)

    if (!result.success) {
      setSubmitting(false)
      setProgress(null)
      setBatchResult({ success: false, errorMsg: result.error })
      return
    }

    const errorList: { id: string; msg: string }[] = []
    let done = 0

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

      {errors.length > 0 && (
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
            Verifying {progress.done} of {progress.total} invoices...
          </p>
          <div className="progress-bar">
            <div
              className="progress-bar__fill"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {invoices.length > 0 && (
        <>
          <div className="batch-expire__actions">
            <button
              className="btn btn--danger"
              onClick={handleBatchExpire}
              disabled={submitting || selected.size === 0 || !walletAddress}
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
