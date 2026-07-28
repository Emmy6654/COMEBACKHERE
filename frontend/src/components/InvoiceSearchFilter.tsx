import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
// Configurable debounce interval (in milliseconds)
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Props for InvoiceSearchFilter.
 *
 * Two usage modes:
 *
 * 1. Client-side mode (backward-compatible):
 *    Pass `invoices` array. All filtering and pagination happens in the browser.
 *
 * 2. Server-side pagination mode:
 *    Pass `apiUrl` (e.g. "/invoices"). The component sends `limit`, `offset`,
 *    `status`, and `merchant_address` as query params and expects a response
 *    shaped as `{ data: Invoice[], total: number, limit: number, offset: number }`.
 */
interface PropsClientSide {
  invoices: Invoice[];
  apiUrl?: never;
}

interface PropsServerSide {
  invoices?: never;
  apiUrl: string;
}

type Props = PropsClientSide | PropsServerSide;

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString();
}

export default function InvoiceSearchFilter({ invoices, apiUrl }: Props) {
  const [inputQuery, setInputQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [page, setPage] = useState(1);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Server-side mode state
  const [serverData, setServerData] = useState<Invoice[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Debounce the search query input
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(inputQuery);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [inputQuery]);

  // Server-side fetch: triggered when apiUrl, page, pageSize, statusFilter, or
  // debouncedQuery changes.
  const fetchFromServer = useCallback(async () => {
    if (!apiUrl) return;

    const offset = (page - 1) * pageSize;
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (statusFilter) params.set("status", statusFilter);
    if (debouncedQuery.trim()) params.set("merchant_address", debouncedQuery.trim());

    setServerLoading(true);
    setServerError(null);
    try {
      const res = await fetch(`${apiUrl}?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: { data: Invoice[]; total: number } = await res.json();
      setServerData(json.data);
      setServerTotal(json.total);
    } catch (e: unknown) {
      setServerError(e instanceof Error ? e.message : "Failed to fetch invoices");
    } finally {
      setServerLoading(false);
    }
  }, [apiUrl, page, pageSize, statusFilter, debouncedQuery]);

  useEffect(() => {
    if (apiUrl) {
      fetchFromServer();
    }
  }, [apiUrl, fetchFromServer]);

  // Client-side filtering (used when `invoices` prop is provided)
  const filtered = useMemo(() => {
    if (apiUrl || !invoices) return [];
    const q = debouncedQuery.trim().toLowerCase();
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
  }, [invoices, apiUrl, debouncedQuery, statusFilter, dateFrom, dateTo]);

  // Determine which data/pagination to use
  const isServerMode = Boolean(apiUrl);
  const displayItems = isServerMode ? serverData : filtered.slice((Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize))) - 1) * pageSize, Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize))) * pageSize);
  const totalCount = isServerMode ? serverTotal : filtered.length;
  const totalPages = Math.max(1, isServerMode ? Math.ceil(serverTotal / pageSize) : Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  // Client-side paging helpers (also resets page on filter change)
  const pageItems = isServerMode ? displayItems : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleFilterChange = () => setPage(1);
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputQuery(e.target.value);
    handleFilterChange();
  };

  return (
    <div className="invoice-filter">
      <div className="invoice-filter__controls">
        <input
          className="invoice-filter__search"
          type="search"
          placeholder="Search by invoice ID or merchant address…"
          value={inputQuery}
          onChange={handleSearchChange}
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

        {/* Date range filters are only meaningful in client-side mode */}
        {!isServerMode && (
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
        )}
      </div>

      <div className="invoice-filter__meta">
        <span className="invoice-filter__count">
          {totalCount} invoice{totalCount !== 1 ? "s" : ""} found
          {isServerMode && serverLoading && " (loading…)"}
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

      {isServerMode && serverError && (
        <p className="invoice-filter__error" role="alert">{serverError}</p>
      )}

      {pageItems.length === 0 && !serverLoading ? (
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
