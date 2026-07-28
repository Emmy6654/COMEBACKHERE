import { useState, useCallback } from "react"
import { getAllowedTokens, addAllowedToken, removeAllowedToken } from "../utils/treasury"

// Stellar contract address: C... (56 chars) or G... (56 chars)
function isValidContractAddress(value: string): boolean {
  return /^[CG][A-Z2-7]{55}$/.test(value.trim())
}

interface ConfirmDialog {
  token: string
  action: "add" | "remove"
}

export function TokenAllowlist() {
  const [tokens, setTokens] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [newToken, setNewToken] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [addSuccess, setAddSuccess] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const [confirm, setConfirm] = useState<ConfirmDialog | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const loadTokens = useCallback(async () => {
    setLoadError(null)
    setLoading(true)
    try {
      const list = await getAllowedTokens()
      setTokens(list)
      setLoaded(true)
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : "Failed to load tokens")
    } finally {
      setLoading(false)
    }
  }, [])

  const handleAdd = () => {
    setAddError(null)
    setAddSuccess(null)
    if (!isValidContractAddress(newToken)) {
      setAddError("Enter a valid Stellar contract address (C... or G..., 56 chars)")
      return
    }
    setConfirm({ token: newToken.trim(), action: "add" })
  }

  const handleAddConfirmed = async () => {
    if (!confirm || confirm.action !== "add") return
    setAddError(null)
    setAddSuccess(null)
    setAdding(true)
    try {
      const result = await addAllowedToken(confirm.token)
      if (!result.success) throw new Error(result.error ?? "Add failed")
      setAddSuccess(`Token added. tx: ${result.hash}`)
      setNewToken("")
      setConfirm(null)
      await loadTokens()
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Add failed")
    } finally {
      setAdding(false)
    }
  }

  const handleRemoveConfirmed = async () => {
    if (!confirm || confirm.action !== "remove") return
    setRemoveError(null)
    setRemoving(true)
    try {
      const result = await removeAllowedToken(confirm.token)
      if (!result.success) throw new Error(result.error ?? "Remove failed")
      setConfirm(null)
      await loadTokens()
    } catch (err: unknown) {
      setRemoveError(err instanceof Error ? err.message : "Remove failed")
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="compliance-manager">
      <h1>Token Allowlist</h1>

      {/* Load button */}
      {!loaded && (
        <button
          className="btn btn--secondary"
          onClick={loadTokens}
          disabled={loading}
          style={{ marginBottom: "20px" }}
        >
          {loading ? "Loading..." : "Load Allowlisted Tokens"}
        </button>
      )}

      {loadError && <div className="message message--error">{loadError}</div>}

      {/* Add token form */}
      <div className="compliance-form" style={{ marginBottom: "24px" }}>
        <label>
          Token Contract Address
          <input
            type="text"
            placeholder="C... or G..."
            value={newToken}
            onChange={(e) => setNewToken(e.target.value)}
            aria-label="Token contract address"
          />
        </label>
        <div className="compliance-actions">
          <button
            className="btn btn--primary"
            onClick={handleAdd}
            disabled={adding || !newToken}
            aria-label="Add token to allowlist"
          >
            {adding ? "Adding..." : "Add Token"}
          </button>
          {loaded && (
            <button
              className="btn btn--secondary"
              onClick={loadTokens}
              disabled={loading}
              aria-label="Refresh token list"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          )}
        </div>
      </div>

      {addError && <div className="message message--error">{addError}</div>}
      {addSuccess && <div className="message message--success">{addSuccess}</div>}
      {removeError && <div className="message message--error">{removeError}</div>}

      {/* Token table */}
      {loaded && (
        <div className="managed-table-wrapper">
          <h2>Allowlisted Tokens</h2>
          <table className="managed-table">
            <thead>
              <tr>
                <th>Contract Address</th>
                <th style={{ width: "100px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {tokens.length === 0 ? (
                <tr>
                  <td colSpan={2} className="empty-row">
                    No tokens allowlisted yet.
                  </td>
                </tr>
              ) : (
                tokens.map((token) => (
                  <tr key={token}>
                    <td className="address-cell">{token}</td>
                    <td>
                      <button
                        className="btn btn--danger btn--sm"
                        onClick={() => setConfirm({ token, action: "remove" })}
                        aria-label={`Remove token ${token}`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--color-overlay)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius)",
              padding: "24px",
              maxWidth: "440px",
              width: "100%",
              boxShadow: "var(--shadow)",
            }}
          >
            <h3 id="confirm-title" style={{ marginBottom: "12px" }}>
              {confirm.action === "add" ? "Add token to allowlist?" : "Remove token from allowlist?"}
            </h3>
            <p style={{ wordBreak: "break-all", marginBottom: "20px", fontSize: "0.9rem" }}>
              {confirm.token}
            </p>
            <p style={{ marginBottom: "20px", color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>
              {confirm.action === "add"
                ? "This will call add_allowed_token on the treasury contract. The token will be accepted for treasury operations."
                : "This will call remove_allowed_token on the treasury contract. The token will no longer be accepted. If this token has pending settlements or balances, they may be blocked."}
            </p>
            {removeError && (
              <div className="message message--error" style={{ marginBottom: "12px" }}>
                {removeError}
              </div>
            )}
            {addError && (
              <div className="message message--error" style={{ marginBottom: "12px" }}>
                {addError}
              </div>
            )}
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                className="btn btn--secondary"
                onClick={() => {
                  setConfirm(null)
                  setRemoveError(null)
                  setAddError(null)
                }}
                disabled={removing || adding}
              >
                Cancel
              </button>
              <button
                className={`btn ${confirm.action === "add" ? "btn--primary" : "btn--danger"}`}
                onClick={confirm.action === "add" ? handleAddConfirmed : handleRemoveConfirmed}
                disabled={removing || adding}
              >
                {confirm.action === "add"
                  ? adding
                    ? "Adding..."
                    : "Confirm Add"
                  : removing
                    ? "Removing..."
                    : "Confirm Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
