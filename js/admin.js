// js/admin.js
import { supabase } from './supabase.js';
import { writeAudit } from './audit.js';

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

  // 
  listEl.innerHTML = users.map(u => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(48,54,61,.4)">
      <div style="width:30px;height:30px;border-radius:50%;background:var(--bg4);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--text3);font-family:monospace;flex-shrink:0">${initials(u.full_name)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text)">${u.full_name || 'Unnamed'}</div>
        <div style="font-size:11px;color:var(--text3);font-family:monospace">${roleLabel(u.role)}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
        <span class="badge ${u.status==='active'?'b-green':u.status==='pending'?'b-amber':'b-gray'}">${(u.status||'?').toUpperCase()}</span>
      </div>
    </div>`).join('');
}

// everything else remains exactly the same…
