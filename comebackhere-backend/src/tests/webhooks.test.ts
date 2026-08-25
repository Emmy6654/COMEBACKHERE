/**
 * Tests for outbound webhook HMAC-SHA256 signing (#208).
 *
 * Covers:
 * - signPayload produces correct HMAC-SHA256
 * - verifySignature accepts a valid signature
 * - verifySignature rejects a tampered payload
 * - verifySignature rejects a wrong secret
 * - verifySignature is constant-time safe (length mismatch returns false)
 * - dispatchWebhook sends X-COMEBACKHERE-Signature header
 * - dispatchWebhook signature matches what verifySignature accepts
 * - dispatchWebhook throws when no signing secret is configured
 * - dispatchWebhook result includes ok/status from the upstream response
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createHmac } from "crypto"
import {
  signPayload,
  verifySignature,
  dispatchWebhook,
  WEBHOOK_SIGNATURE_HEADER,
} from "../services/webhooks.js"

const TEST_SECRET = "super-secret-hmac-key-at-least-32-chars!"
const TEST_URL = "https://merchant.example.com/webhooks"

// ---------------------------------------------------------------------------
// signPayload
// ---------------------------------------------------------------------------

describe("signPayload", () => {
  it("returns a lowercase hex HMAC-SHA256 digest", () => {
    const body = JSON.stringify({ event: "settlement_executed", settlement_id: 1 })
    const sig = signPayload(TEST_SECRET, body)

    // Must be 64-char lowercase hex
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
  })

  it("matches a manually computed HMAC-SHA256", () => {
    const body = '{"event":"settlement_proposed","settlement_id":42}'
    const expected = createHmac("sha256", TEST_SECRET).update(body, "utf8").digest("hex")
    expect(signPayload(TEST_SECRET, body)).toBe(expected)
  })

  it("produces different signatures for different secrets", () => {
    const body = '{"event":"test"}'
    const sig1 = signPayload("secret-one-aaaaaaaaaaaaaaaaaaaaa", body)
    const sig2 = signPayload("secret-two-bbbbbbbbbbbbbbbbbbbbb", body)
    expect(sig1).not.toBe(sig2)
  })

  it("produces different signatures for different bodies", () => {
    const sig1 = signPayload(TEST_SECRET, '{"event":"a"}')
    const sig2 = signPayload(TEST_SECRET, '{"event":"b"}')
    expect(sig1).not.toBe(sig2)
  })
})

// ---------------------------------------------------------------------------
// verifySignature
// ---------------------------------------------------------------------------

describe("verifySignature", () => {
  it("returns true for a valid signature", () => {
    const body = '{"event":"settlement_executed","settlement_id":7}'
    const sig = signPayload(TEST_SECRET, body)
    expect(verifySignature(TEST_SECRET, body, sig)).toBe(true)
  })

  it("returns false when the payload has been tampered with", () => {
    const body = '{"event":"settlement_executed","settlement_id":7}'
    const sig = signPayload(TEST_SECRET, body)
    const tampered = '{"event":"settlement_executed","settlement_id":9999}'
    expect(verifySignature(TEST_SECRET, tampered, sig)).toBe(false)
  })

  it("returns false when the wrong secret is used", () => {
    const body = '{"event":"settlement_proposed","settlement_id":1}'
    const sig = signPayload(TEST_SECRET, body)
    expect(verifySignature("wrong-secret-aaaaaaaaaaaaaaaaaaaaaa", body, sig)).toBe(false)
  })

  it("returns false when the signature is an empty string", () => {
    const body = '{"event":"test"}'
    expect(verifySignature(TEST_SECRET, body, "")).toBe(false)
  })

  it("returns false when the signature is malformed (non-hex)", () => {
    const body = '{"event":"test"}'
    expect(verifySignature(TEST_SECRET, body, "not-a-valid-hex-signature!!")).toBe(false)
  })

  it("returns false when signature length does not match (timing-safe guard)", () => {
    const body = '{"event":"test"}'
    // Truncated hex — different byte length
    expect(verifySignature(TEST_SECRET, body, "abcd")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// dispatchWebhook
// ---------------------------------------------------------------------------

describe("dispatchWebhook", () => {
  let envBackup: string | undefined

  beforeEach(() => {
    envBackup = process.env.WEBHOOK_SIGNING_SECRET
  })

  afterEach(() => {
    if (envBackup === undefined) {
      delete process.env.WEBHOOK_SIGNING_SECRET
    } else {
      process.env.WEBHOOK_SIGNING_SECRET = envBackup
    }
  })

  it("sends X-COMEBACKHERE-Signature header on the outbound request", async () => {
    const capturedHeaders: Record<string, string> = {}

    const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      for (const [k, v] of Object.entries(init?.headers ?? {})) {
        capturedHeaders[k] = v as string
      }
      return Promise.resolve(new Response(null, { status: 200 }))
    })

    await dispatchWebhook(
      TEST_URL,
      { event: "settlement_executed", settlement_id: 1 },
      TEST_SECRET,
      mockFetch as unknown as typeof fetch,
    )

    expect(capturedHeaders[WEBHOOK_SIGNATURE_HEADER]).toBeDefined()
    expect(capturedHeaders[WEBHOOK_SIGNATURE_HEADER]).toMatch(/^[0-9a-f]{64}$/)
  })

  it("signature in the header verifies correctly against the body sent", async () => {
    let capturedBody = ""
    let capturedSignature = ""

    const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = init?.body as string
      capturedSignature = (init?.headers as Record<string, string>)[WEBHOOK_SIGNATURE_HEADER]
      return Promise.resolve(new Response(null, { status: 200 }))
    })

    await dispatchWebhook(
      TEST_URL,
      { event: "settlement_proposed", settlement_id: 42, merchant_address: "G..." },
      TEST_SECRET,
      mockFetch as unknown as typeof fetch,
    )

    // The consumer should be able to verify the signature
    expect(verifySignature(TEST_SECRET, capturedBody, capturedSignature)).toBe(true)
  })

  it("a tampered body fails signature verification", async () => {
    let capturedSignature = ""

    const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedSignature = (init?.headers as Record<string, string>)[WEBHOOK_SIGNATURE_HEADER]
      return Promise.resolve(new Response(null, { status: 200 }))
    })

    await dispatchWebhook(
      TEST_URL,
      { event: "settlement_approved", settlement_id: 5 },
      TEST_SECRET,
      mockFetch as unknown as typeof fetch,
    )

    const tampered = JSON.stringify({ event: "settlement_approved", settlement_id: 9999 })
    expect(verifySignature(TEST_SECRET, tampered, capturedSignature)).toBe(false)
  })

  it("returns ok:true and status from the upstream response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))

    const result = await dispatchWebhook(
      TEST_URL,
      { event: "settlement_executed", settlement_id: 1 },
      TEST_SECRET,
      mockFetch as unknown as typeof fetch,
    )

    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.url).toBe(TEST_URL)
  })

  it("returns ok:false when upstream responds with 4xx", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 400 }))

    const result = await dispatchWebhook(
      TEST_URL,
      { event: "test_event" },
      TEST_SECRET,
      mockFetch as unknown as typeof fetch,
    )

    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
  })

  it("throws when no signing secret is configured", async () => {
    delete process.env.WEBHOOK_SIGNING_SECRET

    await expect(
      dispatchWebhook(TEST_URL, { event: "test_event" }),
    ).rejects.toThrow(/signing secret is not configured/)
  })

  it("falls back to WEBHOOK_SIGNING_SECRET env var when no secret is passed", async () => {
    process.env.WEBHOOK_SIGNING_SECRET = TEST_SECRET

    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))

    const result = await dispatchWebhook(
      TEST_URL,
      { event: "settlement_proposed", settlement_id: 1 },
      undefined,
      mockFetch as unknown as typeof fetch,
    )

    expect(result.ok).toBe(true)
    // Signature should be present and valid
    expect(result.signature).toMatch(/^[0-9a-f]{64}$/)
  })

  it("sends Content-Type: application/json", async () => {
    let capturedContentType = ""

    const mockFetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedContentType = (init?.headers as Record<string, string>)["Content-Type"]
      return Promise.resolve(new Response(null, { status: 200 }))
    })

    await dispatchWebhook(
      TEST_URL,
      { event: "test_event" },
      TEST_SECRET,
      mockFetch as unknown as typeof fetch,
    )

    expect(capturedContentType).toBe("application/json")
  })
})
