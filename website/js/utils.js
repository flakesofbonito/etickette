export function showToast(msg, type = 'info') {
    let t = document.getElementById('_toast');
    if (!t) {
        t = document.createElement('div');
        t.id = '_toast';
        t.style.cssText = `
            position:fixed; bottom:24px; left:50%;
            transform:translateX(-50%) translateY(80px);
            padding:11px 24px; border-radius:30px;
            font-size:14px; font-weight:600; color:#fff;
            z-index:9999; opacity:0;
            transition:transform .3s ease, opacity .3s ease;
            pointer-events:none; white-space:nowrap;
            font-family:var(--font); box-shadow:0 4px 20px rgba(0,0,0,.2);
        `;
        document.body.appendChild(t);
    }
    const colors = { success:'#16a34a', error:'#dc2626', info:'#2563eb', warning:'#d97706' };
    t.style.background = colors[type] || colors.info;
    t.textContent = msg;
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateX(-50%) translateY(80px)';
    }, 3200);
}

export function showConfirmDialog(message, confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise(resolve => {
        const existing = document.getElementById('_confirmDialog');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = '_confirmDialog';
        overlay.style.cssText = `
            position:fixed; inset:0; background:rgba(0,0,0,.55);
            display:flex; align-items:center; justify-content:center; z-index:9999;
        `;
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;padding:28px 24px;
                        max-width:360px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,.25);text-align:center;">
                <p style="font-size:15px;font-weight:600;color:#1a1a2e;line-height:1.5;margin-bottom:20px;">${message}</p>
                <div style="display:flex;gap:10px;">
                    <button id="_dlgCancel" style="flex:1;padding:12px;border:2px solid #e5e7eb;
                        border-radius:10px;font-size:14px;cursor:pointer;background:#fff;color:#6b7280;">
                        ${cancelText}
                    </button>
                    <button id="_dlgConfirm" style="flex:1;padding:12px;border:none;
                        border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;
                        background:#1f3c88;color:#fff;">
                        ${confirmText}
                    </button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#_dlgConfirm').onclick = () => { overlay.remove(); resolve(true); };
        overlay.querySelector('#_dlgCancel').onclick  = () => { overlay.remove(); resolve(false); };
    });
}

export function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}