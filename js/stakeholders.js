// js/stakeholders.js
import { supabase } from './supabase.js';

let _muniId = null;

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

  body.innerHTML = `
    <div class="sec-hdr">
      <div>
        <div class="sec-hdr-title">Stakeholder & hazard owner directory</div>
        <div class="sec-hdr-sub">${orgs?.length || 0} organisations registered</div>
      </div>
      <button class="btn btn-red" id="add-org-btn">+ Add organisation</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <input class="fl-input" id="stakeholder-search" placeholder="Search organisation or contact…" style="flex:1;max-width:280px"/>
      <select class="fl-sel" id="sector-filter" style="width:180px">
        <option value="">All sectors</option>
        ${[
        'Fire Brigade / Fire Services','South African Police Service (SAPS)',
        'Emergency Medical Services (EMS / Ambulance)','Hospitals & Clinics',
        'South African Weather Service (SAWS)','South African National Defence Force (SANDF)',
        'Provincial Traffic / Law Enforcement','SANRAL',
        'Dept: Water & Sanitation','Eskom','Dept: Agriculture','Dept: Social Development',
        'Dept: Health','Dept: Education','Dept: Public Works','Dept: Environmental Affairs (DEADP)',
        'SANParks / CapeNature','Red Cross / NGOs','Ward Committees',
        'Community Organisations (CBOs)','Private Sector / Business','Media','Other'
      ].map(s=>`<option>${s}</option>`).join('')}
      </select>
    </div>
    <div id="orgs-list">
      ${orgs?.length ? orgs.map(o => renderOrgCard(o)).join('') : emptyState('No organisations registered yet. Add your first stakeholder to build your directory.')}
    </div>`;

  document.getElementById('add-org-btn')?.addEventListener('click', () => showAddOrgForm(body));
  document.getElementById('stakeholder-search')?.addEventListener('input', e => filterOrgs(orgs, e.target.value));
  document.getElementById('sector-filter')?.addEventListener('change', e => filterBySector(orgs, e.target.value));
}

function renderOrgCard(org) {
  const contacts = org.stakeholder_contacts || [];
  const hazardTags = (org.hazard_types || []).map(h => `<span class="badge b-${getHazardColour(h)}" style="margin:2px">${h}</span>`).join('');

  return `
    <div class="panel" style="margin-bottom:12px">
      <div class="ph">
        <div>
          <div class="ph-title">${org.name}</div>
          <div class="ph-sub">${org.sector || '—'} · ${contacts.length} contact${contacts.length !== 1 ? 's' : ''} · Last verified: ${org.last_verified ? new Date(org.last_verified).toLocaleDateString('en-ZA') : 'Not verified'}</div>
        </div>
        <div style="display:flex;gap:7px;align-items:center">
          <span class="badge ${org.is_active ? 'b-green' : 'b-gray'}">${org.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
          <button class="btn btn-sm" onclick="editOrg('${org.id}')">Edit</button>
        </div>
      </div>
      <div class="pb">
        ${hazardTags ? `<div style="margin-bottom:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);font-family:var(--font-mono);margin-right:4px">Hazard owner:</span>${hazardTags}</div>` : ''}
        ${contacts.length ? `
          <div style="display:grid;grid-template-columns:1.4fr 1fr 1.4fr .8fr .5fr;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);font-size:9px;font-weight:700;color:var(--text3);font-family:var(--font-mono);letter-spacing:.04em;text-transform:uppercase">
            <span>Name</span><span>Position</span><span>Email</span><span>Cell</span><span>Status</span>
          </div>
          ${contacts.map(c => `
            <div style="display:grid;grid-template-columns:1.4fr 1fr 1.4fr .8fr .5fr;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid rgba(48,54,61,.4);font-size:11px">
              <span style="font-weight:600;color:var(--text)">${c.full_name || '—'}</span>
              <span style="color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.position || '—'}</span>
              <span style="color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.email || '—'}</span>
              <span style="color:var(--text3)">${c.cell || '—'}</span>
              <span class="badge ${c.is_active ? 'b-green' : 'b-gray'}" style="font-size:9px">${c.is_active ? 'Active' : 'Inactive'}</span>
            </div>`).join('')}
          <div style="display:flex;gap:6px;margin-top:10px">
            <button class="btn btn-sm" onclick="addContact('${org.id}')">+ Add contact</button>
            <button class="btn btn-sm" onclick="exportOrg('${org.id}')">Export</button>
          </div>
        ` : `<div style="font-size:12px;color:var(--text3);padding:8px 0">No contacts added yet. <button class="btn btn-sm" onclick="addContact('${org.id}')">+ Add contact</button></div>`}
      </div>
    </div>`;
}

function showAddOrgForm(body) {
  const form = document.createElement('div');
  form.className = 'panel';
  form.style.marginBottom = '12px';
  form.style.border = '1px solid var(--red)';
  const sectors = [
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
    'Other'
  ];
  form.innerHTML = `
    <div class="ph"><div class="ph-title">Add new organisation</div></div>
    <div class="pb">
      <div class="frow">
        <div class="fl"><span class="fl-label">Organisation name</span><input class="fl-input" id="new-org-name" placeholder="e.g. Fire Brigade"/></div>
        <div class="fl"><span class="fl-label">Sector</span><select class="fl-sel" id="new-org-sector">${sectors.map(s=>`<option>${s}</option>`).join('')}</select></div>
      </div>
      <div class="fl"><span class="fl-label">Address</span><input class="fl-input" id="new-org-address" placeholder="Physical address"/></div>
      <div class="frow">
        <div class="fl"><span class="fl-label">General contact number</span><input class="fl-input" id="new-org-tel" placeholder="044 000 0000"/></div>
        <div class="fl"><span class="fl-label">General email</span><input class="fl-input" id="new-org-email" placeholder="info@example.com"/></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-green btn-sm" id="save-org-btn">Save organisation</button>
        <button class="btn btn-sm" onclick="this.closest('.panel').remove()">Cancel</button>
      </div>
    </div>`;

  body.querySelector('#orgs-list').insertBefore(form, body.querySelector('#orgs-list').firstChild);

  document.getElementById('save-org-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('new-org-name')?.value.trim();
    if (!name) { alert('Organisation name is required.'); return; }
    const { error } = await supabase.from('stakeholder_orgs').insert({
      municipality_id: _muniId,
      name,
      sector: document.getElementById('new-org-sector')?.value,
      address: document.getElementById('new-org-address')?.value,
      general_tel: document.getElementById('new-org-tel')?.value,
      general_email: document.getElementById('new-org-email')?.value,
      is_active: true,
      hazard_types: []
    });
    if (!error) { form.remove(); await renderStakeholders(); }
    else alert('Error: ' + error.message);
  });
}

window.addContact = async function(orgId) {
  const name = prompt('Contact full name:');
  if (!name) return;
  const position = prompt('Position:') || '';
  const cell = prompt('Cell number:') || '';
  const email = prompt('Email:') || '';
  await supabase.from('stakeholder_contacts').insert({
    org_id: orgId, municipality_id: _muniId,
    full_name: name, position, cell, email, is_active: true
  });
  await renderStakeholders();
};

window.editOrg = function(orgId) {
  alert('Edit org ' + orgId + ' — full edit modal coming in next build.');
};

window.exportOrg = function(orgId) {
  alert('Export for org ' + orgId + ' — Excel export coming in next build.');
};

function filterOrgs(orgs, query) {
  const q = query.toLowerCase();
  const list = document.getElementById('orgs-list');
  if (!list || !orgs) return;
  const filtered = orgs.filter(o =>
    o.name?.toLowerCase().includes(q) ||
    o.sector?.toLowerCase().includes(q) ||
    o.stakeholder_contacts?.some(c => c.full_name?.toLowerCase().includes(q))
  );
  list.innerHTML = filtered.length ? filtered.map(o => renderOrgCard(o)).join('') : emptyState('No results found.');
}

function filterBySector(orgs, sector) {
  const list = document.getElementById('orgs-list');
  if (!list || !orgs) return;
  const filtered = sector ? orgs.filter(o => o.sector === sector) : orgs;
  list.innerHTML = filtered.length ? filtered.map(o => renderOrgCard(o)).join('') : emptyState('No organisations in this sector.');
}

function getHazardColour(hazard) {
  const map = { 'Veld fire': 'red', 'Flash floods': 'blue', 'Drought': 'amber', 'Strong winds': 'blue' };
  return map[hazard] || 'gray';
}

function emptyState(msg) {
  return `<div style="text-align:center;padding:48px 20px;color:var(--text3);font-size:12px;font-family:var(--font-mono)">${msg}</div>`;
}
