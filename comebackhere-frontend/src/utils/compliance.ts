import {
  Contract,
  Transaction,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  xdr,
  nativeToScVal,
  Server,
  assembleTransaction,
  SorobanRpc,
} from "soroban-client"

export type ComplianceStatus = "Allowed" | "AllowedUntil" | "Blocked" | "Cleared"
export interface ComplianceStatusResult {
  status: ComplianceStatus
  expiresAt?: number | null
}

const COMPLIANCE_CONTRACT_ID = import.meta.env.VITE_COMPLIANCE_CONTRACT_ID as string
const SOROBAN_RPC = import.meta.env.VITE_SOROBAN_RPC as string
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE as string

interface FreighterApi {
  getAddress: () => Promise<{ address: string }>
  signTransaction: (xdr: string, opts: { networkPassphrase: string }) => Promise<string>
}

interface WindowWithFreighter extends Window {
  freighterApi?: FreighterApi
}

function getNetworkPassphrase(): string {
  return NETWORK_PASSPHRASE || Networks.STANDALONE
}

function getServer(): Server {
  return new Server(SOROBAN_RPC)
}

function u64ToNumber(v: xdr.Uint64 | undefined): number {
  return Number(v?.toString() ?? 0)
}

function parseAddressStatus(scVal: xdr.ScVal): ComplianceStatusResult {
  const vec = scVal.vec()
  const variant = vec?.[0]?.sym()?.toString() ?? "Cleared"
  return {
    status: variant as ComplianceStatus,
    expiresAt: variant === "AllowedUntil" ? u64ToNumber(vec?.[1]?.u64()) : null,
  }
}

export async function getAddressStatus(address: string): Promise<ComplianceStatusResult> {
  const server = getServer()
  const result = await server.simulateTransaction(
    new TransactionBuilder(await server.getAccount(COMPLIANCE_CONTRACT_ID), {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(new Contract(COMPLIANCE_CONTRACT_ID).call("get_address_status", nativeToScVal(address, { type: "address" })))
      .setTimeout(30)
      .build()
  )
  if (SorobanRpc.isSimulationError(result) || !result.result?.retval) {
    throw new Error("Unable to fetch address status")
  }
  return parseAddressStatus(result.result.retval)
}

export async function getSignerAddress(): Promise<string> {
  const freighter = (window as WindowWithFreighter).freighterApi
  if (!freighter) throw new Error("Connect your wallet to sign compliance updates.")
  const { address } = await freighter.getAddress()
  return address
}

async function submitTransaction(
  publicKey: string,
  operation: string,
  args: xdr.ScVal[]
): Promise<{ success: boolean; error?: string; hash?: string }> {
  try {
    const server = getServer()
    const freighter = (window as WindowWithFreighter).freighterApi
    if (!freighter) throw new Error("Freighter wallet not detected")
    const tx = new TransactionBuilder(await server.getAccount(publicKey), {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(new Contract(COMPLIANCE_CONTRACT_ID).call(operation, ...args))
      .setTimeout(30)
      .build() as Transaction
    const sim = await server.simulateTransaction(tx)
    const prepared = assembleTransaction(tx, getNetworkPassphrase(), sim).build()
    const signedXdr = await freighter.signTransaction(prepared.toXDR(), { networkPassphrase: getNetworkPassphrase() })
    const result = await server.sendTransaction(TransactionBuilder.fromXDR(signedXdr, getNetworkPassphrase()) as Transaction)
    return { success: true, hash: result.hash }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Transaction failed" }
  }
}

export const allowAddress = (address: string, publicKey: string) =>
  submitTransaction(publicKey, "allow_address", [nativeToScVal(address, { type: "address" })])

export const blockAddress = (address: string, publicKey: string) =>
  submitTransaction(publicKey, "block_address", [nativeToScVal(address, { type: "address" })])

export const clearAddress = (address: string, publicKey: string) =>
  submitTransaction(publicKey, "clear_address", [nativeToScVal(address, { type: "address" })])

export const allowAddressUntil = (address: string, untilTimestamp: number, publicKey: string) =>
  submitTransaction(publicKey, "allow_address_until", [
    nativeToScVal(address, { type: "address" }),
    nativeToScVal(untilTimestamp, { type: "u64" }),
  ])
