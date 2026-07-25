export type DisputeOutcome = 'ResolvedClaimant' | 'ResolvedCounterparty'

export interface DisputeVote {
  signer: string
  vote: DisputeOutcome
  weight: number
}

export interface Dispute {
  settlement_id: number
  claimant_weight: number
  counterparty_weight: number
  resolution_weight: number
  threshold: number
  outcome: DisputeOutcome | null
  votes: DisputeVote[]
}
