export function confirmDialog({
  title = 'Confirm action',
  message = 'Are you sure you want to continue?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = true
} = {}) {
  return new Promise(resolve => {
    document.getElementById('drmsa-confirm-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'drmsa-confirm-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10060;display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `
      <div style="width:min(520px,100%);background:var(--bg2,#111827);border:1px solid var(--border,#334155);border-radius:10px;box-shadow:0 18px 48px rgba(0,0,0,.45);padding:16px">
        <div style="font-size:16px;font-weight:700;color:var(--text,#f8fafc);margin-bottom:8px">${title}</div>
        <div style="font-size:13px;line-height:1.5;color:var(--text2,#cbd5e1);white-space:pre-line">${message}</div>
        <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px">
          <button type="button" data-role="cancel" class="btn btn-sm">${cancelText}</button>
          <button type="button" data-role="confirm" class="btn btn-sm ${danger ? 'btn-red' : 'btn-green'}">${confirmText}</button>
        </div>
      </div>`;

    const close = (val) => {
      overlay.remove();
      resolve(val);
    };

    overlay.addEventListener('click', e => {
      if (e.target === overlay) close(false);
    });
    overlay.querySelector('[data-role="cancel"]')?.addEventListener('click', () => close(false));
    overlay.querySelector('[data-role="confirm"]')?.addEventListener('click', () => close(true));

    const onEsc = (e) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', onEsc);
        close(false);
      }
    };
    window.addEventListener('keydown', onEsc, { once: true });

    document.body.appendChild(overlay);
  });
}
