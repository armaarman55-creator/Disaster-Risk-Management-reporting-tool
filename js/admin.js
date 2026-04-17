// js/admin.js
import { supabase } from './supabase.js';
import { writeAudit } from './audit.js';

let _user = null;

function roleLabel(role) {
  switch(role) {
    case 'admin': return 'Administrator';
    case 'disaster_officer': return 'Disaster Officer';
    case 'planner': return 'Planner';
    case 'viewer': return 'Viewer';
    default: return 'User';
  }
}

function initials(name) {
  return (name||'?').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
}

export async function initAdmin(user) {
  _user = user;
  const page = document.getElementById('page-admin');
  if (!page) return;
  renderAdmin(page);
}

async function renderAdmin(page) {
  page.innerHTML = `
    <div style="padding:22px;flex:1;overflow-y:auto">
      <div class="sec-hdr">
        <div><div class="sec-hdr-title">Disaster Admin Panel</div>
        <div class="sec-hdr-sub">${_user?.municipalities?.name || ''} · User management & settings</div></div>
      </div>
      <div style="background:var(--blue-dim);border:1px solid rgba(88,166,255,.2);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--text2);line-height:1.7;margin-bottom:16px">
        You are managing <strong style="color:var(--text)">${_user?.municipalities?.name || 'your municipality'}</strong>.
        All users and settings are scoped to your municipality only.
        ${_user?.role === 'admin' ? ' <span style="color:var(--amber);font-weight:600">· System Admin: platform-wide access enabled.</span>' : ''}
      </div>
      <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:18px">
        <div>
          <div class="panel" style="margin-bottom:16px">
            <div class="ph">
              <div><div class="ph-title">Users</div><div class="ph-sub" id="users-count">Loading…</div></div>
              <button class="btn btn-sm btn-green" id="invite-btn">+ Invite user</button>
            </div>
            <div id="invite-form-area"></div>
            <div class="pb" id="users-list">Loading…</div>
          </div>
          <div class="panel">
            <div class="ph"><div class="ph-title">API integrations</div><div class="ph-sub">External data</div></div>
            <div class="pb" id="api-settings">Loading…</div>
          </div>
        </div>
        <div>
          <div class="panel" style="margin-bottom:16px">
            <div class="ph"><div class="ph-title">Municipality settings</div></div>
            <div class="pb" id="muni-settings">Loading…</div>
          </div>
          <div class="panel" style="margin-bottom:16px">
            <div class="ph"><div class="ph-title">Organisation logos</div><div class="ph-sub">Displayed on downloaded forms</div></div>
            <div class="pb" id="logo-settings">Loading…</div>
          </div>
          <div class="panel">
            <div class="ph"><div class="ph-title">Feedback</div><div class="ph-sub">Send platform feedback to support</div></div>
            <div class="pb" id="feedback-settings">
              <div style="font-size:12px;color:var(--text2);line-height:1.7">
                For feedback and support, email:
                <a href="mailto:support@getdiswayne.com" style="color:var(--blue);font-weight:700">support@getdiswayne.com</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Audit trail section -->
      <div class="panel" style="margin-top:20px">
        <div class="ph" style="cursor:pointer;user-select:none" id="audit-toggle-header">
          <div>
            <div class="ph-title">Audit trail</div>
            <div class="ph-sub">All user actions — who changed what and when</div>
          </div>
          <span id="audit-toggle-icon" style="font-size:18px;color:var(--text3)">▸</span>
        </div>
        <div id="audit-trail-body" style="display:none;padding:16px"></div>
      </div>
    </div>`;

  await loadUsers();
  await loadMuniSettings();
  await loadLogoSettings();

  document.getElementById('audit-toggle-header')?.addEventListener('click', async () => {
    const body = document.getElementById('audit-trail-body');
    const icon = document.getElementById('audit-toggle-icon');
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.textContent = isOpen ? '▸' : '▾';
    if (!isOpen && body.innerHTML.trim() === '') {
      await loadAuditTrail(body);
    }
  });
  loadApiSettings();
  document.getElementById('invite-btn')?.addEventListener('click', showInviteForm);
}

// ── LOGO SETTINGS ──────────────────────────────────────────
async function loadLogoSettings() {
  const el = document.getElementById('logo-settings');
  if (!el) return;

  const { data: muni } = await supabase
    .from('municipalities')
    .select('logo_main_url, logo_dm_url, logo_display_mode')
    .eq('id', _user.municipality_id)
    .single();

  const logoMain = muni?.logo_main_url || '';
  const logoDM   = muni?.logo_dm_url   || '';
  const mode     = muni?.logo_display_mode || 'main'; // 'main' | 'dm' | 'both'

  el.innerHTML = `
    <div style="font-size:11px;color:var(--text3);margin-bottom:12px;line-height:1.6">
      Upload logos for your organisation and disaster management unit. Choose which appear on downloaded stakeholder forms.
      Accepted formats: PNG or JPEG, max 2 MB each.
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
      <!-- Main org logo -->
      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text3);margin-bottom:6px">Main organisation logo</div>
        <div id="logo-main-preview" style="width:100%;height:72px;background:var(--bg3);border:1px dashed var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:6px">
          ${logoMain
            ? `<img src="${logoMain}" style="max-height:64px;max-width:100%;object-fit:contain"/>`
            : `<span style="font-size:11px;color:var(--text3)">No logo uploaded</span>`}
        </div>
        <input type="file" id="logo-main-file" accept="image/png,image/jpeg" style="display:none"/>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm" id="logo-main-pick">Upload PNG/JPEG</button>
          ${logoMain ? `<button class="btn btn-sm btn-red" id="logo-main-clear">Remove</button>` : ''}
        </div>
        <div id="logo-main-status" style="font-size:11px;color:var(--text3);margin-top:4px"></div>
      </div>

      <!-- DM logo -->
      <div>
        <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text3);margin-bottom:6px">Disaster Management logo</div>
        <div id="logo-dm-preview" style="width:100%;height:72px;background:var(--bg3);border:1px dashed var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:6px">
          ${logoDM
            ? `<img src="${logoDM}" style="max-height:64px;max-width:100%;object-fit:contain"/>`
            : `<span style="font-size:11px;color:var(--text3)">No logo uploaded</span>`}
        </div>
        <input type="file" id="logo-dm-file" accept="image/png,image/jpeg" style="display:none"/>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm" id="logo-dm-pick">Upload PNG/JPEG</button>
          ${logoDM ? `<button class="btn btn-sm btn-red" id="logo-dm-clear">Remove</button>` : ''}
        </div>
        <div id="logo-dm-status" style="font-size:11px;color:var(--text3);margin-top:4px"></div>
      </div>
    </div>

    <!-- Display mode -->
    <div style="padding-top:12px;border-top:1px solid var(--border);margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">Show on stakeholder download form</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text2)">
          <input type="radio" name="logo-mode" value="main"  ${mode==='main' ?'checked':''} style="accent-color:var(--blue)"/> Main organisation logo only
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text2)">
          <input type="radio" name="logo-mode" value="dm"    ${mode==='dm'   ?'checked':''} style="accent-color:var(--blue)"/> Disaster Management logo only
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text2)">
          <input type="radio" name="logo-mode" value="both"  ${mode==='both' ?'checked':''} style="accent-color:var(--blue)"/> Both logos
        </label>
      </div>
      <button class="btn btn-green btn-sm" id="save-logo-mode-btn" style="margin-top:10px">Save display preference</button>
    </div>`;

  // Wire upload buttons
  document.getElementById('logo-main-pick')?.addEventListener('click', () => document.getElementById('logo-main-file').click());
  document.getElementById('logo-dm-pick')?.addEventListener('click',   () => document.getElementById('logo-dm-file').click());

  document.getElementById('logo-main-file')?.addEventListener('change', e => uploadLogo(e.target.files[0], 'main'));
  document.getElementById('logo-dm-file')?.addEventListener('change',   e => uploadLogo(e.target.files[0], 'dm'));

  document.getElementById('logo-main-clear')?.addEventListener('click', () => clearLogo('main'));
  document.getElementById('logo-dm-clear')?.addEventListener('click',   () => clearLogo('dm'));

  document.getElementById('save-logo-mode-btn')?.addEventListener('click', async () => {
    const selected = document.querySelector('input[name="logo-mode"]:checked')?.value || 'main';
    const { error } = await supabase.from('municipalities')
      .update({ logo_display_mode: selected })
      .eq('id', _user.municipality_id);
    if (!error) {
      showToast('✓ Logo display preference saved');
      await writeAudit('update', 'municipality_settings', _user.municipality_id, `Logo display mode set to: ${selected}`);
    } else showToast(error.message, true);
  });
}

async function uploadLogo(file, slot) {
  // slot: 'main' | 'dm'
  if (!file) return;
  const statusEl  = document.getElementById(`logo-${slot}-status`);
  const previewEl = document.getElementById(`logo-${slot}-preview`);

  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    if (statusEl) { statusEl.textContent = 'Only PNG or JPEG accepted.'; statusEl.style.color = 'var(--red)'; }
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    if (statusEl) { statusEl.textContent = 'File too large — max 2 MB.'; statusEl.style.color = 'var(--red)'; }
    return;
  }

  if (statusEl) { statusEl.textContent = 'Uploading…'; statusEl.style.color = 'var(--text3)'; }

  const ext      = file.type === 'image/png' ? 'png' : 'jpg';
  const path     = `logos/${_user.municipality_id}/${slot}.${ext}`;
  const { error: upErr } = await supabase.storage.from('org-logos').upload(path, file, { upsert: true, contentType: file.type });

  if (upErr) {
    if (statusEl) { statusEl.textContent = `Upload failed: ${upErr.message}`; statusEl.style.color = 'var(--red)'; }
    return;
  }

  const { data: urlData } = supabase.storage.from('org-logos').getPublicUrl(path);
  const publicUrl = urlData?.publicUrl;

  const column = slot === 'main' ? 'logo_main_url' : 'logo_dm_url';
  const { error: dbErr } = await supabase.from('municipalities')
    .update({ [column]: publicUrl })
    .eq('id', _user.municipality_id);

  if (dbErr) {
    if (statusEl) { statusEl.textContent = `DB save failed: ${dbErr.message}`; statusEl.style.color = 'var(--red)'; }
    return;
  }

  if (previewEl) previewEl.innerHTML = `<img src="${publicUrl}?t=${Date.now()}" style="max-height:64px;max-width:100%;object-fit:contain"/>`;
  if (statusEl)  { statusEl.textContent = '✓ Logo saved'; statusEl.style.color = 'var(--green)'; }
  await writeAudit('update', 'municipality_settings', _user.municipality_id, `Logo uploaded: ${slot}`);
  showToast(`✓ ${slot === 'main' ? 'Main' : 'Disaster Management'} logo uploaded`);
}

async function clearLogo(slot) {
  const column    = slot === 'main' ? 'logo_main_url' : 'logo_dm_url';
  const previewEl = document.getElementById(`logo-${slot}-preview`);

  const { error } = await supabase.from('municipalities')
    .update({ [column]: null })
    .eq('id', _user.municipality_id);

  if (!error) {
    if (previewEl) previewEl.innerHTML = `<span style="font-size:11px;color:var(--text3)">No logo uploaded</span>`;
    showToast(`✓ Logo removed`);
    await loadLogoSettings(); // re-render to update remove buttons
  } else showToast(error.message, true);
}

// ── USERS ─────────────────────────────────────────────────
async function loadUsers() {
  const listEl  = document.getElementById('users-list');
  const countEl = document.getElementById('users-count');
  if (!listEl) return;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, role, status, created_at')
    .eq('municipality_id', _user.municipality_id)
    .order('created_at');

  if (error) { listEl.innerHTML = `<div style="color:var(--red);font-size:12px">Error: ${error.message}</div>`; return; }

  const users = data || [];
  if (countEl) countEl.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;

  if (!users.length) {
    listEl.innerHTML = `<div style="font-size:12px;color:var(--text3)">No users yet for this municipality.</div>`;
    return;
  }

  listEl.innerHTML = users.map(u => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(48,54,61,.4)">
      <div style="width:30px;height:30px;border-radius:50%;background:var(--bg4);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text3);font-family:monospace;flex-shrink:0">${initials(u.full_name)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text)">${u.full_name || 'Unnamed'}</div>
        <div style="font-size:11px;color:var(--text3);font-family:monospace">${roleLabel(u.role)}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
        <span class="badge ${u.status==='active'?'b-green':u.status==='pending'?'b-amber':'b-gray'}">${(u.status||'?').toUpperCase()}</span>
        ${u.status === 'pending' ? `<button class="btn btn-sm btn-green" onclick="approveUser('${u.id}')">Approve</button>` : ''}
        ${u.id !== _user.id
          ? `<select onchange="changeRole('${u.id}',this.value)" style="font-size:11px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-family:monospace">
              ${(_user.role === 'admin'
              ? ['disaster_officer','planner','viewer','admin']
              : ['disaster_officer','planner','viewer']
            ).map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${roleLabel(r)}</option>`).join('')}
             </select>
             <button class="btn btn-sm btn-red" onclick="suspendUser('${u.id}')">Suspend</button>
             <button class="btn btn-sm" style="border-color:var(--red);color:var(--red)" onclick="removeUser('${u.id}')">Remove</button>`
          : '<span style="font-size:10px;color:var(--text3);font-family:monospace">You</span>'}
      </div>
    </div>`).join('');
}

function showInviteForm() {
  const area = document.getElementById('invite-form-area');
  if (!area) return;
  if (area.innerHTML) { area.innerHTML = ''; return; }
  area.innerHTML = `
    <div style="padding:14px 16px;background:var(--bg3);border-bottom:1px solid var(--border)">
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px;line-height:1.6">
        Invite personnel to access your municipality's instance. Each invited user receives an email with a secure link to set their password.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div class="fl"><span class="fl-label">Full name</span><input class="fl-input" id="inv-name" placeholder="Full name"/></div>
        <div class="fl"><span class="fl-label">Work email</span><input class="fl-input" id="inv-email" type="email" placeholder="email@municipality.gov.za"/></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <select class="fl-sel" id="inv-role" style="flex:1">
          <option value="disaster_officer">Disaster Risk Management Official</option>
          <option value="planner">IDP Planner</option>
          <option value="viewer">Viewer / Read-only</option>
          ${_user?.role === 'admin' ? '<option value="admin">System Admin</option>' : ''}
        </select>
        <button class="btn btn-green btn-sm" id="send-inv-btn">Send invite</button>
        <button class="btn btn-sm" onclick="document.getElementById('invite-form-area').innerHTML=''">Done</button>
      </div>
      <div id="inv-error" style="font-size:12px;color:var(--red);margin-top:6px;display:none"></div>
      <div id="inv-sent-list" style="margin-top:10px"></div>
    </div>`;

  document.getElementById('send-inv-btn')?.addEventListener('click', async () => {
    const email  = document.getElementById('inv-email')?.value.trim();
    const name   = document.getElementById('inv-name')?.value.trim();
    const role   = document.getElementById('inv-role')?.value;
    const errEl  = document.getElementById('inv-error');
    const sentEl = document.getElementById('inv-sent-list');
    const btn    = document.getElementById('send-inv-btn');
    if (!email || !name) { errEl.textContent='Name and email required'; errEl.style.display='block'; return; }

    btn.textContent = 'Sending…'; btn.disabled = true;
    errEl.style.display = 'none';

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      errEl.textContent = 'Your session expired. Please sign in again.';
      errEl.style.display = 'block';
      btn.textContent = 'Send invite'; btn.disabled = false;
      return;
    }

    const resp = await fetch('/api/invite-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        email,
        full_name: name,
        user_role: role,
        municipality_id: _user.municipality_id
      })
    });
    const payload = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      errEl.textContent = payload?.error || 'Failed to send invite';
      errEl.style.display = 'block';
    } else {
      const inviteRoleLabel = { disaster_officer: 'DRMO', planner: 'IDP Planner', viewer: 'Viewer', admin: 'Admin' }[role] || role;
      sentEl.innerHTML += `<div style="font-size:11px;color:var(--green);padding:4px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round"><polyline points="1,5 4,8 9,2"/></svg>
        ${name} &lt;${email}&gt; — ${inviteRoleLabel}
      </div>`;
      document.getElementById('inv-name').value = '';
      document.getElementById('inv-email').value = '';
      const setupNote = payload?.password_setup_email_sent ? ' + password setup email sent' : '';
      showToast(`Invite sent to ${email}${setupNote}`);
      await loadUsers();
    }
    btn.textContent = 'Send invite'; btn.disabled = false;
  });
}

async function loadMuniSettings() {
  const el = document.getElementById('muni-settings');
  if (!el) return;

  const { data: muni } = await supabase.from('municipalities').select('*').eq('id', _user.municipality_id).single();

  if (!muni) {
    el.innerHTML = `<div style="font-size:12px;color:var(--red)">No municipality linked to your account.</div>`;
    return;
  }

  el.innerHTML = `
    <div class="fl"><span class="fl-label">Name</span><input class="fl-input" id="ms-name" value="${muni.name}"/></div>
    <div class="frow">
      <div class="fl"><span class="fl-label">Code</span><input class="fl-input" id="ms-code" value="${muni.code}"/></div>
      <div class="fl"><span class="fl-label">Wards</span><input class="fl-input" type="number" id="ms-wards" value="${muni.ward_count||0}"/></div>
    </div>
    <div class="fl"><span class="fl-label">District</span><input class="fl-input" id="ms-district" value="${muni.district||''}"/></div>
    <div class="fl"><span class="fl-label">Province</span><input class="fl-input" id="ms-province" value="${muni.province||''}"/></div>
    <button class="btn btn-green btn-sm" id="save-ms-btn">Save settings</button>
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);font-family:monospace;margin-bottom:4px">Municipality ID</div>
      <div style="font-size:10px;color:var(--text3);font-family:monospace;word-break:break-all">${muni.id}</div>
    </div>`;

  document.getElementById('save-ms-btn')?.addEventListener('click', async () => {
    const { error } = await supabase.from('municipalities').update({
      name:       document.getElementById('ms-name')?.value,
      code:       document.getElementById('ms-code')?.value,
      ward_count: parseInt(document.getElementById('ms-wards')?.value)||0,
      district:   document.getElementById('ms-district')?.value,
      province:   document.getElementById('ms-province')?.value,
    }).eq('id', _user.municipality_id);
    if (!error) {
      await writeAudit('update','municipality_settings',_user.municipality_id,'Municipality settings updated');
      showToast('✓ Municipality settings saved successfully!');
    } else showToast(error.message, true);
  });
}

function loadApiSettings() {
  const el = document.getElementById('api-settings');
  if (!el) return;

  el.innerHTML = `
    <div style="font-size:12px;color:var(--text2);line-height:1.7;margin-bottom:14px">
      API integration settings are currently unavailable in this module.
    </div>
  `;
}

window.approveUser = async function(id, name) {
  const { error } = await supabase.from('user_profiles').update({ status: 'active' }).eq('id', id);
  if (!error) {
    await writeAudit('approve', 'user', id, `Approved user: ${name||id}`, { status:'pending' }, { status:'active' });
    showToast('✓ User approved successfully!');
  } else showToast(error.message, true);
  loadUsers();
};

window.suspendUser = async function(id, name) {
  if (!confirm('Suspend this user?')) return;
  const { error } = await supabase.from('user_profiles').update({ status: 'suspended' }).eq('id', id);
  if (!error) {
    await writeAudit('suspend', 'user', id, `Suspended user: ${name||id}`, { status:'active' }, { status:'suspended' });
    showToast('✓ User suspended');
  } else showToast(error.message, true);
  loadUsers();
};

window.removeUser = async function(id) {
  if (!confirm('Remove this user permanently? This deletes auth access and profile.')) return;
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) { showToast('Session expired. Please sign in again.', true); return; }

  const resp = await fetch('/api/remove-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ target_user_id: id })
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    showToast(payload?.error || 'Failed to remove user', true);
    return;
  }

  await writeAudit('remove', 'user', id, `Removed user: ${id}`, {}, { removed: true });
  showToast('✓ User removed');
  loadUsers();
};

window.changeRole = async function(id, role, name) {
  const { error } = await supabase.from('user_profiles').update({ role }).eq('id', id);
  if (!error) {
    await writeAudit('role_change', 'user', id, `Changed role to ${role} for: ${name||id}`, {}, { role });
    showToast('✓ Role updated');
  } else showToast(error.message, true);
};

function showToast(msg, isError=false) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:${isError?'var(--red-dim)':'var(--green-dim)'};border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:10px 16px;border-radius:6px;font-size:12px;font-family:monospace;font-weight:700;z-index:500`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},2500);
}

// ── AUDIT TRAIL ──────────────────────────────────────────
async function loadAuditTrail(body) {
  body.innerHTML = '<div style="padding:20px;color:var(--text3);font-size:12px">Loading audit trail…</div>';

  const { data: entries, error } = await supabase
    .from('audit_trail')
    .select('*')
    .eq('municipality_id', _user.municipality_id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    body.innerHTML = `<div style="padding:20px;color:var(--red);font-size:12px">Error loading audit trail: ${error.message}</div>`;
    return;
  }

  const groups = {};
  (entries||[]).forEach(e => {
    const day = new Date(e.created_at).toLocaleDateString('en-ZA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  });

  body.innerHTML = `
    <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:15px;font-weight:700;color:var(--text)">Audit trail</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">All changes made by users in your municipality — last 200 entries</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <select class="fl-sel" id="audit-filter-action" style="font-size:12px;max-width:150px">
          <option value="">All actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="approve">Approve</option>
          <option value="suspend">Suspend</option>
          <option value="role_change">Role change</option>
        </select>
        <select class="fl-sel" id="audit-filter-type" style="font-size:12px;max-width:150px">
          <option value="">All record types</option>
          <option value="user">User</option>
          <option value="hvc_assessment">HVC Assessment</option>
          <option value="shelter">Shelter</option>
          <option value="sitrep">SitRep</option>
          <option value="mitigation">Mitigation</option>
          <option value="road_closure">Road closure</option>
          <option value="relief_op">Relief op</option>
          <option value="stakeholder">Stakeholder</option>
          <option value="municipality_settings">Municipality settings</option>
        </select>
        <button class="btn btn-sm" id="audit-apply-filter">Filter</button>
        <button class="btn btn-sm" id="audit-export-btn">↓ Export CSV</button>
      </div>
    </div>
    <div id="audit-entries">
      ${renderAuditGroups(groups, entries||[])}
    </div>`;

  document.getElementById('audit-apply-filter')?.addEventListener('click', () => {
    const action = document.getElementById('audit-filter-action')?.value;
    const type   = document.getElementById('audit-filter-type')?.value;
    let filtered = entries || [];
    if (action) filtered = filtered.filter(e => e.action === action);
    if (type)   filtered = filtered.filter(e => e.target_type === type);

    const filtGroups = {};
    filtered.forEach(e => {
      const day = new Date(e.created_at).toLocaleDateString('en-ZA', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
      if (!filtGroups[day]) filtGroups[day] = [];
      filtGroups[day].push(e);
    });

    const el = document.getElementById('audit-entries');
    if (el) el.innerHTML = filtered.length
      ? renderAuditGroups(filtGroups, filtered)
      : '<div style="padding:32px;text-align:center;color:var(--text3);font-size:12px">No entries match this filter.</div>';
  });

  document.getElementById('audit-export-btn')?.addEventListener('click', () => exportAuditCSV(entries||[]));
}

function renderAuditGroups(groups, all) {
  if (!all.length) return '<div style="padding:32px;text-align:center;color:var(--text3);font-size:12px">No audit entries yet. Actions will appear here as users make changes.</div>';

  const ACTION_COLOUR = {
    create:'var(--green)',update:'var(--blue)',delete:'var(--red)',
    approve:'var(--green)',suspend:'var(--amber)',role_change:'var(--purple)'
  };
  const ACTION_ICON = { create:'+',update:'✎',delete:'✕',approve:'✓',suspend:'⊘',role_change:'⇄' };

  return Object.entries(groups).map(([day, entries]) => `
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);padding:6px 0;border-bottom:1px solid var(--border);margin-bottom:10px">${day}</div>
      ${entries.map(e => {
        const col  = ACTION_COLOUR[e.action] || 'var(--text3)';
        const icon = ACTION_ICON[e.action]   || '·';
        const time = new Date(e.created_at).toLocaleTimeString('en-ZA', { hour:'2-digit', minute:'2-digit' });
        return `
          <div style="display:flex;gap:12px;align-items:flex-start;padding:9px 0;border-bottom:1px solid rgba(48,54,61,.3)">
            <div style="width:24px;height:24px;border-radius:50%;background:${col}22;border:1px solid ${col}55;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${col};flex-shrink:0;margin-top:1px">${icon}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-size:12px;font-weight:600;color:var(--text)">${e.actor_name||'Unknown'}</span>
                <span class="badge" style="font-size:9px;background:${col}15;color:${col};border:1px solid ${col}30">${(e.action||'').toUpperCase()}</span>
                <span class="badge b-gray" style="font-size:9px">${(e.target_type||'').replace(/_/g,' ').toUpperCase()}</span>
              </div>
              <div style="font-size:12px;color:var(--text2);margin-top:3px">${e.target_label||'—'}</div>
              ${e.old_value || e.new_value ? `
                <div style="font-size:10px;color:var(--text3);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap">
                  ${e.old_value ? `<span>Before: <code style="font-family:monospace;background:var(--bg3);padding:1px 4px;border-radius:3px;font-size:10px">${JSON.stringify(e.old_value).slice(0,80)}${JSON.stringify(e.old_value).length>80?'…':''}</code></span>` : ''}
                  ${e.new_value ? `<span>After: <code style="font-family:monospace;background:var(--bg3);padding:1px 4px;border-radius:3px;font-size:10px">${JSON.stringify(e.new_value).slice(0,80)}${JSON.stringify(e.new_value).length>80?'…':''}</code></span>` : ''}
                </div>` : ''}
            </div>
            <div style="font-size:11px;color:var(--text3);white-space:nowrap;flex-shrink:0;font-family:monospace">${time}</div>
            <div style="font-size:10px;color:var(--text3);white-space:nowrap;flex-shrink:0">${e.actor_role||''}</div>
          </div>`;
      }).join('')}
    </div>`).join('');
}

function exportAuditCSV(entries) {
  const rows = [['Date','Time','User','Role','Action','Record type','Label','Before','After']];
  entries.forEach(e => {
    const d = new Date(e.created_at);
    rows.push([
      d.toLocaleDateString('en-ZA'),
      d.toLocaleTimeString('en-ZA'),
      e.actor_name||'',
      e.actor_role||'',
      e.action||'',
      e.target_type||'',
      e.target_label||'',
      e.old_value ? JSON.stringify(e.old_value) : '',
      e.new_value ? JSON.stringify(e.new_value) : ''
    ]);
  });
  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `audit-trail-${new Date().toISOString().slice(0,10)}.csv`
  });
  a.click();
  URL.revokeObjectURL(url);
}
