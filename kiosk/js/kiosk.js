import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, doc, collection, setDoc, getDoc, getDocs,
    onSnapshot, updateDoc, increment, serverTimestamp, query, where,
    runTransaction
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

// ✅ FIX #22 — Use the public deployment URL so printed QR codes work from any device
const PUBLIC_URL = 'https://etickette-78f74.web.app';
const PRINTER_URL = 'http://localhost:8000/print';

// ── REASONS + REQUIRED DOCS ───────────────────────────────────────────────────
const REASONS = {
    cashier: [
        { label: "Pay Tuition / Fees",       docs: ["Valid ID", "Statement of Account"] },
        { label: "Pay Miscellaneous Fees",    docs: ["Valid ID", "Fee Slip"] },
        { label: "Request Official Receipt",  docs: ["Valid ID", "Proof of Payment"] },
        { label: "Scholarship Clearance",     docs: ["Valid ID", "Grant Letter"] },
        { label: "Other",                     docs: [] }
    ],
    registrar: [
        { label: "Request Transcript (TOR)",      docs: ["Valid ID", "Request Form", "Clearance"] },
        { label: "Certificate of Enrollment",     docs: ["Valid ID", "Request Form"] },
        { label: "Certificate of Graduation",     docs: ["Valid ID", "Request Form", "Clearance"] },
        { label: "Form 137 / 138",                docs: ["Valid ID", "Request Form"] },
        { label: "Diploma / Authentication",      docs: ["Valid ID", "Claim Stub"] },
        { label: "Other",                         docs: [] }
    ]
};

let app, db;
let selectedDept = 'cashier';
let selectedUserType = 'student';
let selectedDisplayName = null;
let selectedReason = null;
let pendingUserId = null;
let html5QrCode = null;
let scannerActive = false;

// ── INIT ──────────────────────────────────────────────────────────────────────
export function initKiosk() {
    app = initializeApp(firebaseConfig);
    db  = getFirestore(app);

    window.selectDept       = selectDept;
    window.selectUserType   = selectUserType;
    window.goScreen         = goScreen;
    window.selectReason     = selectReason;
    window.proceedIssue     = proceedIssue;
    window.openQRScanner    = openQRScanner;
    window.stopScanner      = stopScanner;
    window.cancelScan       = cancelScan;

    updateClock();
    setInterval(updateClock, 1000);
    listenToSettings();
    recoverSystemState();
    goScreen('home');
}

function updateClock() {
    const el = document.getElementById('kioskTime');
    if (el) el.textContent = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function listenToSettings() {
    onSnapshot(doc(db, 'system', 'settings'), snap => {
        if (!snap.exists()) return;
        const d   = snap.data();
        const rem = (d.dailyQuota || 100) - (d.ticketsIssued || 0);
        const el  = document.getElementById('quotaDisplay');
        if (el) el.textContent = 'Slots: ' + rem + ' / ' + (d.dailyQuota || 100);
    });
}

// ── SCREEN NAVIGATION ─────────────────────────────────────────────────────────
function goScreen(name) {
    document.querySelectorAll('.kiosk-screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + name);
    if (el) el.classList.add('active');
}

// ── DEPT SELECTION ────────────────────────────────────────────────────────────
function selectDept(dept) {
    selectedDept = dept;
    document.querySelectorAll('.dept-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.dept === dept));
}

// ── USER TYPE SELECTION ───────────────────────────────────────────────────────
function selectUserType(type) {
    selectedUserType = type;

    const studentFields = document.getElementById('kiosk-student-fields');
    const guestFields   = document.getElementById('kiosk-guest-fields');

    if (type === 'student') {
        if (studentFields) studentFields.style.display = 'block';
        if (guestFields)   guestFields.style.display   = 'none';
    } else {
        if (studentFields) studentFields.style.display = 'none';
        if (guestFields)   guestFields.style.display   = 'block';
    }

    document.querySelectorAll('.user-type-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.type === type));
}

// ── ID ENTRY ─────────────────────────────────────────────────────────────────
export async function submitId() {
    const errEl = document.getElementById('kioskIdError');
    errEl.textContent = '';

    let userId      = null;
    let displayName = null;

    if (selectedUserType === 'student') {
        const val = (document.getElementById('kioskStudentId')?.value || '').trim();
        if (!/^\d{11}$/.test(val)) { errEl.textContent = 'Student ID must be exactly 11 digits.'; return; }
        userId      = val;
        displayName = val;
    } else {
        const nameVal   = (document.getElementById('kioskGuestName')?.value   || '').trim();
        const mobileVal = (document.getElementById('kioskGuestMobile')?.value || '').trim();
        if (nameVal.length < 2)        { errEl.textContent = 'Please enter your full name.'; return; }
        if (!/^\d{10,11}$/.test(mobileVal)) { errEl.textContent = 'Please enter a valid mobile number (10-11 digits).'; return; }
        userId      = 'GUEST-' + mobileVal;   // ✅ FIX #18 — use mobile number as session key
        displayName = nameVal;
    }

    pendingUserId     = userId;
    selectedDisplayName = displayName;
    buildReasonList();
    goScreen('reason');
}

// ── REASON SELECTION ─────────────────────────────────────────────────────────
function buildReasonList() {
    const list = document.getElementById('reasonList');
    if (!list) return;
    list.innerHTML = '';
    (REASONS[selectedDept] || []).forEach((r, i) => {
        const btn = document.createElement('button');
        btn.className   = 'reason-btn';
        btn.textContent = r.label;
        btn.onclick     = () => selectReason(i);
        list.appendChild(btn);
    });
    document.getElementById('reasonDeptLabel').textContent = selectedDept.toUpperCase();
}

function selectReason(idx) {
    selectedReason = REASONS[selectedDept][idx];
    if (!selectedReason) { goScreen('home'); return; }
    showDocsScreen(selectedReason);
}

function showDocsScreen(reason) {
    document.getElementById('docsReasonLabel').textContent =
        selectedDept.toUpperCase() + ' — ' + reason.label;

    const list = document.getElementById('kioskDocsList');
    list.innerHTML = '';

    if (reason.docs && reason.docs.length > 0) {
        reason.docs.forEach(docName => {
            const item = document.createElement('div');
            item.className = 'kiosk-doc-item';
            item.innerHTML = `<span class="kiosk-doc-icon">📄</span><span>${docName}</span>`;
            list.appendChild(item);
        });
    } else {
        list.innerHTML = '<p class="no-docs-msg">✅ No specific documents required for this transaction.</p>';
    }

    goScreen('docs');
}

// ── PROCEED TO ISSUE (after docs confirmed) ───────────────────────────────────
async function proceedIssue() {
    if (!pendingUserId) { goScreen('home'); return; }
    await issueTicket(pendingUserId);
}

// ── ISSUE TICKET — FIXED RACE CONDITION WITH TRANSACTION ─────────────────────
async function issueTicket(userId) {
    const btn = document.querySelector('#screen-docs .kiosk-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Issuing...'; }

    try {
        // Check for pending reservation
        const resCheck = await getDocs(query(
            collection(db, 'reservations'),
            where('studentId', '==', userId),
            where('status', '==', 'pending')
        ));
        if (!resCheck.empty) {
            const r = resCheck.docs[0].data();
            if (btn) { btn.disabled = false; btn.textContent = '✅ I Have All Documents — Get Ticket'; }
            alert('You have a pending reservation for ' + r.department.toUpperCase() +
                  ' on ' + r.reservationDate + '. Please scan your QR code instead.');
            goScreen('home');
            return;
        }

        // Check for already-active ticket
        const activeCheck = await getDocs(query(
            collection(db, 'tickets'),
            where('userId', '==', userId),
            where('status', '==', 'waiting')
        ));
        if (!activeCheck.empty) {
            const t = activeCheck.docs[0].data();
            if (btn) { btn.disabled = false; btn.textContent = '✅ I Have All Documents — Get Ticket'; }
            alert('You already have ticket ' + t.ticketNumber + ' in the queue. Please wait for your number.');
            goScreen('home');
            return;
        }

        const prefix = selectedDept === 'cashier' ? 'C' : 'R';
        const dRef   = doc(db, 'departments', selectedDept);
        const sRef   = doc(db, 'system', 'settings');

        // ✅ FIX #3 — Use Firestore Transaction to eliminate race condition
        let tNum, ahead;
        await runTransaction(db, async (transaction) => {
            const dSnap = await transaction.get(dRef);
            if (!dSnap.exists()) throw new Error('Department doc missing');
            const newCounter = (dSnap.data().counter || 0) + 1;
            const newQueue   = (dSnap.data().queue   || 0) + 1;
            tNum  = prefix + '-' + String(newCounter).padStart(2, '0');
            ahead = Math.max(0, newQueue - 1);

            const ticketRef = doc(collection(db, 'tickets'), tNum);
            transaction.update(dRef, { counter: newCounter, queue: newQueue });
            transaction.update(sRef, { ticketsIssued: increment(1) });
            transaction.set(ticketRef, {
                ticketNumber:  tNum,
                department:    selectedDept,
                userId:        userId,
                userType:      selectedUserType,
                displayName:   selectedDisplayName,
                reason:        selectedReason ? selectedReason.label : '—',
                status:        'waiting',
                issuedAt:      serverTimestamp(),
                printed:       false,
                called:        false,
                isReservation: false
            });
        });

        await printTicket(tNum, selectedDept);
        showTicketScreen(tNum, userId, ahead);
        playBeep();

    } catch (e) {
        console.error(e);
        if (btn) { btn.disabled = false; btn.textContent = '✅ I Have All Documents — Get Ticket'; }
        alert('Error issuing ticket. Please try again.');
    }
}

// ── TICKET SCREEN ─────────────────────────────────────────────────────────────
function showTicketScreen(tNum, userId, ahead) {
    document.getElementById('issuedDept').textContent   = selectedDept.toUpperCase();
    document.getElementById('issuedNumber').textContent = tNum;
    document.getElementById('issuedId').textContent     = userId;
    document.getElementById('issuedReason').textContent = selectedReason ? selectedReason.label : '—';
    document.getElementById('issuedAhead').textContent  = ahead + ' people';
    document.getElementById('issuedWait').textContent   = '~' + (ahead * 5) + ' min';

    const qrEl = document.getElementById('ticketQR');
    qrEl.innerHTML = '';
    // ✅ FIX #22 — Use PUBLIC_URL not window.location.origin (which would be localhost on kiosk)
    new QRCode(qrEl, {
        text: PUBLIC_URL + '/tracker.html?t=' + encodeURIComponent(tNum) + '&d=' + selectedDept,
        width: 110, height: 110,
        colorDark: '#1f3c88', colorLight: '#ffffff'
    });
    goScreen('ticket');
}

// ── QR SCANNER ────────────────────────────────────────────────────────────────
function openQRScanner() {
    document.getElementById('scanStatus').textContent = 'Starting camera…';
    goScreen('scan');
    startScanner();
}

function cancelScan() {
    stopScanner();
    goScreen('home');
}

function startScanner() {
    if (scannerActive) return;
    html5QrCode = new Html5Qrcode('qr-reader');
    Html5Qrcode.getCameras().then(cams => {
        if (!cams || cams.length === 0) { setScanStatus('❌ No camera found.'); return; }
        const cam = cams.find(c => c.label.toLowerCase().includes('back') || c.label.toLowerCase().includes('rear'))
                    || cams[cams.length - 1];
        return html5QrCode.start(cam.id, { fps: 10, qrbox: { width: 240, height: 240 } }, onScanSuccess, () => {});
    }).then(() => {
        scannerActive = true;
        setScanStatus('Ready — point at QR code');
    }).catch(e => setScanStatus('Camera error: ' + e));
}

export function stopScanner() {
    if (html5QrCode && scannerActive) {
        html5QrCode.stop().then(() => { scannerActive = false; html5QrCode = null; })
                         .catch(() => { scannerActive = false; html5QrCode = null; });
    }
}

// ── QR SCAN SUCCESS — RESERVATION CHECK-IN WITH TRANSACTION ──────────────────
async function onScanSuccess(decoded) {
    stopScanner();
    setScanStatus('QR scanned! Verifying…');

    let reservationId = null;
    try {
        const url = new URL(decoded);
        reservationId = url.searchParams.get('res') || url.searchParams.get('id') || decoded.trim();
    } catch (_) { reservationId = decoded.trim(); }

    if (!reservationId) { setScanStatus('❌ Invalid QR code.'); return; }

    try {
        const resSnap = await getDoc(doc(db, 'reservations', reservationId));
        if (!resSnap.exists()) { setScanStatus('❌ Reservation not found.'); return; }
        const res = resSnap.data();
        if (res.status !== 'pending') { setScanStatus('❌ Reservation already used or cancelled.'); return; }

        const today   = new Date().toDateString();
        const resDate = res.reservationDate?.toDate?.()?.toDateString() || res.reservationDate;
        if (resDate && resDate !== today) { setScanStatus('❌ This reservation is not for today.'); return; }

        const dept   = res.department;
        const prefix = dept === 'cashier' ? 'C' : 'R';
        const dRef   = doc(db, 'departments', dept);
        const sRef   = doc(db, 'system', 'settings');
        const resRef = doc(db, 'reservations', reservationId);

        // ✅ FIX #3 + #7 — Transaction for reservation check-in, unified status to 'active'
        let tNum, ahead;
        await runTransaction(db, async (transaction) => {
            const dSnap = await transaction.get(dRef);
            if (!dSnap.exists()) throw new Error('Department doc missing');
            const newCounter = (dSnap.data().counter || 0) + 1;
            const newQueue   = (dSnap.data().queue   || 0) + 1;
            tNum  = prefix + '-' + String(newCounter).padStart(2, '0');
            ahead = Math.max(0, newQueue - 1);

            const ticketRef = doc(collection(db, 'tickets'), tNum);
            transaction.update(dRef, { counter: newCounter, queue: newQueue });
            // ✅ FIX #4 — Only kiosk increments ticketsIssued (reservation was already counted by website)
            // For reservations, we do NOT increment ticketsIssued again here
            transaction.set(ticketRef, {
                ticketNumber:  tNum,
                department:    dept,
                userId:        res.studentId || res.userId || 'N/A',
                userType:      res.userType || 'student',
                displayName:   res.displayName || res.studentId || 'N/A',
                reason:        res.reason || 'Reservation Check-In',
                status:        'waiting',
                issuedAt:      serverTimestamp(),
                printed:       false,
                called:        false,
                isReservation: true,
                reservationId: reservationId
            });
            // ✅ FIX #7 — Unified reservation activation status to 'active' (matches app.js listener)
            transaction.update(resRef, {
                status:      'active',
                ticketNumber: tNum,
                activatedAt: serverTimestamp()
            });
        });

        await printTicket(tNum, dept);

        document.getElementById('scanDept').textContent   = dept.toUpperCase();
        document.getElementById('scanNumber').textContent = tNum;
        document.getElementById('scanId').textContent     = res.studentId || res.userId;
        document.getElementById('scanReason').textContent = res.reason;
        document.getElementById('scanAhead').textContent  = ahead + ' people';

        const scanQREl = document.getElementById('scanTicketQR');
        scanQREl.innerHTML = '';
        // ✅ FIX #22 — Use PUBLIC_URL for scan success QR too
        new QRCode(scanQREl, {
            text: PUBLIC_URL + '/tracker.html?t=' + encodeURIComponent(tNum) + '&d=' + dept,
            width: 110, height: 110, colorDark: '#1f3c88', colorLight: '#ffffff'
        });
        goScreen('scan-success');
        playBeep();
    } catch (e) {
        console.error(e);
        setScanStatus('Server error. Try again.');
    }
}

function setScanStatus(msg) {
    const el = document.getElementById('scanStatus');
    if (el) el.textContent = msg;
}

// ── PRINT ─────────────────────────────────────────────────────────────────────
async function printTicket(tNum, dept) {
    // ✅ FIX #22 — Use PUBLIC_URL for printed QR link
    const qr_link = PUBLIC_URL + '/tracker.html?t=' + encodeURIComponent(tNum) + '&d=' + dept;
    try {
        const res = await fetch(PRINTER_URL, {
            method: 'POST', mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: tNum, dept, qr_link })
        });
        const json = await res.json();
        if (json.status !== 'Success') console.warn('[Printer]', json.message);
        else console.log('[Printer] OK:', tNum);
    } catch (e) {
        console.warn('[Printer] Unreachable — is printer_server.py running?', e.message);
    }
}

// ── AUDIO BEEP ────────────────────────────────────────────────────────────────
function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.4, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.3);
    } catch (_) {}
}

// ── SYSTEM STATE RECOVERY ─────────────────────────────────────────────────────
// ✅ FIX #8 — Include 'serving' tickets in queue count during recovery
async function recoverSystemState() {
    try {
        for (const dept of ['cashier', 'registrar']) {
            const prefix = dept === 'cashier' ? 'C' : 'R';

            // Count waiting AND serving (both occupy a queue slot)
            const activeSnap = await getDocs(query(
                collection(db, 'tickets'),
                where('department', '==', dept),
                where('status', 'in', ['waiting', 'serving'])
            ));
            const realQueue = activeSnap.size;

            const allSnap = await getDocs(query(
                collection(db, 'tickets'),
                where('department', '==', dept)
            ));
            let maxCounter = 0;
            allSnap.forEach(d => {
                const n = parseInt((d.data().ticketNumber || '').replace(prefix + '-', ''), 10);
                if (!isNaN(n) && n > maxCounter) maxCounter = n;
            });

            const dRef   = doc(db, 'departments', dept);
            const dSnap  = await getDoc(dRef);
            const current = dSnap.exists() ? (dSnap.data().counter || 0) : 0;
            await updateDoc(dRef, { queue: realQueue, counter: Math.max(current, maxCounter) });
        }
        console.log('[Recovery] System state verified.');
    } catch (e) {
        console.warn('[Recovery]', e.message);
    }
}