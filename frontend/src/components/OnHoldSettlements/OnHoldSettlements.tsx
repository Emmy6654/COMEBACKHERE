import { useState, useEffect, useCallback } from 'react'
import { Settlement } from '../../types'

const API_BASE = '/api'

type HoldReason = 'ComplianceReview' | 'FraudCheck' | 'KycPending' | 'AdminHold'

const holdReasonStyles: Record<HoldReason, React.CSSProperties> = {
  ComplianceReview: { background: '#e0e7ff', color: '#3730a3', border: '1px solid #6366f1' },
  FraudCheck:       { background: '#fee2e2', color: '#b91c1c', border: '1px solid #ef4444' },
  KycPending:       { background: '#fef9c3', color: '#854d0e', border: '1px solid #eab308' },
  AdminHold:        { background: '#f3f4f6', color: '#374151', border: '1px solid #9ca3af' },
}

function HoldReasonBadge({ reason }: { reason: string }) {
  const style = holdReasonStyles[reason as HoldReason] ?? holdReasonStyles.AdminHold
  return (
    <span
      style={{
        ...style,
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: '0.75rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
      aria-label={`Hold reason: ${reason}`}
    >
      {reason}
    </span>
  )
}

function shorten(addr: string): string {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function formatAmount(raw: string): string {
  const n = Number(raw)
  if (isNaN(n)) return raw
  return (n / 10_000_000).toFixed(2)
}

type AdminAction = 'release' | 'escalate'

async function performAdminAction(settlementId: number, action: AdminAction): Promise<Settlement> {
  const endpoint = action === 'release'
    ? `${API_BASE}/treasury/release-hold`
    : `${API_BASE}/treasury/escalate-hold`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settlement_id: settlementId }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export default function OnHoldSettlements() {
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [acting, setActing] = useState<Record<number, boolean>>({})

  const fetchOnHold = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${API_BASE}/treasury/on-hold-settlements`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: Settlement[] = await res.json()
      setSettlements(data)
    } catch (e: any) {
      setError(e.message || 'Failed to fetch on-hold settlements')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOnHold()
    const interval = setInterval(fetchOnHold, 15_000)
    return () => clearInterval(interval)
  }, [fetchOnHold])

  const handleAction = async (settlementId: number, action: AdminAction) => {
    setActing(prev => ({ ...prev, [settlementId]: true }))
    setActionError(null)
    setActionSuccess(null)
    try {
      const updated = await performAdminAction(settlementId, action)
      setSettlements(prev => prev.map(s => s.id === updated.id ? updated : s).filter(s => s.status === 'OnHold'))
      setActionSuccess(`Settlement #${settlementId} ${action === 'release' ? 'released' : 'escalated'}.`)
    } catch (e: any) {
      setActionError(`Failed to ${action} settlement #${settlementId}: ${e.message}`)
    } finally {
      setActing(prev => ({ ...prev, [settlementId]: false }))
    }
  }

  if (loading && settlements.length === 0) {
    return <div style={styles.container}><p>Loading on-hold settlements...</p></div>
  }

  if (error && settlements.length === 0) {
    return <div style={styles.container}><p style={{ color: 'var(--color-danger)' }}>Error: {error}</p></div>
  }

  return (
    <div style={styles.container} role="region" aria-label="On-hold settlements">
      <h1 style={styles.title}>On-Hold Settlements</h1>

      {actionError && <p style={{ color: 'var(--color-danger)' }} role="alert">{actionError}</p>}
      {actionSuccess && <p style={{ color: 'var(--color-success)' }} role="status" aria-live="polite">{actionSuccess}</p>}

      {settlements.length === 0 ? (
        <p>No settlements currently on hold.</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>ID</th>
              <th style={styles.th}>Merchant</th>
              <th style={styles.th}>Amount (USDC)</th>
              <th style={styles.th}>Hold Reason</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {settlements.map(s => (
              <tr key={s.id}>
                <td style={styles.td}>{s.id}</td>
                <td style={styles.td}>{shorten(s.merchant_address)}</td>
                <td style={styles.td}>{formatAmount(s.amount)}</td>
                <td style={styles.td}>
                  {s.hold_reason ? (
                    <HoldReasonBadge reason={s.hold_reason} />
                  ) : (
                    <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                  )}
                </td>
                <td style={styles.td}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      style={styles.releaseBtn}
                      disabled={!!acting[s.id]}
                      onClick={() => handleAction(s.id, 'release')}
                      aria-label={`Release hold on settlement #${s.id}`}
                    >
                      {acting[s.id] ? '...' : 'Release'}
                    </button>
                    <button
                      style={styles.escalateBtn}
                      disabled={!!acting[s.id]}
                      onClick={() => handleAction(s.id, 'escalate')}
                      aria-label={`Escalate settlement #${s.id}`}
                    >
                      {acting[s.id] ? '...' : 'Escalate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '2rem 1rem',
    fontFamily: 'system-ui, sans-serif',
    color: 'var(--color-text)',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    marginBottom: '1.5rem',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: 'var(--color-card-bg)',
    boxShadow: 'var(--shadow)',
  },
  th: {
    textAlign: 'left',
    padding: '0.5rem',
    borderBottom: '2px solid var(--color-border)',
    fontWeight: 600,
    fontSize: '0.875rem',
    color: 'var(--color-text-muted)',
  },
  td: {
    padding: '0.5rem',
    borderBottom: '1px solid var(--color-border)',
    fontSize: '0.875rem',
  },
  releaseBtn: {
    padding: '4px 10px',
    fontSize: '0.75rem',
    border: '1px solid var(--color-success)',
    borderRadius: 4,
    background: 'var(--color-success)',
    color: '#fff',
    cursor: 'pointer',
  },
  escalateBtn: {
    padding: '4px 10px',
    fontSize: '0.75rem',
    border: '1px solid var(--color-warning)',
    borderRadius: 4,
    background: 'var(--color-warning)',
    color: '#fff',
    cursor: 'pointer',
  },
}
