import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, collection, onSnapshot,
  updateDoc, getDocs, query, where,
  serverTimestamp, increment, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3g7-_ldguMjweIHrIduBNJOcJ3201bQc",
  authDomain: "etickette-78f74.firebaseapp.com",
  projectId: "etickette-78f74",
  storageBucket: "etickette-78f74.firebasestorage.app",
  messagingSenderId: "147547566302",
  appId: "1:147547566302:web:2c7a52792b539331d8524f"
};

const STAFF_PIN = '1234'; // Change to your desired PIN

let app, db;
let staffDept = 'cashier';
let currentTicket = null;
let serveStartTime = null;
let timerInterval = null;
let serveTimes = [];
let servedToday = 0;
let noShowToday = 0;
let unsubQueue = null;
let unsubDept = null;

// ── INIT ────────────────────────────────────────────────
window.selectDept = selectDept;
window.staffLogin = staffLogin;
window.staffLogout = staffLogout;
window.setDeptStatus = setDeptStatus;
window.callNextTicket = callNextTicket;
window.completeTicket = completeTicket;
window.noShowTicket = noShowTicket;
window.recallTicket = recallTicket;
window.markManualComplete = markManualComplete;

app = initializeApp(firebaseConfig);
db = getFirestore(app);

updateClock();
setInterval(updateClock, 1000);

function updateClock() {
  const now = new Date();
  const el = document.getElementById('dashTime');
  if (el) el.textContent = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
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
  if (unsubDept) unsubDept();
  clearInterval(timerInterval);
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('pinInput').value = '';
  currentTicket = null;
}

// ── DASHBOARD ────────────────────────────────────────────
function startDashboard() {
  listenToDept();
  listenToQueue();
  loadTodayStats();
}

function listenToDept() {
  if (unsubDept) unsubDept();
  unsubDept = onSnapshot(doc(db, 'departments', staffDept), snap => {
    if (!snap.exists()) return;
    const d = snap.data();
    const st = (d.status || 'open').toLowerCase();
    ['btnOpen', 'btnBreak', 'btnClosed'].forEach(id =>
      document.getElementById(id).classList.remove('active'));
    const map = { open: 'btnOpen', break: 'btnBreak', closed: 'btnClosed' };
    const btn = document.getElementById(map[st] || 'btnOpen');
    if (btn) btn.classList.add('active');
    document.getElementById('queueCount').textContent = d.queue || 0;
  });
}

function listenToQueue() {
  if (unsubQueue) unsubQueue();
  const q = query(
    collection(db, 'tickets'),
    where('department', '==', staffDept)
  );
  unsubQueue = onSnapshot(q, snap => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const waiting = all
      .filter(t => t.status === 'waiting')
      .sort((a, b) => {
        const ta = a.issuedAt?.toMillis?.() || 0;
        const tb = b.issuedAt?.toMillis?.() || 0;
        return ta - tb;
      });
    const serving = all.find(t => t.status === 'serving');

    renderQueue(waiting, serving);
    updateStats(waiting, serving);

    // Update current serving display
    if (serving) {
      const isNew = !currentTicket || currentTicket.ticketNumber !== serving.ticketNumber;
      currentTicket = serving;
      renderServing(serving, isNew); // always refresh display; only restart timer if new
    } else if (!serving) {
      currentTicket = null;
      clearServing();
    }

    document.getElementById('queueBadge').textContent = waiting.length;
    document.getElementById('queueCount').textContent = waiting.length + (serving ? 1 : 0);
    document.getElementById('btnCallNext').disabled = waiting.length === 0;
  });
}

function renderQueue(waiting, serving) {
  const el = document.getElementById('queueList');
  if (waiting.length === 0) {
    el.innerHTML = '<div class="queue-empty">No tickets waiting</div>';
    return;
  }
  el.innerHTML = '';
  waiting.forEach((t, i) => {
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.innerHTML = queueItemHTML(t, '#' + (i + 1));
    el.appendChild(item);
  });
}

function queueItemHTML(t, pos) {
  const tag = t.isReservation
    ? '<span class="queue-tag reservation">Reservation</span>'
    : '<span class="queue-tag walkin">Walk-in</span>';
  const name = t.displayName || t.userId || '—';
  const reason = t.reason || '—';
  const time = t.issuedAt?.toDate ? t.issuedAt.toDate().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—';
  return `
    <div class="queue-num">${t.ticketNumber}</div>
    <div class="queue-details">
      <div class="q-name">${name}</div>
      <div class="q-reason">${reason}</div>
      <div class="q-time">Issued: ${time}</div>
    </div>
    ${tag}
    <div class="queue-pos">${pos}</div>
  `;
}

function renderServing(ticket, isNew = true) {
  document.getElementById('servingNumber').textContent = ticket.ticketNumber;
  document.getElementById('servingUserId').textContent = '👤 ' + (ticket.displayName || ticket.userId || '—');
  document.getElementById('servingReason').textContent = '📝 ' + (ticket.reason || '—');
  document.getElementById('servingType').textContent = ticket.isReservation ? '📅 Reservation' : '🚶 Walk-in';
  document.getElementById('btnComplete').disabled = false;
  document.getElementById('btnNoshow').disabled = false;

  if (isNew && !serveStartTime) {
    serveStartTime = Date.now();
    startTimer();
  }
}

function clearServing() {
  document.getElementById('servingNumber').textContent = '—';
  document.getElementById('servingUserId').textContent = '—';
  document.getElementById('servingReason').textContent = '—';
  document.getElementById('servingType').textContent = '—';
  document.getElementById('btnComplete').disabled = true;
  document.getElementById('btnNoshow').disabled = true;
  document.getElementById('servingTimer').textContent = '00:00';
  document.getElementById('servingTimer').className = 'serving-timer';
  serveStartTime = null;
  clearInterval(timerInterval);
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!serveStartTime) return;
    const elapsed = Math.floor((Date.now() - serveStartTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    const el = document.getElementById('servingTimer');
    el.textContent = `${m}:${s}`;
    if (elapsed > 600) el.className = 'serving-timer over';
    else if (elapsed > 300) el.className = 'serving-timer warn';
    else el.className = 'serving-timer';
  }, 1000);
}

function updateStats(waiting, serving) {
  document.getElementById('statWaiting').textContent = waiting.length;
  document.getElementById('statServed').textContent = servedToday;
  document.getElementById('statNoShow').textContent = noShowToday;
  const avg = serveTimes.length > 0
    ? Math.round(serveTimes.reduce((a, b) => a + b, 0) / serveTimes.length)
    : null;
  document.getElementById('avgWait').textContent = avg ? Math.floor(avg / 60) + 'm ' + (avg % 60) + 's' : '—';
  document.getElementById('servedCount').textContent = servedToday;
}

async function loadTodayStats() {
  try {
    const snap = await getDocs(query(
      collection(db, 'tickets'),
      where('department', '==', staffDept)
    ));
    servedToday = snap.docs.filter(d => d.data().status === 'completed').length;
    noShowToday = snap.docs.filter(d => d.data().status === 'noshow').length;
    document.getElementById('statIssued').textContent = snap.docs.length;
    document.getElementById('statServed').textContent = servedToday;
    document.getElementById('statNoShow').textContent = noShowToday;
  } catch (e) {
    console.warn('[loadStats]', e);
  }
}

// ── ACTIONS ──────────────────────────────────────────────
async function callNextTicket() {
  try {
    const snap = await getDocs(query(
      collection(db, 'tickets'),
      where('department', '==', staffDept),
      where('status', '==', 'waiting')
    ));
    if (snap.empty) return;

    const sorted = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.issuedAt?.toMillis?.() || 0) - (b.issuedAt?.toMillis?.() || 0));

    // Complete previous if any
    if (currentTicket && currentTicket.status === 'serving') {
      await finishServing(currentTicket, 'completed');
      servedToday++;
      document.getElementById('statServed').textContent = servedToday;
      document.getElementById('servedCount').textContent = servedToday;
      addActivity('completed', currentTicket.ticketNumber, currentTicket.displayName || currentTicket.userId || '—');
    }

    const next = sorted[0];
    // Reset timer for new ticket
    serveStartTime = Date.now();
    clearInterval(timerInterval);

    await updateDoc(doc(db, 'tickets', next.id), {
      status: 'serving',
      calledAt: serverTimestamp(),
      called: true,
      notified: true,
      notifiedAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'departments', staffDept), {
      nowServing: next.ticketNumber
    });

    // snapshot will pick up the change and call renderServing
    playCallSound(next.ticketNumber);
    addActivity('called', next.ticketNumber, next.displayName || next.userId || '—');
    startTimer();
  } catch (e) {
    console.error('[callNext]', e);
  }
}

async function completeTicket() {
  if (!currentTicket) return;
  await finishServing(currentTicket, 'completed');
  servedToday++;
  document.getElementById('statServed').textContent = servedToday;
  document.getElementById('servedCount').textContent = servedToday;
  addActivity('completed', currentTicket.ticketNumber, currentTicket.displayName || currentTicket.userId || '—');
  currentTicket = null;
  clearServing();
}

async function noShowTicket() {
  if (!currentTicket) return;
  await finishServing(currentTicket, 'noshow');
  noShowToday++;
  document.getElementById('statNoShow').textContent = noShowToday;
  addActivity('noshow', currentTicket.ticketNumber, currentTicket.displayName || currentTicket.userId || '—');
  currentTicket = null;
  clearServing();
}

async function finishServing(ticket, status) {
  try {
    if (serveStartTime) {
      const elapsed = Math.floor((Date.now() - serveStartTime) / 1000);
      serveTimes.push(elapsed);
      if (serveTimes.length > 20) serveTimes.shift();
    }
    serveStartTime = null;
    clearInterval(timerInterval);

    await updateDoc(doc(db, 'tickets', ticket.id), {
      status: status,
      completedAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'departments', staffDept), {
      queue: increment(-1),
      nowServing: ''
    });
  } catch (e) {
    console.error('[finishServing]', e);
  }
}

async function setDeptStatus(status) {
  try {
    await updateDoc(doc(db, 'departments', staffDept), { status });
    ['btnOpen', 'btnBreak', 'btnClosed'].forEach(id =>
      document.getElementById(id).classList.remove('active'));
    const map = { open: 'btnOpen', break: 'btnBreak', closed: 'btnClosed' };
    document.getElementById(map[status]).classList.add('active');
  } catch (e) {
    console.error('[setStatus]', e);
  }
}

async function recallTicket() {
  const input = document.getElementById('recallInput');
  const tNum = input.value.trim().toUpperCase();
  if (!tNum) return;

  try {
    const snap = await getDoc(doc(db, 'tickets', tNum));
    if (!snap.exists()) { alert('Ticket not found: ' + tNum); return; }
    playCallSound(tNum);
    addActivity('called', tNum, snap.data().displayName || snap.data().userId || '—');
    input.value = '';
  } catch (e) {
    console.error('[recall]', e);
  }
}

async function markManualComplete() {
  const input = document.getElementById('manualInput');
  const tNum = input.value.trim().toUpperCase();
  if (!tNum) return;

  try {
    await updateDoc(doc(db, 'tickets', tNum), { status: 'completed', completedAt: serverTimestamp() });
    await updateDoc(doc(db, 'departments', staffDept), { queue: increment(-1) });
    servedToday++;
    document.getElementById('statServed').textContent = servedToday;
    addActivity('completed', tNum, '—');
    input.value = '';
  } catch (e) {
    alert('Could not update ticket. Is the ticket number correct?');
  }
}

// ── CALL ALERT ──────────────────────────────────────────
function showCallAlert(tNum) {
  const el = document.getElementById('callAlert');
  document.getElementById('callAlertNum').textContent = tNum;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

function playCallSound(tNum) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523, 659, 784]; // C-E-G chord
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.15);
      g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + i * 0.15 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.5);
      o.start(ctx.currentTime + i * 0.15);
      o.stop(ctx.currentTime + i * 0.15 + 0.5);
    });
  } catch (_) {}
}

// ── ACTIVITY LOG ────────────────────────────────────────
function addActivity(type, tNum, name) {
  const log = document.getElementById('activityLog');
  const empty = log.querySelector('.activity-empty');
  if (empty) empty.remove();

  const icons = { called: '📣', completed: '✅', noshow: '❌' };
  const labels = { called: 'Called', completed: 'Served', noshow: 'No-Show' };
  const now = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

  const item = document.createElement('div');
  item.className = `activity-item ${type}`;
  item.innerHTML = `
    <span class="a-icon">${icons[type]}</span>
    <span class="a-num">${tNum}</span>
    <span class="a-label">${labels[type]} · ${name}</span>
    <span class="a-time">${now}</span>
  `;
  log.insertBefore(item, log.firstChild);

  // Keep only 20 entries
  while (log.children.length > 20) log.removeChild(log.lastChild);
}