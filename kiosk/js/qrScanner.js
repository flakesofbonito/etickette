// ✅ FIX #2 — Replaced broken imports from non-existent '../../website/js/firebase-config.js'
// and '../../website/js/ui.js' with direct Firebase SDK imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore, doc, collection, getDoc, setDoc, updateDoc,
    increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ✅ FIX #22 — Use public deployment URL so QR codes work from any device
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

export function stopScanner() {
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

        // ✅ FIX #7 — Unified status to 'active' (matches app.js listener which checks for 'active')
        await updateDoc(resRef, {
            status:      'active',
            checkedInAt: serverTimestamp(),
            ticketNumber: tNum
        });

        const resultBox = document.getElementById('qrResult');
        resultBox.style.display = 'block';

        // ✅ FIX #22 — Use PUBLIC_URL for tracker link in result
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