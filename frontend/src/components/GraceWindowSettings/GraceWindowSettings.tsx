import { useCallback, useEffect, useState } from "react"
import "./GraceWindowSettings.css"

const API_BASE = "/api"

function formatDuration(seconds: number): string {
  if (seconds % 86400 === 0) {
    const days = seconds / 86400
    return `${days} day${days === 1 ? "" : "s"}`
  }
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600
    return `${hours} hour${hours === 1 ? "" : "s"}`
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60
    return `${minutes} minute${minutes === 1 ? "" : "s"}`
  }
  return `${seconds} seconds`
}

function parseDurationInput(value: string, unit: "seconds" | "minutes" | "hours" | "days"): number | null {
  const n = Number(value)
  if (!value || Number.isNaN(n) || n <= 0 || !Number.isInteger(n)) return null

  switch (unit) {
    case "seconds":
      return n
    case "minutes":
      return n * 60
    case "hours":
      return n * 3600
    case "days":
      return n * 86400
    default:
      return null
  }
}

function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="grace-modal-title">
      <div className="modal">
        <h3 id="grace-modal-title" className="modal__title">Confirm grace window change</h3>
        <p className="modal__message">{message}</p>
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={onConfirm}>
            Apply change
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GraceWindowSettings() {
  const [currentSeconds, setCurrentSeconds] = useState<number | null>(null)
  const [inputValue, setInputValue] = useState("24")
  const [inputUnit, setInputUnit] = useState<"seconds" | "minutes" | "hours" | "days">("hours")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const fetchGraceWindow = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${API_BASE}/invoice/grace-window`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data: { grace_window_seconds: number } = await res.json()
      setCurrentSeconds(data.grace_window_seconds)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load grace window")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchGraceWindow()
  }, [fetchGraceWindow])

  const parsedSeconds = parseDurationInput(inputValue, inputUnit)

  const handleSave = async () => {
    if (!parsedSeconds) {
      setError("Enter a valid positive duration")
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`${API_BASE}/invoice/grace-window`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grace_window_seconds: parsedSeconds }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      setCurrentSeconds(body.grace_window_seconds)
      setSuccess(
        `Grace window updated to ${formatDuration(body.grace_window_seconds)}.` +
          (body.tx_hash ? ` Transaction: ${body.tx_hash.slice(0, 12)}…` : ""),
      )
      setShowConfirm(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update grace window")
      setShowConfirm(false)
    } finally {
      setSaving(false)
    }
  }

  const confirmMessage =
    parsedSeconds != null
      ? `This will change the invoice grace window to ${formatDuration(parsedSeconds)} (${parsedSeconds} seconds) for all future escrow releases. Continue?`
      : ""

  return (
    <section className="settings-panel">
      <div>
        <h3 className="settings-panel__title">Invoice grace window</h3>
        <p className="settings-panel__description">
          Time merchants must wait after a refund request before escrow can be released.
          {loading
            ? " Loading current value…"
            : currentSeconds != null
              ? ` Current: ${formatDuration(currentSeconds)} (${currentSeconds} seconds).`
              : ""}
        </p>
      </div>

      <div className="grace-window-form">
        <div className="grace-window-form__row">
          <label className="form-label" htmlFor="grace-window-value">
            New duration
          </label>
          <div className="grace-window-form__inputs">
            <input
              id="grace-window-value"
              className="form-input grace-window-form__value"
              type="number"
              min="1"
              step="1"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={loading || saving}
            />
            <select
              className="form-input grace-window-form__unit"
              value={inputUnit}
              onChange={(e) => setInputUnit(e.target.value as typeof inputUnit)}
              disabled={loading || saving}
              aria-label="Duration unit"
            >
              <option value="seconds">Seconds</option>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        </div>

        {parsedSeconds != null && currentSeconds != null && parsedSeconds !== currentSeconds && (
          <p className="settings-panel__description">
            Preview: {formatDuration(parsedSeconds)} ({parsedSeconds} seconds on-chain)
          </p>
        )}

        <button
          type="button"
          className="btn btn--primary grace-window-form__save"
          disabled={loading || saving || parsedSeconds == null}
          onClick={() => setShowConfirm(true)}
        >
          {saving ? "Saving…" : "Save grace window"}
        </button>
      </div>

      {error && <p className="form-error grace-window-form__feedback">{error}</p>}
      {success && <p className="form-success grace-window-form__feedback">{success}</p>}

      {showConfirm && (
        <ConfirmModal
          message={confirmMessage}
          onConfirm={() => void handleSave()}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </section>
  )
}
