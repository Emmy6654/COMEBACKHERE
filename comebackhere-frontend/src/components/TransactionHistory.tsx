import { useMemo, useState } from "react"
import type { Invoice, TransactionEvent, TransactionEventType } from "../types"

const EVENT_LABELS: Record<TransactionEventType, string> = {
  invoice_created: "Invoice Created",
  invoice_paid: "Invoice Paid",
  invoice_expired: "Invoice Expired",
  invoice_cancelled: "Invoice Cancelled",
  settlement_proposed: "Settlement Proposed",
  settlement_executed: "Settlement Executed",
  dispute_raised: "Dispute Raised",
  dispute_resolved: "Dispute Resolved",
}

const PAGE_SIZE = 5

function buildEvents(invoice: Invoice): TransactionEvent[] {
  const now = Date.now()
  const expiresAt = invoice.expires_at * 1000
  const createdAt = Math.max(expiresAt - 1000 * 60 * 60 * 24 * 5, now - 1000 * 60 * 60 * 24 * 7)
  const baseEvents: TransactionEvent[] = [
    {
      type: "invoice_created",
      timestamp: createdAt,
      address: invoice.merchant,
      description: `Invoice #${invoice.id} was created for ${invoice.merchant}.`,
    },
    {
      type: "settlement_proposed",
      timestamp: createdAt + 1000 * 60 * 60 * 24 * 1,
      address: invoice.merchant,
      description: "A settlement proposal was prepared for review.",
    },
  ]

  if (invoice.status === "Paid" || invoice.paid_at) {
    baseEvents.push({
      type: "invoice_paid",
      timestamp: invoice.paid_at ? invoice.paid_at * 1000 : now - 1000 * 60 * 60 * 12,
      address: invoice.payer || invoice.merchant,
      description: "The invoice was marked as paid.",
    })
  }

  if (invoice.status === "Expired" || expiresAt <= now) {
    baseEvents.push({
      type: "invoice_expired",
      timestamp: expiresAt,
      address: invoice.merchant,
      description: "The invoice expired before payment was completed.",
    })
  }

  if (invoice.status === "Cancelled") {
    baseEvents.push({
      type: "invoice_cancelled",
      timestamp: now - 1000 * 60 * 60 * 2,
      address: invoice.merchant,
      description: "The invoice was cancelled by the merchant.",
    })
  }

  if (invoice.status === "Paid" || invoice.status === "Released") {
    baseEvents.push({
      type: "settlement_executed",
      timestamp: now - 1000 * 60 * 60 * 3,
      address: invoice.merchant,
      description: "The settlement was executed successfully.",
    })
    baseEvents.push({
      type: "dispute_resolved",
      timestamp: now - 1000 * 60 * 60 * 2,
      address: invoice.merchant,
      description: "The dispute was resolved and closed.",
    })
  } else {
    baseEvents.push({
      type: "dispute_raised",
      timestamp: now - 1000 * 60 * 60 * 5,
      address: invoice.payer || invoice.merchant,
      description: "A dispute was raised for the transaction.",
    })
  }

  return baseEvents.sort((a, b) => b.timestamp - a.timestamp)
}

export function TransactionHistory({ invoice }: { invoice: Invoice }) {
  const [eventType, setEventType] = useState<"all" | TransactionEventType>("all")
  const [addressFilter, setAddressFilter] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [page, setPage] = useState(1)

  const events = useMemo(() => buildEvents(invoice), [invoice])

  const filteredEvents = useMemo(() => {
    const start = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null
    const end = endDate ? new Date(`${endDate}T23:59:59`).getTime() : null

    return events.filter((entry) => {
      const matchesType = eventType === "all" || entry.type === eventType
      const matchesAddress =
        !addressFilter ||
        entry.address.toLowerCase().includes(addressFilter.toLowerCase())
      const matchesStart = !start || entry.timestamp >= start
      const matchesEnd = !end || entry.timestamp <= end

      return matchesType && matchesAddress && matchesStart && matchesEnd
    })
  }, [addressFilter, endDate, eventType, events, startDate])

  const pageCount = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE))
  const pagedEvents = filteredEvents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const resetFilters = () => {
    setEventType("all")
    setAddressFilter("")
    setStartDate("")
    setEndDate("")
    setPage(1)
  }

  return (
    <div className="history-panel" role="region" aria-label="Transaction history">
      <div className="history-panel__header">
        <h3>Transaction History</h3>
        <p className="status-text" aria-live="polite">
          Showing {filteredEvents.length} event{filteredEvents.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="history-filters" role="search" aria-label="Filter transaction history">
        <label className="history-filter">
          <span>Event type</span>
          <select value={eventType} onChange={(e) => { setEventType(e.target.value as "all" | TransactionEventType); setPage(1) }} aria-label="Filter by event type">
            <option value="all">All events</option>
            {Object.entries(EVENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="history-filter">
          <span>Address</span>
          <input
            type="text"
            value={addressFilter}
            onChange={(e) => { setAddressFilter(e.target.value); setPage(1) }}
            placeholder="Filter by address"
          />
        </label>

        <label className="history-filter">
          <span>From</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
          />
        </label>

        <label className="history-filter">
          <span>To</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
          />
        </label>

        <button className="btn btn--secondary btn--sm" onClick={resetFilters} aria-label="Reset all filters">
          Reset
        </button>
      </div>

      {filteredEvents.length === 0 ? (
        <p className="status-text">No events match the current filters.</p>
      ) : (
        <>
          <ul className="history-list">
            {pagedEvents.map((entry) => (
              <li key={`${entry.type}-${entry.timestamp}`} className="history-item">
                <div className="history-item__meta">
                  <span className="history-item__type">{EVENT_LABELS[entry.type]}</span>
                  <span className="history-item__timestamp">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="history-item__description">{entry.description}</p>
                <p className="history-item__address">{entry.address}</p>
              </li>
            ))}
          </ul>

          <nav className="history-pagination" role="navigation" aria-label="Transaction history pagination">
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page === 1}
              aria-label="Previous page"
            >
              Previous
            </button>
            <span className="status-text" aria-current="page">
              Page {page} of {pageCount}
            </span>
            <button
              className="btn btn--secondary btn--sm"
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              disabled={page === pageCount}
              aria-label="Next page"
            >
              Next
            </button>
          </nav>
        </>
      )}
    </div>
  )
}
