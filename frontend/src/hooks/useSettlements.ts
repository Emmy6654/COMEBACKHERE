import { useState, useEffect, useCallback } from 'react'
import { Settlement } from '../types'

const API_BASE = '/api'

export function useSettlements() {
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSettlements = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`${API_BASE}/treasury/pending-settlements`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: Settlement[] = await res.json()
      setSettlements(data)
    } catch (e: any) {
      setError(e.message || 'Failed to fetch settlements')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettlements()
    const interval = setInterval(fetchSettlements, 15_000)
    return () => clearInterval(interval)
  }, [fetchSettlements])

  const approveSettlement = useCallback(async (settlementId: number) => {
    const prev = settlements
    setSettlements(prev =>
      prev.map(s =>
        s.id === settlementId ? { ...s, approval_weight: s.approval_weight + 1 } : s,
      ),
    )
    try {
      const res = await fetch(`${API_BASE}/treasury/approve-settlement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlement_id: settlementId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const updated: Settlement = await res.json()
      setSettlements(prev =>
        prev.map(s => (s.id === settlementId ? updated : s)),
      )
    } catch (e: any) {
      setSettlements(prev)
      throw e
    }
  }, [settlements])

  return { settlements, loading, error, approveSettlement, refresh: fetchSettlements }
}
