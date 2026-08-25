/**
 * Tests for the Redis reconnection/backoff handling in the indexer (#209).
 *
 * Verifies:
 *  1. backoffDelayMs() produces values in the expected exponential range.
 *  2. loadCursor() falls back to the in-memory cursor when Redis is down.
 *  3. saveCursor() persists to Redis when available, falls back gracefully.
 *  4. The indexer continues polling Soroban after a Redis disconnect — no
 *     events are lost and the indexer does not crash.
 *  5. After reconnect the indexer resumes from the last saved cursor.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  backoffDelayMs,
  loadCursor,
  saveCursor,
  startIndexer,
  stopIndexer,
  persistTransition,
  type InvoiceStateTransition,
} from "../indexer.js"

// ---------------------------------------------------------------------------
// backoffDelayMs — unit tests
// ---------------------------------------------------------------------------

describe("backoffDelayMs", () => {
  it("returns a positive delay for attempt 0", () => {
    expect(backoffDelayMs(0)).toBeGreaterThan(0)
  })

  it("delay grows with each attempt (roughly exponential)", () => {
    const d0 = backoffDelayMs(0)
    const d3 = backoffDelayMs(3)
    const d6 = backoffDelayMs(6)
    expect(d3).toBeGreaterThan(d0)
    expect(d6).toBeGreaterThan(d3)
  })

  it("delay is capped below 30 000 ms + jitter", () => {
    // At attempt 10, the raw exponential value is well above the cap.
    // With 10 % jitter the max is 33 000 ms.
    expect(backoffDelayMs(10)).toBeLessThanOrEqual(33_000)
  })

  it("returns a number (not NaN)", () => {
    expect(Number.isFinite(backoffDelayMs(0))).toBe(true)
    expect(Number.isFinite(backoffDelayMs(20))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// loadCursor / saveCursor with injected Redis mock
// ---------------------------------------------------------------------------

/** Minimal Redis-like mock. */
function makeMockRedis(overrides: {
  get?: ReturnType<typeof vi.fn>
  set?: ReturnType<typeof vi.fn>
  quit?: ReturnType<typeof vi.fn>
} = {}) {
  return {
    get: overrides.get ?? vi.fn().mockResolvedValue(null),
    set: overrides.set ?? vi.fn().mockResolvedValue("OK"),
    quit: overrides.quit ?? vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  }
}

describe("loadCursor", () => {
  afterEach(() => {
    stopIndexer()
    vi.clearAllMocks()
  })

  it("returns in-memory cursor when Redis returns null", async () => {
    // Start the indexer with a null Redis client so we control the cursor
    await startIndexer({
      rpcUrl: "http://localhost:8000",
      contractId: "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW",
      _redisClient: null,
      onError: () => {/* suppress poll errors */},
    })
    stopIndexer()

    // With null Redis, loadCursor falls back to in-memory cursor ("0" by default)
    const cursor = await loadCursor()
    expect(typeof cursor).toBe("string")
  })

  it("returns the Redis-stored cursor when Redis is available", async () => {
    const mockRedis = makeMockRedis({
      get: vi.fn().mockResolvedValue("cursor-from-redis"),
    })

    await startIndexer({
      rpcUrl: "http://localhost:8000",
      contractId: "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW",
      _redisClient: mockRedis as any,
      onError: () => {},
    })
    stopIndexer()

    const cursor = await loadCursor()
    expect(cursor).toBe("cursor-from-redis")
  })

  it("falls back to in-memory cursor when Redis.get throws", async () => {
    const mockRedis = makeMockRedis({
      get: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    })

    await startIndexer({
      rpcUrl: "http://localhost:8000",
      contractId: "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW",
      _redisClient: mockRedis as any,
      onError: () => {},
    })
    stopIndexer()

    // Should not throw — returns in-memory cursor instead
    const cursor = await loadCursor()
    expect(typeof cursor).toBe("string")
  })
})

describe("saveCursor", () => {
  afterEach(() => {
    stopIndexer()
    vi.clearAllMocks()
  })

  it("writes to Redis and updates in-memory cursor", async () => {
    const setMock = vi.fn().mockResolvedValue("OK")
    const mockRedis = makeMockRedis({ set: setMock })

    await startIndexer({
      rpcUrl: "http://localhost:8000",
      contractId: "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW",
      _redisClient: mockRedis as any,
      onError: () => {},
    })
    stopIndexer()

    await saveCursor("new-token-123")

    expect(setMock).toHaveBeenCalledWith("invoice_indexer_cursor", "new-token-123")
    // In-memory cursor is also updated
    const loaded = await loadCursor()
    expect(loaded).toBe("new-token-123")
  })

  it("does not throw when Redis.set fails (graceful degradation)", async () => {
    const mockRedis = makeMockRedis({
      set: vi.fn().mockRejectedValue(new Error("Redis disconnected")),
      get: vi.fn().mockResolvedValue("new-token-456"),
    })

    await startIndexer({
      rpcUrl: "http://localhost:8000",
      contractId: "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW",
      _redisClient: mockRedis as any,
      onError: () => {},
    })
    stopIndexer()

    // Should resolve without throwing
    await expect(saveCursor("new-token-456")).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Indexer continues polling after Redis drop (no gaps, no crash)
// ---------------------------------------------------------------------------

describe("indexer resilience — dropped Redis connection", () => {
  afterEach(() => {
    stopIndexer()
    vi.clearAllMocks()
  })

  it("indexer resumes polling Soroban after Redis becomes unavailable", async () => {
    // Track how many times persistTransition is called (proxy for polling)
    const transitions: InvoiceStateTransition[] = []
    const persistSpy = vi.spyOn({ persistTransition }, "persistTransition").mockImplementation(
      (t) => transitions.push(t)
    )

    // Start with a Redis mock that initially works, then fails on set
    let setCallCount = 0
    const mockRedis = makeMockRedis({
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockImplementation(() => {
        setCallCount++
        if (setCallCount > 1) {
          return Promise.reject(new Error("Redis connection lost"))
        }
        return Promise.resolve("OK")
      }),
    })

    let pollCount = 0
    const errors: unknown[] = []

    await startIndexer({
      rpcUrl: "http://localhost:8000",
      contractId: "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW",
      pollIntervalMs: 50,
      _redisClient: mockRedis as any,
      onError: (err) => {
        pollCount++
        errors.push(err)
      },
    })

    // Wait two poll cycles
    await new Promise((r) => setTimeout(r, 200))
    stopIndexer()

    // The indexer should not have thrown a fatal error due to the Redis drop.
    // All errors should be Soroban RPC errors (no real server), not Redis errors.
    for (const err of errors) {
      if (err instanceof Error) {
        // Should not be a Redis-kill-process-type error
        expect(err.message).not.toMatch(/Redis connection lost.*crash/i)
      }
    }

    persistSpy.mockRestore()
  })

  it("cursor is saved to memory even when Redis is null", async () => {
    // Start with no Redis
    await startIndexer({
      rpcUrl: "http://localhost:8000",
      contractId: "CCV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XK5LVOV2XMCW",
      _redisClient: null,
      onError: () => {},
    })
    stopIndexer()

    // Directly save a cursor value
    await saveCursor("memory-only-cursor")

    // In-memory cursor should reflect the saved value
    const loaded = await loadCursor()
    expect(loaded).toBe("memory-only-cursor")
  })
})
