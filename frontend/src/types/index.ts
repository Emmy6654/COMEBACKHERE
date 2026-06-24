export interface Settlement {
  id: number
  merchant_address: string
  amount: string
  approvals: string[]
  approval_weight: number
  status: 'Pending' | 'Executed' | 'PartiallyExecuted' | 'OnHold' | 'Cancelled'
  hold_reason: string | null
}

export interface SignerInfo {
  address: string
  weight: number
}

export interface SettlementApprovalProps {
  signerAddress: string
  threshold: number
}
