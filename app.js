/* ============================================================
   AurumLedger — app.js
   Main application logic.
   Features added:
     1. Export (CSV / PDF / JSON) via export.js
     2. Flexible EMI/Bill due dates (date + recurrence)
     3. Smart bill status auto-calc + Mark as Paid button
     4. Auth guard (handled by db.js / login.html)
     5. Cloud DB (handled by db.js)
   ============================================================ */

/* ===== STATE ===== */
window.state = {
  transactions: [],
  bills: [],
  goals: [],
  settings: { currency: '₹', year: new Date().getFullYear(), name: '', categories: [] }
};

const EXPENSE_CATS = ['Food & Dining','Shopping','Transport','Housing','Healthcare','Education','Entertainment','Utilities','Travel','Personal Care','Insurance','Investment','Other'];
const INCOME_CATS  = ['Salary','Freelance','Business','Investment Returns','Rental Income','Gift','Bonus','Other'];
let currentTxnType = 'income';
let txnFilter      = 'all';
let charts         = {};

const RECURRENCE_LABELS = {
  'once':      'One-time',
  'weekly':    'Weekly',
  'monthly':   'Monthly',
  'bimonthly': 'Every 2 Months',
  'quarterly': 'Quarterly (3M)',
  'halfyear':  'Half-Yearly (6M)',
  'annual':    'Annually (1Y)'
};

/* ===== SAVE / LOAD (bridged to db.js) ===== */
function saveState() {
  if (typeof saveStateToDb === 'function') {
    saveStateToDb();
  } else {
    // Fallback to localStorage during dev / before Firebase init
    try { localStorage.setItem('aurum_state', JSON.stringify(state)); } catch(e) {}
  }
}

function loadState() {
  try {
    const saved = localStorage.getItem('aurum_state');
    if (saved) state = JSON.parse(saved);
  } catch(e) {}
}

/* ===== APP BOOT =====
   Called by db.js after auth + first Firestore load,
   OR directly on init() if running without Firebase. */
window.appBoot = function appBoot() {
  setDate();
  updateSidebarYear();
  populateCategories();
  renderAll();
  const yr  = state.settings.year;
  const cur = state.settings.currency;
  document.getElementById('settingCurrency').value = cur;
  document.getElementById('settingYear').value     = yr;
  document.getElementById('settingName').value     = state.settings.name || '';
  renderCustomCats();
  document.getElementById('txnDate').value = new Date().toISOString().split('T')[0];
}

/* ===== INIT ===== */
function init() {
  // db.js (ES module) always loads after plain scripts but Firebase auth is async.
  // Give db.js 300ms to mark itself loaded; if not, fall back to localStorage mode.
  setTimeout(function() {
    if (!window._dbJsLoaded) {
      loadState();
      appBoot();
      const overlay = document.getElementById('loadingOverlay');
      if (overlay) { overlay.classList.add('fade-out'); setTimeout(() => overlay.remove(), 600); }
    }
    // If window._dbJsLoaded is true, db.js onAuthStateChanged() calls appBoot() after auth.
  }, 300);
}

function setDate() {
  const d = new Date();
  document.getElementById('topbarDate').textContent =
    d.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

window.updateSidebarYear = function updateSidebarYear() {
  document.getElementById('sidebarYear').textContent = state.settings.year;
  document.getElementById('reportYear').textContent  = state.settings.year;
}

/* ===== NAVIGATION ===== */
const pageTitles = {
  dashboard:    ['Dashboard',      'Your financial overview at a glance'],
  transactions: ['Transactions',   'All income and expense records'],
  monthly:      ['Monthly Records','Month-wise financial breakdown'],
  bills:        ['EMI & Bills',    'Recurring payments and reminders'],
  goals:        ['Savings Goals',  'Track your savings milestones'],
  analytics:    ['Analytics',      'Visual insights into your finances'],
  annual:       ['Annual Report',  'Year-end financial summary'],
  settings:     ['Settings',       'Preferences and customization']
};

function navigate(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  const [title, sub] = pageTitles[page] || ['', ''];
  document.getElementById('pageTitle').textContent    = title;
  document.getElementById('pageSubtitle').textContent = sub;
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.remove('open');
  if (page === 'analytics') renderAnalytics();
  if (page === 'annual')    renderAnnual();
  if (page === 'monthly')   renderMonthly();
  if (page === 'dashboard') renderDashboard();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('mobile-open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}

/* ===== CURRENCY ===== */
function fmt(amount) {
  const c = state.settings.currency;
  const num = parseFloat(amount) || 0;
  return c + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ===== CATEGORIES ===== */
window.populateCategories = function populateCategories() {
  const sel = document.getElementById('txnCategory');
  const allCats = currentTxnType === 'income' ? INCOME_CATS : EXPENSE_CATS;
  const custom  = state.settings.categories || [];
  sel.innerHTML = '<option value="">Select category</option>';
  [...allCats, ...custom].forEach(c => { sel.innerHTML += `<option>${c}</option>`; });
}

/* ===== TXN MODAL ===== */
function openTxnModal() {
  document.getElementById('txnModal').classList.add('open');
  document.getElementById('txnDate').value    = new Date().toISOString().split('T')[0];
  document.getElementById('txnAmount').value  = '';
  document.getElementById('txnDesc').value    = '';
  document.getElementById('txnNotes').value   = '';
  document.getElementById('txnCategory').value= '';
  document.getElementById('txnMethod').value  = '';
  setTxnType('income');
}
function closeTxnModal() { document.getElementById('txnModal').classList.remove('open'); }

function setTxnType(type) {
  currentTxnType = type;
  document.getElementById('typeIncome').className  = 'type-btn' + (type === 'income'  ? ' active-income'  : '');
  document.getElementById('typeExpense').className = 'type-btn' + (type === 'expense' ? ' active-expense' : '');
  populateCategories();
}

function saveTxn() {
  const amount = parseFloat(document.getElementById('txnAmount').value);
  const date   = document.getElementById('txnDate').value;
  const desc   = document.getElementById('txnDesc').value.trim();
  if (!amount || amount <= 0) { showToast('⚠', 'Please enter a valid amount.'); return; }
  if (!date)                  { showToast('⚠', 'Please select a date.'); return; }
  if (!desc)                  { showToast('⚠', 'Please add a description.'); return; }
  const txn = {
    id:       Date.now(),
    type:     currentTxnType,
    amount,   date, desc,
    category: document.getElementById('txnCategory').value || 'Uncategorized',
    method:   document.getElementById('txnMethod').value   || '',
    notes:    document.getElementById('txnNotes').value.trim()
  };
  state.transactions.unshift(txn);
  saveState();
  closeTxnModal();
  renderAll();
  showToast('✓', 'Transaction recorded successfully.');
}

/* ===== BILL MODAL =====
   Feature 2: replaced dueDay (number) with dueDate (date) + recurrence (select)
   Feature 3: removed manual status select — status is auto-calculated
*/
function openBillModal() {
  const modal = document.getElementById('billModal');
  modal.classList.add('open');
  // Reset fields
  document.getElementById('billName').value            = '';
  document.getElementById('billAmount').value          = '';
  document.getElementById('billDueDate').value         = '';
  document.getElementById('billRecurrence').value      = 'monthly';
  document.getElementById('billTotalInstallments').value = '';
  document.getElementById('billCategory').value        = 'Rent';
  document.getElementById('billNotes').value           = '';
  _updateInstallmentVisibility();
}
function closeBillModal() { document.getElementById('billModal').classList.remove('open'); }

function saveBill() {
  const name       = document.getElementById('billName').value.trim();
  const amount     = parseFloat(document.getElementById('billAmount').value);
  const dueDate    = document.getElementById('billDueDate').value;
  const recurrence = document.getElementById('billRecurrence').value;
  const category   = document.getElementById('billCategory').value;
  const notes      = document.getElementById('billNotes').value.trim();
  const totalInst  = parseInt(document.getElementById('billTotalInstallments').value) || 0;

  if (!name)               { showToast('⚠', 'Please enter a bill name.'); return; }
  if (!amount || amount<=0){ showToast('⚠', 'Please enter a valid amount.'); return; }
  if (!dueDate)            { showToast('⚠', 'Please select a due date.'); return; }

  const bill = {
    id: Date.now(),
    name, amount, dueDate, recurrence, category, notes,
    paid: false,
    paidDate: null,
    paymentHistory: [],
    totalInstallments: recurrence !== 'once' && totalInst > 0 ? totalInst : 0,
    installmentsPaid: 0
  };
  state.bills.push(bill);
  saveState();
  closeBillModal();
  renderBills();
  renderDashboard();
  showToast('✓', 'Bill added successfully.');
}

/* Show/hide the total installments field based on recurrence */
function _updateInstallmentVisibility() {
  const rec  = document.getElementById('billRecurrence').value;
  const wrap = document.getElementById('billInstallmentsWrap');
  if (wrap) wrap.style.display = rec === 'once' ? 'none' : 'block';
}

/* ===== GOAL MODAL ===== */
function openGoalModal() { document.getElementById('goalModal').classList.add('open'); }
function closeGoalModal() { document.getElementById('goalModal').classList.remove('open'); }

function saveGoal() {
  const name   = document.getElementById('goalName').value.trim();
  const target = parseFloat(document.getElementById('goalTarget').value);
  const saved  = parseFloat(document.getElementById('goalSaved').value) || 0;
  if (!name)              { showToast('⚠', 'Please enter a goal name.'); return; }
  if (!target || target<=0){ showToast('⚠', 'Please enter a target amount.'); return; }
  const goal = {
    id: Date.now(), name, target, saved,
    date: document.getElementById('goalDate').value,
    desc: document.getElementById('goalDesc').value.trim()
  };
  state.goals.push(goal);
  saveState();
  closeGoalModal();
  renderGoals();
  showToast('✓', 'Savings goal created.');
}

function updateGoalProgress() {
  const id    = parseInt(document.getElementById('updateGoalId').value);
  const saved = parseFloat(document.getElementById('updateGoalSaved').value);
  if (isNaN(saved) || saved < 0) { showToast('⚠', 'Please enter a valid amount.'); return; }
  const goal = state.goals.find(g => g.id === id);
  if (goal) { goal.saved = saved; saveState(); renderGoals(); showToast('✓', 'Goal updated.'); }
  document.getElementById('updateGoalModal').classList.remove('open');
}

function openUpdateGoal(id) {
  const goal = state.goals.find(g => g.id === id);
  if (!goal) return;
  document.getElementById('updateGoalId').value    = id;
  document.getElementById('updateGoalSaved').value = goal.saved;
  document.getElementById('updateGoalModal').classList.add('open');
}

/* ===== DELETE ACTIONS ===== */
function deleteGoal(id) {
  state.goals = state.goals.filter(g => g.id !== id);
  saveState(); renderGoals(); showToast('✓', 'Goal removed.');
}

function deleteTxn(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveState(); renderAll(); showToast('✓', 'Transaction deleted.');
}

function deleteBill(id) {
  state.bills = state.bills.filter(b => b.id !== id);
  saveState(); renderBills(); renderDashboard(); showToast('✓', 'Bill removed.');
}

/* ===== BILL PAYMENT (Feature 3) =====
   Toggle paid status and auto-advance due date for recurring bills */
/* Open the payment confirmation modal */
function markBillPaid(id) {
  const bill = state.bills.find(b => b.id === id);
  if (!bill) return;
  document.getElementById('payBillId').value        = id;
  document.getElementById('payBillName').textContent = bill.name;
  document.getElementById('payBillAmt').textContent  = fmt(bill.amount);
  document.getElementById('payBillDate').value       = new Date().toISOString().split('T')[0];
  document.getElementById('payBillMethod').value     = '';
  document.getElementById('payBillNotes').value      = '';
  document.getElementById('payBillModal').classList.add('open');
}

function closePayBillModal() {
  document.getElementById('payBillModal').classList.remove('open');
}

/* Confirm payment from modal */
function confirmBillPayment() {
  const id     = parseInt(document.getElementById('payBillId').value);
  const date   = document.getElementById('payBillDate').value;
  const method = document.getElementById('payBillMethod').value.trim();
  const notes  = document.getElementById('payBillNotes').value.trim();
  const bill   = state.bills.find(b => b.id === id);
  if (!bill) return;
  if (!date) { showToast('⚠', 'Please select a payment date.'); return; }

  bill.paid     = true;
  bill.paidDate = date;
  if (!bill.paymentHistory) bill.paymentHistory = [];
  bill.paymentHistory.push({ date, amount: bill.amount, method, notes });
  if (bill.totalInstallments > 0) {
    bill.installmentsPaid = (bill.installmentsPaid || 0) + 1;
    // If all installments done, mark as one-time so it doesn't recur
    if (bill.installmentsPaid >= bill.totalInstallments) {
      bill.recurrence = 'once';
    }
  }
  saveState();
  closePayBillModal();
  renderBills();
  renderDashboard();
  showToast('✓', `"${bill.name}" marked as paid on ${fmtDate(date)}.`);
}

function undoBillPaid(id) {
  const bill = state.bills.find(b => b.id === id);
  if (!bill) return;
  // Remove last payment history entry
  if (bill.paymentHistory && bill.paymentHistory.length) bill.paymentHistory.pop();
  if (bill.installmentsPaid > 0) bill.installmentsPaid--;
  bill.paid     = false;
  bill.paidDate = null;
  saveState(); renderBills(); renderDashboard();
  showToast('✓', 'Payment undone.');
}

/* Feature 3: Auto-advance recurring bill to next cycle */
function _advanceRecurringBills() {
  const today = new Date(); today.setHours(0,0,0,0);
  state.bills.forEach(bill => {
    if (!bill.paid || bill.recurrence === 'once') return;
    const paidOn  = bill.paidDate ? new Date(bill.paidDate + 'T00:00:00') : null;
    const nextDue = _nextDueDate(bill.dueDate, bill.recurrence);
    if (nextDue && paidOn) {
      const paidCycleEnd = new Date(nextDue); // next due is already past paid date
      if (today >= paidCycleEnd) {
        // New cycle started — reset paid flag, advance due date
        bill.paid     = false;
        bill.paidDate = null;
        bill.dueDate  = nextDue.toISOString().split('T')[0];
      }
    }
  });
}

function _nextDueDate(dueDateStr, recurrence) {
  if (!dueDateStr) return null;
  const d = new Date(dueDateStr + 'T00:00:00');
  switch (recurrence) {
    case 'weekly':    d.setDate(d.getDate() + 7);   break;
    case 'monthly':   d.setMonth(d.getMonth() + 1); break;
    case 'bimonthly': d.setMonth(d.getMonth() + 2); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'halfyear':  d.setMonth(d.getMonth() + 6); break;
    case 'annual':    d.setFullYear(d.getFullYear() + 1); break;
    default: return null;
  }
  return d;
}

/* Feature 3: Auto-calculate bill status from due date */
function _calcBillStatus(bill) {
  if (bill.paid) return { label: 'Paid', cls: 'status-paid' };
  if (!bill.dueDate) return { label: 'Upcoming', cls: 'status-upcoming' };
  const today  = new Date(); today.setHours(0,0,0,0);
  const due    = new Date(bill.dueDate + 'T00:00:00');
  const diffMs = due - today;
  const diffD  = Math.ceil(diffMs / 86400000);
  if (diffD < 0)       return { label: `Overdue by ${Math.abs(diffD)} day${Math.abs(diffD)===1?'':'s'}`, cls: 'status-overdue' };
  if (diffD === 0)     return { label: 'Due Today!', cls: 'status-overdue' };
  if (diffD <= 3)      return { label: `Due in ${diffD} day${diffD===1?'':'s'}`, cls: 'status-due-soon' };
  if (diffD <= 7)      return { label: `Due in ${diffD} days`, cls: 'status-due-soon' };
  return { label: `Due ${_fmtDateShort(bill.dueDate)}`, cls: 'status-upcoming' };
}

/* ===== RENDER ALL ===== */
window.renderAll = function renderAll() {
  _advanceRecurringBills();
  renderDashboard();
  renderTxnTable(txnFilter);
  renderBills();
  renderGoals();
}

/* ===== DASHBOARD ===== */
function renderDashboard() {
  const now = new Date();
  const mo  = now.getMonth(), yr = now.getFullYear();
  const thisMonth   = state.transactions.filter(t => { const d = new Date(t.date); return d.getMonth()===mo && d.getFullYear()===yr; });
  const monthIncome = thisMonth.filter(t => t.type==='income').reduce((a,t)=>a+t.amount, 0);
  const monthExp    = thisMonth.filter(t => t.type==='expense').reduce((a,t)=>a+t.amount, 0);
  const allIncome   = state.transactions.filter(t=>t.type==='income').reduce((a,t)=>a+t.amount, 0);
  const allExpense  = state.transactions.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount, 0);
  const balance     = allIncome - allExpense;
  const savings     = monthIncome - monthExp;

  document.getElementById('dashBalance').textContent   = state.transactions.length ? fmt(balance) : '—';
  document.getElementById('dashIncome').textContent    = monthIncome > 0 ? fmt(monthIncome) : '—';
  document.getElementById('dashExpense').textContent   = monthExp    > 0 ? fmt(monthExp)    : '—';
  document.getElementById('dashSavings').textContent   = thisMonth.length ? fmt(savings) : '—';
  document.getElementById('dashSavings').className     = 'stat-val ' + (savings >= 0 ? 'green' : 'red');
  document.getElementById('dashBalanceSub').textContent= state.transactions.length ? `Across ${state.transactions.length} records` : 'No transactions yet';
  document.getElementById('dashIncomeSub').textContent = now.toLocaleString('en', { month: 'long' });
  document.getElementById('dashExpenseSub').textContent= now.toLocaleString('en', { month: 'long' });
  document.getElementById('dashSavingsSub').textContent= savings >= 0 ? 'On track' : 'Over budget';

  // Recent transactions
  const recent = state.transactions.slice(0, 6);
  const wrap   = document.getElementById('recentTxns');
  wrap.innerHTML = recent.length
    ? buildTxnTable(recent, false)
    : `<div class="empty-state"><div class="empty-icon">⇄</div><div class="empty-title">No Records Available</div><div class="empty-sub">Add your first transaction to begin tracking.</div></div>`;

  // Upcoming bills (dashboard preview — unpaid only)
  const dashBills  = document.getElementById('dashBills');
  const urgentBills= state.bills.filter(b => !b.paid).slice(0, 4);
  dashBills.innerHTML = urgentBills.length
    ? urgentBills.map(b => buildBillItem(b, false)).join('')
    : `<div class="empty-state" style="padding:28px"><div class="empty-icon">🔔</div><div class="empty-title">No Pending Bills</div></div>`;

  renderDashChart();
}

function renderDashChart() {
  const wrap = document.getElementById('dashChartWrap');
  const months = [], incArr = [], expArr = [];
  for (let i = 5; i >= 0; i--) {
    const d  = new Date(); d.setMonth(d.getMonth() - i);
    const mo = d.getMonth(), yr = d.getFullYear();
    months.push(d.toLocaleString('en', { month: 'short' }));
    incArr.push(state.transactions.filter(t=>{const td=new Date(t.date);return td.getMonth()===mo&&td.getFullYear()===yr&&t.type==='income';}).reduce((a,t)=>a+t.amount,0));
    expArr.push(state.transactions.filter(t=>{const td=new Date(t.date);return td.getMonth()===mo&&td.getFullYear()===yr&&t.type==='expense';}).reduce((a,t)=>a+t.amount,0));
  }
  if (incArr.every(v=>v===0) && expArr.every(v=>v===0)) {
    wrap.innerHTML = `<div class="no-data-chart"><div class="nd-icon">◻</div><span>No data to visualize yet</span></div>`;
    return;
  }
  wrap.innerHTML = `<div class="chart-wrap"><canvas id="dashChart"></canvas></div>`;
  destroyChart('dashChart');
  charts['dashChart'] = new Chart(document.getElementById('dashChart').getContext('2d'), {
    type: 'bar',
    data: { labels: months, datasets: [
      { label: 'Income',  data: incArr, backgroundColor: 'rgba(39,174,96,0.6)',  borderRadius: 4 },
      { label: 'Expense', data: expArr, backgroundColor: 'rgba(192,57,43,0.6)', borderRadius: 4 }
    ]},
    options: chartOptions()
  });
}

/* ===== TRANSACTIONS ===== */
function filterTxns(type, el) {
  txnFilter = type;
  document.querySelectorAll('#txnFilterBar .filter-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderTxnTable(type);
}

function renderTxnTable(filter) {
  const wrap = document.getElementById('allTxnsTable');
  let txns   = [...state.transactions];
  if (filter === 'income')  txns = txns.filter(t => t.type === 'income');
  if (filter === 'expense') txns = txns.filter(t => t.type === 'expense');
  if (!txns.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">⇄</div><div class="empty-title">No Records Available</div><div class="empty-sub">No ${filter==='all'?'':filter+' '}records found.</div></div>`;
    return;
  }
  wrap.innerHTML = buildTxnTable(txns, true);
}

function buildTxnTable(txns, showDelete) {
  return `<table class="txn-table">
    <thead><tr>
      <th>Date</th><th>Description</th><th>Category</th><th>Method</th><th>Type</th>
      <th style="text-align:right">Amount</th>${showDelete ? '<th></th>' : ''}
    </tr></thead>
    <tbody>
      ${txns.map(t => `<tr>
        <td style="color:var(--text3);white-space:nowrap">${fmtDate(t.date)}</td>
        <td><div style="font-weight:500">${esc(t.desc)}</div>${t.notes?`<div style="font-size:11px;color:var(--text3);margin-top:2px">${esc(t.notes)}</div>`:''}</td>
        <td style="color:var(--text2)">${esc(t.category)}</td>
        <td style="color:var(--text3);font-size:12px">${esc(t.method)||'—'}</td>
        <td><span class="txn-type-badge badge-${t.type}">${t.type==='income'?'↑':'↓'} ${cap(t.type)}</span></td>
        <td style="text-align:right;font-family:'Playfair Display',serif;font-weight:600;color:${t.type==='income'?'var(--success)':'var(--danger)'}">${fmt(t.amount)}</td>
        ${showDelete?`<td><button class="btn-danger" onclick="deleteTxn(${t.id})">✕</button></td>`:''}
      </tr>`).join('')}
    </tbody>
  </table>`;
}

/* ===== BILLS (Features 2 & 3) ===== */
function renderBills() {
  const wrap = document.getElementById('billsList');
  if (!state.bills.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🔔</div><div class="empty-title">No Bills Added</div><div class="empty-sub">Add recurring bills to track due dates.</div></div>`;
    return;
  }
  wrap.innerHTML = state.bills.map(b => buildBillItem(b, true)).join('');
}

const BILL_ICONS = { Rent:'🏠', Electricity:'⚡', Internet:'📡', Insurance:'🛡', Subscription:'▶', 'Loan EMI':'🏦', Taxes:'📋', Other:'📄' };

function buildBillItem(b, showActions = false) {
  const icon            = BILL_ICONS[b.category] || '📄';
  const { label, cls }  = _calcBillStatus(b);
  const recLabel        = RECURRENCE_LABELS[b.recurrence] || b.recurrence || 'Monthly';
  const dueTxt          = b.dueDate ? `Due ${_fmtDateShort(b.dueDate)}` : '';
  const totalInst       = b.totalInstallments || 0;
  const instPaid        = b.installmentsPaid  || 0;
  const lastPayment     = b.paymentHistory && b.paymentHistory.length
                            ? b.paymentHistory[b.paymentHistory.length - 1]
                            : null;

  // Installment progress bar (only for recurring with a set total)
  const instHTML = (totalInst > 0 && showActions) ? `
    <div class="bill-installment-bar" style="margin-top:6px">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-bottom:3px">
        <span>Installments</span><span>${instPaid} / ${totalInst} paid</span>
      </div>
      <div style="background:rgba(255,255,255,0.08);border-radius:20px;height:4px">
        <div style="background:var(--gold);width:${Math.min(100,Math.round((instPaid/totalInst)*100))}%;height:4px;border-radius:20px;transition:width .3s"></div>
      </div>
    </div>` : '';

  // Last payment info when paid
  const paidInfoHTML = (b.paid && lastPayment) ? `
    <div style="font-size:11px;color:var(--text3);margin-top:3px">
      Paid on ${fmtDate(lastPayment.date)}${lastPayment.method ? ' · ' + esc(lastPayment.method) : ''}
    </div>` : '';

  return `<div class="bill-item">
    <div class="bill-left">
      <div class="bill-icon">${icon}</div>
      <div style="flex:1">
        <div class="bill-name">${esc(b.name)}</div>
        <div class="bill-due">${esc(b.category)} · ${recLabel}${b.notes ? ' · ' + esc(b.notes) : ''}</div>
        ${dueTxt ? `<div style="font-size:11px;color:var(--text3);margin-top:1px">${dueTxt}</div>` : ''}
        ${paidInfoHTML}
        <span class="status-badge ${cls}">${label}</span>
        ${instHTML}
      </div>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <div class="bill-amount">${fmt(b.amount)}</div>
      ${showActions ? `<div class="actions-row" style="margin-top:8px;justify-content:flex-end">
        ${b.paid
          ? `<button class="btn-paid-undo" onclick="undoBillPaid(${b.id})">↩ Undo Payment</button>`
          : `<button class="btn-success" onclick="markBillPaid(${b.id})">✓ Mark as Paid</button>`
        }
        <button class="btn-danger" onclick="deleteBill(${b.id})">✕</button>
      </div>` : ''}
    </div>
  </div>`;
}

/* ===== GOALS ===== */
function renderGoals() {
  const wrap = document.getElementById('goalsGrid');
  if (!state.goals.length) {
    wrap.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="empty-state"><div class="empty-icon">◎</div><div class="empty-title">No Goals Added</div><div class="empty-sub">Create custom savings goals and track your progress over time.</div></div></div>`;
    return;
  }
  wrap.innerHTML = state.goals.map(g => {
    const pct       = Math.min(100, g.target > 0 ? Math.round((g.saved / g.target) * 100) : 0);
    const remaining = Math.max(0, g.target - g.saved);
    return `<div class="goal-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
        <div class="goal-name">${esc(g.name)}</div>
        <div class="goal-pct">${pct}%</div>
      </div>
      ${g.desc ? `<div style="font-size:12px;color:var(--text3);margin-bottom:8px">${esc(g.desc)}</div>` : ''}
      <div class="goal-target">Target: <strong style="color:var(--text2)">${fmt(g.target)}</strong>${g.date ? ` · By ${fmtDate(g.date)}` : ''}</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="goal-meta"><span>Saved: ${fmt(g.saved)}</span><span>Remaining: ${fmt(remaining)}</span></div>
      <div class="actions-row" style="margin-top:14px">
        <button class="btn-ghost" style="flex:1;padding:8px;font-size:12px" onclick="openUpdateGoal(${g.id})">Update Progress</button>
        <button class="btn-danger" onclick="deleteGoal(${g.id})">✕</button>
      </div>
    </div>`;
  }).join('');
}

/* ===== MONTHLY RECORDS ===== */
window.renderMonthly = function renderMonthly() {
  const wrap = document.getElementById('monthlyAccordions');
  if (!state.transactions.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding:80px 20px"><div class="empty-icon">📅</div><div class="empty-title">No Monthly Records</div><div class="empty-sub">Records appear automatically as you add transactions.</div></div>`;
    return;
  }
  const map = {};
  state.transactions.forEach(t => {
    const d   = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!map[key]) map[key] = { income: 0, expense: 0, txns: [], cats: {} };
    if (t.type === 'income') map[key].income += t.amount;
    else { map[key].expense += t.amount; map[key].cats[t.category] = (map[key].cats[t.category]||0) + t.amount; }
    map[key].txns.push(t);
  });
  const keys = Object.keys(map).sort().reverse();
  wrap.innerHTML = keys.map((k) => {
    const m        = map[k];
    const [yr, mo] = k.split('-');
    const date     = new Date(yr, parseInt(mo)-1, 1);
    const label    = date.toLocaleString('en', { month: 'long', year: 'numeric' });
    const net      = m.income - m.expense;
    const maxCat   = Object.entries(m.cats).sort((a,b) => b[1]-a[1]);
    const totalExp = m.expense || 1;

    return `<div class="month-accordion">
      <div class="month-header" onclick="toggleMonth('ma-${k}')">
        <div class="month-name">${label}</div>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div class="month-stat"><div class="month-stat-label">Income</div><div class="month-stat-val" style="color:var(--success)">${fmt(m.income)}</div></div>
          <div class="month-stat"><div class="month-stat-label">Expenses</div><div class="month-stat-val" style="color:var(--danger)">${fmt(m.expense)}</div></div>
          <div class="month-stat"><div class="month-stat-label">Net</div><div class="month-stat-val" style="color:${net>=0?'var(--gold)':'var(--danger)'}">${fmt(net)}</div></div>
          <!-- Feature 1: Per-month export dropdown -->
          <div class="export-dropdown" onclick="event.stopPropagation()">
            <button class="btn-ghost" style="padding:5px 12px;font-size:11px" onclick="toggleExportMenu('mexp-${k}')">↓ Export</button>
            <div class="export-menu" id="mexp-${k}">
              <div class="export-menu-item" onclick="exportMonthCSV('${k}')">📊 CSV</div>
              <div class="export-menu-item" onclick="exportMonthJSON('${k}')">📋 JSON</div>
            </div>
          </div>
          <div class="month-chevron" id="chev-${k}">▾</div>
        </div>
      </div>
      <div class="month-body" id="ma-${k}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px">
          <div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:var(--text3);margin-bottom:12px">Expense Breakdown</div>
            ${maxCat.length ? maxCat.slice(0,6).map(([cat,amt]) => `
              <div class="monthly-cat-bar">
                <div class="monthly-cat-bar-label"><span>${esc(cat)}</span><span style="color:var(--text)">${fmt(amt)}</span></div>
                <div class="monthly-cat-bar-track"><div class="monthly-cat-bar-fill" style="width:${Math.round((amt/totalExp)*100)}%"></div></div>
              </div>`).join('') : '<div style="color:var(--text3);font-size:13px">No expense categories</div>'}
          </div>
          <div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:var(--text3);margin-bottom:12px">Transactions (${m.txns.length})</div>
            ${m.txns.slice(0,5).map(t => `
              <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border)">
                <div style="font-size:13px;color:var(--text2)">${esc(t.desc)}</div>
                <div style="font-family:'Playfair Display',serif;font-size:13px;color:${t.type==='income'?'var(--success)':'var(--danger)'}">${fmt(t.amount)}</div>
              </div>`).join('')}
            ${m.txns.length > 5 ? `<div style="font-size:12px;color:var(--text3);margin-top:8px">+${m.txns.length-5} more records</div>` : ''}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleMonth(id) {
  const body = document.getElementById(id);
  const key  = id.replace('ma-', '');
  const chev = document.getElementById('chev-' + key);
  const open = body.classList.toggle('open');
  if (chev) chev.classList.toggle('open', open);
}

/* ===== ANALYTICS ===== */
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

window.renderAnalytics = function renderAnalytics() {
  const months = [], incArr = [], expArr = [], savArr = [];
  for (let i = 7; i >= 0; i--) {
    const d  = new Date(); d.setMonth(d.getMonth() - i);
    const mo = d.getMonth(), yr = d.getFullYear();
    months.push(d.toLocaleString('en', { month: 'short' }));
    const inc = state.transactions.filter(t=>{const td=new Date(t.date);return td.getMonth()===mo&&td.getFullYear()===yr&&t.type==='income';}).reduce((a,t)=>a+t.amount,0);
    const exp = state.transactions.filter(t=>{const td=new Date(t.date);return td.getMonth()===mo&&td.getFullYear()===yr&&t.type==='expense';}).reduce((a,t)=>a+t.amount,0);
    incArr.push(inc); expArr.push(exp); savArr.push(inc-exp);
  }

  const ieWrap = document.getElementById('analyticsIEWrap');
  if (incArr.every(v=>v===0) && expArr.every(v=>v===0)) {
    ieWrap.innerHTML = `<div class="no-data-chart"><div class="nd-icon">◻</div><span>Add transactions to see analytics</span></div>`;
  } else {
    ieWrap.innerHTML = `<canvas id="analyticsIEChart"></canvas>`;
    destroyChart('analyticsIEChart');
    charts['analyticsIEChart'] = new Chart(document.getElementById('analyticsIEChart').getContext('2d'), {
      type: 'bar',
      data: { labels: months, datasets: [
        { label: 'Income',   data: incArr, backgroundColor: 'rgba(39,174,96,0.65)',  borderRadius: 5 },
        { label: 'Expenses', data: expArr, backgroundColor: 'rgba(192,57,43,0.65)', borderRadius: 5 }
      ]},
      options: chartOptions()
    });
  }

  const catMap = {};
  state.transactions.filter(t=>t.type==='expense').forEach(t => { catMap[t.category]=(catMap[t.category]||0)+t.amount; });
  const catWrap = document.getElementById('analyticsCatWrap');
  if (!Object.keys(catMap).length) {
    catWrap.innerHTML = `<div class="no-data-chart"><div class="nd-icon">◻</div><span>Add expense transactions to see distribution</span></div>`;
  } else {
    catWrap.innerHTML = `<canvas id="analyticsCatChart"></canvas>`;
    destroyChart('analyticsCatChart');
    const goldPalette = ['#C6A15B','#E5C687','#A07840','#D4B87E','#8A6435','#F0D9A8','#7A5525','#BFAA80','#6B4A20','#DCC89F'];
    charts['analyticsCatChart'] = new Chart(document.getElementById('analyticsCatChart').getContext('2d'), {
      type: 'doughnut',
      data: { labels: Object.keys(catMap), datasets: [{ data: Object.values(catMap), backgroundColor: goldPalette, borderWidth: 0, hoverOffset: 6 }] },
      options: { ...chartOptions(), cutout: '65%' }
    });
  }

  const savWrap = document.getElementById('analyticsSavingsWrap');
  if (savArr.every(v=>v===0)) {
    savWrap.innerHTML = `<div class="no-data-chart"><div class="nd-icon">◻</div><span>Savings data will appear here</span></div>`;
  } else {
    savWrap.innerHTML = `<canvas id="analyticsSavChart"></canvas>`;
    destroyChart('analyticsSavChart');
    charts['analyticsSavChart'] = new Chart(document.getElementById('analyticsSavChart').getContext('2d'), {
      type: 'line',
      data: { labels: months, datasets: [{ label: 'Net Savings', data: savArr, borderColor: '#C6A15B', backgroundColor: 'rgba(198,161,91,0.08)', tension: 0.4, fill: true, pointBackgroundColor: '#C6A15B', pointRadius: 4 }] },
      options: chartOptions()
    });
  }

  const expWrap = document.getElementById('analyticsExpWrap');
  if (expArr.every(v=>v===0)) {
    expWrap.innerHTML = `<div class="no-data-chart"><div class="nd-icon">◻</div><span>Expense trend will appear here</span></div>`;
  } else {
    expWrap.innerHTML = `<canvas id="analyticsExpChart"></canvas>`;
    destroyChart('analyticsExpChart');
    charts['analyticsExpChart'] = new Chart(document.getElementById('analyticsExpChart').getContext('2d'), {
      type: 'line',
      data: { labels: months, datasets: [{ label: 'Expenses', data: expArr, borderColor: '#C0392B', backgroundColor: 'rgba(192,57,43,0.08)', tension: 0.4, fill: true, pointBackgroundColor: '#C0392B', pointRadius: 4 }] },
      options: chartOptions()
    });
  }
}

/* ===== ANNUAL REPORT ===== */
window.renderAnnual = function renderAnnual() {
  const yr = parseInt(state.settings.year);
  document.getElementById('reportYear').textContent = yr;
  const yearTxns = state.transactions.filter(t => new Date(t.date).getFullYear() === yr);
  const totalInc = yearTxns.filter(t=>t.type==='income').reduce((a,t)=>a+t.amount,0);
  const totalExp = yearTxns.filter(t=>t.type==='expense').reduce((a,t)=>a+t.amount,0);
  document.getElementById('annualIncome').textContent  = totalInc>0 ? fmt(totalInc)  : '—';
  document.getElementById('annualExpense').textContent = totalExp>0 ? fmt(totalExp) : '—';
  document.getElementById('annualSavings').textContent = yearTxns.length ? fmt(totalInc-totalExp) : '—';

  let highMo='—', highVal=0;
  for (let i=0;i<12;i++) {
    const exp = yearTxns.filter(t=>{const d=new Date(t.date);return d.getMonth()===i&&t.type==='expense';}).reduce((a,t)=>a+t.amount,0);
    if (exp>highVal){highVal=exp;highMo=new Date(yr,i).toLocaleString('en',{month:'long'});}
  }
  document.getElementById('annualHighMonth').textContent = highMo;

  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const incArr=[], expArr=[];
  for(let i=0;i<12;i++){
    incArr.push(yearTxns.filter(t=>new Date(t.date).getMonth()===i&&t.type==='income').reduce((a,t)=>a+t.amount,0));
    expArr.push(yearTxns.filter(t=>new Date(t.date).getMonth()===i&&t.type==='expense').reduce((a,t)=>a+t.amount,0));
  }
  const annWrap = document.getElementById('annualChartWrap');
  if (!yearTxns.length) {
    annWrap.innerHTML = `<div class="no-data-chart"><div class="nd-icon">◻</div><span>Add transactions to generate annual report</span></div>`;
  } else {
    annWrap.innerHTML = `<canvas id="annualChart"></canvas>`;
    destroyChart('annualChart');
    charts['annualChart'] = new Chart(document.getElementById('annualChart').getContext('2d'), {
      type: 'bar',
      data: { labels: months, datasets: [
        { label: 'Income',   data: incArr, backgroundColor: 'rgba(39,174,96,0.6)',  borderRadius: 4 },
        { label: 'Expenses', data: expArr, backgroundColor: 'rgba(192,57,43,0.6)', borderRadius: 4 }
      ]},
      options: chartOptions()
    });
  }

  const catMap={};
  yearTxns.filter(t=>t.type==='expense').forEach(t=>{catMap[t.category]=(catMap[t.category]||0)+t.amount;});
  const catWrap = document.getElementById('annualCatAnalysis');
  if (!Object.keys(catMap).length) {
    catWrap.innerHTML = `<div class="empty-state" style="padding:32px"><div class="empty-sub">Category breakdown will appear here once transactions are added.</div></div>`;
  } else {
    const sorted = Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
    const total  = sorted.reduce((a,[,v])=>a+v,0);
    catWrap.innerHTML = `<div style="margin-top:8px">${sorted.map(([cat,amt])=>`
      <div class="monthly-cat-bar" style="margin-bottom:14px">
        <div class="monthly-cat-bar-label" style="font-size:13px">
          <span>${esc(cat)}</span>
          <span style="color:var(--text)">${fmt(amt)} <span style="color:var(--text3);font-size:11px">(${Math.round((amt/total)*100)}%)</span></span>
        </div>
        <div class="monthly-cat-bar-track" style="height:7px"><div class="monthly-cat-bar-fill" style="width:${Math.round((amt/total)*100)}%"></div></div>
      </div>`).join('')}</div>`;
  }
}

/* ===== SETTINGS ===== */
function saveSetting(key, val) {
  if (key === 'year') val = parseInt(val);
  state.settings[key] = val;
  saveState(); updateSidebarYear(); renderAll();
  showToast('✓', 'Setting saved.');
}

function addCustomCat() {
  const input = document.getElementById('newCatInput');
  const val   = input.value.trim();
  if (!val) return;
  if (!state.settings.categories) state.settings.categories = [];
  if (state.settings.categories.includes(val)) { showToast('⚠', 'Category already exists.'); return; }
  state.settings.categories.push(val);
  saveState(); input.value = '';
  renderCustomCats(); populateCategories();
  showToast('✓', `Category "${val}" added.`);
}

function removeCustomCat(cat) {
  state.settings.categories = (state.settings.categories||[]).filter(c=>c!==cat);
  saveState(); renderCustomCats(); populateCategories();
}

window.renderCustomCats = function renderCustomCats() {
  const wrap = document.getElementById('customCatChips');
  const cats = state.settings.categories || [];
  if (!cats.length) { wrap.innerHTML = `<div style="color:var(--text3);font-size:13px">No custom categories added yet.</div>`; return; }
  wrap.innerHTML = cats.map(c => `<span class="tag-chip">${esc(c)}<button onclick="removeCustomCat('${c.replace(/'/g,"\\'")}')">×</button></span>`).join('');
}

/* Feature 1 — Settings page export uses export.js */
function exportData() { exportAllDataJSON(); }

function clearAllData() {
  if (!confirm('Are you sure? This will permanently delete ALL your data and cannot be undone.')) return;
  state.transactions=[]; state.bills=[]; state.goals=[];
  saveState(); renderAll();
  showToast('✓', 'All data cleared.');
}

/* ===== CHART OPTIONS ===== */
function chartOptions() {
  return {
    responsive: true, maintainAspectRatio: true,
    plugins: {
      legend: { labels: { color: '#A8A8A8', font: { family: 'Inter', size: 12 }, boxWidth: 12, padding: 16 } },
      tooltip: {
        backgroundColor: '#1E1E1E', borderColor: 'rgba(198,161,91,0.3)', borderWidth: 1,
        titleColor: '#F5F1E8', bodyColor: '#A8A8A8', padding: 12, cornerRadius: 8,
        callbacks: { label: (ctx) => ` ${state.settings.currency}${(ctx.raw||0).toLocaleString('en-IN',{minimumFractionDigits:2})}` }
      }
    },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6B6B6B', font: { size: 11 } } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6B6B6B', font: { size: 11 }, callback: v => state.settings.currency + v.toLocaleString('en-IN') } }
    }
  };
}

/* ===== TOAST ===== */
function showToast(icon, msg) {
  const t = document.getElementById('toast');
  document.getElementById('toastIcon').textContent = icon;
  document.getElementById('toastMsg').textContent  = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

/* ===== HELPERS ===== */
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function _fmtDateShort(d) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ===== CLOSE MODALS ON OVERLAY CLICK ===== */
document.querySelectorAll('.modal-overlay').forEach(mo => {
  mo.addEventListener('click', (e) => { if (e.target === mo) mo.classList.remove('open'); });
});

/* ===== KICK OFF ===== */
init();