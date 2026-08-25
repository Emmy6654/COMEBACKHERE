/**
 * Tests for MongoDB connection hardening (#210).
 *
 * Verifies:
 *  1. connectMongo() throws a clear error (status 503) when the server is
 *     unreachable, rather than hanging or emitting an opaque driver error.
 *  2. The error message references the MONGODB_URI so the operator knows
 *     which endpoint failed.
 *  3. connectMongo() succeeds (returns a Db) when the client connects
 *     without error.
 *  4. Downstream routes return HTTP 500/503 (not a hang) when connectMongo
 *     rejects.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { MongoServerSelectionError } from "mongodb"
import request from "supertest"
import { createApp } from "../app.js"
import { _resetMongoSingleton } from "../db/mongo.js"

// ---------------------------------------------------------------------------
// We mock the entire "mongodb" module so no real network calls are made.
// ---------------------------------------------------------------------------

vi.mock("mongodb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("mongodb")>()
  return {
    ...actual,
    MongoClient: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getMongoClientMock() {
  const { MongoClient } = await import("mongodb")
  return vi.mocked(MongoClient)
}

const ENV = {
  SOROBAN_RPC_URL: "http://localhost:8000",
  TREASURY_CONTRACT_ID: "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW",
  USDC_CONTRACT_ID: "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW",
  SIGNER_SECRET_KEY: "SD6O7ZRNX5ILY5WSQR5CEWBYXRPWZNZARH3TWWPCVEC3Q5HC6D63BEJQ",
  NETWORK_PASSPHRASE: "Standalone Network ; February 2025",
  MONGODB_URI: "mongodb://unreachable-host:27017",
}

// ---------------------------------------------------------------------------
// connectMongo unit tests
// ---------------------------------------------------------------------------

describe("connectMongo — connection hardening", () => {
  let envBackup: Record<string, string | undefined>

  beforeEach(() => {
    // Reset the module-level singleton so each test starts fresh
    _resetMongoSingleton()

    envBackup = {}
    for (const key of Object.keys(ENV)) {
      envBackup[key] = process.env[key]
      process.env[key] = ENV[key as keyof typeof ENV]
    }
  })

  afterEach(async () => {
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) delete process.env[key]
      else process.env[key] = val
    }
    // Reset again so subsequent test suites aren't polluted
    _resetMongoSingleton()
    vi.clearAllMocks()
  })

  it("throws an error with status 503 when the server is unreachable", async () => {
    const MongoClientMock = await getMongoClientMock()
    const selectionError = new MongoServerSelectionError(
      "connect ECONNREFUSED 127.0.0.1:27017",
    )

    MongoClientMock.mockImplementation(() => ({
      connect: vi.fn().mockRejectedValue(selectionError),
      on: vi.fn(),
      db: vi.fn(),
      close: vi.fn(),
    }) as any)

    const { connectMongo } = await import("../db/mongo.js")

    await expect(connectMongo()).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/mongodb unreachable/i),
    })
  })

  it("includes the MONGODB_URI in the error message for operator clarity", async () => {
    const MongoClientMock = await getMongoClientMock()
    const selectionError = new MongoServerSelectionError(
      "No servers found in topology",
    )

    MongoClientMock.mockImplementation(() => ({
      connect: vi.fn().mockRejectedValue(selectionError),
      on: vi.fn(),
      db: vi.fn(),
      close: vi.fn(),
    }) as any)

    const { connectMongo } = await import("../db/mongo.js")

    await expect(connectMongo()).rejects.toMatchObject({
      message: expect.stringMatching(/mongodb:\/\/unreachable-host/),
    })
  })

  it("wraps non-selection-error failures with status 503 and clear message", async () => {
    const MongoClientMock = await getMongoClientMock()

    MongoClientMock.mockImplementation(() => ({
      connect: vi.fn().mockRejectedValue(new Error("ETIMEDOUT")),
      on: vi.fn(),
      db: vi.fn(),
      close: vi.fn(),
    }) as any)

    const { connectMongo } = await import("../db/mongo.js")

    await expect(connectMongo()).rejects.toMatchObject({
      status: 503,
      message: expect.stringMatching(/failed to connect to mongodb/i),
    })
  })

  it("returns a Db handle when connection succeeds", async () => {
    const MongoClientMock = await getMongoClientMock()
    const fakeDb = {
      collection: vi.fn().mockReturnValue({
        createIndex: vi.fn().mockResolvedValue({}),
      }),
    }

    MongoClientMock.mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      db: vi.fn().mockReturnValue(fakeDb),
      close: vi.fn(),
    }) as any)

    const { connectMongo } = await import("../db/mongo.js")
    const result = await connectMongo()

    expect(result).toBe(fakeDb)
  })
})

// ---------------------------------------------------------------------------
// HTTP-layer: route returns 5xx (not a hang) when Mongo is down
// ---------------------------------------------------------------------------

describe("GET /api/treasury/pending-settlements — Mongo outage returns 5xx", () => {
  const app = createApp()
  let envBackup: Record<string, string | undefined>

  beforeEach(() => {
    _resetMongoSingleton()

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
    _resetMongoSingleton()
    vi.clearAllMocks()
  })

  it("returns 5xx with an error body when connectMongo rejects", async () => {
    const MongoClientMock = await getMongoClientMock()
    const selectionError = new MongoServerSelectionError("ECONNREFUSED")

    MongoClientMock.mockImplementation(() => ({
      connect: vi.fn().mockRejectedValue(selectionError),
      on: vi.fn(),
      db: vi.fn(),
      close: vi.fn(),
    }) as any)

    const res = await request(app).get("/api/treasury/pending-settlements")

    // Should respond with a 5xx status code — either 500 or 503 depending on
    // whether the route catches the status property from the thrown error.
    expect(res.status).toBeGreaterThanOrEqual(500)
    expect(res.body).toHaveProperty("error")
    expect(res.body.error).toMatch(/mongodb/i)
  }, 10_000)
})
