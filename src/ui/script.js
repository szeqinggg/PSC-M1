/* ═══════════════════════════════════════════════════════════
   PSC-M1 · app.js
   Smart Pharmacy Monitoring System
   ═══════════════════════════════════════════════════════════ */
 
'use strict';
 
/* ─────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────── */
const TODAY = new Date('2026-06-06'); // Fixed prototype date
const NEAR_EXPIRY_DAYS = 10;
 
/* ─────────────────────────────────────────
   STATE — Medicine database (localStorage-backed)
───────────────────────────────────────── */
const DEFAULT_MEDICINES = [
  { id: 'MED001', name: 'Actal Plus',       qty: 30,  expiry: '2026-07-07', threshold: 20 },
  { id: 'MED002', name: 'YSP Prednisolone', qty: 18,  expiry: '2026-07-06', threshold: 20 },
  { id: 'MED003', name: 'Panadol',          qty: 120, expiry: '2026-06-04', threshold: 50 },
  { id: 'MED004', name: 'Difflam',          qty: 50,  expiry: '2026-06-08', threshold: 30 },
  { id: 'MED005', name: 'Gaviscon',         qty: 30,  expiry: '2026-08-08', threshold: 20 },
];
 
const DEFAULT_RESTOCK_ORDERS = [
  { id: 'ORD001', medId: 'MED003', medName: 'Panadol',          supplier: 'GSK Malaysia',   qty: 100, orderDate: '2026-06-05', expectedDelivery: '2026-06-09', status: 'In Transit' },
  { id: 'ORD002', medId: 'MED002', medName: 'YSP Prednisolone', supplier: 'YSP Industries', qty: 50,  orderDate: '2026-06-06', expectedDelivery: '2026-06-10', status: 'Processing' },
];
 
const SUPPLIER_MAP = {
  MED001: 'PharmaBest Sdn Bhd',
  MED002: 'YSP Industries',
  MED003: 'GSK Malaysia',
  MED004: 'Reckitt Malaysia',
  MED005: 'Gaviscon Medical',
};
 
const AI_ALERTS = [
  { icon: 'fa-virus', color: '#e02424', text: 'COVID-19 activity rising in Klang Valley — prepare Paracetamol and Panadol stocks, projected +40% demand over next 14 days.' },
  { icon: 'fa-chart-line', color: '#c2600a', text: 'Difflam is fast-moving this week (+28% vs last week). Current stock at 50 — consider restock soon.' },
  { icon: 'fa-triangle-exclamation', color: '#8e4b10', text: 'YSP Prednisolone below threshold (18 < 20). Predicted stockout in ~3 days at current dispensing rate.' },
  { icon: 'fa-info-circle', color: '#1a56db', text: 'Gaviscon demand stable. Current stock sufficient for ~18 days based on 7-day average.' },
];
 
let appState = {
  loggedIn: false,
  staffName: '',
  staffRole: '',
  medicines: [],
  restockOrders: [],
  verifLog: [],
  notifications: [],
  pendingVerifIndex: null, // index of verif log row awaiting approval
};
 
/* ─────────────────────────────────────────
   PERSISTENCE
───────────────────────────────────────── */
function loadState() {
  try {
    const saved = localStorage.getItem('pscm1_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      appState.medicines     = parsed.medicines     || [...DEFAULT_MEDICINES];
      appState.restockOrders = parsed.restockOrders || [...DEFAULT_RESTOCK_ORDERS];
      appState.verifLog      = parsed.verifLog      || [];
      appState.notifications = parsed.notifications || [];
    } else {
      appState.medicines     = JSON.parse(JSON.stringify(DEFAULT_MEDICINES));
      appState.restockOrders = JSON.parse(JSON.stringify(DEFAULT_RESTOCK_ORDERS));
    }
  } catch (e) {
    appState.medicines     = JSON.parse(JSON.stringify(DEFAULT_MEDICINES));
    appState.restockOrders = JSON.parse(JSON.stringify(DEFAULT_RESTOCK_ORDERS));
  }
}
 
function saveState() {
  const toSave = {
    medicines:     appState.medicines,
    restockOrders: appState.restockOrders,
    verifLog:      appState.verifLog,
    notifications: appState.notifications,
  };
  localStorage.setItem('pscm1_state', JSON.stringify(toSave));
}
 
/* ─────────────────────────────────────────
   STATUS HELPERS
───────────────────────────────────────── */
function getMedStatus(med) {
  const expDate  = new Date(med.expiry);
  const daysLeft = Math.floor((expDate - TODAY) / 86400000);
 
  if (daysLeft < 0)                      return 'expired';
  if (daysLeft <= NEAR_EXPIRY_DAYS)      return 'near-expiry';
  if (med.qty < med.threshold)           return 'low';
  return 'normal';
}
 
function getDaysToExpiry(expiry) {
  return Math.floor((new Date(expiry) - TODAY) / 86400000);
}
 
function statusBadge(status) {
  const map = {
    'normal':       ['b-green',  'fa-check-circle', 'Normal'],
    'low':          ['b-yellow', 'fa-exclamation-triangle', 'Low Stock'],
    'near-expiry':  ['b-orange', 'fa-clock', 'Near Expiry'],
    'expired':      ['b-red',    'fa-times-circle', 'Expired'],
  };
  const [cls, icon, label] = map[status] || map['normal'];
  return `<span class="badge ${cls}"><i class="fa ${icon}"></i> ${label}</span>`;
}
 
function deliveryStatusBadge(status) {
  const map = {
    'Processing': 'b-blue',
    'In Transit': 'b-yellow',
    'Delivered':  'b-green',
    'Delayed':    'b-red',
  };
  return `<span class="badge ${map[status] || 'b-gray'}">${status}</span>`;
}
 
/* ─────────────────────────────────────────
   DATE DISPLAY
───────────────────────────────────────── */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
}
 
function updateTopbarDate() {
  const el = document.getElementById('topbarDate');
  if (el) {
    el.textContent = TODAY.toLocaleDateString('en-MY', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    });
  }
  const sd = document.getElementById('stockTodayDate');
  if (sd) sd.textContent = formatDate(TODAY.toISOString().split('T')[0]);
}
 
/* ─────────────────────────────────────────
   LOGIN / LOGOUT
───────────────────────────────────────── */
function doLogin() {
  const name = document.getElementById('loginName').value.trim();
  const pw   = document.getElementById('loginPw').value;
  const role = document.getElementById('loginRole').value;
 
  if (!name || !pw || !role) { showToast('Please fill in all fields.', 'error'); return; }
  if (name !== 'John' || pw !== '123') { showToast('Incorrect name or password.', 'error'); return; }
 
  appState.loggedIn  = true;
  appState.staffName = name;
  appState.staffRole = role === 'warehouse' ? 'Warehouse Operator' : 'Substore Operator';
 
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  document.getElementById('topbarStaff').textContent = name;
  document.getElementById('topbarRole').textContent  = appState.staffRole;
 
  loadState();
  generateDefaultNotifications();
  updateTopbarDate();
  renderAllBadges();
  navigate('stock');
  showToast(`Welcome, ${name}!`, 'success');
}
 
function doLogout() {
  saveState();
  appState.loggedIn  = false;
  appState.staffName = '';
  appState.staffRole = '';
 
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginName').value = '';
  document.getElementById('loginPw').value   = '';
  document.getElementById('loginRole').value = '';
}
 
/* ─────────────────────────────────────────
   NAVIGATION
───────────────────────────────────────── */
let currentPage = 'stock';
 
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
 
  const pg = document.getElementById('page-' + page);
  if (pg) pg.classList.add('active');
 
  const ni = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (ni) ni.classList.add('active');
 
  currentPage = page;
  renderPage(page);
}
 
function renderPage(page) {
  switch (page) {
    case 'stock':         renderStockTable();     break;
    case 'restock':       renderRestockPage();    break;
    case 'notifications': renderNotifications();  break;
    case 'verification':  renderVerifLog();       break;
    case 'threshold':     renderThreshold();      break;
    case 'analytics':     renderAnalytics();      break;
  }
}
 
/* ─────────────────────────────────────────
   BADGES
───────────────────────────────────────── */
function renderAllBadges() {
  // Restock badge = count of low + expired
  const needRestock = appState.medicines.filter(m => {
    const s = getMedStatus(m);
    return s === 'low' || s === 'expired';
  }).length;
  const rb = document.getElementById('restockBadge');
  if (rb) { rb.textContent = needRestock || ''; }
 
  // Notif badge = unread notifications
  const unread = appState.notifications.filter(n => !n.read).length;
  const nb = document.getElementById('notifBadge');
  if (nb) { nb.textContent = unread || ''; }
}
 
/* ─────────────────────────────────────────
   STOCK MONITOR
───────────────────────────────────────── */
function renderStockTable() {
  const search = (document.getElementById('stockSearch')?.value || '').toLowerCase().trim();
  const filter = document.getElementById('stockFilter')?.value || 'all';
 
  // Summary counts
  const counts = { normal: 0, low: 0, 'near-expiry': 0, expired: 0 };
  appState.medicines.forEach(m => counts[getMedStatus(m)]++);
 
  const summary = document.getElementById('stockSummary');
  if (summary) {
    summary.innerHTML = `
      <div class="summary-card" onclick="setStockFilter('all')">
        <div class="summary-card-label">Total Medicines</div>
        <div class="summary-card-value" style="color:var(--blue);">${appState.medicines.length}</div>
      </div>
      <div class="summary-card" onclick="setStockFilter('normal')">
        <div class="summary-card-label">Normal</div>
        <div class="summary-card-value" style="color:var(--green);">${counts.normal}</div>
      </div>
      <div class="summary-card" onclick="setStockFilter('low')">
        <div class="summary-card-label">Low Stock</div>
        <div class="summary-card-value" style="color:var(--yellow);">${counts.low}</div>
        <div class="summary-card-sub">Below threshold</div>
      </div>
      <div class="summary-card" onclick="setStockFilter('near-expiry')">
        <div class="summary-card-label">Near Expiry</div>
        <div class="summary-card-value" style="color:var(--orange);">${counts['near-expiry']}</div>
        <div class="summary-card-sub">Within ${NEAR_EXPIRY_DAYS} days</div>
      </div>
      <div class="summary-card" onclick="setStockFilter('expired')">
        <div class="summary-card-label">Expired</div>
        <div class="summary-card-value" style="color:var(--red);">${counts.expired}</div>
      </div>
    `;
  }
 
  // Filter medicines
  let rows = appState.medicines.filter(m => {
    const s = getMedStatus(m);
    const matchSearch = !search || m.id.toLowerCase().includes(search) || m.name.toLowerCase().includes(search);
    const matchFilter = filter === 'all' || s === filter;
    return matchSearch && matchFilter;
  });
 
  const tbody = document.getElementById('stockBody');
  if (!tbody) return;
 
  if (rows.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No medicines found.</td></tr>`;
    return;
  }
 
  tbody.innerHTML = rows.map(m => {
    const s = getMedStatus(m);
    const rowClass = s === 'expired' ? 'row-expired' : s === 'near-expiry' ? 'row-near' : s === 'low' ? 'row-low' : 'row-normal';
    const daysLeft = getDaysToExpiry(m.expiry);
    const expiryDisplay = daysLeft < 0
      ? `<span style="color:var(--red);font-weight:500;">${formatDate(m.expiry)} (Expired)</span>`
      : daysLeft <= NEAR_EXPIRY_DAYS
        ? `<span style="color:var(--orange);font-weight:500;">${formatDate(m.expiry)} (${daysLeft}d left)</span>`
        : formatDate(m.expiry);
 
    return `<tr class="${rowClass}">
      <td class="mono">${m.id}</td>
      <td style="font-weight:500;">${m.name}</td>
      <td><strong>${m.qty}</strong> <span style="color:var(--text4);font-size:11px;">/ threshold ${m.threshold}</span></td>
      <td>${expiryDisplay}</td>
      <td>${statusBadge(s)}</td>
      <td style="color:var(--text4);font-size:12px;">Today</td>
    </tr>`;
  }).join('');
}
 
function setStockFilter(val) {
  const sel = document.getElementById('stockFilter');
  if (sel) { sel.value = val; renderStockTable(); }
}
 
/* ─────────────────────────────────────────
   RESTOCKING PAGE
───────────────────────────────────────── */
function renderRestockPage() {
  renderRestockNeedTable();
  renderRestockOrdersTable();
}
 
function renderRestockNeedTable() {
  const tbody = document.getElementById('restockBody');
  if (!tbody) return;
 
  const needs = appState.medicines.filter(m => {
    const s = getMedStatus(m);
    return s === 'low' || s === 'expired';
  });
 
  if (needs.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No medicines currently require restocking.</td></tr>`;
    return;
  }
 
  tbody.innerHTML = needs.map(m => {
    const s = getMedStatus(m);
    const rowClass = s === 'expired' ? 'row-expired' : 'row-low';
    return `<tr class="${rowClass}">
      <td class="mono">${m.id}</td>
      <td style="font-weight:500;">${m.name}</td>
      <td><strong style="color:var(--red);">${m.qty}</strong> <span style="color:var(--text4);font-size:11px;">/ threshold ${m.threshold}</span></td>
      <td>${formatDate(m.expiry)}</td>
      <td>${statusBadge(s)}</td>
      <td>${SUPPLIER_MAP[m.id] || 'Unknown Supplier'}</td>
      <td>
        <div class="action-btns">
          <button class="btn-primary btn-sm" onclick="makeOrder('${m.id}')"><i class="fa fa-cart-plus"></i> Make Order</button>
          <button class="btn-outline btn-sm" onclick="callSupplier('${m.id}')"><i class="fa fa-phone"></i> Call</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}
 
function renderRestockOrdersTable() {
  const tbody = document.getElementById('restockOrdersBody');
  if (!tbody) return;
 
  if (appState.restockOrders.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No active restock orders.</td></tr>`;
    return;
  }
 
  tbody.innerHTML = appState.restockOrders.map((o, idx) => `
    <tr>
      <td class="mono">${o.medId}</td>
      <td style="font-weight:500;">${o.medName}</td>
      <td>${o.supplier}</td>
      <td>${o.qty}</td>
      <td>${formatDate(o.orderDate)}</td>
      <td>${formatDate(o.expectedDelivery)}</td>
      <td>${deliveryStatusBadge(o.status)}</td>
      <td>
        <button class="btn-outline btn-sm" onclick="sendReminder(${idx})"><i class="fa fa-paper-plane"></i> Reminder</button>
      </td>
    </tr>
  `).join('');
}
 
function makeOrder(medId) {
  const med = appState.medicines.find(m => m.id === medId);
  if (!med) return;
 
  const existing = appState.restockOrders.find(o => o.medId === medId && o.status !== 'Delivered');
  if (existing) { showToast(`Order already active for ${med.name}.`, 'warn'); return; }
 
  const today = TODAY.toISOString().split('T')[0];
  const expectedDate = new Date(TODAY);
  expectedDate.setDate(expectedDate.getDate() + 4);
 
  const newOrder = {
    id:               'ORD' + String(Date.now()).slice(-4),
    medId:            medId,
    medName:          med.name,
    supplier:         SUPPLIER_MAP[medId] || 'Supplier',
    qty:              med.threshold * 2,
    orderDate:        today,
    expectedDelivery: expectedDate.toISOString().split('T')[0],
    status:           'Processing',
  };
 
  appState.restockOrders.push(newOrder);
  saveState();
  renderRestockOrdersTable();
  addNotification({
    type: 'info',
    title: `Order placed: ${med.name}`,
    desc: `Order for ${newOrder.qty} units placed with ${newOrder.supplier}. Expected: ${formatDate(newOrder.expectedDelivery)}.`,
  });
  showToast(`Order placed for ${med.name}!`, 'success');
}
 
function callSupplier(medId) {
  const supplier = SUPPLIER_MAP[medId] || 'supplier';
  showToast(`Calling ${supplier}… (display only)`, 'info');
}
 
function sendReminder(idx) {
  const order = appState.restockOrders[idx];
  if (order) showToast(`Reminder sent to ${order.supplier} for ${order.medName}.`, 'success');
}
 
/* ─────────────────────────────────────────
   NOTIFICATIONS
───────────────────────────────────────── */
function generateDefaultNotifications() {
  // Only add default notifications if list is empty
  if (appState.notifications.length > 0) return;
  appState.medicines.forEach(m => {
    const s = getMedStatus(m);
    if (s === 'expired') {
      addNotification({ type: 'error', title: `${m.name} has expired`, desc: `Expiry date: ${formatDate(m.expiry)}. Please quarantine and restock.` }, false);
    } else if (s === 'near-expiry') {
      const d = getDaysToExpiry(m.expiry);
      addNotification({ type: 'warn', title: `${m.name} expiring in ${d} day${d !== 1 ? 's' : ''}`, desc: `Expiry: ${formatDate(m.expiry)}. Plan usage or return to supplier.` }, false);
    } else if (s === 'low') {
      addNotification({ type: 'warn', title: `${m.name} below threshold`, desc: `Stock: ${m.qty} / Threshold: ${m.threshold}. Consider restocking.` }, false);
    }
  });
  saveState();
}
 
function addNotification({ type, title, desc }, save = true) {
  appState.notifications.unshift({
    type, title, desc,
    time: new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }),
    read: false,
  });
  if (save) saveState();
  renderAllBadges();
  if (currentPage === 'notifications') renderNotifications();
}
 
function renderNotifications() {
  const el = document.getElementById('notifList');
  if (!el) return;
 
  // Mark all as read
  appState.notifications.forEach(n => n.read = true);
  saveState();
  renderAllBadges();
 
  if (appState.notifications.length === 0) {
    el.innerHTML = `<div class="notif-empty"><i class="fa fa-bell-slash" style="font-size:32px;margin-bottom:10px;display:block;"></i>No notifications</div>`;
    return;
  }
 
  const iconMap = { error: ['fa-times-circle', 'var(--red)', 'var(--red-bg)'], warn: ['fa-exclamation-triangle', 'var(--orange)', 'var(--orange-bg)'], success: ['fa-check-circle', 'var(--green)', 'var(--green-bg)'], info: ['fa-info-circle', 'var(--blue)', 'var(--blue-bg)'] };
  const borderMap = { error: 'unread-red', warn: 'unread-orange', info: 'unread', success: 'unread' };
 
  el.innerHTML = appState.notifications.map(n => {
    const [icon, color, bg] = iconMap[n.type] || iconMap.info;
    return `<div class="notif-card ${borderMap[n.type] || ''}">
      <div class="notif-icon" style="background:${bg};color:${color};"><i class="fa ${icon}"></i></div>
      <div>
        <div class="notif-title">${n.title}</div>
        <div class="notif-desc">${n.desc}</div>
        <div class="notif-time">${n.time}</div>
      </div>
    </div>`;
  }).join('');
}
 
function clearNotifications() {
  appState.notifications = [];
  saveState();
  renderAllBadges();
  renderNotifications();
  showToast('All notifications cleared.', 'success');
}
 
/* ─────────────────────────────────────────
   VERIFICATION PAGE
───────────────────────────────────────── */
let currentVerifEntry = null; // holds pending verification data
 
function switchVerifTab(tab, btn) {
  document.querySelectorAll('.subtab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('verif' + (tab === 'live' ? 'Live' : 'Log')).classList.add('active');
  if (tab === 'log') renderVerifLog();
}
 
/*
  ═══════════════════════════════════════════════════════════════════
  HARDWARE INTEGRATION — receiveVerifResult()
  ═══════════════════════════════════════════════════════════════════
  Your Python Flask server should POST to this function after
  each verification run. Copy this into your Flask app:
 
  import requests
  def send_result_to_frontend(med_id, pass_qty, fail_qty, supplier, expiry, expected_qty):
      requests.post('http://localhost:5000/api/verif-result', json={
          'medId':       med_id,
          'passQty':     pass_qty,
          'failQty':     fail_qty,
          'supplierName': supplier,
          'expiryDate':  expiry,        # 'YYYY-MM-DD'
          'expectedQty': expected_qty
      })
 
  Then in your Flask app.js HTML, call:
    fetch('/api/verif-result', { method:'POST', body: JSON.stringify(data) })
  or expose an endpoint and poll it — OR use WebSocket.
 
  SIMPLEST INTEGRATION: In your Python script, after counting:
    import requests
    requests.post('http://YOUR_PC_IP:8080/api/verif', json={...})
  And add a small Express/Flask server in this app to receive it.
 
  For the DEMO PROTOTYPE, use the Simulate button below.
  ═══════════════════════════════════════════════════════════════════
*/
function receiveVerifResult(data) {
  const { medId, passQty, failQty, supplierName, expiryDate, expectedQty } = data;
  const med = appState.medicines.find(m => m.id === medId);
  const medName = med ? med.name : medId;
 
  const entry = {
    id:           'VER' + Date.now(),
    medId,
    medName,
    supplier:     supplierName || SUPPLIER_MAP[medId] || 'Unknown',
    expiryDate:   expiryDate || '',
    expectedQty:  expectedQty || (passQty + failQty),
    passQty:      passQty,
    failQty:      failQty,
    status:       'Done',
    approved:     false,
  };
 
  appState.verifLog.unshift(entry);
  saveState();
  renderVerifLog();
 
  // Update live panel
  document.getElementById('liveDetectResult').innerHTML = `
    <div style="font-size:13px;font-weight:500;color:var(--text);">Verification Complete</div>
    <div style="font-size:12px;color:var(--text3);margin-top:4px;">${medName}</div>
  `;
  const dc = document.getElementById('detectCounts');
  if (dc) {
    dc.style.display = 'flex';
    document.getElementById('livePassCount').textContent = passQty;
    document.getElementById('liveFailCount').textContent = failQty;
  }
 
  showToast(`Verification done: ${medName} — ${passQty} Pass, ${failQty} Fail`, 'success');
}
 
/* Demo simulate — for MED001 and MED002 prototype */
let simToggle = 0;
function simulateVerifResult() {
  simToggle = (simToggle + 1) % 2;
  const demos = [
    { medId: 'MED001', passQty: 28, failQty: 2, supplierName: 'PharmaBest Sdn Bhd', expiryDate: '2026-12-01', expectedQty: 30 },
    { medId: 'MED002', passQty: 47, failQty: 3, supplierName: 'YSP Industries',     expiryDate: '2026-11-15', expectedQty: 50 },
  ];
  receiveVerifResult(demos[simToggle]);
  if (document.getElementById('verifLog').classList.contains('active')) {
    renderVerifLog();
  }
}
 
function renderVerifLog() {
  const tbody = document.getElementById('verifLogBody');
  if (!tbody) return;
 
  if (appState.verifLog.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9">No verification records yet. Run the PSC-M1 machine to begin.</td></tr>`;
    return;
  }
 
  tbody.innerHTML = appState.verifLog.map((v, idx) => {
    const statusBadgeHtml = v.status === 'Done'
      ? `<span class="badge b-green"><i class="fa fa-check-circle"></i> Done</span>`
      : `<span class="badge b-blue"><i class="fa fa-spinner fa-spin"></i> Verifying…</span>`;
 
    const approvalBtn = v.approved
      ? `<button class="btn-completed"><i class="fa fa-check-double"></i> Completed</button>`
      : `<button class="btn-approve" onclick="openVerifApproveModal(${idx})"><i class="fa fa-stamp"></i> Awaiting Approval</button>`;
 
    return `<tr>
      <td class="mono">${v.medId}</td>
      <td style="font-weight:500;">${v.medName}</td>
      <td>${v.supplier}</td>
      <td>${formatDate(v.expiryDate)}</td>
      <td>${v.expectedQty}</td>
      <td style="color:var(--green);font-weight:600;">${v.passQty}</td>
      <td style="color:var(--red);font-weight:600;">${v.failQty}</td>
      <td>${statusBadgeHtml}</td>
      <td>${approvalBtn}</td>
    </tr>`;
  }).join('');
}
 
/* ── Verification Approval Modal ── */
function openVerifApproveModal(idx) {
  const v = appState.verifLog[idx];
  if (!v || v.approved) return;
 
  appState.pendingVerifIndex = idx;
  document.getElementById('verifApproveText').innerHTML =
    `Approving verification for <strong>${v.medName} (${v.medId})</strong>.<br>
    Pass quantity <strong>${v.passQty}</strong> units will be added to Stock Monitor as a new stock entry.
    Please set the new expiry date for this batch.`;
 
  // Pre-fill expiry with the one from verif record
  const expInput = document.getElementById('verifApproveExpiry');
  if (expInput) expInput.value = v.expiryDate || '';
 
  document.getElementById('modalVerifApprove').classList.remove('hidden');
}
 
function closeVerifApproveModal(e) {
  if (e && e.target !== document.getElementById('modalVerifApprove')) return;
  document.getElementById('modalVerifApprove').classList.add('hidden');
  appState.pendingVerifIndex = null;
}
 
function confirmVerifApproval() {
  const idx = appState.pendingVerifIndex;
  if (idx === null || idx === undefined) return;
 
  const v = appState.verifLog[idx];
  const newExpiry = document.getElementById('verifApproveExpiry').value;
  if (!newExpiry) { showToast('Please enter the new expiry date.', 'error'); return; }
 
  // Add to stock monitor as new entry (or add to existing)
  const existing = appState.medicines.find(m => m.id === v.medId);
  if (existing) {
    // Add pass qty and update expiry if this batch is newer
    existing.qty += v.passQty;
    // Optionally update expiry to the newest batch
    if (new Date(newExpiry) > new Date(existing.expiry)) {
      existing.expiry = newExpiry;
    }
  } else {
    // Create new entry
    appState.medicines.push({
      id:        v.medId,
      name:      v.medName,
      qty:       v.passQty,
      expiry:    newExpiry,
      threshold: 20,
    });
  }
 
  // Mark as approved
  appState.verifLog[idx].approved = true;
  saveState();
 
  document.getElementById('modalVerifApprove').classList.add('hidden');
  appState.pendingVerifIndex = null;
 
  renderVerifLog();
  if (currentPage === 'stock') renderStockTable();
  renderAllBadges();
 
  addNotification({
    type: 'success',
    title: `Verification approved: ${v.medName}`,
    desc: `${v.passQty} units added to stock. New expiry: ${formatDate(newExpiry)}.`,
  });
  showToast(`Approved! ${v.passQty} units of ${v.medName} added to stock.`, 'success');
}
 
/* ─────────────────────────────────────────
   THRESHOLD SETTINGS
───────────────────────────────────────── */
function renderThreshold() {
  const tbody = document.getElementById('thresholdBody');
  if (!tbody) return;
 
  tbody.innerHTML = appState.medicines.map((m, idx) => `
    <tr>
      <td class="mono">${m.id}</td>
      <td style="font-weight:500;">${m.name}</td>
      <td>${m.qty}</td>
      <td>
        <span style="font-weight:600;color:var(--blue);">${m.threshold}</span>
        <span style="color:var(--text4);font-size:11px;"> units</span>
      </td>
      <td>
        <button class="btn-icon" onclick="openThresholdModal(${idx})" title="Edit threshold"><i class="fa fa-pen"></i></button>
      </td>
    </tr>
  `).join('');
}
 
function openThresholdModal(idx) {
  const m = appState.medicines[idx];
  document.getElementById('modalThresholdTitle').textContent = `Edit Threshold — ${m.name}`;
  document.getElementById('modalMedName').value    = m.name;
  document.getElementById('modalThresholdVal').value = m.threshold;
  document.getElementById('modalThreshold').dataset.idx = idx;
  document.getElementById('modalThreshold').classList.remove('hidden');
}
 
function closeThresholdModal(e) {
  if (e && e.target !== document.getElementById('modalThreshold')) return;
  document.getElementById('modalThreshold').classList.add('hidden');
}
 
function saveThreshold() {
  const idx = parseInt(document.getElementById('modalThreshold').dataset.idx);
  const val = parseInt(document.getElementById('modalThresholdVal').value);
  if (!val || val < 1) { showToast('Please enter a valid threshold value.', 'error'); return; }
  appState.medicines[idx].threshold = val;
  saveState();
  closeThresholdModal();
  renderThreshold();
  renderAllBadges();
  showToast('Threshold updated successfully.', 'success');
}
 
/* ── Add Medicine Modal ── */
function openAddMedModal() {
  document.getElementById('addMedId').value = '';
  document.getElementById('addMedName').value = '';
  document.getElementById('addMedQty').value = '';
  document.getElementById('addMedExpiry').value = '';
  document.getElementById('addMedThreshold').value = '';
  document.getElementById('modalAddMed').classList.remove('hidden');
}
 
function closeAddMedModal(e) {
  if (e && e.target !== document.getElementById('modalAddMed')) return;
  document.getElementById('modalAddMed').classList.add('hidden');
}
 
function saveNewMedicine() {
  const id        = document.getElementById('addMedId').value.trim().toUpperCase();
  const name      = document.getElementById('addMedName').value.trim();
  const qty       = parseInt(document.getElementById('addMedQty').value);
  const expiry    = document.getElementById('addMedExpiry').value;
  const threshold = parseInt(document.getElementById('addMedThreshold').value);
 
  if (!id || !name || isNaN(qty) || !expiry || isNaN(threshold)) {
    showToast('Please fill in all fields.', 'error'); return;
  }
  if (appState.medicines.find(m => m.id === id)) {
    showToast('Medicine ID already exists.', 'error'); return;
  }
 
  appState.medicines.push({ id, name, qty, expiry, threshold });
  saveState();
  closeAddMedModal();
  renderThreshold();
  renderAllBadges();
  showToast(`${name} added successfully.`, 'success');
}
 
/* ─────────────────────────────────────────
   ANALYTICS
───────────────────────────────────────── */
let selectedAnalyticsMed = null;
 
function renderAnalytics() {
  // AI alerts
  const aiEl = document.getElementById('aiAlerts');
  if (aiEl) {
    aiEl.innerHTML = AI_ALERTS.map(a =>
      `<div class="ai-alert-item">
        <i class="fa ${a.icon}" style="color:${a.color};"></i>
        <span>${a.text}</span>
      </div>`
    ).join('');
  }
 
  // Medicine selector
  const grid = document.getElementById('medSelectorGrid');
  if (grid) {
    grid.innerHTML = appState.medicines.map(m => {
      const s = getMedStatus(m);
      const borderColor = s === 'expired' ? 'var(--red)' : s === 'near-expiry' ? 'var(--orange)' : s === 'low' ? 'var(--yellow)' : '';
      const borderStyle = borderColor ? `border-left: 3px solid ${borderColor};` : '';
      const isActive = selectedAnalyticsMed === m.id ? 'active' : '';
      return `<button class="med-selector-btn ${isActive}" style="${borderStyle}" onclick="selectAnalyticsMed('${m.id}')">
        <strong>${m.id}</strong> — ${m.name}
      </button>`;
    }).join('');
  }
 
  if (selectedAnalyticsMed) {
    showAnalyticsDetail(selectedAnalyticsMed);
  }
}
 
function selectAnalyticsMed(medId) {
  selectedAnalyticsMed = medId;
  renderAnalytics();
}
 
function showAnalyticsDetail(medId) {
  const med = appState.medicines.find(m => m.id === medId);
  if (!med) return;
 
  const detail = document.getElementById('analyticsDetail');
  detail.classList.remove('hidden');
  document.getElementById('analyticsDetailTitle').textContent = `${med.id} — ${med.name}`;
 
  // Generate simulated daily usage data
  const dailyUsage = generateDailyUsage(med);
 
  // Summary cards
  const totalUsed7d = dailyUsage.reduce((a, d) => a + d.used, 0);
  const avgDaily    = (totalUsed7d / 7).toFixed(1);
  const daysLeft    = getDaysToExpiry(med.expiry);
 
  document.getElementById('analyticsCards').innerHTML = `
    <div class="analytics-stat">
      <div class="analytics-stat-label">Current Stock</div>
      <div class="analytics-stat-value" style="color:${med.qty < med.threshold ? 'var(--red)' : 'var(--text)'};">${med.qty}</div>
    </div>
    <div class="analytics-stat">
      <div class="analytics-stat-label">Threshold</div>
      <div class="analytics-stat-value">${med.threshold}</div>
    </div>
    <div class="analytics-stat">
      <div class="analytics-stat-label">7-Day Usage</div>
      <div class="analytics-stat-value" style="color:var(--blue);">${totalUsed7d}</div>
    </div>
    <div class="analytics-stat">
      <div class="analytics-stat-label">Avg Daily</div>
      <div class="analytics-stat-value">${avgDaily}</div>
    </div>
    <div class="analytics-stat">
      <div class="analytics-stat-label">Days to Expiry</div>
      <div class="analytics-stat-value" style="color:${daysLeft < 0 ? 'var(--red)' : daysLeft <= 10 ? 'var(--orange)' : 'var(--green)'};">${daysLeft < 0 ? 'Expired' : daysLeft + 'd'}</div>
    </div>
  `;
 
  // Daily usage table
  const dailyBody = document.getElementById('dailyUsageBody');
  if (dailyBody) {
    dailyBody.innerHTML = dailyUsage.map(d =>
      `<tr>
        <td>${formatDate(d.date)}</td>
        <td style="font-weight:500;">${d.used}</td>
        <td>${d.remaining}</td>
      </tr>`
    ).join('');
  }
 
  // Stockout prediction
  const stockoutEl = document.getElementById('stockoutPrediction');
  if (stockoutEl) {
    const daysToStockout = avgDaily > 0 ? Math.floor(med.qty / parseFloat(avgDaily)) : '∞';
    const stockoutDate = avgDaily > 0
      ? (() => { const d = new Date(TODAY); d.setDate(d.getDate() + Math.floor(med.qty / parseFloat(avgDaily))); return formatDate(d.toISOString().split('T')[0]); })()
      : 'N/A';
    const reorderDays = avgDaily > 0 ? Math.max(0, Math.floor((med.qty - med.threshold) / parseFloat(avgDaily))) : '—';
 
    stockoutEl.innerHTML = `
      <div class="stockout-row"><span style="color:var(--text3);">Avg daily dispensing</span><strong>${avgDaily} units/day</strong></div>
      <div class="stockout-row"><span style="color:var(--text3);">Estimated stockout</span><strong style="color:${typeof daysToStockout === 'number' && daysToStockout < 7 ? 'var(--red)' : 'var(--text)'};">${daysToStockout} days (${stockoutDate})</strong></div>
      <div class="stockout-row"><span style="color:var(--text3);">Reorder in</span><strong style="color:var(--orange);">${reorderDays} days</strong></div>
      <div class="stockout-row"><span style="color:var(--text3);">Monthly trend</span><strong>${totalUsed7d > 20 ? '↑ Increasing' : '→ Stable'}</strong></div>
    `;
  }
}
 
function generateDailyUsage(med) {
  const result = [];
  let running = med.qty + Math.floor(Math.random() * 20 + 10); // simulate slightly higher starting point
  for (let i = 6; i >= 0; i--) {
    const date = new Date(TODAY);
    date.setDate(date.getDate() - i);
    const used = Math.floor(Math.random() * 6 + 1);
    running = Math.max(0, running - used);
    result.push({ date: date.toISOString().split('T')[0], used, remaining: running });
  }
  return result;
}
 
function closeAnalyticsDetail() {
  selectedAnalyticsMed = null;
  document.getElementById('analyticsDetail').classList.add('hidden');
  renderAnalytics();
}
 
/* ─────────────────────────────────────────
   TOAST
───────────────────────────────────────── */
function showToast(msg, type = 'info') {
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warn: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  const t = document.createElement('div');
  t.className = `toast t-${type}`;
  t.innerHTML = `<i class="fa ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(20px)'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, 3500);
}
 
/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  updateTopbarDate();
 
  // Allow Enter key on any login field
  ['loginName', 'loginPw', 'loginRole'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
 
  // Close modals on overlay click
  document.getElementById('modalThreshold')?.addEventListener('click', closeThresholdModal);
  document.getElementById('modalAddMed')?.addEventListener('click', closeAddMedModal);
  document.getElementById('modalVerifApprove')?.addEventListener('click', closeVerifApproveModal);
});