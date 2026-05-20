import { db } from '../js/firebase.js';
import {
    collection, doc, query, where, onSnapshot,
    getDoc, getDocs, setDoc, runTransaction,
    serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { REASONS } from './reasons.js';
import { showToast, showConfirmDialog } from '../js/utils.js';

const PUBLIC_URL = 'https://etickette.web.app';

let currentStudentId   = null;
let reserveDept        = null;
let reserveReason      = null;
let currentStep        = 1;openReserveModal
let hasActiveReservation = false;
let deptStatuses = { cashier: null, registrar: null };
let deptQuotas   = { cashier: { quota: 100, issued: 0 }, registrar: { quota: 100, issued: 0 } };
let currentUserType    = 'student';
let currentDisplayName = null;
let _unsubs = [];
let _lastHistoryFetch = 0;
let _modalOpen = false;
let _hasActiveRes    = false;
let _hasActiveTicket = false;
let _pendingReservationId = null;

const _domCache = {};
function setIfChanged(id, value) {
    if (_domCache[id] === value) return;
    _domCache[id] = value;
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

export function initWebsite() {
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

    const loginIdEl = document.getElementById('loginId');
    if (loginIdEl && !loginIdEl.value) loginIdEl.value = '02000';

    const saved = localStorage.getItem('studentId');
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
        if (!loginId.value) loginId.value = '02000';
        loginHint.textContent = '11-digit Student ID required';
    } else if (type === 'teacher') {
        inputId.style.display = 'block';
        idLabel.textContent   = 'Employee ID Number';
        loginId.placeholder   = 'e.g. 02000385394';
        if (!loginId.value) loginId.value = '02000';
        loginHint.textContent = '11-digit Employee ID required';
    } else if (type === 'parent') {
        inputChildId.style.display = 'block';
        inputName.style.display    = 'block';
        nameLabel.textContent      = 'Your Full Name';
        loginHint.textContent      = "Enter your child's Student ID and your name";
        const childIdEl = document.getElementById('loginChildId');
        if (childIdEl && !childIdEl.value) childIdEl.value = '02000';
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
        if (!/^[a-zA-ZÀ-ÿñÑ\s\-'.]+$/.test(name)) {
            err.textContent = 'Full name must contain letters only — no numbers or symbols.';
            return;
        }
        userId      = childId;
        displayName = name + ' (Parent)';

    }
    currentStudentId   = userId;
    currentDisplayName = displayName;
    localStorage.setItem('studentId',   userId);
    localStorage.setItem('displayName', displayName);
    localStorage.setItem('userType',    currentUserType);

    document.getElementById('loginOverlay').classList.add('dismissed');
    document.getElementById('appShell').classList.remove('locked');
    document.getElementById('appShell').classList.add('unlocked');
    setTimeout(() => { document.getElementById('loginOverlay').style.display = 'none'; }, 520);
    afterLogin();
}

function afterLogin() {
    const homeView = document.getElementById('view-home');
    const existingGreet = document.getElementById('homeGreeting');
    if (existingGreet) existingGreet.remove();

    if (homeView) {
        const hour = parseInt(new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false }));
        const timeOfDay = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
        const firstName = currentDisplayName.split(/[\s,]+/)[0];

        const greet = document.createElement('div');
        greet.id = 'homeGreeting';
        greet.style.cssText = `
            padding:16px 20px; margin-bottom:14px;
            background:linear-gradient(135deg, var(--blue-900), var(--blue-800));
            border-radius:var(--radius-md); color:#fff;
            display:flex; align-items:center; justify-content:space-between;
            border:1px solid rgba(255,255,255,.08);
        `;
        greet.innerHTML = `
            <div>
                <div style="font-size:16px;font-weight:800;letter-spacing:-.2px;">
                    ${timeOfDay}, ${firstName}
                </div>
                <div style="font-size:12px;opacity:.6;margin-top:3px;font-weight:500;">
                    STI College Fairview — eTickette System
                </div>
            </div>
            </div>`;

        const statusBanner = homeView.querySelector('.status-banner');
        if (statusBanner) statusBanner.after(greet);
        else homeView.prepend(greet);
    }

    const overlay = document.getElementById('loginOverlay');
    if (overlay) { overlay.classList.add('dismissed'); overlay.style.display = 'none'; }
    document.getElementById('appShell').classList.remove('locked');
    document.getElementById('appShell').classList.add('unlocked');

    currentDisplayName = localStorage.getItem('displayName') || currentStudentId;
    currentUserType    = localStorage.getItem('userType')    || 'student';

    document.getElementById('userDisplay').style.display = 'flex';
    document.getElementById('userLabel').textContent = currentDisplayName;
    document.getElementById('profileInfo').innerHTML = `
        <div class="info"><span>Type</span><b>${currentUserType.charAt(0).toUpperCase()+currentUserType.slice(1)}</b></div>
        <div class="info"><span>ID / Name</span><b>${currentDisplayName}</b></div>
        <button class="btn-ghost" style="margin-top:16px" onclick="logout()">Log out</button>
    `;

    _unsubs.forEach(u => u());
    _unsubs = [];

    setReserveButtonsLocked(true);
    navigate('home');
    setTimeout(() => {
        _unsubs.push(listenToDepts());
        _unsubs.push(listenToSettings());
        _unsubs.push(listenToActiveReservation());
    }, 520);
    setTimeout(() => showOnboardingIfNew(), 600);
}

function logout() {
    _unsubs.forEach(u => u());
    _unsubs = [];
    _lastHistoryFetch = 0;
    localStorage.removeItem('studentId');
    localStorage.removeItem('displayName');
    localStorage.removeItem('userType');
    currentDisplayName   = null;
    currentUserType      = 'student';
    currentStudentId     = null;
    hasActiveReservation = false;
    _hasActiveRes    = false;
    _hasActiveTicket = false;
    deptQuotas = { cashier: { quota: 100, issued: 0 }, registrar: { quota: 100, issued: 0 } };
    deptStatuses = { cashier: null, registrar: null };
    document.getElementById('userDisplay').style.display = 'none';
    const ov = document.getElementById('loginOverlay');
    ov.style.display = 'flex';
    ov.classList.remove('dismissed');
    document.getElementById('loginId').value = '02000';
    const childIdEl = document.getElementById('loginChildId');
    if (childIdEl) childIdEl.value = '';
    const loginNameEl = document.getElementById('loginName');
    if (loginNameEl) loginNameEl.value = '';
    document.getElementById('loginError').textContent = '';
    document.getElementById('appShell').classList.add('locked');
    document.getElementById('appShell').classList.remove('unlocked');
    selectUserType('student');
}

function showOnboardingIfNew() {
    const key = 'etickette_onboarded_' + currentStudentId;
    if (localStorage.getItem(key)) return;

    const steps = [
        {
            icon: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--blue-700)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>`,
            title: 'Reserve a Slot',
            desc: 'Pick your department and reason, then choose a date. A QR code will be generated for you.'
        },
        {
            icon: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--blue-700)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7zM14 14h.01M17 14h.01M14 17h.01M17 17h.01"/></svg>`,
            title: 'Save Your QR Code',
            desc: 'Screenshot or save the QR code — you will need it when you arrive at school.'
        },
        {
            icon: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--blue-700)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>`,
            title: 'Scan at the Kiosk',
            desc: 'At school, tap "I Have a Reservation" on the kiosk and scan your QR. Your ticket number is assigned here — not when you book.'
        },
        {
            icon: `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--blue-700)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
            title: 'Track Your Queue',
            desc: 'Use the tracker link on your printed ticket or in My Ticket to see your live queue position and get notified when called.'
        },
    ];

    const overlay = document.createElement('div');
    overlay.id = 'onboardingOverlay';
    overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(15,23,42,.65);
        z-index:99999; display:flex; align-items:center; justify-content:center; padding:16px;
    `;

    let currentStep = 0;

    function renderStep() {
        const s = steps[currentStep];
        const isLast = currentStep === steps.length - 1;
        const isFirst = currentStep === 0;

        overlay.innerHTML = `
            <div style="
                background:#fff; border-radius:20px; padding:36px 28px 28px;
                max-width:420px; width:100%; text-align:center;
                box-shadow:0 24px 60px rgba(15,23,42,.3);
                animation:modalIn .22s ease;
            ">
                <div style="
                    width:80px; height:80px; border-radius:50%;
                    background:var(--blue-50); border:2px solid var(--blue-100);
                    display:flex; align-items:center; justify-content:center;
                    margin:0 auto 18px;
                ">${s.icon}</div>

                <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:var(--slate-400);margin-bottom:8px;text-transform:uppercase;">
                    Step ${currentStep + 1} of ${steps.length}
                </div>

                <h2 style="font-size:20px;font-weight:800;color:var(--blue-800);margin-bottom:10px;letter-spacing:-.3px;">
                    ${s.title}
                </h2>
                <p style="font-size:14px;color:var(--slate-600);line-height:1.75;margin-bottom:24px;">
                    ${s.desc}
                </p>

                <div style="display:flex;gap:6px;justify-content:center;margin-bottom:24px;">
                    ${steps.map((_, i) => `
                        <div style="
                            width:${i === currentStep ? '24px' : '8px'};
                            height:8px; border-radius:4px;
                            background:${i === currentStep ? 'var(--blue-800)' : 'var(--slate-200)'};
                            transition:all .25s;
                        "></div>`).join('')}
                </div>

                <div style="display:flex;gap:8px;">
                    ${!isFirst ? `
                        <button id="obBack" style="
                            flex:1; padding:13px;
                            border:1.5px solid var(--slate-200); border-radius:10px;
                            font-size:14px; font-weight:600; cursor:pointer;
                            background:#fff; color:var(--slate-600);
                            font-family:var(--font);
                        ">Back</button>` : ''}
                    <button id="obNext" style="
                        flex:2; padding:13px; border:none; border-radius:10px;
                        font-size:14px; font-weight:700; cursor:pointer;
                        background:var(--blue-800); color:#fff;
                        font-family:var(--font);
                        box-shadow:0 4px 16px rgba(31,60,136,.25);
                    ">${isLast ? 'Get Started' : 'Next →'}</button>
                </div>

                <button id="obSkip" style="
                    margin-top:14px; background:none; border:none;
                    font-size:12px; color:var(--slate-400); cursor:pointer;
                    font-family:var(--font);
                ">Skip tutorial</button>
            </div>`;

        document.getElementById('obNext').onclick = () => {
            if (!isLast) { currentStep++; renderStep(); }
            else dismiss();
        };
        const backBtn = document.getElementById('obBack');
        if (backBtn) backBtn.onclick = () => { currentStep--; renderStep(); };
        document.getElementById('obSkip').onclick = dismiss;
    }

    function dismiss() {
        overlay.remove();
        localStorage.setItem(key, '1');
    }

    document.body.appendChild(overlay);
    renderStep();
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
            updateCongestion();

            const avg = d.avgWaitSeconds;
            setIfChanged(dept + 'AvgWait', avg
                ? '~' + Math.floor(avg / 60) + 'm ' + (avg % 60) + 's avg wait'
                : 'Avg wait: —');

            deptStatuses[dept] = st;
            updateReserveButton(dept);
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

        setIfChanged('cashierQuotaText',   Math.max(0, cashierQuota - cashierIssued) + ' / ' + cashierQuota);
        setIfChanged('registrarQuotaText', Math.max(0, registrarQuota - registrarIssued) + ' / ' + registrarQuota);

        const LOW_THRESHOLD = 10;
        const existingWarn = document.getElementById('lowSlotWarning');
        if (existingWarn) existingWarn.remove();

        const warnings = [];
        const cashierRem   = cashierQuota   - cashierIssued;
        const registrarRem = registrarQuota - registrarIssued;

        if (cashierRem > 0 && cashierRem <= LOW_THRESHOLD)
            warnings.push(`Cashier: <strong>${cashierRem}</strong> slot${cashierRem === 1 ? '' : 's'} remaining`);
        if (registrarRem > 0 && registrarRem <= LOW_THRESHOLD)
            warnings.push(`Registrar: <strong>${registrarRem}</strong> slot${registrarRem === 1 ? '' : 's'} remaining`);

        if (warnings.length > 0) {
            const warn = document.createElement('div');
            warn.id = 'lowSlotWarning';
            warn.style.cssText = `
                display:flex; align-items:flex-start; gap:12px;
                padding:13px 16px; margin-bottom:14px;
                background:var(--gold-50); border:1.5px solid var(--gold-400);
                border-radius:var(--radius-sm);
                font-size:13px; font-weight:600; color:var(--gold-700);
                line-height:1.6;
            `;
            warn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold-700)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>Slots are filling up — ${warnings.join(' · ')}. Reserve soon to secure your spot.</span>`;

            const homeView = document.getElementById('view-home');
            const deptRow = homeView?.querySelector('.dept-row');
            if (deptRow) deptRow.before(warn);
        }

        const deptMap = {
            cashier:   { quota: cashierQuota,   issued: cashierIssued },
            registrar: { quota: registrarQuota, issued: registrarIssued }
        };

        ['cashier', 'registrar'].forEach(dept => {
            const { quota, issued } = deptMap[dept];
            deptQuotas[dept] = { quota, issued };
            updateReserveButton(dept);
        });

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

function updateCongestion() {
    const cashierQueue   = parseInt(document.getElementById('cashierQueueNum')?.textContent)   || 0;
    const registrarQueue = parseInt(document.getElementById('registrarQueueNum')?.textContent) || 0;
    const totalQueue     = cashierQueue + registrarQueue;

    const el = document.getElementById('congestionText');
    if (!el) return;

    let txt, cls;

    if (totalQueue === 0) {
        txt = 'NO QUEUE';
        cls = 'open';
    } else if (totalQueue <= 5) {
        txt = 'LOW TRAFFIC';
        cls = 'open';
    } else if (totalQueue <= 15) {
        txt = 'MODERATE';
        cls = 'break';
    } else {
        txt = 'HIGH TRAFFIC';
        cls = 'closed';
    }

    if (el.textContent !== txt) {
        el.textContent = txt;
        el.className   = cls;
    }
}

function updateReserveButton(dept) {
    const btn = document.getElementById(dept + 'Btn');
    if (!btn) return;

    const card = btn.closest('.dept-card');
    const existingNotice = card?.querySelector('.active-ticket-notice');
    if (existingNotice) existingNotice.remove();

    if (hasActiveReservation) {
        btn.disabled = true;
        btn.textContent = 'You already have an active ticket';
        btn.style.background    = 'rgba(37,99,235,.08)';
        btn.style.color         = 'var(--blue-800)';
        btn.style.border        = '2px solid var(--blue-100)';
        btn.style.pointerEvents = 'none';
        btn.style.fontWeight    = '700';

        if (card && !card.querySelector('.active-ticket-notice')) {
            const notice = document.createElement('div');
            notice.className = 'active-ticket-notice';
            notice.style.cssText = `
                display:flex; align-items:center; gap:8px;
                margin: 0 14px 10px;
                padding: 9px 14px;
                background: var(--blue-50);
                border: 1.5px solid var(--blue-100);
                border-radius: var(--radius-sm);
                font-size: 12px; font-weight: 600;
                color: var(--blue-800); line-height: 1.5;
            `;
            notice.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--blue-600)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <span>You have an active ticket. Go to <strong style="cursor:pointer;text-decoration:underline;" onclick="navigate('history')">My Ticket</strong> to view or cancel it.</span>`;
            btn.before(notice);
        }
        return;
    }

    const st     = deptStatuses[dept];
    const isFull = deptQuotas[dept].issued >= deptQuotas[dept].quota;

    if (st === 'closed') {
        btn.disabled            = true;
        btn.title               = '';
        btn.textContent         = `${dept.toUpperCase()} — CLOSED`;
        btn.style.background    = '';
        btn.style.color         = '';
        btn.style.border        = '';
        btn.style.pointerEvents = 'none';
    } else if (isFull) {
        btn.disabled             = true;
        btn.title                = '';
        btn.innerHTML            = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
                <circle cx="12" cy="12" r="10"/>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            Quota Full — No Slots Available Today`;
        btn.style.display        = 'flex';
        btn.style.alignItems     = 'center';
        btn.style.justifyContent = 'center';
        btn.style.gap            = '8px';
        btn.style.background     = 'rgba(220,38,38,.08)';
        btn.style.color          = 'var(--red-600)';
        btn.style.border         = '1.5px solid rgba(220,38,38,.2)';
        btn.style.pointerEvents  = 'none';
    } else {
        btn.disabled            = false;
        btn.title               = '';
        btn.textContent         = `RESERVE ${dept.toUpperCase()} TICKET`;
        btn.style.background    = '';
        btn.style.color         = '';
        btn.style.border        = '';
        btn.style.pointerEvents = '';
    }
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
                _hasActiveRes = true;
                const resData = activeDoc.data();

                if (_modalOpen && resData.status === 'active' && resData.ticketNumber && activeDoc.id === _pendingReservationId) {
                    const qrEl = document.getElementById('reserveQR');
                    const hintEl = document.querySelector('#rstep4 .qr-hint');
                    const warnEl = document.querySelector('#rstep4 [style*="blue-50"]');
                    if (qrEl) {
                        qrEl.innerHTML = `
                            <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px 0;">
                                <div style="width:64px;height:64px;border-radius:50%;background:var(--green-100);display:flex;align-items:center;justify-content:center;">
                                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                </div>
                                <div style="font-size:22px;font-weight:900;color:var(--blue-800);letter-spacing:-1px;">${resData.ticketNumber}</div>
                                <div style="font-size:13px;font-weight:700;color:var(--green-600);">QR Scanned — You're in the Queue!</div>
                                <div style="font-size:12px;color:var(--slate-500);text-align:center;line-height:1.6;">Your ticket has been issued at the <strong>${resData.department.toUpperCase()}</strong> kiosk.<br/>Watch the lobby monitor for your number.</div>
                            </div>`;
                    }
                    if (hintEl) hintEl.style.display = 'none';
                    if (warnEl) warnEl.style.display = 'none';

                    const trackUrl = `${PUBLIC_URL}/tracker/?t=${encodeURIComponent(resData.ticketId || resData.ticketNumber)}&d=${encodeURIComponent(resData.department)}`;
                    const doneBtn = document.querySelector('#rstep4 .btn-primary');
                    if (doneBtn) {
                        doneBtn.insertAdjacentHTML('beforebegin', `
                            <a href="${trackUrl}" target="_blank" class="btn-primary" style="text-decoration:none;margin-bottom:8px;background:var(--green-600);">
                                Track My Queue →
                            </a>`);
                    }
                }

                renderActiveResBanner(resData, activeDoc.id);
            } else {
                _hasActiveRes = false;
                const banner = document.getElementById('activeResBanner');
                if (banner && banner.dataset.bannerType === 'reservation') {
                    banner.remove();
                    setTimeout(() => loadHistory(), 300);
                }
            }
            syncActiveState();
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
                _hasActiveTicket = true;
                const existingBanner = document.getElementById('activeResBanner');
                const alreadyShowing = existingBanner?.dataset.bannerType === 'walkin'
                    && existingBanner?.dataset.ticketId === activeTicket.id;

                if (!alreadyShowing) {
                    renderActiveWalkinBanner(activeTicket.data(), activeTicket.id);
                }
            } else {
                _hasActiveTicket = false;
                const banner = document.getElementById('activeResBanner');
                if (banner && banner.dataset.bannerType === 'walkin') {
                    banner.remove();
                    setTimeout(() => loadHistory(), 300);
                }
            }
            syncActiveState();
        },
        err => console.warn('[ticket snapshot]', err.code)
    );

    return () => { unsubRes(); unsubTicket(); };
}

function syncActiveState() {
    hasActiveReservation = _hasActiveRes || _hasActiveTicket;
    ['cashier', 'registrar'].forEach(dept => updateReserveButton(dept));
}

function setReserveButtonsLocked(locked) {
    hasActiveReservation = locked;
    ['cashier', 'registrar'].forEach(dept => {
        updateReserveButton(dept);
    });
}

function renderQR(el, text, size) {
    el.innerHTML = '';
    new QRCode(el, {
        text: text, width: size, height: size,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
    });

    function applyQRFix() {
        const canvas = el.querySelector('canvas');
        const img    = el.querySelector('img');

        if (img && img.src && img.src !== window.location.href && !img.src.endsWith('/')) {
            if (canvas) canvas.style.cssText = 'display:none!important;';
            img.style.cssText = `display:block!important;margin:0 auto!important;max-width:100%!important;width:${size}px;height:${size}px;`;
        } else if (canvas) {
            try {
                const dataUrl = canvas.toDataURL('image/png');
                if (dataUrl && dataUrl !== 'data:,') {
                    el.innerHTML = '';
                    const newImg = document.createElement('img');
                    newImg.src = dataUrl;
                    newImg.style.cssText = `display:block!important;margin:0 auto!important;max-width:100%!important;width:${size}px;height:${size}px;`;
                    el.appendChild(newImg);
                } else {
                    canvas.style.cssText = 'display:block!important;margin:0 auto!important;max-width:100%!important;';
                }
            } catch (e) {
                canvas.style.cssText = 'display:block!important;margin:0 auto!important;max-width:100%!important;';
            }
        }
        el.querySelectorAll('div').forEach(d => {
            d.style.cssText = 'display:flex!important;justify-content:center!important;align-items:center!important;';
        });
    }

    setTimeout(applyQRFix, 150);
    setTimeout(applyQRFix, 600); 
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
        const trackingUrl = `${PUBLIC_URL}/tracker/?t=${encodeURIComponent(res.ticketId || res.ticketNumber)}&d=${encodeURIComponent(res.department)}`;
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

function renderActiveWalkinBanner(ticket, docId) {
    const old = document.getElementById('activeResBanner');
    if (old) old.remove();

    const statusLabel = ticket.status === 'serving'
        ? '<span class="open">Now Serving — proceed to counter</span>'
        : '<span class="break">Waiting — watch the lobby monitor</span>';

    const trackingUrl = `${PUBLIC_URL}/tracker/?t=${encodeURIComponent(ticket.ticketId || docId)}&d=${encodeURIComponent(ticket.department)}`;
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
    banner.dataset.ticketId   = docId;  
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
    const ok = await showConfirmDialog(
        status === 'active'
            ? 'Your ticket has already been activated. Cancelling will remove you from the queue. Are you sure?'
            : 'Are you sure you want to cancel this reservation?',
        'Yes, Cancel',
        'Keep Reservation'
    );
    if (!ok) return;

    try {
        await runTransaction(db, async (transaction) => {
        const resSnap = await transaction.get(doc(db, 'reservations', rid));
        if (!resSnap.exists()) throw new Error('Reservation not found');
        const resData = resSnap.data();

        let ticketSnap = null;
        let dSnap = null;

        if (resData.status === 'active' && resData.ticketId) {
            ticketSnap = await transaction.get(doc(db, 'tickets', resData.ticketId));
            if (ticketSnap.exists()) {
                const tStatus = ticketSnap.data().status;
                if (tStatus === 'waiting' || tStatus === 'serving') {
                    dSnap = await transaction.get(doc(db, 'departments', resData.department));
                }
            }
        }

        transaction.update(doc(db, 'reservations', rid), {
            status: 'cancelled',
            cancelledAt: serverTimestamp()
        });

        if (ticketSnap && ticketSnap.exists()) {
            const tStatus = ticketSnap.data().status;
                transaction.update(doc(db, 'tickets', resData.ticketId), { status: 'cancelled' });

            if (tStatus === 'waiting' || tStatus === 'serving') {
                if (dSnap && dSnap.exists()) {
                    transaction.update(doc(db, 'departments', resData.department), {
                        queue: Math.max(0, (dSnap.data().queue || 1) - 1),
                        ...(tStatus === 'serving' ? { nowServing: '' } : {})
                    });
                }
                transaction.update(doc(db, 'system', 'settings'), {
                    ticketsIssued: increment(-1),
                    [resData.department + 'Issued']: increment(-1)
                });
            }
        }
    });

        const banner = document.getElementById('activeResBanner');
        if (banner) banner.remove();
        _hasActiveRes    = false;
        _hasActiveTicket = false;
        syncActiveState();
        showToast('Reservation cancelled.', 'warning');
        setTimeout(() => loadHistory(), 300);

    } catch (e) {
        console.error('[cancelReservation]', e);
        showToast('Could not cancel. Try again.', 'error');
    }
}

function openReserveModal(dept) {
    const btn = document.getElementById(dept + 'Btn');
    if (btn && btn.disabled) {
        const msg = btn.textContent.includes('BREAK') ? `${dept.toUpperCase()} is currently on break.`
            : btn.textContent.includes('CLOSED') ? `${dept.toUpperCase()} is currently closed.`
            : 'No slots available today.';
        showToast(msg, 'warning');
        return;
    }
    if (!currentStudentId)    { showToast('Please log in first.', 'error'); return; }
    if (hasActiveReservation) { showToast('You already have an active reservation. Cancel it first.', 'warning'); return; }

    _modalOpen = true;
    _pendingReservationId = null;
    const _existingQR = document.getElementById('reserveQR');
    if (_existingQR) _existingQR.innerHTML = '';
    reserveDept = dept;
    reserveReason = null;

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
        if (!dot) continue;
        dot.classList.remove('active', 'done');
        if (i < n)       dot.classList.add('done');
        else if (i === n) dot.classList.add('active');
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

    const [_y, _m, _d] = dateVal.split('-').map(Number);
    const pickedDay = new Date(_y, _m - 1, _d).getDay();
    if (pickedDay === 0) {
        errEl.textContent = 'Reservations are not available on Sundays.';
        resetBtn(); return;
    }
    const todayStrPH = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    if (dateVal < todayStrPH) {
        errEl.textContent = 'Please select today or a future date.';
        resetBtn(); return;
    }

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
        _pendingReservationId = rid;
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

    let html = '';
    ticketDocs.forEach(d => {
        const t = d.data();
        if (t.isReservation) return;
        if (t.status === 'waiting' || t.status === 'serving') return;
        const cls  = t.status === 'completed' ? 'open' : t.status === 'cancelled' ? 'closed' : 'break';
        const date = t.issuedAt?.toDate ? t.issuedAt.toDate().toLocaleDateString() : '—';
        html += `<div class="history-item">
            <div><strong>${t.ticketNumber}</strong> — ${t.department.toUpperCase()}<br/>
            <span class="subtle">Walk-in · ${date}</span></div>
            <span class="${cls}">${t.status.toUpperCase()}</span>
        </div>`;
        hasHistory = true;
    });

    resDocs.forEach(d => {
        const r = d.data();
        if (r.status === 'pending' || r.status === 'active') return;
        const cls = r.status === 'cancelled'                        ? 'closed'
        : (r.status === 'expired' || r.status === 'noshow') ? 'break'
        : 'open';
        html += `<div class="history-item">
            <div><strong>${r.department.toUpperCase()}</strong> — ${r.reason}<br/>
            <span class="subtle">Reservation · ${r.reservationDate}</span></div>
            <span class="${cls}">${r.status.toUpperCase()}</span>
        </div>`;
        hasHistory = true;
    });
    el.innerHTML = html;

    if (!hasHistory) {
        el.innerHTML = hasActiveBanner
            ? '<p class="subtle">Your active reservation is shown above.</p>'
            : `<div style="text-align:center;padding:48px 20px;">
                <div style="
                    width:64px; height:64px; border-radius:50%;
                    background:var(--slate-100); border:1.5px solid var(--slate-200);
                    display:flex; align-items:center; justify-content:center;
                    margin:0 auto 16px;
                ">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--slate-400)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <path d="M3 9h18M9 21V9"/>
                    </svg>
                </div>
                <div style="font-size:15px;font-weight:700;color:var(--blue-800);margin-bottom:6px;">No tickets yet</div>
                <div style="font-size:13px;color:var(--slate-500);line-height:1.75;max-width:260px;margin:0 auto 20px;">
                    Reserve a ticket from the Home tab. Your active reservations and past history will appear here.
                </div>
                <button onclick="navigate('home')" style="
                    padding:11px 24px;
                    background:var(--blue-800); color:#fff; border:none;
                    border-radius:var(--radius-sm); font-size:13px; font-weight:700;
                    cursor:pointer; font-family:var(--font);
                    box-shadow:0 3px 12px rgba(31,60,136,.2);
                ">Go to Home →</button>
            </div>`;
    }
}

function closeModal(id) { 
    _modalOpen = false;
    document.getElementById(id).classList.remove('active'); 
}

async function handleOverlay(e, id) {
    if (e.target !== document.getElementById(id)) return;
    if (id === 'reserveModal' && currentStep > 1 && currentStep < 4) {
        const ok = await showConfirmDialog(
            'Close reservation? Your progress will be lost.',
            'Yes, Close',
            'Keep Going'
        );
        if (!ok) return;
    }
    closeModal(id);
}
