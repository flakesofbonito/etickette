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

let lastServing  = { cashier: null, registrar: null };
let initialLoad  = { cashier: true, registrar: true };

function playCallAlert() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const notes = [659, 784, 880]; 
        notes.forEach((freq, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = 'sine';
            o.frequency.value = freq;
            const t = ctx.currentTime + i * 0.18;
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.5, t + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            o.start(t); o.stop(t + 0.5);
        });
        setTimeout(() => ctx.close(), 2000);
    } catch (_) {}
}

export function initMonitor() {
    app = initializeApp(firebaseConfig, 'monitor');
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

        const nowEl = document.getElementById(dept + 'Now');
        const newNum = serving ? serving.ticketNumber : '—';
        if (serving && newNum !== lastServing[dept] && !initialLoad[dept]) {
            playCallAlert();
        }
        initialLoad[dept] = false;
        lastServing[dept] = newNum;
        if (serving && newNum !== lastServing[dept] && !initialLoad[dept]) {
            playCallAlert();
            nowEl.textContent = newNum;
            nowEl.classList.remove('flashing');
            void nowEl.offsetWidth; 
            nowEl.classList.add('flashing');
            setTimeout(() => nowEl.classList.remove('flashing'), 800);
            } else {
            nowEl.textContent = newNum;
        }

        const nextEl = document.getElementById(dept + 'Next');
        if (waiting.length === 0) {
            nextEl.innerHTML = '<span class="next-item empty">No tickets waiting</span>';
        } else {
            nextEl.innerHTML = waiting.slice(0, 5)
                .map(t => `<span class="next-item">${t.ticketNumber}</span>`)
                .join('');
        }

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

        const msg        = d.statusMessage || '';
        const ticker     = document.getElementById('monitorTicker');
        const tickerText = document.getElementById('tickerText');

        clearTimeout(window._tickerTimer);
        clearInterval(window._tickerScroll);

        if (msg.trim() === '') {
            ticker.style.display = 'none';
            return;
        }

        const msgTime = d.statusMessageAt?.toMillis?.();
        const DISPLAY_MS = 30000;
        const age = msgTime ? (Date.now() - msgTime) : DISPLAY_MS;
        const remaining = DISPLAY_MS - age;

        if (remaining <= 0) {
            ticker.style.display = 'none';
            return;
        }

        tickerText.textContent = msg + '     •     ' + msg + '     •     ' + msg;
        ticker.classList.remove('fading');
        ticker.style.display = 'flex';
        ticker.style.opacity = '1';

        let pos = ticker.offsetWidth;
        tickerText.style.transform = `translateX(${pos}px)`;
        window._tickerScroll = setInterval(() => {
            pos -= 2;
            if (pos < -(tickerText.offsetWidth)) pos = ticker.offsetWidth;
            tickerText.style.transform = `translateX(${pos}px)`;
        }, 16);

        window._tickerTimer = setTimeout(() => {
            ticker.classList.add('fading');
            setTimeout(() => {
                ticker.style.display = 'none';
                clearInterval(window._tickerScroll);
            }, 800);
        }, remaining);
    });
}