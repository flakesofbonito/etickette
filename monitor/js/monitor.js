// monitor/js/monitor.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, collection,
  onSnapshot, query, where
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

let app, db;

export function initMonitor() {
  app = initializeApp(firebaseConfig);
  db  = getFirestore(app);
  updateClock();
  setInterval(updateClock, 1000);
  listenToDept('cashier');
  listenToDept('registrar');
  listenToSettings();
  listenToQueue('cashier');
  listenToQueue('registrar');
}

function updateClock() {
  const now = new Date();
  document.getElementById('monitorTime').textContent =
    now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function listenToDept(dept) {
  onSnapshot(doc(db, 'departments', dept), snap => {
    if (!snap.exists()) return;
    const d  = snap.data();
    const st = (d.status || 'open').toLowerCase();
    const el = document.getElementById(dept + 'MonStatus');
    const map = {
      open:   { t: 'OPEN',     c: '' },
      break:  { t: 'ON BREAK', c: 'break' },
      closed: { t: 'CLOSED',   c: 'closed' }
    };
    const m = map[st] || map.open;
    el.textContent = m.t;
    el.className   = 'dept-status ' + m.c;

    // nowServing is written by staff panel when calling a ticket
    if (d.nowServing) {
      document.getElementById(dept + 'Now').textContent = d.nowServing;
    }
  });
}

// FIX: Removed orderBy from Firestore query — combining where() on one field
// with orderBy() on a different field requires a composite Firestore index.
// We query by department only and sort/filter entirely in JS instead.
function listenToQueue(dept) {
  const q = query(
    collection(db, 'tickets'),
    where('department', '==', dept)
  );

  onSnapshot(q, snap => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Filter to active tickets, sort by issuedAt ascending
    const active = all
      .filter(t => t.status === 'waiting' || t.status === 'serving')
      .sort((a, b) => {
        const ta = a.issuedAt && a.issuedAt.toMillis ? a.issuedAt.toMillis() : 0;
        const tb = b.issuedAt && b.issuedAt.toMillis ? b.issuedAt.toMillis() : 0;
        return ta - tb;
      });

    const serving = active.find(t => t.status === 'serving');
    const waiting = active.filter(t => t.status === 'waiting');

    // Only update Now Serving from tickets if no explicit nowServing on dept doc
    const nowEl = document.getElementById(dept + 'Now');
    if (serving) nowEl.textContent = serving.ticketNumber;
    else if (!nowEl.textContent || nowEl.textContent === '') nowEl.textContent = '—';

    // Next in line
    const nextEl = document.getElementById(dept + 'Next');
    if (waiting.length === 0) {
      nextEl.innerHTML = '<span class="next-item empty">No tickets waiting</span>';
    } else {
      nextEl.innerHTML = waiting.slice(0, 5)
        .map(t => '<span class="next-item">' + t.ticketNumber + '</span>')
        .join('');
    }

    document.getElementById(dept + 'Total').textContent = waiting.length;
  });
}

function listenToSettings() {
  onSnapshot(doc(db, 'system', 'settings'), snap => {
    if (!snap.exists()) return;
    const d   = snap.data();
    const rem = (d.dailyQuota || 100) - (d.ticketsIssued || 0);
    document.getElementById('footerQuota').textContent =
      'Slots: ' + rem + ' / ' + (d.dailyQuota || 100);
    if (d.statusMessage)
      document.getElementById('footerStatus').textContent = d.statusMessage;
  });
}