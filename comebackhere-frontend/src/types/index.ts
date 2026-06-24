export enum InvoiceStatus {
  Pending = "Pending",
  Paid = "Paid",
  Expired = "Expired",
  Cancelled = "Cancelled",
  RefundRequested = "RefundRequested",
  Released = "Released",
}

export interface Invoice {
  id: string
  merchant: string
  payer: string
  amount_usdc: string
  gross_usdc: string
  expires_at: number
  status: InvoiceStatus
  paid_at: number | null
  metadata_hash: string | null
  payment_link_hash: string | null
}

export interface PaymentResult {
  success: boolean
  transaction_hash?: string
  error?: string
}
