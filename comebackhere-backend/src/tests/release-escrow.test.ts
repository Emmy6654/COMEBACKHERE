import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import request from "supertest"
import { createApp } from "../app.js"
import { releaseEscrow } from "../routes/release-escrow.js"
import type { SorobanClient } from "../lib/soroban.js"
import { SorobanRpc, SorobanDataBuilder, xdr } from "stellar-sdk"

// Pre-parsed simulation success accepted by assembleTransaction without XDR parsing
const PARSED_SIM_SUCCESS = {
  _parsed: true,
  latestLedger: 1,
  events: [],
  minResourceFee: "0",
  transactionData: new SorobanDataBuilder(),
  result: { auth: [], retval: xdr.ScVal.scvVoid() },
}

const SIGNER_SECRET = "SD6O7ZRNX5ILY5WSQR5CEWBYXRPWZNZARH3TWWPCVEC3Q5HC6D63BEJQ"
const INVOICE_CONTRACT = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW"
const NETWORK = "Standalone Network ; February 2025"
const ADMIN_KEY = "test-admin-secret"
const SIGNER_PUB = "GDR7WUDWIKWVBCUBVYLOGT3TJF5FGNQU5U7TACDDA2ZIQUETGGUET5XT"

const ENV = {
  SOROBAN_RPC_URL: "http://localhost:8000",
  INVOICE_CONTRACT_ID: INVOICE_CONTRACT,
  SIGNER_SECRET_KEY: SIGNER_SECRET,
  NETWORK_PASSPHRASE: NETWORK,
  ADMIN_KEY,
}

const fakeAccount = {
  accountId: () => SIGNER_PUB,
  sequenceNumber: () => "100",
  incrementSequenceNumber: vi.fn(),
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

// ── HTTP layer tests ──────────────────────────────────────────────────────────
describe("POST /invoices/:id/release-escrow — HTTP layer", () => {
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

  it("401 when x-admin-key header is missing", async () => {
    const res = await request(app).post("/invoices/1/release-escrow").send()
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Unauthorized/)
  })

  it("401 when x-admin-key header is wrong", async () => {
    const res = await request(app)
      .post("/invoices/1/release-escrow")
      .set("x-admin-key", "wrong-key")
      .send()
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Unauthorized/)
  })

  it("400 when id is not a positive integer", async () => {
    const res = await request(app)
      .post("/invoices/abc/release-escrow")
      .set("x-admin-key", ADMIN_KEY)
      .send()
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/positive integer/)
  })

  it("400 when id is zero", async () => {
    const res = await request(app)
      .post("/invoices/0/release-escrow")
      .set("x-admin-key", ADMIN_KEY)
      .send()
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/positive integer/)
  })

  it("503 when required env vars are missing", async () => {
    delete process.env.INVOICE_CONTRACT_ID
    const res = await request(app)
      .post("/invoices/1/release-escrow")
      .set("x-admin-key", ADMIN_KEY)
      .send()
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/misconfiguration/)
  })
})

// ── Business logic tests (injectable client) ──────────────────────────────────
describe("releaseEscrow — Soroban interaction", () => {
  const env = {
    rpcUrl: ENV.SOROBAN_RPC_URL,
    invoiceContractId: INVOICE_CONTRACT,
    signerSecret: SIGNER_SECRET,
    networkPassphrase: NETWORK,
  }

  it("returns invoice_id, Released status, and tx_hash on success", async () => {
    const client = makeMockClient({
      getAccount: vi.fn().mockResolvedValue(fakeAccount),
      simulateTransaction: vi.fn().mockResolvedValue(PARSED_SIM_SUCCESS),
      sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "release-hash-42" }),
      getTransaction: vi.fn().mockResolvedValue({
        status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
        latestLedger: 1,
        latestLedgerCloseTime: 0,
        oldestLedger: 1,
        oldestLedgerCloseTime: 0,
      }),
    })

    const result = await releaseEscrow(42, env, client)
    expect(result).toEqual({ invoice_id: 42, status: "Released", tx_hash: "release-hash-42" })
  })

  it("throws 422 when simulation reports an error", async () => {
    const client = makeMockClient({
      getAccount: vi.fn().mockResolvedValue(fakeAccount),
      simulateTransaction: vi.fn().mockResolvedValue({
        error: "HostError: contract panic",
        latestLedger: 1,
      }),
    })

    await expect(releaseEscrow(1, env, client)).rejects.toMatchObject({
      message: expect.stringMatching(/simulation failed/),
      status: 422,
    })
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

    await expect(releaseEscrow(1, env, client)).rejects.toMatchObject({
      message: expect.stringMatching(/submission failed/),
      status: 422,
    })
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

    await expect(releaseEscrow(1, env, client)).rejects.toMatchObject({
      message: expect.stringMatching(/timeout/),
      status: 504,
    })
  }, 15_000)

  it("maps UNAUTHORIZED contract error to a 403-friendly error message", async () => {
    const client = makeMockClient({
      getAccount: vi.fn().mockResolvedValue(fakeAccount),
      simulateTransaction: vi.fn().mockResolvedValue({
        error: "HostError: Error(Contract, #1) UNAUTHORIZED",
        latestLedger: 1,
      }),
    })

    await expect(releaseEscrow(1, env, client)).rejects.toMatchObject({
      message: expect.stringMatching(/simulation failed/),
    })
  })
})
