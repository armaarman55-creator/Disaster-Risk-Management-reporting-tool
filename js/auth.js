// js/auth.js
import { supabase, getCurrentUser } from './supabase.js';
import { initApp } from './app.js';

export async function initAuth() {
  // ── INTERCEPT PASSWORD RESET LINK ────────────────────────
  const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
  const queryParams = new URLSearchParams(window.location.search);
  const isRecovery = hashParams.get('type') === 'recovery' ||
                     queryParams.get('type') === 'recovery';

  if (isRecovery) {
    history.replaceState(null, '', window.location.pathname);
    showResetPasswordScreen();
    return;
  }

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
      const msg = error.message === 'Invalid login credentials'
        ? 'Incorrect email or password. If you just registered, please check your inbox and confirm your email first.'
        : error.message;
      showError(errEl, msg);
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

    document.getElementById('panel-register').innerHTML = `...`;
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

// ── PASSWORD RESET SCREEN ──────────────────────────────────
function showResetPasswordScreen() {
  const authScreen = document.getElementById('auth-screen');
  if (!authScreen) return;
  authScreen.style.display = 'flex';
  authScreen.style.opacity = '1';

  const left = authScreen.querySelector('.auth-left');
  if (!left) return;

  left.innerHTML = `
    <div class="auth-heading">Set new password</div>
    <div class="auth-sub">Choose a new password for your account.</div>
    <div class="auth-error" id="newpw-error"></div>
    <div class="field-group">
      <input class="field-input" type="password" id="newpw-input" placeholder="New password"/>
    </div>
    <div class="field-group">
      <input class="field-input" type="password" id="newpw-confirm" placeholder="Confirm password"/>
    </div>
    <button class="auth-btn auth-btn-primary" id="newpw-btn">Set new password</button>
  `;

  document.getElementById('newpw-btn')?.addEventListener('click', async () => {
    const pw = document.getElementById('newpw-input')?.value;
    const confirm = document.getElementById('newpw-confirm')?.value;
    const errEl = document.getElementById('newpw-error');

    if (!pw || pw.length < 8) { showError(errEl, 'Password must be at least 8 characters.'); return; }
    if (pw !== confirm) { showError(errEl, 'Passwords do not match.'); return; }

    const { error } = await supabase.auth.updateUser({ password: pw });

    if (error) {
      showError(errEl, error.message);
      return;
    }

    window.location.replace(window.location.pathname);
  });
}

// ── FIXED showError ────────────────────────────────────────
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
  // Remove only the Supabase session token — preserve theme + weather settings
  Object.keys(localStorage)
    .filter(k => k.startsWith('sb-'))
    .forEach(k => localStorage.removeItem(k));

  window.location.replace(window.location.pathname);
  supabase.auth.signOut().catch(console.error);
}
