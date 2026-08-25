import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import request from "supertest"
import { createApp } from "../app.js"
import { createInvoice, type SorobanClient } from "../routes/invoices.js"
import { SorobanRpc, SorobanDataBuilder, xdr } from "stellar-sdk"
import * as mongoModule from "../db/mongo.js"

// Pre-parsed success simulation result accepted by assembleTransaction without XDR parsing
const PARSED_SIM_SUCCESS = {
  _parsed: true,
  latestLedger: 1,
  events: [],
  minResourceFee: "0",
  transactionData: new SorobanDataBuilder(),
  result: { auth: [], retval: xdr.ScVal.scvVoid() },
}

// Real valid Stellar keys (randomly generated for tests)
const MERCHANT_ADDRESS = "GDR7WUDWIKWVBCUBVYLOGT3TJF5FGNQU5U7TACDDA2ZIQUETGGUET5XT"
const SIGNER_SECRET    = "SD6O7ZRNX5ILY5WSQR5CEWBYXRPWZNZARH3TWWPCVEC3Q5HC6D63BEJQ"
const CONTRACT_ID      = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW"
const NETWORK          = "Standalone Network ; February 2025"
const FUTURE_DATE      = Math.floor(Date.now() / 1000) + 86_400

const VALID_BODY = {
  merchant_address: MERCHANT_ADDRESS,
  token: "USDC",
  amount: 1_000_000,
  due_date: FUTURE_DATE,
}

const ENV = {
  SOROBAN_RPC_URL: "http://localhost:8000",
  INVOICE_CONTRACT_ID: CONTRACT_ID,
  SIGNER_SECRET_KEY: SIGNER_SECRET,
  NETWORK_PASSPHRASE: NETWORK,
}

// ── Minimal mock Soroban client ───────────────────────────────────────────────
function makeMockClient(overrides: Partial<SorobanClient> = {}): SorobanClient {
  return {
    getAccount: vi.fn(),
    simulateTransaction: vi.fn(),
    sendTransaction: vi.fn(),
    getTransaction: vi.fn(),
    ...overrides,
  }
}

// Fake account stub accepted by TransactionBuilder
const fakeAccount = {
  accountId: () => MERCHANT_ADDRESS,
  sequenceNumber: () => "100",
  incrementSequenceNumber: vi.fn(),
}

// ── HTTP layer tests ──────────────────────────────────────────────────────────
describe("POST /invoices — HTTP layer", () => {
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

  describe("validation", () => {
    it("400 when merchant_address is missing", async () => {
      const { merchant_address: _, ...body } = VALID_BODY
      const res = await request(app).post("/invoices").send(body)
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/merchant_address/)
    })

    it("400 when merchant_address is not a valid Stellar key", async () => {
      const res = await request(app).post("/invoices").send({ ...VALID_BODY, merchant_address: "NOTAKEY" })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/merchant_address/)
    })

    it("400 when token is missing", async () => {
      const { token: _, ...body } = VALID_BODY
      const res = await request(app).post("/invoices").send(body)
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/token/)
    })

    it("400 when amount is missing", async () => {
      const { amount: _, ...body } = VALID_BODY
      const res = await request(app).post("/invoices").send(body)
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/amount/)
    })

    it("400 when amount is zero or negative", async () => {
      const res = await request(app).post("/invoices").send({ ...VALID_BODY, amount: -1 })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/amount/)
    })

    it("400 when due_date is missing", async () => {
      const { due_date: _, ...body } = VALID_BODY
      const res = await request(app).post("/invoices").send(body)
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/due_date/)
    })

    it("400 when due_date is in the past", async () => {
      const res = await request(app).post("/invoices").send({ ...VALID_BODY, due_date: 1000 })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/due_date/)
    })
  })

  it("503 when required env vars are missing", async () => {
    delete process.env.SOROBAN_RPC_URL
    const res = await request(app).post("/invoices").send(VALID_BODY)
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/misconfiguration/)
  })
})

// ── Soroban integration (via injectable client) ───────────────────────────────
describe("createInvoice — Soroban interaction", () => {
  it("returns invoice_id and Pending status on success", async () => {
    const client = makeMockClient({
      getAccount: vi.fn().mockResolvedValue(fakeAccount),
      simulateTransaction: vi.fn().mockResolvedValue(PARSED_SIM_SUCCESS),
      sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "txhash42" }),
      getTransaction: vi.fn().mockResolvedValue({
        status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
        returnValue: { u64: () => BigInt(42) },
        latestLedger: 1,
        latestLedgerCloseTime: 0,
        oldestLedger: 1,
        oldestLedgerCloseTime: 0,
        ledger: 1,
        createdAt: 0,
        applicationOrder: 1,
        envelopeXdr: {},
        resultXdr: {},
        resultMetaXdr: {},
      }),
    })

    const result = await createInvoice(VALID_BODY, client, CONTRACT_ID, SIGNER_SECRET, NETWORK)
    expect(result).toMatchObject({ invoice_id: "42", status: "Pending" })
  })

  it("throws 422 when simulation reports an error", async () => {
    const client = makeMockClient({
      getAccount: vi.fn().mockResolvedValue(fakeAccount),
      simulateTransaction: vi.fn().mockResolvedValue({
        error: "HostError: contract panic",
        latestLedger: 1,
      }),
    })

    await expect(createInvoice(VALID_BODY, client, CONTRACT_ID, SIGNER_SECRET, NETWORK))
      .rejects.toMatchObject({ message: expect.stringMatching(/simulation failed/), status: 422 })
  })

  it("throws 422 when sendTransaction returns ERROR", async () => {
    const client = makeMockClient({
      getAccount: vi.fn().mockResolvedValue(fakeAccount),
      simulateTransaction: vi.fn().mockResolvedValue(PARSED_SIM_SUCCESS),
      sendTransaction: vi.fn().mockResolvedValue({
        status: "ERROR",
        hash: "txhash",
        errorResult: { toXDR: () => "err-xdr" },
      }),
    })

    await expect(createInvoice(VALID_BODY, client, CONTRACT_ID, SIGNER_SECRET, NETWORK))
      .rejects.toMatchObject({ message: expect.stringMatching(/submission failed/), status: 422 })
  })

  it("throws 504 when confirmation times out", async () => {
    const client = makeMockClient({
      getAccount: vi.fn().mockResolvedValue(fakeAccount),
      simulateTransaction: vi.fn().mockResolvedValue(PARSED_SIM_SUCCESS),
      sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "txhash" }),
      getTransaction: vi.fn().mockResolvedValue({
        status: SorobanRpc.Api.GetTransactionStatus.NOT_FOUND,
        latestLedger: 1,
        latestLedgerCloseTime: 0,
        oldestLedger: 1,
        oldestLedgerCloseTime: 0,
      }),
    })

    await expect(createInvoice(VALID_BODY, client, CONTRACT_ID, SIGNER_SECRET, NETWORK))
      .rejects.toMatchObject({ message: expect.stringMatching(/timeout/), status: 504 })
  }, 15_000)
})

// ── #207: GET /invoices pagination ────────────────────────────────────────────

describe("GET /invoices — pagination", () => {
  const app = createApp()
  let envBackup: Record<string, string | undefined>

  const makeInvoice = (n: number) => ({
    invoice_id: `inv-${n}`,
    merchant_address: MERCHANT_ADDRESS,
    payer_address: null,
    token: "USDC",
    amount: "1000000",
    status: "Pending",
    created_at: 1_700_000_000 - n * 1000,
    expires_at: 1_700_100_000,
    paid_at: null,
    tx_hash: null,
    updated_at: new Date(),
  })

  const ALL_INVOICES = Array.from({ length: 35 }, (_, i) => makeInvoice(i + 1))

  function mockCollection(invoices: typeof ALL_INVOICES, total: number) {
    const cursor = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue(invoices),
    }
    return {
      find: vi.fn().mockReturnValue(cursor),
      countDocuments: vi.fn().mockResolvedValue(total),
      _cursor: cursor,
    }
  }

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

  it("returns default page size (20) when no params given", async () => {
    const page = ALL_INVOICES.slice(0, 20)
    const col = mockCollection(page, 35)

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getInvoicesCollection").mockReturnValue(col as any)

    const res = await request(app).get("/invoices")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ total: 35, limit: 20, offset: 0 })
    expect(res.body.data).toHaveLength(20)
    expect(col._cursor.skip).toHaveBeenCalledWith(0)
    expect(col._cursor.limit).toHaveBeenCalledWith(20)
  })

  it("respects limit param", async () => {
    const page = ALL_INVOICES.slice(0, 5)
    const col = mockCollection(page, 35)

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getInvoicesCollection").mockReturnValue(col as any)

    const res = await request(app).get("/invoices?limit=5")
    expect(res.status).toBe(200)
    expect(res.body.limit).toBe(5)
    expect(res.body.data).toHaveLength(5)
    expect(col._cursor.limit).toHaveBeenCalledWith(5)
  })

  it("respects offset param", async () => {
    const page = ALL_INVOICES.slice(10, 30)
    const col = mockCollection(page, 35)

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getInvoicesCollection").mockReturnValue(col as any)

    const res = await request(app).get("/invoices?limit=20&offset=10")
    expect(res.status).toBe(200)
    expect(res.body.offset).toBe(10)
    expect(col._cursor.skip).toHaveBeenCalledWith(10)
  })

  it("caps limit at MAX_PAGE_SIZE (100)", async () => {
    const col = mockCollection([], 0)

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getInvoicesCollection").mockReturnValue(col as any)

    const res = await request(app).get("/invoices?limit=9999")
    expect(res.status).toBe(200)
    // limit is capped at 100 internally
    expect(col._cursor.limit).toHaveBeenCalledWith(100)
  })

  it("400 when limit is not a positive integer", async () => {
    const res = await request(app).get("/invoices?limit=abc")
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/limit/)
  })

  it("400 when limit is zero", async () => {
    const res = await request(app).get("/invoices?limit=0")
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/limit/)
  })

  it("400 when offset is negative", async () => {
    const res = await request(app).get("/invoices?offset=-1")
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/offset/)
  })

  it("returns empty data array with correct total when no invoices match", async () => {
    const col = mockCollection([], 0)

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getInvoicesCollection").mockReturnValue(col as any)

    const res = await request(app).get("/invoices")
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ data: [], total: 0, limit: 20, offset: 0 })
  })

  it("passes status filter to database query", async () => {
    const col = mockCollection([], 0)

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getInvoicesCollection").mockReturnValue(col as any)

    await request(app).get("/invoices?status=Paid")
    expect(col.find).toHaveBeenCalledWith(expect.objectContaining({ status: "Paid" }))
  })

  it("passes merchant_address filter to database query", async () => {
    const col = mockCollection([], 0)

    vi.spyOn(mongoModule, "connectMongo").mockResolvedValue({} as any)
    vi.spyOn(mongoModule, "getInvoicesCollection").mockReturnValue(col as any)

    await request(app).get(`/invoices?merchant_address=${MERCHANT_ADDRESS}`)
    expect(col.find).toHaveBeenCalledWith(
      expect.objectContaining({ merchant_address: MERCHANT_ADDRESS }),
    )
  })

  it("500 on database error", async () => {
    vi.spyOn(mongoModule, "connectMongo").mockRejectedValue(new Error("db unavailable"))

    const res = await request(app).get("/invoices")
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/db unavailable/)
  })
})