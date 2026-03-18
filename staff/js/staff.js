import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, collection, onSnapshot,
  updateDoc, getDocs, query, where,
  serverTimestamp, increment, getDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3g7-_ldguMjweIHrIduBNJOcJ3201bQc",
  authDomain: "etickette-78f74.firebaseapp.com",
  projectId: "etickette-78f74",
  storageBucket: "etickette-78f74.firebasestorage.app",
  messagingSenderId: "147547566302",
  appId: "1:147547566302:web:2c7a52792b539331d8524f"
};

let STAFF_PIN = '1234';
let app, db;
let staffDept      = 'cashier';
let currentTicket  = null;
let serveStartTime = null;
let timerInterval  = null;
let serveTimes     = [];
let servedToday    = 0;
let noShowToday    = 0;
let unsubQueue     = null;
let unsubDept      = null;

window.selectDept         = selectDept;
window.staffLogin         = staffLogin;
window.staffLogout        = staffLogout;
window.setDeptStatus      = setDeptStatus;
window.callNextTicket     = callNextTicket;
window.completeTicket     = completeTicket;
window.noShowTicket       = noShowTicket;
window.recallTicket       = recallTicket;
window.markManualComplete = markManualComplete;
window.dailyReset         = dailyReset;
window.setDailyQuota = setDailyQuota;

app = initializeApp(firebaseConfig);
db  = getFirestore(app);

(async () => {
  try {
    const snap = await getDoc(doc(db, 'system', 'settings'));
    if (snap.exists() && snap.data().staffPin) STAFF_PIN = snap.data().staffPin;
  } catch (e) { console.warn('[PIN load] Using default.', e.message); }
})();

updateClock();
setInterval(updateClock, 1000);

function updateClock() {
  const el = document.getElementById('dashTime');
  if (el) el.textContent = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

function selectDept(dept) {
  staffDept = dept;
  document.querySelectorAll('.dept-opt').forEach(b =>
    b.classList.toggle('active', b.dataset.dept === dept));
}

function staffLogin() {
  const pin = document.getElementById('pinInput').value.trim();
  const err = document.getElementById('loginErr');
  if (pin !== STAFF_PIN) {
    err.textContent = 'Incorrect PIN. Try again.';
    document.getElementById('pinInput').value = '';
    return;
  }
  err.textContent = '';
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('dashboard').classList.remove('hidden');
  document.getElementById('deptTag').textContent = staffDept.toUpperCase();
  startDashboard();
}

function staffLogout() {
  if (!confirm('Log out of Staff Dashboard?')) return;
  if (unsubQueue) unsubQueue();
  if (unsubDept)  unsubDept();
  clearInterval(timerInterval);
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('pinInput').value = '';
  currentTicket = null;
}

async function checkAutoReset() {
    const now = new Date();
    const today8am = new Date();
    today8am.setHours(8, 0, 0, 0);

    const dSnap = await getDoc(doc(db, 'departments', staffDept));
    const lastReset = dSnap.data()?.lastResetAt?.toDate?.();

    if (now >= today8am && (!lastReset || lastReset < today8am)) {
        await dailyReset();
    }
}

function startDashboard() {
  listenToDept();
  listenToQueue();
  listenToQuota();
  checkAutoReset();
  loadTodayStats();
}

async function setDailyQuota() {
    const input = document.getElementById('quotaInput');
    const val   = parseInt(input.value);

    if (!val || val < 1 || val > 999) {
        alert('Enter a valid number between 1 and 999.');
        return;
    }

    try {
        await updateDoc(doc(db, 'system', 'settings'), { dailyQuota: val });
        alert(`Quota set to ${val} tickets.`);
        input.value = '';
    } catch (e) {
        alert(`Failed to update quota.`);
        console.error('[setQuota]', e);
    }
}

function listenToQuota() {
    onSnapshot(doc(db, 'system', 'settings'), snap => {
        if (!snap.exists()) return;
        const data      = snap.data();
        const quota     = data.dailyQuota    || 100;
        const issued    = data.ticketsIssued || 0;
        const remaining = Math.max(0, quota - issued);
        const pct       = Math.min(100, Math.round((issued / quota) * 100));

        const statIssued = document.getElementById('statIssued');
        if (statIssued) statIssued.textContent = issued;

        const display = document.getElementById('quotaStatusDisplay');
        const sub     = document.getElementById('quotaStatusSub');

        if (display) {
            display.textContent = `${issued}/${quota}`;
            display.style.color = pct >= 90 ? '#dc2626' : pct >= 70 ? '#f97316' : '#2563eb';
        }
        if (sub) {
            sub.textContent = remaining === 0 ? '🔴 Full' : `${remaining} left`;
            sub.style.color = remaining === 0 ? '#dc2626' : remaining <= 10 ? '#f97316' : '#6b7280';
        }
    });
}

function listenToDept() {
  if (unsubDept) unsubDept();
  unsubDept = onSnapshot(doc(db, 'departments', staffDept), snap => {
    if (!snap.exists()) return;
    const st  = (snap.data().status || 'open').toLowerCase();
    const map = { open: 'btnOpen', break: 'btnBreak', closed: 'btnClosed' };
    ['btnOpen','btnBreak','btnClosed'].forEach(id => document.getElementById(id).classList.remove('active'));
    const btn = document.getElementById(map[st] || 'btnOpen');
    if (btn) btn.classList.add('active');
    document.getElementById('queueCount').textContent = snap.data().queue || 0;
  });
}

function listenToQueue() {
  if (unsubQueue) unsubQueue();
  const q = query(collection(db, 'tickets'), where('department', '==', staffDept));
  unsubQueue = onSnapshot(q, snap => {
    const all     = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const waiting = all.filter(t => t.status === 'waiting')
      .sort((a, b) => (a.issuedAt?.toMillis?.() || 0) - (b.issuedAt?.toMillis?.() || 0));
    const serving = all.find(t => t.status === 'serving');

    renderQueue(waiting);
    updateStats(waiting);

    if (serving) {
      const isNew = !currentTicket || currentTicket.ticketNumber !== serving.ticketNumber;
      currentTicket = serving;
      renderServing(serving, isNew);
    } else {
      currentTicket = null;
      clearServing();
    }

    document.getElementById('queueBadge').textContent = waiting.length;
    document.getElementById('queueCount').textContent = waiting.length + (serving ? 1 : 0);
    document.getElementById('btnCallNext').disabled   = waiting.length === 0;
  });
}

async function loadTodayStats() {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const deptSnap = await getDoc(doc(db, 'departments', staffDept));
    const lastReset = deptSnap.data()?.lastResetAt?.toDate?.() || startOfDay;
    const countFrom = lastReset > startOfDay ? lastReset : startOfDay;

    const [completedSnap, noshowSnap] = await Promise.all([
      getDocs(query(collection(db, 'tickets'),
        where('department', '==', staffDept),
        where('status', '==', 'completed')
      )),
      getDocs(query(collection(db, 'tickets'),
        where('department', '==', staffDept),
        where('status', '==', 'noshow')
      ))
    ]);

    servedToday = completedSnap.docs.filter(d => {
      const t = d.data().completedAt?.toDate?.();
      return t && t >= countFrom; 
    }).length;

    noShowToday = noshowSnap.docs.filter(d => {
      const t = d.data().completedAt?.toDate?.();
      return t && t >= countFrom;  
    }).length;

    document.getElementById('statServed').textContent  = servedToday;
    document.getElementById('statNoShow').textContent  = noShowToday;
    const sc = document.getElementById('servedCount');
    if (sc) sc.textContent = servedToday;
  } catch (e) {
    console.warn('[loadTodayStats]', e.message);
  }
}

function renderQueue(waiting) {
  const el = document.getElementById('queueList');
  if (waiting.length === 0) { el.innerHTML = '<div class="queue-empty">No tickets waiting</div>'; return; }
  el.innerHTML = '';
  waiting.forEach((t, i) => {
    const item = document.createElement('div');
    item.className = 'queue-item';
    const tag  = t.isReservation ? '<span class="queue-tag reservation">Reservation</span>' : '<span class="queue-tag walkin">Walk-in</span>';
    const time = t.issuedAt?.toDate ? t.issuedAt.toDate().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—';
    item.innerHTML = `
      <div class="queue-num">${t.ticketNumber}</div>
      <div class="queue-details">
        <div class="q-name">${t.userId || t.displayName || '—'}</div>
        <div class="q-reason">${t.reason || '—'}</div>
        <div class="q-time">Issued: ${time}</div>
      </div>
      ${tag}
      <div class="queue-pos">#${i + 1}</div>`;
    el.appendChild(item);
  });
}

function renderServing(ticket, isNew = true) {
  document.getElementById('servingNumber').textContent = ticket.ticketNumber;
  document.getElementById('servingUserId').textContent = '🪪 Student No: ' + (ticket.userId || ticket.displayName || '—');  document.getElementById('servingReason').textContent = '📝 ' + (ticket.reason || '—');
  document.getElementById('servingType').textContent   = ticket.isReservation ? '📅 Reservation' : '🚶 Walk-in';
  document.getElementById('btnComplete').disabled      = false;
  document.getElementById('btnNoshow').disabled        = false;
  if (isNew && !serveStartTime) { serveStartTime = Date.now(); startTimer(); }
}

function clearServing() {
  ['servingNumber','servingUserId','servingReason','servingType'].forEach(id =>
    document.getElementById(id).textContent = '—');
  document.getElementById('btnComplete').disabled     = true;
  document.getElementById('btnNoshow').disabled       = true;
  document.getElementById('servingTimer').textContent = '00:00';
  document.getElementById('servingTimer').className   = 'serving-timer';
  serveStartTime = null;
  clearInterval(timerInterval);
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!serveStartTime) return;
    const e = Math.floor((Date.now() - serveStartTime) / 1000);
    const el = document.getElementById('servingTimer');
    el.textContent = String(Math.floor(e / 60)).padStart(2,'0') + ':' + String(e % 60).padStart(2,'0');
    el.className = e > 600 ? 'serving-timer over' : e > 300 ? 'serving-timer warn' : 'serving-timer';
  }, 1000);
}

function updateStats(waiting) {
  document.getElementById('statWaiting').textContent = waiting.length;
  document.getElementById('statServed').textContent  = servedToday;
  document.getElementById('statNoShow').textContent  = noShowToday;
  const avg   = serveTimes.length > 0 ? Math.round(serveTimes.reduce((a,b) => a+b, 0) / serveTimes.length) : null;
  const avgEl = document.getElementById('avgWait');
  if (avgEl) avgEl.textContent = avg ? Math.floor(avg/60) + 'm ' + (avg%60) + 's' : '—';
  const scEl  = document.getElementById('servedCount');
  if (scEl)   scEl.textContent = servedToday;
}

async function callNextTicket() {
  try {
    const snap = await getDocs(query(collection(db,'tickets'),
      where('department','==',staffDept), where('status','==','waiting')));
    if (snap.empty) return;

    const next = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => (a.issuedAt?.toMillis?.() || 0) - (b.issuedAt?.toMillis?.() || 0))[0];

    if (currentTicket && currentTicket.status === 'serving') {
      const ok = await showConfirmDialog(
        `Complete ticket ${currentTicket.ticketNumber} and call ${next.ticketNumber}?`,
        'Mark as Completed & Call Next', 'Cancel');
      if (!ok) return;
      await finishServing(currentTicket, 'completed');
      servedToday++;
      document.getElementById('statServed').textContent = servedToday;
      const sc = document.getElementById('servedCount');
      if (sc) sc.textContent = servedToday;
      addActivity('completed', currentTicket.ticketNumber, currentTicket.displayName || currentTicket.userId || '—');
    }

    serveStartTime = Date.now();
    clearInterval(timerInterval);
    await updateDoc(doc(db,'tickets',next.id), {
      status:'serving', calledAt:serverTimestamp(), called:true, notified:true, notifiedAt:serverTimestamp()
    });
    await updateDoc(doc(db,'departments',staffDept), { nowServing: next.ticketNumber });
    addActivity('called', next.ticketNumber, next.displayName || next.userId || '—');
    startTimer();
  } catch (e) { console.error('[callNext]', e); }
}

function showConfirmDialog(message, confirmText, cancelText) {
  return new Promise(resolve => {
    const ex = document.getElementById('confirmDialog');
    if (ex) ex.remove();
    const o = document.createElement('div');
    o.id = 'confirmDialog';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999;';
    o.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:360px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,.25);text-align:center;">
        <div style="font-size:32px;margin-bottom:12px;">📣</div>
        <p style="font-size:15px;font-weight:600;color:#1a1a2e;line-height:1.5;margin-bottom:20px;">${message}</p>
        <div style="display:flex;gap:10px;">
          <button id="dlgCancel"  style="flex:1;padding:12px;border:2px solid #e5e7eb;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;background:#fff;color:#6b7280;font-family:inherit;">${cancelText}</button>
          <button id="dlgConfirm" style="flex:1;padding:12px;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;background:linear-gradient(90deg,#2563eb,#1f3c88);color:#fff;font-family:inherit;">${confirmText}</button>
        </div>
      </div>`;
    document.body.appendChild(o);
    document.getElementById('dlgConfirm').onclick = () => { o.remove(); resolve(true); };
    document.getElementById('dlgCancel').onclick  = () => { o.remove(); resolve(false); };
  });
}

async function completeTicket() {
  if (!currentTicket) return;
  await finishServing(currentTicket, 'completed');
  servedToday++;
  document.getElementById('statServed').textContent = servedToday;
  const sc = document.getElementById('servedCount');
  if (sc) sc.textContent = servedToday;
  addActivity('completed', currentTicket.ticketNumber, currentTicket.displayName || currentTicket.userId || '—');
  currentTicket = null; clearServing();
}

async function noShowTicket() {
  if (!currentTicket) return;
  await finishServing(currentTicket, 'noshow');
  noShowToday++;
  document.getElementById('statNoShow').textContent = noShowToday;
  addActivity('noshow', currentTicket.ticketNumber, currentTicket.displayName || currentTicket.userId || '—');
  currentTicket = null; clearServing();
}

async function finishServing(ticket, status) {
  try {
    if (serveStartTime) { serveTimes.push(Math.floor((Date.now()-serveStartTime)/1000)); if(serveTimes.length>20)serveTimes.shift(); }
    serveStartTime = null; clearInterval(timerInterval);
    await updateDoc(doc(db,'tickets',ticket.id), { status, completedAt:serverTimestamp() });
    await updateDoc(doc(db,'departments',staffDept), { queue:increment(-1), nowServing:'' });

    if (ticket.isReservation && ticket.reservationId) {
      try {
        await updateDoc(doc(db, 'reservations', ticket.reservationId), {
          status: status === 'completed' ? 'completed' : 'noshow',
          completedAt: serverTimestamp()
        });
      } catch (e) { console.warn('[finishServing] reservation update:', e.message); }
    }

  } catch (e) { console.error('[finishServing]', e); }
}

async function setDeptStatus(status) {
  try {
    await updateDoc(doc(db,'departments',staffDept), { status });
    const map = { open:'btnOpen', break:'btnBreak', closed:'btnClosed' };
    ['btnOpen','btnBreak','btnClosed'].forEach(id => document.getElementById(id).classList.remove('active'));
    document.getElementById(map[status]).classList.add('active');
  } catch (e) { console.error('[setStatus]', e); }
}

async function recallTicket() {
  const input = document.getElementById('recallInput');
  const tNum  = input.value.trim().toUpperCase();
  if (!tNum) return;
  try {
    const snap = await getDoc(doc(db,'tickets',tNum));
    if (!snap.exists()) { alert('Ticket not found: ' + tNum); return; }
    addActivity('called', tNum, snap.data().displayName || snap.data().userId || '—');
    input.value = '';
  } catch (e) { console.error('[recall]', e); }
}

async function markManualComplete() {
  const input = document.getElementById('manualInput');
  const tNum  = input.value.trim().toUpperCase();
  if (!tNum) return;
  try {
    const snap = await getDoc(doc(db,'tickets',tNum));
    if (!snap.exists()) { alert('Ticket not found: ' + tNum); return; }
    const ticketData = snap.data();
    await updateDoc(doc(db,'tickets',tNum), { status:'completed', completedAt:serverTimestamp() });
    const st = ticketData.status;
    if (st === 'waiting' || st === 'serving')
      await updateDoc(doc(db,'departments',staffDept), { queue:increment(-1) });
    if (ticketData.isReservation && ticketData.reservationId) {
      try {
        await updateDoc(doc(db,'reservations', ticketData.reservationId), {
          status: 'completed', completedAt: serverTimestamp()
        });
      } catch (e) { console.warn('[markManualComplete] reservation sync:', e.message); }
    }
    servedToday++;
    document.getElementById('statServed').textContent = servedToday;
    addActivity('completed', tNum, '—');
    input.value = '';
  } catch (e) { alert('Could not update ticket.'); }
}

async function dailyReset(auto = false) {
  if (!auto) {
    const ok1 = await showConfirmDialog(
      '⚠️ This will reset ALL ticket counters and clear today\'s queue. This cannot be undone.',
      '🔄 Yes, Reset for Today', 'Cancel');
    if (!ok1) return;
    const ok2 = await showConfirmDialog(
      'Last chance — ALL active and waiting tickets will be cleared. Proceed?',
      'Reset Now', 'Go Back');
    if (!ok2) return;
  }

  try {
    const ticketSnap = await getDocs(query(collection(db,'tickets'), where('status','in',['waiting','serving'])));
    let batches = [], current = writeBatch(db), count = 0;
    ticketSnap.docs.forEach(d => {
      current.update(d.ref, { status:'cancelled', cancelledAt:serverTimestamp() });
      if (++count % 400 === 0) { batches.push(current); current = writeBatch(db); }
    });
    batches.push(current);
    await Promise.all(batches.map(b => b.commit()));

    const resSnap = await getDocs(query(collection(db,'reservations'), where('status', 'in', ['pending', 'active'])));
    if (!resSnap.empty) {
      const rb = writeBatch(db);
      resSnap.docs.forEach(d => rb.update(d.ref, { status:'expired', expiredAt:serverTimestamp() }));
      await rb.commit();
    }

    for (const dept of ['cashier','registrar'])
      await updateDoc(doc(db,'departments',dept), {
        counter: 0, queue: 0, nowServing: '', lastResetAt: serverTimestamp()
      });
    await updateDoc(doc(db,'system','settings'), { ticketsIssued: 0 });

    servedToday = 0; noShowToday = 0; serveTimes = []; currentTicket = null;
    clearServing();
    ['statIssued','statServed','statNoShow','statWaiting'].forEach(id =>
      document.getElementById(id).textContent = 0);
    const sc = document.getElementById('servedCount');
    if (sc) sc.textContent = 0;
    document.getElementById('activityLog').innerHTML = '<div class="activity-empty">No activity yet</div>';
    addActivity('called', '—', 'System reset for new day');
    showToast('✅ System reset! Ready for today\'s queue.', 'success');

  } catch (e) {
    console.error('[dailyReset]', e);
    showToast('Reset failed: ' + e.message, 'error');
  }
}


function addActivity(type, tNum, name) {
  const log   = document.getElementById('activityLog');
  const empty = log.querySelector('.activity-empty');
  if (empty) empty.remove();
  const icons  = { called:'📣', completed:'✅', noshow:'❌' };
  const labels = { called:'Called', completed:'Served', noshow:'No-Show' };
  const now    = new Date().toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit' });
  const item   = document.createElement('div');
  item.className = `activity-item ${type}`;
  item.innerHTML = `<span class="a-icon">${icons[type]}</span><span class="a-num">${tNum}</span><span class="a-label">${labels[type]} · ${name}</span><span class="a-time">${now}</span>`;
  log.insertBefore(item, log.firstChild);
  while (log.children.length > 20) log.removeChild(log.lastChild);
}

function showToast(msg, type = 'info') {
  let t = document.getElementById('staffToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'staffToast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:10px;font-size:14px;font-weight:600;color:#fff;z-index:9999;opacity:0;transition:opacity .3s;font-family:\'Plus Jakarta Sans\',sans-serif;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.2);';
    document.body.appendChild(t);
  }
  const colors = { success:'#16a34a', error:'#dc2626', info:'#2563eb', warning:'#d97706' };
  t.style.background = colors[type] || colors.info;
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, 3500);
}