// js/app.js
import { supabase } from './supabase.js';

let _user = null;
let _theme = localStorage.getItem('drmsa-theme') || 'dark';

export async function initApp(user) {
  _user = user;

  // Apply theme immediately
  applyTheme(_theme);

  // Show app shell — do this before anything else
  const appScreen = document.getElementById('app-screen');
  if (appScreen) appScreen.classList.add('visible');

  // Wire up nav and rail FIRST — unconditionally
  initNav();
  initFooter();

  // If user profile failed to load (null), retry once directly
  if (!_user || !_user.id) {
    try {
      const { getCurrentUser } = await import('./supabase.js');
      const retried = await getCurrentUser();
      if (retried) _user = retried;
    } catch(e) { console.warn('User retry failed:', e); }
  }

  // Then populate UI with user data
  populateUserUI(_user);

  // Fetch weather if configured
  fetchWeatherWarnings();

  // Check onboarding
  try {
    const { initOnboarding } = await import('./onboarding.js');
    const needsOnboarding = await initOnboarding(user);
    if (!needsOnboarding) {
      navigateTo('dashboard');
      const { initDashboard } = await import('./dashboard.js');
      await initDashboard(user);
    }
  } catch(e) {
    console.warn('Onboarding/dashboard init error:', e);
    // Still navigate to dashboard even if onboarding check fails
    navigateTo('dashboard');
    try {
      const { initDashboard } = await import('./dashboard.js');
      await initDashboard(user);
    } catch(e2) {
      console.warn('Dashboard init error:', e2);
    }
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
  setEl('tb-page-title',  user?.municipalities?.name || 'DRMSA');
  setEl('tb-crumb',       'Dashboard');

  // Show Disaster Admin Panel for admin and disaster_officer
  const adminNav = document.getElementById('nav-admin');
  if (adminNav) {
    adminNav.style.display = ['admin', 'disaster_officer'].includes(user?.role) ? 'flex' : 'none';
  }

  // Warn if no municipality set
  if (!user?.municipality_id) {
    showNomuniWarning();
  }
}

function showNomuniWarning() {
  const content = document.getElementById('content-area');
  if (!content) return;
  const banner = document.createElement('div');
  banner.id = 'no-muni-banner';
  banner.style.cssText = 'background:var(--amber-dim);border-bottom:1px solid var(--amber);padding:10px 22px;font-size:12px;color:var(--amber);display:flex;align-items:center;gap:12px;flex-shrink:0;font-family:monospace;font-weight:600';
  banner.innerHTML = `⚠ No municipality linked to your account.
    <button class="btn btn-sm" id="fix-muni-btn" style="border-color:var(--amber);color:var(--amber)">
      Fix in My Profile →
    </button>`;
  content.insertBefore(banner, content.firstChild);
  document.getElementById('fix-muni-btn')?.addEventListener('click', () => {
    banner.remove();
    navigateTo('profile');
  });
}

function roleLabel(r) {
  return { admin: 'Admin', disaster_officer: 'Disaster Officer', planner: 'IDP Planner', viewer: 'Viewer' }[r] || r || 'User';
}

// Rail removed — using top nav instead

// ── NAV ───────────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.tni').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (page) navigateTo(page, item);
    });
  });
  document.getElementById('btn-new-assessment')?.addEventListener('click', () => navigateTo('hvc'));
  document.getElementById('user-av')?.addEventListener('click', () => navigateTo('profile'));
}

export function navigateTo(pageId, navItem) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('visible'));

  // Show target page
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('visible');

  // Update nav highlight
  document.querySelectorAll('.tni').forEach(n => n.classList.remove('on'));
  if (navItem) {
    navItem.classList.add('on');
  } else {
    document.querySelector(`.tni[data-page="${pageId}"]`)?.classList.add('on');
  }

  // Update breadcrumb
  const crumbs = {
    dashboard:    'Dashboard',
    community:    'Shelters & relief',
    routes:       'Routes & closures',
    sitrep:       'Situation Report',
    mopup:        'Mop-up Report',
    hvc:          'HVC Assessment Tool',
    stakeholders: 'Stakeholder directory',
    admin:        'Disaster Admin Panel',
    profile:      'My profile',
    'risk-map':   'Risk map',
    history:      'Assessment history',
    mitigations:  'Mitigations',
    idp:          'IDP Linkage',
    reports:      'Reports'
  };
  setEl('tb-crumb', crumbs[pageId] || pageId);

  loadPageModule(pageId);
}

async function loadPageModule(pageId) {
  try {
    switch (pageId) {
      case 'dashboard':    { const m = await import('./dashboard.js');    m.initDashboard(_user);    break; }
      case 'community':    { const m = await import('./community.js');    m.initCommunity(_user);    break; }
      case 'routes':       { const m = await import('./routes.js');       m.initRoutes(_user);       break; }
      case 'sitrep':       { const m = await import('./sitrep.js');       m.initSitrep(_user);       break; }
      case 'mopup':        { const m = await import('./mopup.js');        m.initMopup(_user);        break; }
      case 'stakeholders': { const m = await import('./stakeholders.js'); m.initStakeholders(_user); break; }
      case 'hvc':          { const m = await import('./hvc_v2.js?v=20260325e'); m.initHVC(_user);   break; }
      case 'idp':          { const m = await import('./idp.js');          m.initIDP(_user);          break; }
      case 'admin':        { const m = await import('./admin_v3.js?v=20260325e'); m.initAdmin(_user); break; }
      case 'profile':      { const m = await import('./profile.js');      m.initProfile(_user);      break; }
      case 'risk-map':    renderPlaceholder('risk-map',    'Risk map',          'Complete HVC assessments to generate a full risk map.');    break;
      case 'history':     renderPlaceholder('history',     'Assessment history','All completed HVC assessments will appear here.');           break;
      case 'mitigations': renderPlaceholder('mitigations', 'Mitigation library','Pre-built mitigations from the hazard library.');            break;
      case 'reports':     renderPlaceholder('reports',     'Reports',           'Export centre — SitReps, HVC reports and IDP summaries.');   break;
    }
  } catch(e) {
    console.warn('Page module load failed:', pageId, e);
  }
}

// ── FOOTER ────────────────────────────────────────────────
function initFooter() {
  document.getElementById('footer-theme-btn')?.addEventListener('click', toggleTheme);
  document.getElementById('rail-theme-btn')?.addEventListener('click',   toggleTheme);
  document.getElementById('footer-signout')?.addEventListener('click', async () => {
    const { signOut } = await import('./auth.js');
    signOut();
  });

  // Clicking avatar or name goes to profile
  ['user-av', 'user-info-wrap'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => navigateTo('profile'));
  });
}

// ── THEME ─────────────────────────────────────────────────
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

// ── WEATHER ───────────────────────────────────────────────
async function fetchWeatherWarnings() {
  const key      = localStorage.getItem('drmsa_weather_key');
  const provider = localStorage.getItem('drmsa_weather_provider') || 'none';
  const lat      = localStorage.getItem('drmsa_lat');
  const lng      = localStorage.getItem('drmsa_lng');
  const bar      = document.getElementById('saws-alert-bar');
  const desc     = document.getElementById('saws-bar-desc');

  if (!key || provider === 'none' || !lat || !lng) {
    if (bar) bar.style.display = 'none';
    return;
  }

  try {
    let alertText = null;

    if (provider === 'openweathermap') {
      const res  = await fetch(`https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lng}&exclude=minutely,hourly,daily&appid=${key}`);
      const data = await res.json();
      if (data.alerts?.length) alertText = `${data.alerts[0].event} — ${data.alerts[0].description?.slice(0, 140)}`;
    } else if (provider === 'weatherapi') {
      const res  = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${key}&q=${lat},${lng}&alerts=yes`);
      const data = await res.json();
      if (data.alerts?.alert?.length) alertText = data.alerts.alert[0].headline || data.alerts.alert[0].event;
    } else if (provider === 'tomorrow') {
      const res  = await fetch(`https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lng}&apikey=${key}`);
      const data = await res.json();
      // Alerts not available on free tier
    }

    if (bar) bar.style.display = alertText ? 'flex' : 'none';
    if (desc && alertText) desc.textContent = alertText;
  } catch(e) {
    if (bar) bar.style.display = 'none';
  }

  document.getElementById('saws-dismiss')?.addEventListener('click', () => {
    if (bar) bar.style.display = 'none';
  });
}

// ── HELPERS ───────────────────────────────────────────────
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el && val !== undefined) el.textContent = val;
}

export function getUser()  { return _user; }

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

// Global navigate helper — safe to use in onclick attributes (no import() needed)
window._drmsaNavigate = function(pageId) {
  navigateTo(pageId);
};
