import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useSettlements } from '../../hooks/useSettlements'
import { useSigners } from '../../hooks/useSigners'
import SettlementDetail from './SettlementDetail'

const THRESHOLD = Number(import.meta.env.VITE_THRESHOLD ?? 2)

export default function SettlementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { settlements, loading: settLoading, error: settError } = useSettlements()
  const { signers, loading: sigLoading } = useSigners()

  const settlement = useMemo(
    () => settlements.find(s => s.id === Number(id)),
    [settlements, id],
  )

  if (settLoading || sigLoading) return <p>Loading...</p>
  if (settError) return <p style={{ color: 'red' }}>Error: {settError}</p>
  if (!settlement) return <p>Settlement #{id} not found.</p>

  return <SettlementDetail settlement={settlement} threshold={THRESHOLD} signers={signers} />
}
