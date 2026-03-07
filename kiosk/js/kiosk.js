import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, doc, collection, setDoc, getDoc, getDocs,
    onSnapshot, updateDoc, increment, serverTimestamp, query, where
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
let selectedDept        = null;
let selectedUserType    = 'student';
let selectedDisplayName = null;
let pendingUserId       = null;   // holds userId between ID screen and issue
let selectedReason      = null;   // { label, docs }
let html5QrCode         = null;
let scannerActive       = false;

export function initKiosk() {
    app = initializeApp(firebaseConfig);
    db  = getFirestore(app);

    window.goScreen            = goScreen;
    window.pickDept            = pickDept;
    window.pickUserType        = pickUserType;
    window.submitId            = submitId;
    window.toggleReasonDropdown = toggleReasonDropdown;
    window.submitReason        = submitReason;
    window.proceedIssue        = proceedIssue;
    window.stopScanner         = stopScanner;

    updateClock();
    setInterval(updateClock, 1000);
    listenToDepts();
    listenToSettings();
    recoverSystemState();

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        const wrap = document.getElementById('reasonDropdownList');
        const trigger = document.getElementById('reasonTrigger');
        if (wrap && !wrap.classList.contains('hidden') &&
            !wrap.contains(e.target) && !trigger.contains(e.target)) {
            closeReasonDropdown();
        }
    });
}

// ── CLOCK ─────────────────────────────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    const el = document.getElementById('kioskTime');
    if (el) el.textContent = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

// ── SCREENS ───────────────────────────────────────────────────────────────────
function goScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + name).classList.add('active');
    if (name === 'scan') startScanner();
    if (name === 'home') resetFlow();
}

function resetFlow() {
    selectedReason      = null;
    pendingUserId       = null;
    selectedDisplayName = null;
    // Reset reason dropdown
    const trigger = document.getElementById('reasonTriggerText');
    if (trigger) trigger.textContent = '— Please Select a Reason —';
    const arrow = document.getElementById('reasonArrow');
    if (arrow) arrow.textContent = '▼';
    const list = document.getElementById('reasonDropdownList');
    if (list) list.classList.add('hidden');
    const err = document.getElementById('reasonError');
    if (err) err.textContent = '';
    // Reset ID form
    const idInput = document.getElementById('idInput');
    if (idInput) idInput.value = '';
    const nameInput = document.getElementById('nameInput');
    if (nameInput) nameInput.value = '';
    const idErr = document.getElementById('idError');
    if (idErr) idErr.textContent = '';
}

// ── DEPT + USERTYPE ───────────────────────────────────────────────────────────
function pickDept(dept) {
    selectedDept = dept;
    document.getElementById('deptChosen').textContent = dept.toUpperCase();
    document.getElementById('reasonDeptLabel').textContent = dept.toUpperCase();
    goScreen('usertype');
}

function pickUserType(type) {
    selectedUserType = type;
    const idField   = document.getElementById('kioskIdField');
    const nameField = document.getElementById('kioskNameField');
    const title     = document.getElementById('idScreenTitle');

    if (type === 'student') {
        title.textContent = 'Enter Your Student ID';
        idField.style.display   = 'block';
        nameField.style.display = 'none';
        document.getElementById('idInput').placeholder = 'e.g. 02000385394';
    } else if (type === 'teacher') {
        title.textContent = 'Enter Your Employee ID';
        idField.style.display   = 'block';
        nameField.style.display = 'none';
        document.getElementById('idInput').placeholder = 'e.g. 02000385394';
    } else if (type === 'parent') {
        title.textContent = "Enter Your Child's Student ID";
        idField.style.display   = 'block';
        nameField.style.display = 'block';
        document.getElementById('idInput').placeholder = "Child's Student ID";
        document.getElementById('nameInput').placeholder = 'Your full name';
    } else if (type === 'guest') {
        title.textContent = 'Enter Your Full Name';
        idField.style.display   = 'none';
        nameField.style.display = 'block';
        document.getElementById('nameInput').placeholder = 'Your full name';
    }
    goScreen('id');
}

// ── ID SUBMIT ─────────────────────────────────────────────────────────────────
function submitId() {
    const err = document.getElementById('idError');
    err.textContent = '';

    let userId = null, displayName = null;

    if (selectedUserType === 'student' || selectedUserType === 'teacher') {
        const val = document.getElementById('idInput').value.trim();
        if (!/^\d{11}$/.test(val)) { err.textContent = 'Please enter a valid 11-digit ID.'; return; }
        userId = val; displayName = val;

    } else if (selectedUserType === 'parent') {
        const childId = document.getElementById('idInput').value.trim();
        const name    = document.getElementById('nameInput').value.trim();
        if (!/^\d{11}$/.test(childId)) { err.textContent = "Enter a valid 11-digit Student ID for your child."; return; }
        if (name.length < 2) { err.textContent = 'Please enter your full name.'; return; }
        userId = childId; displayName = name + ' (Parent)';

    } else if (selectedUserType === 'guest') {
        const name = document.getElementById('nameInput').value.trim();
        if (name.length < 2) { err.textContent = 'Please enter your full name.'; return; }
        userId = 'GUEST-' + Date.now(); displayName = name;
    }

    selectedDisplayName = displayName;
    pendingUserId       = userId;

    // Build reason dropdown for chosen dept then go to reason screen
    buildReasonDropdown(selectedDept);
    goScreen('reason');
}

// ── REASON DROPDOWN ───────────────────────────────────────────────────────────
function buildReasonDropdown(dept) {
    const list = document.getElementById('reasonDropdownList');
    list.innerHTML = '';
    selectedReason = null;
    document.getElementById('reasonTriggerText').textContent = '— Please Select a Reason —';
    document.getElementById('reasonError').textContent = '';

    (REASONS[dept] || []).forEach(r => {
        const item = document.createElement('div');
        item.className = 'reason-dropdown-item';
        item.textContent = r.label;
        item.onclick = () => {
            selectedReason = r;
            document.getElementById('reasonTriggerText').textContent = r.label;
            document.getElementById('reasonError').textContent = '';
            closeReasonDropdown();
        };
        list.appendChild(item);
    });
}

function toggleReasonDropdown() {
    const list  = document.getElementById('reasonDropdownList');
    const arrow = document.getElementById('reasonArrow');
    if (list.classList.contains('hidden')) {
        list.classList.remove('hidden');
        arrow.textContent = '▲';
    } else {
        closeReasonDropdown();
    }
}

function closeReasonDropdown() {
    document.getElementById('reasonDropdownList').classList.add('hidden');
    document.getElementById('reasonArrow').textContent = '▼';
}

// ── REASON SUBMIT → DOCS SCREEN ───────────────────────────────────────────────
function submitReason() {
    if (!selectedReason) {
        document.getElementById('reasonError').textContent = 'Please select a reason to continue.';
        return;
    }
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

// ── ISSUE TICKET ──────────────────────────────────────────────────────────────
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

        await updateDoc(dRef, { counter: increment(1), queue: increment(1) });
        await updateDoc(sRef, { ticketsIssued: increment(1) });

        const snapAfter = await getDoc(dRef);
        const num   = snapAfter.data().counter;
        const tNum  = prefix + '-' + String(num).padStart(2, '0');
        const ahead = Math.max(0, (snapAfter.data().queue || 1) - 1);

        await setDoc(doc(collection(db, 'tickets'), tNum), {
            ticketNumber: tNum,
            department:   selectedDept,
            userId:       userId,
            userType:     selectedUserType,
            displayName:  selectedDisplayName,
            reason:       selectedReason ? selectedReason.label : '—',
            status:       'waiting',
            issuedAt:     serverTimestamp(),
            printed:      false,
            called:       false,
            isReservation: false
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
    new QRCode(qrEl, {
        text: window.location.origin + '/tracker.html?t=' + encodeURIComponent(tNum) + '&d=' + selectedDept,
        width: 110, height: 110,
        colorDark: '#1f3c88', colorLight: '#ffffff'
    });
    goScreen('ticket');
}

// ── PRINT ─────────────────────────────────────────────────────────────────────
async function printTicket(tNum, dept) {
    const qr_link = window.location.origin + '/tracker.html?t=' + encodeURIComponent(tNum) + '&d=' + dept;
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

// ── BEEP ──────────────────────────────────────────────────────────────────────
function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.4);
    } catch (_) {}
}

// ── FIRESTORE LISTENERS ───────────────────────────────────────────────────────
function listenToDepts() {
    ['cashier', 'registrar'].forEach(dept => {
        onSnapshot(doc(db, 'departments', dept), snap => {
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
                else btnEl.classList.add('disabled');
            }
        });
    });
}

function listenToSettings() {
    onSnapshot(doc(db, 'system', 'settings'), snap => {
        if (!snap.exists()) return;
        const d = snap.data();
        if (d.statusMessage) document.getElementById('kioskBanner').textContent = d.statusMessage;
    });
}

// ── QR SCANNER ────────────────────────────────────────────────────────────────
function startScanner() {
    if (scannerActive) return;
    html5QrCode = new Html5Qrcode('qr-reader');
    Html5Qrcode.getCameras().then(cams => {
        if (!cams || !cams.length) { setScanStatus('No camera found.'); return; }
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

async function onScanSuccess(decoded) {
    stopScanner();
    setScanStatus('QR scanned! Verifying…');

    let reservationId = null;
    try {
        const url = new URL(decoded);
        reservationId = url.searchParams.get('res') || url.searchParams.get('id');
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

        await updateDoc(dRef, { counter: increment(1), queue: increment(1) });
        await updateDoc(sRef, { ticketsIssued: increment(1) });

        const snapAfter = await getDoc(dRef);
        const num   = snapAfter.data().counter;
        const tNum  = prefix + '-' + String(num).padStart(2, '0');
        const ahead = Math.max(0, (snapAfter.data().queue || 1) - 1);

        await setDoc(doc(collection(db, 'tickets'), tNum), {
            ticketNumber: tNum, department: dept,
            userId: res.studentId, userType: 'student',
            reason: res.reason, status: 'waiting',
            issuedAt: serverTimestamp(), printed: false,
            called: false, isReservation: true, reservationId
        });
        await updateDoc(doc(db, 'reservations', reservationId), {
            status: 'active', ticketNumber: tNum, activatedAt: serverTimestamp()
        });

        await printTicket(tNum, dept);

        document.getElementById('scanDept').textContent   = dept.toUpperCase();
        document.getElementById('scanNumber').textContent = tNum;
        document.getElementById('scanId').textContent     = res.studentId;
        document.getElementById('scanReason').textContent = res.reason;
        document.getElementById('scanAhead').textContent  = ahead + ' people';

        const scanQREl = document.getElementById('scanTicketQR');
        scanQREl.innerHTML = '';
        new QRCode(scanQREl, {
            text: window.location.origin + '/tracker.html?t=' + encodeURIComponent(tNum) + '&d=' + dept,
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

// ── SYSTEM STATE RECOVERY ─────────────────────────────────────────────────────
async function recoverSystemState() {
    try {
        for (const dept of ['cashier', 'registrar']) {
            const prefix    = dept === 'cashier' ? 'C' : 'R';
            const waitSnap  = await getDocs(query(collection(db, 'tickets'), where('department', '==', dept), where('status', '==', 'waiting')));
            const realQueue = waitSnap.size;
            const allSnap   = await getDocs(query(collection(db, 'tickets'), where('department', '==', dept)));
            let maxCounter  = 0;
            allSnap.forEach(d => {
                const n = parseInt((d.data().ticketNumber || '').replace(prefix + '-', ''), 10);
                if (!isNaN(n) && n > maxCounter) maxCounter = n;
            });
            const dRef   = doc(db, 'departments', dept);
            const dSnap  = await getDoc(dRef);
            const current = dSnap.exists() ? (dSnap.data().counter || 0) : 0;
            await updateDoc(dRef, { queue: realQueue, counter: Math.max(current, maxCounter) });
        }
    } catch (e) {
        console.warn('[Recovery]', e.message);
    }
}