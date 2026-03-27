// js/admin.js
import { supabase } from './supabase.js';
import { writeAudit } from './audit.js';

let _user = null;

// ── FIX: define roleLabel to avoid ReferenceError ─────────
function roleLabel(role) {
  switch(role) {
    case 'admin': return 'Administrator';
    case 'disaster_officer': return 'Disaster Officer';
    case 'planner': return 'Planner';
    case 'viewer': return 'Viewer';
    default: return 'User';
  }
}

// ── FIX: Move initials function above loadUsers ─────────────
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
            <div class="ph"><div class="ph-title">API integrations</div><div class="ph-sub">Weather warnings · External data</div></div>
            <div class="pb" id="api-settings">Loading…</div>
          </div>
        </div>
        <div>
          <div class="panel" style="margin-bottom:16px">
            <div class="ph"><div class="ph-title">Municipality settings</div></div>
            <div class="pb" id="muni-settings">Loading…</div>
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

  // Wire audit trail toggle
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

async function loadUsers() {
  const listEl = document.getElementById('users-list');
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
             <button class="btn btn-sm btn-red" onclick="suspendUser('${u.id}')">✕</button>` 
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
        Invite personnel to access your municipality's DRMSA instance. Each invited user receives an email with a secure link to set their password.
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

    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: name, municipality_id: _user.municipality_id, user_role: role, invited_by_admin: 'true' }
    });

    if (error) {
      errEl.textContent = error.message; errEl.style.display = 'block';
    } else {
      // Show sent confirmation and clear fields for next invite
      const inviteRoleLabel = { disaster_officer: 'DRMO', planner: 'IDP Planner', viewer: 'Viewer', admin: 'Admin' }[role] || role;
      sentEl.innerHTML += `<div style="font-size:11px;color:var(--green);padding:4px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round"><polyline points="1,5 4,8 9,2"/></svg>
        ${name} &lt;${email}&gt; — ${inviteRoleLabel}
      </div>`;
      document.getElementById('inv-name').value = '';
      document.getElementById('inv-email').value = '';
      showToast(`Invite sent to ${email}`);
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

  const savedKey   = localStorage.getItem('drmsa_weather_key') || '';
  const savedProv  = localStorage.getItem('drmsa_weather_provider') || 'openweathermap';

  el.innerHTML = `
    <div style="font-size:12px;color:var(--text2);line-height:1.7;margin-bottom:14px">
      DRMSA supports plugging in your own weather API key for severe weather warnings.
      Recommended free options for South Africa:
      <ul style="margin:8px 0 0 16px;color:var(--text3)">
        <li><strong style="color:var(--text2)">OpenWeatherMap</strong> — free tier, good SA coverage · openweathermap.org</li>
        <li><strong style="color:var(--text2)">WeatherAPI.com</strong> — free tier, 1M calls/month · weatherapi.com</li>
        <li><strong style="color:var(--text2)">Tomorrow.io</strong> — free tier, has severe alerts · tomorrow.io</li>
      </ul>
    </div>
    <div class="fl">
      <span class="fl-label">Weather API provider</span>
      <select class="fl-sel" id="weather-provider">
        <option value="openweathermap" ${savedProv==='openweathermap'?'selected':''}>OpenWeatherMap</option>
        <option value="weatherapi"     ${savedProv==='weatherapi'?'selected':''}>WeatherAPI.com</option>
        <option value="tomorrow"       ${savedProv==='tomorrow'?'selected':''}>Tomorrow.io</option>
        <option value="none"           ${savedProv==='none'?'selected':''}>None — manual entry only</option>
      </select>
    </div>
    <div class="fl">
      <span class="fl-label">API key</span>
      <div class="pw-wrap">
        <input class="fl-input" type="password" id="weather-key" value="${savedKey}" placeholder="Paste your API key here"/>
        <button class="pw-toggle" type="button" onclick="toggleApiKey()">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>
        </button>
      </div>
    </div>
    <div class="fl">
      <span class="fl-label">Municipality location (for weather queries)</span>
      <div class="frow">
        <input class="fl-input" id="weather-lat" placeholder="Latitude e.g. -33.5869" value="${localStorage.getItem('drmsa_lat')||''}"/>
        <input class="fl-input" id="weather-lng" placeholder="Longitude e.g. 22.2065" value="${localStorage.getItem('drmsa_lng')||''}"/>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn btn-green btn-sm" id="save-api-btn">Save API settings</button>
      <button class="btn btn-sm" id="test-api-btn">Test connection</button>
    </div>
    <div id="api-test-result" style="margin-top:8px;font-size:12px;font-family:monospace;display:none"></div>`;

  document.getElementById('save-api-btn')?.addEventListener('click', () => {
    localStorage.setItem('drmsa_weather_key',      document.getElementById('weather-key')?.value.trim());
    localStorage.setItem('drmsa_weather_provider', document.getElementById('weather-provider')?.value);
    localStorage.setItem('drmsa_lat',              document.getElementById('weather-lat')?.value.trim());
    localStorage.setItem('drmsa_lng',              document.getElementById('weather-lng')?.value.trim());
    showToast('API settings saved');
  });

  document.getElementById('test-api-btn')?.addEventListener('click', testWeatherApi);
}

async function testWeatherApi() {
  const key      = document.getElementById('weather-key')?.value.trim();
  const provider = document.getElementById('weather-provider')?.value;
  const lat      = document.getElementById('weather-lat')?.value.trim();
  const lng      = document.getElementById('weather-lng')?.value.trim();
  const result   = document.getElementById('api-test-result');
  if (!result) return;

  if (!key || provider === 'none') { result.style.display='block'; result.style.color='var(--amber)'; result.textContent='No API key set.'; return; }
  if (!lat || !lng) { result.style.display='block'; result.style.color='var(--amber)'; result.textContent='Please enter lat/lng coordinates.'; return; }

  result.style.display='block'; result.style.color='var(--text3)'; result.textContent='Testing…';

  try {
    let url, data;
    if (provider === 'openweathermap') {
      url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${key}&units=metric`;
      const res = await fetch(url);
      data = await res.json();
      if (data.cod !== 200) throw new Error(data.message || 'API error');
      result.style.color='var(--green)';
      result.textContent = `✓ Connected — ${data.name}: ${Math.round(data.main.temp)}°C, ${data.weather[0].description}`;
    } else if (provider === 'weatherapi') {
      url = `https://api.weatherapi.com/v1/current.json?key=${key}&q=${lat},${lng}`;
      const res = await fetch(url);
      data = await res.json();
      if (data.error) throw new Error(data.error.message);
      result.style.color='var(--green)';
      result.textContent = `✓ Connected — ${data.location.name}: ${data.current.temp_c}°C, ${data.current.condition.text}`;
    } else if (provider === 'tomorrow') {
      url = `https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lng}&apikey=${key}`;
      const res = await fetch(url);
      data = await res.json();
      if (data.code) throw new Error(data.message);
      result.style.color='var(--green)';
      result.textContent = `✓ Connected — Temp: ${data.data?.values?.temperature}°C`;
    }
  } catch(e) {
    result.style.color='var(--red)';
    result.textContent = `✗ Failed: ${e.message}`;
  }
}

window.toggleApiKey = function() {
  const inp = document.getElementById('weather-key');
  if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
};

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
    download: `DRMSA-audit-trail-${new Date().toISOString().slice(0,10)}.csv`
  });
  a.click();
  URL.revokeObjectURL(url);
}
