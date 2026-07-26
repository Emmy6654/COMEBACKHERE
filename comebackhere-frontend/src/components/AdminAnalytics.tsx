import { useState, useMemo, useEffect } from "react"

interface InvoiceMetrics {
  pending: number
  paid: number
  cancelled: number
  expired: number
  refund_requested: number
}

interface TokenVolume {
  token: string
  volume: number
}

interface AnalyticsData {
  invoices: InvoiceMetrics
  settled_volume: TokenVolume[]
  open_disputes: number
  compliance_blocks: number
  settlement_throughput: number
}

function StatCard({
  title,
  value,
  variant = "default",
  loading = false,
}: {
  title: string
  value: string | number
  variant?: "default" | "success" | "warning" | "danger" | "info"
  loading?: boolean
}) {
  return (
    <div className={`analytics-stat analytics-stat--${variant}`}>
      <span className="analytics-stat__title">{title}</span>
      <span className="analytics-stat__value">
        {loading ? <span className="stat-skeleton">...</span> : value}
      </span>
    </div>
  )
}

function PieChartSegment({
  label,
  value,
  total,
  color,
  startAngle,
}: {
  label: string
  value: number
  total: number
  color: string
  startAngle: number
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0
  const angle = (percentage / 100) * 360
  const endAngle = startAngle + angle

  // For simplicity, we'll display as bars in a grid
  return (
    <div key={label} className="analytics-pie-segment">
      <div
        className="pie-segment-indicator"
        style={{
          backgroundColor: color,
        }}
      />
      <span className="pie-segment-label">{label}</span>
      <span className="pie-segment-value">{value}</span>
      <span className="pie-segment-percent">{percentage.toFixed(1)}%</span>
    </div>
  )
}

export function AdminAnalytics() {
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:3000"

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true)
        setError(null)

        let url = `${backendUrl}/api/analytics/metrics`
        const params = new URLSearchParams()

        if (startDate) {
          const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000)
          params.append("start_date", startTimestamp.toString())
        }

        if (endDate) {
          const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000)
          params.append("end_date", endTimestamp.toString())
        }

        if (params.toString()) {
          url += `?${params.toString()}`
        }

        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Failed to fetch metrics: ${response.statusText}`)
        }

        const analyticsData: AnalyticsData = await response.json()
        setData(analyticsData)
      } catch (err) {
        console.error("Error fetching analytics data:", err)
        setError(err instanceof Error ? err.message : "Failed to load analytics data")
      } finally {
        setLoading(false)
      }
    }

    // Debounce fetch on date change
    const timer = setTimeout(() => {
      fetchMetrics()
    }, 500)

    return () => clearTimeout(timer)
  }, [startDate, endDate, backendUrl])

  const totalInvoices = useMemo(() => {
    if (!data) return 0
    return (
      data.invoices.pending +
      data.invoices.paid +
      data.invoices.cancelled +
      data.invoices.expired +
      data.invoices.refund_requested
    )
  }, [data])

  const totalSettledVolume = useMemo(() => {
    if (!data) return 0
    return data.settled_volume.reduce((sum, item) => sum + item.volume, 0)
  }, [data])

  return (
    <div className="admin-analytics">
      <h1>Admin Analytics Overview</h1>

      <div className="analytics-filters">
        <label className="analytics-filter">
          Start Date
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="analytics-filter">
          End Date
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <div className="message message--error" role="alert">
          {error}
        </div>
      )}

      {data && (
        <>
          <section className="analytics-section">
            <h2>Invoice Summary</h2>
            <div className="analytics-grid">
              <StatCard title="Total Invoices" value={totalInvoices} variant="info" loading={loading} />
              <StatCard
                title="Pending"
                value={data.invoices.pending}
                variant="warning"
                loading={loading}
              />
              <StatCard title="Paid" value={data.invoices.paid} variant="success" loading={loading} />
              <StatCard
                title="Cancelled"
                value={data.invoices.cancelled}
                variant="danger"
                loading={loading}
              />
              <StatCard
                title="Expired"
                value={data.invoices.expired}
                variant="warning"
                loading={loading}
              />
              <StatCard
                title="Refund Requested"
                value={data.invoices.refund_requested}
                variant="danger"
                loading={loading}
              />
            </div>
          </section>

          <section className="analytics-section">
            <h2>Settled Volume by Token</h2>
            <div className="analytics-volume-container">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Volume</th>
                    <th>Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {data.settled_volume.map((entry) => (
                    <tr key={entry.token}>
                      <td className="volume-token">{entry.token}</td>
                      <td className="analytics-table__value">{entry.volume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="analytics-table__percent">
                        {totalSettledVolume > 0
                          ? ((entry.volume / totalSettledVolume) * 100).toFixed(1)
                          : 0}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="volume-summary">
                <strong>Total Settled: ${totalSettledVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
            </div>
          </section>

          <section className="analytics-section">
            <h2>Operational Metrics</h2>
            <div className="analytics-grid analytics-grid--2col">
              <StatCard
                title="Open Disputes"
                value={data.open_disputes}
                variant="danger"
                loading={loading}
              />
              <StatCard
                title="Compliance Blocks"
                value={data.compliance_blocks}
                variant="warning"
                loading={loading}
              />
              <StatCard
                title="Settlement Throughput"
                value={data.settlement_throughput}
                variant="success"
                loading={loading}
              />
            </div>
          </section>

          <section className="analytics-section">
            <h2>Invoice Distribution (Pie Chart)</h2>
            <div className="analytics-pie-chart">
              {[
                { label: "Pending", value: data.invoices.pending, color: "#f59e0b" },
                { label: "Paid", value: data.invoices.paid, color: "#16a34a" },
                { label: "Cancelled", value: data.invoices.cancelled, color: "#dc2626" },
                { label: "Expired", value: data.invoices.expired, color: "#8b5cf6" },
                { label: "Refund Req.", value: data.invoices.refund_requested, color: "#ef4444" },
              ].map((segment, index) => {
                let startAngle = 0
                for (let i = 0; i < index; i++) {
                  startAngle += (([
                    data.invoices.pending,
                    data.invoices.paid,
                    data.invoices.cancelled,
                    data.invoices.expired,
                    data.invoices.refund_requested,
                  ][i] || 0) / totalInvoices) * 360
                }
                return (
                  <PieChartSegment
                    key={segment.label}
                    label={segment.label}
                    value={segment.value}
                    total={totalInvoices}
                    color={segment.color}
                    startAngle={startAngle}
                  />
                )
              })}
            </div>
          </section>

          <section className="analytics-section">
            <h2>Status Breakdown (Bar Chart)</h2>
            <div className="analytics-bar-chart">
              {[
                { label: "Pending", value: data.invoices.pending, color: "#f59e0b" },
                { label: "Paid", value: data.invoices.paid, color: "#16a34a" },
                { label: "Cancelled", value: data.invoices.cancelled, color: "#dc2626" },
                { label: "Expired", value: data.invoices.expired, color: "#8b5cf6" },
                { label: "Refund Req.", value: data.invoices.refund_requested, color: "#ef4444" },
              ].map((bar) => (
                <div key={bar.label} className="analytics-bar">
                  <span className="analytics-bar__label">{bar.label}</span>
                  <div className="analytics-bar__track">
                    <div
                      className="analytics-bar__fill"
                      style={{
                        width: `${totalInvoices > 0 ? (bar.value / totalInvoices) * 100 : 0}%`,
                        backgroundColor: bar.color,
                      }}
                    />
                  </div>
                  <span className="analytics-bar__count">{bar.value}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {loading && !data && (
        <div className="analytics-loading">
          <p>Loading analytics data...</p>
        </div>
      )}
    </div>
  )
}
