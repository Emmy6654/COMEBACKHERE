import {
  Keypair,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  Contract,
  nativeToScVal,
  Address,
  SorobanRpc,
  xdr,
} from "stellar-sdk"

export type SorobanClient = {
  getAccount: (publicKey: string) => Promise<Parameters<TransactionBuilder["constructor"]>[0]>
  simulateTransaction: (
    tx: Parameters<SorobanRpc.Server["simulateTransaction"]>[0],
  ) => ReturnType<SorobanRpc.Server["simulateTransaction"]>
  sendTransaction: (
    tx: Parameters<SorobanRpc.Server["sendTransaction"]>[0],
  ) => ReturnType<SorobanRpc.Server["sendTransaction"]>
  getTransaction: (hash: string) => ReturnType<SorobanRpc.Server["getTransaction"]>
  getEvents: (
    params: Parameters<SorobanRpc.Server["getEvents"]>[0],
  ) => ReturnType<SorobanRpc.Server["getEvents"]>
  getLatestLedger: () => ReturnType<SorobanRpc.Server["getLatestLedger"]>
}

export function buildSorobanClient(rpcUrl: string): SorobanClient {
  const server = new SorobanRpc.Server(rpcUrl)
  return {
    getAccount: (pk) => server.getAccount(pk),
    simulateTransaction: (tx) => server.simulateTransaction(tx),
    sendTransaction: (tx) => server.sendTransaction(tx),
    getTransaction: (hash) => server.getTransaction(hash),
    getEvents: (params) => server.getEvents(params),
    getLatestLedger: () => server.getLatestLedger(),
  }
}

export function getNetworkPassphrase(): string {
  return process.env.NETWORK_PASSPHRASE ?? Networks.STANDALONE
}

export async function simulateContractRead(
  client: SorobanClient,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  sourceAccount: string,
  networkPassphrase: string,
): Promise<xdr.ScVal> {
  const contract = new Contract(contractId)
  const account = await client.getAccount(sourceAccount)
  const tx = new TransactionBuilder(account as any, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build()

  const simulated = await client.simulateTransaction(tx)
  if (SorobanRpc.Api.isSimulationError(simulated)) {
    throw Object.assign(
      new Error(`Soroban simulation failed: ${(simulated as { error?: string }).error}`),
      { status: 422 },
    )
  }

  const retval = (simulated as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval
  if (!retval) {
    throw Object.assign(new Error(`No return value from ${method}`), { status: 422 })
  }
  return retval
}

export async function getTokenBalance(
  client: SorobanClient,
  tokenContractId: string,
  holderAddress: string,
  sourceAccount: string,
  networkPassphrase: string,
): Promise<bigint> {
  const retval = await simulateContractRead(
    client,
    tokenContractId,
    "balance",
    [nativeToScVal(Address.fromString(holderAddress), { type: "address" })],
    sourceAccount,
    networkPassphrase,
  )
  const balance = retval.i128()
  if (!balance) {
    throw Object.assign(new Error("Invalid balance response from token contract"), { status: 422 })
  }
  return BigInt(balance.toString())
}

export interface OnChainSettlement {
  token: string
  amount: bigint
  merchant: string
  status: string
  approval_weight: bigint
}

function scValToSettlementStatus(scVal: xdr.ScVal): string {
  const variant = scVal.vec()?.[0]?.sym()?.toString() ?? "Pending"
  return variant
}

export async function getOnChainSettlement(
  client: SorobanClient,
  treasuryContractId: string,
  settlementId: bigint,
  sourceAccount: string,
  networkPassphrase: string,
): Promise<OnChainSettlement> {
  const retval = await simulateContractRead(
    client,
    treasuryContractId,
    "get_settlement",
    [nativeToScVal(settlementId, { type: "u64" })],
    sourceAccount,
    networkPassphrase,
  )

  const map = retval.map()
  if (!map) {
    throw Object.assign(new Error("Invalid settlement response"), { status: 422 })
  }

  const entries: Record<string, xdr.ScVal> = {}
  for (const entry of map) {
    const key = entry.key().sym().toString()
    entries[key] = entry.val()
  }

  return {
    token: entries.token?.address()?.toString() ?? "",
    amount: BigInt(entries.amount?.u64()?.toString() ?? "0"),
    merchant: entries.merchant?.address()?.toString() ?? "",
    status: scValToSettlementStatus(entries.status ?? xdr.ScVal.scvVoid()),
    approval_weight: BigInt(entries.approval_weight?.u64()?.toString() ?? "0"),
  }
}

export async function submitContractCall(
  client: SorobanClient,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  signerSecret: string,
  networkPassphrase: string,
): Promise<string> {
  const keypair = Keypair.fromSecret(signerSecret)
  const contract = new Contract(contractId)
  const account = await client.getAccount(keypair.publicKey())
  const tx = new TransactionBuilder(account as any, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build()

  const simulated = await client.simulateTransaction(tx)
  if (SorobanRpc.Api.isSimulationError(simulated)) {
    throw Object.assign(
      new Error(`Soroban simulation failed: ${(simulated as { error?: string }).error}`),
      { status: 422 },
    )
  }

  const prepared = SorobanRpc.assembleTransaction(tx, simulated as any).build()
  prepared.sign(keypair)

  const sendResult = await client.sendTransaction(prepared)
  if (sendResult.status === "ERROR") {
    throw Object.assign(
      new Error(
        `Soroban submission failed: ${(sendResult as { errorResult?: { toXDR: (f: string) => string } }).errorResult?.toXDR("base64")}`,
      ),
      { status: 422 },
    )
  }

  const hash = sendResult.hash
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    const getResult = await client.getTransaction(hash)
    if (getResult.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
      if (getResult.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw Object.assign(new Error("Soroban transaction failed"), { status: 422 })
      }
      if (getResult.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        return hash
      }
    }
  }

  throw Object.assign(new Error("Transaction confirmation timeout"), { status: 504 })
}
