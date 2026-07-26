import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useSettlements } from './useSettlements'
import { Settlement } from '../types'

const mockFetch = vi.fn()
global.fetch = mockFetch

function makeSettlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: 1,
    merchant_address: 'GABC...MERCHANT',
    amount: '1000',
    approvals: [],
    approval_weight: 0,
    status: 'Pending',
    hold_reason: null,
    ...overrides,
  }
}

describe('useSettlements', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  describe('fetchSettlements', () => {
    it('should start in a loading state', () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] })

      const { result } = renderHook(() => useSettlements())

      expect(result.current.loading).toBe(true)
    })

    it('should fetch settlements successfully', async () => {
      const mockSettlements = [makeSettlement()]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSettlements,
      })

      const { result } = renderHook(() => useSettlements())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.settlements).toEqual(mockSettlements)
      expect(result.current.error).toBeNull()
    })

    it('should handle an empty result', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] })

      const { result } = renderHook(() => useSettlements())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.settlements).toEqual([])
      expect(result.current.error).toBeNull()
    })

    it('should handle HTTP errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

      const { result } = renderHook(() => useSettlements())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('HTTP 500')
      expect(result.current.settlements).toEqual([])
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useSettlements())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('Network error')
      expect(result.current.settlements).toEqual([])
    })

    it('should call fetch on mount with the correct endpoint', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => [] })

      renderHook(() => useSettlements())

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/treasury/pending-settlements')
      })
    })

  })

  describe('approveSettlement', () => {
    it('should optimistically bump the approval weight, then reconcile with server response', async () => {
      const initial = [makeSettlement({ approval_weight: 1 })]
      const updated = makeSettlement({ approval_weight: 2, approvals: ['signer1'] })

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => initial })
        .mockResolvedValueOnce({ ok: true, json: async () => updated })

      const { result } = renderHook(() => useSettlements())

      await waitFor(() => {
        expect(result.current.settlements.length).toBe(1)
      })

      await act(async () => {
        await result.current.approveSettlement(1)
      })

      expect(result.current.settlements[0]).toEqual(updated)
    })

    it('should roll back the optimistic update when the request fails', async () => {
      const initial = [makeSettlement({ approval_weight: 1 })]

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => initial })
        .mockResolvedValueOnce({ ok: false, status: 409 })

      const { result } = renderHook(() => useSettlements())

      await waitFor(() => {
        expect(result.current.settlements.length).toBe(1)
      })

      let threwError = false
      try {
        await act(async () => {
          await result.current.approveSettlement(1)
        })
      } catch (e) {
        threwError = true
        expect((e as Error).message).toBe('HTTP 409')
      }

      expect(threwError).toBe(true)
      expect(result.current.settlements[0].approval_weight).toBe(1)
      expect(result.current.settlements[0]).toEqual(initial[0])
    })

    it('should only update the approved settlement, not others', async () => {
      const initial = [
        makeSettlement({ id: 1, approval_weight: 0 }),
        makeSettlement({ id: 2, approval_weight: 0 }),
      ]
      const updated = makeSettlement({ id: 1, approval_weight: 1 })

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => initial })
        .mockResolvedValueOnce({ ok: true, json: async () => updated })

      const { result } = renderHook(() => useSettlements())

      await waitFor(() => {
        expect(result.current.settlements.length).toBe(2)
      })

      await act(async () => {
        await result.current.approveSettlement(1)
      })

      expect(result.current.settlements[0].approval_weight).toBe(1)
      expect(result.current.settlements[1].approval_weight).toBe(0)
    })
  })

  describe('refresh', () => {
    it('should manually trigger a fetch', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => [makeSettlement()] })

      const { result } = renderHook(() => useSettlements())

      await waitFor(() => {
        expect(result.current.settlements.length).toBe(1)
      })

      const initialCallCount = mockFetch.mock.calls.length

      await act(async () => {
        await result.current.refresh()
      })

      expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCallCount)
      expect(result.current.settlements.length).toBe(1)
    })
  })
})
