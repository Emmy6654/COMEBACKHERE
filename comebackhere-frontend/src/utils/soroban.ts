import {
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  xdr,
  nativeToScVal,
} from "soroban-client"
import type { Invoice, InvoiceStatus, PaymentResult } from "../types"

const SOROBAN_RPC = import.meta.env.VITE_SOROBAN_RPC as string
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE as string

export function getNetworkPassphrase(): string {
  return NETWORK_PASSPHRASE || Networks.STANDALONE
}

function getServer() {
  const { SorobanRpc } = window as any
  return new SorobanRpc.Server(SOROBAN_RPC)
}

function scValToInvoice(scVal: xdr.ScVal): Invoice {
  const map = scVal.map()
  const entries: Record<string, xdr.ScVal> = {}
  for (const entry of map) {
    const key = entry.key().sym().toString()
    entries[key] = entry.val()
  }

  return {
    id: entries.id?.u32()?.toString() ?? "",
    merchant: entries.merchant?.address()?.toString() ?? "",
    payer: entries.payer?.address()?.toString() ?? "",
    amount_usdc: entries.amount_usdc?.i128()?.toString() ?? "0",
    gross_usdc: entries.gross_usdc?.i128()?.toString() ?? "0",
    expires_at: entries.expires_at?.u64()?.toNumber() ?? 0,
    status: scValToInvoiceStatus(entries.status),
    paid_at: entries.paid_at?.u64()?.toNumber() ?? null,
    metadata_hash: entries.metadata_hash?.bytes()?.toString() ?? null,
    payment_link_hash: entries.payment_link_hash?.bytes()?.toString() ?? null,
  }
}

function scValToInvoiceStatus(scVal: xdr.ScVal): InvoiceStatus {
  const variant = scVal.vec()?.[0]?.sym()?.toString() ?? "Pending"
  return variant as InvoiceStatus
}

export async function fetchInvoice(
  contractId: string,
  invoiceId: number
): Promise<Invoice> {
  const server = getServer()
  const contract = new Contract(contractId)

  const args = [nativeToScVal(invoiceId, { type: "u32" })]
  const result = await server.simulateTransaction(
    new TransactionBuilder(await server.getAccount(contractId), {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(contract.call("get_invoice", ...args))
      .setTimeout(30)
      .build()
  )

  if (!result.result || !result.result.retval) {
    throw new Error("Invoice not found")
  }

  return scValToInvoice(result.result.retval)
}

export async function payInvoice(
  contractId: string,
  invoiceId: number,
  publicKey: string
): Promise<PaymentResult> {
  const server = getServer()
  const contract = new Contract(contractId)

  const args = [nativeToScVal(invoiceId, { type: "u32" })]

  try {
    const account = await server.getAccount(publicKey)
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(contract.call("mark_paid", ...args))
      .setTimeout(30)
      .build()

    const simulated = await server.simulateTransaction(tx)
    const { SorobanRpc } = window as any

    const prepare = SorobanRpc.assembleTransaction(tx, simulated)
    const signed = await (window as any).freighterApi.signTransaction(
      prepare.toXDR(),
      { networkPassphrase: getNetworkPassphrase() }
    )

    const txHash = await server.sendTransaction(signed)
    return { success: true, transaction_hash: txHash.hash }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? err?.toString() ?? "Payment failed",
    }
  }
}

export async function requestRefund(
  contractId: string,
  invoiceId: number,
  publicKey: string
): Promise<PaymentResult> {
  const server = getServer()
  const contract = new Contract(contractId)

  const args = [nativeToScVal(invoiceId, { type: "u32" })]

  try {
    const account = await server.getAccount(publicKey)
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: getNetworkPassphrase(),
    })
      .addOperation(contract.call("request_refund", ...args))
      .setTimeout(30)
      .build()

    const simulated = await server.simulateTransaction(tx)
    const { SorobanRpc } = window as any

    const prepare = SorobanRpc.assembleTransaction(tx, simulated)
    const signed = await (window as any).freighterApi.signTransaction(
      prepare.toXDR(),
      { networkPassphrase: getNetworkPassphrase() }
    )

    const txHash = await server.sendTransaction(signed)
    return { success: true, transaction_hash: txHash.hash }
  } catch (err: any) {
    return {
      success: false,
      error: err?.message ?? err?.toString() ?? "Refund request failed",
    }
  }
}
