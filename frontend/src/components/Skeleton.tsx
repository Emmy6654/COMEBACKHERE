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

export function SettlementDetailSkeleton() {
  return (
    <div className="settlement-detail" aria-label="Loading settlement details" role="status">
      <div className="settlement-detail__header">
        <Skeleton width="180px" height="28px" aria-label="Loading settlement ID" />
        <Skeleton width="80px" height="24px" aria-label="Loading settlement status" />
      </div>

      <div className="settlement-detail__info">
        <div className="settlement-detail__row">
          <Skeleton width="80px" height="16px" aria-label="Loading merchant label" />
          <Skeleton width="120px" height="16px" aria-label="Loading merchant address" />
        </div>
        <div className="settlement-detail__row">
          <Skeleton width="120px" height="16px" aria-label="Loading amount label" />
          <Skeleton width="80px" height="16px" aria-label="Loading amount" />
        </div>
        <div className="settlement-detail__row">
          <Skeleton width="140px" height="16px" aria-label="Loading total signer weight label" />
          <Skeleton width="40px" height="16px" aria-label="Loading total signer weight" />
        </div>
      </div>

      <div className="settlement-detail__progress-section">
        <Skeleton width="140px" height="24px" aria-label="Loading approval progress title" />
        <div className="settlement-detail__progress-visuals">
          <div className="approval-ring">
            <Skeleton width="128px" height="128px" className="approval-ring__svg" aria-label="Loading approval ring" />
          </div>
          <div className="settlement-detail__progress-details">
            <div className="approval-progress-bar">
              <Skeleton width="100%" height="24px" aria-label="Loading progress bar" />
              <Skeleton width="60px" height="16px" aria-label="Loading progress percentage" />
            </div>
            <div className="signer-approval-list">
              <Skeleton width="140px" height="18px" aria-label="Loading signer approvals title" />
              <div className="signer-approval-list__items">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="signer-approval-item">
                    <Skeleton width="16px" height="16px" aria-label="Loading approval icon" />
                    <Skeleton width="80px" height="16px" aria-label="Loading signer address" />
                    <Skeleton width="70px" height="16px" aria-label="Loading signer weight" />
                    <Skeleton width="60px" height="20px" aria-label="Loading approval badge" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
