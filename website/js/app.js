import {
    getFirestore,
    doc,
    collection,
    setDoc,
    getDoc,
    onSnapshot,
    updateDoc,
    query,
    where,
    serverTimestamp,
    getDocs,
    increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

const firebaseConfig = {
    apiKey: "AIzaSyA3g7-_ldguMjweIHrIduBNJOcJ3201bQc",
    authDomain: "etickette-78f74.firebaseapp.com",
    projectId: "etickette-78f74",
    storageBucket: "etickette-78f74.firebasestorage.app",
    messagingSenderId: "147547566302",
    appId: "1:147547566302:web:2c7a52792b539331d8524f",
    measurementId: "G-QHMMWXW7F3"
};

const REASONS = {
    cashier: [{
        label: "Pay Tuition / Fees",
        docs: ["Valid ID", "Statement of Account"]
    }, {
        label: "Pay Miscellaneous Fees",
        docs: ["Valid ID", "Fee Slip"]
    }, {
        label: "Request Official Receipt",
        docs: ["Valid ID", "Proof of Payment"]
    }, {
        label: "Scholarship Clearance",
        docs: ["Valid ID", "Grant Letter"]
    }, {
        label: "Other",
        docs: []
    }],
    registrar: [{
        label: "Request Transcript (TOR)",
        docs: ["Valid ID", "Request Form", "Clearance"]
    }, {
        label: "Certificate of Enrollment",
        docs: ["Valid ID", "Request Form"]
    }, {
        label: "Certificate of Graduation",
        docs: ["Valid ID", "Request Form", "Clearance"]
    }, {
        label: "Form 137 / 138",
        docs: ["Valid ID", "Request Form"]
    }, {
        label: "Diploma / Authentication",
        docs: ["Valid ID", "Claim Stub"]
    }, {
        label: "Other",
        docs: []
    }]
};

let app, db;
let currentStudentId = null;
let reserveDept = null;
let reserveReason = null;
let currentStep = 1;
let hasActiveReservation = false;

export function initWebsite() {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);

    window.loginStudent = loginStudent;
    window.logout = logout;
    window.navigate = navigate;
    window.toggleMenu = toggleMenu;
    window.openReserveModal = openReserveModal;
    window.closeModal = closeModal;
    window.handleOverlay = handleOverlay;
    window.rGoStep = rGoStep;
    window.submitReserveDate = submitReserveDate;
    window.cancelReservation = cancelReservation;

    const saved = sessionStorage.getItem('studentId');
    if (saved) {
        currentStudentId = saved;
        afterLogin();
    }
}

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
    document.getElementById('userLabel').textContent = currentStudentId;
    document.getElementById('profileInfo').innerHTML = `
    <div class="info"><span>Student ID</span><b>${currentStudentId}</b></div>
    <button class="btn-ghost" style="margin-top:16px" onclick="logout()">Log out</button>
  `;
    navigate('home');
    listenToDepts();
    listenToSettings();
    listenToActiveReservation();
}

function logout() {
    sessionStorage.removeItem('studentId');
    currentStudentId = null;
    hasActiveReservation = false;
    document.getElementById('userDisplay').style.display = 'none';
    const ov = document.getElementById('loginOverlay');
    ov.style.display = 'flex';
    ov.classList.remove('dismissed');
    document.getElementById('loginId').value = '';
    document.getElementById('loginError').textContent = '';
    document.getElementById('appShell').classList.add('locked');
    document.getElementById('appShell').classList.remove('unlocked');
}

function navigate(view) {
    if (view === 'history') loadHistory();

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + view).classList.add('active');

    document.querySelectorAll('.nav-link').forEach(a =>
        a.classList.toggle('active', a.dataset.view === view));

    document.querySelectorAll('.bottom-nav-item').forEach(b =>
        b.classList.toggle('active', b.dataset.view === view));

    if (window.innerWidth <= 600) {
        document.getElementById('sidebar').classList.remove('open');
    }
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

function listenToDepts() {
    ['cashier', 'registrar'].forEach(dept => {
        onSnapshot(doc(db, 'departments', dept), snap => {
            if (!snap.exists()) return;
            const d = snap.data();
            const status = (d.status || 'open').toLowerCase();
            const map = {
                open: {
                    t: 'OPEN',
                    c: 'open',
                    dis: false
                },
                break: {
                    t: 'ON BREAK',
                    c: 'break',
                    dis: true
                },
                closed: {
                    t: 'CLOSED',
                    c: 'closed',
                    dis: true
                }
            };
            const m = map[status] || map.open;
            document.getElementById(dept + 'Status').textContent = m.t;
            document.getElementById(dept + 'Status').className = m.c;
            document.getElementById(dept + 'Queue').textContent = d.queue || 0;
            const btn = document.getElementById(dept + 'Btn');
            if (btn) btn.disabled = m.dis || hasActiveReservation;
        });
    });
}

function listenToSettings() {
    onSnapshot(doc(db, 'system', 'settings'), snap => {
        if (!snap.exists()) return;
        const d = snap.data();
        const rem = (d.dailyQuota || 100) - (d.ticketsIssued || 0);
        document.getElementById('quotaText').textContent = rem + ' / ' + (d.dailyQuota || 100) + ' Slots';
        const pct = (d.ticketsIssued || 0) / (d.dailyQuota || 100);
        const el = document.getElementById('congestionText');
        if (pct < 0.4) {
            el.textContent = 'LOW TRAFFIC';
            el.className = 'open';
        } else if (pct < 0.75) {
            el.textContent = 'MODERATE';
            el.className = 'break';
        } else {
            el.textContent = 'HIGH TRAFFIC';
            el.className = 'closed';
        }
        if (d.statusMessage) document.getElementById('globalStatus').textContent = d.statusMessage;
    });
}

function listenToActiveReservation() {
    onSnapshot(
        query(collection(db, 'reservations'), where('studentId', '==', currentStudentId)),
        snap => {
            const activeDoc = snap.docs.find(d => {
                const s = d.data().status;
                return s === 'pending' || s === 'active';
            });
            if (!activeDoc) {
                hasActiveReservation = false;
                setReserveButtonsLocked(false);
                const b = document.getElementById('activeResBanner');
                if (b) b.remove();
            } else {
                hasActiveReservation = true;
                setReserveButtonsLocked(true);
                renderActiveResBanner(activeDoc.data(), activeDoc.id);
            }
        },
        err => {
            console.warn('[res snapshot]', err.code);
            hasActiveReservation = false;
            setReserveButtonsLocked(false);
        }
    );

    onSnapshot(
        query(collection(db, 'tickets'), where('userId', '==', currentStudentId)),
        snap => {
            const active = snap.docs.find(d => {
                const s = d.data().status;
                return s === 'waiting' || s === 'serving';
            });
            if (active && !document.getElementById('activeResBanner')) {
                hasActiveReservation = true;
                setReserveButtonsLocked(true);
                renderActiveWalkinBanner(active.data());
            }
        },
        err => console.warn('[ticket snapshot]', err.code)
    );
}

function setReserveButtonsLocked(locked) {
    ['cashier', 'registrar'].forEach(dept => {
        const btn = document.getElementById(dept + 'Btn');
        if (btn) {
            btn.disabled = locked;
            btn.title = locked ? 'Cancel your current reservation first.' : '';
        }
    });
}

// ── QR HELPER ─────────────────────────────────────────────────────────────────
function renderQR(el, text, size) {
    el.innerHTML = '';

    new QRCode(el, {
        text: text,
        width: size,
        height: size,
        colorDark: '#1f3c88',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });

    // qrcodejs renders both canvas + img; hide canvas, show img centered
    // Use a short timeout to catch the async img insertion
    setTimeout(() => {
        el.querySelectorAll('canvas').forEach(c => c.style.cssText = 'display:none!important;');
        el.querySelectorAll('img').forEach(img => img.style.cssText = 'display:block!important; margin:0 auto;');
    }, 50);
}

// ── BANNERS ───────────────────────────────────────────────────────────────────
function renderActiveResBanner(res, rid) {
    const old = document.getElementById('activeResBanner');
    if (old) old.remove();

    const canCancel = res.status === 'pending' || res.status === 'active';
    const statusLabel = res.status === 'pending' ?
        '<span class="break">Pending — not yet activated at Kiosk</span>' :
        '<span class="open">Active — ticket assigned</span>';
    const ticketLine = res.ticketNumber ?
        `<p><strong>Ticket #:</strong> ${res.ticketNumber}</p>` : '';

    const banner = document.createElement('div');
    banner.id = 'activeResBanner';
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
    </div>`;

  const pageCard = document.getElementById('view-history').querySelector('.page-card');
  pageCard.insertBefore(banner, pageCard.querySelector('h2').nextSibling);

  if (res.status === 'pending') {
    requestAnimationFrame(() => {
      const qrEl = document.getElementById('bannerQR');
      if (qrEl) renderQR(qrEl, rid, 160);
    });
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
        <p><strong>Ticket #:</strong> <span style="font-size:1.6em;font-weight:900;color:#1f3c88">${ticket.ticketNumber}</span></p>
        <p><strong>Status:</strong> ${statusLabel}</p>
      </div>
    </div>`;

  const pageCard = document.getElementById('view-history').querySelector('.page-card');
  pageCard.insertBefore(banner, pageCard.querySelector('h2').nextSibling);
}

// ── CANCEL ────────────────────────────────────────────────────────────────────
async function cancelReservation(rid, status) {
  if (!confirm(status === 'active'
    ? 'Your ticket has already been activated. Cancelling will remove you from the queue. Are you sure?'
    : 'Are you sure you want to cancel this reservation?')) return;

  try {
    await updateDoc(doc(db, 'reservations', rid), { status: 'cancelled', cancelledAt: serverTimestamp() });
    if (status === 'active') {
      const snap = await getDoc(doc(db, 'reservations', rid));
      const tNum = snap.data().ticketNumber;
      if (tNum) {
        await updateDoc(doc(db, 'tickets', tNum), { status: 'cancelled' });
        const dept  = snap.data().department;
        const dSnap = await getDoc(doc(db, 'departments', dept));
        if (dSnap.exists()) {
          await updateDoc(doc(db, 'departments', dept), { queue: Math.max(0, (dSnap.data().queue || 1) - 1) });
        }
      }
    }
    showToast('Reservation cancelled.', 'warning');
  } catch (e) {
    console.error('[cancelReservation]', e);
    showToast('Could not cancel. Try again.', 'error');
  }
}

// ── RESERVE MODAL ─────────────────────────────────────────────────────────────
function openReserveModal(dept) {
  if (!currentStudentId) { showToast('Please log in first.', 'error'); return; }
  if (hasActiveReservation) { showToast('You already have an active reservation. Cancel it first.', 'warning'); return; }

  reserveDept = dept;
  document.getElementById('reserveDeptTag').textContent = dept.toUpperCase();
  document.getElementById('reserveTitle').textContent   = 'Reserve – ' + dept.charAt(0).toUpperCase() + dept.slice(1);

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

  try {
    const snap = await getDocs(query(collection(db, 'reservations'), where('studentId', '==', currentStudentId)));
    const already = snap.docs.some(d => { const s = d.data().status; return s === 'pending' || s === 'active'; });
    if (already) { errEl.textContent = 'You already have an active reservation. Cancel it first.'; return; }
  } catch (e) { console.warn('[pre-check res]', e.code); }

  try {
    const snap = await getDocs(query(collection(db, 'tickets'), where('userId', '==', currentStudentId)));
    const waiting = snap.docs.find(d => d.data().status === 'waiting');
    if (waiting) {
      const t = waiting.data();
      errEl.textContent = `You already have ticket ${t.ticketNumber} in the ${t.department.toUpperCase()} queue.`;
      return;
    }
  } catch (e) { console.warn('[pre-check ticket]', e.code); }

  const rid = 'RES-' + currentStudentId + '-' + Date.now();
  try {
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
  } catch (e) {
    console.error('[setDoc]', e);
    errEl.textContent = 'Error saving reservation: ' + e.message;
    return;
  }

  try {
    await updateDoc(doc(db, 'system', 'settings'), { ticketsIssued: increment(1) });
  } catch (e) {
    console.warn('[increment counter]', e.code || e.message);
  }

  const qrEl = document.getElementById('reserveQR');
  qrEl.innerHTML = '';
  document.getElementById('reserveSummary').textContent =
    reserveDept.toUpperCase() + ' · ' + reserveReason.label + ' · ' + dateVal;
  renderQR(qrEl, rid, 160);
  rGoStep(3);
  showToast('Reservation saved!', 'success');
}

// ── HISTORY ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  const el = document.getElementById('historyList');
  el.innerHTML = '<p class="subtle">Loading...</p>';

  let ticketDocs = [], resDocs = [];

  try {
    const s = await getDocs(query(collection(db, 'tickets'), where('userId', '==', currentStudentId)));
    ticketDocs = s.docs;
  } catch (e) { console.warn('[history tickets]', e.code); }

  try {
    const s = await getDocs(query(collection(db, 'reservations'), where('studentId', '==', currentStudentId)));
    resDocs = s.docs;
  } catch (e) { console.warn('[history reservations — index needed]', e.message); }

  el.innerHTML = '';

  ticketDocs.forEach(d => {
    const t = d.data();
    if (t.isReservation) return;
    if (t.status === 'waiting' || t.status === 'serving') return;
    const cls  = t.status === 'completed' ? 'open' : t.status === 'cancelled' ? 'closed' : 'break';
    const date = t.issuedAt?.toDate ? t.issuedAt.toDate().toLocaleDateString() : '—';
    el.innerHTML += `<div class="history-item">
      <div><strong>🎫 ${t.ticketNumber}</strong> — ${t.department.toUpperCase()}<br/>
      <span class="subtle">Walk-in · ${date}</span></div>
      <span class="${cls}">${t.status.toUpperCase()}</span>
    </div>`;
  });

  resDocs.forEach(d => {
    const r = d.data();
    if (r.status === 'pending' || r.status === 'active') return;
    const cls = r.status === 'cancelled' ? 'closed' : 'open';
    el.innerHTML += `<div class="history-item">
      <div><strong>${r.department.toUpperCase()}</strong> — ${r.reason}<br/>
      <span class="subtle">Reservation · ${r.reservationDate}</span></div>
      <span class="${cls}">${r.status.toUpperCase()}</span>
    </div>`;
  });

  if (!el.innerHTML.trim()) el.innerHTML = '<p class="subtle">No tickets or reservations yet.</p>';
}

// ── MODALS ────────────────────────────────────────────────────────────────────
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function handleOverlay(e, id) { if (e.target === document.getElementById(id)) closeModal(id); }

// ── TOAST ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast ' + type + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}