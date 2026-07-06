import { useState, useMemo } from "react"

interface InvoiceMetrics {
  pending: number
  paid: number
  cancelled: number
  released: number
}

interface TokenVolume {
  token: string
  volume: string
}

interface AnalyticsData {
  invoices: InvoiceMetrics
  settledVolume: TokenVolume[]
  openDisputes: number
  complianceBlocks: number
}

const MOCK_DATA: AnalyticsData = {
  invoices: {
    pending: 24,
    paid: 156,
    cancelled: 12,
    released: 89,
  },
  settledVolume: [
    { token: "USDC", volume: "184,250.00" },
    { token: "XLM", volume: "52,100.00" },
  ],
  openDisputes: 7,
  complianceBlocks: 3,
}

function StatCard({
  title,
  value,
  variant = "default",
}: {
  title: string
  value: string | number
  variant?: "default" | "success" | "warning" | "danger" | "info"
}) {
  return (
    <div className={`analytics-stat analytics-stat--${variant}`}>
      <span className="analytics-stat__title">{title}</span>
      <span className="analytics-stat__value">{value}</span>
    </div>
  )
}

export function AdminAnalytics() {
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const data = useMemo(() => {
    return MOCK_DATA
  }, [])

  const totalInvoices =
    data.invoices.pending +
    data.invoices.paid +
    data.invoices.cancelled +
    data.invoices.released

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

      <section className="analytics-section">
        <h2>Invoice Summary</h2>
        <div className="analytics-grid">
          <StatCard title="Total Invoices" value={totalInvoices} variant="info" />
          <StatCard
            title="Pending"
            value={data.invoices.pending}
            variant="warning"
          />
          <StatCard title="Paid" value={data.invoices.paid} variant="success" />
          <StatCard
            title="Cancelled"
            value={data.invoices.cancelled}
            variant="danger"
          />
          <StatCard
            title="Released"
            value={data.invoices.released}
            variant="success"
          />
        </div>
      </section>

      <section className="analytics-section">
        <h2>Settled Volume by Token</h2>
        <table className="analytics-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Volume</th>
            </tr>
          </thead>
          <tbody>
            {data.settledVolume.map((entry) => (
              <tr key={entry.token}>
                <td>{entry.token}</td>
                <td className="analytics-table__value">{entry.volume}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="analytics-section">
        <h2>Operational Metrics</h2>
        <div className="analytics-grid analytics-grid--2col">
          <StatCard
            title="Open Disputes"
            value={data.openDisputes}
            variant="danger"
          />
          <StatCard
            title="Compliance Blocks"
            value={data.complianceBlocks}
            variant="warning"
          />
        </div>
      </section>

      <section className="analytics-section">
        <h2>Invoice Distribution</h2>
        <div className="analytics-bar-chart">
          {[
            { label: "Pending", value: data.invoices.pending, color: "#f59e0b" },
            { label: "Paid", value: data.invoices.paid, color: "#16a34a" },
            {
              label: "Cancelled",
              value: data.invoices.cancelled,
              color: "#dc2626",
            },
            { label: "Released", value: data.invoices.released, color: "#4f46e5" },
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
    </div>
  )
}
