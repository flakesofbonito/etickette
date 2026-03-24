import {
    getFirestore, doc, collection, setDoc, getDoc, onSnapshot,
    updateDoc, query, where, serverTimestamp, getDocs, increment, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

const firebaseConfig = {
    apiKey: "AIzaSyA3g7-_ldguMjweIHrIduBNJOcJ3201bQc",
    authDomain: "etickette-78f74.firebaseapp.com",
    projectId: "etickette-78f74",
    storageBucket: "etickette-78f74.firebasestorage.app",
    messagingSenderId: "147547566302",
    appId: "1:147547566302:web:2c7a52792b539331d8524f",
    measurementId: "G-QHMMWXW7F3"
};

const PUBLIC_URL = 'https://etickette.web.app';

import { REASONS } from './reasons.js';

let app, db;
let currentStudentId   = null;
let reserveDept        = null;
let reserveReason      = null;
let currentStep        = 1;
let hasActiveReservation = false;
let currentUserType    = 'student';
let currentDisplayName = null;
let _unsubs = [];
let _lastHistoryFetch = 0;
let _modalOpen = false;

const _domCache = {};
function setIfChanged(id, value) {
    if (_modalOpen) return;
    if (_domCache[id] === value) return;
    _domCache[id] = value;
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

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
    window.selectUserType    = selectUserType;

    const saved = sessionStorage.getItem('studentId');
    if (saved) {
        currentStudentId = saved;
        afterLogin();
    }
}

function selectUserType(type) {
    currentUserType = type;
    document.querySelectorAll('.user-type-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.type === type));

    const inputId      = document.getElementById('inputId');
    const inputChildId = document.getElementById('inputParentChildId');
    const inputName    = document.getElementById('inputName');
    const idLabel      = document.getElementById('idLabel');
    const nameLabel    = document.getElementById('nameLabel');
    const loginHint    = document.getElementById('loginHint');
    const loginId      = document.getElementById('loginId');

    inputId.style.display      = 'none';
    inputChildId.style.display = 'none';
    inputName.style.display    = 'none';

    if (type === 'student') {
        inputId.style.display = 'block';
        idLabel.textContent   = 'Student ID Number';
        loginId.placeholder   = 'e.g. 02000385394';
        loginHint.textContent = '11-digit Student ID required';
    } else if (type === 'teacher') {
        inputId.style.display = 'block';
        idLabel.textContent   = 'Employee ID Number';
        loginId.placeholder   = 'e.g. 02000385394';
        loginHint.textContent = '11-digit Employee ID required';
    } else if (type === 'parent') {
        inputChildId.style.display = 'block';
        inputName.style.display    = 'block';
        nameLabel.textContent      = 'Your Full Name';
        loginHint.textContent      = "Enter your child's Student ID and your name";
    }
}

function loginStudent() {
    const err = document.getElementById('loginError');
    err.textContent = '';

    let userId      = null;
    let displayName = null;

    if (currentUserType === 'student' || currentUserType === 'teacher') {
        const val = document.getElementById('loginId').value.trim();
        const inp = document.getElementById('loginId');
        if (!/^\d{11}$/.test(val)) {
            err.textContent = 'ID must be exactly 11 digits.';
            inp.classList.add('error');
            return;
        }
        inp.classList.remove('error');
        userId      = val;
        displayName = val;

    } else if (currentUserType === 'parent') {
        const childId = document.getElementById('loginChildId').value.trim();
        const name    = document.getElementById('loginName').value.trim();
        if (!/^\d{11}$/.test(childId)) {
            err.textContent = "Child's Student ID must be exactly 11 digits.";
            return;
        }
        if (name.length < 2) {
            err.textContent = 'Please enter your full name.';
            return;
        }
        userId      = childId;
        displayName = name + ' (Parent)';

    }
    currentStudentId   = userId;
    currentDisplayName = displayName;
    sessionStorage.setItem('studentId',   userId);
    sessionStorage.setItem('displayName', displayName);
    sessionStorage.setItem('userType',    currentUserType);

    document.getElementById('loginOverlay').classList.add('dismissed');
    document.getElementById('appShell').classList.remove('locked');
    document.getElementById('appShell').classList.add('unlocked');
    setTimeout(() => { document.getElementById('loginOverlay').style.display = 'none'; }, 520);
    afterLogin();
}

function afterLogin() {
    currentDisplayName = sessionStorage.getItem('displayName') || currentStudentId;
    currentUserType    = sessionStorage.getItem('userType')    || 'student';

    document.getElementById('userDisplay').style.display = 'flex';
    document.getElementById('userLabel').textContent = currentDisplayName;
    document.getElementById('profileInfo').innerHTML = `
        <div class="info"><span>Type</span><b>${currentUserType.charAt(0).toUpperCase()+currentUserType.slice(1)}</b></div>
        <div class="info"><span>ID / Name</span><b>${currentDisplayName}</b></div>
        <button class="btn-ghost" style="margin-top:16px" onclick="logout()">Log out</button>
    `;

    setReserveButtonsLocked(true);
    navigate('home');
    setTimeout(() => {
        _unsubs.push(listenToDepts());
        _unsubs.push(listenToSettings());
        _unsubs.push(listenToActiveReservation());
    }, 520);
}

function logout() {
    _unsubs.forEach(u => u());
    _unsubs = [];
    _lastHistoryFetch = 0;
    sessionStorage.removeItem('studentId');
    sessionStorage.removeItem('displayName');
    sessionStorage.removeItem('userType');
    currentDisplayName   = null;
    currentUserType      = 'student';
    currentStudentId     = null;
    hasActiveReservation = false;
    document.getElementById('userDisplay').style.display = 'none';
    const ov = document.getElementById('loginOverlay');
    ov.style.display = 'flex';
    ov.classList.remove('dismissed');
    document.getElementById('loginId').value      = '';
    document.getElementById('loginError').textContent = '';
    document.getElementById('appShell').classList.add('locked');
    document.getElementById('appShell').classList.remove('unlocked');
}

function navigate(view) {
    if (view === 'history') {
        const now = Date.now();
        if (now - _lastHistoryFetch > 30000) {
            _lastHistoryFetch = now;
            loadHistory();
        }
    }
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
    const unsubs = ['cashier', 'registrar'].map(dept =>
        onSnapshot(doc(db, 'departments', dept), snap => {
            if (!snap.exists()) return;
            const d  = snap.data();
            const st = (d.status || 'open').toLowerCase();
            const map = { open: { t: 'OPEN', c: 'open' }, break: { t: 'ON BREAK', c: 'break' }, closed: { t: 'CLOSED', c: 'closed' } };
            const m  = map[st] || map.open;

            const el = document.getElementById(dept + 'Status');
            if (el && el.textContent !== m.t) { el.textContent = m.t; el.className = 'dept-status ' + m.c; }

            setIfChanged(dept + 'Queue',      String(d.queue || 0));
            setIfChanged(dept + 'QueueNum',   String(d.queue || 0));
            setIfChanged(dept + 'NowServing', 'Serving: ' + (d.nowServing || '—'));

            const avg = d.avgWaitSeconds;
            setIfChanged(dept + 'AvgWait', avg
                ? '~' + Math.floor(avg / 60) + 'm ' + (avg % 60) + 's avg wait'
                : 'Avg wait: —');

            const btn = document.getElementById(dept + 'Btn');
            if (btn && st !== 'open' && !hasActiveReservation) {
                btn.disabled = true;
                btn.textContent = st === 'break'
                    ? `${dept.toUpperCase()} — ON BREAK`
                    : `${dept.toUpperCase()} — CLOSED`;
            } else if (btn && st === 'open' && !hasActiveReservation) {
                btn.disabled = false;
                btn.textContent = `RESERVE ${dept.toUpperCase()} TICKET`;
            }
        })
    );
    return () => unsubs.forEach(u => u());
}

function listenToSettings() {
    const unsub = onSnapshot(doc(db, 'system', 'settings'), snap => {
        if (!snap.exists()) return;
        const d = snap.data();

        const cashierQuota    = d.cashierQuota   || d.dailyQuota || 100;
        const registrarQuota  = d.registrarQuota || d.dailyQuota || 100;
        const cashierIssued   = d.cashierIssued  || 0;
        const registrarIssued = d.registrarIssued|| 0;
        const totalQuota      = cashierQuota + registrarQuota;
        const totalIssued     = cashierIssued + registrarIssued;
        const totalRemaining  = Math.max(0, totalQuota - totalIssued);

        setIfChanged('cashierQuotaText',   Math.max(0, cashierQuota - cashierIssued) + ' / ' + cashierQuota);
        setIfChanged('registrarQuotaText', Math.max(0, registrarQuota - registrarIssued) + ' / ' + registrarQuota);

        const deptMap = {
            cashier:   { quota: cashierQuota,   issued: cashierIssued },
            registrar: { quota: registrarQuota, issued: registrarIssued }
        };

        ['cashier', 'registrar'].forEach(dept => {
            const { quota, issued } = deptMap[dept];
            const isFull = issued >= quota;
            const btn = document.getElementById(dept + 'Btn');
            if (!btn) return;

            const cashierTextEl   = document.getElementById('cashierQuotaText');
            const registrarTextEl = document.getElementById('registrarQuotaText');
            const { quota: dQuota, issued: dIssued } = deptMap[dept];
            const dRem = Math.max(0, dQuota - dIssued);
            const dEl  = dept === 'cashier' ? cashierTextEl : registrarTextEl;
            if (dEl) {
                dEl.style.color      = dRem === 0 ? '#dc2626' : dRem <= 5 ? '#f97316' : '';
                dEl.style.fontWeight = dRem === 0 ? '800' : '';
            }

            if (isFull && !hasActiveReservation) {
                btn.disabled            = true;
                btn.title               = `${dept.toUpperCase()} quota is full for today.`;
                btn.textContent         = 'Quota Full — No Slots Available';
                btn.style.background    = 'rgba(220,38,38,.1)';
                btn.style.color         = '#dc2626';
                btn.style.border        = '2px solid rgba(220,38,38,.3)';
                btn.style.pointerEvents = 'none';
            } else if (!hasActiveReservation) {
                btn.disabled            = false;
                btn.title               = '';
                btn.textContent         = `RESERVE ${dept.toUpperCase()} TICKET`;
                btn.style.background    = '';
                btn.style.color         = '';
                btn.style.border        = '';
                btn.style.pointerEvents = '';
            }
        });

        const overallPct  = totalIssued / totalQuota;
        const isTotalFull = totalIssued >= totalQuota;
        const el = document.getElementById('congestionText');
        if (el) {
            const txt = isTotalFull ? 'QUOTA FULL' : overallPct < 0.5 ? 'LOW TRAFFIC' : overallPct < 0.75 ? 'MODERATE' : 'HIGH TRAFFIC';
            const cls = isTotalFull ? 'closed' : overallPct < 0.5 ? 'open' : overallPct < 0.75 ? 'break' : 'closed';
            if (el.textContent !== txt) { el.textContent = txt; el.className = cls; }
        }

        const gs = document.getElementById('globalStatus');
        if (gs) {
            clearTimeout(window._bannerTimer);
            const msg     = d.statusMessage || '';
            const msgTime = d.statusMessageAt?.toMillis?.();
            const DISPLAY_MS   = 30000;
            const age          = msgTime ? (Date.now() - msgTime) : DISPLAY_MS;
            const msgRemaining = DISPLAY_MS - age;
            if (msg.trim() !== '' && msgRemaining > 0) {
                gs.style.opacity = '1';
                gs.innerHTML = `<div class="status-live-dot"></div><span>System is LIVE</span><span class="status-banner-divider">|</span><span>${msg}</span>`;
                window._bannerTimer = setTimeout(() => {
                    gs.style.transition = 'opacity .8s ease';
                    gs.style.opacity = '0';
                    setTimeout(() => {
                        gs.innerHTML = '<div class="status-live-dot"></div><span>System is LIVE</span>';
                        gs.style.opacity = '1';
                    }, 800);
                }, msgRemaining);
            } else {
                setIfChanged('_gsDefault', 'y');
                gs.innerHTML = '<div class="status-live-dot"></div><span>System is LIVE</span>';
                gs.style.opacity = '1';
            }
        }
    });
    return unsub;
}

function listenToActiveReservation() {
    const unsubRes = onSnapshot(
        query(collection(db, 'reservations'), where('studentId', '==', currentStudentId)),
        snap => {
            const activeDoc = snap.docs.find(d => {
                const s = d.data().status;
                return s === 'pending' || s === 'active';
            });
            if (activeDoc) {
                const existing = document.getElementById('activeResBanner');
                if (!existing) {
                    hasActiveReservation = true;
                    setReserveButtonsLocked(true);
                    renderActiveResBanner(activeDoc.data(), activeDoc.id);
                } else {
                    hasActiveReservation = true;
                    setReserveButtonsLocked(true);
                }
            } else {
                const banner = document.getElementById('activeResBanner');
                if (banner && banner.dataset.bannerType === 'reservation') {
                    banner.remove();
                    hasActiveReservation = false;
                    setReserveButtonsLocked(false);
                    setTimeout(() => loadHistory(), 300);
                }
            }
        },
        err => console.warn('[res snapshot]', err.code)
    );

    const unsubTicket = onSnapshot(
        query(collection(db, 'tickets'), where('userId', '==', currentStudentId)),
        snap => {
            const activeTicket = snap.docs.find(d => {
                const s = d.data().status;
                return s === 'waiting' || s === 'serving';
            });
            if (activeTicket) {
                const existing = document.getElementById('activeResBanner');
                if (!existing) {
                    hasActiveReservation = true;
                    setReserveButtonsLocked(true);
                    renderActiveWalkinBanner(activeTicket.data());
                } else {
                    hasActiveReservation = true;
                    setReserveButtonsLocked(true);
                }
            } else {
                const banner = document.getElementById('activeResBanner');
                if (banner && banner.dataset.bannerType === 'walkin') {
                    banner.remove();
                    hasActiveReservation = false;
                    setReserveButtonsLocked(false);
                    setTimeout(() => loadHistory(), 300);
                }
            }
        },
        err => console.warn('[ticket snapshot]', err.code)
    );

    return () => { unsubRes(); unsubTicket(); };
}

function setReserveButtonsLocked(locked) {
    ['cashier', 'registrar'].forEach(dept => {
        const btn = document.getElementById(dept + 'Btn');
        if (btn) {
            btn.disabled = locked;
            btn.title    = locked ? 'Cancel your current reservation first.' : '';
        }
    });
}

function renderQR(el, text, size) {
    el.innerHTML = '';
    new QRCode(el, {
        text: text, width: size, height: size,
        colorDark: '#1f3c88', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });
    setTimeout(() => {
        el.querySelectorAll('canvas').forEach(c => c.style.cssText = 'display:none!important;');
        el.querySelectorAll('img').forEach(img => {
            img.style.cssText = 'display:block!important; margin:0 auto!important; max-width:100%!important;';
        });
        el.querySelectorAll('div').forEach(d => {
            d.style.cssText = 'display:flex!important; justify-content:center!important; align-items:center!important;';
        });
    }, 80);
}

function renderActiveResBanner(res, rid) {
    const old = document.getElementById('activeResBanner');
    if (old) old.remove();

    const canCancel  = res.status === 'pending' || res.status === 'active';
    const statusLabel = res.status === 'pending'
        ? '<span class="break">Pending — not yet activated at Kiosk</span>'
        : '<span class="open">Active — ticket assigned</span>';
    const ticketLine  = res.ticketNumber ? `<p><strong>Ticket #:</strong> ${res.ticketNumber}</p>` : '';

    let trackingCard = '';
    if (res.ticketNumber) {
        const trackingUrl = `${PUBLIC_URL}/tracker/?t=${encodeURIComponent(res.ticketNumber)}&d=${encodeURIComponent(res.department)}`;
        trackingCard = `
        <div class="tracking-card">
            <span class="tracking-label" style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--red-600);display:inline-block;flex-shrink:0;"></span> Live Queue Tracker</span>
            <div class="tracking-actions">
            <a href="${trackingUrl}" target="_blank" class="btn-track">Track My Queue →</a>
            <button class="btn-copy-link" onclick="navigator.clipboard.writeText('${trackingUrl}').then(()=>{ this.textContent='Copied!'; setTimeout(()=>this.textContent='Copy Link',2000); })">Copy Link</button>            </div>
        </div>`;
    }

    const banner = document.createElement('div');
    banner.id                    = 'activeResBanner';
    banner.className             = 'active-res-banner';
    banner.dataset.bannerType    = 'reservation';
    banner.innerHTML = `
    <div class="active-res-header">
        <span>Active Reservation</span>
        ${canCancel ? `<button class="btn-cancel-res" onclick="cancelReservation('${rid}','${res.status}')" style="display:inline-flex;align-items:center;gap:5px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Cancel</button>` : ''}
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
    ${trackingCard}`;

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

    const trackingUrl = `${PUBLIC_URL}/tracker/?t=${encodeURIComponent(ticket.ticketNumber)}&d=${encodeURIComponent(ticket.department)}`;
    const trackingCard = `
    <div class="tracking-card">
        <span class="tracking-label" style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:var(--red-600);display:inline-block;flex-shrink:0;"></span> Live Queue Tracker</span>
        <div class="tracking-actions">
            <a href="${trackingUrl}" target="_blank" class="btn-track">Track My Queue →</a>
            <button class="btn-copy-link" onclick="navigator.clipboard.writeText('${trackingUrl}').then(()=>{ this.textContent='✓ Copied!'; setTimeout(()=>this.textContent='🔗 Copy',2000); })">🔗 Copy</button>
        </div>
    </div>`;

    const banner = document.createElement('div');
    banner.id                 = 'activeResBanner';
    banner.className          = 'active-res-banner';
    banner.dataset.bannerType = 'walkin';
    banner.innerHTML = `
    <div class="active-res-header"><span>Active Ticket</span></div>
    <div class="active-res-body">
        <div class="active-res-info">
        <p><strong>Department:</strong> ${ticket.department.toUpperCase()}</p>
        <p><strong>Ticket #:</strong> <span style="font-size:1.6em;font-weight:900;color:#1f3c88">${ticket.ticketNumber}</span></p>
        <p><strong>Status:</strong> ${statusLabel}</p>
        </div>
    </div>
    ${trackingCard}`;

    const pageCard = document.getElementById('view-history').querySelector('.page-card');
    pageCard.insertBefore(banner, pageCard.querySelector('h2').nextSibling);
}

async function cancelReservation(rid, status) {
    if (!confirm(status === 'active'
        ? 'Your ticket has already been activated. Cancelling will remove you from the queue. Are you sure?'
        : 'Are you sure you want to cancel this reservation?')) return;

    try {
        await runTransaction(db, async (transaction) => {
            const resSnap = await transaction.get(doc(db, 'reservations', rid));
            if (!resSnap.exists()) throw new Error('Reservation not found');
            const resData = resSnap.data();

            transaction.update(doc(db, 'reservations', rid), {
                status: 'cancelled',
                cancelledAt: serverTimestamp()
            });

            if (resData.status === 'active' && resData.ticketNumber) {
                const tNum       = resData.ticketNumber;
                const ticketSnap = await transaction.get(doc(db, 'tickets', tNum));

                if (ticketSnap.exists()) {
                    const tStatus = ticketSnap.data().status;
                    transaction.update(doc(db, 'tickets', tNum), { status: 'cancelled' });

                    if (tStatus === 'waiting' || tStatus === 'serving') {
                        const dSnap = await transaction.get(doc(db, 'departments', resData.department));
                        if (dSnap.exists()) {
                            transaction.update(doc(db, 'departments', resData.department), {
                                queue: Math.max(0, (dSnap.data().queue || 1) - 1),
                                ...(tStatus === 'serving' ? { nowServing: '' } : {})
                            });
                        }
                        transaction.update(doc(db, 'system', 'settings'), {
                            ticketsIssued: increment(-1)
                        });
                    }
                }
            }
        });

        const banner = document.getElementById('activeResBanner');
        if (banner) banner.remove();
        hasActiveReservation = false;
        setReserveButtonsLocked(false);
        showToast('Reservation cancelled.', 'warning');

    } catch (e) {
        console.error('[cancelReservation]', e);
        showToast('Could not cancel. Try again.', 'error');
    }
}

function openReserveModal(dept) {
    _modalOpen = true;
    const btn = document.getElementById(dept + 'Btn');
    if (btn && btn.disabled) { showToast('No slots available today.', 'error'); return; }
    if (!currentStudentId)    { showToast('Please log in first.', 'error'); return; }
    if (hasActiveReservation) { showToast('You already have an active reservation. Cancel it first.', 'warning'); return; }

    reserveDept = dept;
    document.getElementById('reserveDeptTag').textContent = dept.toUpperCase();
    document.getElementById('reserveTitle').textContent   = 'Reserve – ' + dept.charAt(0).toUpperCase() + dept.slice(1);

    const list = document.getElementById('reserveReasonList');
    list.innerHTML = '<p class="subtle" style="text-align:center;padding:16px 0">Loading...</p>';

    const todayPH = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    document.getElementById('reserveDate').min = todayPH;
    document.getElementById('reserveDate').value = '';
    rGoStep(1);
    document.getElementById('reserveModal').classList.add('active');

    requestAnimationFrame(() => {
        const fragment = document.createDocumentFragment();
        REASONS[dept].forEach(r => {
            if (r.category) {
                const h = document.createElement('div');
                h.className = 'reason-category-header';
                h.textContent = r.category;
                fragment.appendChild(h);
                return;
            }
            const d = document.createElement('div');
            d.className = 'reason-item';
            d.textContent = r.label;
            d.onclick = () => {
                reserveReason = r;
                list.querySelectorAll('.reason-item').forEach(x => x.classList.remove('selected'));
                d.classList.add('selected');

                const docsDept = document.getElementById('docsForDept');
                if (docsDept) docsDept.textContent = dept.charAt(0).toUpperCase() + dept.slice(1);

                const docsList = document.getElementById('requiredDocsList');
                const docsFragment = document.createDocumentFragment();
                if (r.docs && r.docs.length > 0) {
                    r.docs.forEach(docName => {
                        const item = document.createElement('div');
                        item.className = 'docs-item';
                        item.innerHTML = `<span class="docs-item-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold-700)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span><span>${docName}</span>`;
                        docsFragment.appendChild(item);
                    });
                    docsList.innerHTML = '';
                    docsList.appendChild(docsFragment);
                } else {
                    docsList.innerHTML = '<p class="subtle">No specific documents required. Bring your Valid ID.</p>';
                }
                rGoStep(2);
            };
            fragment.appendChild(d);
        });
        list.innerHTML = '';
        list.appendChild(fragment);
    });
}

function rGoStep(n) {
    document.querySelectorAll('.modal-step').forEach(s => s.classList.remove('active'));
    document.getElementById('rstep' + n).classList.add('active');
    currentStep = n;
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById('rdot' + i);
        if (dot) dot.classList.toggle('active', i <= n);
    }
}

async function submitReserveDate() {
    const btn = document.querySelector('#rstep3 .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Reserving...'; }

    const resetBtn = () => {
        if (btn) { btn.disabled = false; btn.innerHTML = 'Reserve <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:17px;height:17px;stroke:white;flex-shrink:0"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'; }
    };

    const dateVal = document.getElementById('reserveDate').value;
    const errEl   = document.getElementById('dateError');
    if (!dateVal) { errEl.textContent = 'Please pick a date.'; resetBtn(); return; }
    errEl.textContent = '';

    try {
        const snap = await getDocs(query(collection(db, 'reservations'), where('studentId', '==', currentStudentId)));
        const already = snap.docs.some(d => { const s = d.data().status; return s === 'pending' || s === 'active'; });
        if (already) { errEl.textContent = 'You already have an active reservation. Cancel it first.'; resetBtn(); return; }
    } catch (e) { console.warn('[pre-check res]', e.code); }

    try {
        const snap = await getDocs(query(collection(db, 'tickets'), where('userId', '==', currentStudentId)));
        const waiting = snap.docs.find(d => d.data().status === 'waiting');
        if (waiting) {
            const t = waiting.data();
            errEl.textContent = `You already have ticket ${t.ticketNumber} in the ${t.department.toUpperCase()} queue.`;
            resetBtn(); return;
        }
    } catch (e) { console.warn('[pre-check ticket]', e.code); }

    const rid = 'RES-' + currentStudentId + '-' + Date.now();
    try {
        await setDoc(doc(db, 'reservations', rid), {
            userType:        currentUserType,
            displayName:     currentDisplayName,
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

    const qrEl = document.getElementById('reserveQR');
    qrEl.innerHTML = '';
    document.getElementById('reserveSummary').textContent =
        reserveDept.toUpperCase() + ' · ' + reserveReason.label + ' · ' + dateVal;
    renderQR(qrEl, rid, 160);
    rGoStep(4);
    resetBtn();
    showToast('Reservation saved!', 'success');
}

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
    } catch (e) { console.warn('[history reservations]', e.message); }

    el.innerHTML = '';

    const hasActiveBanner =
        resDocs.some(d => { const s = d.data().status; return s === 'pending' || s === 'active'; }) ||
        ticketDocs.some(d => { const s = d.data().status; return s === 'waiting' || s === 'serving'; });

    let hasHistory = false;

    ticketDocs.forEach(d => {
        const t = d.data();
        if (t.isReservation) return;
        if (t.status === 'waiting' || t.status === 'serving') return;
        const cls  = t.status === 'completed' ? 'open' : t.status === 'cancelled' ? 'closed' : 'break';
        const date = t.issuedAt?.toDate ? t.issuedAt.toDate().toLocaleDateString() : '—';
        el.innerHTML += `<div class="history-item">
            <div><strong>${t.ticketNumber}</strong> — ${t.department.toUpperCase()}<br/>
            <span class="subtle">Walk-in · ${date}</span></div>
            <span class="${cls}">${t.status.toUpperCase()}</span>
        </div>`;
        hasHistory = true;
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
        hasHistory = true;
    });

    if (!hasHistory) {
        el.innerHTML = hasActiveBanner
            ? '<p class="subtle">Your active reservation is shown above.</p>'
            : '<p class="subtle">No tickets or reservations yet.</p>';
    }
}

function closeModal(id) { 
    _modalOpen = false;
    document.getElementById(id).classList.remove('active'); 
}

function handleOverlay(e, id) {
    if (e.target !== document.getElementById(id)) return;
    if (id === 'reserveModal' && currentStep > 1) {
        if (!confirm('Close reservation? Your progress will be lost.')) return;
    }
    closeModal(id);
}
let toastTimer;
function showToast(msg, type = 'info') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className   = 'toast ' + type + ' show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}