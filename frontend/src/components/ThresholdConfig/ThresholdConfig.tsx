import { useCallback, useEffect, useState } from "react"
import "./ThresholdConfig.css"

const API_BASE = "/api"

export default function ThresholdConfig() {
  const [current, setCurrent] = useState<number | null>(null)
  const [inputValue, setInputValue] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchThreshold = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${API_BASE}/treasury/threshold`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const data: { threshold: number } = await res.json()
      setCurrent(data.threshold)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load threshold")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchThreshold()
  }, [fetchThreshold])

  const parsed = inputValue !== "" ? Number(inputValue) : null
  const isValid = parsed !== null && Number.isInteger(parsed) && parsed > 0

  const handleSave = async () => {
    if (!isValid || parsed === null) {
      setError("Threshold must be a positive integer")
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`${API_BASE}/treasury/threshold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold: parsed }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const updated = (body as { threshold: number }).threshold
      setCurrent(updated)
      setInputValue("")
      setSuccess(
        `Threshold updated to ${updated}.` +
          ((body as { tx_hash?: string }).tx_hash
            ? ` Transaction: ${(body as { tx_hash: string }).tx_hash.slice(0, 12)}…`
            : ""),
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update threshold")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="settings-panel">
      <div>
        <h3 className="settings-panel__title">Approval threshold</h3>
        <p className="settings-panel__description">
          Minimum combined signer weight required to execute a treasury settlement.
          {loading
            ? " Loading current value…"
            : current !== null
              ? ` Current: ${current}.`
              : ""}
        </p>
      </div>

      <div className="threshold-form">
        <div className="threshold-form__row">
          <label className="form-label" htmlFor="threshold-value">
            New threshold
          </label>
          <input
            id="threshold-value"
            className="form-input threshold-form__value"
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 2"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={loading || saving}
          />
        </div>

        {isValid && parsed !== null && current !== null && parsed !== current && (
          <p className="settings-panel__description">
            Preview: threshold will change from {current} → {parsed}
          </p>
        )}

        <button
          type="button"
          className="btn btn--primary threshold-form__save"
          disabled={loading || saving || !isValid}
          onClick={() => void handleSave()}
        >
          {saving ? "Saving…" : "Save threshold"}
        </button>
      </div>

      {error && <p className="form-error threshold-form__feedback">{error}</p>}
      {success && <p className="form-success threshold-form__feedback">{success}</p>}
    </section>
  )
}
