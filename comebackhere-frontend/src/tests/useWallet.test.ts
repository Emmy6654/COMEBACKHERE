import { renderHook, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useWallet } from "../hooks/useWallet"

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe("useWallet", () => {
  it("starts disconnected", () => {
    const { result } = renderHook(() => useWallet())
    expect(result.current.connected).toBe(false)
    expect(result.current.address).toBeNull()
    expect(result.current.connecting).toBe(false)
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
  })
})