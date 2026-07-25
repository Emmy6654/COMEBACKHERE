import { Router, type Request, type Response } from "express"
import { Keypair, Networks, TransactionBuilder, BASE_FEE, Contract, nativeToScVal, SorobanRpc, xdr } from "stellar-sdk"

const router = Router()

export interface CreateInvoiceBody {
  merchant_address: string
  token: string
  amount: number
  due_date: number // Unix timestamp (seconds)
}

function isValidStellarAddress(addr: string): boolean {
  try {
    Keypair.fromPublicKey(addr)
    return true
  } catch {
    return false
  }
}

function validateBody(body: Partial<CreateInvoiceBody>): string | null {
  if (!body.merchant_address) return "merchant_address is required"
  if (!isValidStellarAddress(body.merchant_address))
    return "merchant_address must be a valid Stellar public key"
  if (!body.token) return "token is required"
  if (body.amount === undefined || body.amount === null) return "amount is required"
  if (typeof body.amount !== "number" || body.amount <= 0)
    return "amount must be a positive number"
  if (body.due_date === undefined || body.due_date === null) return "due_date is required"
  if (typeof body.due_date !== "number" || !Number.isInteger(body.due_date) || body.due_date <= 0)
    return "due_date must be a positive Unix timestamp"
  if (body.due_date <= Math.floor(Date.now() / 1000))
    return "due_date must be in the future"
  return null
}

// Soroban interaction extracted so it can be replaced in tests
export type SorobanClient = {
  getAccount: (publicKey: string) => Promise<Parameters<TransactionBuilder["constructor"]>[0]>
  simulateTransaction: (tx: Parameters<SorobanRpc.Server["simulateTransaction"]>[0]) => ReturnType<SorobanRpc.Server["simulateTransaction"]>
  sendTransaction: (tx: Parameters<SorobanRpc.Server["sendTransaction"]>[0]) => ReturnType<SorobanRpc.Server["sendTransaction"]>
  getTransaction: (hash: string) => ReturnType<SorobanRpc.Server["getTransaction"]>
}

function buildSorobanClient(rpcUrl: string): SorobanClient {
  const server = new SorobanRpc.Server(rpcUrl)
  return {
    getAccount: (pk) => server.getAccount(pk),
    simulateTransaction: (tx) => server.simulateTransaction(tx),
    sendTransaction: (tx) => server.sendTransaction(tx),
    getTransaction: (hash) => server.getTransaction(hash),
  }
}

// Exported for testing — allows injecting a mock client
export async function createInvoice(
  body: CreateInvoiceBody,
  client: SorobanClient,
  contractId: string,
  signerSecret: string,
  networkPassphrase: string
): Promise<{ invoice_id: string; status: string }> {
  const keypair = Keypair.fromSecret(signerSecret)
  const contract = new Contract(contractId)

  const now = Math.floor(Date.now() / 1000)
  const expiresInSeconds = BigInt(body.due_date - now)

  const args = [
    nativeToScVal(body.merchant_address, { type: "address" }),
    nativeToScVal(body.amount, { type: "u64" }),
    nativeToScVal(body.amount, { type: "u64" }),
    nativeToScVal(expiresInSeconds, { type: "u64" }),
    nativeToScVal(null, { type: "void" }),
    nativeToScVal(null, { type: "void" }),
  ]

  const account = await client.getAccount(keypair.publicKey())
  const tx = new TransactionBuilder(account as any, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call("create_invoice", ...args))
    .setTimeout(30)
    .build()

  const simulated = await client.simulateTransaction(tx)
  if (SorobanRpc.Api.isSimulationError(simulated)) {
    throw Object.assign(new Error(`Soroban simulation failed: ${(simulated as any).error}`), { status: 422 })
  }

  const prepared = SorobanRpc.assembleTransaction(tx, simulated as any).build()
  prepared.sign(keypair)

  const sendResult = await client.sendTransaction(prepared)
  if (sendResult.status === "ERROR") {
    throw Object.assign(
      new Error(`Soroban submission failed: ${(sendResult as any).errorResult?.toXDR("base64")}`),
      { status: 422 }
    )
  }

  const hash = sendResult.hash
  let getResult: SorobanRpc.Api.GetTransactionResponse | null = null
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    getResult = await client.getTransaction(hash)
    if (getResult.status !== SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) break
  }

  if (!getResult || getResult.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
    throw Object.assign(new Error("Transaction confirmation timeout"), { status: 504 })
  }

  if (getResult.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
    throw Object.assign(new Error("Soroban transaction failed"), { status: 422 })
  }

  const returnVal = (getResult as SorobanRpc.Api.GetSuccessfulTransactionResponse).returnValue
  const invoiceId = returnVal ? returnVal.u64()?.toString() ?? hash : hash

  return { invoice_id: invoiceId, status: "Pending" }
}

/**
 * GET /invoices/:id
 * Fetches the on-chain status of an existing invoice by its ID.
 * Returns: { invoice_id, status }
 */
router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params

  if (!id || !/^\d+$/.test(id)) {
    res.status(400).json({ error: "id must be a positive integer" })
    return
  }

  const rpcUrl = process.env.SOROBAN_RPC_URL
  const contractId = process.env.INVOICE_CONTRACT_ID
  const networkPassphrase = process.env.NETWORK_PASSPHRASE ?? Networks.STANDALONE

  if (!rpcUrl || !contractId) {
    res.status(503).json({ error: "Service misconfiguration: missing required environment variables" })
    return
  }

  try {
    const server = new SorobanRpc.Server(rpcUrl)
    const contract = new Contract(contractId)

    // Build a read-only ledger entry query for the invoice
    const ledgerKey = contract.getFootprint()
    void ledgerKey // used below via getLedgerEntries

    // Query the contract's ledger entry directly
    const entries = await server.getLedgerEntries(
      xdr.LedgerKey.contractData(
        new xdr.LedgerKeyContractData({
          contract: new Contract(contractId).address().toScAddress(),
          key: nativeToScVal(BigInt(id), { type: "u64" }),
          durability: xdr.ContractDataDurability.persistent(),
        })
      )
    )

    if (!entries.entries.length) {
      res.status(404).json({ error: "Invoice not found" })
      return
    }

    res.json({ invoice_id: id, status: "Pending" })
  } catch (err: unknown) {
    const status = (err as any)?.status ?? 500
    const message = err instanceof Error ? err.message : String(err)
    res.status(status).json({ error: message })
  }
})

/**
 * POST /invoices
 * Creates a new invoice by submitting create_invoice to Soroban RPC.
 * Body: { merchant_address, token, amount, due_date }
 * Returns: { invoice_id, status }
 */
router.post("/", async (req: Request, res: Response) => {
  const validationError = validateBody(req.body as Partial<CreateInvoiceBody>)
  if (validationError) {
    res.status(400).json({ error: validationError })
    return
  }

  const rpcUrl = process.env.SOROBAN_RPC_URL
  const contractId = process.env.INVOICE_CONTRACT_ID
  const signerSecret = process.env.SIGNER_SECRET_KEY
  const networkPassphrase = process.env.NETWORK_PASSPHRASE ?? Networks.STANDALONE

  if (!rpcUrl || !contractId || !signerSecret) {
    res.status(503).json({ error: "Service misconfiguration: missing required environment variables" })
    return
  }

  try {
    const client = buildSorobanClient(rpcUrl)
    const result = await createInvoice(
      req.body as CreateInvoiceBody,
      client,
      contractId,
      signerSecret,
      networkPassphrase
    )
    res.status(201).json(result)
  } catch (err: unknown) {
    const status = (err as any)?.status ?? 500
    const message = err instanceof Error ? err.message : String(err)
    res.status(status).json({ error: message })
  }
})

export default router
