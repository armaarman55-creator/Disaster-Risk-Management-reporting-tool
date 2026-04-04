// js/pwa.js
let deferredPrompt = null;

export function initPWA() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      const requestUpdate = (sw) => {
        if (!sw) return;
        sw.postMessage({ type: 'SKIP_WAITING' });
      };

      if (reg.waiting) requestUpdate(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            requestUpdate(newWorker);
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }).catch(err => console.warn('SW registration failed:', err));
  }

  // Intercept browser install prompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    hideInstallBanner();
    deferredPrompt = null;
  });
}

function showInstallBanner() {
  // Don't show if already installed (standalone mode)
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  // Don't show if dismissed in this session
  if (sessionStorage.getItem('install-dismissed')) return;

  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.className = 'install-banner';
  banner.innerHTML = `
    <div class="install-banner-icon">
      <svg viewBox="0 0 36 36" fill="none">
        <path d="M18 3L33 30H3L18 3Z" stroke="#f85149" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="18" cy="24" r="2" fill="#f85149"/>
        <line x1="18" y1="13" x2="18" y2="21" stroke="#f85149" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </div>
    <div style="flex:1">
      <div class="install-banner-title">Install DRMSA</div>
      <div class="install-banner-sub">Add to desktop or home screen for offline access</div>
    </div>
    <div class="install-banner-btns">
      <button class="btn btn-sm btn-green" id="install-yes">Install</button>
      <button class="btn btn-sm" id="install-no">Not now</button>
    </div>`;

  document.body.appendChild(banner);

  document.getElementById('install-yes').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') deferredPrompt = null;
    hideInstallBanner();
  });

  document.getElementById('install-no').addEventListener('click', () => {
    sessionStorage.setItem('install-dismissed', '1');
    hideInstallBanner();
  });
}

function hideInstallBanner() {
  document.getElementById('install-banner')?.remove();
}
