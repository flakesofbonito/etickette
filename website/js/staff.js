import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, collection, onSnapshot,
  updateDoc, getDocs, query, where,
  serverTimestamp, increment, getDoc, writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3g7-_ldguMjweIHrIduBNJOcJ3201bQc",
  authDomain: "etickette-78f74.firebaseapp.com",
  projectId: "etickette-78f74",
  storageBucket: "etickette-78f74.firebasestorage.app",
  messagingSenderId: "147547566302",
  appId: "1:147547566302:web:2c7a52792b539331d8524f",
  measurementId: "G-QHMMWXW7F3"
};

let STAFF_PIN = '1234';
let app, db;
let staffDept      = 'cashier';
let currentTicket  = null;
let serveStartTime = null;
let timerInterval  = null;
let noShowTimer = null;
const NOSHOW_TIMEOUT_SEC = 180;
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
window.setStatusMessage   = setStatusMessage;
window.clearStatusMessage = clearStatusMessage;
window.exportCSV          = exportCSV;
window.toggleActivity = function() {
    const log = document.getElementById('activityLog');
    const btn = document.getElementById('activityToggle');
    const hidden = log.style.display === 'none';
    log.style.display = hidden ? 'flex' : 'none';
    btn.textContent = hidden ? '▲ hide' : '▼ show';
};

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

  if (now < today8am) return;

  try {
    const dSnap = await getDoc(doc(db, 'departments', staffDept));
    const lastReset = dSnap.data()?.lastResetAt?.toDate?.();

    if (lastReset && lastReset >= today8am) return; 

    const ok = await showConfirmDialog(
      'The system has not been reset today. Would you like to reset now to start today\'s queue?',
      'Yes, Reset Now',
      'No, Keep Yesterday\'s Data'
    );

    if (ok) await dailyReset(true);

  } catch (e) {
    console.warn('[checkAutoReset]', e.message);
  }
}

function startDashboard() {
  const label = document.getElementById('quotaDeptLabel');
  if (label) {
    label.value = staffDept.toUpperCase();
  }
  const qSelect = document.getElementById('quotaDeptSelect');
  if (qSelect) {
    const dLabel = staffDept.charAt(0).toUpperCase() + staffDept.slice(1);
    qSelect.innerHTML = `
      <option value="${staffDept}">${dLabel}</option>
      <option value="both">Both Departments</option>`;
    qSelect.value = staffDept;
  }
  listenToDept();
  listenToQueue();
  listenToQuota();
  checkAutoReset();
  loadTodayStats();
  expireOldReservations();
}

async function expireOldReservations() {
    try {
        const todayPH = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        const snap = await getDocs(query(
            collection(db, 'reservations'),
            where('status', '==', 'pending')
        ));
        const expired = snap.docs.filter(d => {
            const date = d.data().reservationDate;
            return date && date < todayPH;
        });
        if (expired.length === 0) return;
        const batch = writeBatch(db);
        expired.forEach(d => batch.update(d.ref, {
            status: 'expired',
            expiredAt: serverTimestamp()
        }));
        await batch.commit();
        console.log(`[expireOldRes] Expired ${expired.length} old reservations.`);
    } catch (e) { console.warn('[expireOldRes]', e.message); }
}

async function setDailyQuota() {
    const input = document.getElementById('quotaInput');
    const val   = parseInt(input.value);

    if (!val || val < 1 || val > 999) {
        alert('Enter a valid number between 1 and 999.');
        return;
    }

    try {
        await updateDoc(doc(db, 'system', 'settings'), {
            [staffDept + 'Quota']: val
        });

        alert(`${staffDept.toUpperCase()} quota updated.`);
        input.value = '';
    } catch (e) {
        alert('Failed to update quota.');
    }
}

function listenToQuota() {
    onSnapshot(doc(db, 'system', 'settings'), snap => {
        if (!snap.exists()) return;
        const data       = snap.data();
        const myQuota    = data[staffDept + 'Quota']  || data.dailyQuota || 100;
        const myIssued   = data[staffDept + 'Issued'] || 0;
        const myRem      = Math.max(0, myQuota - myIssued);
        const pct        = myQuota > 0 ? Math.min(100, Math.round((myIssued / myQuota) * 100)) : 0;

        const statIssued = document.getElementById('statIssued');
        if (statIssued) statIssued.textContent = myIssued;

        const display = document.getElementById('quotaStatusDisplay');
        const sub     = document.getElementById('quotaStatusSub');

        if (display) {
            display.textContent  = `${myIssued} / ${myQuota}`;
            display.style.fontSize = '';
            display.style.color  = pct >= 90 ? '#dc2626' : pct >= 70 ? '#f97316' : '#2563eb';
        }
        if (sub) {
            sub.textContent      = myRem === 0 ? 'Quota Full' : `${myRem} left`;
            sub.style.fontWeight = myRem === 0 ? '800' : '';
            sub.style.color      = myRem === 0 ? '#dc2626' : myRem <= 10 ? '#f97316' : '#6b7280';
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
  const q = query(
      collection(db, 'tickets'),
      where('department', '==', staffDept),
      where('status', 'in', ['waiting', 'serving'])
  );
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

        let docsHtml = '';
        if (t.requiredDocs && t.requiredDocs.length > 0) {
            const docItems = t.requiredDocs.map(d =>
                `<span class="queue-doc-item">${d}</span>`
            ).join('');
            docsHtml = `<div class="queue-docs">${docItems}</div>`;
        }

        item.innerHTML = `
            <div class="queue-num">${t.ticketNumber}</div>
            <div class="queue-details">
                <div class="q-name">${t.userId || t.displayName || '—'}</div>
                <div class="q-reason">${t.reason || '—'}</div>
                ${docsHtml}
                <div class="q-time">Issued: ${time}</div>
            </div>
            ${tag}
            <div class="queue-pos">#${i + 1}</div>`;
        el.appendChild(item);
    });
}

function renderServing(ticket, isNew = true) {
  document.getElementById('servingNumber').textContent = ticket.ticketNumber;
  document.getElementById('servingUserId').textContent = 'ID: ' + (ticket.userId || ticket.displayName || '—');
  document.getElementById('servingReason').textContent = (ticket.reason || '—');
  document.getElementById('servingType').textContent   = ticket.isReservation ? 'Reservation' : 'Walk-in';
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
  clearTimeout(noShowTimer); 
}

function startTimer() {
  clearInterval(timerInterval);
  clearTimeout(noShowTimer);

  noShowTimer = setTimeout(async () => {
    if (!currentTicket) return;
    const ok = await showConfirmDialog(
      `Ticket ${currentTicket.ticketNumber} has been waiting ${Math.floor(NOSHOW_TIMEOUT_SEC / 60)} minutes with no response. Mark as No-Show?`,
      'Mark No-Show', 'Keep Waiting'
    );
    if (ok) {
      await noShowTicket();
    } else {
      startTimer();
    }
  }, NOSHOW_TIMEOUT_SEC * 1000);

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
  if (avg) {
      updateDoc(doc(db, 'departments', staffDept), { avgWaitSeconds: avg }).catch(() => {});
  }
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

    clearTimeout(noShowTimer);
    serveStartTime = Date.now();
    clearInterval(timerInterval);
    await updateDoc(doc(db,'tickets',next.id), {
        status:'serving', calledAt:serverTimestamp(), 
        called:true
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
        <div style="margin-bottom:12px;display:flex;justify-content:center;"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--blue-800)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg></div>
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
  clearTimeout(noShowTimer);
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
    clearTimeout(noShowTimer);
    if (!currentTicket) return;

    const ticketNum  = currentTicket.ticketNumber;
    const ticketName = currentTicket.displayName || currentTicket.userId || '—';

    await finishServing(currentTicket, 'noshow');
    noShowToday++;
    document.getElementById('statNoShow').textContent = noShowToday;
    addActivity('noshow', ticketNum, ticketName);
    currentTicket = null;
    clearServing();

    const snap = await getDocs(query(
        collection(db, 'tickets'),
        where('department', '==', staffDept),
        where('status', '==', 'waiting')
    ));
    if (snap.empty) return;

    let secondsLeft = 3;
    let cancelled   = false;

    const callNextBtn = document.getElementById('btnCallNext');
    if (callNextBtn) callNextBtn.disabled = true;

    const toast = document.createElement('div');
    toast.id    = 'autoCallToast';
    toast.style.cssText = `
        position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
        background:var(--blue-800); color:#fff;
        padding:14px 24px; border-radius:12px;
        font-size:14px; font-weight:600;
        display:flex; align-items:center; gap:14px;
        box-shadow:0 4px 20px rgba(0,0,0,.25);
        z-index:9999; font-family:var(--font);
        white-space:nowrap;
    `;
    toast.innerHTML = `
        <span id="autoCallMsg">Calling next ticket in ${secondsLeft}s...</span>
        <button id="autoCallCancel" style="
            background:rgba(255,255,255,.15);
            border:1px solid rgba(255,255,255,.3);
            color:#fff; border-radius:8px;
            padding:6px 14px; font-size:13px;
            font-weight:700; cursor:pointer;
            font-family:var(--font);
        ">Cancel</button>
    `;
    document.body.appendChild(toast);

    document.getElementById('autoCallCancel').onclick = () => {
        cancelled = true;
        toast.remove();
        if (callNextBtn) callNextBtn.disabled = false;
    };

    const interval = setInterval(async () => {
        if (cancelled) { clearInterval(interval); return; }

        secondsLeft--;
        const msgEl = document.getElementById('autoCallMsg');
        if (msgEl) msgEl.textContent = `Calling next ticket in ${secondsLeft}s...`;

        if (secondsLeft <= 0) {
            clearInterval(interval);
            toast.remove();
            if (!cancelled) {
                if (callNextBtn) callNextBtn.disabled = false;
                await callNextTicket();
            }
        }
    }, 1000);
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
        const snap = await getDoc(doc(db, 'tickets', tNum));
        if (!snap.exists()) { alert('Ticket not found: ' + tNum); return; }
        const tData = snap.data();

        if (tData.status === 'cancelled') {
            alert(`Ticket ${tNum} was cancelled and cannot be recalled.`);
            return;
        }

        if (tData.status === 'completed' || tData.status === 'noshow') {
            const ok = await showConfirmDialog(
                `Ticket ${tNum} was already ${tData.status}. Recall it anyway? (e.g. forgot to tell the student something)`,
                'Yes, Recall Anyway', 'Cancel'
            );
            if (!ok) return;
        }

        if (currentTicket && currentTicket.status === 'serving') {
            const ok = await showConfirmDialog(
                `Ticket ${currentTicket.ticketNumber} is currently being served. Put it back in queue and recall ${tNum}?`,
                'Yes, Put Back & Recall', 'Cancel'
            );
            if (!ok) return;

            clearTimeout(noShowTimer);
            clearInterval(timerInterval);
            serveStartTime = null;

            await updateDoc(doc(db, 'tickets', currentTicket.id), {
                status: 'waiting',
                calledAt: null
            });
            await updateDoc(doc(db, 'departments', staffDept), {
                nowServing: ''
            });
            addActivity('called', currentTicket.ticketNumber, 'returned to queue');
        }

        if (tData.status === 'completed' || tData.status === 'noshow') {
            await updateDoc(doc(db, 'departments', staffDept), {
                queue: increment(1)
            });
        }

        await updateDoc(doc(db, 'tickets', tNum), {
            status: 'serving',
            calledAt: serverTimestamp(),
            called: true
        });
        await updateDoc(doc(db, 'departments', staffDept), { nowServing: tNum });

        serveStartTime = Date.now();
        clearInterval(timerInterval);
        startTimer();
        addActivity('called', tNum, tData.displayName || tData.userId || '—');
        input.value = '';

    } catch (e) {
        console.error('[recall]', e);
        alert('Could not recall ticket. Try again.');
    }
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
    await updateDoc(doc(db, 'departments', staffDept), {
        queue: increment(-1),
        ...(st === 'serving' ? { nowServing: '' } : {})
    });
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
      'This will reset ALL ticket counters and clear today\'s queue. This cannot be undone.',
      'Yes, Reset for Today', 'Cancel');
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
          counter: 0, queue: 0, nowServing: '', avgWaitSeconds: 0, lastResetAt: serverTimestamp()
      });
    await updateDoc(doc(db, 'system', 'settings'), {
        ticketsIssued: 0,
        cashierIssued: 0,   
        registrarIssued: 0  
    });

    servedToday = 0; noShowToday = 0; serveTimes = []; currentTicket = null;
    clearServing();
    ['statIssued','statServed','statNoShow','statWaiting'].forEach(id =>
      document.getElementById(id).textContent = 0);
    const sc = document.getElementById('servedCount');
    if (sc) sc.textContent = 0;
    document.getElementById('activityLog').innerHTML = '<div class="activity-empty">No activity yet</div>';
    addActivity('called', '—', 'System reset for new day');
    showToast('System reset. Ready for today\'s queue.', 'success');

  } catch (e) {
    console.error('[dailyReset]', e);
    showToast('Reset failed: ' + e.message, 'error');
  }
}

async function setStatusMessage() {
    const input = document.getElementById('statusMsgInput');
    const hint  = document.getElementById('statusMsgHint');
    const msg   = input.value.trim();
    if (!msg) { hint.textContent = 'Please type a message first.'; hint.style.color = '#dc2626'; return; }
    try {
        await updateDoc(doc(db, 'system', 'settings'), {
            statusMessage: msg,
            statusMessageAt: serverTimestamp()
        });
        hint.innerHTML = '<span style="display:inline-flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Message set. Showing on website and monitor.</span>';
        hint.style.color = '#16a34a';
        setTimeout(() => { hint.textContent = ''; }, 3000);
    } catch (e) {
        hint.innerHTML = '<span style="display:inline-flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Failed to set message.</span>';
        hint.style.color = '#dc2626';
    }
}

async function clearStatusMessage() {
    const hint = document.getElementById('statusMsgHint');
    try {
        await updateDoc(doc(db, 'system', 'settings'), { statusMessage: '' });
        document.getElementById('statusMsgInput').value = '';
        hint.innerHTML = '<span style="display:inline-flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Message cleared.</span>';
        hint.style.color = '#16a34a';
        setTimeout(() => { hint.textContent = ''; }, 3000);
    } catch (e) {
        hint.innerHTML = '<span style="display:inline-flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Failed to clear message.</span>';
        hint.style.color = '#dc2626';
    }
}

function addActivity(type, tNum, name) {
  const log   = document.getElementById('activityLog');
  const empty = log.querySelector('.activity-empty');
  if (empty) empty.remove();
  const icons = {
    called:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--blue-600)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>',
    completed: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    noshow:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--red-600)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  };
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

async function exportCSV(mode = 'single') {
    const hint = document.getElementById('exportHint');
    hint.textContent = 'Generating report...';
    hint.style.color = 'var(--slate-400)';

    try {
        const depts = mode === 'combined' ? ['cashier', 'registrar'] : [staffDept];

        let allRows = [];
        let lastReset = new Date();
        lastReset.setHours(0, 0, 0, 0);

        for (const dept of depts) {
            const deptSnap = await getDoc(doc(db, 'departments', dept));
            const deptReset = deptSnap.data()?.lastResetAt?.toDate?.();
            const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
            const countFrom = deptReset && deptReset > startOfDay ? deptReset : startOfDay;
            if (countFrom < lastReset) lastReset = countFrom;

            const snap = await getDocs(query(
            collection(db, 'tickets'),
            where('department', '==', dept),
            where('issuedAt', '>=', Timestamp.fromDate(countFrom))
            ));

            const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            allRows = allRows.concat(rows);
        }

        allRows.sort((a, b) => (a.issuedAt?.toMillis?.() || 0) - (b.issuedAt?.toMillis?.() || 0));

        if (allRows.length === 0) {
            hint.innerHTML = '<span style="display:inline-flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>No tickets found for today.</span>';
            hint.style.color = 'var(--red-600)';
            return;
        }

        const headers = [
            'Ticket No.',
            'Department',
            'Student ID',
            'Type',
            'Reason',
            'Status',
            'Issued At',
            'Called At',
            'Completed At',
            'Wait Time (min)',
            'Is Reservation'
        ];

        const csvRows = allRows.map(t => {
            const issuedAt    = t.issuedAt?.toDate?.();
            const calledAt    = t.calledAt?.toDate?.();
            const completedAt = t.completedAt?.toDate?.();
            const waitMin     = (issuedAt && calledAt)
                ? ((calledAt - issuedAt) / 60000).toFixed(2)
                : '—';
            const fmt = (d) => d
                ? d.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
                : '—';
            return [
                t.ticketNumber,
                t.department.toUpperCase(),
                t.userId || '—',
                t.isReservation ? 'Reservation' : 'Walk-in',
                `"${(t.reason || '—').replace(/"/g, '""')}"`,
                t.status,
                fmt(issuedAt),
                fmt(calledAt),
                fmt(completedAt),
                waitMin,
                t.isReservation ? 'Yes' : 'No'
            ].join(',');
        });

        const summaryLines = ['', '--- SUMMARY ---'];

        for (const dept of depts) {
            const dRows    = allRows.filter(t => t.department === dept);
            const total    = dRows.length;
            const served   = dRows.filter(t => t.status === 'completed').length;
            const noshow   = dRows.filter(t => t.status === 'noshow').length;
            const waiting  = dRows.filter(t => t.status === 'waiting' || t.status === 'serving').length;
            const cancelled = dRows.filter(t => t.status === 'cancelled').length;
            const walkins  = dRows.filter(t => !t.isReservation).length;
            const reservations = dRows.filter(t => t.isReservation).length;
            const waitTimes = dRows
                .filter(t => t.issuedAt?.toDate?.() && t.calledAt?.toDate?.())
                .map(t => (t.calledAt.toDate() - t.issuedAt.toDate()) / 60000);
            const avgWait = waitTimes.length > 0
                ? (waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length).toFixed(2)
                : '—';
            const maxWait = waitTimes.length > 0
                ? Math.max(...waitTimes).toFixed(2)
                : '—';

            summaryLines.push(
                ``,
                `Department:,${dept.toUpperCase()}`,
                `Total Tickets Issued:,${total}`,
                `Served:,${served}`,
                `No-Show:,${noshow}`,
                `Still Waiting/Serving:,${waiting}`,
                `Cancelled:,${cancelled}`,
                `Walk-in:,${walkins}`,
                `Reservation:,${reservations}`,
                `Average Wait Time (min):,${avgWait}`,
                `Longest Wait Time (min):,${maxWait}`
            );
        }

        if (mode === 'combined') {
            const total    = allRows.length;
            const served   = allRows.filter(t => t.status === 'completed').length;
            const noshow   = allRows.filter(t => t.status === 'noshow').length;
            const walkins  = allRows.filter(t => !t.isReservation).length;
            const reservations = allRows.filter(t => t.isReservation).length;
            const waitTimes = allRows
                .filter(t => t.issuedAt?.toDate?.() && t.calledAt?.toDate?.())
                .map(t => (t.calledAt.toDate() - t.issuedAt.toDate()) / 60000);
            const avgWait = waitTimes.length > 0
                ? (waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length).toFixed(2)
                : '—';

            summaryLines.push(
                ``,
                `--- GRAND TOTAL ---`,
                `Total All Departments:,${total}`,
                `Total Served:,${served}`,
                `Total No-Show:,${noshow}`,
                `Total Walk-in:,${walkins}`,
                `Total Reservation:,${reservations}`,
                `Overall Average Wait Time (min):,${avgWait}`
            );
        }

        const today = new Date().toLocaleDateString('en-PH', {
            timeZone: 'Asia/Manila',
            year: 'numeric', month: 'long', day: 'numeric'
        });
        summaryLines.unshift(`Date:,${today}`);

        const csvContent = [
            headers.join(','),
            ...csvRows,
            ...summaryLines
        ].join('\n');

        const blob    = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url     = URL.createObjectURL(blob);
        const a       = document.createElement('a');
        const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        const label   = mode === 'combined' ? 'ALL' : staffDept.toUpperCase();
        a.href        = url;
        a.download    = `eTickette_${label}_${dateStr}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        hint.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Report downloaded — ${allRows.length} tickets exported.</span>`;
        hint.style.color = 'var(--green-600)';

    } catch (e) {
        console.error('[exportCSV]', e);
        hint.innerHTML = '<span style="display:inline-flex;align-items:center;gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Failed to generate report.</span>';
        hint.style.color = 'var(--red-600)';
    }
}