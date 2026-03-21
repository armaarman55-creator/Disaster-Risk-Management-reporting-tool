// js/admin.js
import { supabase } from './supabase.js';

let _user = null;

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
        </div>
      </div>
    </div>`;

  await loadUsers();
  await loadMuniSettings();
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
  if (!area || area.innerHTML) { area.innerHTML = ''; return; }
  area.innerHTML = `
    <div style="padding:14px 16px;background:var(--bg3);border-bottom:1px solid var(--border)">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div class="fl"><span class="fl-label">Full name</span><input class="fl-input" id="inv-name" placeholder="Full name"/></div>
        <div class="fl"><span class="fl-label">Email</span><input class="fl-input" id="inv-email" type="email" placeholder="email@example.com"/></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <select class="fl-sel" id="inv-role" style="flex:1">
          <option value="disaster_officer">Disaster Officer</option>
          <option value="planner">IDP Planner</option>
          <option value="viewer">Viewer</option>
          ${_user?.role === 'admin' ? '<option value="admin">System Admin</option>' : ''}
        </select>
        <button class="btn btn-green btn-sm" id="send-inv-btn">Send invite</button>
        <button class="btn btn-sm" onclick="document.getElementById('invite-form-area').innerHTML=''">Cancel</button>
      </div>
      <div id="inv-error" style="font-size:12px;color:var(--red);margin-top:6px;display:none"></div>
    </div>`;

  document.getElementById('send-inv-btn')?.addEventListener('click', async () => {
    const email = document.getElementById('inv-email')?.value.trim();
    const name  = document.getElementById('inv-name')?.value.trim();
    const role  = document.getElementById('inv-role')?.value;
    const errEl = document.getElementById('inv-error');
    if (!email || !name) { errEl.textContent='Name and email required'; errEl.style.display='block'; return; }

    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: name, municipality_id: _user.municipality_id, role, invited_by_admin: 'true' }
    });

    if (error) { errEl.textContent = error.message; errEl.style.display='block'; }
    else { document.getElementById('invite-form-area').innerHTML=''; showToast(`Invite sent to ${email}`); await loadUsers(); }
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
    </div>

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);font-family:monospace;margin-bottom:10px">Social media links</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:10px;line-height:1.6">
        These links are used when sharing content to social platforms. If not set, a prompt will appear asking users to add them first.
      </div>
      <div class="fl"><span class="fl-label">Facebook page URL</span><input class="fl-input" id="ms-facebook" value="${muni.social_facebook||''}" placeholder="https://facebook.com/YourMunicipality"/></div>
      <div class="fl"><span class="fl-label">X / Twitter handle</span><input class="fl-input" id="ms-twitter" value="${muni.social_twitter||''}" placeholder="@YourMunicipality (without @)"/></div>
      <div class="fl"><span class="fl-label">WhatsApp number (with country code)</span><input class="fl-input" id="ms-whatsapp" value="${muni.social_whatsapp||''}" placeholder="27821234567"/></div>
      <div class="fl"><span class="fl-label">Municipality website</span><input class="fl-input" id="ms-website" value="${muni.social_website||''}" placeholder="https://www.yourmunicipality.gov.za"/></div>
    </div>`;

  document.getElementById('save-ms-btn')?.addEventListener('click', async () => {
    const { error } = await supabase.from('municipalities').update({
      name:             document.getElementById('ms-name')?.value,
      code:             document.getElementById('ms-code')?.value,
      ward_count:       parseInt(document.getElementById('ms-wards')?.value)||0,
      district:         document.getElementById('ms-district')?.value,
      province:         document.getElementById('ms-province')?.value,
      social_facebook:  document.getElementById('ms-facebook')?.value.trim()||null,
      social_twitter:   document.getElementById('ms-twitter')?.value.trim()||null,
      social_whatsapp:  document.getElementById('ms-whatsapp')?.value.trim()||null,
      social_website:   document.getElementById('ms-website')?.value.trim()||null,
    }).eq('id', _user.municipality_id);
    if (!error) showToast('Municipality settings saved');
    else showToast(error.message, true);
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

window.approveUser = async function(id) {
  await supabase.from('user_profiles').update({ status: 'active' }).eq('id', id);
  showToast('User approved'); loadUsers();
};

window.suspendUser = async function(id) {
  if (!confirm('Suspend this user?')) return;
  await supabase.from('user_profiles').update({ status: 'suspended' }).eq('id', id);
  showToast('User suspended'); loadUsers();
};

window.changeRole = async function(id, role) {
  await supabase.from('user_profiles').update({ role }).eq('id', id);
  showToast('Role updated');
};

function initials(name) {
  return (name||'?').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
}

function roleLabel(r) {
  return { admin:'Admin', disaster_officer:'Disaster Officer', planner:'IDP Planner', viewer:'Viewer' }[r] || r || '—';
}

function showToast(msg, isError=false) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:${isError?'var(--red-dim)':'var(--green-dim)'};border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:10px 16px;border-radius:6px;font-size:12px;font-family:monospace;font-weight:700;z-index:500`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},2500);
}
