// js/auth.js
import { supabase, getCurrentUser } from './supabase.js';
import { initApp } from './app.js';

export async function initAuth() {
  const screen = document.getElementById('auth-screen');
  if (!screen) return;

  // Check existing session
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const user = await getCurrentUser();
    if (user) { hideAuth(); await initApp(user); return; }
  }

  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      const isLogin = tab.dataset.tab === 'login';
      document.getElementById('signin-form').classList.toggle('hidden', !isLogin);
      document.getElementById('register-form').classList.toggle('hidden', isLogin);
    });
  });

  // Role card selection
  document.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });

  // Sign in
  document.getElementById('btn-signin')?.addEventListener('click', handleSignIn);
  document.getElementById('btn-guest')?.addEventListener('click', handleGuestLogin);

  // Register
  document.getElementById('btn-register')?.addEventListener('click', handleRegister);
}

async function handleSignIn() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl = document.getElementById('signin-error');
  const btn = document.getElementById('btn-signin');

  if (!email || !password) { showError(errEl, 'Please enter your email and password.'); return; }
  btn.textContent = 'Signing in…'; btn.disabled = true;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { showError(errEl, error.message); btn.textContent = 'Sign in'; btn.disabled = false; return; }

  const user = await getCurrentUser();
  hideAuth();
  await initApp(user);
}

async function handleGuestLogin() {
  // Guest uses a read-only anonymous session scoped to a public municipality view
  window._guestMode = true;
  hideAuth();
  await initApp({ role: 'viewer', full_name: 'Guest', municipalities: { name: 'Demo View', code: 'DEMO', ward_count: 0 } });
}

async function handleRegister() {
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-pass').value;
  const confirm = document.getElementById('reg-confirm').value;
  const firstName = document.getElementById('reg-first').value.trim();
  const lastName = document.getElementById('reg-last').value.trim();
  const muniId = document.getElementById('reg-muni').value;
  const role = document.querySelector('.role-card.selected')?.dataset.role || 'viewer';
  const errEl = document.getElementById('reg-error');
  const btn = document.getElementById('btn-register');

  if (!email || !password || !firstName || !lastName || !muniId) {
    showError(errEl, 'Please fill in all required fields.'); return;
  }
  if (password !== confirm) { showError(errEl, 'Passwords do not match.'); return; }
  if (password.length < 8) { showError(errEl, 'Password must be at least 8 characters.'); return; }

  btn.textContent = 'Submitting…'; btn.disabled = true;

  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: {
      data: { full_name: `${firstName} ${lastName}`, municipality_id: muniId, role, status: 'pending' }
    }
  });

  if (error) { showError(errEl, error.message); btn.textContent = 'Submit registration'; btn.disabled = false; return; }

  // Show pending approval message
  document.getElementById('register-form').innerHTML = `
    <div style="text-align:center;padding:20px 0">
      <div style="font-size:32px;margin-bottom:12px">✓</div>
      <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:var(--text);margin-bottom:8px">Registration submitted</div>
      <div style="font-size:13px;color:var(--text3);line-height:1.7">Your account is pending approval by your Municipal Disaster Officer.<br>You'll receive an email when your account is activated.</div>
    </div>`;
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 5000);
}

function hideAuth() {
  const s = document.getElementById('auth-screen');
  if (s) { s.style.opacity = '0'; setTimeout(() => s.classList.add('hidden'), 300); }
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.reload();
}
