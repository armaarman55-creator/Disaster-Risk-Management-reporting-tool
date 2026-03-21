// js/toast.js — shared toast notification used across all modules
export function showToast(msg, isError=false, duration=3000) {
  document.querySelectorAll('.drmsa-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'drmsa-toast';
  t.style.cssText = `
    position:fixed;bottom:80px;right:24px;
    background:var(--bg2);
    border:1px solid ${isError ? 'var(--red)' : 'var(--green)'};
    color:${isError ? 'var(--red)' : 'var(--green)'};
    padding:12px 20px;border-radius:8px;
    font-size:13px;font-weight:600;
    z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,.35);
    display:flex;align-items:center;gap:10px;
    max-width:340px;transition:opacity .3s;
    font-family:Inter,system-ui,sans-serif`;
  t.innerHTML = `
    <span style="font-size:16px">${isError ? '✕' : '✓'}</span>
    <span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(() => t.remove(), 300); }, duration);
}

// Global version for onclick use
window._toast = showToast;
