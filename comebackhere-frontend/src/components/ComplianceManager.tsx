import { useMemo, useState } from "react"
import {
  allowAddress,
  allowAddressUntil,
  blockAddress,
  clearAddress,
  ComplianceStatus,
  ComplianceStatusResult,
  getAddressStatus,
  getSignerAddress,
} from "../utils/compliance"
import { CopyableText } from "./CopyableText"

interface ManagedAddress {
  address: string
  status: ComplianceStatus
  expiresAt?: number | null
  lastUpdated?: string
}

const statusLabels: Record<ComplianceStatus, string> = {
  Allowed: "Allowed",
  AllowedUntil: "Allowed until",
  Blocked: "Blocked",
  Cleared: "Cleared",
}

function ComplianceStatusBadge({ status }: { status: ComplianceStatus }) {
  const cssClass = `badge badge--compliance-${status.toLowerCase()}`
  return <span className={cssClass}>{statusLabels[status]}</span>
}

function isValidStellarAddress(value: string) {
  return /^G[A-Z2-7]{55}$/.test(value.trim())
}

export function ComplianceManager() {
  const [address, setAddress] = useState("")
  const [expiry, setExpiry] = useState("")
  const [status, setStatus] = useState<ComplianceStatusResult | null>(null)
  const [managed, setManaged] = useState<ManagedAddress[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionSubmitting, setActionSubmitting] = useState(false)

  const addressValid = isValidStellarAddress(address)
  const expiryTimestamp = useMemo(() => {
    if (!expiry) return null
    const parsed = new Date(expiry).getTime()
    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
  }, [expiry])

  const addOrUpdateManaged = (entry: ManagedAddress) => {
    setManaged((prev) => {
      const existingIndex = prev.findIndex((item) => item.address === entry.address)
      const updatedEntry = {
        ...entry,
        lastUpdated: new Date().toLocaleString(),
      }
      if (existingIndex >= 0) {
        return prev.map((item, idx) => (idx === existingIndex ? updatedEntry : item))
      }
      return [updatedEntry, ...prev]
    })
  }

  const handleFetchStatus = async () => {
    setError(null)
    setMessage(null)
    if (!addressValid) {
      setError("Enter a valid Stellar address starting with G and 56 chars.")
      return
    }
    setLoading(true)
    try {
      const result = await getAddressStatus(address.trim())
      setStatus(result)
      addOrUpdateManaged({
        address: address.trim(),
        status: result.status,
        expiresAt: result.expiresAt,
      })
      setMessage("Loaded current compliance status.")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch address status")
    } finally {
      setLoading(false)
    }
  }

  const submitAction = async (
    action: (publicKey: string) => Promise<{ success: boolean; error?: string; hash?: string }>,
    successText: string
  ) => {
    setError(null)
    setMessage(null)
    setActionSubmitting(true)
    try {
      const publicKey = await getSignerAddress()
      const result = await action(publicKey)
      if (!result.success) {
        throw new Error(result.error ?? "Action failed")
      }
      setMessage(`${successText} Transaction hash: ${result.hash}`)
      await handleFetchStatus()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setActionSubmitting(false)
    }
  }

  const handleAllow = async () => {
    if (!addressValid) {
      setError("Enter a valid Stellar address starting with G and 56 chars.")
      return
    }
    await submitAction(
      (publicKey) =>
        expiryTimestamp
          ? allowAddressUntil(address.trim(), expiryTimestamp, publicKey)
          : allowAddress(address.trim(), publicKey),
      expiryTimestamp ? "Allowed address until expiry." : "Address allowed."
    )
  }

  const handleBlock = async () => {
    if (!addressValid) {
      setError("Enter a valid Stellar address starting with G and 56 chars.")
      return
    }
    await submitAction(
      (publicKey) => blockAddress(address.trim(), publicKey),
      "Address blocked."
    )
  }

  const handleClear = async () => {
    if (!addressValid) {
      setError("Enter a valid Stellar address starting with G and 56 chars.")
      return
    }
    await submitAction(
      (publicKey) => clearAddress(address.trim(), publicKey),
      "Address cleared."
    )
  }

  return (
    <div className="compliance-manager">
      <h1>Compliance Address Management</h1>

      <div className="compliance-form">
        <label>
          Stellar Address
          <input
            type="text"
            placeholder="G..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>

        <label>
          Allow Until (optional)
          <input
            type="datetime-local"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </label>

        <div className="compliance-actions" role="group" aria-label="Compliance actions">
          <button
            className="btn btn--secondary"
            onClick={handleFetchStatus}
            disabled={loading || actionSubmitting || !addressValid}
            aria-label="Fetch compliance status for address"
          >
            {loading ? "Fetching..." : "Fetch Status"}
          </button>
          <button
            className="btn btn--primary"
            onClick={handleAllow}
            disabled={loading || actionSubmitting || !addressValid}
            aria-label="Allow address on compliance list"
          >
            Allow Address
          </button>
          <button
            className="btn btn--danger"
            onClick={handleBlock}
            disabled={loading || actionSubmitting || !addressValid}
            aria-label="Block address on compliance list"
          >
            Block Address
          </button>
          <button
            className="btn btn--secondary"
            onClick={handleClear}
            disabled={loading || actionSubmitting || !addressValid}
            aria-label="Clear address from compliance list"
          >
            Clear Address
          </button>
        </div>
      </div>

      {error && <div className="message message--error" role="alert">{error}</div>}
      {message && <div className="message message--success" role="status" aria-live="polite">{message}</div>}

      {status && (
        <div className="status-summary">
          <h2>Current Status</h2>
          <div className="detail-row">
            <span className="detail-label">Status</span>
            <span className="detail-value">
              <ComplianceStatusBadge status={status.status} />
            </span>
          </div>
          {status.expiresAt ? (
            <div className="detail-row">
              <span className="detail-label">Expires At</span>
              <span className="detail-value">
                {new Date(status.expiresAt * 1000).toLocaleString()}
              </span>
            </div>
          ) : null}
        </div>
      )}

      <div className="managed-table-wrapper">
        <h2>Managed Addresses</h2>
        <table className="managed-table">
          <thead>
            <tr>
              <th>Address</th>
              <th>Status</th>
              <th>Expires At</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {managed.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-row">
                  No managed addresses yet.
                </td>
              </tr>
            ) : (
              managed.map((entry) => (
                <tr key={entry.address}>
                  <td className="address-cell"><CopyableText text={entry.address} label="Copy address" /></td>
                  <td>
                    <ComplianceStatusBadge status={entry.status} />
                  </td>
                  <td>
                    {entry.expiresAt
                      ? new Date(entry.expiresAt * 1000).toLocaleString()
                      : "—"}
                  </td>
                  <td>{entry.lastUpdated ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
