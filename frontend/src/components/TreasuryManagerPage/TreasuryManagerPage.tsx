import { useState } from 'react'

const API_BASE = '/api'
const ALLOWED_TOKENS: string[] = (import.meta.env.VITE_ALLOWED_TOKENS ?? 'USDC,XLM').split(',')

interface TreasuryBalance {
  token: string
  balance: string
}

function isValidStellarAddress(value: string) {
  return /^G[A-Z2-7]{55}$/.test(value.trim())
}

function isValidAmount(value: string) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0
}

async function postTreasuryAction(
  action: 'deposit' | 'withdraw',
  token: string,
  amount: string,
  recipient: string,
): Promise<{ success: boolean; hash?: string; error?: string }> {
  const body: Record<string, string> = { token, amount }
  if (action === 'withdraw') body.recipient = recipient

  const res = await fetch(`${API_BASE}/treasury/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) return { success: false, error: data.error ?? `HTTP ${res.status}` }
  return { success: true, hash: data.tx_hash }
}

async function fetchBalances(): Promise<TreasuryBalance[]> {
  const res = await fetch(`${API_BASE}/treasury/balances`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export default function TreasuryManagerPage() {
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit')
  const [token, setToken] = useState(ALLOWED_TOKENS[0] ?? 'USDC')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [balances, setBalances] = useState<TreasuryBalance[]>([])
  const [balLoading, setBalLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const amountValid = isValidAmount(amount)
  const recipientValid = tab === 'deposit' || isValidStellarAddress(recipient)

  const handleLoadBalances = async () => {
    setBalLoading(true)
    setError(null)
    try {
      setBalances(await fetchBalances())
    } catch (e: any) {
      setError(e?.message ?? 'Failed to fetch balances')
    } finally {
      setBalLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!amountValid) { setError('Enter a valid positive amount.'); return }
    if (tab === 'withdraw' && !recipientValid) { setError('Enter a valid Stellar recipient address.'); return }

    setError(null)
    setMessage(null)
    setSubmitting(true)
    try {
      const result = await postTreasuryAction(tab, token, amount, recipient)
      if (!result.success) throw new Error(result.error ?? 'Action failed')
      setMessage(`${tab === 'deposit' ? 'Deposit' : 'Withdrawal'} submitted. Tx: ${result.hash}`)
      setAmount('')
      setRecipient('')
      await handleLoadBalances()
    } catch (e: any) {
      setError(e?.message ?? 'Action failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={styles.container} role="region" aria-label="Treasury management">
      <h1 style={styles.title}>Treasury Management</h1>

      <div style={styles.tabs} role="tablist" aria-label="Treasury actions">
        {(['deposit', 'withdraw'] as const).map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
            onClick={() => { setTab(t); setError(null); setMessage(null) }}
          >
            {t === 'deposit' ? 'Deposit' : 'Withdraw'}
          </button>
        ))}
      </div>

      <div style={styles.form}>
        <label style={styles.label}>
          Token
          <select style={styles.input} value={token} onChange={e => setToken(e.target.value)}>
            {ALLOWED_TOKENS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label style={styles.label}>
          Amount
          <input
            style={styles.input}
            type="number"
            min="0"
            step="any"
            placeholder="e.g. 100"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            aria-label="Amount"
          />
        </label>

        {tab === 'withdraw' && (
          <label style={styles.label}>
            Recipient Address
            <input
              style={styles.input}
              type="text"
              placeholder="G..."
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              aria-label="Recipient Stellar address"
            />
          </label>
        )}

        <button
          style={{ ...styles.btn, opacity: submitting || !amountValid || !recipientValid ? 0.6 : 1 }}
          onClick={handleSubmit}
          disabled={submitting || !amountValid || !recipientValid}
          aria-label={tab === 'deposit' ? 'Submit deposit' : 'Submit withdrawal'}
        >
          {submitting ? 'Submitting...' : tab === 'deposit' ? 'Deposit' : 'Withdraw'}
        </button>
      </div>

      {error && <p style={styles.errorText} role="alert">{error}</p>}
      {message && <p style={styles.successText} role="status" aria-live="polite">{message}</p>}

      <div style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Treasury Balances</h2>
          <button
            style={{ ...styles.btn, background: 'var(--color-primary-hover)', fontSize: '0.8rem', padding: '4px 12px' }}
            onClick={handleLoadBalances}
            disabled={balLoading}
            aria-label="Refresh treasury balances"
          >
            {balLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Token</th>
              <th style={styles.th}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {balances.length === 0 ? (
              <tr>
                <td colSpan={2} style={{ ...styles.td, color: 'var(--color-text-muted)' }}>
                  No balance data. Click Refresh.
                </td>
              </tr>
            ) : (
              balances.map(b => (
                <tr key={b.token}>
                  <td style={styles.td}>{b.token}</td>
                  <td style={styles.td}>{(Number(b.balance) / 10_000_000).toFixed(7)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 700,
    margin: '0 auto',
    padding: '2rem 1rem',
    color: 'var(--color-text)',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    marginBottom: '1.5rem',
  },
  tabs: {
    display: 'flex',
    gap: 8,
    marginBottom: '1.5rem',
  },
  tab: {
    padding: '6px 18px',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    background: 'var(--color-card-bg)',
    color: 'var(--color-text)',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  tabActive: {
    background: 'var(--color-primary)',
    color: '#fff',
    borderColor: 'var(--color-primary)',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    background: 'var(--color-card-bg)',
    padding: '1.5rem',
    borderRadius: 8,
    boxShadow: 'var(--shadow)',
    marginBottom: '1rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  input: {
    padding: '8px 10px',
    border: '1px solid var(--color-input-border)',
    borderRadius: 6,
    background: 'var(--color-input-bg)',
    color: 'var(--color-text)',
    fontSize: '0.9rem',
  },
  btn: {
    padding: '8px 20px',
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontWeight: 600,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
  errorText: {
    color: 'var(--color-danger)',
    fontSize: '0.875rem',
    marginTop: 8,
  },
  successText: {
    color: 'var(--color-success)',
    fontSize: '0.875rem',
    marginTop: 8,
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
}
