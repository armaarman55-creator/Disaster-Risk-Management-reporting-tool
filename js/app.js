// js/app.js
import { signOut } from './auth.js';
import { supabase } from './supabase.js';

let _user = null;
let _theme = localStorage.getItem('drmsa-theme') || 'dark';

export async function initApp(user) {
  _user = user;
  applyTheme(_theme);

  const appScreen = document.getElementById('app-screen');
  appScreen.classList.add('visible');

  populateUserUI(user);
  initNav();
  initFooter();
  initRail();
  fetchWeatherWarnings();

  // Check onboarding
  const { initOnboarding } = await import('./onboarding.js');
  const needsOnboarding = await initOnboarding(user);
  if (!needsOnboarding) {
    navigateTo('dashboard');
    const { initDashboard } = await import('./dashboard.js');
    await initDashboard(user);
  }
}

function populateUserUI(user) {
  const initials = (user?.full_name||'U').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
  setEl('user-av', initials);
  setEl('user-name-disp', user?.full_name || 'User');
  setEl('user-role-disp', roleLabel(user?.role));
  setEl('user-muni-name', user?.municipalities?.name || '—');
  setEl('muni-wards-disp', `${user?.municipalities?.ward_count||'?'} wards · ${user?.municipalities?.code||''}`);
  setEl('tb-page-title', user?.municipalities?.name || 'Dashboard');

  // Show Disaster Admin Panel for admin and disaster_officer
  const adminNav = document.getElementById('nav-admin');
  if (adminNav) adminNav.style.display = ['admin','disaster_officer'].includes(user?.role) ? 'flex' : 'none';
}

function roleLabel(r) {
  return { admin:'Admin', disaster_officer:'Disaster Officer', planner:'IDP Planner', viewer:'Viewer' }[r] || r || 'User';
}

// ── NAV ───────────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.ni').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (!page) return;
      navigateTo(page, item);
    });
  });

  document.getElementById('btn-new-assessment')?.addEventListener('click', () => navigateTo('hvc'));
}

export function navigateTo(pageId, navItem) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('visible'));
  document.getElementById('page-' + pageId)?.classList.add('visible');

  document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
  const match = navItem || document.querySelector(`.ni[data-page="${pageId}"]`);
  match?.classList.add('on');

  const crumbs = {
    dashboard:'Dashboard', community:'Shelters & relief', routes:'Routes',
    sitrep:'Situation Report', mopup:'Mop-up Report', hvc:'HVC Tool',
    stakeholders:'Stakeholders', admin:'Admin panel', profile:'My profile',
    'risk-map':'Risk map', history:'History', mitigations:'Mitigations',
    idp:'IDP Linkage', reports:'Reports'
  };
  setEl('tb-crumb', crumbs[pageId] || pageId);

  loadPageModule(pageId);
}

async function loadPageModule(pageId) {
  try {
    switch(pageId) {
      case 'dashboard':    { const m = await import('./dashboard.js');    m.initDashboard(_user);    break; }
      case 'community':    { const m = await import('./community.js');    m.initCommunity(_user);    break; }
      case 'routes':       { const m = await import('./routes.js');       m.initRoutes(_user);       break; }
      case 'sitrep':       { const m = await import('./sitrep.js');       m.initSitrep(_user);       break; }
      case 'mopup':        { const m = await import('./mopup.js');        m.initMopup(_user);        break; }
      case 'stakeholders': { const m = await import('./stakeholders.js'); m.initStakeholders(_user); break; }
      case 'hvc':          { const m = await import('./hvc.js');          m.initHVC(_user);          break; }
      case 'admin':        { const m = await import('./admin.js');        m.initAdmin(_user);        break; }
      case 'profile':      { const m = await import('./profile.js');      m.initProfile(_user);      break; }
    }
  } catch(e) { console.warn('Page module load failed:', pageId, e); }
}

// ── RAIL ──────────────────────────────────────────────────
function initRail() {
  const rail   = document.getElementById('rail');
  const chevron = document.getElementById('rail-chevron');

  function toggleRail() {
    rail?.classList.toggle('open');
    if (chevron) chevron.style.transform = rail?.classList.contains('open') ? 'scaleX(-1)' : '';
  }

  document.getElementById('rail-expand-btn')?.addEventListener('click', toggleRail);
  document.querySelector('.rail-brand')?.addEventListener('click', toggleRail);
}

// ── FOOTER ────────────────────────────────────────────────
function initFooter() {
  document.getElementById('footer-theme-btn')?.addEventListener('click', toggleTheme);
  document.getElementById('rail-theme-btn')?.addEventListener('click',   toggleTheme);
  document.getElementById('footer-signout')?.addEventListener('click',   signOut);

  // Profile link in footer
  document.getElementById('footer-profile-btn')?.addEventListener('click', () => navigateTo('profile'));
  document.getElementById('user-av')?.addEventListener('click', () => navigateTo('profile'));
  document.getElementById('user-info-wrap')?.addEventListener('click', () => navigateTo('profile'));
}

// ── THEME ─────────────────────────────────────────────────
export function toggleTheme() {
  _theme = _theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('drmsa-theme', _theme);
  applyTheme(_theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  const lbl = isDark ? 'Light mode' : 'Dark mode';
  setEl('footer-theme-lbl', lbl);
  setEl('rail-theme-lbl', lbl);
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
    let alert = null;

    if (provider === 'openweathermap') {
      const res  = await fetch(`https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lng}&exclude=minutely,hourly,daily&appid=${key}`);
      const data = await res.json();
      if (data.alerts?.length) {
        alert = `${data.alerts[0].event} — ${data.alerts[0].description?.slice(0,120)}`;
      }
    } else if (provider === 'weatherapi') {
      const res  = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${key}&q=${lat},${lng}&alerts=yes`);
      const data = await res.json();
      if (data.alerts?.alert?.length) {
        alert = `${data.alerts.alert[0].headline || data.alerts.alert[0].event}`;
      }
    } else if (provider === 'tomorrow') {
      const res  = await fetch(`https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lng}&apikey=${key}`);
      const data = await res.json();
      // Tomorrow.io free tier doesn't include alert layer — show nothing
    }

    if (alert && bar && desc) {
      bar.style.display = 'flex';
      desc.textContent = alert;
    } else if (bar) {
      bar.style.display = 'none';
    }
  } catch(e) {
    if (bar) bar.style.display = 'none';
    console.warn('Weather fetch failed:', e);
  }

  document.getElementById('saws-dismiss')?.addEventListener('click', () => {
    if (bar) bar.style.display = 'none';
  });
}

// ── HELPERS ───────────────────────────────────────────────
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

export function getUser() { return _user; }
