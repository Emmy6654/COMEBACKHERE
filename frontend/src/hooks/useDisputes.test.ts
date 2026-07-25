import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useDisputes } from './useDisputes'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('useDisputes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockClear()
  })

  describe('fetchDisputes', () => {
    it('should fetch disputes successfully', async () => {
      const mockDisputes = [
        {
          settlement_id: 1,
          claimant_weight: 50,
          counterparty_weight: 30,
          resolution_weight: 60,
          threshold: 100,
          outcome: null,
          votes: [],
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockDisputes,
      })

      const { result } = renderHook(() => useDisputes())

      expect(result.current.loading).toBe(true)

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.disputes).toEqual(mockDisputes)
      expect(result.current.error).toBeNull()
    })

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const { result } = renderHook(() => useDisputes())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('HTTP 500')
      expect(result.current.disputes).toEqual([])
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { result } = renderHook(() => useDisputes())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('Network error')
      expect(result.current.disputes).toEqual([])
    })

    it('should call fetch on mount', async () => {
      const mockDisputes: any[] = []

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockDisputes,
      })

      renderHook(() => useDisputes())

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/treasury/disputes')
      })
    })
  })

  describe('voteDispute', () => {
    it('should vote on dispute successfully', async () => {
      const mockDisputes = [
        {
          settlement_id: 1,
          claimant_weight: 50,
          counterparty_weight: 30,
          resolution_weight: 60,
          threshold: 100,
          outcome: null,
          votes: [],
        },
      ]

      const updatedDispute = {
        settlement_id: 1,
        claimant_weight: 50,
        counterparty_weight: 30,
        resolution_weight: 110,
        threshold: 100,
        outcome: 'ResolvedClaimant' as const,
        votes: [
          {
            signer: 'test-signer',
            vote: 'ResolvedClaimant' as const,
            weight: 50,
          },
        ],
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDisputes,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => updatedDispute,
        })

      const { result } = renderHook(() => useDisputes())

      await waitFor(() => {
        expect(result.current.disputes.length).toBe(1)
      })

      await act(async () => {
        await result.current.voteDispute(1, 'ResolvedClaimant')
      })

      expect(result.current.disputes[0].outcome).toBe('ResolvedClaimant')
      expect(result.current.disputes[0].resolution_weight).toBe(110)
      expect(result.current.disputes[0].votes.length).toBe(1)
    })

    it('should handle rejected vote from backend', async () => {
      const mockDisputes = [
        {
          settlement_id: 1,
          claimant_weight: 50,
          counterparty_weight: 30,
          resolution_weight: 60,
          threshold: 100,
          outcome: null,
          votes: [],
        },
      ]

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDisputes,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
        })

      const { result } = renderHook(() => useDisputes())

      await waitFor(() => {
        expect(result.current.disputes.length).toBe(1)
      })

      let threwError = false
      try {
        await act(async () => {
          await result.current.voteDispute(1, 'ResolvedClaimant')
        })
      } catch (e) {
        threwError = true
        expect((e as Error).message).toBe('HTTP 409')
      }

      expect(threwError).toBe(true)
    })

    it('should handle duplicate vote errors', async () => {
      const mockDisputes: any[] = []

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDisputes,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
        })

      const { result } = renderHook(() => useDisputes())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let threwError = false
      try {
        await act(async () => {
          await result.current.voteDispute(1, 'ResolvedClaimant')
        })
      } catch (e) {
        threwError = true
        expect((e as Error).message).toBe('HTTP 409')
      }

      expect(threwError).toBe(true)
    })

    it('should update weight tally after successful vote', async () => {
      const mockDisputes = [
        {
          settlement_id: 1,
          claimant_weight: 0,
          counterparty_weight: 0,
          resolution_weight: 0,
          threshold: 100,
          outcome: null,
          votes: [],
        },
      ]

      const updatedDispute = {
        ...mockDisputes[0],
        claimant_weight: 50,
        resolution_weight: 50,
        votes: [
          {
            signer: 'signer1',
            vote: 'ResolvedClaimant' as const,
            weight: 50,
          },
        ],
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDisputes,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => updatedDispute,
        })

      const { result } = renderHook(() => useDisputes())

      await waitFor(() => {
        expect(result.current.disputes.length).toBe(1)
      })

      await act(async () => {
        await result.current.voteDispute(1, 'ResolvedClaimant')
      })

      expect(result.current.disputes[0].claimant_weight).toBe(50)
      expect(result.current.disputes[0].resolution_weight).toBe(50)
      expect(result.current.disputes[0].votes[0].weight).toBe(50)
    })

    it('should only update the voted dispute, not others', async () => {
      const mockDisputes = [
        {
          settlement_id: 1,
          claimant_weight: 0,
          counterparty_weight: 0,
          resolution_weight: 0,
          threshold: 100,
          outcome: null,
          votes: [],
        },
        {
          settlement_id: 2,
          claimant_weight: 0,
          counterparty_weight: 0,
          resolution_weight: 0,
          threshold: 100,
          outcome: null,
          votes: [],
        },
      ]

      const updatedDispute = {
        ...mockDisputes[0],
        resolution_weight: 50,
        votes: [
          {
            signer: 'signer1',
            vote: 'ResolvedClaimant' as const,
            weight: 50,
          },
        ],
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDisputes,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => updatedDispute,
        })

      const { result } = renderHook(() => useDisputes())

      await waitFor(() => {
        expect(result.current.disputes.length).toBe(2)
      })

      await act(async () => {
        await result.current.voteDispute(1, 'ResolvedClaimant')
      })

      expect(result.current.disputes[0].resolution_weight).toBe(50)
      expect(result.current.disputes[1].resolution_weight).toBe(0)
    })
  })

  describe('refresh', () => {
    it('should manually trigger a fetch', async () => {
      const mockDisputes = [
        {
          settlement_id: 1,
          claimant_weight: 50,
          counterparty_weight: 30,
          resolution_weight: 60,
          threshold: 100,
          outcome: null,
          votes: [],
        },
      ]

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockDisputes,
      })

      const { result } = renderHook(() => useDisputes())

      await waitFor(() => {
        expect(result.current.disputes.length).toBe(1)
      })

      const initialCallCount = mockFetch.mock.calls.length

      await act(async () => {
        await result.current.refresh()
      })

      expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCallCount)
      expect(result.current.disputes).toEqual(mockDisputes)
    })
  })
})
