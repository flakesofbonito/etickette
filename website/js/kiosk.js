import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, doc, collection, getDoc, getDocs,
    onSnapshot, increment, serverTimestamp, query, where,
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

const PUBLIC_URL  = 'https://etickette.web.app';
const PRINTER_URL = 'http://localhost:8000/print';

import { REASONS } from './reasons.js';

let app, db;
let selectedDept        = 'cashier';
let selectedUserType    = 'student';
let selectedDisplayName = null;
let selectedReason      = null;
let pendingUserId       = null;
let deptStatus      = { cashier: true, registrar: true };
let deptStatusLabel = { cashier: 'open', registrar: 'open' };
let deptAvgWait     = { cashier: 0, registrar: 0 };

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
    window.startScreensaver = startScreensaver;
    window.dismissScreensaver = dismissScreensaver;
    window.reprintTicket = reprintTicket;
    window.addEventListener('beforeunload', () => stopScanner());
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopScanner(); });
    window.numpadPress     = numpadPress;
    window.numpadBackspace = numpadBackspace;
    window.numpadClear     = numpadClear;

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
        const d = snap.data();

        const cashierQuota   = d.cashierQuota   || d.dailyQuota || 100;
        const registrarQuota = d.registrarQuota || d.dailyQuota || 100;
        const cashierIssued   = d.cashierIssued   || 0;
        const registrarIssued = d.registrarIssued || 0;
        const cashierRem   = Math.max(0, cashierQuota   - cashierIssued);
        const registrarRem = Math.max(0, registrarQuota - registrarIssued);
        const cashierFull   = cashierIssued   >= cashierQuota;
        const registrarFull = registrarIssued >= registrarQuota;

        const el = document.getElementById('quotaDisplay');
        if (el) el.textContent =
            `Cashier: ${cashierRem}/${cashierQuota}  |  Registrar: ${registrarRem}/${registrarQuota}`;

        const fullMsg = document.getElementById('quotaFullMsg');
        if (fullMsg) fullMsg.style.display = (cashierFull && registrarFull) ? 'block' : 'none';

        const issueBtn = document.getElementById('btnIssueTicket');
        const resBtn   = document.getElementById('btnHaveReservation');
        const allFull  = cashierFull && registrarFull;
        if (issueBtn) { issueBtn.classList.toggle('disabled', allFull); issueBtn.style.pointerEvents = allFull ? 'none' : ''; }
        if (resBtn)   { resBtn.classList.toggle('disabled', allFull);   resBtn.style.pointerEvents   = allFull ? 'none' : ''; }

        const cashierBtn   = document.getElementById('deptCashier');
        const registrarBtn = document.getElementById('deptRegistrar');
        if (cashierBtn)   cashierBtn.classList.toggle('disabled', cashierFull);
        if (registrarBtn) registrarBtn.classList.toggle('disabled', registrarFull);

        const cashierQText   = document.getElementById('cashierQueueText');
        const registrarQText = document.getElementById('registrarQueueText');
        if (cashierFull   && cashierQText)   cashierQText.textContent   = 'Quota Full';
        if (registrarFull && registrarQText) registrarQText.textContent = 'Quota Full';
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
                deptAvgWait[dept] = data.avgWaitSeconds || 0;
                const open = st === 'open';
                deptStatus[dept]      = open;
                deptStatusLabel[dept] = st;

                const key = dept === 'cashier' ? 'cashierQueueText' : 'registrarQueueText';
                const qEl = document.getElementById(key);
                if (qEl) qEl.textContent = open
                    ? (data.queue || 0) + ' in queue'
                    : st === 'break' ? 'On Break' : 'Closed';

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

                const ssId = dept === 'cashier' ? 'ssCashier' : 'ssRegistrar';
                const ssEl = document.getElementById(ssId);
                if (ssEl) ssEl.textContent = open ? 'OPEN' : st === 'break' ? 'BREAK' : 'CLOSED';
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

    if (name === 'home') startScreensaver(); else clearTimeout(ssTimer);
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
        const numpad = document.getElementById('kioskNumpad');
        if (numpad) numpad.style.display = type === 'parent' ? 'none' : 'grid';
        if (inp) { inp.placeholder = "Child's Student ID (11 digits)"; inp.inputMode = 'numeric'; }
        if (title) title.textContent = "Enter Your Child's Student ID";

    }

    const idInp = document.getElementById('idInput');
    const nameInp = document.getElementById('nameInput');
    const errEl = document.getElementById('idError');
    if (idInp)   idInp.value   = '';
    if (nameInp) nameInp.value = '';
    if (errEl)   errEl.textContent = '';

    const numpad = document.getElementById('kioskNumpad');
    if (numpad) numpad.style.display = type === 'parent' ? 'none' : 'grid';

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
        if (r.category) {
            const header = document.createElement('div');
            header.className = 'reason-category-header';
            header.textContent = r.category;
            list.appendChild(header);
            return;
        }
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

function numpadPress(digit) {
    const inp = document.getElementById('idInput');
    if (!inp) return;
    if (inp.value.length >= 11) return;
    inp.value += digit;
    document.getElementById('idError').textContent = '';
}

function numpadBackspace() {
    const inp = document.getElementById('idInput');
    if (!inp) return;
    inp.value = inp.value.slice(0, -1);
}

function numpadClear() {
    const inp = document.getElementById('idInput');
    if (!inp) return;
    inp.value = '';
    document.getElementById('idError').textContent = '';
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

    }

    const submitBtn = document.querySelector('#screen-id .kiosk-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Checking...'; }

    try {
        const [resSnap, ticketSnap] = await Promise.all([
            getDocs(query(collection(db, 'reservations'),
                where('studentId', '==', userId), where('status', 'in', ['pending', 'active']))),
            getDocs(query(collection(db, 'tickets'),
                where('userId', '==', userId), where('status', 'in', ['waiting', 'serving'])))
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
    const item = REASONS[selectedDept][idx];
    if (!item || item.category) return;
    selectedReason = item;
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
    const btn = document.querySelector('#screen-docs .kiosk-submit-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'I Have All Documents — Get Ticket'; }

    const lbl = document.getElementById('docsReasonLabel');
    if (lbl) lbl.textContent = selectedDept.toUpperCase() + ' — ' + reason.label;

    const list = document.getElementById('kioskDocsList');
    if (!list) { goScreen('docs'); return; }
    list.innerHTML = '';

    if (reason.docs && reason.docs.length > 0) {
        reason.docs.forEach(docName => {
            const item = document.createElement('div');
            item.className = 'kiosk-doc-item';
            item.innerHTML = `<span class="kiosk-doc-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue-900)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span><span>${docName}</span>`;
            list.appendChild(item);
        });
    } else {
        list.innerHTML = '<p class="no-docs-msg" style="display:flex;align-items:center;justify-content:center;gap:8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>No specific documents required.</p>';
    }
    goScreen('docs');
}

async function proceedIssue() {
    if (!pendingUserId) { goScreen('home'); return; }
    await issueTicket(pendingUserId);
}

async function issueTicket(userId) {
    if (!deptStatus[selectedDept]) {
        alert('Sorry, the ' + selectedDept + ' department just closed. Please try again later.');
        goScreen('home');
        return;
    }

    const btn = document.querySelector('#screen-docs .kiosk-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Issuing...'; }

    try {
        const resCheck = await getDocs(query(
            collection(db, 'reservations'),
            where('studentId', '==', userId), where('status', 'in', ['pending', 'active'])
        ));
        if (!resCheck.empty) {
            if (btn) { btn.disabled = false; btn.textContent = 'I Have All Documents — Get Ticket'; }
            alert('You have a pending reservation. Please scan your QR code instead.');
            goScreen('home'); return;
        }

        const activeCheck = await getDocs(query(
            collection(db, 'tickets'),
            where('userId', '==', userId), where('status', '==', 'waiting')
        ));

        if (!activeCheck.empty) {
            const t = activeCheck.docs[0].data();
            if (btn) { btn.disabled = false; btn.textContent = 'I Have All Documents — Get Ticket'; }
            alert('You already have ticket ' + t.ticketNumber + ' in the queue.');
            goScreen('home'); return;
        }

        const prefix = selectedDept === 'cashier' ? 'C' : 'R';
        const dRef   = doc(db, 'departments', selectedDept);
        const sRef   = doc(db, 'system', 'settings');

        let tNum, ahead;
        await runTransaction(db, async (transaction) => {
            const sSnap = await transaction.get(doc(db, 'system', 'settings'));
            const deptQuotaKey  = selectedDept + 'Quota';
            const deptIssuedKey = selectedDept + 'Issued';
            const deptQuota  = sSnap.data()[deptQuotaKey]  || sSnap.data().dailyQuota || 100;
            const deptIssued = sSnap.data()[deptIssuedKey] || 0;
            if (deptIssued >= deptQuota) throw new Error('QUOTA_FULL');
            const dSnap      = await transaction.get(dRef);
            if (!dSnap.exists()) throw new Error('Department doc missing');
            const newCounter = (dSnap.data().counter || 0) + 1;
            const newQueue   = (dSnap.data().queue   || 0) + 1;
            tNum  = prefix + '-' + String(newCounter).padStart(2, '0');
            ahead = Math.max(0, newQueue - 1);
            const ticketRef  = doc(collection(db, 'tickets'), tNum);
            transaction.update(dRef, { counter: newCounter, queue: newQueue });
            transaction.update(sRef, {
                [deptIssuedKey]: increment(1),
                ticketsIssued: increment(1)
            });
            transaction.set(ticketRef, {
                ticketNumber: tNum, department: selectedDept,
                userId, userType: selectedUserType, displayName: selectedDisplayName,
                reason: selectedReason ? selectedReason.label : '—',
                requiredDocs: selectedReason ? selectedReason.docs : [],
                status: 'waiting', issuedAt: serverTimestamp(),
                printed: false, called: false, isReservation: false
            });
        });

        showTicketScreen(tNum, userId, ahead);
        playBeep();
        printTicket(tNum, selectedDept);

        } catch (e) {
        console.error(e);
        if (btn) { btn.disabled = false; btn.textContent = 'I Have All Documents — Get Ticket'; }
        if (e.message === 'QUOTA_FULL') {
            alert('Sorry, the daily quota has been reached. No more tickets can be issued today.');
            goScreen('home');
            return;
        }
        alert('Error issuing ticket. Please try again.');
    }
}

function showTicketScreen(tNum, userId, ahead) {
    window._lastTicket = { tNum, dept: selectedDept };
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('issuedDept',   selectedDept.toUpperCase());
    set('issuedNumber', tNum);
    set('issuedId',     userId);
    set('issuedReason', selectedReason ? selectedReason.label : '—');
    set('issuedAhead',  ahead + ' people');
    const avgSec = deptAvgWait[selectedDept] || 0;
    const waitMin = avgSec > 0
        ? Math.ceil((ahead * avgSec) / 60)
        : ahead * 5;
    set('issuedWait', '~' + waitMin + ' min');

    const qrEl = document.getElementById('ticketQR');
    if (qrEl) {
        qrEl.innerHTML = '';
        new QRCode(qrEl, {
            text: PUBLIC_URL + '/tracker/?t=' + encodeURIComponent(tNum) + '&d=' + selectedDept,
            width: 110, height: 110, colorDark: '#1f3c88', colorLight: '#ffffff'
        });
    }
    goScreen('ticket');
    let countdown = 15;
    const countEl = document.getElementById('ticketCountdown');
    if (countEl) countEl.textContent = countdown;
    window._ticketCountTimer && clearInterval(window._ticketCountTimer);
    window._ticketCountTimer = setInterval(() => {
        countdown--;
        if (countEl) countEl.textContent = countdown;
        if (countdown <= 0) {
            clearInterval(window._ticketCountTimer);
            goScreen('home');
        }
    }, 1000);
}


let scannerActive = false;
let rawStream = null;
let scanLoop = null;

function startScanner() {
    if (scannerActive) return;
    setScanStatus('Starting camera...');

    navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: 640, height: 480 }
    })
    .then(stream => {
        rawStream = stream;
        scannerActive = true;

        const container = document.getElementById('qr-reader');
        container.innerHTML = '';

        const video = document.createElement('video');
        video.id = 'qr-video';
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        video.style.cssText = 'width:100%;border-radius:12px;';
        container.appendChild(video);

        video.srcObject = stream;
        video.play();

        setScanStatus('Ready — point at QR code');

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        scanLoop = setInterval(() => {
            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                canvas.width  = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                if (code && code.data) {
                    onScanSuccess(code.data);
                }
            }
        }, 200);
    })
    .catch(e => {
        scannerActive = false;
        console.error('[Camera]', e.name, e.message);
        if (e.name === 'NotReadableError' || e.name === 'AbortError') {
            setScanStatus('Camera is in use by another app. Close it and try again.');
        } else if (e.name === 'NotAllowedError') {
            setScanStatus('Camera permission denied. Please allow camera access.');
        } else if (e.name === 'NotFoundError') {
            setScanStatus('No camera found on this device.');
        } else {
            setScanStatus('Camera error: ' + e.message);
        }
    });
}

function stopScanner() {
    clearInterval(scanLoop);
    scanLoop = null;
    scannerActive = false;

    if (rawStream) {
        rawStream.getTracks().forEach(t => t.stop());
        rawStream = null;
    }

    const video = document.getElementById('qr-video');
    if (video) {
        video.pause();
        video.srcObject = null;
    }

    const container = document.getElementById('qr-reader');
    if (container) container.innerHTML = '';
}

async function onScanSuccess(decoded) {
    stopScanner();
    setScanStatus('QR scanned! Verifying…');

    let reservationId = null;
    try {
        const url = new URL(decoded);
        reservationId = url.searchParams.get('res') || url.searchParams.get('id') || decoded.trim();
    } catch (_) { reservationId = decoded.trim(); }

    if (!reservationId) { setScanStatus('Invalid QR code.'); return; }

    try {
        const resSnap = await getDoc(doc(db, 'reservations', reservationId));
        if (!resSnap.exists()) { setScanStatus('Reservation not found.', true); return; }
        const res = resSnap.data();
        if (res.status !== 'pending') { setScanStatus('Reservation already used or cancelled.', true); return; }

        const now = new Date();
        const todayPH = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        let resDateStr = '';
        if (res.reservationDate?.toDate) {
            resDateStr = res.reservationDate.toDate().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        } else {
            resDateStr = res.reservationDate || '';
        }
        if (resDateStr && resDateStr !== todayPH) {
            setScanStatus('This reservation is not for today. (Reserved: ' + resDateStr + ')');
            return;
        }

        const dept   = res.department;
        const prefix = dept === 'cashier' ? 'C' : 'R';
        const dRef   = doc(db, 'departments', dept);
        const resRef = doc(db, 'reservations', reservationId);

        let tNum, ahead;

        await runTransaction(db, async (transaction) => {
            const sSnap = await transaction.get(doc(db, 'system', 'settings'));
            if ((sSnap.data().ticketsIssued || 0) >= (sSnap.data().dailyQuota || 100)) {
                throw new Error('QUOTA_FULL');
            }
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
                requiredDocs: res.requiredDocs || [],
                status: 'waiting', issuedAt: serverTimestamp(),
                printed: false, called: false,
                isReservation: true, reservationId
            });
            transaction.update(doc(db, 'system', 'settings'), { ticketsIssued: increment(1) });
            transaction.update(resRef, { status: 'active', ticketNumber: tNum, activatedAt: serverTimestamp() });
        });

        window._lastTicket = { tNum, dept };
        printTicket(tNum, dept);

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
                text: PUBLIC_URL + '/tracker/?t=' + encodeURIComponent(tNum) + '&d=' + dept,
                width: 110, height: 110, colorDark: '#1f3c88', colorLight: '#ffffff'
            });
        }
        goScreen('scan-success');
        playBeep();
    } catch (e) {
        if (e.message === 'QUOTA_FULL') {
            setScanStatus('Daily quota is full. Please come back tomorrow or ask staff.');
            return;
        }
        console.error(e);
        setScanStatus('Server error. Try again.');
    }
}

function setScanStatus(msg, allowRetry = false) {
    const el = document.getElementById('scanStatus');
    if (el) el.textContent = msg;
    if (allowRetry) {
        const existing = document.getElementById('retryBtn');
        if (!existing) {
            const btn = document.createElement('button');
            btn.id = 'retryBtn';
            btn.className = 'kiosk-submit-btn';
            btn.style.maxWidth = '340px';
            btn.textContent = 'Try Again';
            btn.onclick = () => { btn.remove(); startScanner(); };
            el.after(btn);
        }
    }
}

async function printTicket(tNum, dept) {
    const qr_link = PUBLIC_URL + '/tracker/?t=' + encodeURIComponent(tNum) + '&d=' + dept;
    try {
        const res = await fetch(PRINTER_URL, {
            method: 'POST', mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ number: tNum, dept, qr_link })
        });
        const json = await res.json();
        if (json.status !== 'Success') {
            console.warn('[Printer]', json.message);
            showPrinterWarning();
        }
    } catch (e) {
        console.warn('[Printer] Unreachable — is printer_server.py running?', e.message);
        showPrinterWarning();
    }
}

function showPrinterWarning() {
    const existing = document.getElementById('printerWarning');
    if (existing) return;
    const el = document.createElement('div');
    el.id = 'printerWarning';
    el.style.cssText = `
        position: fixed;
        bottom: 24px; left: 50%;
        transform: translateX(-50%);
        background: var(--red-600);
        color: #fff;
        padding: 16px 28px;
        border-radius: 14px;
        font-size: 16px;
        font-weight: 700;
        z-index: 9000;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 24px rgba(0,0,0,.3);
        font-family: var(--font);
        cursor: pointer;
    `;
    el.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        Printer offline. Tap to dismiss.
    `;
    el.onclick = () => el.remove();
    document.body.appendChild(el);
}

async function reprintTicket() {
    clearInterval(window._ticketCountTimer);
    const btn = document.querySelector('#screen-ticket .kiosk-submit-btn');
    if (!window._lastTicket) {
        alert('Nothing to reprint.');
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Printing...'; }
    try {
        await printTicket(window._lastTicket.tNum, window._lastTicket.dept);
        if (btn) { btn.disabled = false; btn.textContent = 'Reprint Ticket'; }
        playBeep();
    } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'Reprint Ticket'; }
        alert('Reprint failed. Check if printer is connected.');
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
        const ss = document.getElementById('screensaver');
        if (ss && ss.classList.contains('active')) return;
        idleWarningShown = true;
        let secondsLeft = 10;
        const banner = document.createElement('div');
        banner.id = 'idleWarningBanner';
        banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1f3c88;color:#fff;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;z-index:9999;border-top:4px solid #e3cf57;animation:slideUp .3s ease;font-family:\'Plus Jakarta Sans\',sans-serif;';
        banner.innerHTML = `
            <div>
                <div style="font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Still there?</div>
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

        selectedDept        = 'cashier';
        selectedUserType    = 'student';
        selectedDisplayName = null;
        selectedReason      = null;
        pendingUserId       = null;

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

const SS_DELAY = 60000; 
let ssTimer;

function startScreensaver() {
    clearTimeout(ssTimer);
    ssTimer = setTimeout(showScreensaver, SS_DELAY);
}

function showScreensaver() {
    const active = document.querySelector('.screen.active');
    if (!active || active.id !== 'screen-home') return;
    document.getElementById('screensaver').classList.add('active');
}

function dismissScreensaver() {
    document.getElementById('screensaver').classList.remove('active');
    startScreensaver();
}