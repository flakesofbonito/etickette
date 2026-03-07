import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore,
    doc,
    collection,
    onSnapshot,
    query,
    where
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

let app, db;

export function initMonitor() {
    app = initializeApp(firebaseConfig);
    db  = getFirestore(app);
    updateClock();
    setInterval(updateClock, 1000);
    listenToDept('cashier');
    listenToDept('registrar');
    listenToSettings();
    listenToQueue('cashier');
    listenToQueue('registrar');
}

function updateClock() {
    const now = new Date();
    document.getElementById('monitorTime').textContent =
        now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function listenToDept(dept) {
    onSnapshot(doc(db, 'departments', dept), snap => {
        if (!snap.exists()) return;
        const d  = snap.data();
        const st = (d.status || 'open').toLowerCase();
        const el = document.getElementById(dept + 'MonStatus');
        const map = {
            open:   { t: 'OPEN',     c: '' },
            break:  { t: 'ON BREAK', c: 'break' },
            closed: { t: 'CLOSED',   c: 'closed' }
        };
        const m = map[st] || map.open;
        el.textContent = m.t;
        el.className   = 'dept-status ' + m.c;
    });
}

function listenToQueue(dept) {
    // Only listen to active tickets (waiting + serving) — faster and always fresh
    const q = query(
        collection(db, 'tickets'),
        where('department', '==', dept),
        where('status', 'in', ['waiting', 'serving'])
    );

    onSnapshot(q, snap => {
        const all = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
                const ta = a.issuedAt?.toMillis?.() ?? 0;
                const tb = b.issuedAt?.toMillis?.() ?? 0;
                return ta - tb;
            });

        const serving = all.find(t => t.status === 'serving');
        const waiting = all.filter(t => t.status === 'waiting');

        // ── NOW SERVING — always overwrite, never let it go stale ──
        const nowEl = document.getElementById(dept + 'Now');
        nowEl.textContent = serving ? serving.ticketNumber : '—';

        // ── NEXT IN LINE ──
        const nextEl = document.getElementById(dept + 'Next');
        if (waiting.length === 0) {
            nextEl.innerHTML = '<span class="next-item empty">No tickets waiting</span>';
        } else {
            nextEl.innerHTML = waiting.slice(0, 5)
                .map(t => `<span class="next-item">${t.ticketNumber}</span>`)
                .join('');
        }

        // ── TOTAL — only waiting tickets ──
        document.getElementById(dept + 'Total').textContent = waiting.length;
    });
}

function listenToSettings() {
    onSnapshot(doc(db, 'system', 'settings'), snap => {
        if (!snap.exists()) return;
        const d   = snap.data();
        const rem = (d.dailyQuota || 100) - (d.ticketsIssued || 0);
        document.getElementById('footerQuota').textContent =
            'Slots: ' + rem + ' / ' + (d.dailyQuota || 100);
        if (d.statusMessage)
            document.getElementById('footerStatus').textContent = d.statusMessage;
    });
}