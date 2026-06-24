import type { InvoiceStatus } from "../types"

interface StatusBadgeProps {
  status: InvoiceStatus
}

const statusColors: Record<string, string> = {
  Pending: "badge badge--pending",
  Paid: "badge badge--paid",
  Expired: "badge badge--expired",
  Cancelled: "badge badge--cancelled",
  RefundRequested: "badge badge--refund-requested",
  Released: "badge badge--released",
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={statusColors[status] ?? "badge"}>{status}</span>
  )
}
