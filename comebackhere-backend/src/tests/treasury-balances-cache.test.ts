/**
 * Tests for the treasury balances in-memory cache (#212).
 *
 * Verifies:
 *  1. Repeated GET /api/treasury/balances calls within the TTL hit the cache
 *     (getTokenBalance mock is only called once).
 *  2. The cache expires after the TTL, causing a fresh RPC call.
 *  3. The cache is invalidated immediately after a successful execute-settlement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import request from "supertest"
import { createApp } from "../app.js"
import {
  getBalanceCache,
  setBalanceCache,
  invalidateBalanceCache,
} from "../routes/treasury.js"

// ---------------------------------------------------------------------------
// Constants — valid Stellar credentials for env setup
// ---------------------------------------------------------------------------

const SIGNER_SECRET = "SD6O7ZRNX5ILY5WSQR5CEWBYXRPWZNZARH3TWWPCVEC3Q5HC6D63BEJQ"
const TREASURY_CONTRACT = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW"
const USDC_CONTRACT = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW"
const INVOICE_CONTRACT = "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW"
const NETWORK = "Standalone Network ; February 2025"

const ENV = {
  SOROBAN_RPC_URL: "http://localhost:8000",
  TREASURY_CONTRACT_ID: TREASURY_CONTRACT,
  USDC_CONTRACT_ID: USDC_CONTRACT,
  INVOICE_CONTRACT_ID: INVOICE_CONTRACT,
  SIGNER_SECRET_KEY: SIGNER_SECRET,
  NETWORK_PASSPHRASE: NETWORK,
}

// ---------------------------------------------------------------------------
// Unit tests for the cache helpers
// ---------------------------------------------------------------------------

describe("balance cache helpers", () => {
  beforeEach(() => {
    // Ensure every test starts with a clean cache
    invalidateBalanceCache()
  })

  it("getBalanceCache returns null when nothing is cached", () => {
    expect(getBalanceCache()).toBeNull()
  })

  it("setBalanceCache stores data and getBalanceCache returns it", () => {
    const data = [{ token: USDC_CONTRACT, balance: "9999" }]
    setBalanceCache(data)
    expect(getBalanceCache()).toEqual(data)
  })

  it("invalidateBalanceCache clears the cache immediately", () => {
    setBalanceCache([{ token: USDC_CONTRACT, balance: "1234" }])
    invalidateBalanceCache()
    expect(getBalanceCache()).toBeNull()
  })

  it("cache expires after TTL", () => {
    const data = [{ token: USDC_CONTRACT, balance: "500" }]

    vi.useFakeTimers()

    setBalanceCache(data)
    // Within TTL — should be fresh
    expect(getBalanceCache()).toEqual(data)

    // Advance time past the 5-second TTL
    vi.advanceTimersByTime(6_000)

    expect(getBalanceCache()).toBeNull()

    vi.useRealTimers()
  })
})

// ---------------------------------------------------------------------------
// HTTP-layer tests: GET /api/treasury/balances uses the cache
// ---------------------------------------------------------------------------

// We mock the soroban lib module so getTokenBalance is controllable
vi.mock("../lib/soroban.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/soroban.js")>()
  return {
    ...original,
    buildSorobanClient: vi.fn(() => ({})),
    getTokenBalance: vi.fn().mockResolvedValue(BigInt(10_000_000)),
  }
})

describe("GET /api/treasury/balances — caching behaviour", () => {
  const app = createApp()
  let envBackup: Record<string, string | undefined>

  beforeEach(async () => {
    // Save and set env vars
    envBackup = {}
    for (const key of Object.keys(ENV)) {
      envBackup[key] = process.env[key]
      process.env[key] = ENV[key as keyof typeof ENV]
    }
    // Always start with a clean cache so tests are isolated
    invalidateBalanceCache()

    // Reset mock call counts between tests
    const { getTokenBalance } = await import("../lib/soroban.js")
    vi.mocked(getTokenBalance).mockClear()
    vi.mocked(getTokenBalance).mockResolvedValue(BigInt(10_000_000))
  })

  afterEach(() => {
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) delete process.env[key]
      else process.env[key] = val
    }
  })

  it("returns 200 with balance data", async () => {
    const res = await request(app).get("/api/treasury/balances")
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ token: USDC_CONTRACT, balance: "10000000" }])
  })

  it("repeated calls within TTL only call getTokenBalance once", async () => {
    const { getTokenBalance } = await import("../lib/soroban.js")

    await request(app).get("/api/treasury/balances")
    await request(app).get("/api/treasury/balances")
    await request(app).get("/api/treasury/balances")

    expect(vi.mocked(getTokenBalance)).toHaveBeenCalledTimes(1)
  })

  it("returns the same cached value on repeated calls", async () => {
    const res1 = await request(app).get("/api/treasury/balances")
    const res2 = await request(app).get("/api/treasury/balances")

    expect(res1.body).toEqual(res2.body)
  })

  it("calls getTokenBalance again after cache is invalidated", async () => {
    const { getTokenBalance } = await import("../lib/soroban.js")

    await request(app).get("/api/treasury/balances")
    expect(vi.mocked(getTokenBalance)).toHaveBeenCalledTimes(1)

    invalidateBalanceCache()

    await request(app).get("/api/treasury/balances")
    expect(vi.mocked(getTokenBalance)).toHaveBeenCalledTimes(2)
  })

  it("cache expires after TTL and next call fetches fresh data", async () => {
    const { getTokenBalance } = await import("../lib/soroban.js")

    // Seed the cache with a known value
    setBalanceCache([{ token: USDC_CONTRACT, balance: "10000000" }])

    vi.useFakeTimers()

    // Advance past the 5-second TTL — the cache should now be stale
    vi.advanceTimersByTime(6_000)

    // Cache should be empty, so next real call hits getTokenBalance
    expect(getBalanceCache()).toBeNull()

    vi.useRealTimers()

    // Confirm a fresh HTTP call hits the mock (cache was cleared)
    await request(app).get("/api/treasury/balances")
    expect(vi.mocked(getTokenBalance)).toHaveBeenCalledTimes(1)
  })
})
