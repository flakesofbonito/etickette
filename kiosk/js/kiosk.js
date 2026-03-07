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

const PUBLIC_URL  = 'https://etickette-78f74.web.app';
const PRINTER_URL = 'http://localhost:8000/print';

const REASONS = {
    cashier: [
        { label: "Pay Tuition / Fees",       docs: ["Valid ID", "Statement of Account"] },
        { label: "Pay Miscellaneous Fees",    docs: ["Valid ID", "Fee Slip"] },
        { label: "Request Official Receipt",  docs: ["Valid ID", "Proof of Payment"] },
        { label: "Scholarship Clearance",     docs: ["Valid ID", "Grant Letter"] },
        { label: "Other",                     docs: [] }
    ],
    registrar: [
        { label: "Request Transcript (TOR)",   docs: ["Valid ID", "Request Form", "Clearance"] },
        { label: "Certificate of Enrollment",  docs: ["Valid ID", "Request Form"] },
        { label: "Certificate of Graduation",  docs: ["Valid ID", "Request Form", "Clearance"] },
        { label: "Form 137 / 138",             docs: ["Valid ID", "Request Form"] },
        { label: "Diploma / Authentication",   docs: ["Valid ID", "Claim Stub"] },
        { label: "Other",                      docs: [] }
    ]
};

let app, db;
let selectedDept        = 'cashier';
let selectedUserType    = 'student';
let selectedDisplayName = null;
let selectedReason      = null;
let pendingUserId       = null;
let html5QrCode         = null;
let scannerActive       = false;
let deptStatus      = { cashier: true, registrar: true };
let deptStatusLabel = { cashier: 'open', registrar: 'open' };

// ── INIT ──────────────────────────────────────────────────────────────────────
export function initKiosk() {
    app = initializeApp(firebaseConfig);
    db  = getFirestore(app);

    window.goScreen            = goScreen;
    window.pickDept            = pickDept;      
    window.pickUserType        = pickUserType;   
    window.submitId            = submitId;
    window.submitReason        = submitReason;  
    window.toggleReasonDropdown = toggleReasonDropdown; 
    window.proceedIssue        = proceedIssue;
    window.startScanner = startScanner;
    window.stopScanner         = stopScanner;
    window.addEventListener('beforeunload', () => stopScanner());
    document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopScanner();
    });

    updateClock();
    setInterval(updateClock, 1000);
    listenToSettings();
    listenToQueueCounts();  
    initIdleTimeout();

    goScreen('home');
}

function updateClock() {
    const el = document.getElementById('kioskTime');
    if (el) el.textContent = new Date().toLocaleTimeString('en-PH', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
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

function listenToQueueCounts() {
    for (const dept of ['cashier', 'registrar']) {
        onSnapshot(
            doc(db, 'departments', dept),
            snap => {
                if (!snap.exists()) return;
                const data = snap.data();
                const st   = (data.status || 'open').toLowerCase();
                const open = st === 'open';
                deptStatus[dept]      = open;
                deptStatusLabel[dept] = st;

                const key = dept === 'cashier' ? 'cashierQueueText' : 'registrarQueueText';
                const qEl = document.getElementById(key);
                if (qEl) qEl.textContent = open
                    ? (data.queue || 0) + ' in queue'
                    : st === 'break' ? '🟡 On Break' : '🔴 Closed';

                const btnId = dept === 'cashier' ? 'deptCashier' : 'deptRegistrar';
                const btn   = document.getElementById(btnId);
                if (btn) btn.classList.toggle('disabled', !open);

                const chipId = dept === 'cashier' ? 'cashierStatus' : 'registrarStatus';
                const chip   = document.getElementById(chipId);
                if (chip) {
                    const map = {
                        open:   ['OPEN',     'chip-open'],
                        break:  ['ON BREAK', 'chip-break'],
                        closed: ['CLOSED',   'chip-closed']
                    };
                    const [label, cls] = map[st] || map.open;
                    chip.textContent = label;
                    chip.className   = cls;
                }
            },
            err => console.error('[listenToQueueCounts] ' + dept + ':', err.code, err.message)
        );
    }
}

function goScreen(name) {
    const current = document.querySelector('.screen.active');
    if (current && current.id === 'screen-scan' && name !== 'scan') {
        stopScanner();
    }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + name);
    if (el) el.classList.add('active');
}

function pickDept(dept) {
    if (!deptStatus[dept]) {
        const st  = deptStatusLabel[dept];
        const msg = st === 'break' ? 'currently on break' : 'currently closed';
        alert('The ' + dept.charAt(0).toUpperCase() + dept.slice(1) + ' window is ' + msg + '. Please try again later.');
        return;
    }
    selectedDept = dept;
    goScreen('usertype');
}

function pickUserType(type) {
    selectedUserType = type;

    const idField   = document.getElementById('kioskIdField');
    const nameField = document.getElementById('kioskNameField');
    const inp       = document.getElementById('idInput');
    const title     = document.getElementById('idScreenTitle');
    const deptChosen = document.getElementById('deptChosen');

    if (deptChosen) deptChosen.textContent = selectedDept.toUpperCase();

    if (type === 'student') {
        if (idField)   idField.style.display   = 'block';
        if (nameField) nameField.style.display = 'none';
        if (inp) { inp.placeholder = 'e.g. 02000385394'; inp.inputMode = 'numeric'; }
        if (title) title.textContent = 'Enter Your Student ID';

    } else if (type === 'teacher') {
        if (idField)   idField.style.display   = 'block';
        if (nameField) nameField.style.display = 'none';
        if (inp) { inp.placeholder = 'Employee ID (11 digits)'; inp.inputMode = 'numeric'; }
        if (title) title.textContent = 'Enter Your Employee ID';

    } else if (type === 'parent') {
        if (idField)   idField.style.display   = 'block';
        if (nameField) nameField.style.display = 'block';
        if (inp) { inp.placeholder = "Child's Student ID (11 digits)"; inp.inputMode = 'numeric'; }
        if (title) title.textContent = "Enter Your Child's Student ID";

    } else { 
        if (idField)   idField.style.display   = 'none';
        if (nameField) nameField.style.display = 'block';
        if (title) title.textContent = 'Enter Your Full Name';
    }

    const idInp = document.getElementById('idInput');
    const nameInp = document.getElementById('nameInput');
    const errEl = document.getElementById('idError');
    if (idInp)   idInp.value   = '';
    if (nameInp) nameInp.value = '';
    if (errEl)   errEl.textContent = '';

    goScreen('id');
}


function toggleReasonDropdown() {
    const list  = document.getElementById('reasonDropdownList');
    const arrow = document.getElementById('reasonArrow');
    if (!list) return;
    const isHidden = list.classList.contains('hidden');
    list.classList.toggle('hidden', !isHidden);
    if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
}

function buildReasonList() {
    selectedReason = null; 

    const trigger = document.getElementById('reasonTriggerText');
    if (trigger) trigger.textContent = '— Please Select a Reason —';
    const arrow = document.getElementById('reasonArrow');
    if (arrow) arrow.textContent = '▼';

    const list = document.getElementById('reasonDropdownList');
    if (!list) return;
    list.innerHTML = '';
    list.classList.add('hidden');

    const deptLbl = document.getElementById('reasonDeptLabel');
    if (deptLbl) deptLbl.textContent = selectedDept.toUpperCase();

    (REASONS[selectedDept] || []).forEach((r, i) => {
        const btn = document.createElement('button');
        btn.className   = 'reason-btn';
        btn.textContent = r.label;
        btn.onclick     = () => {
            selectReason(i);
            list.classList.add('hidden');
            if (arrow) arrow.textContent = '▼';
        };
        list.appendChild(btn);
    });

    const errEl = document.getElementById('reasonError');
    if (errEl) errEl.textContent = '';
}

async function submitId() {
    const errEl = document.getElementById('idError');
    if (errEl) errEl.textContent = '';

    let userId = null, displayName = null;

    if (selectedUserType === 'student' || selectedUserType === 'teacher') {
        const val = (document.getElementById('idInput')?.value || '').trim();
        if (!/^\d{11}$/.test(val)) {
            if (errEl) errEl.textContent = 'Please enter a valid 11-digit ID.';
            return;
        }
        userId = val; displayName = val;

    } else if (selectedUserType === 'parent') {
        const childId = (document.getElementById('idInput')?.value || '').trim();
        const name    = (document.getElementById('nameInput')?.value || '').trim();
        if (!/^\d{11}$/.test(childId)) { if (errEl) errEl.textContent = "Enter a valid 11-digit Student ID."; return; }
        if (name.length < 2)           { if (errEl) errEl.textContent = 'Please enter your full name.'; return; }
        userId = childId; displayName = name + ' (Parent)';

    } else {
        const name = (document.getElementById('nameInput')?.value || '').trim();
        if (name.length < 2) { if (errEl) errEl.textContent = 'Please enter your full name.'; return; }
        userId      = 'GUEST-' + Date.now();
        displayName = name;
    }

    const submitBtn = document.querySelector('#screen-id .kiosk-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Checking...'; }

    try {
        const [resSnap, ticketSnap] = await Promise.all([
            getDocs(query(collection(db, 'reservations'),
                where('studentId', '==', userId), where('status', '==', 'pending'))),
            getDocs(query(collection(db, 'tickets'),
                where('userId', '==', userId), where('status', '==', 'waiting')))
        ]);

        if (!resSnap.empty) {
            if (errEl) errEl.textContent = 'You have a pending reservation. Please scan your QR code instead.';
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Next →'; }
            return;
        }
        if (!ticketSnap.empty) {
            const t = ticketSnap.docs[0].data();
            if (errEl) errEl.textContent = 'You already have ticket ' + t.ticketNumber + ' in the ' + t.department.toUpperCase() + ' queue.';
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Next →'; }
            return;
        }
    } catch (e) {
        console.warn('[ID check]', e.message);
    }

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Next →'; }

    pendingUserId       = userId;
    selectedDisplayName = displayName;
    buildReasonList();
    goScreen('reason');
}

function selectReason(idx) {
    selectedReason = REASONS[selectedDept][idx];
    const trigger  = document.getElementById('reasonTriggerText');
    if (trigger && selectedReason) trigger.textContent = selectedReason.label;
}

function submitReason() {
    const errEl = document.getElementById('reasonError');
    if (!selectedReason) {
        if (errEl) errEl.textContent = 'Please select a reason before continuing.';
        return;
    }
    if (errEl) errEl.textContent = '';
    showDocsScreen(selectedReason);
}

function showDocsScreen(reason) {
    const lbl = document.getElementById('docsReasonLabel');
    if (lbl) lbl.textContent = selectedDept.toUpperCase() + ' — ' + reason.label;

    const list = document.getElementById('kioskDocsList');
    if (!list) { goScreen('docs'); return; }
    list.innerHTML = '';

    if (reason.docs && reason.docs.length > 0) {
        reason.docs.forEach(docName => {
            const item = document.createElement('div');
            item.className = 'kiosk-doc-item';
            item.innerHTML = `<span class="kiosk-doc-icon">📄</span><span>${docName}</span>`;
            list.appendChild(item);
        });
    } else {
        list.innerHTML = '<p class="no-docs-msg">✅ No specific documents required.</p>';
    }
    goScreen('docs');
}

async function proceedIssue() {
    if (!pendingUserId) { goScreen('home'); return; }
    await issueTicket(pendingUserId);
}

async function issueTicket(userId) {
    const btn = document.querySelector('#screen-docs .kiosk-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Issuing...'; }

    try {
        const resCheck = await getDocs(query(
            collection(db, 'reservations'),
            where('studentId', '==', userId), where('status', '==', 'pending')
        ));
        if (!resCheck.empty) {
            if (btn) { btn.disabled = false; btn.textContent = '✅ I Have All Documents — Get Ticket'; }
            alert('You have a pending reservation. Please scan your QR code instead.');
            goScreen('home'); return;
        }

        const activeCheck = await getDocs(query(
            collection(db, 'tickets'),
            where('userId', '==', userId), where('status', '==', 'waiting')
        ));
        if (!activeCheck.empty) {
            const t = activeCheck.docs[0].data();
            if (btn) { btn.disabled = false; btn.textContent = '✅ I Have All Documents — Get Ticket'; }
            alert('You already have ticket ' + t.ticketNumber + ' in the queue.');
            goScreen('home'); return;
        }

        const prefix = selectedDept === 'cashier' ? 'C' : 'R';
        const dRef   = doc(db, 'departments', selectedDept);
        const sRef   = doc(db, 'system', 'settings');

        let tNum, ahead;
        await runTransaction(db, async (transaction) => {
            const dSnap      = await transaction.get(dRef);
            if (!dSnap.exists()) throw new Error('Department doc missing');
            const newCounter = (dSnap.data().counter || 0) + 1;
            const newQueue   = (dSnap.data().queue   || 0) + 1;
            tNum  = prefix + '-' + String(newCounter).padStart(2, '0');
            ahead = Math.max(0, newQueue - 1);
            const ticketRef  = doc(collection(db, 'tickets'), tNum);
            transaction.update(dRef, { counter: newCounter, queue: newQueue });
            transaction.update(sRef, { ticketsIssued: increment(1) });
            transaction.set(ticketRef, {
                ticketNumber: tNum, department: selectedDept,
                userId, userType: selectedUserType, displayName: selectedDisplayName,
                reason: selectedReason ? selectedReason.label : '—',
                status: 'waiting', issuedAt: serverTimestamp(),
                printed: false, called: false, isReservation: false
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

function showTicketScreen(tNum, userId, ahead) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('issuedDept',   selectedDept.toUpperCase());
    set('issuedNumber', tNum);
    set('issuedId',     userId);
    set('issuedReason', selectedReason ? selectedReason.label : '—');
    set('issuedAhead',  ahead + ' people');
    set('issuedWait',   '~' + (ahead * 5) + ' min');

    const qrEl = document.getElementById('ticketQR');
    if (qrEl) {
        qrEl.innerHTML = '';
        new QRCode(qrEl, {
            text: PUBLIC_URL + '/tracker.html?t=' + encodeURIComponent(tNum) + '&d=' + selectedDept,
            width: 110, height: 110, colorDark: '#1f3c88', colorLight: '#ffffff'
        });
    }
    goScreen('ticket');
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
    }).catch(e => {
    if (String(e).includes('NotReadableError')) {
        setScanStatus('❌ Camera is in use by another app. Close it and try again.');
    } else if (String(e).includes('NotAllowedError')) {
        setScanStatus('❌ Camera permission denied. Please allow camera access.');
    } else {
        setScanStatus('❌ Camera error. Please try again.');
    }
});
}

function stopScanner() {
    if (html5QrCode && scannerActive) {
        html5QrCode.stop()
            .then(() => { scannerActive = false; html5QrCode = null; })
            .catch(() => { scannerActive = false; html5QrCode = null; });
    }
}

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
        const resRef = doc(db, 'reservations', reservationId);

        let tNum, ahead;
        await runTransaction(db, async (transaction) => {
            const dSnap      = await transaction.get(dRef);
            if (!dSnap.exists()) throw new Error('Department doc missing');
            const newCounter = (dSnap.data().counter || 0) + 1;
            const newQueue   = (dSnap.data().queue   || 0) + 1;
            tNum  = prefix + '-' + String(newCounter).padStart(2, '0');
            ahead = Math.max(0, newQueue - 1);
            const ticketRef  = doc(collection(db, 'tickets'), tNum);
            transaction.update(dRef, { counter: newCounter, queue: newQueue });
            transaction.set(ticketRef, {
                ticketNumber: tNum, department: dept,
                userId: res.studentId || res.userId || 'N/A',
                userType: res.userType || 'student',
                displayName: res.displayName || res.studentId || 'N/A',
                reason: res.reason || 'Reservation Check-In',
                status: 'waiting', issuedAt: serverTimestamp(),
                printed: false, called: false,
                isReservation: true, reservationId
            });
            transaction.update(resRef, { status: 'active', ticketNumber: tNum, activatedAt: serverTimestamp() });
        });

        await printTicket(tNum, dept);

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('scanDept',   dept.toUpperCase());
        set('scanNumber', tNum);
        set('scanId',     res.studentId || res.userId);
        set('scanReason', res.reason);
        set('scanAhead',  ahead + ' people');

        const scanQREl = document.getElementById('scanTicketQR');
        if (scanQREl) {
            scanQREl.innerHTML = '';
            new QRCode(scanQREl, {
                text: PUBLIC_URL + '/tracker.html?t=' + encodeURIComponent(tNum) + '&d=' + dept,
                width: 110, height: 110, colorDark: '#1f3c88', colorLight: '#ffffff'
            });
        }
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

async function printTicket(tNum, dept) {
    const qr_link = PUBLIC_URL + '/tracker.html?t=' + encodeURIComponent(tNum) + '&d=' + dept;
    try {
        const res = await fetch(PRINTER_URL, {
            method: 'POST', mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: tNum, dept, qr_link })
        });
        const json = await res.json();
        if (json.status !== 'Success') console.warn('[Printer]', json.message);
    } catch (e) {
        console.warn('[Printer] Unreachable — is printer_server.py running?', e.message);
    }
}

function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.4, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.3);
    } catch (_) {}
}

function initIdleTimeout() {
    const IDLE_MS = 45000;
    let idleTimer = null;
    let countdownInterval = null;
    let idleWarningShown = false;

    if (!document.getElementById('idleStyle')) {
        const style = document.createElement('style');
        style.id = 'idleStyle';
        style.textContent = `@keyframes slideUp { from { transform:translateY(100%); } to { transform:translateY(0); } }`;
        document.head.appendChild(style);
    }

    function resetIdleTimer() {
        clearTimeout(idleTimer);
        clearInterval(countdownInterval);
        if (idleWarningShown) {
            const banner = document.getElementById('idleWarningBanner');
            if (banner) banner.remove();
            idleWarningShown = false;
        }
        const active = document.querySelector('.screen.active');
        if (!active) return;
        const id = active.id;
        if (id === 'screen-home' || id === 'screen-ticket' || id === 'screen-scan-success') return;
        idleTimer = setTimeout(showIdleWarning, IDLE_MS - 10000);
    }

    function showIdleWarning() {
        idleWarningShown = true;
        let secondsLeft = 10;
        const banner = document.createElement('div');
        banner.id = 'idleWarningBanner';
        banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1f3c88;color:#fff;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;z-index:9999;border-top:4px solid #e3cf57;animation:slideUp .3s ease;font-family:\'Plus Jakarta Sans\',sans-serif;';
        banner.innerHTML = `
            <div>
                <div style="font-size:16px;font-weight:700;">⏱ Still there?</div>
                <div style="font-size:13px;opacity:.8;margin-top:2px;">Returning to home in <span id="idleCountdown">10</span> seconds...</div>
            </div>
            <button onclick="window.resetIdleTimer()" style="background:#e3cf57;color:#1f3c88;border:none;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;">
                I'm Still Here
            </button>`;
        document.body.appendChild(banner);
        countdownInterval = setInterval(() => {
            secondsLeft--;
            const el = document.getElementById('idleCountdown');
            if (el) el.textContent = secondsLeft;
            if (secondsLeft <= 0) { clearInterval(countdownInterval); performIdleReset(); }
        }, 1000);
    }

    function performIdleReset() {
        const banner = document.getElementById('idleWarningBanner');
        if (banner) banner.remove();
        idleWarningShown = false;
        stopScanner();
        document.querySelectorAll('.kiosk-input, input[type="text"], input[type="number"]').forEach(el => { el.value = ''; });
        document.querySelectorAll('.kiosk-error').forEach(el => { el.textContent = ''; });
        goScreen('home');
    }

    window.resetIdleTimer = resetIdleTimer;

    ['touchstart', 'touchmove', 'click', 'keydown', 'mousemove', 'mousedown'].forEach(evt =>
        document.addEventListener(evt, resetIdleTimer, { passive: true }));

    resetIdleTimer();
}