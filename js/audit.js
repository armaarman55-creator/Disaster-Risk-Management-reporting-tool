// js/auth.js
import { supabase, getCurrentUser } from './supabase.js';
import { initApp } from './app.js';

export async function initAuth() {
  // Check existing session
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const user = await getCurrentUser();
    if (user) { hideAuth(); await initApp(user); return; }
  }

  await loadMunicipalities();
  bindTabSwitching();
  bindRoleCards();
  bindPasswordToggles();
  bindSignIn();
  bindRegister();
  bindForgotPassword();
  bindGuestLogin();

  // Switch to register if link clicked
  document.getElementById('switch-to-register')?.addEventListener('click', () => {
    showPanel('register');
  });
  document.getElementById('switch-to-login')?.addEventListener('click', () => {
    showPanel('login');
  });
  document.getElementById('switch-to-reset')?.addEventListener('click', () => {
    showPanel('reset');
  });
}

// ── MUNICIPALITIES ─────────────────────────────────────────
async function loadMunicipalities() {
  const sel = document.getElementById('reg-muni');
  if (!sel) return;

  sel.innerHTML = '<option value="">Loading…</option>';

  const { data, error } = await supabase
    .from('municipalities')
    .select('id, name, code, district')
    .order('name');

  if (error || !data?.length) {
    sel.innerHTML = '<option value="">— No municipalities found —</option>';
    return;
  }

  // Group by district
  const grouped = {};
  data.forEach(m => {
    const d = m.district || 'Other';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(m);
  });

  sel.innerHTML = '<option value="">— Select your municipality —</option>' +
    Object.entries(grouped).map(([district, munis]) =>
      `<optgroup label="${district}">${munis.map(m =>
        `<option value="${m.id}">${m.name} (${m.code})</option>`
      ).join('')}</optgroup>`
    ).join('');
}

// ── PANEL SWITCHING ────────────────────────────────────────
function showPanel(name) {
  document.getElementById('panel-login')?.classList.add('hidden');
  document.getElementById('panel-register')?.classList.add('hidden');
  document.getElementById('panel-reset')?.classList.add('hidden');
  document.getElementById(`panel-${name}`)?.classList.remove('hidden');

  // Sync tab styling
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('on', t.dataset.tab === name);
  });
}

function bindTabSwitching() {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => showPanel(tab.dataset.tab));
  });
}

// ── ROLE CARDS ─────────────────────────────────────────────
function bindRoleCards() {
  document.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });
}

// ── PASSWORD TOGGLES ───────────────────────────────────────
function bindPasswordToggles() {
  document.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      if (!input) return;
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.innerHTML = isText ? eyeIcon() : eyeOffIcon();
    });
  });
}

function eyeIcon() {
  return `<svg viewBox="0 0 16 16"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>`;
}
function eyeOffIcon() {
  return `<svg viewBox="0 0 16 16"><path d="M2 2l12 12M6.7 6.7A2 2 0 0 0 9.3 9.3M3.4 3.4C2.1 4.5 1 6 1 8s2.5 5 7 5c1.5 0 2.9-.4 4-.9M6 3.2C6.6 3.1 7.3 3 8 3c4.5 0 7 5 7 5s-.7 1.4-2 2.6"/></svg>`;
}

// ── SIGN IN ────────────────────────────────────────────────
function bindSignIn() {
  document.getElementById('btn-signin')?.addEventListener('click', async () => {
    const email    = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-pass')?.value;
    const errEl    = document.getElementById('signin-error');
    const btn      = document.getElementById('btn-signin');

    if (!email || !password) { showError(errEl, 'Please enter your email and password.'); return; }

    btn.textContent = 'Signing in…'; btn.disabled = true;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showError(errEl, error.message === 'Invalid login credentials'
        ? 'Incorrect email or password.'
        : error.message);
      btn.textContent = 'Sign in'; btn.disabled = false;
      return;
    }

    const user = await getCurrentUser();
    if (user?.status === 'pending') {
      await supabase.auth.signOut();
      showError(errEl, 'Your account is pending approval by your Municipal Disaster Officer.');
      btn.textContent = 'Sign in'; btn.disabled = false;
      return;
    }

    hideAuth();
    await initApp(user);
  });

  // Enter key on password field
  document.getElementById('login-pass')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-signin')?.click();
  });
}

// ── GUEST LOGIN ────────────────────────────────────────────
function bindGuestLogin() {
  document.getElementById('btn-guest')?.addEventListener('click', async () => {
    window._guestMode = true;
    hideAuth();
    await initApp({
      role: 'viewer',
      full_name: 'Guest',
      municipalities: { name: 'Demo View', code: 'DEMO', ward_count: 0 }
    });
  });
}

// ── REGISTER ───────────────────────────────────────────────
function bindRegister() {
  document.getElementById('btn-register')?.addEventListener('click', async () => {
    const email     = document.getElementById('reg-email')?.value.trim();
    const password  = document.getElementById('reg-pass')?.value;
    const confirm   = document.getElementById('reg-confirm')?.value;
    const firstName = document.getElementById('reg-first')?.value.trim();
    const lastName  = document.getElementById('reg-last')?.value.trim();
    const muniId    = document.getElementById('reg-muni')?.value;
    const role      = document.querySelector('.role-card.selected')?.dataset.role || 'viewer';
    const errEl     = document.getElementById('reg-error');
    const btn       = document.getElementById('btn-register');

    if (!firstName || !lastName)  { showError(errEl, 'Please enter your first and last name.'); return; }
    if (!email)                   { showError(errEl, 'Please enter your work email address.'); return; }
    if (!muniId)                  { showError(errEl, 'Please select your municipality.'); return; }
    if (!password)                { showError(errEl, 'Please choose a password.'); return; }
    if (password.length < 8)      { showError(errEl, 'Password must be at least 8 characters.'); return; }
    if (password !== confirm)     { showError(errEl, 'Passwords do not match.'); return; }

    btn.textContent = 'Submitting…'; btn.disabled = true;

    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: {
          full_name: `${firstName} ${lastName}`,
          municipality_id: muniId,
          role,
          status: 'pending'
        }
      }
    });

    if (error) {
      showError(errEl, error.message);
      btn.textContent = 'Submit registration'; btn.disabled = false;
      return;
    }

    // Check actual profile status the trigger assigned
    await new Promise(r => setTimeout(r, 1200)); // allow trigger to complete
    const { data: { user: newUser } } = await supabase.auth.getUser();
    let isActive = false;
    if (newUser) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('status, role')
        .eq('id', newUser.id)
        .single();
      isActive = profile?.status === 'active';
    }

    // Show success state — message depends on whether they were auto-activated
    document.getElementById('panel-register').innerHTML = `
      <div style="text-align:center;padding:20px 0">
        <div style="width:52px;height:52px;background:var(--green-dim);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px">
          ${isActive ? 'Account activated!' : 'Registration submitted'}
        </div>
        <div style="font-size:13px;color:var(--text3);line-height:1.7;margin-bottom:20px">
          ${isActive
            ? 'You are the first user for your municipality and have been automatically activated as Disaster Officer.<br>You can sign in now.'
            : 'Your account is pending approval by your Municipal Disaster Officer.<br>You\'ll receive an email when your account is activated.'
          }
        </div>
        <button class="auth-btn auth-btn-secondary" style="max-width:200px;margin:0 auto" onclick="document.getElementById('switch-to-login').click()">
          ${isActive ? 'Sign in now →' : 'Back to sign in'}
        </button>
      </div>`;
  });
}

// ── FORGOT PASSWORD ────────────────────────────────────────
function bindForgotPassword() {
  document.getElementById('btn-reset')?.addEventListener('click', async () => {
    const email = document.getElementById('reset-email')?.value.trim();
    const errEl = document.getElementById('reset-error');
    const msgEl = document.getElementById('reset-msg');
    const btn   = document.getElementById('btn-reset');

    if (!email) { showError(errEl, 'Please enter your email address.'); return; }

    btn.textContent = 'Sending…'; btn.disabled = true;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?reset=1`
    });

    if (error) {
      showError(errEl, error.message);
      btn.textContent = 'Send reset link'; btn.disabled = false;
      return;
    }

    if (msgEl) { msgEl.classList.add('show'); }
    btn.textContent = 'Reset link sent'; btn.disabled = true;
  });
}

// ── HELPERS ────────────────────────────────────────────────
function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 6000);
}

function hideAuth() {
  const s = document.getElementById('auth-screen');
  if (s) { s.style.opacity = '0'; setTimeout(() => s.classList.add('hidden'), 300); }
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.reload();
}
