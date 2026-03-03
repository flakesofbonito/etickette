import {
    getDB,
    reserveDoc,
    deptDoc,
    ticketsCol,
    getDoc,
    setDoc,
    updateDoc,
    increment,
    serverTimestamp,
    doc
} from '../../website/js/firebase-config.js';
import {
    showToast
} from '../../website/js/ui.js';

let html5QrCode = null;
let scannerActive = false;

export function initScanner() {
    window.openQRScanner = openQRScanner;
    window.stopScanner = stopScanner;
}


export function openQRScanner() {
    document.getElementById('qrModal').classList.add('active');
    document.getElementById('qrStatus').textContent = 'Starting camera…';
    document.getElementById('qrResult').style.display = 'none';
    startScanner();
}


function startScanner() {
    if (scannerActive) return;

    html5QrCode = new Html5Qrcode("qr-reader");
    const config = {
        fps: 10,
        qrbox: {
            width: 240,
            height: 240
        },
        aspectRatio: 1.0
    };

    Html5Qrcode.getCameras()
        .then(cameras => {
            if (!cameras || cameras.length === 0) {
                setQrStatus('❌ No camera found.', 'error');
                return;
            }

            const cam = cameras.find(c =>
                c.label.toLowerCase().includes('back') ||
                c.label.toLowerCase().includes('rear')
            ) || cameras[cameras.length - 1];

            return html5QrCode.start(
                cam.id,
                config,
                onScanSuccess,
                onScanFailure
            );
        })
        .then(() => {
            scannerActive = true;
            setQrStatus('📷 Point camera at QR code…', 'info');
        })
        .catch(err => {
            console.error('[QR Scanner]', err);
            setQrStatus(`❌ Camera error: ${err}`, 'error');
        });
}


export function stopScanner() {
    if (html5QrCode && scannerActive) {
        html5QrCode.stop()
            .then(() => {
                scannerActive = false;
                html5QrCode = null;
            })
            .catch(() => {
                scannerActive = false;
                html5QrCode = null;
            });
    }
}


async function onScanSuccess(decodedText) {
    stopScanner();
    setQrStatus('✅ QR Code scanned! Verifying reservation…', 'success');

    let reservationId = null;

    try {
        const url = new URL(decodedText);
        reservationId = url.searchParams.get('res') || url.searchParams.get('id');
    } catch (_) {
        reservationId = decodedText.trim();
    }

    if (!reservationId) {
        setQrStatus('❌ Invalid QR code format.', 'error');
        showToast('Invalid QR code.', 'error');
        return;
    }

    await processReservationCheckIn(reservationId);
}

function onScanFailure(error) {
    if (!error.includes('NotFoundException')) {
        console.debug('[QR Scan]', error);
    }
}


async function processReservationCheckIn(reservationId) {
    const resultBox = document.getElementById('qrResult');
    resultBox.style.display = 'none';

    try {
        const db = getDB();
        const resRef = reserveDoc(reservationId);
        const resSnap = await getDoc(resRef);

        if (!resSnap.exists()) {
            setQrStatus('❌ Reservation not found.', 'error');
            showToast('Reservation not found.', 'error');
            return;
        }

        const res = resSnap.data();

        if (res.status !== 'pending') {
            const msg = res.status === 'checked_in' ?
                '⚠️ This reservation has already been checked in.' :
                '❌ This reservation is no longer valid.';
            setQrStatus(msg, 'error');
            showToast(msg, 'warning');
            return;
        }

        const today = new Date().toDateString();
        const resDate = res.reservationDate?.toDate?.()?.toDateString() || res.reservationDate;
        if (resDate && resDate !== today) {
            setQrStatus('❌ This reservation is not for today.', 'error');
            showToast('Reservation is not for today.', 'error');
            return;
        }

        const dept = res.department || 'registrar';
        const prefix = dept === 'cashier' ? 'C' : 'R';
        const dRef = deptDoc(dept);

        await updateDoc(dRef, {
            counter: increment(1),
            queue: increment(1)
        });
        const dSnap = await getDoc(dRef);
        const num = dSnap.data().counter;
        const ticketNum = `${prefix}-${String(num).padStart(2,'0')}`;

        await setDoc(doc(ticketsCol(), ticketNum), {
            ticketNumber: ticketNum,
            department: dept,
            userId: res.userId || res.studentId || 'N/A',
            userType: res.userType || 'student',
            reason: res.reason || 'Reservation Check-In',
            status: 'waiting',
            issuedAt: serverTimestamp(),
            reservationId: reservationId,
            isReservation: true,
            called: false
        });

        await updateDoc(resRef, {
            status: 'checked_in',
            checkedInAt: serverTimestamp(),
            ticketNumber: ticketNum
        });

        resultBox.style.display = 'block';
        resultBox.innerHTML = `
      <strong>✅ Check-In Successful!</strong><br/>
      <span>Ticket: <b>${ticketNum}</b></span><br/>
      <span>Name / ID: ${res.userId || res.studentId || 'N/A'}</span><br/>
      <span>Department: ${dept.toUpperCase()}</span><br/>
      <span>Reason: ${res.reason || '—'}</span><br/>
      <span style="font-size:12px;color:#6b7280">Documents are being prepared by staff.</span>
    `;
        setQrStatus('Ready to serve you!', 'success');
        showToast(`✅ Checked in! Ticket ${ticketNum}`, 'success');

    } catch (err) {
        console.error('[Check-In Error]', err);
        setQrStatus('❌ Server error. Please try again.', 'error');
        showToast('Server error during check-in.', 'error');
    }
}


// ── Helper ────────────────────────────────────────────────────────────────────
function setQrStatus(msg) {
    document.getElementById('qrStatus').textContent = msg;
}