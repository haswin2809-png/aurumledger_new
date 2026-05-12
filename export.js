/* ============================================================
   AurumLedger — export.js
   Export transactions / bills / goals as CSV, JSON, or PDF
   ============================================================ */

/* ---- helpers ---- */
function _fmtExportDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function _escCsv(val) {
  const s = String(val == null ? '' : val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function _downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---- CSV builder ---- */
function _txnsToCSV(txns, currency) {
  const header = ['Date', 'Description', 'Type', 'Category', 'Payment Method', 'Amount (' + currency + ')', 'Notes'];
  const rows = txns.map(t => [
    _fmtExportDate(t.date),
    t.desc,
    t.type.charAt(0).toUpperCase() + t.type.slice(1),
    t.category || '',
    t.method || '',
    (t.type === 'expense' ? '-' : '') + (parseFloat(t.amount) || 0).toFixed(2),
    t.notes || ''
  ]);
  // totals
  const totalInc = txns.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const totalExp = txns.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  rows.push([]);
  rows.push(['', 'TOTAL INCOME', '', '', '', totalInc.toFixed(2), '']);
  rows.push(['', 'TOTAL EXPENSES', '', '', '', '-' + totalExp.toFixed(2), '']);
  rows.push(['', 'NET BALANCE', '', '', '', (totalInc - totalExp).toFixed(2), '']);
  return [header, ...rows].map(r => r.map(_escCsv).join(',')).join('\r\n');
}

/* ============================================================
   PUBLIC EXPORT FUNCTIONS
   ============================================================ */

/** Export all visible transactions as CSV */
function exportTransactionsCSV(filter) {
  let txns = [...state.transactions];
  if (filter === 'income')  txns = txns.filter(t => t.type === 'income');
  if (filter === 'expense') txns = txns.filter(t => t.type === 'expense');
  if (!txns.length) { showToast('⚠', 'No transactions to export.'); return; }
  const csv = _txnsToCSV(txns, state.settings.currency);
  const suffix = filter !== 'all' ? '-' + filter : '';
  _downloadFile(csv, `AurumLedger-transactions${suffix}-${_today()}.csv`, 'text/csv;charset=utf-8;');
  showToast('✓', 'CSV exported successfully.');
}

/** Export all transactions as JSON */
function exportTransactionsJSON(filter) {
  let txns = [...state.transactions];
  if (filter === 'income')  txns = txns.filter(t => t.type === 'income');
  if (filter === 'expense') txns = txns.filter(t => t.type === 'expense');
  if (!txns.length) { showToast('⚠', 'No transactions to export.'); return; }
  const totalInc = txns.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const totalExp = txns.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const payload = {
    exported: new Date().toISOString(),
    currency: state.settings.currency,
    filter,
    summary: {
      totalTransactions: txns.length,
      totalIncome: totalInc,
      totalExpenses: totalExp,
      netBalance: totalInc - totalExp
    },
    transactions: txns
  };
  const suffix = filter !== 'all' ? '-' + filter : '';
  _downloadFile(JSON.stringify(payload, null, 2), `AurumLedger-transactions${suffix}-${_today()}.json`, 'application/json');
  showToast('✓', 'JSON exported successfully.');
}

/** Export visible transactions as a print-ready PDF (browser print dialog) */
function exportTransactionsPDF(filter) {
  let txns = [...state.transactions];
  if (filter === 'income')  txns = txns.filter(t => t.type === 'income');
  if (filter === 'expense') txns = txns.filter(t => t.type === 'expense');
  if (!txns.length) { showToast('⚠', 'No transactions to export.'); return; }
  const c = state.settings.currency;
  const totalInc = txns.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const totalExp = txns.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const rows = txns.map(t => `
    <tr>
      <td>${_fmtExportDate(t.date)}</td>
      <td>${_esc(t.desc)}${t.notes ? '<br><small>' + _esc(t.notes) + '</small>' : ''}</td>
      <td>${_esc(t.category || '—')}</td>
      <td>${_esc(t.method || '—')}</td>
      <td class="${t.type}">${t.type === 'income' ? '↑' : '↓'} ${t.type.charAt(0).toUpperCase() + t.type.slice(1)}</td>
      <td class="amount ${t.type}">${t.type === 'expense' ? '-' : ''}${c}${(parseFloat(t.amount)||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>AurumLedger — Transaction Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; }
  .header { padding: 32px 40px 20px; border-bottom: 2px solid #C6A15B; display: flex; justify-content: space-between; align-items: flex-end; }
  .logo { font-family: Georgia, serif; font-size: 22px; color: #C6A15B; font-weight: 600; }
  .report-meta { text-align: right; font-size: 11px; color: #666; }
  .summary { display: flex; gap: 24px; padding: 20px 40px; background: #fafaf8; border-bottom: 1px solid #eee; }
  .sum-box { flex: 1; }
  .sum-label { font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: #999; margin-bottom: 4px; }
  .sum-val { font-family: Georgia, serif; font-size: 18px; font-weight: 600; }
  .sum-val.inc { color: #27AE60; } .sum-val.exp { color: #C0392B; } .sum-val.net { color: #C6A15B; }
  .table-wrap { padding: 20px 40px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f5f1e8; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: #666; padding: 8px 10px; text-align: left; border-bottom: 1px solid #ddd; }
  td { padding: 9px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  tr:hover td { background: #fafaf8; }
  td.income { color: #27AE60; } td.expense { color: #C0392B; }
  td.amount { text-align: right; font-weight: 600; font-family: Georgia, serif; }
  td.amount.income { color: #27AE60; } td.amount.expense { color: #C0392B; }
  td small { color: #999; font-size: 10px; }
  .totals td { border-top: 2px solid #C6A15B; font-weight: 600; font-family: Georgia, serif; }
  .footer { padding: 20px 40px; border-top: 1px solid #eee; font-size: 10px; color: #bbb; text-align: center; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style></head><body>
<div class="header">
  <div>
    <div class="logo">⚜ AurumLedger</div>
    <div style="font-size:10px;color:#999;margin-top:4px;letter-spacing:0.1em;text-transform:uppercase">Private Wealth Dashboard</div>
  </div>
  <div class="report-meta">
    <div>Transaction Report${filter !== 'all' ? ' — ' + filter.charAt(0).toUpperCase() + filter.slice(1) : ''}</div>
    <div>Generated: ${new Date().toLocaleDateString('en-IN', {day:'2-digit',month:'long',year:'numeric'})}</div>
    <div>Account: ${_esc(state.settings.name || 'Private Account')}</div>
  </div>
</div>
<div class="summary">
  <div class="sum-box"><div class="sum-label">Total Income</div><div class="sum-val inc">${c}${totalInc.toLocaleString('en-IN',{minimumFractionDigits:2})}</div></div>
  <div class="sum-box"><div class="sum-label">Total Expenses</div><div class="sum-val exp">${c}${totalExp.toLocaleString('en-IN',{minimumFractionDigits:2})}</div></div>
  <div class="sum-box"><div class="sum-label">Net Balance</div><div class="sum-val net">${c}${(totalInc-totalExp).toLocaleString('en-IN',{minimumFractionDigits:2})}</div></div>
  <div class="sum-box"><div class="sum-label">Records</div><div class="sum-val">${txns.length}</div></div>
</div>
<div class="table-wrap">
  <table>
    <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Method</th><th>Type</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot class="totals">
      <tr><td colspan="5">Total Income</td><td class="amount income">${c}${totalInc.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
      <tr><td colspan="5">Total Expenses</td><td class="amount expense">-${c}${totalExp.toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
      <tr><td colspan="5">Net Balance</td><td class="amount" style="color:#C6A15B">${c}${(totalInc-totalExp).toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
    </tfoot>
  </table>
</div>
<div class="footer">AurumLedger — Private Wealth Dashboard · Confidential Financial Record</div>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 500);
  showToast('✓', 'PDF print dialog opened.');
}

/** Export a single month's transactions as CSV */
function exportMonthCSV(monthKey) {
  const [yr, mo] = monthKey.split('-');
  const txns = state.transactions.filter(t => {
    const d = new Date(t.date);
    return d.getFullYear() === parseInt(yr) && (d.getMonth() + 1) === parseInt(mo);
  });
  if (!txns.length) { showToast('⚠', 'No transactions for this month.'); return; }
  const csv = _txnsToCSV(txns, state.settings.currency);
  const label = new Date(parseInt(yr), parseInt(mo) - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' }).replace(' ', '-');
  _downloadFile(csv, `AurumLedger-${label}.csv`, 'text/csv;charset=utf-8;');
  showToast('✓', 'Month CSV exported.');
}

/** Export a single month's transactions as JSON */
function exportMonthJSON(monthKey) {
  const [yr, mo] = monthKey.split('-');
  const txns = state.transactions.filter(t => {
    const d = new Date(t.date);
    return d.getFullYear() === parseInt(yr) && (d.getMonth() + 1) === parseInt(mo);
  });
  if (!txns.length) { showToast('⚠', 'No transactions for this month.'); return; }
  const totalInc = txns.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const totalExp = txns.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const label = new Date(parseInt(yr), parseInt(mo) - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' }).replace(' ', '-');
  const payload = { month: label, currency: state.settings.currency, summary: { totalIncome: totalInc, totalExpenses: totalExp, net: totalInc - totalExp }, transactions: txns };
  _downloadFile(JSON.stringify(payload, null, 2), `AurumLedger-${label}.json`, 'application/json');
  showToast('✓', 'Month JSON exported.');
}

/** Export annual report as CSV */
function exportAnnualCSV() {
  const yr = parseInt(state.settings.year);
  const txns = state.transactions.filter(t => new Date(t.date).getFullYear() === yr);
  if (!txns.length) { showToast('⚠', 'No data for this year.'); return; }
  const csv = _txnsToCSV(txns, state.settings.currency);
  _downloadFile(csv, `AurumLedger-Annual-${yr}.csv`, 'text/csv;charset=utf-8;');
  showToast('✓', 'Annual CSV exported.');
}

/** Export annual report as JSON */
function exportAnnualJSON() {
  const yr = parseInt(state.settings.year);
  const txns = state.transactions.filter(t => new Date(t.date).getFullYear() === yr);
  if (!txns.length) { showToast('⚠', 'No data for this year.'); return; }
  const totalInc = txns.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const totalExp = txns.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const catMap = {};
  txns.filter(t => t.type === 'expense').forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + t.amount; });
  const payload = { year: yr, currency: state.settings.currency, summary: { totalIncome: totalInc, totalExpenses: totalExp, netSavings: totalInc - totalExp }, categoryBreakdown: catMap, transactions: txns };
  _downloadFile(JSON.stringify(payload, null, 2), `AurumLedger-Annual-${yr}.json`, 'application/json');
  showToast('✓', 'Annual JSON exported.');
}

/** Full data export (Settings page) */
function exportAllDataJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `AurumLedger-full-export-${_today()}.json`;
  a.click();
  showToast('✓', 'Full data exported.');
}

/* ---- UI helpers ---- */
function _today() { return new Date().toISOString().split('T')[0]; }
function _esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/** Toggle export dropdown visibility */
function toggleExportMenu(id) {
  const menu = document.getElementById(id);
  const allMenus = document.querySelectorAll('.export-menu');
  allMenus.forEach(m => { if (m.id !== id) m.classList.remove('open'); });
  menu.classList.toggle('open');
}

// Close export menus on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.export-dropdown')) {
    document.querySelectorAll('.export-menu').forEach(m => m.classList.remove('open'));
  }
});