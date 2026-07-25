/**
 * Unit tests for dashboard/app.js
 *
 * Covers data-fetching, rendering, sorting, filtering, and summary logic.
 * Uses jsdom (jest-environment-jsdom) for DOM simulation.
 *
 * The script is loaded via eval() in the global scope so that `function`
 * declarations become accessible as globals, while `let`/`const` module-scoped
 * variables remain within the eval closure but are accessible to those functions.
 */

const fs = require('fs');
const path = require('path');

// ── Helpers ─────────────────────────────────────────────────────────────────

function setupDOM() {
  document.body.innerHTML = `
    <div id="summary"></div>
    <table id="invoiceTable">
      <thead>
        <tr>
          <th data-sort="id">ID</th>
          <th data-sort="merchant">Merchant</th>
          <th data-sort="customer">Customer</th>
          <th data-sort="amount">Amount</th>
          <th data-sort="status">Status</th>
          <th data-sort="created_at">Created</th>
          <th data-sort="expires_at">Expires</th>
        </tr>
      </thead>
      <tbody id="invoiceBody"></tbody>
    </table>
    <input id="statusFilter" value="">
    <input id="search" value="">
    <button id="refreshBtn">Refresh</button>
  `;
}

/**
 * Load app.js by evaluating it in the global scope so that function
 * declarations (getDemoInvoices, render, renderTable, etc.) become
 * available on the global object.
 */
function loadAppScript() {
  const script = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8');
  // Use indirect eval so function declarations become global properties
  const indirectEval = eval;
  indirectEval(script);
}

/**
 * Populate the module-scoped `invoices` array by calling fetchInvoices()
 * which falls back to getDemoInvoices() when fetch is unavailable.
 * Must be called after loadAppScript().
 */
async function populateInvoices() {
  // Override fetch to simulate API failure → demo fallback
  global.fetch = () => Promise.reject(new Error('mock network error'));
  // Manually call fetchInvoices to populate the module-scoped `invoices` array
  await fetchInvoices();
  // Small delay for the render() inside fetchInvoices to complete
  await new Promise(r => setTimeout(r, 0));
}

// ── Test suites ─────────────────────────────────────────────────────────────

describe('getDemoInvoices()', () => {
  beforeAll(() => {
    setupDOM();
    loadAppScript();
  });

  it('returns an array of 6 demo invoices', () => {
    const invoices = getDemoInvoices();
    expect(Array.isArray(invoices)).toBe(true);
    expect(invoices).toHaveLength(6);
  });

  it('each invoice has expected shape', () => {
    const invoices = getDemoInvoices();
    for (const inv of invoices) {
      expect(inv).toHaveProperty('id');
      expect(inv).toHaveProperty('merchant');
      expect(inv).toHaveProperty('customer');
      expect(inv).toHaveProperty('amount');
      expect(inv).toHaveProperty('token');
      expect(inv).toHaveProperty('status');
      expect(inv).toHaveProperty('created_at');
      expect(inv).toHaveProperty('expires_at');
    }
  });

  it('contains at least one invoice of each known status', () => {
    const invoices = getDemoInvoices();
    const statuses = invoices.map(i => i.status);
    expect(statuses).toContain('Pending');
    expect(statuses).toContain('Paid');
    expect(statuses).toContain('Expired');
    expect(statuses).toContain('Cancelled');
    expect(statuses).toContain('RefundRequested');
    expect(statuses).toContain('Released');
  });

  it('amounts are numeric strings', () => {
    const invoices = getDemoInvoices();
    for (const inv of invoices) {
      expect(/\d+/.test(inv.amount)).toBe(true);
    }
  });
});

describe('formatTimestamp()', () => {
  beforeAll(() => {
    setupDOM();
    loadAppScript();
  });

  it('returns a short date string for a known epoch', () => {
    const result = formatTimestamp(1719000000);
    // June 21/22 2024 (timezone-dependent)
    expect(result).toMatch(/Jun 2[0-2], 2024/);
  });

  it('produces different strings for different timestamps', () => {
    const a = formatTimestamp(1719000000);
    const b = formatTimestamp(1718800000);
    expect(a).not.toBe(b);
  });
});

describe('getStatusBadge()', () => {
  beforeAll(() => {
    setupDOM();
    loadAppScript();
  });

  it('returns a span with badge-pending for unknown statuses', () => {
    const badge = getStatusBadge('Unknown');
    expect(badge).toContain('badge-pending');
    expect(badge).toContain('<span class="badge');
  });

  it('maps status to correct CSS class', () => {
    expect(getStatusBadge('Paid')).toContain('badge-paid');
    expect(getStatusBadge('Pending')).toContain('badge-pending');
    expect(getStatusBadge('Expired')).toContain('badge-expired');
    expect(getStatusBadge('Cancelled')).toContain('badge-cancelled');
    expect(getStatusBadge('RefundRequested')).toContain('badge-refund');
    expect(getStatusBadge('Released')).toContain('badge-released');
  });

  it('renders RefundRequested as "Refund Requested"', () => {
    const badge = getStatusBadge('RefundRequested');
    expect(badge).toContain('Refund Requested');
    expect(badge).not.toContain('RefundRequested');
  });
});

describe('renderTable()', () => {
  beforeAll(() => {
    setupDOM();
    loadAppScript();
  });

  beforeEach(() => {
    setupDOM();
  });

  it('populates tbody with rows for each item', () => {
    const invoices = getDemoInvoices();
    renderTable(invoices);
    const rows = document.querySelectorAll('#invoiceBody tr');
    expect(rows.length).toBe(invoices.length);
  });

  it('shows empty-state when items is empty', () => {
    renderTable([]);
    const tbody = document.getElementById('invoiceBody');
    expect(tbody.innerHTML).toContain('No invoices found');
    expect(tbody.innerHTML).toContain('empty-state');
  });

  it('each row contains the invoice id', () => {
    const invoices = getDemoInvoices();
    renderTable(invoices);
    const rows = document.querySelectorAll('#invoiceBody tr');
    for (let i = 0; i < invoices.length; i++) {
      expect(rows[i].textContent).toContain(String(invoices[i].id));
    }
  });
});

describe('renderSummary()', () => {
  beforeAll(() => {
    setupDOM();
    loadAppScript();
  });

  beforeEach(async () => {
    setupDOM();
    await populateInvoices();
  });

  it('renders a summary card for each status plus total', () => {
    render();
    const summary = document.getElementById('summary');
    expect(summary.querySelectorAll('.summary-card').length).toBe(7); // 6 statuses + total
    expect(summary.innerHTML).toContain('Total');
  });

  it('total count matches the invoice count', () => {
    const invoices = getDemoInvoices();
    render();
    const summary = document.getElementById('summary');
    const cards = summary.querySelectorAll('.summary-card');
    const totalCard = cards[cards.length - 1];
    expect(totalCard.querySelector('.count').textContent).toBe(String(invoices.length));
  });

  it('renders individual status counts correctly', () => {
    render();
    const summary = document.getElementById('summary');
    expect(summary.innerHTML).toContain('Pending');
    expect(summary.innerHTML).toContain('Paid');
    expect(summary.innerHTML).toContain('Expired');
  });
});

describe('render() filtering and sorting', () => {
  beforeAll(async () => {
    setupDOM();
    loadAppScript();
    await populateInvoices();
  });

  beforeEach(async () => {
    setupDOM();
    await populateInvoices();
  });

  it('filters by status when statusFilter is set', () => {
    const statusFilter = document.getElementById('statusFilter');
    statusFilter.value = 'Paid';
    render();
    const rows = document.querySelectorAll('#invoiceBody tr');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.textContent).toContain('Paid');
    }
  });

  it('filters by search term matching invoice id', () => {
    const invoices = getDemoInvoices();
    const firstId = String(invoices[0].id);
    const search = document.getElementById('search');
    search.value = firstId;
    render();
    const rows = document.querySelectorAll('#invoiceBody tr');
    expect(rows.length).toBeGreaterThan(0);
    // All visible rows should contain the search term
    for (const row of rows) {
      expect(row.textContent).toContain(firstId);
    }
  });

  it('shows empty state when no invoices match filter', () => {
    const statusFilter = document.getElementById('statusFilter');
    statusFilter.value = 'Paid';
    const search = document.getElementById('search');
    search.value = 'ZZZZNONEXISTENT';
    render();
    const tbody = document.getElementById('invoiceBody');
    expect(tbody.innerHTML).toContain('No invoices found');
  });
});

describe('updateSortIndicators()', () => {
  beforeAll(() => {
    setupDOM();
    loadAppScript();
  });

  beforeEach(() => {
    setupDOM();
  });

  it('adds sorted-asc or sorted-desc to the active sort column after render', () => {
    // render() calls updateSortIndicators internally
    render();
    const sortedHeaders = document.querySelectorAll('.sorted-asc, .sorted-desc');
    // At least one header should have a sort indicator
    expect(sortedHeaders.length).toBeGreaterThanOrEqual(1);
  });
});

describe('fetchInvoices() error handling', () => {
  it('falls back to demo data when fetch fails and renders table', async () => {
    setupDOM();
    loadAppScript();
    await populateInvoices();

    const tbody = document.getElementById('invoiceBody');
    expect(tbody.innerHTML).not.toBe('');
    expect(tbody.querySelectorAll('tr').length).toBeGreaterThan(0);
  });

  it('populates summary cards on fallback', async () => {
    setupDOM();
    loadAppScript();
    await populateInvoices();

    const summary = document.getElementById('summary');
    expect(summary.querySelectorAll('.summary-card').length).toBe(7);
  });
});
