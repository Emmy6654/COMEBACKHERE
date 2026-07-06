import { useState } from "react"
import { useWallet } from "../hooks/useWallet"

const TREASURY_CONTRACT = import.meta.env.VITE_TREASURY_CONTRACT_ID as string
const ALLOWED_TOKENS: string[] = (import.meta.env.VITE_ALLOWED_TOKENS as string ?? "USDC,XLM").split(",")

interface TreasuryBalance {
  token: string
  balance: string
}

interface FreighterApi {
  signTransaction: (xdr: string, opts: { networkPassphrase: string }) => Promise<string>
}

interface WindowWithFreighter {
  freighterApi?: FreighterApi
  SorobanRpc?: { Server: new (rpc: string) => SorobanRpcServer; assembleTransaction: (tx: unknown, sim: unknown) => { toXDR: () => string } }
}

interface SorobanRpcServer {
  getAccount: (address: string) => Promise<unknown>
  simulateTransaction: (tx: unknown) => Promise<unknown>
  sendTransaction: (signed: string) => Promise<{ hash: string }>
}

function isValidStellarAddress(value: string) {
  return /^G[A-Z2-7]{55}$/.test(value.trim())
}

function isValidAmount(value: string) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0
}

async function callTreasuryAction(
  action: "deposit" | "withdraw",
  token: string,
  amount: string,
  recipient: string,
  walletAddress: string
): Promise<{ success: boolean; hash?: string; error?: string }> {
  try {
    const { Contract, TransactionBuilder, assembleTransaction, BASE_FEE, nativeToScVal, Networks, Address, Server } =
      await import("soroban-client")
    const rpc = import.meta.env.VITE_SOROBAN_RPC as string
    const passphrase = (import.meta.env.VITE_NETWORK_PASSPHRASE as string) ?? Networks.STANDALONE
    const server = new Server(rpc)
    const contract = new Contract(TREASURY_CONTRACT)
    const account = await server.getAccount(walletAddress)

    const stroops = BigInt(Math.round(Number(amount) * 10_000_000))
    const args =
      action === "deposit"
        ? [
            nativeToScVal(Address.fromString(walletAddress), { type: "address" }),
            nativeToScVal(Address.fromString(token), { type: "address" }),
            nativeToScVal(stroops, { type: "i128" }),
          ]
        : [
            nativeToScVal(Address.fromString(walletAddress), { type: "address" }),
            nativeToScVal(Address.fromString(recipient), { type: "address" }),
            nativeToScVal(Address.fromString(token), { type: "address" }),
            nativeToScVal(stroops, { type: "i128" }),
          ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = new TransactionBuilder(account as any, {
      fee: BASE_FEE,
      networkPassphrase: passphrase,
    })
      .addOperation(contract.call(action, ...args))
      .setTimeout(30)
      .build()

    const simulated = await server.simulateTransaction(tx)
    const prepare = assembleTransaction(tx, passphrase, simulated)
    const w = window as unknown as WindowWithFreighter
    const signed = await w.freighterApi?.signTransaction(prepare.build().toXDR(), {
      networkPassphrase: passphrase,
    })
    if (!signed) throw new Error("Wallet not connected or signing was rejected")
    const signedTx = TransactionBuilder.fromXDR(signed, passphrase)
    const result = await server.sendTransaction(signedTx)
    return { success: true, hash: result.hash }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

async function fetchBalances(walletAddress: string): Promise<TreasuryBalance[]> {
  const apiBase = (import.meta.env.VITE_API_BASE as string) ?? "/api"
  const res = await fetch(`${apiBase}/treasury/balances?address=${walletAddress}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<TreasuryBalance[]>
}

export function TreasuryManager() {
  const { address, connected } = useWallet()
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit")
  const [token, setToken] = useState(ALLOWED_TOKENS[0] ?? "USDC")
  const [amount, setAmount] = useState("")
  const [recipient, setRecipient] = useState("")
  const [balances, setBalances] = useState<TreasuryBalance[]>([])
  const [balLoading, setBalLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const amountValid = isValidAmount(amount)
  const recipientValid = tab === "deposit" || isValidStellarAddress(recipient)

  const handleLoadBalances = async () => {
    if (!address) return
    setBalLoading(true)
    setError(null)
    try {
      const data = await fetchBalances(address)
      setBalances(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch balances")
    } finally {
      setBalLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!connected || !address) {
      setError("Connect your wallet first.")
      return
    }
    if (!amountValid) {
      setError("Enter a valid positive amount.")
      return
    }
    if (tab === "withdraw" && !recipientValid) {
      setError("Enter a valid Stellar recipient address.")
      return
    }

    setError(null)
    setMessage(null)
    setSubmitting(true)
    try {
      const result = await callTreasuryAction(tab, token, amount, recipient, address)
      if (!result.success) throw new Error(result.error ?? "Action failed")
      setMessage(`${tab === "deposit" ? "Deposit" : "Withdrawal"} submitted. Tx: ${result.hash}`)
      setAmount("")
      setRecipient("")
      await handleLoadBalances()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="compliance-manager">
      <h1>Treasury Management</h1>

      <div className="tabs" role="tablist" aria-label="Treasury actions">
        <button
          role="tab"
          aria-selected={tab === "deposit"}
          className={`tab ${tab === "deposit" ? "tab--active" : ""}`}
          onClick={() => { setTab("deposit"); setError(null); setMessage(null) }}
        >
          Deposit
        </button>
        <button
          role="tab"
          aria-selected={tab === "withdraw"}
          className={`tab ${tab === "withdraw" ? "tab--active" : ""}`}
          onClick={() => { setTab("withdraw"); setError(null); setMessage(null) }}
        >
          Withdraw
        </button>
      </div>

      <div className="compliance-form">
        <label>
          Token
          <select value={token} onChange={(e) => setToken(e.target.value)}>
            {ALLOWED_TOKENS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>

        <label>
          Amount
          <input
            type="number"
            min="0"
            step="any"
            placeholder="e.g. 100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Amount"
          />
        </label>

        {tab === "withdraw" && (
          <label>
            Recipient Address
            <input
              type="text"
              placeholder="G..."
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              aria-label="Recipient Stellar address"
            />
          </label>
        )}

        <div className="compliance-actions" role="group" aria-label="Treasury form actions">
          <button
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={submitting || !amountValid || !recipientValid}
            aria-label={tab === "deposit" ? "Submit deposit" : "Submit withdrawal"}
          >
            {submitting ? "Submitting..." : tab === "deposit" ? "Deposit" : "Withdraw"}
          </button>
        </div>
      </div>

      {error && <div className="message message--error" role="alert">{error}</div>}
      {message && <div className="message message--success" role="status" aria-live="polite">{message}</div>}

      <div className="managed-table-wrapper">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
          <h2>Treasury Balances</h2>
          <button
            className="btn btn--secondary"
            onClick={handleLoadBalances}
            disabled={balLoading || !connected}
            aria-label="Refresh treasury balances"
          >
            {balLoading ? "Loading..." : "Refresh"}
          </button>
        </div>
        <table className="managed-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {balances.length === 0 ? (
              <tr>
                <td colSpan={2} className="empty-row">No balance data. Click Refresh.</td>
              </tr>
            ) : (
              balances.map((b) => (
                <tr key={b.token}>
                  <td>{b.token}</td>
                  <td>{(Number(b.balance) / 10_000_000).toFixed(7)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
