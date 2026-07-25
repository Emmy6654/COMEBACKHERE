import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import request from "supertest"
import { createApp } from "../app.js"
import { createInvoice, type SorobanClient } from "../routes/invoices.js"
import { SorobanRpc, SorobanDataBuilder, xdr } from "stellar-sdk"

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
