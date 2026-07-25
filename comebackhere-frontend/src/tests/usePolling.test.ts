import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { usePolling } from "../hooks/usePolling"

// ── Helpers ────────────────────────────────────────────────────────────────

/** Advance fake timers and flush the microtask queue. */
async function tick(ms = 0) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
    await Promise.resolve()
  })
}

// ── Setup / teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
  // Default: tab is visible
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => false,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe("usePolling", () => {
  it("calls callback immediately on mount when enabled", async () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    renderHook(() => usePolling(callback, { interval: 5_000, enabled: true }))

    await tick()

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it("calls callback again after the interval elapses", async () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    renderHook(() => usePolling(callback, { interval: 5_000, enabled: true }))

    await tick()        // initial call
    await tick(5_000)   // one interval

    expect(callback).toHaveBeenCalledTimes(2)
  })

  it("sets lastUpdatedAt after a successful call", async () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      usePolling(callback, { interval: 5_000, enabled: true }),
    )

    expect(result.current.lastUpdatedAt).toBeNull()

    await tick()

    expect(result.current.lastUpdatedAt).toBeInstanceOf(Date)
  })

  it("does not call callback when enabled is false", async () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    renderHook(() =>
      usePolling(callback, { interval: 5_000, enabled: false }),
    )

    await tick()
    await tick(10_000)

    expect(callback).not.toHaveBeenCalled()
  })

  it("stops polling after unmount", async () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    const { unmount } = renderHook(() =>
      usePolling(callback, { interval: 5_000, enabled: true }),
    )

    await tick()    // initial call
    unmount()

    await tick(10_000)  // well past one interval

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it("does not call callback when the tab is hidden", async () => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    })

    const callback = vi.fn().mockResolvedValue(undefined)
    renderHook(() => usePolling(callback, { interval: 5_000, enabled: true }))

    await tick()
    await tick(10_000)

    expect(callback).not.toHaveBeenCalled()
  })

  it("resumes and calls callback when the tab becomes visible", async () => {
    // Start with tab hidden
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    })

    const callback = vi.fn().mockResolvedValue(undefined)
    renderHook(() => usePolling(callback, { interval: 5_000, enabled: true }))

    await tick()  // no call — tab hidden

    // Make tab visible and dispatch the event
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    })
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
      await Promise.resolve()
    })

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it("removes the visibilitychange listener on unmount", async () => {
    const removeSpy = vi.spyOn(document, "removeEventListener")

    const callback = vi.fn().mockResolvedValue(undefined)
    const { unmount } = renderHook(() =>
      usePolling(callback, { interval: 5_000, enabled: true }),
    )

    unmount()

    expect(removeSpy).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    )
  })

  it("does not update lastUpdatedAt when the callback throws", async () => {
    const callback = vi.fn().mockRejectedValue(new Error("network error"))

    const { result } = renderHook(() =>
      usePolling(callback, { interval: 5_000, enabled: true }),
    )

    await tick()

    expect(result.current.lastUpdatedAt).toBeNull()
  })

  it("polls multiple intervals correctly", async () => {
    const callback = vi.fn().mockResolvedValue(undefined)
    renderHook(() => usePolling(callback, { interval: 5_000, enabled: true }))

    await tick()        // call 1 (immediate)
    await tick(5_000)   // call 2
    await tick(5_000)   // call 3

    expect(callback).toHaveBeenCalledTimes(3)
  })
})
