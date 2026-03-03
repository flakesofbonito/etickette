// kiosk/js/kiosk.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, collection, setDoc, getDoc, getDocs,
  onSnapshot, updateDoc, increment, serverTimestamp,
  query, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyA3g7-_ldguMjweIHrIduBNJOcJ3201bQc",
  authDomain:        "etickette-78f74.firebaseapp.com",
  projectId:         "etickette-78f74",
  storageBucket:     "etickette-78f74.firebasestorage.app",
  messagingSenderId: "147547566302",
  appId:             "1:147547566302:web:2c7a52792b539331d8524f",
  measurementId:     "G-QHMMWXW7F3"
};

const PRINTER_URL = 'http://localhost:8000/print';

let app, db;
let selectedDept  = null;
let html5QrCode   = null;
let scannerActive = false;

export function initKiosk() {
  app = initializeApp(firebaseConfig);
  db  = getFirestore(app);

  window.goScreen    = goScreen;
  window.pickDept    = pickDept;
  window.submitId    = submitId;
  window.stopScanner = stopScanner;

  updateClock();
  setInterval(updateClock, 1000);
  listenToDepts();
  listenToSettings();

  // Runs on every startup — fixes queue counts after power cut
  recoverSystemState();
}

// ── POWER RECOVERY ───────────────────────────────────────────
// Recounts real waiting tickets and resets queue + counter so
// the system is always consistent after a restart/power outage.
async function recoverSystemState() {
  try {
    for (const dept of ['cashier', 'registrar']) {
      const prefix = dept === 'cashier' ? 'C' : 'R';

      // Count actual waiting tickets
      const waitSnap = await getDocs(query(
        collection(db, 'tickets'),
        where('department', '==', dept),
        where('status', '==', 'waiting')
      ));
      const realQueue = waitSnap.size;

      // Find highest ticket number ever issued for this dept
      const allSnap = await getDocs(query(
        collection(db, 'tickets'),
        where('department', '==', dept)
      ));
      let maxCounter = 0;
      allSnap.forEach(function(d) {
        var tn = d.data().ticketNumber || '';
        var n  = parseInt(tn.replace(prefix + '-', ''), 10);
        if (!isNaN(n) && n > maxCounter) maxCounter = n;
      });

      const dRef    = doc(db, 'departments', dept);
      const dSnap   = await getDoc(dRef);
      const current = dSnap.exists() ? (dSnap.data().counter || 0) : 0;
      const safeCounter = Math.max(current, maxCounter);

      await updateDoc(dRef, {
        queue:   realQueue,
        counter: safeCounter
      });

      console.log('[Recovery] ' + dept + ': queue=' + realQueue + ', counter=' + safeCounter);
    }
  } catch (e) {
    console.warn('[Recovery] Could not recover state:', e.message);
  }
}

// ── CLOCK ─────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  document.getElementById('kioskTime').textContent =
    now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

// ── SCREEN NAVIGATION ─────────────────────────────────
function goScreen(name) {
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById('screen-' + name).classList.add('active');
  if (name === 'scan') startScanner();
}

// ── FIREBASE LISTENERS ────────────────────────────────
function listenToDepts() {
  ['cashier', 'registrar'].forEach(function(dept) {
    onSnapshot(doc(db, 'departments', dept), function(snap) {
      if (!snap.exists()) return;
      const d  = snap.data();
      const st = (d.status || 'open').toLowerCase();
      const map = {
        open:   { t: 'OPEN',     c: 'chip-open'   },
        break:  { t: 'ON BREAK', c: 'chip-break'  },
        closed: { t: 'CLOSED',   c: 'chip-closed' }
      };
      const m = map[st] || map.open;

      const chipEl = document.getElementById(dept + 'Status');
      if (chipEl) { chipEl.textContent = m.t; chipEl.className = m.c; }

      const qEl = document.getElementById(dept + 'QueueText');
      if (qEl) qEl.textContent = (d.queue || 0) + ' in queue';

      const cap   = dept.charAt(0).toUpperCase() + dept.slice(1);
      const btnEl = document.getElementById('dept' + cap);
      if (btnEl) {
        if (st === 'open') btnEl.classList.remove('disabled');
        else               btnEl.classList.add('disabled');
      }
    });
  });
}

function listenToSettings() {
  onSnapshot(doc(db, 'system', 'settings'), function(snap) {
    if (!snap.exists()) return;
    const d = snap.data();
    if (d.statusMessage)
      document.getElementById('kioskBanner').textContent = d.statusMessage;
  });
}

// ── DEPT SELECTION ────────────────────────────────────
function pickDept(dept) {
  selectedDept = dept;
  document.getElementById('deptChosen').textContent = dept.toUpperCase();
  document.getElementById('idInput').value           = '';
  document.getElementById('idError').textContent     = '';
  goScreen('id');
}

// ── ID SUBMISSION ─────────────────────────────────────
function submitId() {
  const val = document.getElementById('idInput').value.trim();
  const err = document.getElementById('idError');
  if (val.length < 3) {
    err.textContent = 'Please enter a valid ID or name.';
    return;
  }
  err.textContent = '';
  issueTicket(val);
}

// ── ISSUE TICKET (walk-in) ────────────────────────────
async function issueTicket(userId) {
  const btn = document.querySelector('#screen-id .kiosk-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking...'; }

  try {
    // FIX 1: Block if student has a pending reservation
    const resCheck = await getDocs(query(
      collection(db, 'reservations'),
      where('studentId', '==', userId),
      where('status', '==', 'pending')
    ));
    if (!resCheck.empty) {
      const r = resCheck.docs[0].data();
      document.getElementById('idError').textContent =
        'You have a pending reservation for ' + r.department.toUpperCase() +
        ' on ' + r.reservationDate + '. Please scan your QR code instead.';
      return;
    }

    // FIX 2: Block if student already has an active waiting ticket
    const activeCheck = await getDocs(query(
      collection(db, 'tickets'),
      where('userId', '==', userId),
      where('status', '==', 'waiting')
    ));
    if (!activeCheck.empty) {
      const t = activeCheck.docs[0].data();
      document.getElementById('idError').textContent =
        'You already have ticket ' + t.ticketNumber + ' in the queue. Please wait for your number.';
      return;
    }

    if (btn) btn.textContent = 'Issuing...';

    const prefix = selectedDept === 'cashier' ? 'C' : 'R';
    const dRef   = doc(db, 'departments', selectedDept);
    const sRef   = doc(db, 'system', 'settings');

    await updateDoc(dRef, { counter: increment(1), queue: increment(1) });
    await updateDoc(sRef, { ticketsIssued: increment(1) });

    const snapAfter = await getDoc(dRef);
    const num       = snapAfter.data().counter;
    const tNum      = prefix + '-' + String(num).padStart(2, '0');
    const ahead     = Math.max(0, (snapAfter.data().queue || 1) - 1);

    await setDoc(doc(collection(db, 'tickets'), tNum), {
      ticketNumber:  tNum,
      department:    selectedDept,
      userId:        userId,
      userType:      'walkin',
      reason:        '-',
      status:        'waiting',
      issuedAt:      serverTimestamp(),
      printed:       false,
      called:        false,
      isReservation: false
    });

    await printTicket(tNum, selectedDept);
    showTicketScreen(tNum, userId, ahead);
    playBeep();

  } catch (e) {
    console.error(e);
    document.getElementById('idError').textContent = 'Error issuing ticket. Try again.';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Get Ticket'; }
  }
}

// ── SHOW TICKET SCREEN ────────────────────────────────
function showTicketScreen(tNum, userId, ahead) {
  document.getElementById('issuedDept').textContent   = selectedDept.toUpperCase();
  document.getElementById('issuedNumber').textContent = tNum;
  document.getElementById('issuedId').textContent     = userId;
  document.getElementById('issuedAhead').textContent  = ahead + ' people';
  document.getElementById('issuedWait').textContent   = '~' + (ahead * 5) + ' min';

  const qrEl = document.getElementById('ticketQR');
  qrEl.innerHTML = '';
  new QRCode(qrEl, {
    text: window.location.origin + '/tracker.html?t=' + encodeURIComponent(tNum) + '&d=' + selectedDept,
    width: 110, height: 110,
    colorDark: '#1f3c88', colorLight: '#ffffff'
  });
  goScreen('ticket');
}

// ── PRINT HELPER ──────────────────────────────────────
// ── PRINT HELPER ──────────────────────────────────────
async function printTicket(tNum, dept) {
  const qr_link = window.location.origin + '/tracker.html?t=' + encodeURIComponent(tNum) + '&d=' + dept;
  try {
    const res = await fetch(PRINTER_URL, {
      method:  'POST',
      mode:    'cors',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ number: tNum, dept: dept, qr_link: qr_link })
    });
    if (!res.ok) {
      console.warn('[Printer] HTTP error:', res.status);
      return;
    }
    const json = await res.json();
    if (json.status !== 'Success') console.warn('[Printer]', json.message);
    else console.log('[Printer] Printed:', tNum);
  } catch (e) {
    console.warn('[Printer] Server unreachable — is printer_server.py running?', e.message);
  }
}

// ── QR SCANNER ────────────────────────────────────────
function startScanner() {
  if (scannerActive) return;
  html5QrCode = new Html5Qrcode('qr-reader');
  Html5Qrcode.getCameras().then(function(cams) {
    if (!cams || !cams.length) { setScanStatus('No camera found.'); return; }
    const cam = cams.find(function(c) {
      return c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear');
    }) || cams[cams.length - 1];
    return html5QrCode.start(cam.id, { fps: 10, qrbox: { width: 240, height: 240 } }, onScanSuccess, function() {});
  }).then(function() {
    scannerActive = true;
    setScanStatus('Ready — point at QR code');
  }).catch(function(e) { setScanStatus('Camera error: ' + e); });
}

export function stopScanner() {
  if (html5QrCode && scannerActive) {
    html5QrCode.stop()
      .then(function()  { scannerActive = false; html5QrCode = null; })
      .catch(function() { scannerActive = false; html5QrCode = null; });
  }
}

async function onScanSuccess(decoded) {
  stopScanner();
  setScanStatus('QR scanned! Verifying...');

  let rid = decoded.trim();
  try {
    const u = new URL(decoded);
    rid = u.searchParams.get('res') || u.searchParams.get('id') || decoded.trim();
  } catch (_) {}

  try {
    const resSnap = await getDoc(doc(db, 'reservations', rid));
    if (!resSnap.exists()) { setScanStatus('Reservation not found.'); return; }

    const res = resSnap.data();
    if (res.status !== 'pending') {
      setScanStatus(res.status === 'active' ? 'Already checked in.' : 'Reservation no longer valid.');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    if (res.reservationDate && res.reservationDate !== today) {
      setScanStatus('This reservation is for ' + res.reservationDate + '.');
      return;
    }

    const dept   = res.department;
    const prefix = dept === 'cashier' ? 'C' : 'R';
    const dRef   = doc(db, 'departments', dept);
    const sRef   = doc(db, 'system', 'settings');

    await updateDoc(dRef, { counter: increment(1), queue: increment(1) });
    await updateDoc(sRef, { ticketsIssued: increment(1) });

    const snapAfter = await getDoc(dRef);
    const num       = snapAfter.data().counter;
    const tNum      = prefix + '-' + String(num).padStart(2, '0');
    const ahead     = Math.max(0, (snapAfter.data().queue || 1) - 1);

    await setDoc(doc(collection(db, 'tickets'), tNum), {
      ticketNumber:  tNum,
      department:    dept,
      userId:        res.studentId,
      userType:      'student',
      reason:        res.reason,
      status:        'waiting',
      issuedAt:      serverTimestamp(),
      printed:       false,
      called:        false,
      isReservation: true,
      reservationId: rid
    });

    await updateDoc(doc(db, 'reservations', rid), {
      status:       'active',
      ticketNumber: tNum,
      activatedAt:  serverTimestamp()
    });

    await printTicket(tNum, dept);

    document.getElementById('scanDept').textContent   = dept.toUpperCase();
    document.getElementById('scanNumber').textContent = tNum;
    document.getElementById('scanId').textContent     = res.studentId;
    document.getElementById('scanReason').textContent = res.reason;
    document.getElementById('scanAhead').textContent  = ahead + ' people';
    goScreen('scan-success');
    playBeep();

  } catch (e) {
    console.error(e);
    setScanStatus('Server error. Try again.');
  }
}

function setScanStatus(msg) {
  document.getElementById('scanStatus').textContent = msg;
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .4);
    o.start(); o.stop(ctx.currentTime + .4);
  } catch (_) {}
}