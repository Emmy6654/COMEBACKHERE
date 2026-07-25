import { Router, type Request, type Response } from "express"
import { Keypair, nativeToScVal, Address } from "stellar-sdk"
import {
  buildSorobanClient,
  getNetworkPassphrase,
  getOnChainSettlement,
  getTokenBalance,
  submitContractCall,
  type SorobanClient,
} from "../lib/soroban.js"
import { connectMongo, getSettlementsCollection } from "../db/mongo.js"

const router = Router()

function requireEnv(res: Response): {
  rpcUrl: string
  treasuryContractId: string
  usdcContractId: string
  signerSecret: string
  networkPassphrase: string
} | null {
  const rpcUrl = process.env.SOROBAN_RPC_URL
  const treasuryContractId = process.env.TREASURY_CONTRACT_ID
  const usdcContractId = process.env.USDC_CONTRACT_ID
  const signerSecret = process.env.SIGNER_SECRET_KEY
  const networkPassphrase = getNetworkPassphrase()

  if (!rpcUrl || !treasuryContractId || !usdcContractId || !signerSecret) {
    res.status(503).json({
      error: "Service misconfiguration: missing required environment variables",
    })
    return null
  }

  return { rpcUrl, treasuryContractId, usdcContractId, signerSecret, networkPassphrase }
}

/**
 * GET /api/treasury/pending-settlements
 * Returns pending settlements indexed from on-chain events.
 */
router.get("/pending-settlements", async (_req: Request, res: Response) => {
  try {
    const database = await connectMongo()
    const settlements = getSettlementsCollection(database)
    const records = await settlements
      .find({ status: "Pending" })
      .sort({ id: 1 })
      .toArray()

    res.json(
      records.map((s) => ({
        id: s.id,
        merchant_address: s.merchant_address,
        amount: s.amount,
        approvals: s.approvals,
        approval_weight: s.approval_weight,
        status: s.status,
        hold_reason: s.hold_reason,
      })),
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

/**
 * POST /api/treasury/approve-settlement
 * Body: { settlement_id: number }
 */
router.post("/approve-settlement", async (req: Request, res: Response) => {
  const env = requireEnv(res)
  if (!env) return

  const settlementId = req.body?.settlement_id
  if (typeof settlementId !== "number" || !Number.isInteger(settlementId) || settlementId <= 0) {
    res.status(400).json({ error: "settlement_id must be a positive integer" })
    return
  }

  try {
    const client = buildSorobanClient(env.rpcUrl)
    const keypair = Keypair.fromSecret(env.signerSecret)

    const txHash = await submitContractCall(
      client,
      env.treasuryContractId,
      "approve_settlement",
      [
        nativeToScVal(keypair.publicKey(), { type: "address" }),
        nativeToScVal(BigInt(settlementId), { type: "u64" }),
      ],
      env.signerSecret,
      env.networkPassphrase,
    )

    const database = await connectMongo()
    const settlements = getSettlementsCollection(database)
    const record = await settlements.findOne({ id: settlementId })

    res.json(
      record ?? {
        id: settlementId,
        merchant_address: "",
        amount: "0",
        approvals: [keypair.publicKey()],
        approval_weight: 1,
        status: "Pending",
        hold_reason: null,
        tx_hash: txHash,
      },
    )
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status ?? 500
    const message = err instanceof Error ? err.message : String(err)
    res.status(status).json({ error: message })
  }
})

export interface ExecuteSettlementBody {
  settlement_id: number
  token_contract?: string
}

export interface SettlementExecutionDeps {
  getOnChainSettlement: typeof getOnChainSettlement
  getTokenBalance: typeof getTokenBalance
  submitContractCall: typeof submitContractCall
}

const defaultSettlementDeps: SettlementExecutionDeps = {
  getOnChainSettlement,
  getTokenBalance,
  submitContractCall,
}

/**
 * POST /api/treasury/execute-settlement
 * Validates treasury USDC balance before submitting execute_settlement.
 * Body: { settlement_id: number, token_contract?: string }
 */
export async function executeSettlementWithBalanceCheck(
  body: ExecuteSettlementBody,
  env: {
    rpcUrl: string
    treasuryContractId: string
    usdcContractId: string
    signerSecret: string
    networkPassphrase: string
  },
  clientOverride?: SorobanClient,
  deps: SettlementExecutionDeps = defaultSettlementDeps,
): Promise<{ tx_hash: string; settlement_id: number; balance_checked: string; amount_required: string }> {
  const client = clientOverride ?? buildSorobanClient(env.rpcUrl)
  const keypair = Keypair.fromSecret(env.signerSecret)
  const sourceAccount = keypair.publicKey()
  const tokenContract = body.token_contract ?? env.usdcContractId

  const settlement = await deps.getOnChainSettlement(
    client,
    env.treasuryContractId,
    BigInt(body.settlement_id),
    sourceAccount,
    env.networkPassphrase,
  )

  if (settlement.status !== "Pending") {
    throw Object.assign(
      new Error(`Settlement #${body.settlement_id} is not pending (status: ${settlement.status})`),
      { status: 409 },
    )
  }

  const balance = await deps.getTokenBalance(
    client,
    tokenContract,
    env.treasuryContractId,
    sourceAccount,
    env.networkPassphrase,
  )

  console.log(
    `[execute-settlement] settlement_id=${body.settlement_id} ` +
      `required=${settlement.amount.toString()} available=${balance.toString()} ` +
      `token=${tokenContract}`,
  )

  if (balance < settlement.amount) {
    throw Object.assign(
      new Error(
        `Insufficient treasury USDC balance: available ${balance.toString()} stroops, ` +
          `required ${settlement.amount.toString()} stroops for settlement #${body.settlement_id}`,
      ),
      { status: 422 },
    )
  }

  const txHash = await deps.submitContractCall(
    client,
    env.treasuryContractId,
    "execute_settlement",
    [
      nativeToScVal(sourceAccount, { type: "address" }),
      nativeToScVal(BigInt(body.settlement_id), { type: "u64" }),
      nativeToScVal(Address.fromString(tokenContract), { type: "address" }),
    ],
    env.signerSecret,
    env.networkPassphrase,
  )

  return {
    tx_hash: txHash,
    settlement_id: body.settlement_id,
    balance_checked: balance.toString(),
    amount_required: settlement.amount.toString(),
  }
}

router.post("/execute-settlement", async (req: Request, res: Response) => {
  const env = requireEnv(res)
  if (!env) return

  const settlementId = req.body?.settlement_id
  if (typeof settlementId !== "number" || !Number.isInteger(settlementId) || settlementId <= 0) {
    res.status(400).json({ error: "settlement_id must be a positive integer" })
    return
  }

  try {
    const result = await executeSettlementWithBalanceCheck(
      { settlement_id: settlementId, token_contract: req.body?.token_contract },
      env,
    )
    res.json(result)
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status ?? 500
    const message = err instanceof Error ? err.message : String(err)
    res.status(status).json({ error: message })
  }
})

/**
 * GET /api/treasury/on-hold-settlements
 * Returns all settlements currently in OnHold status.
 */
router.get("/on-hold-settlements", async (_req: Request, res: Response) => {
  try {
    const database = await connectMongo()
    const settlements = getSettlementsCollection(database)
    const records = await settlements
      .find({ status: "OnHold" })
      .sort({ id: 1 })
      .toArray()

    res.json(
      records.map((s) => ({
        id: s.id,
        merchant_address: s.merchant_address,
        amount: s.amount,
        approvals: s.approvals,
        approval_weight: s.approval_weight,
        status: s.status,
        hold_reason: s.hold_reason,
      })),
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

/**
 * POST /api/treasury/release-hold
 * Body: { settlement_id: number }
 * Transitions a settlement from OnHold back to Pending.
 */
router.post("/release-hold", async (req: Request, res: Response) => {
  const settlementId = req.body?.settlement_id
  if (typeof settlementId !== "number" || !Number.isInteger(settlementId) || settlementId <= 0) {
    res.status(400).json({ error: "settlement_id must be a positive integer" })
    return
  }

  try {
    const database = await connectMongo()
    const settlements = getSettlementsCollection(database)
    const record = await settlements.findOneAndUpdate(
      { id: settlementId, status: "OnHold" },
      { $set: { status: "Pending", hold_reason: null, updated_at: new Date() } },
      { returnDocument: "after" },
    )

    if (!record) {
      res.status(404).json({ error: `Settlement #${settlementId} not found or not on hold` })
      return
    }

    res.json({
      id: record.id,
      merchant_address: record.merchant_address,
      amount: record.amount,
      approvals: record.approvals,
      approval_weight: record.approval_weight,
      status: record.status,
      hold_reason: record.hold_reason,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

/**
 * POST /api/treasury/escalate-hold
 * Body: { settlement_id: number }
 * Escalates a held settlement (transitions to AdminHold reason).
 */
router.post("/escalate-hold", async (req: Request, res: Response) => {
  const settlementId = req.body?.settlement_id
  if (typeof settlementId !== "number" || !Number.isInteger(settlementId) || settlementId <= 0) {
    res.status(400).json({ error: "settlement_id must be a positive integer" })
    return
  }

  try {
    const database = await connectMongo()
    const settlements = getSettlementsCollection(database)
    const record = await settlements.findOneAndUpdate(
      { id: settlementId, status: "OnHold" },
      { $set: { hold_reason: "AdminHold", updated_at: new Date() } },
      { returnDocument: "after" },
    )

    if (!record) {
      res.status(404).json({ error: `Settlement #${settlementId} not found or not on hold` })
      return
    }

    res.json({
      id: record.id,
      merchant_address: record.merchant_address,
      amount: record.amount,
      approvals: record.approvals,
      approval_weight: record.approval_weight,
      status: record.status,
      hold_reason: record.hold_reason,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/treasury/balances
 * Returns token balances held by the treasury contract.
 */
router.get("/balances", async (_req: Request, res: Response) => {
  const env = requireEnv(res)
  if (!env) return

  try {
    const client = buildSorobanClient(env.rpcUrl)
    const keypair = Keypair.fromSecret(env.signerSecret)
    const sourceAccount = keypair.publicKey()

    const balance = await getTokenBalance(
      client,
      env.usdcContractId,
      env.treasuryContractId,
      sourceAccount,
      env.networkPassphrase,
    )

    res.json([{ token: env.usdcContractId, balance: balance.toString() }])
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status ?? 500
    const message = err instanceof Error ? err.message : String(err)
    res.status(status).json({ error: message })
  }
})

export default router
