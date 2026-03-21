// js/profile.js
import { supabase } from './supabase.js';

let _user = null;

export async function initProfile(user) {
  _user = user;
  const page = document.getElementById('page-profile');
  if (!page) return;

  // Re-fetch user in case it was null when app loaded
  if (!_user || !_user.id) {
    const { supabase } = await import('./supabase.js');
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*, municipalities(name, code, district, ward_count)')
        .eq('id', authUser.id)
        .single();
      _user = profile || { id: authUser.id, email: authUser.email };
      _user.email = authUser.email;
    }
  }

  if (!_user) {
    page.innerHTML = '<div style="padding:40px;color:var(--red);font-size:13px">Could not load your profile. Please sign out and sign back in.</div>';
    return;
  }

  await renderProfile(page);
}

async function renderProfile(page) {
  const { data: munis } = await supabase.from('municipalities').select('id,name,code,district').order('name');

  const grouped = {};
  (munis||[]).forEach(m => { const d=m.district||'Other'; if(!grouped[d]) grouped[d]=[]; grouped[d].push(m); });

  const muniOptions = Object.entries(grouped).map(([d,ms]) =>
    `<optgroup label="${d}">${ms.map(m=>`<option value="${m.id}" ${m.id===_user.municipality_id?'selected':''}>${m.name} (${m.code})</option>`).join('')}</optgroup>`
  ).join('');

  const nameParts = (_user.full_name||'').split(' ');
  const firstName = nameParts[0]||'';
  const lastName  = nameParts.slice(1).join(' ')||'';

  page.innerHTML = `
    <div style="padding:22px;flex:1;overflow-y:auto">
      <div class="sec-hdr"><div><div class="sec-hdr-title">My profile</div><div class="sec-hdr-sub">Update your details, municipality and password</div></div></div>
      <div style="max-width:560px">

        <div class="panel" style="margin-bottom:16px">
          <div class="ph"><div class="ph-title">Personal details</div></div>
          <div class="pb">
            <div id="profile-error" class="auth-error"></div>
            <div class="frow">
              <div class="fl"><span class="fl-label">First name</span><input class="fl-input" id="p-first" value="${firstName}"/></div>
              <div class="fl"><span class="fl-label">Last name</span><input class="fl-input" id="p-last" value="${lastName}"/></div>
            </div>
            <div class="fl"><span class="fl-label">Email</span><div class="fl-ro">${_user.email||'—'}</div></div>
            <div class="fl"><span class="fl-label">Role <span style="color:var(--text3);font-size:10px">(set by admin)</span></span><div class="fl-ro">${roleLabel(_user.role)}</div></div>
            <div class="fl">
              <span class="fl-label">Municipality</span>
              <select class="fl-sel" id="p-muni">
                <option value="">— Select municipality —</option>
                ${muniOptions}
              </select>
            </div>
            <button class="btn btn-green btn-sm" id="save-profile-btn" style="margin-top:8px">Save profile</button>
          </div>
        </div>

        <div class="panel">
          <div class="ph"><div class="ph-title">Change password</div></div>
          <div class="pb">
            <div id="pw-error" class="auth-error"></div>
            <div id="pw-success" class="auth-reset-msg"></div>
            <div class="fl">
              <span class="fl-label">New password</span>
              <div class="pw-wrap">
                <input class="fl-input" type="password" id="p-newpw" placeholder="Min 8 characters"/>
                <button class="pw-toggle" type="button" onclick="togglePw('p-newpw',this)">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>
                </button>
              </div>
            </div>
            <div class="fl">
              <span class="fl-label">Confirm new password</span>
              <div class="pw-wrap">
                <input class="fl-input" type="password" id="p-confirmpw" placeholder="Repeat password"/>
                <button class="pw-toggle" type="button" onclick="togglePw('p-confirmpw',this)">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>
                </button>
              </div>
            </div>
            <button class="btn btn-sm" id="save-pw-btn" style="margin-top:8px">Update password</button>
          </div>
        </div>

      </div>
    </div>`;

  document.getElementById('save-profile-btn')?.addEventListener('click', saveProfile);
  document.getElementById('save-pw-btn')?.addEventListener('click', savePassword);
}

async function saveProfile() {
  const first  = document.getElementById('p-first')?.value.trim();
  const last   = document.getElementById('p-last')?.value.trim();
  const muniId = document.getElementById('p-muni')?.value;
  const errEl  = document.getElementById('profile-error');
  if (!first || !last) { showErr(errEl,'Please enter your first and last name.'); return; }

  const { error } = await supabase.from('user_profiles').update({
    full_name: `${first} ${last}`,
    municipality_id: muniId || _user.municipality_id
  }).eq('id', _user.id);

  if (error) { showErr(errEl, error.message); return; }
  document.getElementById('user-av')?.textContent !== undefined && (document.getElementById('user-av').textContent = `${first[0]}${last[0]||''}`.toUpperCase());
  document.getElementById('user-name-disp') && (document.getElementById('user-name-disp').textContent = `${first} ${last}`);
  showToast('Profile saved — reload to see all changes');
}

async function savePassword() {
  const pw      = document.getElementById('p-newpw')?.value;
  const confirm = document.getElementById('p-confirmpw')?.value;
  const errEl   = document.getElementById('pw-error');
  const sucEl   = document.getElementById('pw-success');
  if (!pw || pw.length < 8) { showErr(errEl,'Password must be at least 8 characters.'); return; }
  if (pw !== confirm) { showErr(errEl,'Passwords do not match.'); return; }
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) { showErr(errEl, error.message); return; }
  sucEl.textContent = '✓ Password updated successfully.'; sucEl.classList.add('show');
  document.getElementById('p-newpw').value = '';
  document.getElementById('p-confirmpw').value = '';
}

window.togglePw = function(id, btn) {
  const inp = document.getElementById(id);
  if (!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.querySelector('svg').style.opacity = show ? '1' : '0.4';
};

function roleLabel(r) {
  return { admin:'Admin', disaster_officer:'Disaster Officer', planner:'IDP Planner', viewer:'Viewer' }[r] || r || '—';
}

function showErr(el, msg) {
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'), 5000);
}

function showToast(msg, isError=false) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:${isError?'var(--red-dim)':'var(--green-dim)'};border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:10px 16px;border-radius:6px;font-size:12px;font-family:monospace;font-weight:700;z-index:500`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},2500);
}
