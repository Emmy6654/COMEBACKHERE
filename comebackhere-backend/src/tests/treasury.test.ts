import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import request from "supertest"
import { createApp } from "../app.js"
import { executeSettlementWithBalanceCheck } from "../routes/treasury.js"
import { setGraceWindow } from "../routes/invoice-settings.js"
import type { SorobanClient } from "../lib/soroban.js"
import { SorobanRpc, SorobanDataBuilder, xdr } from "stellar-sdk"
import * as mongoModule from "../db/mongo.js"

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

// ── #205: Additional execute-settlement test cases ────────────────────────────

describe("executeSettlementWithBalanceCheck — #205 additional cases", () => {
  const env = {
    rpcUrl: ENV.SOROBAN_RPC_URL,
    treasuryContractId: TREASURY_CONTRACT,
    usdcContractId: USDC_CONTRACT,
    signerSecret: SIGNER_SECRET,
    networkPassphrase: NETWORK,
  }

  const mockClient = makeMockClient()

  it("rejects with 409 when settlement is already executed (status: Executed)", async () => {
    const submitContractCall = vi.fn()

    await expect(
      executeSettlementWithBalanceCheck(
        { settlement_id: 10 },
        env,
        mockClient,
        {
          getOnChainSettlement: vi.fn().mockResolvedValue({
            token: USDC_CONTRACT,
            amount: 1_000_000n,
            merchant: MERCHANT,
            status: "Executed",
            approval_weight: 2n,
          }),
          getTokenBalance: vi.fn(),
          submitContractCall,
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/not pending/i),
    })

    // Balance check and submission must not run when status is already Executed
    expect(submitContractCall).not.toHaveBeenCalled()
  })

  it("rejects with 409 when settlement is on hold (status: OnHold)", async () => {
    const submitContractCall = vi.fn()

    await expect(
      executeSettlementWithBalanceCheck(
        { settlement_id: 11 },
        env,
        mockClient,
        {
          getOnChainSettlement: vi.fn().mockResolvedValue({
            token: USDC_CONTRACT,
            amount: 2_000_000n,
            merchant: MERCHANT,
            status: "OnHold",
            approval_weight: 1n,
          }),
          getTokenBalance: vi.fn(),
          submitContractCall,
        },
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/not pending/i),
    })

    expect(submitContractCall).not.toHaveBeenCalled()
  })

  it("rejects with 422 when on-chain contract rejects due to threshold not met", async () => {
    // The approval_weight is below whatever the contract's threshold requires.
    // The Soroban contract itself throws when execute_settlement is called —
    // which comes back as a submitContractCall rejection (status 422).
    await expect(
      executeSettlementWithBalanceCheck(
        { settlement_id: 12 },
        env,
        mockClient,
        {
          getOnChainSettlement: vi.fn().mockResolvedValue({
            token: USDC_CONTRACT,
            amount: 500_000n,
            merchant: MERCHANT,
            // Settlement is Pending but approval weight is 0 — threshold not reached
            status: "Pending",
            approval_weight: 0n,
          }),
          getTokenBalance: vi.fn().mockResolvedValue(10_000_000n),
          submitContractCall: vi.fn().mockRejectedValue(
            Object.assign(
              new Error("Soroban simulation failed: Error(Contract, #4) THRESHOLD_NOT_MET"),
              { status: 422 },
            ),
          ),
        },
      ),
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/THRESHOLD_NOT_MET/),
    })
  })

  it("uses token_contract override when provided", async () => {
    const customToken = "CCUSTOM_TOKEN_CONTRACT_ADDRESS_XXXXXXXXXXXXXXXXXXXXXXXXXX"
    const submitContractCall = vi.fn().mockResolvedValue("custom-token-hash")
    const getTokenBalance = vi.fn().mockResolvedValue(99_000_000n)

    const result = await executeSettlementWithBalanceCheck(
      { settlement_id: 13, token_contract: customToken },
      env,
      mockClient,
      {
        getOnChainSettlement: vi.fn().mockResolvedValue({
          token: customToken,
          amount: 1_000n,
          merchant: MERCHANT,
          status: "Pending",
          approval_weight: 3n,
        }),
        getTokenBalance,
        submitContractCall,
      },
    )

    expect(result.tx_hash).toBe("custom-token-hash")
    // Confirm balance was checked against the custom token contract
    expect(getTokenBalance).toHaveBeenCalledWith(
      mockClient,
      customToken,
      expect.any(String),
      expect.any(String),
      NETWORK,
    )
  })
})

// ── #205: HTTP layer — additional coverage ────────────────────────────────────

describe("POST /api/treasury/execute-settlement — HTTP layer additional cases", () => {
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
    vi.restoreAllMocks()
  })

  it("400 when settlement_id is a float", async () => {
    const res = await request(app)
      .post("/api/treasury/execute-settlement")
      .send({ settlement_id: 1.5 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/settlement_id/)
  })

  it("400 when settlement_id is zero", async () => {
    const res = await request(app)
      .post("/api/treasury/execute-settlement")
      .send({ settlement_id: 0 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/settlement_id/)
  })
})

// ── #206: on-hold-settlements, release-hold, escalate-hold ───────────────────

describe("GET /api/treasury/on-hold-settlements", () => {
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
    vi.restoreAllMocks()
  })

  it("returns an array of on-hold settlements", async () => {
    const mockSettlements = [
      {
        id: 100,
        merchant_address: MERCHANT,
        amount: "5000000",
        approvals: [],
        approval_weight: 0,
        status: "OnHold",
        hold_reason: "ManualReview",
      },
    ]

    const mockCollection = {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue(mockSettlements),
        }),
      }),
    }

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getSettlementsCollection").mockReturnValue(mockCollection as any)

    const res = await request(app).get("/api/treasury/on-hold-settlements")
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({
      id: 100,
      status: "OnHold",
      hold_reason: "ManualReview",
    })
  })

  it("returns empty array when no settlements are on hold", async () => {
    const mockCollection = {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
    }

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getSettlementsCollection").mockReturnValue(mockCollection as any)

    const res = await request(app).get("/api/treasury/on-hold-settlements")
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it("returns 500 on database error", async () => {
    vi.spyOn(mongoModule, "connectMongo").mockRejectedValue(new Error("mongo down"))

    const res = await request(app).get("/api/treasury/on-hold-settlements")
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/mongo down/)
  })
})

describe("POST /api/treasury/release-hold", () => {
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
    vi.restoreAllMocks()
  })

  it("400 when settlement_id is missing", async () => {
    const res = await request(app).post("/api/treasury/release-hold").send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/settlement_id/)
  })

  it("400 when settlement_id is zero", async () => {
    const res = await request(app)
      .post("/api/treasury/release-hold")
      .send({ settlement_id: 0 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/settlement_id/)
  })

  it("404 when settlement is not found or not on hold", async () => {
    const mockCollection = {
      findOneAndUpdate: vi.fn().mockResolvedValue(null),
    }

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getSettlementsCollection").mockReturnValue(mockCollection as any)

    const res = await request(app)
      .post("/api/treasury/release-hold")
      .send({ settlement_id: 999 })
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found or not on hold/i)
  })

  it("200 and returns updated record when successfully released", async () => {
    const updatedRecord = {
      id: 50,
      merchant_address: MERCHANT,
      amount: "3000000",
      approvals: [],
      approval_weight: 0,
      status: "Pending",
      hold_reason: null,
    }

    const mockCollection = {
      findOneAndUpdate: vi.fn().mockResolvedValue(updatedRecord),
    }

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getSettlementsCollection").mockReturnValue(mockCollection as any)

    const res = await request(app)
      .post("/api/treasury/release-hold")
      .send({ settlement_id: 50 })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: 50,
      status: "Pending",
      hold_reason: null,
    })
  })

  it("transitions hold -> Pending (verifies filter targets OnHold status)", async () => {
    const mockCollection = {
      findOneAndUpdate: vi.fn().mockResolvedValue({
        id: 55,
        merchant_address: MERCHANT,
        amount: "1000000",
        approvals: [],
        approval_weight: 0,
        status: "Pending",
        hold_reason: null,
      }),
    }

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getSettlementsCollection").mockReturnValue(mockCollection as any)

    await request(app).post("/api/treasury/release-hold").send({ settlement_id: 55 })

    // Confirm the update filtered by OnHold status
    expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 55, status: "OnHold" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "Pending" }) }),
      expect.any(Object),
    )
  })

  it("500 on database error", async () => {
    vi.spyOn(mongoModule, "connectMongo").mockRejectedValue(new Error("db failure"))

    const res = await request(app)
      .post("/api/treasury/release-hold")
      .send({ settlement_id: 1 })
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/db failure/)
  })
})

describe("POST /api/treasury/escalate-hold", () => {
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
    vi.restoreAllMocks()
  })

  it("400 when settlement_id is missing", async () => {
    const res = await request(app).post("/api/treasury/escalate-hold").send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/settlement_id/)
  })

  it("400 when settlement_id is not a positive integer", async () => {
    const res = await request(app)
      .post("/api/treasury/escalate-hold")
      .send({ settlement_id: -1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/settlement_id/)
  })

  it("404 when settlement is not found or not on hold", async () => {
    const mockCollection = {
      findOneAndUpdate: vi.fn().mockResolvedValue(null),
    }

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getSettlementsCollection").mockReturnValue(mockCollection as any)

    const res = await request(app)
      .post("/api/treasury/escalate-hold")
      .send({ settlement_id: 999 })
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found or not on hold/i)
  })

  it("200 and returns escalated record with hold_reason: AdminHold", async () => {
    const escalatedRecord = {
      id: 60,
      merchant_address: MERCHANT,
      amount: "2500000",
      approvals: [],
      approval_weight: 0,
      status: "OnHold",
      hold_reason: "AdminHold",
    }

    const mockCollection = {
      findOneAndUpdate: vi.fn().mockResolvedValue(escalatedRecord),
    }

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getSettlementsCollection").mockReturnValue(mockCollection as any)

    const res = await request(app)
      .post("/api/treasury/escalate-hold")
      .send({ settlement_id: 60 })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      id: 60,
      status: "OnHold",
      hold_reason: "AdminHold",
    })
  })

  it("hold -> AdminHold transition (verifies escalate sets AdminHold reason)", async () => {
    const mockCollection = {
      findOneAndUpdate: vi.fn().mockResolvedValue({
        id: 65,
        merchant_address: MERCHANT,
        amount: "1000000",
        approvals: [],
        approval_weight: 0,
        status: "OnHold",
        hold_reason: "AdminHold",
      }),
    }

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getSettlementsCollection").mockReturnValue(mockCollection as any)

    await request(app).post("/api/treasury/escalate-hold").send({ settlement_id: 65 })

    expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
      { id: 65, status: "OnHold" },
      expect.objectContaining({ $set: expect.objectContaining({ hold_reason: "AdminHold" }) }),
      expect.any(Object),
    )
  })

  it("attempting to escalate a Pending (non-OnHold) settlement returns 404", async () => {
    // findOneAndUpdate filter is { id, status: "OnHold" }, so Pending settlements return null
    const mockCollection = {
      findOneAndUpdate: vi.fn().mockResolvedValue(null),
    }

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getSettlementsCollection").mockReturnValue(mockCollection as any)

    const res = await request(app)
      .post("/api/treasury/escalate-hold")
      .send({ settlement_id: 70 })
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found or not on hold/i)
  })

  it("500 on database error", async () => {
    vi.spyOn(mongoModule, "connectMongo").mockRejectedValue(new Error("connection lost"))

    const res = await request(app)
      .post("/api/treasury/escalate-hold")
      .send({ settlement_id: 1 })
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/connection lost/)
  })
})