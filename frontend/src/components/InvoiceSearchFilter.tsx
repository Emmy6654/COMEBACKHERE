import { useState, useMemo } from "react";
import { Invoice, InvoiceStatus } from "../../types";
import "./InvoiceSearchFilter.css";

const ALL_STATUSES: InvoiceStatus[] = [
  "Pending",
  "Paid",
  "Expired",
  "Cancelled",
  "RefundRequested",
  "Released",
];

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

interface Props {
  invoices: Invoice[];
}

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString();
}

export default function InvoiceSearchFilter({ invoices }: Props) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() / 1000 : null;
    const toTs = dateTo ? new Date(dateTo).getTime() / 1000 + 86400 : null;

    return invoices.filter((inv) => {
      if (q && !inv.id.toLowerCase().includes(q) && !inv.merchant.toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter && inv.status !== statusFilter) return false;
      if (fromTs && inv.created_at !== null && inv.created_at < fromTs) return false;
      if (toTs && inv.created_at !== null && inv.created_at > toTs) return false;
      return true;
    });
  }, [invoices, query, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleFilterChange = () => setPage(1);

  return (
    <div className="invoice-filter">
      <div className="invoice-filter__controls">
        <input
          className="invoice-filter__search"
          type="search"
          placeholder="Search by invoice ID or merchant address…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); handleFilterChange(); }}
          aria-label="Search invoices"
        />

        <select
          className="invoice-filter__select"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as InvoiceStatus | ""); handleFilterChange(); }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <div className="invoice-filter__date-range">
          <label className="invoice-filter__date-label">
            From
            <input
              type="date"
              className="invoice-filter__date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); handleFilterChange(); }}
            />
          </label>
          <label className="invoice-filter__date-label">
            To
            <input
              type="date"
              className="invoice-filter__date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); handleFilterChange(); }}
            />
          </label>
        </div>
      </div>

      <div className="invoice-filter__meta">
        <span className="invoice-filter__count">
          {filtered.length} invoice{filtered.length !== 1 ? "s" : ""} found
        </span>
        <label className="invoice-filter__page-size-label">
          Per page:
          <select
            className="invoice-filter__select invoice-filter__select--sm"
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value) as typeof pageSize); setPage(1); }}
            aria-label="Page size"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      {pageItems.length === 0 ? (
        <p className="invoice-filter__empty">No invoices match the current filters.</p>
      ) : (
        <table className="invoice-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Merchant</th>
              <th>Amount (USDC)</th>
              <th>Status</th>
              <th>Created</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((inv) => (
              <tr key={inv.id}>
                <td className="invoice-table__id">#{inv.id}</td>
                <td className="invoice-table__address" title={inv.merchant}>
                  {inv.merchant.slice(0, 6)}…{inv.merchant.slice(-4)}
                </td>
                <td>{inv.amount_usdc}</td>
                <td>
                  <span className={`status-badge status-badge--${inv.status.toLowerCase()}`}>
                    {inv.status}
                  </span>
                </td>
                <td>{formatDate(inv.created_at)}</td>
                <td>{formatDate(inv.expires_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="invoice-filter__pagination">
        <button
          className="pagination-btn"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          aria-label="Previous page"
        >
          ‹ Prev
        </button>
        <span className="pagination-info">
          Page {currentPage} of {totalPages}
        </span>
        <button
          className="pagination-btn"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          aria-label="Next page"
        >
          Next ›
        </button>
      </div>
    </div>
  );
}
