import "./Skeleton.css"

interface SkeletonProps {
  width?: string
  height?: string
  className?: string
  "aria-label"?: string
}

export function Skeleton({ width = "100%", height = "16px", className = "", "aria-label": ariaLabel }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height }}
      role="status"
      aria-label={ariaLabel ?? "Loading..."}
    />
  )
}

export function InvoiceListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-invoice-list" aria-label="Loading invoices" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-invoice-row">
          <div className="skeleton-invoice-row__header">
            <Skeleton width="120px" height="18px" aria-label="Loading invoice ID" />
            <Skeleton width="80px" height="22px" aria-label="Loading status" />
          </div>
          <div className="skeleton-invoice-row__body">
            <Skeleton width="60%" height="14px" aria-label="Loading merchant" />
            <Skeleton width="40%" height="14px" aria-label="Loading amount" />
          </div>
        </div>
      ))}
    </div>
  )
}

const SETTLEMENT_COLS = ["80px", "140px", "100px", "100px", "120px"]

export function SettlementListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <table className="skeleton-settlement-table" aria-label="Loading settlements" role="status">
      <thead>
        <tr>
          {SETTLEMENT_COLS.map((w, i) => (
            <th key={i}>
              <Skeleton width={w} height="14px" aria-label="Loading column header" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, row) => (
          <tr key={row}>
            {SETTLEMENT_COLS.map((w, col) => (
              <td key={col}>
                <Skeleton width={w} height="14px" aria-label="Loading cell" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const STAT_CARD_WIDTHS: Array<[string, string]> = [
  ["70%", "36px"],
  ["60%", "36px"],
  ["65%", "36px"],
]

export function DashboardStatsSkeleton() {
  return (
    <div className="skeleton-stats-grid stats-grid" aria-label="Loading dashboard statistics" role="status">
      {STAT_CARD_WIDTHS.map(([labelWidth, valueWidth], i) => (
        <div key={i} className="skeleton-stats-card">
          <Skeleton width={labelWidth} height="12px" aria-label="Loading stat label" />
          <Skeleton width={valueWidth} height="32px" aria-label="Loading stat value" />
        </div>
      ))}
    </div>
  )
}
