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
import type { Invoice, InvoiceStatus, PaymentResult } from "../types"

const SOROBAN_RPC = import.meta.env.VITE_SOROBAN_RPC as string
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE as string

interface FreighterApi {
  getAddress: () => Promise<{ address: string }>
  signTransaction: (xdr: string, opts: { networkPassphrase: string }) => Promise<string>
}

interface SorobanRpcApi {
  assembleTransaction: (tx: unknown, sim: unknown) => { build: () => { toXDR: () => string } }
}

interface WindowWithFreighter extends Window {
  freighterApi?: FreighterApi
  SorobanRpc?: SorobanRpcApi
}

export function getNetworkPassphrase(): string {
  return NETWORK_PASSPHRASE || Networks.STANDALONE
}

function getServer(): Server {
  return new Server(SOROBAN_RPC)
}

function u64ToNumber(value: xdr.Uint64 | undefined): number {
  return Number(value?.toString() ?? 0)
}

function scValToInvoice(scVal: xdr.ScVal): Invoice {
  const map = scVal.map()
  if (!map) throw new Error("Invalid invoice response")
  const entries: Record<string, xdr.ScVal> = {}
  for (const entry of map) {
    entries[entry.key().sym().toString()] = entry.val()
  }
  return {
    id: entries.id?.u32()?.toString() ?? "",
    merchant: entries.merchant?.address()?.toString() ?? "",
    payer: entries.payer?.address()?.toString() ?? "",
    amount_usdc: entries.amount_usdc?.i128()?.toString() ?? "0",
    gross_usdc: entries.gross_usdc?.i128()?.toString() ?? "0",
    expires_at: u64ToNumber(entries.expires_at?.u64()),
    status: (entries.status?.vec()?.[0]?.sym()?.toString() ?? "Pending") as InvoiceStatus,
    paid_at: entries.paid_at?.u64() ? u64ToNumber(entries.paid_at.u64()) : null,
    metadata_hash: entries.metadata_hash?.bytes()?.toString() ?? null,
    payment_link_hash: entries.payment_link_hash?.bytes()?.toString() ?? null,
  }
}

export async function fetchInvoice(contractId: string, invoiceId: number): Promise<Invoice> {
  const server = getServer()
  const contract = new Contract(contractId)
  const result = await server.simulateTransaction(
    new TransactionBuilder(await server.getAccount(contractId), {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(contract.call("get_invoice", nativeToScVal(invoiceId, { type: "u32" })))
      .setTimeout(30)
      .build()
  )
  if (SorobanRpc.isSimulationError(result) || !result.result?.retval) {
    throw new Error("Invoice not found")
  }
  return scValToInvoice(result.result.retval)
}

async function buildAndSend(server: Server, tx: Transaction, freighter: FreighterApi): Promise<string> {
  const sim = await server.simulateTransaction(tx)
  const prepared = assembleTransaction(tx, getNetworkPassphrase(), sim).build()
  const signedXdr = await freighter.signTransaction(prepared.toXDR(), { networkPassphrase: getNetworkPassphrase() })
  const res = await server.sendTransaction(TransactionBuilder.fromXDR(signedXdr, getNetworkPassphrase()) as Transaction)
  return res.hash
}

export async function payInvoice(contractId: string, invoiceId: number, publicKey: string): Promise<PaymentResult> {
  const server = getServer()
  const freighter = (window as WindowWithFreighter).freighterApi
  if (!freighter) return { success: false, error: "Freighter wallet not detected" }
  try {
    const tx = new TransactionBuilder(await server.getAccount(publicKey), {
      fee: BASE_FEE, networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(new Contract(contractId).call("mark_paid", nativeToScVal(invoiceId, { type: "u32" })))
      .setTimeout(30).build() as Transaction
    return { success: true, transaction_hash: await buildAndSend(server, tx, freighter) }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Payment failed" }
  }
}

export async function cancelInvoice(contractId: string, invoiceId: number, publicKey: string): Promise<PaymentResult> {
  const server = getServer()
  const freighter = (window as WindowWithFreighter).freighterApi
  if (!freighter) return { success: false, error: "Freighter wallet not detected" }
  try {
    const tx = new TransactionBuilder(await server.getAccount(publicKey), {
      fee: BASE_FEE, networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(
        new Contract(contractId).call(
          "cancel_invoice",
          nativeToScVal(publicKey, { type: "address" }),
          nativeToScVal(invoiceId, { type: "u64" })
        )
      )
      .setTimeout(30).build() as Transaction
    return { success: true, transaction_hash: await buildAndSend(server, tx, freighter) }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Cancel failed" }
  }
}

export async function requestRefund(contractId: string, invoiceId: number, publicKey: string): Promise<PaymentResult> {
  const server = getServer()
  const freighter = (window as WindowWithFreighter).freighterApi
  if (!freighter) return { success: false, error: "Freighter wallet not detected" }
  try {
    const tx = new TransactionBuilder(await server.getAccount(publicKey), {
      fee: BASE_FEE, networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(new Contract(contractId).call("request_refund", nativeToScVal(invoiceId, { type: "u32" })))
      .setTimeout(30).build() as Transaction
    return { success: true, transaction_hash: await buildAndSend(server, tx, freighter) }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Refund request failed" }
  }
}

export async function batchExpireInvoices(
  contractId: string,
  invoiceIds: number[],
  publicKey: string
): Promise<PaymentResult> {
  const server = getServer()
  const contract = new Contract(contractId)

  const args = [
    xdr.ScVal.scvVec(invoiceIds.map((id) => nativeToScVal(id, { type: "u64" }))),
  ]

  try {
    const account = await server.getAccount(publicKey)
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(contract.call("batch_expire", ...args))
      .setTimeout(30)
      .build()

    const simulated = await server.simulateTransaction(tx)
    const sorobanRpc = (window as WindowWithFreighter).SorobanRpc
    if (!sorobanRpc) throw new Error("SorobanRpc not available on window")
    const freighter = (window as WindowWithFreighter).freighterApi
    if (!freighter) throw new Error("Freighter wallet not detected")

    const prepare = sorobanRpc.assembleTransaction(tx, simulated)
    const signed = await freighter.signTransaction(
      prepare.build().toXDR(),
      { networkPassphrase: getNetworkPassphrase() }
    )

    const txHash = await server.sendTransaction(
      TransactionBuilder.fromXDR(signed, getNetworkPassphrase()) as Transaction
    )
    return { success: true, transaction_hash: txHash.hash }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err) || "Batch expire failed",
    }
  }
}

export async function releaseEscrow(
  contractId: string,
  invoiceId: number,
  publicKey: string
): Promise<PaymentResult> {
  const server = getServer()
  const contract = new Contract(contractId)

  const args = [
    nativeToScVal(invoiceId, { type: "u64" }),
    nativeToScVal(publicKey, { type: "address" }),
  ]

  try {
    const account = await server.getAccount(publicKey)
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(contract.call("release_escrow", ...args))
      .setTimeout(30)
      .build()

    const simulated = await server.simulateTransaction(tx)
    const sorobanRpc = (window as WindowWithFreighter).SorobanRpc
    if (!sorobanRpc) throw new Error("SorobanRpc not available on window")
    const freighter = (window as WindowWithFreighter).freighterApi
    if (!freighter) throw new Error("Freighter wallet not detected")

    const prepare = sorobanRpc.assembleTransaction(tx, simulated)
    const signed = await freighter.signTransaction(
      prepare.build().toXDR(),
      { networkPassphrase: getNetworkPassphrase() }
    )

    const txHash = await server.sendTransaction(
      TransactionBuilder.fromXDR(signed, getNetworkPassphrase()) as Transaction
    )
    return { success: true, transaction_hash: txHash.hash }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err) || "Release escrow failed",
    }
  }
}
