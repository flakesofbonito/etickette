import { db } from '../js/firebase.js';
import {
  collection, doc, query, where, onSnapshot, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


let myTicket = null;
let myDept = null;
let lastStatus = null;
let notifGranted = false;
let deptAvgWait = 0;
let earlyWarnFired = false;
let earlyWarnTime = 0;
const EARLY_WARN_COOLDOWN_MS = 60000;

window.requestNotification = requestNotification;

const params = new URLSearchParams(window.location.search);
const ticketNum = params.get('t');
const dept      = params.get('d') || '';

if (!ticketNum) {
  showState('error');
} else {
  myDept = dept.toLowerCase();
  loadTicket(ticketNum);
}

async function loadTicket(tNum) {
  try {
    const snap = await getDoc(doc(db, 'tickets', tNum));
    if (!snap.exists()) { showState('error'); return; }
    myTicket = { id: snap.id, ...snap.data() };
    myDept = myDept || myTicket.department || '';
    lastStatus = myTicket.status; 
    renderTicketCard(myTicket);
    checkAndShowState(myTicket);
    startListeners(tNum);
  } catch (e) {
    console.error('[loadTicket]', e);
    showState('error');
  }
}


function startListeners(tNum) {
  onSnapshot(doc(db, 'tickets', tNum), snap => {
    if (!snap.exists()) return;
    myTicket = { id: snap.id, ...snap.data() };
    checkAndShowState(myTicket);
    renderTicketCard(myTicket);
  });

  onSnapshot(
    query(collection(db, 'tickets'), where('department', '==', myDept)),
    snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      updatePositionInfo(all);
    }
  );

  onSnapshot(doc(db, 'departments', myDept), snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      document.getElementById('nowServingNum').textContent = d.nowServing || '—';
      deptAvgWait = d.avgWaitSeconds || 0;
  });
}

function checkAndShowState(ticket) {
  const status = ticket.status;

  if (status === 'completed') { showState('completed'); return; }
  if (status === 'noshow')    { showState('noshow');    return; }
  if (status === 'cancelled') { showState('cancelled'); return; }

  showState('active');

  const statusCard = document.getElementById('statusCard');
  const iconWrap   = document.getElementById('statusIconWrap');
  const statusIcon = document.getElementById('statusIcon');
  const label      = document.getElementById('statusLabel');
  const sub        = document.getElementById('statusSub');
  const calledBanner = document.getElementById('calledBanner');

  if (status === 'serving') {
    statusCard.classList.add('serving');
    statusIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--green-600)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>';
    label.textContent = "It's Your Turn!";
    sub.textContent   = 'Please proceed to the ' + myDept.toUpperCase() + ' counter now';
    calledBanner.classList.remove('hidden');
    calledBanner.style.background  = '';
    calledBanner.style.borderColor = '';
    const callStrong = calledBanner.querySelector('.called-text strong');
    const callSpan   = calledBanner.querySelector('.called-text > span');
    if (callStrong) { callStrong.textContent = "It's Your Turn!"; callStrong.style.color = ''; }
    if (callSpan)   callSpan.innerHTML = `Please proceed to the <span id="calledDept">${myDept.toUpperCase()}</span> counter now`;
    document.getElementById('positionCard').style.opacity = '0.5';

    if (lastStatus !== 'serving') {
      triggerNotification(ticket.ticketNumber);
      playAlertSound();
      pulseIcon();
      const numEl = document.getElementById('tcNumber');
      if (numEl) {
        numEl.classList.remove('flash');
        void numEl.offsetWidth;
        numEl.classList.add('flash');
        setTimeout(() => numEl.classList.remove('flash'), 950);
      }
    }
  } else {
    statusCard.classList.remove('serving');
    statusIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="var(--blue-600)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    label.textContent = 'Waiting in Queue';
    sub.textContent   = 'We\'ll notify you when it\'s your turn';
    calledBanner.classList.add('hidden');
    document.getElementById('positionCard').style.opacity = '1';
  }

  lastStatus = status;
}

function showState(state) {
  ['loading','error','completed','noshow','cancelled','active'].forEach(s => {
    const el = document.getElementById('state' + s.charAt(0).toUpperCase() + s.slice(1));
    if (el) el.classList.toggle('hidden', s !== state);
  });
  if (state === 'completed') {
    document.getElementById('doneTicketNum').textContent = myTicket?.ticketNumber || ticketNum;
  }
}

function renderTicketCard(ticket) {
  document.getElementById('tcDept').textContent   = (ticket.department || myDept).toUpperCase();
  document.getElementById('tcNumber').textContent = ticket.ticketNumber;
  document.getElementById('tcName').textContent   = ticket.displayName || ticket.userId || '—';
  document.getElementById('tcReason').textContent = ticket.reason || '—';
  document.getElementById('tcType').textContent   = ticket.isReservation ? 'Reservation' : 'Walk-in';
}

function updatePositionInfo(all) {
  const waitingOnly = all
    .filter(t => t.status === 'waiting')
    .sort((a, b) => (a.issuedAt?.toMillis?.() || 0) - (b.issuedAt?.toMillis?.() || 0));

  const serving   = all.find(t => t.status === 'serving');
  const completed = all.filter(t => t.status === 'completed' || t.status === 'noshow').length;
  const total     = all.filter(t => t.status !== 'cancelled').length;

  const iAmServing = serving && (serving.ticketId === ticketNum || serving.ticketNumber === ticketNum || serving.id === ticketNum);
  const myPos      = waitingOnly.findIndex(t => t.ticketId === ticketNum || t.ticketNumber === ticketNum || t.id === ticketNum);

  let posDisplay, aheadText, estWait;

  if (iAmServing) {
    posDisplay = 'NOW';
    aheadText  = "You're being served!";
    estWait    = '<1';
  } else if (myPos >= 0) {
    const ahead = myPos;
    posDisplay  = myPos + 1;
    aheadText   = ahead > 0 ? ahead + ' ahead of you' : "You're next!";
    const minsPerTicket = deptAvgWait > 0 ? Math.ceil(deptAvgWait / 60) : 5;
    estWait = ahead > 0 ? Math.round(ahead * minsPerTicket) : '<1';
  } else {
    posDisplay = '—';
    aheadText  = '—';
    estWait    = '—';
  }

  document.getElementById('posNumber').textContent = posDisplay;
  document.getElementById('posAhead').textContent  = aheadText;
  document.getElementById('estWait').textContent   = estWait;

  const etaEl = document.getElementById('estClockTime');
  if (etaEl) {
    if (typeof estWait === 'number' && estWait > 0) {
      const eta = new Date(Date.now() + estWait * 60 * 1000);
      etaEl.textContent = 'Around ' + eta.toLocaleTimeString('en-PH', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila'
      });
      etaEl.style.display = '';
    } else if (estWait === '<1') {
      etaEl.textContent = 'Any moment now';
      etaEl.style.display = '';
    } else {
      etaEl.style.display = 'none';
    }
  }

  if (myPos === 1 && !earlyWarnFired && lastStatus !== 'serving') {
    const now = Date.now();
    if (now - earlyWarnTime > EARLY_WARN_COOLDOWN_MS) {
      earlyWarnFired = true;
      earlyWarnTime = now;
      triggerEarlyWarning();
    }
  }

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  document.getElementById('progBar').style.width    = pct + '%';
  document.getElementById('progServed').textContent = completed + ' served';
  document.getElementById('progTotal').textContent  = total + ' total';

  const aheadCard = document.getElementById('aheadCard');
  const aheadList = document.getElementById('aheadList');
  if (aheadCard && aheadList) {
    if (iAmServing || myPos <= 0) {
      aheadCard.classList.add('hidden');
    } else {
      aheadCard.classList.remove('hidden');
      const beforeMe = waitingOnly.slice(0, myPos);
      const toShow   = beforeMe.slice(-3);
      let html = '';

      if (serving) {
        html += `<div class="ahead-item">
          <span class="ahead-badge now">NOW</span>
          <span class="ahead-num">${serving.ticketNumber}</span>
          <span class="ahead-meta">Being served</span>
        </div>`;
      }
      if (beforeMe.length > 3) {
        html += `<div class="ahead-ellipsis">· · · ${beforeMe.length - 3} more ahead · · ·</div>`;
      }
      toShow.forEach((t, i) => {
        const pos = myPos - toShow.length + i + 1;
        html += `<div class="ahead-item">
          <span class="ahead-badge pos">#${pos}</span>
          <span class="ahead-num">${t.ticketNumber}</span>
        </div>`;
      });
      html += `<div class="ahead-item ahead-mine-row">
        <span class="ahead-badge mine">YOU</span>
        <span class="ahead-num">${myTicket?.ticketNumber || '—'}</span>
        <span class="ahead-meta">Your ticket</span>
      </div>`;
      aheadList.innerHTML = html;
    }
  }
}

async function requestNotification() {
    const btn       = document.getElementById('btnNotif');
    const card      = document.getElementById('notifCard');
    const notifText = card?.querySelector('.notif-text span');

    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(async function(OneSignal) {
        try {
            const permission = await OneSignal.Notifications.requestPermission();

            if (!permission) {
                btn.textContent = 'Denied';
                btn.classList.add('denied');
                if (notifText) notifText.textContent = 'Blocked — enable in browser settings.';
                return;
            }

            await OneSignal.User.addTag('ticketId', ticketNum);
            await OneSignal.User.addTag('dept', myDept);

            notifGranted = true;
            btn.textContent = 'Enabled';
            btn.classList.add('done');
            card?.classList.add('granted');
            if (notifText) notifText.textContent = "You'll be notified even with this tab closed.";

        } catch(e) {
            console.error('[OneSignal]', e);
            btn.textContent = 'Failed';
            btn.classList.add('denied');
            if (notifText) notifText.textContent = 'Could not enable — try refreshing.';
        }
    });
}


function triggerNotification(tNum) {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);

  if (notifGranted && Notification.permission === 'granted') {
    new Notification('It\'s Your Turn!', {
      body: 'Ticket ' + tNum + ' — Please proceed to the ' + myDept.toUpperCase() + ' counter.',
      icon: 'https://etickette.web.app/assets/logo.png',
      tag: 'etickette-call',
      requireInteraction: true
    });
  }

  let flashing = true;
  const origTitle = document.title;
  const flashInterval = setInterval(() => {
    document.title = flashing ? '[ IT\'S YOUR TURN ] ' + origTitle : origTitle;
    flashing = !flashing;
  }, 800);
  setTimeout(() => {
    clearInterval(flashInterval);
    document.title = origTitle;
  }, 10000);
}

function triggerEarlyWarning() {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

    if (notifGranted && Notification.permission === 'granted') {
        new Notification('Almost Your Turn!', {
            body: 'One person ahead of you — get ready to proceed to the ' + myDept.toUpperCase() + ' counter.',
            icon: 'https://etickette.web.app/assets/logo.png',
            tag: 'etickette-early'
        });
    }

    const banner = document.getElementById('calledBanner');
    if (banner) {
        banner.classList.remove('hidden');
        banner.style.background = 'linear-gradient(135deg, var(--blue-50), var(--gold-50))';
        banner.style.borderColor = 'var(--blue-100)';
        const strong = banner.querySelector('strong');
        const span   = banner.querySelector('span');
        if (strong) strong.textContent = 'Almost Your Turn!';
        if (strong) strong.style.color = 'var(--blue-800)';
        if (span)   span.textContent   = 'One person ahead — please make your way to the ' + myDept.toUpperCase() + ' counter.';
        setTimeout(() => {
            if (lastStatus !== 'serving') banner.classList.add('hidden');
        }, 8000);
    }
}

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [440, 554, 659].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = freq;
      const t = ctx.currentTime + i * 0.22;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.4, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.start(t); o.stop(t + 0.4);
    });
    setTimeout(() => ctx.close(), 2000);
  } catch (_) {}
}

function pulseIcon() {
  const el = document.getElementById('statusIconWrap');
  el.classList.add('ping');
  setTimeout(() => el.classList.remove('ping'), 600);
}

if ('Notification' in window && Notification.permission === 'granted') {
  notifGranted = true;
  const btn = document.getElementById('btnNotif');
  if (btn) {
    btn.textContent = 'Enabled';
    btn.classList.add('done');
  }
  document.getElementById('notifCard')?.classList.add('granted');
}