import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, doc, collection, getDoc, setDoc, updateDoc,
    increment, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const PUBLIC_URL = 'https://etickette.web.app';

const firebaseConfig = {
    apiKey: "AIzaSyA3g7-_ldguMjweIHrIduBNJOcJ3201bQc",
    authDomain: "etickette-78f74.firebaseapp.com",
    projectId: "etickette-78f74",
    storageBucket: "etickette-78f74.firebasestorage.app",
    messagingSenderId: "147547566302",
    appId: "1:147547566302:web:2c7a52792b539331d8524f"
};

let app, db;

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

let scannerActive = false;
let rawStream = null;
let scanLoop = null;

function startScanner() {
    if (scannerActive) return;
    setScanStatus('📷 Starting camera...');

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
            setScanStatus('❌ Camera is in use by another app. Close it and try again.');
        } else if (e.name === 'NotAllowedError') {
            setScanStatus('❌ Camera permission denied. Please allow camera access.');
        } else if (e.name === 'NotFoundError') {
            setScanStatus('❌ No camera found on this device.');
        } else {
            setScanStatus('❌ Camera error: ' + e.message);
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

        const now = new Date();
        const todayPH = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        let resDateStr = '';
        if (res.reservationDate?.toDate) {
            resDateStr = res.reservationDate.toDate().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        } else {
            resDateStr = res.reservationDate || '';
        }
        if (resDateStr && resDateStr !== todayPH) {
            setQrStatus('❌ This reservation is not for today. (Reserved: ' + resDateStr + ')');
            return;
        }

        const dept   = res.department || 'registrar';
        const prefix = dept === 'cashier' ? 'C' : 'R';
        const dRef   = doc(db, 'departments', dept);

        let tNum;
        await runTransaction(db, async (transaction) => {
            const dSnap      = await transaction.get(dRef);
            if (!dSnap.exists()) throw new Error('Department doc missing');
            const newCounter = (dSnap.data().counter || 0) + 1;
            const newQueue   = (dSnap.data().queue   || 0) + 1;
            tNum = `${prefix}-${String(newCounter).padStart(2, '0')}`;
            const ticketRef  = doc(collection(db, 'tickets'), tNum);
            transaction.update(doc(db, 'system', 'settings'), { ticketsIssued: increment(1) });
            transaction.update(dRef, { counter: newCounter, queue: newQueue });
            transaction.set(ticketRef, {
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
            transaction.update(resRef, {
                status:       'active',
                activatedAt:  serverTimestamp(),
                ticketNumber: tNum
            });
        });

        const resultBox = document.getElementById('qrResult');
        resultBox.style.display = 'block';

        const trackUrl = PUBLIC_URL + '/tracker/?t=' + encodeURIComponent(tNum) + '&d=' + dept;
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
        userId = 'GUEST-' + name.trim().toLowerCase().replace(/\s+/g, '-');
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