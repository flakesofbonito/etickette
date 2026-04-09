import { db } from '../js/firebase.js';
import {
    collection, doc, query, where, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
        const isNewCall = serving && newNum !== lastServing[dept] && !initialLoad[dept];

        initialLoad[dept] = false;
        lastServing[dept] = newNum;

        if (isNewCall) {
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
        const d = snap.data();
        const cQ  = d.cashierQuota    || d.dailyQuota || 100;
        const rQ  = d.registrarQuota  || d.dailyQuota || 100;
        const cI  = d.cashierIssued   || 0;
        const rI  = d.registrarIssued || 0;
        const cRem = Math.max(0, cQ - cI);
        const rRem = Math.max(0, rQ - rI);
        document.getElementById('footerQuota').textContent =
            'C: ' + cRem + '/' + cQ + '  ·  R: ' + rRem + '/' + rQ;

        const msg        = d.statusMessage || '';
        const ticker     = document.getElementById('monitorTicker');
        const tickerText = document.getElementById('tickerText');

        if (msg === window._lastTickerMsg) return;
        window._lastTickerMsg = msg;

        clearTimeout(window._tickerTimer);
        cancelAnimationFrame(window._tickerAnim);

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

        function tickStep() {
            pos -= 2;
            if (pos < -(tickerText.offsetWidth)) pos = ticker.offsetWidth;
            tickerText.style.transform = `translateX(${pos}px)`;
            window._tickerAnim = requestAnimationFrame(tickStep);
        }
        window._tickerAnim = requestAnimationFrame(tickStep);

        window._tickerTimer = setTimeout(() => {
            ticker.classList.add('fading');
            setTimeout(() => {
                ticker.style.display = 'none';
                cancelAnimationFrame(window._tickerAnim);
            }, 800);
        }, remaining);
    });
}