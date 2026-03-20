// js/app.js
import { signOut } from './auth.js';
import { supabase } from './supabase.js';

let _user = null;
let _theme = localStorage.getItem('drmsa-theme') || 'dark';

export async function initApp(user) {
  _user = user;
  applyTheme(_theme);
  document.getElementById('app-screen').classList.add('visible');
  populateUserUI(user);
  initNav();
  initTopbar();
  initFooter();

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
  const initials = user?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2) || 'U';
  const el = document.getElementById('user-av');
  const nm = document.getElementById('user-name-disp');
  const rl = document.getElementById('user-role-disp');
  const ab = document.getElementById('muni-abbr');
  const wd = document.getElementById('muni-wards-disp');
  const dd = document.getElementById('muni-dist-disp');
  const tb = document.getElementById('tb-page-title');

  if (el) el.textContent = initials;
  if (nm) nm.textContent = user?.full_name || 'User';
  if (rl) rl.textContent = formatRole(user?.role);
  if (user?.municipalities) {
    const m = user.municipalities;
    if (ab) ab.textContent = m.code?.slice(-2) || '??';
    if (wd) wd.textContent = `${m.ward_count || '?'} wards · ${m.code || ''}`;
    if (dd) dd.textContent = m.district || '';
    if (tb) tb.textContent = m.name || 'Dashboard';
  }
}

function formatRole(role) {
  const map = { admin: 'Administrator', disaster_officer: 'Disaster Officer', viewer: 'Viewer', planner: 'IDP Planner' };
  return map[role] || role || 'User';
}

function initNav() {
  document.querySelectorAll('.ni').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (!page) return;
      navigateTo(page, item);
    });
  });

  // Rail expand/collapse
  document.getElementById('rail-expand-btn')?.addEventListener('click', toggleRail);
  document.querySelector('.rail-brand')?.addEventListener('click', toggleRail);
}

export function navigateTo(pageId, navItem) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('visible'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('visible');

  document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
  if (navItem) navItem.classList.add('on');
  else {
    const matching = document.querySelector(`.ni[data-page="${pageId}"]`);
    if (matching) matching.classList.add('on');
  }

  const crumbs = {
    dashboard: 'Dashboard', 'risk-map': 'Risk map', hvc: 'HVC Assessment Tool',
    history: 'Assessment history', mitigations: 'Mitigations', idp: 'IDP Linkage',
    community: 'Shelters & relief', routes: 'Routes & closures',
    sitrep: 'Situation Report', mopup: 'Mop-up Report',
    stakeholders: 'Stakeholder directory', reports: 'Reports'
  };
  const crumbEl = document.getElementById('tb-crumb');
  if (crumbEl) crumbEl.textContent = crumbs[pageId] || pageId;

  // Lazy-load page modules
  loadPageModule(pageId);
}

async function loadPageModule(pageId) {
  try {
    switch (pageId) {
      case 'dashboard': { const m = await import('./dashboard.js'); m.initDashboard(_user); break; }
      case 'community': { const m = await import('./community.js'); m.initCommunity(_user); break; }
      case 'routes':    { const m = await import('./routes.js'); m.initRoutes(_user); break; }
      case 'sitrep':    { const m = await import('./sitrep.js'); m.initSitrep(_user); break; }
      case 'mopup':     { const m = await import('./mopup.js'); m.initMopup(_user); break; }
      case 'stakeholders': { const m = await import('./stakeholders.js'); m.initStakeholders(_user); break; }
      case 'hvc':       { const m = await import('./hvc.js'); m.initHVC(_user); break; }
    }
  } catch (e) { console.warn('Page module load failed:', e); }
}

function initTopbar() {
  document.getElementById('btn-new-assessment')?.addEventListener('click', () => navigateTo('hvc'));
}

function initFooter() {
  document.getElementById('footer-theme-btn')?.addEventListener('click', toggleTheme);
  document.getElementById('rail-theme-btn')?.addEventListener('click', toggleTheme);
  document.getElementById('footer-signout')?.addEventListener('click', signOut);
}

export function toggleTheme() {
  _theme = _theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('drmsa-theme', _theme);
  applyTheme(_theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  const sunIcon = `<circle cx="7" cy="7" r="3"/><path d="M7 1v1M7 12v1M1 7h1M12 7h1M3 3l.7.7M10.3 10.3l.7.7M10.3 3.7L11 3M3 10.3l-.7.7"/>`;
  const moonIcon = `<path d="M10.5 7A4.5 4.5 0 015 1.5a.5.5 0 00-.5-.5A5.5 5.5 0 1010.5 7z"/>`;
  const icon = isDark ? sunIcon : moonIcon;
  const label = isDark ? 'Light mode' : 'Dark mode';
  ['footer-theme-icon', 'rail-theme-icon'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = icon;
  });
  ['footer-theme-lbl', 'rail-theme-lbl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
}

function toggleRail() {
  document.getElementById('rail')?.classList.toggle('open');
}

export function getUser() { return _user; }
