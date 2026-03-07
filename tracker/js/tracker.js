import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, collection, onSnapshot,
  query, where, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3g7-_ldguMjweIHrIduBNJOcJ3201bQc",
  authDomain: "etickette-78f74.firebaseapp.com",
  projectId: "etickette-78f74",
  storageBucket: "etickette-78f74.firebasestorage.app",
  messagingSenderId: "147547566302",
  appId: "1:147547566302:web:2c7a52792b539331d8524f"
};

let app, db;
let myTicket = null;
let myDept = null;
let lastStatus = null;
let notifGranted = false;

window.requestNotification = requestNotification;

// ── INIT ──────────────────────────────────────────────────
app = initializeApp(firebaseConfig);
db = getFirestore(app);

const params = new URLSearchParams(window.location.search);
const ticketNum = params.get('t');
const dept      = params.get('d') || '';

if (!ticketNum) {
  showState('error');
} else {
  myDept = dept.toLowerCase();
  loadTicket(ticketNum);
}

// ── LOAD ──────────────────────────────────────────────────
async function loadTicket(tNum) {
  try {
    const snap = await getDoc(doc(db, 'tickets', tNum));
    if (!snap.exists()) { showState('error'); return; }
    myTicket = { id: snap.id, ...snap.data() };
    renderTicketCard(myTicket);
    checkAndShowState(myTicket);
    startListeners(tNum);
  } catch (e) {
    console.error('[loadTicket]', e);
    showState('error');
  }
}

// ── LISTENERS ─────────────────────────────────────────────
function startListeners(tNum) {
  // Listen to this specific ticket
  onSnapshot(doc(db, 'tickets', tNum), snap => {
    if (!snap.exists()) return;
    myTicket = { id: snap.id, ...snap.data() };
    checkAndShowState(myTicket);
    renderTicketCard(myTicket);
  });

  // Listen to the dept queue for position updates
  onSnapshot(
    query(collection(db, 'tickets'), where('department', '==', myDept)),
    snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updatePositionInfo(all);
    }
  );

  // Listen to dept doc for nowServing
  onSnapshot(doc(db, 'departments', myDept), snap => {
    if (!snap.exists()) return;
    const d = snap.data();
    document.getElementById('nowServingNum').textContent = d.nowServing || '—';
    document.getElementById('nowServingDept').textContent = myDept.toUpperCase();
  });
}

// ── STATE MANAGEMENT ──────────────────────────────────────
function checkAndShowState(ticket) {
  const status = ticket.status;

  // Terminal states
  if (status === 'completed') { showState('completed'); return; }
  if (status === 'noshow')    { showState('noshow');    return; }
  if (status === 'cancelled') { showState('cancelled'); return; }

  // Active state
  showState('active');

  const statusCard = document.getElementById('statusCard');
  const iconWrap   = document.getElementById('statusIconWrap');
  const statusIcon = document.getElementById('statusIcon');
  const label      = document.getElementById('statusLabel');
  const sub        = document.getElementById('statusSub');
  const calledBanner = document.getElementById('calledBanner');

  if (status === 'serving') {
    statusCard.classList.add('serving');
    statusIcon.textContent = '📣';
    label.textContent = "It's Your Turn!";
    sub.textContent   = 'Please proceed to the ' + myDept.toUpperCase() + ' counter now';
    calledBanner.classList.remove('hidden');
    document.getElementById('calledDept').textContent = myDept.toUpperCase();
    document.getElementById('positionCard').style.opacity = '0.5';

    // Trigger notification if first time detecting serving status
    if (lastStatus !== 'serving') {
      triggerNotification(ticket.ticketNumber);
      playAlertSound();
      pulseIcon();
    }
  } else {
    statusCard.classList.remove('serving');
    statusIcon.textContent = '⏳';
    label.textContent = 'Waiting in Queue';
    sub.textContent   = 'We\'ll notify you when it\'s your turn';
    calledBanner.classList.add('hidden');
    document.getElementById('positionCard').style.opacity = '1';
  }

  lastStatus = status;
}

function showState(state) {
  ['loading','error','completed','noshow','cancelled','active'].forEach(s => {
    const el = document.getElementById('state' + s.charAt(0).toUpperCase() + s.slice(1));
    if (el) el.classList.toggle('hidden', s !== state);
  });
  if (state === 'completed') {
    document.getElementById('doneTicketNum').textContent = ticketNum;
  }
}

// ── TICKET CARD ───────────────────────────────────────────
function renderTicketCard(ticket) {
  document.getElementById('tcDept').textContent   = (ticket.department || myDept).toUpperCase();
  document.getElementById('tcNumber').textContent = ticket.ticketNumber;
  document.getElementById('tcName').textContent   = ticket.displayName || ticket.userId || '—';
  document.getElementById('tcReason').textContent = ticket.reason || '—';
  document.getElementById('tcType').textContent   = ticket.isReservation ? '📅 Reservation' : '🚶 Walk-in';
}

// ── POSITION INFO ─────────────────────────────────────────
function updatePositionInfo(all) {
  const waiting = all
    .filter(t => t.status === 'waiting' || t.status === 'serving')
    .sort((a, b) => (a.issuedAt?.toMillis?.() || 0) - (b.issuedAt?.toMillis?.() || 0));

  const serving = all.find(t => t.status === 'serving');
  const completed = all.filter(t => t.status === 'completed' || t.status === 'noshow').length;
  const total = all.length;

  const myPos = waiting.findIndex(t => t.ticketNumber === ticketNum);
  const ahead = myPos > 0 ? myPos - (serving ? 1 : 0) : 0;
  const posDisplay = myPos >= 0 ? myPos + 1 : '—';
  const estWait = myPos > 0 ? Math.round(ahead * 5) : 0;

  document.getElementById('posNumber').textContent = posDisplay;
  document.getElementById('posAhead').textContent = ahead > 0 ? ahead + ' ahead of you' : myPos === 0 ? 'You\'re next!' : '—';
  document.getElementById('estWait').textContent = myPos >= 0 ? (estWait || '<1') : '—';

  // Progress bar
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  document.getElementById('progBar').style.width = pct + '%';
  document.getElementById('progServed').textContent = completed + ' served';
  document.getElementById('progTotal').textContent  = total + ' total';
}

// ── NOTIFICATIONS ─────────────────────────────────────────
async function requestNotification() {
  const btn = document.getElementById('btnNotif');
  if (!('Notification' in window)) {
    btn.textContent = 'Not supported';
    btn.classList.add('denied');
    return;
  }
  if (Notification.permission === 'granted') {
    notifGranted = true;
    btn.textContent = '✓ Enabled';
    btn.classList.add('done');
    document.getElementById('notifCard').classList.add('granted');
    return;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    notifGranted = true;
    btn.textContent = '✓ Enabled';
    btn.classList.add('done');
    document.getElementById('notifCard').classList.add('granted');
  } else {
    btn.textContent = 'Denied';
    btn.classList.add('denied');
  }
}

function triggerNotification(tNum) {
  // In-page vibration
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);

  // Browser notification
  if (notifGranted && Notification.permission === 'granted') {
    new Notification('📣 It\'s Your Turn!', {
      body: 'Ticket ' + tNum + ' — Please proceed to the ' + myDept.toUpperCase() + ' counter.',
      icon: '../assets/logo.png',
      tag: 'etickette-call',
      requireInteraction: true
    });
  }

  // Page title flash
  let flashing = true;
  const origTitle = document.title;
  const flashInterval = setInterval(() => {
    document.title = flashing ? '📣 IT\'S YOUR TURN!' : origTitle;
    flashing = !flashing;
  }, 800);
  setTimeout(() => {
    clearInterval(flashInterval);
    document.title = origTitle;
  }, 10000);
}

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Three ascending beeps
    [440, 554, 659].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = freq;
      const t = ctx.currentTime + i * 0.22;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.4, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.start(t); o.stop(t + 0.4);
    });
  } catch (_) {}
}

function pulseIcon() {
  const el = document.getElementById('statusIconWrap');
  el.classList.add('ping');
  setTimeout(() => el.classList.remove('ping'), 600);
}

// Check notification permission on load
if ('Notification' in window && Notification.permission === 'granted') {
  notifGranted = true;
  const btn = document.getElementById('btnNotif');
  if (btn) {
    btn.textContent = '✓ Enabled';
    btn.classList.add('done');
  }
  document.getElementById('notifCard')?.classList.add('granted');
}