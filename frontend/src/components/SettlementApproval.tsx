import { useMemo, useState } from 'react'
import { useSettlements } from '../hooks/useSettlements'
import { useTheme } from '../theme'
import { Settlement, SignerInfo } from '../types'
import { SettlementListSkeleton } from './Skeleton'

const SIGNERS: SignerInfo[] = [
  { address: import.meta.env.VITE_SIGNER_1 ?? '', weight: 1 },
  { address: import.meta.env.VITE_SIGNER_2 ?? '', weight: 1 },
  { address: import.meta.env.VITE_SIGNER_3 ?? '', weight: 1 },
]

const THRESHOLD = Number(import.meta.env.VITE_THRESHOLD ?? 2)

function shorten(addr: string): string {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function formatAmount(raw: string): string {
  const n = Number(raw)
  if (isNaN(n)) return raw
  return (n / 10_000_000).toFixed(2)
}

export function SettlementApproval() {
  const { settlements, loading, error, approveSettlement } = useSettlements()
  const { theme, toggleTheme } = useTheme()
  const [approving, setApproving] = useState<Record<string, boolean>>({})
  const [actionError, setActionError] = useState<string | null>(null)
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  const handleApprove = async (settlementId: number, signer: string) => {
    const key = `${settlementId}-${signer}`
    setApproving(prev => ({ ...prev, [key]: true }))
    setActionError(null)
    try {
      await approveSettlement(settlementId)
    } catch (e: any) {
      setActionError(`Failed to approve settlement #${settlementId}: ${e.message}`)
    } finally {
      setApproving(prev => ({ ...prev, [key]: false }))
    }
  }

  const pendingSettlements = useMemo(
    () => settlements.filter(s => s.status === 'Pending'),
    [settlements],
  )

  if (loading && settlements.length === 0) {
    return <div style={styles.container}><SettlementListSkeleton /></div>
  }

  if (error && settlements.length === 0) {
    return <div style={styles.container}><p style={styles.errorText}>Error: {error}</p></div>
  }

  return (
    <div style={styles.container} role="region" aria-label="Settlement approvals">
      <h1 style={styles.title}>Settlement Approvals</h1>

      {actionError && <p style={{ color: 'red' }} role="alert">{actionError}</p>}

      {pendingSettlements.length === 0 ? (
        <p>No pending settlements.</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>ID</th>
              <th style={styles.th}>Merchant</th>
              <th style={styles.th}>Amount (USDC)</th>
              <th style={styles.th}>Progress</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pendingSettlements.map(settlement => (
              <tr key={settlement.id}>
                <td style={styles.td}>{settlement.id}</td>
                <td style={styles.td}>{shorten(settlement.merchant_address)}</td>
                <td style={styles.td}>{formatAmount(settlement.amount)}</td>
                <td style={styles.td}>{renderProgress(settlement.approval_weight, THRESHOLD)}</td>
                <td style={styles.td}>{renderActions(settlement)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )

  function renderProgress(current: number, required: number) {
    const pct = Math.min(100, Math.round((current / required) * 100))
    return (
      <div style={styles.progressWrap}>
        <div style={styles.progressBar} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${current} of ${required} approvals`}>
          <div
            style={{
              ...styles.progressFill,
              width: `${pct}%`,
              background: current >= required ? '#22c55e' : '#3b82f6',
            }}
          />
        </div>
        <span style={styles.progressText}>
          {current} / {required} approvals
        </span>
      </div>
    )
  }

  function renderActions(settlement: Settlement) {
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {SIGNERS.filter(s => s.address).map(signer => {
          const alreadyApproved = settlement.approvals.includes(signer.address)
          const key = `${settlement.id}-${signer.address}`
          return (
            <button
              key={key}
              onClick={() => handleApprove(settlement.id, signer.address)}
              disabled={alreadyApproved || approving[key]}
              style={{
                ...styles.approveBtn,
                opacity: alreadyApproved ? 0.5 : 1,
                cursor: alreadyApproved ? 'not-allowed' : 'pointer',
              }}
              title={
                alreadyApproved
                  ? 'Already approved by this signer'
                  : `Approve as ${shorten(signer.address)}`
              }
            >
              {approving[key]
                ? '...'
                : alreadyApproved
                  ? `Approved (${shorten(signer.address)})`
                  : `Approve (${shorten(signer.address)})`}
            </button>
          )
        })}
      </div>
    )
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 960,
    margin: '0 auto',
    padding: '2rem 1rem',
    fontFamily: 'system-ui, sans-serif',
    color: 'var(--color-text)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    marginBottom: 0,
  },
  themeToggle: {
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    background: 'var(--color-card-bg)',
    color: 'var(--color-text)',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
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
  errorText: {
    color: 'var(--color-danger)',
  },
  progressWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  progressBar: {
    width: 80,
    height: 8,
    background: 'var(--color-progress-bg)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '0.75rem',
    color: 'var(--color-text-muted)',
    whiteSpace: 'nowrap',
  },
  approveBtn: {
    padding: '4px 8px',
    fontSize: '0.75rem',
    border: '1px solid var(--color-primary)',
    borderRadius: 4,
    background: 'var(--color-primary)',
    color: '#fff',
    cursor: 'pointer',
  },
}
