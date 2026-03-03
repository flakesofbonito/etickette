// website/js/app.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, collection, setDoc, getDoc,
  onSnapshot, updateDoc, increment, query, where, orderBy,
  serverTimestamp, getDocs, deleteDoc
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

const REASONS = {
  cashier: [
    { label: "Pay Tuition / Fees",       docs: ["Valid ID", "Statement of Account"] },
    { label: "Pay Miscellaneous Fees",   docs: ["Valid ID", "Fee Slip"] },
    { label: "Request Official Receipt", docs: ["Valid ID", "Proof of Payment"] },
    { label: "Scholarship Clearance",    docs: ["Valid ID", "Grant Letter"] },
    { label: "Other",                    docs: [] }
  ],
  registrar: [
    { label: "Request Transcript (TOR)", docs: ["Valid ID", "Request Form", "Clearance"] },
    { label: "Certificate of Enrollment",docs: ["Valid ID", "Request Form"] },
    { label: "Certificate of Graduation",docs: ["Valid ID", "Request Form", "Clearance"] },
    { label: "Form 137 / 138",           docs: ["Valid ID", "Request Form"] },
    { label: "Diploma / Authentication", docs: ["Valid ID", "Claim Stub"] },
    { label: "Other",                    docs: [] }
  ]
};

let app, db;
let currentStudentId = null;
let reserveDept      = null;
let reserveReason    = null;
let currentStep      = 1;
let hasActiveReservation = false; // track so we can disable reserve buttons

export function initWebsite() {
  app = initializeApp(firebaseConfig);
  db  = getFirestore(app);

  window.loginStudent      = loginStudent;
  window.logout            = logout;
  window.navigate          = navigate;
  window.toggleMenu        = toggleMenu;
  window.openReserveModal  = openReserveModal;
  window.closeModal        = closeModal;
  window.handleOverlay     = handleOverlay;
  window.rGoStep           = rGoStep;
  window.submitReserveDate = submitReserveDate;
  window.cancelReservation = cancelReservation;

  const saved = sessionStorage.getItem('studentId');
  if (saved) {
    currentStudentId = saved;
    afterLogin();
  }
}

// ── LOGIN ────────────────────────────────────────────────────
function loginStudent() {
  const val = document.getElementById('loginId').value.trim();
  const err = document.getElementById('loginError');
  const inp = document.getElementById('loginId');
  if (!/^\d{11}$/.test(val)) {
    err.textContent = 'Student ID must be exactly 11 digits.';
    inp.classList.add('error');
    return;
  }
  err.textContent = '';
  inp.classList.remove('error');
  currentStudentId = val;
  sessionStorage.setItem('studentId', val);

  // Dismiss overlay, unlock app
  document.getElementById('loginOverlay').classList.add('dismissed');
  document.getElementById('appShell').classList.remove('locked');
  document.getElementById('appShell').classList.add('unlocked');
  setTimeout(() => {
    document.getElementById('loginOverlay').style.display = 'none';
  }, 520);

  afterLogin();
}

function afterLogin() {
  document.getElementById('userDisplay').style.display = 'flex';
  document.getElementById('userLabel').textContent     = currentStudentId;
  document.getElementById('profileInfo').innerHTML = `
    <div class="info"><span>Student ID</span><b>${currentStudentId}</b></div>
    <button class="btn-ghost" style="margin-top:16px" onclick="logout()">Log out</button>
  `;
  navigate('home');
  listenToDepts();
  listenToSettings();
  listenToActiveReservation(); // live listener instead of one-time fetch
}

function logout() {
  sessionStorage.removeItem('studentId');
  currentStudentId     = null;
  hasActiveReservation = false;
  document.getElementById('userDisplay').style.display = 'none';

  // Show overlay again, lock app
  const overlay = document.getElementById('loginOverlay');
  overlay.style.display = 'flex';
  overlay.classList.remove('dismissed');
  document.getElementById('loginId').value = '';
  document.getElementById('loginError').textContent = '';
  document.getElementById('appShell').classList.add('locked');
  document.getElementById('appShell').classList.remove('unlocked');
}

// ── NAVIGATION ───────────────────────────────────────────────
function navigate(view) {
  if (view === 'history') loadHistory();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.nav-link').forEach(a =>
    a.classList.toggle('active', a.dataset.view === view));
  if (window.innerWidth <= 600)
    document.getElementById('sidebar').classList.remove('open');
}

function toggleMenu() {
  const sb = document.getElementById('sidebar');
  if (window.innerWidth > 600) {
    sb.classList.toggle('collapsed');
    document.getElementById('mainContent').classList.toggle('expanded');
  } else {
    sb.classList.toggle('open');
  }
}

// ── FIREBASE LISTENERS ───────────────────────────────────────
function listenToDepts() {
  ['cashier', 'registrar'].forEach(dept => {
    onSnapshot(doc(db, 'departments', dept), snap => {
      if (!snap.exists()) return;
      const d      = snap.data();
      const status = (d.status || 'open').toLowerCase();
      const map    = {
        open:   { t: 'OPEN',     c: 'open',  dis: false },
        break:  { t: 'ON BREAK', c: 'break', dis: true  },
        closed: { t: 'CLOSED',   c: 'closed',dis: true  }
      };
      const m = map[status] || map.open;
      document.getElementById(dept + 'Status').textContent = m.t;
      document.getElementById(dept + 'Status').className   = m.c;
      document.getElementById(dept + 'Queue').textContent  = d.queue || 0;

      // Disable button if dept closed OR student already has a reservation
      const btn = document.getElementById(dept + 'Btn');
      btn.disabled = m.dis || hasActiveReservation;
    });
  });
}

function listenToSettings() {
  onSnapshot(doc(db, 'system', 'settings'), snap => {
    if (!snap.exists()) return;
    const d   = snap.data();
    const rem = (d.dailyQuota || 100) - (d.ticketsIssued || 0);
    document.getElementById('quotaText').textContent = rem + ' / ' + (d.dailyQuota || 100) + ' Slots';
    const pct = (d.ticketsIssued || 0) / (d.dailyQuota || 100);
    const el  = document.getElementById('congestionText');
    if      (pct < 0.4)  { el.textContent = 'LOW TRAFFIC';  el.className = 'open';   }
    else if (pct < 0.75) { el.textContent = 'MODERATE';     el.className = 'break';  }
    else                  { el.textContent = 'HIGH TRAFFIC'; el.className = 'closed'; }
    if (d.statusMessage)
      document.getElementById('globalStatus').textContent = d.statusMessage;
  });
}

// ── ACTIVE RESERVATION LIVE LISTENER ────────────────────────
// Listens in real time so the UI reacts immediately after
// cancel or after kiosk activation — no manual refresh needed.
function listenToActiveReservation() {
  // 1) Watch pending/active reservations
  const resQ = query(
    collection(db, 'reservations'),
    where('studentId', '==', currentStudentId),
    where('status', 'in', ['pending', 'active'])
  );
  onSnapshot(resQ, snap => {
    if (snap.empty) {
      hasActiveReservation = false;
      setReserveButtonsLocked(false);
      const banner = document.getElementById('activeResBanner');
      if (banner) banner.remove();
    } else {
      hasActiveReservation = true;
      setReserveButtonsLocked(true);
      renderActiveResBanner(snap.docs[0].data(), snap.docs[0].id);
    }
  });

  // 2) Watch walk-in tickets — single field query, filter in JS
  const walkinQ = query(
    collection(db, 'tickets'),
    where('userId', '==', currentStudentId)
  );
  onSnapshot(walkinQ, snap => {
    const activeTicket = snap.docs.find(d => {
      const s = d.data().status;
      return s === 'waiting' || s === 'serving';
    });
    if (activeTicket) {
      hasActiveReservation = true;
      setReserveButtonsLocked(true);
      if (!document.getElementById('activeResBanner')) {
        renderActiveWalkinBanner(activeTicket.data());
      }
    }
  });
}

// Disable/enable both reserve buttons
function setReserveButtonsLocked(locked) {
  ['cashier', 'registrar'].forEach(dept => {
    const btn = document.getElementById(dept + 'Btn');
    if (btn) {
      if (locked) {
        btn.disabled = true;
        btn.title    = 'Cancel your current reservation first.';
      } else {
        // Only re-enable if dept is actually open
        // listenToDepts() handles the open/closed logic,
        // so just remove the reservation lock
        btn.title = '';
        // We don't force-enable here — let listenToDepts handle it
      }
    }
  });
}

// Render the active reservation banner inside the History/Reservations view
function renderActiveResBanner(res, rid) {
  // Remove old banner if exists
  const old = document.getElementById('activeResBanner');
  if (old) old.remove();

  const canCancel = res.status === 'pending' || res.status === 'active';
  const statusLabel = res.status === 'pending'
    ? '<span class="break">Pending — not yet activated at Kiosk</span>'
    : '<span class="open">Active — ticket assigned</span>';

  const ticketLine = res.ticketNumber
    ? '<p><strong>Ticket #:</strong> ' + res.ticketNumber + '</p>'
    : '';

  const banner = document.createElement('div');
  banner.id        = 'activeResBanner';
  banner.className = 'active-res-banner';
  banner.innerHTML = `
    <div class="active-res-header">
      <span>📋 Active Reservation</span>
      ${canCancel ? `<button class="btn-cancel-res" onclick="cancelReservation('${rid}','${res.status}')">✕ Cancel</button>` : ''}
    </div>
    <div class="active-res-body">
      <div class="active-res-info">
        <p><strong>Department:</strong> ${res.department.toUpperCase()}</p>
        <p><strong>Reason:</strong> ${res.reason}</p>
        <p><strong>Date:</strong> ${res.reservationDate}</p>
        ${ticketLine}
        <p><strong>Status:</strong> ${statusLabel}</p>
        ${res.status === 'pending' ? '<p class="subtle" style="margin-top:8px">Scan the QR below at the Kiosk when you arrive.</p>' : ''}
      </div>
      ${res.status === 'pending' ? '<div id="bannerQR" class="qr-center banner-qr"></div>' : ''}
    </div>
  `;

  // Insert at the top of the history list container
  const historyView = document.getElementById('view-history');
  const pageCard    = historyView.querySelector('.page-card');
  pageCard.insertBefore(banner, pageCard.querySelector('h2').nextSibling);

  // Render QR if pending
  if (res.status === 'pending') {
    setTimeout(() => {
      const qrEl = document.getElementById('bannerQR');
      if (qrEl) {
        qrEl.innerHTML = '';
        qrEl.style.width  = '140px';
qrEl.style.height = '140px';
new QRCode(qrEl, {
  text:       rid,
  width:      140,
  height:     140,
  colorDark:  '#1f3c88',
  colorLight: '#ffffff'
});
setTimeout(() => {
  const canvas = qrEl.querySelector('canvas');
  const img    = qrEl.querySelector('img');
  if (canvas) { canvas.style.width = '140px'; canvas.style.height = '140px'; }
  if (img)    { img.style.width    = '140px'; img.style.height    = '140px'; }
}, 100);  
      }
    }, 50);
  }
}

function renderActiveWalkinBanner(ticket) {
  const old = document.getElementById('activeResBanner');
  if (old) old.remove();

  const statusLabel = ticket.status === 'serving'
    ? '<span class="open">Now Serving — proceed to counter</span>'
    : '<span class="break">Waiting — watch the lobby monitor</span>';

  const banner = document.createElement('div');
  banner.id        = 'activeResBanner';
  banner.className = 'active-res-banner';
  banner.innerHTML = `
    <div class="active-res-header"><span>🎫 Active Ticket</span></div>
    <div class="active-res-body">
      <div class="active-res-info">
        <p><strong>Department:</strong> ${ticket.department.toUpperCase()}</p>
        <p><strong>Ticket #:</strong>
          <span style="font-size:1.6em;font-weight:900;color:#1f3c88">${ticket.ticketNumber}</span>
        </p>
        <p><strong>Status:</strong> ${statusLabel}</p>
      </div>
    </div>`;

  const pageCard = document.getElementById('view-history').querySelector('.page-card');
  pageCard.insertBefore(banner, pageCard.querySelector('h2').nextSibling);
}

// ── CANCEL RESERVATION ───────────────────────────────────────
async function cancelReservation(rid, status) {
  const confirmed = confirm(
    status === 'active'
      ? 'Your ticket has already been activated. Cancelling will remove you from the queue. Are you sure?'
      : 'Are you sure you want to cancel this reservation?'
  );
  if (!confirmed) return;

  try {
    await updateDoc(doc(db, 'reservations', rid), {
      status:       'cancelled',
      cancelledAt:  serverTimestamp()
    });

    // If already active (ticket assigned), also remove from queue
    if (status === 'active') {
      const resSnap = await getDoc(doc(db, 'reservations', rid));
      const tNum    = resSnap.data().ticketNumber;
      if (tNum) {
        await updateDoc(doc(db, 'tickets', tNum), { status: 'cancelled' });
        // Decrement the queue count
        const dept = resSnap.data().department;
        await updateDoc(doc(db, 'departments', dept), {
          queue: Math.max(0, (await getDoc(doc(db, 'departments', dept))).data().queue - 1)
        });
      }
    }

    showToast('Reservation cancelled.', 'warning');
  } catch (e) {
    console.error(e);
    showToast('Could not cancel. Try again.', 'error');
  }
}

// ── RESERVE MODAL ────────────────────────────────────────────
function openReserveModal(dept) {
  if (!currentStudentId) { showToast('Please log in first.', 'error'); return; }

  if (hasActiveReservation) {
    showToast('You already have an active reservation. Cancel it first.', 'warning');
    return;
  }

  reserveDept = dept;
  document.getElementById('reserveDeptTag').textContent = dept.toUpperCase();
  document.getElementById('reserveTitle').textContent   =
    'Reserve – ' + dept.charAt(0).toUpperCase() + dept.slice(1);

  const list = document.getElementById('reserveReasonList');
  list.innerHTML = '';
  REASONS[dept].forEach(r => {
    const d = document.createElement('div');
    d.className   = 'reason-item';
    d.textContent = r.label;
    d.onclick = () => {
      reserveReason = r;
      document.querySelectorAll('.reason-item').forEach(x => x.classList.remove('selected'));
      d.classList.add('selected');
      rGoStep(2);
    };
    list.appendChild(d);
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('reserveDate').min   = tomorrow.toISOString().split('T')[0];
  document.getElementById('reserveDate').value = '';

  rGoStep(1);
  document.getElementById('reserveModal').classList.add('active');
}

function rGoStep(n) {
  document.querySelectorAll('.modal-step').forEach(s => s.classList.remove('active'));
  document.getElementById('rstep' + n).classList.add('active');
  currentStep = n;
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById('rdot' + i);
    if (dot) dot.classList.toggle('active', i <= n);
  }
}

async function submitReserveDate() {
  const dateVal = document.getElementById('reserveDate').value;
  const errEl   = document.getElementById('dateError');
  if (!dateVal) { errEl.textContent = 'Please pick a date.'; return; }
  errEl.textContent = '';

  // Block if existing reservation
  const resQ = query(
    collection(db, 'reservations'),
    where('studentId', '==', currentStudentId),
    where('status', 'in', ['pending', 'active'])
  );
  const existingRes = await getDocs(resQ);
  if (!existingRes.empty) {
    errEl.textContent = 'You already have an active reservation. Cancel it first.';
    return;
  }

  // Block if already has a waiting kiosk ticket
  const ticketQ = query(
    collection(db, 'tickets'),
    where('userId', '==', currentStudentId),
    where('status', '==', 'waiting')
  );
  const existingTicket = await getDocs(ticketQ);
  if (!existingTicket.empty) {
    const t = existingTicket.docs[0].data();
    errEl.textContent = `You already have ticket ${t.ticketNumber} in the ${t.department.toUpperCase()} queue. No need to reserve.`;
    return;
  }

  try {
    const rid = 'RES-' + currentStudentId + '-' + Date.now();
    await setDoc(doc(db, 'reservations', rid), {
      studentId:       currentStudentId,
      department:      reserveDept,
      reason:          reserveReason.label,
      requiredDocs:    reserveReason.docs,
      reservationDate: dateVal,
      status:          'pending',
      ticketNumber:    null,
      createdAt:       serverTimestamp()
    });

    // FIX: decrement slots when reservation is made, not just at kiosk
    await updateDoc(doc(db, 'system', 'settings'), {
      ticketsIssued: increment(1)
    });

    document.getElementById('reserveSummary').textContent =
      reserveDept.toUpperCase() + ' · ' + reserveReason.label + ' · ' + dateVal;
    const qrEl = document.getElementById('reserveQR');
qrEl.innerHTML = '';
qrEl.style.width  = '160px';
qrEl.style.height = '160px';
new QRCode(qrEl, {
  text:       rid,
  width:      160,
  height:     160,
  colorDark:  '#1f3c88',
  colorLight: '#ffffff'
});
// Force canvas to be square after render
setTimeout(() => {
  const canvas = qrEl.querySelector('canvas');
  const img    = qrEl.querySelector('img');
  if (canvas) { canvas.style.width = '160px'; canvas.style.height = '160px'; }
  if (img)    { img.style.width    = '160px'; img.style.height    = '160px'; }
}, 100);

    rGoStep(3);
    showToast('Reservation saved!', 'success');

  } catch (e) {
    errEl.textContent = 'Error saving reservation. Try again.';
    console.error(e);
  }
}

async function loadHistory() {
  const el = document.getElementById('historyList');
  el.innerHTML = '<p class="subtle">Loading...</p>';
  try {
    const resSnap = await getDocs(query(
      collection(db, 'reservations'),
      where('studentId', '==', currentStudentId)
    ));

    // Single field only — no composite index needed
    const ticketSnap = await getDocs(query(
      collection(db, 'tickets'),
      where('userId', '==', currentStudentId)
    ));

    el.innerHTML = '';

    ticketSnap.forEach(d => {
      const t = d.data();
      if (t.isReservation === true) return;
      if (t.status === 'waiting' || t.status === 'serving') return;
      const cls  = t.status === 'completed' ? 'open' : t.status === 'cancelled' ? 'closed' : 'break';
      const date = t.issuedAt?.toDate ? t.issuedAt.toDate().toLocaleDateString() : '—';
      el.innerHTML += `
        <div class="history-item">
          <div><strong>🎫 ${t.ticketNumber}</strong> — ${t.department.toUpperCase()}<br/>
          <span class="subtle">Walk-in · ${date}</span></div>
          <span class="${cls}">${t.status.toUpperCase()}</span>
        </div>`;
    });

    resSnap.forEach(d => {
      const r = d.data();
      if (r.status === 'pending' || r.status === 'active') return;
      const cls = r.status === 'cancelled' ? 'closed' : 'open';
      el.innerHTML += `
        <div class="history-item">
          <div><strong>${r.department.toUpperCase()}</strong> — ${r.reason}<br/>
          <span class="subtle">Reservation · ${r.reservationDate}</span></div>
          <span class="${cls}">${r.status.toUpperCase()}</span>
        </div>`;
    });

    if (!el.innerHTML.trim())
      el.innerHTML = '<p class="subtle">No tickets or reservations yet.</p>';
  } catch (e) {
    console.error('[loadHistory]', e);
    el.innerHTML = '<p class="subtle">Failed to load. Try again.</p>';
  }
}


// ── TOAST ─────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast ' + type + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}