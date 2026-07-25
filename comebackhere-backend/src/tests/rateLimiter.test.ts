import { describe, it, expect, beforeEach, afterEach } from "vitest"
import request from "supertest"
import { createApp } from "../app.js"
import { resetLimiter } from "../middleware/rateLimiter.js"

/**
 * Rate limiter tests.
 *
 * We configure a very tight window (2 requests per window) via env vars
 * so we can trigger 429s quickly without relying on Redis.
 * REDIS_URL is intentionally unset — the in-memory fallback is used.
 */

const MERCHANT_ADDRESS = "GDR7WUDWIKWVBCUBVYLOGT3TJF5FGNQU5U7TACDDA2ZIQUETGGUET5XT"
const FUTURE_DATE = Math.floor(Date.now() / 1000) + 86_400

const VALID_BODY = {
  merchant_address: MERCHANT_ADDRESS,
  token: "USDC",
  amount: 1_000_000,
  due_date: FUTURE_DATE,
}

describe("Rate limiting — POST /invoices", () => {
  let envBackup: Record<string, string | undefined>

  beforeEach(() => {
    envBackup = {
      RATE_LIMIT_POINTS: process.env.RATE_LIMIT_POINTS,
      RATE_LIMIT_DURATION: process.env.RATE_LIMIT_DURATION,
      REDIS_URL: process.env.REDIS_URL,
    }
    // Tight limit: 2 requests per 60-second window
    process.env.RATE_LIMIT_POINTS = "2"
    process.env.RATE_LIMIT_DURATION = "60"
    delete process.env.REDIS_URL

    // Reset the cached limiter so new env vars take effect
    resetLimiter()
  })

  afterEach(() => {
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) delete process.env[key]
      else process.env[key] = val
    }
    resetLimiter()
  })

  it("allows requests within the limit", async () => {
    const app = createApp()
    // First two requests should not be rate-limited (they'll fail for other reasons, not 429)
    const res1 = await request(app).post("/invoices").send(VALID_BODY)
    expect(res1.status).not.toBe(429)

    const res2 = await request(app).post("/invoices").send(VALID_BODY)
    expect(res2.status).not.toBe(429)
  })

  it("returns 429 after exceeding the limit", async () => {
    const app = createApp()
    // Exhaust the 2-request allowance
    await request(app).post("/invoices").send(VALID_BODY)
    await request(app).post("/invoices").send(VALID_BODY)

    // Third request must be rate-limited
    const res = await request(app).post("/invoices").send(VALID_BODY)
    expect(res.status).toBe(429)
    expect(res.body.error).toMatch(/too many requests/i)
    expect(res.headers["retry-after"]).toBeDefined()
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0)
  })

  it("includes retryAfter in the response body", async () => {
    const app = createApp()
    await request(app).post("/invoices").send(VALID_BODY)
    await request(app).post("/invoices").send(VALID_BODY)

    const res = await request(app).post("/invoices").send(VALID_BODY)
    expect(res.status).toBe(429)
    expect(typeof res.body.retryAfter).toBe("number")
    expect(res.body.retryAfter).toBeGreaterThan(0)
  })
})

describe("Rate limiting — GET /invoices/:id", () => {
  let envBackup: Record<string, string | undefined>

  beforeEach(() => {
    envBackup = {
      RATE_LIMIT_POINTS: process.env.RATE_LIMIT_POINTS,
      RATE_LIMIT_DURATION: process.env.RATE_LIMIT_DURATION,
      REDIS_URL: process.env.REDIS_URL,
    }
    process.env.RATE_LIMIT_POINTS = "2"
    process.env.RATE_LIMIT_DURATION = "60"
    delete process.env.REDIS_URL
    resetLimiter()
  })

  afterEach(() => {
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) delete process.env[key]
      else process.env[key] = val
    }
    resetLimiter()
  })

  it("returns 429 after exceeding the limit on GET", async () => {
    const app = createApp()
    await request(app).get("/invoices/1")
    await request(app).get("/invoices/1")

    const res = await request(app).get("/invoices/1")
    expect(res.status).toBe(429)
    expect(res.headers["retry-after"]).toBeDefined()
  })
})
