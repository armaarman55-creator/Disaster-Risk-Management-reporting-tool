// js/app.js
import { supabase } from './supabase.js';

let _user = null;
let _theme = localStorage.getItem('drmsa-theme') || 'dark';
let _pageLoadToken = 0;

export async function initApp(user) {
  _user = user;
  applyTheme(_theme);

  const appScreen = document.getElementById('app-screen');
  if (appScreen) appScreen.classList.add('visible');

  initNav();
  initFooter();

  if (!_user || !_user.id) {
    try {
      const { getCurrentUser } = await import('./supabase.js');
      const retried = await getCurrentUser();
      if (retried) _user = retried;
    } catch(e) {
      console.warn('User retry failed:', e);
    }
  }

  populateUserUI(_user);

  // Onboarding removed: always go directly to dashboard.
  navigateTo('dashboard');
  try {
    const { initDashboard } = await import('./dashboard.js');
    await initDashboard(_user);
  } catch (e) {
    console.warn('Dashboard init error:', e);
  }
}

function populateUserUI(user) {
  const name     = user?.full_name || user?.email || 'User';
  const initials = name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  setEl('user-av',        initials);
  setEl('user-name-disp', name);
  setEl('user-role-disp', roleLabel(user?.role));
  setEl('user-muni-name', user?.municipalities?.name || '—');
  setEl('muni-wards-disp',
    user?.municipalities
      ? `${user.municipalities.ward_count || '?'} wards · ${user.municipalities.code || ''}`
      : 'No municipality set'
  );
  setEl('tb-page-title', user?.municipalities?.name || 'DRMSA');
  setEl('tb-crumb',      'Dashboard');

  const adminNav = document.getElementById('nav-admin');
  if (adminNav) {
    adminNav.style.display = ['admin', 'disaster_officer'].includes(user?.role) ? 'flex' : 'none';
  }

  if (!user?.municipality_id) showNomuniWarning();
}

function showNomuniWarning() {
  const content = document.getElementById('content-area');
  if (!content) return;

  const banner = document.createElement('div');
  banner.id = 'no-muni-banner';
  banner.style.cssText = 'background:var(--amber-dim);border-bottom:1px solid var(--amber);padding:10px 22px;font-size:12px;color:var(--amber);display:flex;align-items:center;gap:12px;flex-shrink:0;font-family:monospace;font-weight:600';
  banner.innerHTML = `⚠ No municipality linked to your account.
    <button class="btn btn-sm" id="fix-muni-btn" style="border-color:var(--amber);color:var(--amber)">Fix in My Profile →</button>`;

  content.insertBefore(banner, content.firstChild);
  document.getElementById('fix-muni-btn')?.addEventListener('click', () => {
    banner.remove();
    navigateTo('profile');
  });
}

function roleLabel(r) {
  return {
    admin: 'Admin',
    disaster_officer: 'Disaster Officer',
    planner: 'IDP Planner',
    viewer: 'Viewer'
  }[r] || r || 'User';
}

function initNav() {
  initMobileNav();

  document.querySelectorAll('.tni').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (page) navigateTo(page, item);
      closeMobileNav();
    });
  });

  document.getElementById('btn-new-assessment')?.addEventListener('click', () => navigateTo('hvc'));
  document.getElementById('user-av')?.addEventListener('click', () => navigateTo('profile'));
}

export function navigateTo(pageId, navItem) {
  closeMobileNav();

  document.querySelectorAll('.page').forEach(p => p.classList.remove('visible'));

  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('visible');

  document.querySelectorAll('.tni').forEach(n => n.classList.remove('on'));
  if (navItem) {
    navItem.classList.add('on');
  } else {
    document.querySelector(`.tni[data-page="${pageId}"]`)?.classList.add('on');
  }

  const crumbs = {
    dashboard:'Dashboard',
    community:'Shelters & relief',
    routes:'Routes & closures',
    sitrep:'Situation Report',
    mopup:'Mop-up Report',
    hvc:'HVC Assessment Tool',
    stakeholders:'Stakeholder directory',
    admin:'Disaster Admin Panel',
    profile:'My profile',
    'risk-map':'Risk map',
    history:'Assessment history',
    mitigations:'Mitigations',
    idp:'IDP Linkage',
    contingency:'Contingency plans',
    reports:'Reports'
  };
  setEl('tb-crumb', crumbs[pageId] || pageId);

  enforceContingencyAssistantScope(pageId);
  loadPageModule(pageId);
}


async function enforceContingencyAssistantScope(pageId) {
  if (pageId === 'contingency') return;
  try {
    const m = await import('./contingency-dist/contingency-assistant-panel.js');
    m.destroyAssistantPanel?.();
    m.teardownAssistantPanel?.();

    document.getElementById('ca-panel')?.classList.remove('ca-open');
    document.body.classList.remove('ca-open');
    const toggle = document.getElementById('ca-toggle');
    if (toggle) toggle.textContent = '✦ Assistant';
  } catch (e) {
    console.warn('Contingency assistant cleanup skipped:', e);
  }
}

async function loadPageModule(pageId) {
  const token = ++_pageLoadToken;
  showPageLoading(pageId, token);
  try {
    switch (pageId) {
      case 'dashboard': {
        const m = await import('./dashboard.js');
        m.initDashboard(_user);
        break;
      }
      case 'community': {
        const m = await import('./community.js');
        m.initCommunity(_user);
        break;
      }
      case 'routes': {
        const m = await import('./routes.js');
        m.initRoutes(_user);
        break;
      }
      case 'sitrep': {
        const m = await import('./sitrep.js');
        m.initSitrep(_user);
        break;
      }
      case 'mopup': {
        const m = await import('./mopup.js');
        m.initMopup(_user);
        break;
      }
      case 'stakeholders': {
        const m = await import('./stakeholders.js');
        m.initStakeholders(_user);
        break;
      }
      case 'hvc': {
        const m = await import('./hvc.js?v=20260414');
        m.initHVC(_user);
        break;
      }
      case 'idp': {
        const m = await import('./idp.js');
        m.initIDP(_user);
        break;
      }
      case 'contingency': {
        let m;
        try {
          m = await import('./contingency-page.js');
        } catch (primaryErr) {
          console.warn('Primary contingency module failed, trying legacy path:', primaryErr);
          m = await import('./contingency.js');
        }
        m.initContingencyPage(_user);
        break;
      }
      case 'admin': {
        const m = await import('./admin.js');
        m.initAdmin(_user);
        break;
      }
      case 'profile': {
        const m = await import('./profile.js');
        m.initProfile(_user);
        break;
      }
      case 'risk-map': {
        const m = await import('./risk-map.js');
        m.initRiskMap(_user);
        break;
      }
      case 'history':
        renderPlaceholder('history', 'Assessment history', 'All completed HVC assessments will appear here.');
        break;
      case 'mitigations':
        renderPlaceholder('mitigations', 'Mitigation library', 'Pre-built mitigations from the hazard library.');
        break;
      case 'reports':
        renderPlaceholder('reports', 'Reports', 'Export centre — SitReps, HVC reports and IDP summaries.');
        break;
    }
  } catch(e) {
    console.warn('Page module load failed:', pageId, e);
  } finally {
    hidePageLoading(token);
  }
}

function ensureLoadingStyles() {
  if (document.getElementById('drmsa-page-loader-style')) return;
  const style = document.createElement('style');
  style.id = 'drmsa-page-loader-style';
  style.textContent = `
    @keyframes drmsa-spin { to { transform: rotate(360deg); } }
    .drmsa-page-loader {
      position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:10px; background:rgba(8,12,20,.55); backdrop-filter: blur(1px); z-index:40;
      color:var(--text,#fff); font-size:12px; font-weight:600; letter-spacing:.03em;
    }
    .drmsa-page-loader .spinner {
      width:22px; height:22px; border-radius:50%;
      border:2px solid rgba(255,255,255,.35); border-top-color:#fff;
      animation:drmsa-spin .8s linear infinite;
    }
  `;
  document.head.appendChild(style);
}

function showPageLoading(pageId, token) {
  const page = document.getElementById(`page-${pageId}`);
  if (!page) return;
  ensureLoadingStyles();
  page.querySelector('.drmsa-page-loader')?.remove();
  if (getComputedStyle(page).position === 'static') page.style.position = 'relative';
  const overlay = document.createElement('div');
  overlay.className = 'drmsa-page-loader';
  overlay.dataset.token = String(token);
  overlay.innerHTML = `<div class="spinner"></div><div>Loading ${pageId.replace('-', ' ')}…</div>`;
  page.appendChild(overlay);
}

function hidePageLoading(token) {
  const active = document.querySelector(`.drmsa-page-loader[data-token="${token}"]`);
  if (active) active.remove();
}

function initFooter() {
  document.getElementById('footer-theme-btn')?.addEventListener('click', toggleTheme);
  document.getElementById('rail-theme-btn')?.addEventListener('click',   toggleTheme);
  document.getElementById('footer-signout')?.addEventListener('click', async () => {
    const { signOut } = await import('./auth.js');
    signOut();
  });

  ['user-av', 'user-info-wrap'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => navigateTo('profile'));
  });
}

export function toggleTheme() {
  _theme = _theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('drmsa-theme', _theme);
  applyTheme(_theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  setEl('footer-theme-lbl', theme === 'dark' ? 'Light mode' : 'Dark mode');
  setEl('rail-theme-lbl',   theme === 'dark' ? 'Light mode' : 'Dark mode');
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined) el.textContent = val;
}

export function getUser() {
  return _user;
}

function renderPlaceholder(pageId, title, subtitle) {
  const page = document.getElementById('page-' + pageId);
  if (!page) return;

  page.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;gap:12px">
    <div style="font-size:32px;opacity:.3">🚧</div>
    <div style="font-size:17px;font-weight:800;color:var(--text)">${title}</div>
    <div style="font-size:13px;color:var(--text3);max-width:320px;line-height:1.7">${subtitle}</div>
    <div style="font-size:11px;color:var(--text3);margin-top:8px;font-family:monospace">Coming soon</div>
  </div>`;
}

window._drmsaNavigate = function(pageId) {
  navigateTo(pageId);
};

function initMobileNav() {
  const appScreen = document.getElementById('app-screen');
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('mobile-menu-btn');
  if (!appScreen || !sidebar || !menuBtn) return;

  menuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    appScreen.classList.toggle('mobile-nav-open');
  });

  document.addEventListener('click', (event) => {
    if (!appScreen.classList.contains('mobile-nav-open')) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (sidebar.contains(target) || menuBtn.contains(target)) return;
    closeMobileNav();
  });
}

function closeMobileNav() {
  const appScreen = document.getElementById('app-screen');
  if (appScreen) appScreen.classList.remove('mobile-nav-open');
}
