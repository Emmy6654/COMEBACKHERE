const API_ENDPOINT = '/api/invoices';

const STATUS_COLORS = {
  Pending: 'badge-pending',
  Paid: 'badge-paid',
  Expired: 'badge-expired',
  Cancelled: 'badge-cancelled',
  RefundRequested: 'badge-refund',
  Released: 'badge-released',
};

let invoices = [];
let sortField = 'id';
let sortAsc = true;

async function fetchInvoices() {
  try {
    const res = await fetch(API_ENDPOINT);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    invoices = await res.json();
  } catch (err) {
    console.warn('API unavailable, using demo data');
    invoices = getDemoInvoices();
  }
  render();
}

function getDemoInvoices() {
  return [
    { id: 1, merchant: 'GBR...A1', customer: 'GBR...B2', amount: '2500', token: 'USDC', status: 'Pending', created_at: 1719000000, expires_at: 1719600000 },
    { id: 2, merchant: 'GBR...A1', customer: 'GBR...C3', amount: '5000', token: 'USDC', status: 'Paid', created_at: 1718800000, expires_at: 1719400000 },
    { id: 3, merchant: 'GBR...D4', customer: 'GBR...E5', amount: '1200', token: 'XLM', status: 'Expired', created_at: 1718000000, expires_at: 1718600000 },
    { id: 4, merchant: 'GBR...F6', customer: 'GBR...G7', amount: '8000', token: 'USDC', status: 'Cancelled', created_at: 1718400000, expires_at: 1719000000 },
    { id: 5, merchant: 'GBR...A1', customer: 'GBR...H8', amount: '3200', token: 'USDC', status: 'RefundRequested', created_at: 1718900000, expires_at: 1719500000 },
    { id: 6, merchant: 'GBR...I9', customer: 'GBR...J0', amount: '1500', token: 'XLM', status: 'Released', created_at: 1718700000, expires_at: 1719300000 },
  ];
}

function formatTimestamp(ts) {
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function getStatusBadge(status) {
  const cls = STATUS_COLORS[status] || 'badge-pending';
  return `<span class="badge ${cls}">${status === 'RefundRequested' ? 'Refund Requested' : status}</span>`;
}

function render() {
  const statusFilter = document.getElementById('statusFilter').value;
  const search = document.getElementById('search').value.toLowerCase();

  let filtered = invoices.filter(inv => {
    if (statusFilter && inv.status !== statusFilter) return false;
    if (search) {
      const matchId = String(inv.id).includes(search);
      const matchMerchant = (inv.merchant || '').toLowerCase().includes(search);
      const matchCustomer = (inv.customer || '').toLowerCase().includes(search);
      if (!matchId && !matchMerchant && !matchCustomer) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    let va = a[sortField];
    let vb = b[sortField];
    if (sortField === 'id' || sortField === 'amount') {
      va = Number(va);
      vb = Number(vb);
    }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  renderSummary(filtered);
  renderTable(filtered);
  updateSortIndicators();
}

function renderSummary(filtered) {
  const counts = {};
  for (const inv of invoices) {
    counts[inv.status] = (counts[inv.status] || 0) + 1;
  }

  const total = invoices.length;
  const statuses = ['Pending', 'Paid', 'Expired', 'Cancelled', 'RefundRequested', 'Released'];
  let html = '';
  for (const status of statuses) {
    const c = counts[status] || 0;
    html += `<div class="summary-card">
      <div class="count">${c}</div>
      <div class="label">${status === 'RefundRequested' ? 'Refund Requested' : status}</div>
    </div>`;
  }
  html += `<div class="summary-card">
    <div class="count">${total}</div>
    <div class="label">Total</div>
  </div>`;
  document.getElementById('summary').innerHTML = html;
}

function renderTable(items) {
  const tbody = document.getElementById('invoiceBody');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">No invoices found</div></td></tr>';
    return;
  }

  let html = '';
  for (const inv of items) {
    html += `<tr>
      <td>${inv.id}</td>
      <td>${inv.merchant || '-'}</td>
      <td>${inv.customer || '-'}</td>
      <td>${inv.amount} ${inv.token || ''}</td>
      <td>${getStatusBadge(inv.status)}</td>
      <td>${formatTimestamp(inv.created_at)}</td>
      <td>${formatTimestamp(inv.expires_at)}</td>
    </tr>`;
  }
  tbody.innerHTML = html;
}

function updateSortIndicators() {
  document.querySelectorAll('thead th').forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    const field = th.dataset.sort;
    if (field === sortField) {
      th.classList.add(sortAsc ? 'sorted-asc' : 'sorted-desc');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  fetchInvoices();

  document.getElementById('statusFilter').addEventListener('change', render);
  document.getElementById('search').addEventListener('input', render);
  document.getElementById('refreshBtn').addEventListener('click', fetchInvoices);

  document.querySelectorAll('thead th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (field === sortField) {
        sortAsc = !sortAsc;
      } else {
        sortField = field;
        sortAsc = true;
      }
      render();
    });
  });
});
