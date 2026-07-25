import { useState, useEffect, useCallback } from 'react'
import { Dispute, DisputeOutcome } from '../types/dispute'

const API_BASE = '/api'

export function useDisputes() {
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDisputes = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${API_BASE}/treasury/disputes`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDisputes(await res.json())
    } catch (e: any) {
      setError(e.message || 'Failed to fetch disputes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDisputes()
    const interval = setInterval(fetchDisputes, 15_000)
    return () => clearInterval(interval)
  }, [fetchDisputes])

  const voteDispute = useCallback(async (settlementId: number, vote: DisputeOutcome) => {
    const res = await fetch(`${API_BASE}/treasury/vote-dispute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settlement_id: settlementId, vote }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const updated: Dispute = await res.json()
    setDisputes(prev => prev.map(d => d.settlement_id === settlementId ? updated : d))
  }, [])

  return { disputes, loading, error, voteDispute, refresh: fetchDisputes }
}
