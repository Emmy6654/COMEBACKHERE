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

const SETTLEMENT_COLS: Array<[string, string]> = [
  ["ID", "60px"],
  ["Merchant", "140px"],
  ["Amount", "100px"],
  ["Progress", "100px"],
  ["Actions", "120px"],
]

export function SettlementListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <table className="skeleton-settlement-table" aria-label="Loading settlements" role="status">
      <thead>
        <tr>
          {SETTLEMENT_COLS.map(([label]) => (
            <th key={label}>
              <Skeleton width="80px" height="14px" aria-label={`Loading ${label}`} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, row) => (
          <tr key={row}>
            {SETTLEMENT_COLS.map(([label, w]) => (
              <td key={label}>
                <Skeleton width={w} height="14px" aria-label="Loading cell" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const STAT_CARDS: Array<[string, string]> = [
  ["60%", "32px"],
  ["55%", "32px"],
  ["65%", "32px"],
]

export function DashboardStatsSkeleton() {
  return (
    <div className="skeleton-stats-grid stats-grid" aria-label="Loading dashboard statistics" role="status">
      {STAT_CARDS.map(([labelW, valueW], i) => (
        <div key={i} className="skeleton-stats-card">
          <Skeleton width={labelW} height="12px" aria-label="Loading stat label" />
          <Skeleton width={valueW} height="32px" aria-label="Loading stat value" />
        </div>
      ))}
    </div>
  )
}
