// js/stakeholders.js — Stakeholder directory with edit, delete, CSV/PDF export
import { supabase } from './supabase.js';

let _muniId = null;
let _orgs    = [];

const SECTORS = [
  'Fire Brigade / Fire Services',
  'South African Police Service (SAPS)',
  'Emergency Medical Services (EMS / Ambulance)',
  'Hospitals & Clinics',
  'South African Weather Service (SAWS)',
  'South African National Defence Force (SANDF)',
  'Provincial Traffic / Law Enforcement',
  'SANRAL',
  'Dept: Water & Sanitation',
  'Eskom',
  'Dept: Agriculture',
  'Dept: Social Development',
  'Dept: Health',
  'Dept: Education',
  'Dept: Public Works',
  'Dept: Environmental Affairs (DEADP)',
  'SANParks / CapeNature',
  'Red Cross / NGOs',
  'Ward Committees',
  'Community Organisations (CBOs)',
  'Private Sector / Business',
  'Media',
  'Other Government',
  'Other / Custom'
];

export async function initStakeholders(user) {
  _muniId = user?.municipality_id;
  await renderStakeholders();
}

async function renderStakeholders() {
  const body = document.getElementById('stakeholders-body');
  if (!body) return;

  const { data: orgs } = await supabase
    .from('stakeholder_orgs')
    .select('*, stakeholder_contacts(*)')
    .eq('municipality_id', _muniId)
    .order('sector');

  _orgs = orgs || [];

  body.innerHTML = `
    <div class="sec-hdr">
      <div>
        <div class="sec-hdr-title">Stakeholder directory</div>
        <div class="sec-hdr-sub">${_orgs.length} organisations · ${_orgs.reduce((t,o)=>t+(o.stakeholder_contacts?.length||0),0)} contacts</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <select class="fl-sel" id="sector-filter" style="font-size:12px;max-width:200px">
          <option value="">All sectors</option>
          ${SECTORS.map(s=>`<option value="${s}">${s}</option>`).join('')}
        </select>
        <button class="btn btn-sm" id="export-csv-btn">↓ Export CSV</button>
        <button class="btn btn-sm" id="export-pdf-btn">↓ Export PDF</button>
        <button class="btn btn-red btn-sm" id="add-org-btn">+ Add organisation</button>
      </div>
    </div>
    <div id="org-form-area"></div>
    <div id="orgs-list">
      ${_orgs.length ? _orgs.map(org => renderOrgCard(org)).join('') : emptyState('No organisations yet. Add your first stakeholder.')}
    </div>`;

  requestAnimationFrame(() => {
    document.getElementById('add-org-btn')?.addEventListener('click', () => showOrgForm(null));
    document.getElementById('sector-filter')?.addEventListener('change', filterBySector);
    document.getElementById('export-csv-btn')?.addEventListener('click', exportCSV);
    document.getElementById('export-pdf-btn')?.addEventListener('click', exportPDF);
    bindOrgEvents();
  });
}

function filterBySector() {
  const sector = document.getElementById('sector-filter')?.value;
  const filtered = sector ? _orgs.filter(o => o.sector === sector) : _orgs;
  const list = document.getElementById('orgs-list');
  if (list) {
    list.innerHTML = filtered.length
      ? filtered.map(org => renderOrgCard(org)).join('')
      : emptyState('No organisations in this sector.');
    bindOrgEvents();
  }
}

function renderOrgCard(org) {
  const contacts = org.stakeholder_contacts || [];
  return `
    <div class="panel" style="margin-bottom:12px" id="org-${org.id}">
      <div class="ph">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text)">${org.name}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${org.sector||'—'} · ${contacts.length} contact${contacts.length!==1?'s':''}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="badge ${org.is_active?'b-green':'b-gray'}">${org.is_active?'ACTIVE':'INACTIVE'}</span>
          <button class="btn btn-sm org-edit" data-id="${org.id}">Edit</button>
          <button class="btn btn-sm btn-red org-delete" data-id="${org.id}">Delete</button>
        </div>
      </div>

      <div class="pb">
        ${org.description?`<div style="font-size:12px;color:var(--text3);margin-bottom:10px">${org.description}</div>`:''}

        ${contacts.length ? `
          <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">Contacts</div>
          ${contacts.map(contact => `
            <div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px" id="contact-${contact.id}">
              <div style="flex:1">
                <div style="font-size:12px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:6px">
                  ${contact.full_name}
                  ${contact.is_primary?'<span class="badge b-blue" style="font-size:9px">PRIMARY</span>':''}
                </div>
                <div style="font-size:11px;color:var(--text3);margin-top:3px">${contact.role_title||''}</div>
                <div style="display:flex;gap:12px;margin-top:5px;flex-wrap:wrap">
                  ${contact.cell?`<span style="font-size:11px;color:var(--text2)">📱 ${contact.cell}</span>`:''}
                  ${contact.email?`<span style="font-size:11px;color:var(--text2)">✉ ${contact.email}</span>`:''}
                  ${contact.landline?`<span style="font-size:11px;color:var(--text2)">☎ ${contact.landline}</span>`:''}
                </div>
              </div>
              <div style="display:flex;gap:4px;flex-shrink:0">
                <button class="btn btn-sm contact-edit" data-id="${contact.id}" data-org="${org.id}">Edit</button>
                <button class="btn btn-sm btn-red contact-delete" data-id="${contact.id}">✕</button>
              </div>
            </div>`).join('')}
        ` : '<div style="font-size:12px;color:var(--text3);padding:4px 0">No contacts yet.</div>'}

        <div id="contact-form-${org.id}"></div>
        <button class="btn btn-sm btn-green add-contact-btn" data-org="${org.id}" style="margin-top:8px">+ Add contact</button>
      </div>
    </div>`;
}

// ── ORG FORM ──────────────────────────────────────────────
function showOrgForm(existing) {
  const area = document.getElementById('org-form-area');
  if (!area) return;
  if (area.innerHTML && !existing) { area.innerHTML = ''; return; }

  const org = existing || {};
  area.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--red-mid);border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">${existing?'Edit organisation':'Add organisation'}</div>
      <div class="frow">
        <div class="fl">
          <span class="fl-label">Organisation name</span>
          <input class="fl-input" id="org-name" value="${org.name||''}"/>
        </div>
        <div class="fl">
          <span class="fl-label">Sector <span style="color:var(--text3);font-size:10px">(select or type custom)</span></span>
          <input class="fl-input" id="org-sector" list="sector-opts" value="${org.sector||''}" placeholder="Select or type sector"/>
          <datalist id="sector-opts">${SECTORS.map(s=>`<option value="${s}"/>`).join('')}</datalist>
        </div>
      </div>
      <div class="fl">
        <span class="fl-label">Description</span>
        <textarea class="fl-textarea" id="org-desc" rows="2" style="min-height:52px">${org.description||''}</textarea>
      </div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Website</span><input class="fl-input" id="org-website" value="${org.website||''}" placeholder="https://..."/></div>
        <div class="fl"><span class="fl-label">Physical address</span><input class="fl-input" id="org-address" value="${org.address||''}"/></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text2);margin-bottom:12px">
        <input type="checkbox" id="org-active" ${org.is_active!==false?'checked':''} style="width:15px;height:15px"/>
        Active organisation
      </label>
      <div style="display:flex;gap:8px">
        <button class="btn btn-green btn-sm" id="save-org-btn" data-id="${org.id||''}">Save organisation</button>
        <button class="btn btn-sm" onclick="document.getElementById('org-form-area').innerHTML=''">Cancel</button>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    document.getElementById('save-org-btn')?.addEventListener('click', async () => {
      const id   = document.getElementById('save-org-btn').dataset.id;
      const name = document.getElementById('org-name')?.value.trim();
      if (!name) { alert('Organisation name required.'); return; }

      const payload = {
        municipality_id: _muniId,
        name,
        sector:      document.getElementById('org-sector')?.value,
        description: document.getElementById('org-desc')?.value,
        website:     document.getElementById('org-website')?.value,
        address:     document.getElementById('org-address')?.value,
        is_active:   document.getElementById('org-active')?.checked
      };

      const { error } = id
        ? await supabase.from('stakeholder_orgs').update(payload).eq('id', id)
        : await supabase.from('stakeholder_orgs').insert(payload);

      if (error) { showToast(error.message, true); return; }
      showToast('✓ Organisation saved successfully!');
      area.innerHTML = '';
      await renderStakeholders();
    });
  });
}

// ── CONTACT FORM ──────────────────────────────────────────
function showContactForm(orgId, existing) {
  const area = document.getElementById(`contact-form-${orgId}`);
  if (!area) return;
  if (area.innerHTML && !existing) { area.innerHTML = ''; return; }

  const ct = existing || {};
  area.innerHTML = `
    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px;margin-top:10px">
      <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:10px">${existing?'Edit contact':'Add contact'}</div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Full name</span><input class="fl-input" id="ct-name-${orgId}" value="${ct.full_name||''}"/></div>
        <div class="fl"><span class="fl-label">Role / title</span><input class="fl-input" id="ct-role-${orgId}" value="${ct.role_title||''}"/></div>
      </div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Cell number</span><input class="fl-input" id="ct-cell-${orgId}" value="${ct.cell||''}" placeholder="082 000 0000"/></div>
        <div class="fl"><span class="fl-label">Landline</span><input class="fl-input" id="ct-land-${orgId}" value="${ct.landline||''}"/></div>
      </div>
      <div class="fl"><span class="fl-label">Email</span><input class="fl-input" id="ct-email-${orgId}" value="${ct.email||''}"/></div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text2);margin-bottom:10px">
        <input type="checkbox" id="ct-primary-${orgId}" ${ct.is_primary?'checked':''} style="width:14px;height:14px"/>
        Primary contact for this organisation
      </label>
      <div style="display:flex;gap:8px">
        <button class="btn btn-green btn-sm" id="save-ct-${orgId}" data-id="${ct.id||''}" data-org="${orgId}">Save contact</button>
        <button class="btn btn-sm" onclick="document.getElementById('contact-form-${orgId}').innerHTML=''">Cancel</button>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    document.getElementById(`save-ct-${orgId}`)?.addEventListener('click', async () => {
      const ctId  = document.getElementById(`save-ct-${orgId}`).dataset.id;
      const oId   = document.getElementById(`save-ct-${orgId}`).dataset.org;
      const name  = document.getElementById(`ct-name-${orgId}`)?.value.trim();
      if (!name) { alert('Contact name required.'); return; }

      const payload = {
        org_id:          oId,
        municipality_id: _muniId,
        full_name:       name,
        role_title:      document.getElementById(`ct-role-${orgId}`)?.value,
        cell:            document.getElementById(`ct-cell-${orgId}`)?.value,
        landline:        document.getElementById(`ct-land-${orgId}`)?.value,
        email:           document.getElementById(`ct-email-${orgId}`)?.value,
        is_primary:      document.getElementById(`ct-primary-${orgId}`)?.checked,
        is_active:       true
      };

      const { error } = ctId
        ? await supabase.from('stakeholder_contacts').update(payload).eq('id', ctId)
        : await supabase.from('stakeholder_contacts').insert(payload);

      if (error) { showToast(error.message, true); return; }
      showToast('✓ Contact saved successfully!');
      await renderStakeholders();
    });
  });
}

// ── BIND ORG EVENTS ───────────────────────────────────────
function bindOrgEvents() {
  document.querySelectorAll('.org-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const org = _orgs.find(o => o.id === btn.dataset.id);
      if (org) showOrgForm(org);
    });
  });

  document.querySelectorAll('.org-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this organisation and all its contacts?')) return;
      await supabase.from('stakeholder_contacts').delete().eq('org_id', btn.dataset.id);
      await supabase.from('stakeholder_orgs').delete().eq('id', btn.dataset.id);
      showToast('✓ Organisation deleted');
      await renderStakeholders();
    });
  });

  document.querySelectorAll('.add-contact-btn').forEach(btn => {
    btn.addEventListener('click', () => showContactForm(btn.dataset.org, null));
  });

  document.querySelectorAll('.contact-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const org = _orgs.find(o => o.id === btn.dataset.org);
      const ct  = org?.stakeholder_contacts?.find(c => c.id === btn.dataset.id);
      if (ct) showContactForm(btn.dataset.org, ct);
    });
  });

  document.querySelectorAll('.contact-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this contact?')) return;
      await supabase.from('stakeholder_contacts').delete().eq('id', btn.dataset.id);
      showToast('✓ Contact deleted');
      await renderStakeholders();
    });
  });
}

// ── EXPORT ────────────────────────────────────────────────
function exportCSV() {
  const rows = [['Organisation','Sector','Contact Name','Role','Cell','Email','Landline','Primary']];
  _orgs.forEach(org => {
    const contacts = org.stakeholder_contacts || [];
    if (!contacts.length) {
      rows.push([org.name, org.sector||'', '', '', '', '', '', '']);
    } else {
      contacts.forEach(c => {
        rows.push([
          org.name, org.sector||'',
          c.full_name||'', c.role_title||'',
          c.cell||'', c.email||'', c.landline||'',
          c.is_primary?'Yes':'No'
        ]);
      });
    }
  });

  const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `DRMSA-stakeholders-${new Date().toISOString().slice(0,10)}.csv`
  });
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ CSV downloaded — opens in Excel');
}

function exportPDF() {
  const muniName = window._drmsaUser?.municipalities?.name || 'Municipality';
  let html = `
    <html><head><title>Stakeholder Directory — ${muniName}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#000;padding:20px}
      h1{font-size:18px;margin-bottom:4px}
      h2{font-size:14px;margin:14px 0 4px;color:#1a3a6b;border-bottom:1px solid #ccc;padding-bottom:4px}
      .org-meta{font-size:11px;color:#666;margin-bottom:8px}
      table{width:100%;border-collapse:collapse;margin-bottom:12px}
      th{background:#1a3a6b;color:#fff;padding:6px 8px;text-align:left;font-size:11px}
      td{padding:5px 8px;border-bottom:1px solid #eee;font-size:11px}
      tr:nth-child(even) td{background:#f9f9f9}
      .badge{background:#e8f0fe;color:#1a3a6b;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700}
    </style></head><body>
    <h1>Stakeholder Directory</h1>
    <div class="org-meta">${muniName} · Generated ${new Date().toLocaleString('en-ZA')}</div>`;

  _orgs.forEach(org => {
    const contacts = org.stakeholder_contacts || [];
    html += `<h2>${org.name} <span style="font-size:11px;font-weight:400;color:#666">${org.sector||''}</span></h2>`;
    if (contacts.length) {
      html += `<table><thead><tr><th>Name</th><th>Role</th><th>Cell</th><th>Email</th><th>Landline</th></tr></thead><tbody>`;
      contacts.forEach(c => {
        html += `<tr><td>${c.full_name||'—'}${c.is_primary?' <span class="badge">PRIMARY</span>':''}</td><td>${c.role_title||'—'}</td><td>${c.cell||'—'}</td><td>${c.email||'—'}</td><td>${c.landline||'—'}</td></tr>`;
      });
      html += `</tbody></table>`;
    } else {
      html += `<p style="color:#999;font-size:11px">No contacts registered.</p>`;
    }
  });

  html += `</body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.print(); }
  showToast('✓ PDF print dialog opened');
}

function emptyState(msg) {
  return `<div style="text-align:center;padding:48px 20px;color:var(--text3);font-size:12px">${msg}</div>`;
}

function showToast(msg, isError=false) {
  document.querySelectorAll('.drmsa-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'drmsa-toast';
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:var(--bg2);border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,.35);display:flex;align-items:center;gap:10px;max-width:340px;transition:opacity .3s;font-family:Inter,system-ui,sans-serif`;
  t.innerHTML = `<span style="font-size:16px">${isError?'✕':'✓'}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},3000);
}
