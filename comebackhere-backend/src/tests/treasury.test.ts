import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import request from "supertest"
import { createApp } from "../app.js"
import { executeSettlementWithBalanceCheck } from "../routes/treasury.js"
import { setGraceWindow } from "../routes/invoice-settings.js"
import type { SorobanClient } from "../lib/soroban.js"
import { SorobanRpc, SorobanDataBuilder, xdr } from "stellar-sdk"

const PARSED_SIM_SUCCESS = {
  _parsed: true,
  latestLedger: 1,
  events: [],
  minResourceFee: "0",
  transactionData: new SorobanDataBuilder(),
  result: { auth: [], retval: xdr.ScVal.scvVoid() },
}

const SIGNER_SECRET = "SD6O7ZRNX5ILY5WSQR5CEWBYXRPWZNZARH3TWWPCVEC3Q5HC6D63BEJQ"
const TREASURY_CONTRACT = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW"
const USDC_CONTRACT = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW"
const INVOICE_CONTRACT = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW"
const NETWORK = "Standalone Network ; February 2025"
const MERCHANT = "GDR7WUDWIKWVBCUBVYLOGT3TJF5FGNQU5U7TACDDA2ZIQUETGGUET5XT"

const ENV = {
  SOROBAN_RPC_URL: "http://localhost:8000",
  TREASURY_CONTRACT_ID: TREASURY_CONTRACT,
  USDC_CONTRACT_ID: USDC_CONTRACT,
  INVOICE_CONTRACT_ID: INVOICE_CONTRACT,
  SIGNER_SECRET_KEY: SIGNER_SECRET,
  NETWORK_PASSPHRASE: NETWORK,
}

function makeMockClient(overrides: Partial<SorobanClient> = {}): SorobanClient {
  return {
    getAccount: vi.fn(),
    simulateTransaction: vi.fn(),
    sendTransaction: vi.fn(),
    getTransaction: vi.fn(),
    getEvents: vi.fn(),
    getLatestLedger: vi.fn(),
    ...overrides,
  }
}

const fakeAccount = {
  accountId: () => MERCHANT,
  sequenceNumber: () => "100",
  incrementSequenceNumber: vi.fn(),
}

describe("POST /api/treasury/execute-settlement", () => {
  const app = createApp()
  let envBackup: Record<string, string | undefined>

  beforeEach(() => {
    envBackup = {}
    for (const key of Object.keys(ENV)) {
      envBackup[key] = process.env[key]
      process.env[key] = ENV[key as keyof typeof ENV]
    }
  })

  afterEach(() => {
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) delete process.env[key]
      else process.env[key] = val
    }
  })

  it("400 when settlement_id is missing", async () => {
    const res = await request(app).post("/api/treasury/execute-settlement").send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/settlement_id/)
  })

  it("503 when required env vars are missing", async () => {
    delete process.env.USDC_CONTRACT_ID
    const res = await request(app)
      .post("/api/treasury/execute-settlement")
      .send({ settlement_id: 1 })
    expect(res.status).toBe(503)
  })
})

describe("executeSettlementWithBalanceCheck", () => {
  const env = {
    rpcUrl: ENV.SOROBAN_RPC_URL,
    treasuryContractId: TREASURY_CONTRACT,
    usdcContractId: USDC_CONTRACT,
    signerSecret: SIGNER_SECRET,
    networkPassphrase: NETWORK,
  }

  const mockClient = makeMockClient()

  it("rejects when treasury balance is insufficient", async () => {
    const submitContractCall = vi.fn()

    await expect(
      executeSettlementWithBalanceCheck(
        { settlement_id: 1 },
        env,
        mockClient,
        {
          getOnChainSettlement: vi.fn().mockResolvedValue({
            token: USDC_CONTRACT,
            amount: 5_000_000n,
            merchant: MERCHANT,
            status: "Pending",
            approval_weight: 2n,
          }),
          getTokenBalance: vi.fn().mockResolvedValue(1_000_000n),
          submitContractCall,
        },
      ),
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/Insufficient treasury USDC balance/),
    })
    expect(submitContractCall).not.toHaveBeenCalled()
  })

  it("submits execute_settlement when balance is sufficient", async () => {
    const result = await executeSettlementWithBalanceCheck(
      { settlement_id: 42 },
      env,
      mockClient,
      {
        getOnChainSettlement: vi.fn().mockResolvedValue({
          token: USDC_CONTRACT,
          amount: 1_000_000n,
          merchant: MERCHANT,
          status: "Pending",
          approval_weight: 2n,
        }),
        getTokenBalance: vi.fn().mockResolvedValue(5_000_000n),
        submitContractCall: vi.fn().mockResolvedValue("exec-hash"),
      },
    )

    expect(result).toMatchObject({
      tx_hash: "exec-hash",
      settlement_id: 42,
      amount_required: "1000000",
      balance_checked: "5000000",
    })
  })
})

describe("invoice grace window routes", () => {
  const app = createApp()
  let envBackup: Record<string, string | undefined>

  beforeEach(() => {
    envBackup = {}
    for (const key of Object.keys(ENV)) {
      envBackup[key] = process.env[key]
      process.env[key] = ENV[key as keyof typeof ENV]
    }
  })

  afterEach(() => {
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) delete process.env[key]
      else process.env[key] = val
    }
  })

  it("POST /api/invoice/grace-window validates input", async () => {
    const res = await request(app)
      .post("/api/invoice/grace-window")
      .send({ grace_window_seconds: -1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/grace_window_seconds/)
  })
})

describe("setGraceWindow", () => {
  it("submits set_grace_window on success", async () => {
    const client = makeMockClient({
      getAccount: vi.fn().mockResolvedValue(fakeAccount),
      simulateTransaction: vi.fn().mockResolvedValue(PARSED_SIM_SUCCESS),
      sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "grace-hash" }),
      getTransaction: vi.fn().mockResolvedValue({
        status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
        latestLedger: 1,
        latestLedgerCloseTime: 0,
        oldestLedger: 1,
        oldestLedgerCloseTime: 0,
      }),
    })

    const result = await setGraceWindow(
      172800,
      {
        rpcUrl: ENV.SOROBAN_RPC_URL,
        invoiceContractId: INVOICE_CONTRACT,
        signerSecret: SIGNER_SECRET,
        networkPassphrase: NETWORK,
      },
      client,
    )

    expect(result).toEqual({ grace_window_seconds: 172800, tx_hash: "grace-hash" })
  })
})
