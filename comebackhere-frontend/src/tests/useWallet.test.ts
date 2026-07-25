import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useWallet } from "../hooks/useWallet"

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe("useWallet", () => {
  it("starts disconnected with no error", () => {
    const { result } = renderHook(() => useWallet())
    expect(result.current.connected).toBe(false)
    expect(result.current.address).toBeNull()
    expect(result.current.connecting).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.isLocked).toBe(false)
  })

  it("detects when wallet is not installed", () => {
    // Don't stub freighterApi, simulate not installed
    const { result } = renderHook(() => useWallet())
    expect(result.current.isNotInstalled).toBe(true)
    expect(result.current.connected).toBe(false)
  })

  it("connects and sets address", async () => {
    const fakeAddress = "GBDXOEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    vi.stubGlobal("freighterApi", {
      getAddress: vi.fn().mockResolvedValue({ address: fakeAddress }),
    })

    const { result } = renderHook(() => useWallet())
    await act(async () => {
      await result.current.connect()
    })

    expect(result.current.connected).toBe(true)
    expect(result.current.address).toBe(fakeAddress)
    expect(result.current.connecting).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.isLocked).toBe(false)
  })

  it("detects locked wallet with user rejected error", async () => {
    vi.stubGlobal("freighterApi", {
      getAddress: vi
        .fn()
        .mockRejectedValue(new Error("User rejected")),
    })

    const { result } = renderHook(() => useWallet())
    await act(async () => {
      try {
        await result.current.connect()
      } catch {
        // Expected to throw
      }
    })

    expect(result.current.connected).toBe(false)
    expect(result.current.isLocked).toBe(true)
    expect(result.current.error).toContain("User rejected")
  })

  it("detects locked wallet with locked error", async () => {
    vi.stubGlobal("freighterApi", {
      getAddress: vi.fn().mockRejectedValue(new Error("Wallet is locked")),
    })

    const { result } = renderHook(() => useWallet())
    await act(async () => {
      try {
        await result.current.connect()
      } catch {
        // Expected to throw
      }
    })

    expect(result.current.isLocked).toBe(true)
  })

  it("detects locked wallet with unauthorized error", async () => {
    vi.stubGlobal("freighterApi", {
      getAddress: vi
        .fn()
        .mockRejectedValue(new Error("Unauthorized")),
    })

    const { result } = renderHook(() => useWallet())
    await act(async () => {
      try {
        await result.current.connect()
      } catch {
        // Expected to throw
      }
    })

    expect(result.current.isLocked).toBe(true)
  })

  it("handles generic connection errors", async () => {
    vi.stubGlobal("freighterApi", {
      getAddress: vi
        .fn()
        .mockRejectedValue(new Error("Generic error")),
    })

    const { result } = renderHook(() => useWallet())
    await act(async () => {
      try {
        await result.current.connect()
      } catch {
        // Expected to throw
      }
    })

    expect(result.current.connected).toBe(false)
    expect(result.current.isLocked).toBe(false)
    expect(result.current.error).toContain("Generic error")
  })

  it("disconnect clears all wallet state fields", async () => {
    const fakeAddress = "GBDXOEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    vi.stubGlobal("freighterApi", {
      getAddress: vi.fn().mockResolvedValue({ address: fakeAddress }),
    })

    const { result } = renderHook(() => useWallet())
    await act(async () => {
      await result.current.connect()
    })
    expect(result.current.connected).toBe(true)

    act(() => {
      result.current.disconnect()
    })

    expect(result.current.connected).toBe(false)
    expect(result.current.address).toBeNull()
    expect(result.current.connecting).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.isLocked).toBe(false)
  })

  it("provides retryConnect function", async () => {
    const fakeAddress = "GBDXOEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    const connectFn = vi.fn()
    
    vi.stubGlobal("freighterApi", {
      getAddress: connectFn,
    })

    // First attempt fails with User rejected
    connectFn.mockRejectedValueOnce(new Error("User rejected"))

    const { result } = renderHook(() => useWallet())

    // Wait for initial check to complete
    await act(async () => {
      // No-op to let effect run
    })

    // Verify locked state from initial check
    expect(result.current.isLocked).toBe(true)

    // Set up success response for retry
    connectFn.mockResolvedValueOnce({ address: fakeAddress })

    // Retry succeeds
    await act(async () => {
      await result.current.retryConnect()
    })
    expect(result.current.connected).toBe(true)
    expect(result.current.address).toBe(fakeAddress)
  })
})