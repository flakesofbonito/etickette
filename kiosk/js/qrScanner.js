import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, doc, collection, getDoc, setDoc, updateDoc,
    increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const PUBLIC_URL = 'https://etickette-78f74.web.app';

const firebaseConfig = {
    apiKey: "AIzaSyA3g7-_ldguMjweIHrIduBNJOcJ3201bQc",
    authDomain: "etickette-78f74.firebaseapp.com",
    projectId: "etickette-78f74",
    storageBucket: "etickette-78f74.firebasestorage.app",
    messagingSenderId: "147547566302",
    appId: "1:147547566302:web:2c7a52792b539331d8524f"
};

let app, db;
let html5QrCode = null;
let scannerActive = false;

export function initScanner() {
    app = initializeApp(firebaseConfig);
    db  = getFirestore(app);
    window.openQRScanner = openQRScanner;
    window.stopScanner   = stopScanner;
}

export function openQRScanner() {
    document.getElementById('qrModal').classList.add('active');
    document.getElementById('qrStatus').textContent = 'Starting camera…';
    document.getElementById('qrResult').style.display = 'none';
    startScanner();
}

function startScanner() {
    if (scannerActive) return;

    html5QrCode = new Html5Qrcode('qr-reader');
    const config = { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 };

    Html5Qrcode.getCameras()
        .then(cameras => {
            if (!cameras || cameras.length === 0) {
                setQrStatus('❌ No camera found.');
                return;
            }
            const cam = cameras.find(c =>
                c.label.toLowerCase().includes('back') ||
                c.label.toLowerCase().includes('rear')
            ) || cameras[cameras.length - 1];
            return html5QrCode.start(cam.id, config, onScanSuccess, () => {});
        })
        .then(() => {
            scannerActive = true;
            setQrStatus('📷 Point camera at QR code…');
        })
        .catch(err => {
            console.error('[QR Scanner]', err);
            setQrStatus('❌ Camera error: ' + err);
        });
}

function stopScanner() {
    if (html5QrCode && scannerActive) {
        html5QrCode.stop()
            .then(() => { scannerActive = false; html5QrCode = null; })
            .catch(() => { scannerActive = false; html5QrCode = null; });
    }
}

async function onScanSuccess(decodedText) {
    stopScanner();
    setQrStatus('✅ QR Code scanned! Verifying reservation…');

    let reservationId = null;
    try {
        const url = new URL(decodedText);
        reservationId = url.searchParams.get('res') || url.searchParams.get('id');
    } catch (_) {
        reservationId = decodedText.trim();
    }

    if (!reservationId) {
        setQrStatus('❌ Invalid QR code format.');
        return;
    }

    try {
        const resRef  = doc(db, 'reservations', reservationId);
        const resSnap = await getDoc(resRef);

        if (!resSnap.exists()) {
            setQrStatus('❌ Reservation not found.');
            return;
        }

        const res = resSnap.data();

        if (res.status !== 'pending') {
            const msg = res.status === 'active'
                ? '⚠️ Reservation already checked in.'
                : '❌ Reservation already used or cancelled.';
            setQrStatus(msg);
            return;
        }

        const today   = new Date().toDateString();
        const resDate = res.reservationDate?.toDate?.()?.toDateString() || res.reservationDate;
        if (resDate && resDate !== today) {
            setQrStatus('❌ This reservation is not for today.');
            return;
        }

        const dept   = res.department || 'registrar';
        const prefix = dept === 'cashier' ? 'C' : 'R';
        const dRef   = doc(db, 'departments', dept);

        await updateDoc(dRef, { counter: increment(1), queue: increment(1) });
        const dSnap = await getDoc(dRef);
        const num   = dSnap.data().counter;
        const tNum  = `${prefix}-${String(num).padStart(2, '0')}`;

        await setDoc(doc(collection(db, 'tickets'), tNum), {
            ticketNumber:  tNum,
            department:    dept,
            userId:        res.studentId || res.userId || 'N/A',
            userType:      res.userType  || 'student',
            displayName:   res.displayName || res.studentId || 'N/A',
            reason:        res.reason || 'Reservation Check-In',
            status:        'waiting',
            issuedAt:      serverTimestamp(),
            reservationId: reservationId,
            isReservation: true,
            called:        false
        });

        await updateDoc(resRef, {
            status:      'active',
            checkedInAt: serverTimestamp(),
            ticketNumber: tNum
        });

        const resultBox = document.getElementById('qrResult');
        resultBox.style.display = 'block';

        const trackUrl = PUBLIC_URL + '/tracker.html?t=' + encodeURIComponent(tNum) + '&d=' + dept;
        resultBox.innerHTML = `
            <strong>✅ Check-In Successful!</strong><br/>
            <span>Ticket: <b>${tNum}</b></span><br/>
            <span>Name / ID: ${res.displayName || res.studentId || 'N/A'}</span><br/>
            <span>Department: ${dept.toUpperCase()}</span><br/>
            <span>Reason: ${res.reason || '—'}</span><br/>
            <a href="${trackUrl}" target="_blank" style="display:inline-block;margin-top:8px;color:#1f3c88;">
            📱 View Queue Tracker →
            </a>
        `;
        setQrStatus('Ready to serve you!');

    } catch (err) {
        console.error('[Check-In Error]', err);
        setQrStatus('❌ Server error. Please try again.');
    }
}

function setQrStatus(msg) {
    const el = document.getElementById('qrStatus');
    if (el) el.textContent = msg;
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
    // ── End check ──────────────────────────────────────────

    pendingUserId       = userId;
    selectedDisplayName = displayName;
    buildReasonList();
    goScreen('reason');
}