import {
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  xdr,
  nativeToScVal,
} from "soroban-client"

const TREASURY_CONTRACT_ID =
  import.meta.env.VITE_TREASURY_CONTRACT_ID as string
const SOROBAN_RPC = import.meta.env.VITE_SOROBAN_RPC as string
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE as string

interface FreighterApi {
  getAddress: () => Promise<{ address: string }>
  signTransaction: (xdr: string, opts: { networkPassphrase: string }) => Promise<string>
}

interface SorobanRpcApi {
  Server: new (url: string) => {
    getAccount: (address: string) => Promise<unknown>
    simulateTransaction: (tx: unknown) => Promise<unknown>
    sendTransaction: (tx: unknown) => Promise<{ hash: string }>
  }
  assembleTransaction: (tx: unknown, sim: unknown) => { toXDR: () => string }
}

interface WindowWithWallet extends Window {
  freighterApi?: FreighterApi
  SorobanRpc?: SorobanRpcApi
}

function getNetworkPassphrase(): string {
  return NETWORK_PASSPHRASE || Networks.STANDALONE
}

function getServer() {
  const sorobanRpc = (window as WindowWithWallet).SorobanRpc
  if (!sorobanRpc) throw new Error("SorobanRpc not available on window")
  return new sorobanRpc.Server(SOROBAN_RPC)
}

async function getPublicKey(): Promise<string> {
  const freighter = (window as WindowWithWallet).freighterApi
  if (!freighter) throw new Error("Freighter wallet not detected")
  const { address } = await freighter.getAddress()
  return address
}

/**
 * Returns the list of currently allowlisted token contract addresses.
 */
export async function getAllowedTokens(): Promise<string[]> {
  const server = getServer()
  const contract = new Contract(TREASURY_CONTRACT_ID)

  const result = await server.simulateTransaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new TransactionBuilder(await server.getAccount(TREASURY_CONTRACT_ID) as any, {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(contract.call("get_allowed_tokens"))
      .setTimeout(30)
      .build()
  ) as { result?: { retval?: xdr.ScVal } }

  if (!result.result?.retval) return []

  const vec: xdr.ScVal[] = result.result.retval.vec() ?? []
  return vec.map((v) => {
    try {
      return v.address().toString()
    } catch {
      return v.toString()
    }
  })
}

async function submitTokenOp(
  operation: "add_allowed_token" | "remove_allowed_token",
  tokenAddress: string
): Promise<{ success: boolean; error?: string; hash?: string }> {
  try {
    const server = getServer()
    const contract = new Contract(TREASURY_CONTRACT_ID)
    const publicKey = await getPublicKey()
    const freighter = (window as WindowWithWallet).freighterApi
    if (!freighter) throw new Error("Freighter wallet not detected")
    const sorobanRpc = (window as WindowWithWallet).SorobanRpc
    if (!sorobanRpc) throw new Error("SorobanRpc not available on window")

    const args = [nativeToScVal(tokenAddress, { type: "address" })]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = new TransactionBuilder(await server.getAccount(publicKey) as any, {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(contract.call(operation, ...args))
      .setTimeout(30)
      .build()

    const simulated = await server.simulateTransaction(tx)
    const prepare = sorobanRpc.assembleTransaction(tx, simulated)
    const signed = await freighter.signTransaction(
      prepare.toXDR(),
      { networkPassphrase: getNetworkPassphrase() }
    )

    const txHash = await server.sendTransaction(signed)
    return { success: true, hash: txHash.hash }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Transaction failed" }
  }
}

export function addAllowedToken(
  tokenAddress: string
): Promise<{ success: boolean; error?: string; hash?: string }> {
  return submitTokenOp("add_allowed_token", tokenAddress)
}

export function removeAllowedToken(
  tokenAddress: string
): Promise<{ success: boolean; error?: string; hash?: string }> {
  return submitTokenOp("remove_allowed_token", tokenAddress)
}

export interface TreasuryBalance {
  token: string
  balance: string
}

/**
 * Fetches current treasury balances for a given wallet address from the
 * backend balances endpoint.
 */
export async function fetchBalances(walletAddress: string): Promise<TreasuryBalance[]> {
  const apiBase = (import.meta.env.VITE_API_BASE as string) ?? "/api"
  const res = await fetch(`${apiBase}/treasury/balances?address=${encodeURIComponent(walletAddress)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<TreasuryBalance[]>
}
