// js/stakeholders.js — Stakeholder directory with hazard assignment, grouped exports
import { supabase } from './supabase.js';
import { showDownloadMenu } from './download.js';

let _muniId = null;
let _orgs    = [];
let _muniLogos = { main: null, dm: null, mode: 'main' }; // loaded once per render

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

const HAZARD_CATEGORIES = {
  'Hydro-meteorological': [
    'Flooding','Flash flooding','Storm surge','Drought','Extreme heat',
    'Extreme cold','High winds','Hailstorm','Lightning','Tornado / Whirlwind'
  ],
  'Geological': ['Earthquake','Landslide / Mudslide','Sinkhole','Tsunami'],
  'Biological': [
    'Disease outbreak','Animal disease','Pest infestation',
    'Algal bloom','Human epidemic / Pandemic'
  ],
  'Fire': ['Wildfire / Veld fire','Urban fire','Industrial fire','Informal settlement fire'],
  'Technological': [
    'Hazardous materials spill','Chemical leak','Gas leak','Dam failure',
    'Bridge failure','Building collapse','Power grid failure',
    'Water supply failure','Sewage / Wastewater failure',
    'Transport accident','Train accident'
  ],
  'Socio-economic': [
    'Civil unrest','Illegal land invasion','Food insecurity',
    'Mass casualty event','Gender-based violence'
  ]
};

const CAT_COLOURS = {
  'Hydro-meteorological': '#58a6ff',
  'Geological':           '#d29922',
  'Biological':           '#3fb950',
  'Fire':                 '#f85149',
  'Technological':        '#bc8cff',
  'Socio-economic':       '#f0883e'
};

function getHazardCategory(name) {
  for (const [cat, hazards] of Object.entries(HAZARD_CATEGORIES)) {
    if (hazards.includes(name)) return cat;
  }
  return null;
}

function hazardDot(name) {
  const cat = getHazardCategory(name);
  const col = cat ? CAT_COLOURS[cat] : '#6e7681';
  return `<span style="display:inline-flex;align-items:center;gap:4px;background:${col}18;border:1px solid ${col}44;border-radius:10px;padding:2px 7px;font-size:9px;font-weight:600;color:${col};font-family:monospace;white-space:nowrap"><span style="width:5px;height:5px;border-radius:50%;background:${col};flex-shrink:0"></span>${name}</span>`;
}

function renderHazardCheckboxes(prefix, selected = []) {
  const sel = Array.isArray(selected) ? selected : [];
  return Object.entries(HAZARD_CATEGORIES).map(([cat, hazards]) => `
    <div style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${CAT_COLOURS[cat]};margin-bottom:5px;display:flex;align-items:center;gap:6px">
        <span style="width:6px;height:6px;border-radius:50%;background:${CAT_COLOURS[cat]};display:inline-block"></span>${cat}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${hazards.map(h => `
          <label style="display:inline-flex;align-items:center;gap:5px;background:var(--bg3);border:1px solid ${sel.includes(h)?CAT_COLOURS[cat]:'var(--border)'};border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;color:${sel.includes(h)?CAT_COLOURS[cat]:'var(--text2)'};transition:all .12s">
            <input type="checkbox" class="${prefix}-hz-cb" value="${h}" ${sel.includes(h)?'checked':''}
              style="width:11px;height:11px;accent-color:${CAT_COLOURS[cat]};cursor:pointer"
              onchange="this.closest('label').style.borderColor=this.checked?'${CAT_COLOURS[cat]}':'var(--border)';this.closest('label').style.color=this.checked?'${CAT_COLOURS[cat]}':'var(--text2)'"/>
            ${h}
          </label>`).join('')}
      </div>
    </div>`).join('');
}

function collectHazards(prefix) {
  return [...document.querySelectorAll(`.${prefix}-hz-cb:checked`)].map(cb => cb.value);
}

export async function initStakeholders(user) {
  _muniId = user?.municipality_id;
  await renderStakeholders();
}

async function fetchMuniLogos() {
  const { data } = await supabase
    .from('municipalities')
    .select('logo_main_url, logo_dm_url, logo_display_mode')
    .eq('id', _muniId)
    .single();
  _muniLogos = {
    main: data?.logo_main_url || null,
    dm:   data?.logo_dm_url   || null,
    mode: data?.logo_display_mode || 'main'
  };
}

async function renderStakeholders() {
  const body = document.getElementById('stakeholders-body');
  if (!body) return;

  const [{ data: orgs }] = await Promise.all([
    supabase.from('stakeholder_orgs').select('*, stakeholder_contacts(*)').eq('municipality_id', _muniId).order('sector'),
    fetchMuniLogos()
  ]);

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
        <button class="btn btn-sm" id="export-dl-btn">↓ Download</button>
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
    document.getElementById('export-dl-btn')?.addEventListener('click', function() {
      const muniName = window._drmsaUser?.municipalities?.name || 'Municipality';
      showDownloadMenu(this, {
        filename: `stakeholders-${muniName.replace(/\s+/g,'-')}`,
        getPDF:     () => exportPDF(),
        getCSVRows: () => getStakeholderCSVRows(),
        getDocHTML: () => getStakeholderDocHTML(muniName)
      });
    });
    bindOrgEvents();
  });
}

function filterBySector() {
  const sector   = document.getElementById('sector-filter')?.value;
  const filtered = sector ? _orgs.filter(o => o.sector === sector) : _orgs;
  const list     = document.getElementById('orgs-list');
  if (list) {
    list.innerHTML = filtered.length
      ? filtered.map(org => renderOrgCard(org)).join('')
      : emptyState('No organisations in this sector.');
    bindOrgEvents();
  }
}

function renderOrgCard(org) {
  const contacts   = org.stakeholder_contacts || [];
  const orgHazards = Array.isArray(org.hazard_types) ? org.hazard_types : [];
  return `
    <div class="panel" style="margin-bottom:12px" id="org-${org.id}">
      <div class="ph">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text)">${org.name}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${org.sector||'—'} · ${contacts.length} contact${contacts.length!==1?'s':''}</div>
          ${orgHazards.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${orgHazards.map(h=>hazardDot(h)).join('')}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="badge ${org.is_active?'b-green':'b-gray'}">${org.is_active?'ACTIVE':'INACTIVE'}</span>
          <button class="btn btn-sm org-edit" data-id="${org.id}">Edit</button>
          <button class="btn btn-sm btn-red org-delete" data-id="${org.id}">Delete</button>
        </div>
      </div>
      <div class="pb">
        ${org.notes?`<div style="font-size:12px;color:var(--text3);margin-bottom:10px">${org.notes}</div>`:''}
        ${(org.general_tel||org.general_email)?`
          <div style="display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap">
            ${org.general_tel?`<span style="font-size:11px;color:var(--text2)">☎ ${org.general_tel}</span>`:''}
            ${org.general_email?`<span style="font-size:11px;color:var(--text2)">✉ ${org.general_email}</span>`:''}
          </div>`:''}
        ${contacts.length ? `
          <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">Contacts</div>
          ${contacts.map(contact => {
            const ctHazards = Array.isArray(contact.hazard_types) ? contact.hazard_types : [];
            return `
            <div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-bottom:6px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px" id="contact-${contact.id}">
              <div style="flex:1">
                <div style="font-size:12px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:6px">
                  ${contact.full_name}
                  ${contact.is_primary?'<span class="badge b-blue" style="font-size:9px">PRIMARY</span>':''}
                </div>
                <div style="font-size:11px;color:var(--text3);margin-top:3px">${contact.position||''}</div>
                <div style="display:flex;gap:12px;margin-top:5px;flex-wrap:wrap">
                  ${contact.cell?`<span style="font-size:11px;color:var(--text2)">📱 ${contact.cell}</span>`:''}
                  ${contact.direct_tel?`<span style="font-size:11px;color:var(--text2)">☎ ${contact.direct_tel}</span>`:''}
                  ${contact.email?`<span style="font-size:11px;color:var(--text2)">✉ ${contact.email}</span>`:''}
                  ${contact.after_hours?`<span style="font-size:11px;color:var(--amber)">🌙 ${contact.after_hours}</span>`:''}
                </div>
                ${ctHazards.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${ctHazards.map(h=>hazardDot(h)).join('')}</div>` : ''}
              </div>
              <div style="display:flex;gap:4px;flex-shrink:0">
                <button class="btn btn-sm contact-edit" data-id="${contact.id}" data-org="${org.id}">Edit</button>
                <button class="btn btn-sm btn-red contact-delete" data-id="${contact.id}">✕</button>
              </div>
            </div>`;
          }).join('')}
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

  const org        = existing || {};
  const orgHazards = Array.isArray(org.hazard_types) ? org.hazard_types : [];

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
        <span class="fl-label">Notes</span>
        <textarea class="fl-textarea" id="org-desc" rows="2" style="min-height:52px">${org.notes||''}</textarea>
      </div>
      <div class="frow">
        <div class="fl"><span class="fl-label">General telephone</span><input class="fl-input" id="org-tel" value="${org.general_tel||''}" placeholder="e.g. 021 000 0000"/></div>
        <div class="fl"><span class="fl-label">General email</span><input class="fl-input" id="org-email" value="${org.general_email||''}" placeholder="info@org.co.za"/></div>
      </div>
      <div class="fl"><span class="fl-label">Physical address</span><input class="fl-input" id="org-address" value="${org.address||''}"/></div>
      <div class="fl" style="margin-top:4px">
        <span class="fl-label">Hazard types this organisation responds to</span>
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:12px;margin-top:4px">
          ${renderHazardCheckboxes('org', orgHazards)}
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text2);margin-top:10px;margin-bottom:12px">
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
        sector:        document.getElementById('org-sector')?.value,
        notes:         document.getElementById('org-desc')?.value,
        general_tel:   document.getElementById('org-tel')?.value,
        general_email: document.getElementById('org-email')?.value,
        address:       document.getElementById('org-address')?.value,
        hazard_types:  collectHazards('org'),
        is_active:     document.getElementById('org-active')?.checked
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

  const ct        = existing || {};
  const nameParts = (ct.full_name||'').split(' ');
  const ctFirst   = nameParts[0]||'';
  const ctLast    = nameParts.slice(1).join(' ')||'';
  const ctHazards = Array.isArray(ct.hazard_types) ? ct.hazard_types : [];

  area.innerHTML = `
    <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:14px;margin-top:10px">
      <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:10px">${existing?'Edit contact':'Add contact'}</div>
      <div class="frow">
        <div class="fl"><span class="fl-label">First name</span><input class="fl-input" id="ct-first-${orgId}" value="${ctFirst}" placeholder="First name"/></div>
        <div class="fl"><span class="fl-label">Surname</span><input class="fl-input" id="ct-last-${orgId}" value="${ctLast}" placeholder="Surname"/></div>
      </div>
      <div class="fl"><span class="fl-label">Position</span><input class="fl-input" id="ct-role-${orgId}" value="${ct.position||''}"/></div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Cell number</span><input class="fl-input" id="ct-cell-${orgId}" value="${ct.cell||''}" placeholder="082 000 0000"/></div>
        <div class="fl"><span class="fl-label">Direct telephone</span><input class="fl-input" id="ct-land-${orgId}" value="${ct.direct_tel||''}"/></div>
      </div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Email</span><input class="fl-input" id="ct-email-${orgId}" value="${ct.email||''}"/></div>
        <div class="fl"><span class="fl-label">After hours</span><input class="fl-input" id="ct-after-${orgId}" value="${ct.after_hours||''}" placeholder="Emergency contact"/></div>
      </div>
      <div class="fl" style="margin-top:4px">
        <span class="fl-label">Specific hazards this contact handles <span style="color:var(--text3);font-size:10px">(optional — leave blank to inherit from org)</span></span>
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:10px;margin-top:4px">
          ${renderHazardCheckboxes('ct-' + orgId, ctHazards)}
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text2);margin-top:8px;margin-bottom:10px">
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
      const first = document.getElementById(`ct-first-${orgId}`)?.value.trim();
      const last  = document.getElementById(`ct-last-${orgId}`)?.value.trim();
      const name  = `${first} ${last}`.trim();
      if (!name) { alert('Contact name required.'); return; }

      const payload = {
        org_id:          oId,
        municipality_id: _muniId,
        full_name:       name,
        position:        document.getElementById(`ct-role-${orgId}`)?.value,
        cell:            document.getElementById(`ct-cell-${orgId}`)?.value,
        direct_tel:      document.getElementById(`ct-land-${orgId}`)?.value,
        email:           document.getElementById(`ct-email-${orgId}`)?.value,
        after_hours:     document.getElementById(`ct-after-${orgId}`)?.value,
        hazard_types:    collectHazards('ct-' + orgId),
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

// ── HAZARD GROUPING LOGIC ─────────────────────────────────
function buildHazardGroups() {
  const groups     = {};
  const unassigned = [];

  _orgs.forEach(org => {
    const orgHazards = Array.isArray(org.hazard_types) ? org.hazard_types : [];
    const contacts   = org.stakeholder_contacts || [];

    const allHazards = new Set(orgHazards);
    contacts.forEach(c => {
      (Array.isArray(c.hazard_types) ? c.hazard_types : []).forEach(h => allHazards.add(h));
    });

    if (allHazards.size === 0) { unassigned.push(org); return; }

    allHazards.forEach(hazard => {
      if (!groups[hazard]) groups[hazard] = [];
      const orgOwns        = orgHazards.includes(hazard);
      const relevantContacts = orgOwns
        ? contacts
        : contacts.filter(c => Array.isArray(c.hazard_types) && c.hazard_types.includes(hazard));
      const via = orgOwns ? 'ORG' : 'CONTACT';
      groups[hazard].push({ org, contacts: relevantContacts, via });
    });
  });

  return { groups, unassigned };
}

function buildCategoryGroups() {
  const { groups, unassigned } = buildHazardGroups();
  const catGroups = {};

  Object.entries(groups).forEach(([hazard, entries]) => {
    const cat = getHazardCategory(hazard) || 'Other';
    if (!catGroups[cat]) catGroups[cat] = {};
    catGroups[cat][hazard] = entries;
  });

  const ordered = {};
  Object.keys(HAZARD_CATEGORIES).forEach(cat => {
    if (catGroups[cat]) ordered[cat] = catGroups[cat];
  });
  if (catGroups['Other']) ordered['Other'] = catGroups['Other'];

  return { catGroups: ordered, unassigned };
}

// ── LOGO HTML HELPER ──────────────────────────────────────
// Returns the <img> tag(s) to embed in PDF header based on admin display mode.
// We embed as <img src="url"> — assumes public URLs from Supabase storage.
function buildLogoHeaderHTML() {
  const { main, dm, mode } = _muniLogos;
  const imgStyle = 'max-height:52px;max-width:120px;object-fit:contain;display:block';

  if (mode === 'both' && main && dm) {
    return `<div style="display:flex;align-items:center;gap:10px">
      <img src="${main}" style="${imgStyle}"/>
      <img src="${dm}"   style="${imgStyle}"/>
    </div>`;
  }
  if (mode === 'dm' && dm) return `<img src="${dm}" style="${imgStyle}"/>`;
  if (main)               return `<img src="${main}" style="${imgStyle}"/>`;
  return ''; // no logos configured
}

// ── EXPORT HELPERS ────────────────────────────────────────
function getStakeholderCSVRows() {
  const rows = [['Category','Hazard Type','Assigned Via','Organisation','Sector','Contact Name','Position','Cell','Direct Tel','Email','After Hours','Primary']];
  const { catGroups, unassigned } = buildCategoryGroups();

  Object.entries(catGroups).forEach(([cat, hazards]) => {
    Object.entries(hazards).forEach(([hazard, entries]) => {
      entries.forEach(({ org, contacts, via }) => {
        if (!contacts.length) {
          rows.push([cat, hazard, via, org.name, org.sector||'', 'No contacts', '', '', '', '', '', '']);
        } else {
          contacts.forEach(c => {
            rows.push([cat, hazard, via, org.name, org.sector||'', c.full_name||'', c.position||'', c.cell||'', c.direct_tel||'', c.email||'', c.after_hours||'', c.is_primary?'Yes':'No']);
          });
        }
      });
    });
  });

  unassigned.forEach(org => {
    const contacts = org.stakeholder_contacts || [];
    if (!contacts.length) {
      rows.push(['Unassigned', '', '', org.name, org.sector||'', 'No contacts', '', '', '', '', '', '']);
    } else {
      contacts.forEach(c => {
        rows.push(['Unassigned', '', '', org.name, org.sector||'', c.full_name||'', c.position||'', c.cell||'', c.direct_tel||'', c.email||'', c.after_hours||'', c.is_primary?'Yes':'No']);
      });
    }
  });
  return rows;
}

function getStakeholderDocHTML(muniName) {
  const { catGroups, unassigned } = buildCategoryGroups();
  const dot = col => `display:inline-block;width:8px;height:8px;border-radius:50%;background:${col};margin-right:6px;vertical-align:middle`;

  let html = `<h1>Stakeholder Directory — Hazard Response Reference</h1>
  <div class="meta">${muniName} · Generated ${new Date().toLocaleString('en-ZA')} · Disaster Management Centre · CONFIDENTIAL — FOR OFFICIAL USE</div>
  <hr style="border:none;border-top:2pt solid #1a3a6b;margin:10pt 0"/>`;

  Object.entries(catGroups).forEach(([cat, hazards]) => {
    const col = CAT_COLOURS[cat] || '#888';
    html += `<h2 style="color:${col};border-left:4pt solid ${col};padding-left:8pt;margin-top:18pt">${cat}</h2>`;
    Object.entries(hazards).forEach(([hazard, entries]) => {
      const totalContacts = entries.reduce((t, e) => t + e.contacts.length, 0);
      html += `<h3 style="font-size:11pt;color:#1a3a6b;margin-top:10pt;margin-bottom:4pt">
        <span style="${dot(col)}"></span>${hazard}
        <span style="font-size:9pt;font-weight:400;color:#888"> — ${entries.length} org${entries.length!==1?'s':''}, ${totalContacts} contact${totalContacts!==1?'s':''}</span>
      </h3>
      <table><thead><tr>
        <th>Organisation</th><th>Contact</th><th>Position</th>
        <th>Cell</th><th>Direct Tel</th><th>Email</th><th>After Hours</th>
      </tr></thead><tbody>`;
      entries.forEach(({ org, contacts }) => {
        if (!contacts.length) {
          html += `<tr><td><strong>${org.name}</strong></td><td colspan="6" style="color:#aaa;font-style:italic">No contacts assigned</td></tr>`;
        } else {
          contacts.forEach((c, i) => {
            html += `<tr>
              <td>${i===0?`<strong>${org.name}</strong><br/><span style="font-size:8pt;color:#888">${org.sector||''}</span>`:''}</td>
              <td>${c.full_name||'—'}${c.is_primary?' <span style="background:#e8f0fe;color:#1a3a6b;padding:1px 4px;border-radius:3px;font-size:8pt;font-weight:700">PRIMARY</span>':''}</td>
              <td>${c.position||'—'}</td>
              <td>${c.cell||'—'}</td>
              <td>${c.direct_tel||'—'}</td>
              <td>${c.email||'—'}</td>
              <td>${c.after_hours||'—'}</td>
            </tr>`;
          });
        }
      });
      html += '</tbody></table>';
    });
  });

  if (unassigned.length) {
    html += `<h2 style="color:#888;border-left:4pt solid #aaa;padding-left:8pt;margin-top:18pt">Unassigned — No hazard linked</h2>
    <table><thead><tr><th>Organisation</th><th>Sector</th><th>Contact</th><th>Position</th><th>Cell</th><th>Email</th></tr></thead><tbody>`;
    unassigned.forEach(org => {
      const contacts = org.stakeholder_contacts || [];
      if (!contacts.length) {
        html += `<tr><td><strong>${org.name}</strong></td><td>${org.sector||'—'}</td><td colspan="4" style="color:#aaa;font-style:italic">No contacts</td></tr>`;
      } else {
        contacts.forEach((c, i) => {
          html += `<tr>
            <td>${i===0?`<strong>${org.name}</strong>`:''}</td>
            <td>${i===0?org.sector||'—':''}</td>
            <td>${c.full_name||'—'}</td>
            <td>${c.position||'—'}</td>
            <td>${c.cell||'—'}</td>
            <td>${c.email||'—'}</td>
          </tr>`;
        });
      }
    });
    html += '</tbody></table>';
  }
  return html;
}

// ── PDF EXPORT ────────────────────────────────────────────
function exportPDF() {
  const { catGroups, unassigned } = buildCategoryGroups();
  const muniName = window._drmsaUser?.municipalities?.name || 'Municipality';
  const date     = new Date().toLocaleString('en-ZA');
  const dot      = col => `display:inline-block;width:8px;height:8px;border-radius:50%;background:${col};margin-right:8px;vertical-align:middle`;
  const logoHtml = buildLogoHeaderHTML();

  let sectionsHtml = '';

  Object.entries(catGroups).forEach(([cat, hazards]) => {
    const col      = CAT_COLOURS[cat] || '#888';
    const totalOrgs = Object.values(hazards).reduce((t, e) => t + e.length, 0);
    const totalCts  = Object.values(hazards).reduce((t, e) => t + e.reduce((tt, x) => tt + x.contacts.length, 0), 0);

    sectionsHtml += `
      <div class="cat-header" style="border-left:5px solid ${col};background:${col}18">
        <span style="${dot(col)}"></span>
        <span class="cat-title" style="color:${col}">${cat}</span>
        <span class="cat-meta">${Object.keys(hazards).length} hazard type${Object.keys(hazards).length!==1?'s':''} · ${totalOrgs} org${totalOrgs!==1?'s':''} · ${totalCts} contact${totalCts!==1?'s':''}</span>
      </div>`;

    sectionsHtml += `<div class="pdf-two-col">`;
    Object.entries(hazards).forEach(([hazard, entries]) => {
      const totalContacts = entries.reduce((t, e) => t + e.contacts.length, 0);
      let rows = '';
      entries.forEach(({ org, contacts, via }) => {
        if (!contacts.length) {
          rows += `<tr><td class="pdf-org">${org.name}<br/><span class="pdf-sector">${org.sector||''}</span></td><td colspan="5" style="color:#aaa;font-style:italic">No contacts assigned</td><td><span class="pdf-via pdf-via-org">${via}</span></td></tr>`;
        } else {
          contacts.forEach((c, i) => {
            rows += `<tr>
              <td class="pdf-org">${i===0?`${org.name}<br/><span class="pdf-sector">${org.sector||''}</span>`:''}</td>
              <td>${c.full_name||'—'}${c.is_primary?' <span class="pdf-primary">PRIMARY</span>':''}</td>
              <td>${c.position||'—'}</td>
              <td>${c.cell||'—'}</td>
              <td>${c.direct_tel||'—'}</td>
              <td>${c.email||'—'}</td>
              <td>${c.after_hours||'—'}</td>
              <td>${i===0?`<span class="pdf-via ${via==='ORG'?'pdf-via-org':'pdf-via-ct'}">${via}</span>`:''}</td>
            </tr>`;
          });
        }
      });
      sectionsHtml += `
        <div class="pdf-col-item">
        <div class="hazard-header" style="border-left:3px solid ${col}">
          <span style="${dot(col)}"></span>${hazard}
          <span class="hazard-meta">${entries.length} org${entries.length!==1?'s':''} · ${totalContacts} contact${totalContacts!==1?'s':''}</span>
        </div>
        <table class="pdf-table">
          <thead><tr>
            <th style="width:16%">Organisation</th>
            <th style="width:14%">Contact</th>
            <th style="width:13%">Position</th>
            <th style="width:11%">Cell</th>
            <th style="width:11%">Direct Tel</th>
            <th style="width:16%">Email</th>
            <th style="width:11%">After Hours</th>
            <th style="width:8%">Via</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>`;
    });
    sectionsHtml += `</div>`;
  });

  if (unassigned.length) {
    let rows = '';
    unassigned.forEach(org => {
      const contacts = org.stakeholder_contacts || [];
      if (!contacts.length) {
        rows += `<tr><td class="pdf-org">${org.name}</td><td>${org.sector||'—'}</td><td colspan="5" style="color:#aaa;font-style:italic">No contacts assigned</td><td>—</td></tr>`;
      } else {
        contacts.forEach((c, i) => {
          rows += `<tr>
            <td class="pdf-org">${i===0?`${org.name}<br/><span class="pdf-sector">${org.sector||''}</span>`:''}</td>
            <td>${i===0?org.sector||'—':''}</td>
            <td>${c.full_name||'—'}${c.is_primary?' <span class="pdf-primary">PRIMARY</span>':''}</td>
            <td>${c.position||'—'}</td>
            <td>${c.cell||'—'}</td>
            <td>${c.email||'—'}</td>
            <td>${c.after_hours||'—'}</td>
            <td>—</td>
          </tr>`;
        });
      }
    });
    sectionsHtml += `
      <div class="cat-header" style="border-left:5px solid #888;background:#f5f5f5">
        <span style="${dot('#aaa')}"></span>
        <span class="cat-title" style="color:#888">Unassigned</span>
        <span class="cat-meta">No hazard linked · ${unassigned.length} org${unassigned.length!==1?'s':''}</span>
      </div>
      <div class="pdf-two-col">
        <div class="pdf-col-item">
          <table class="pdf-table">
            <thead><tr>
              <th>Organisation</th><th>Sector</th><th>Contact</th>
              <th>Position</th><th>Cell</th><th>Email</th><th>After Hours</th><th>Via</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Stakeholder Directory — ${muniName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#1a1a2e;background:#fff}
  @media screen{body{padding:20px;max-width:1100px;margin:0 auto}}
  @page{size:A4 landscape;margin:12mm 10mm}
  @media print{body{padding:0}}
  @media screen{
    .print-btn{display:block;margin:0 auto 20px;padding:10px 28px;background:#1a3a6b;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.04em}
    .print-btn:hover{background:#16305a}
  }
  @media print{.print-btn{display:none}}
  .pdf-header{border-bottom:2px solid #1a3a6b;padding-bottom:12px;margin-bottom:16px;display:flex;align-items:flex-start;justify-content:space-between}
  .pdf-header-left{display:flex;align-items:center;gap:14px}
  .pdf-header-text{}
  .pdf-doc-type{font-size:8px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#666;margin-top:2px}
  .pdf-muni{font-size:12px;font-weight:700;color:#111;margin-top:5px}
  .pdf-meta{font-size:8px;color:#888;margin-top:2px}
  .cat-header{padding:7px 12px;margin:16px 0 0;border-radius:4px 4px 0 0;display:flex;align-items:center;page-break-after:avoid}
  .cat-title{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
  .cat-meta{margin-left:auto;font-size:8px;opacity:.7;font-weight:400}
  .hazard-header{padding:5px 12px;background:#f0f4f8;display:flex;align-items:center;font-size:9px;font-weight:700;color:#1a3a6b;page-break-after:avoid;margin-top:1px}
  .hazard-meta{margin-left:auto;font-size:8px;font-weight:400;color:#888}
  .pdf-two-col{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start;margin:0 0 8px}
  .pdf-col-item{break-inside:avoid;page-break-inside:avoid}
  .pdf-table{width:100%;border-collapse:collapse;margin-bottom:1px;font-size:8.5px}
  .pdf-table thead{display:table-header-group}
  .pdf-table th{background:#1a3a6b;color:#fff;padding:5px 7px;text-align:left;font-size:7.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}
  .pdf-table td{padding:4px 7px;border-bottom:1px solid #eef0f3;color:#333;vertical-align:top}
  .pdf-table tr:nth-child(even) td{background:#f7f9fc}
  .pdf-org{font-weight:700;color:#1a3a6b}
  .pdf-sector{font-size:7.5px;color:#888;font-weight:400}
  .pdf-primary{font-size:7px;background:#e8f0fe;color:#1a3a6b;padding:1px 4px;border-radius:3px;font-weight:700;margin-left:4px}
  .pdf-via{font-size:7px;padding:1px 5px;border-radius:3px;font-weight:700}
  .pdf-via-org{background:#dbeafe;color:#1d4ed8}
  .pdf-via-ct{background:#dcfce7;color:#15803d}
  .pdf-footer{margin-top:20px;padding-top:8px;border-top:1px solid #eee;font-size:8px;color:#aaa;display:flex;justify-content:space-between}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">&#8659; Save as PDF / Print (Landscape A4)</button>
<div class="pdf-header">
  <div class="pdf-header-left">
    ${logoHtml}
    <div class="pdf-header-text">
      <div class="pdf-doc-type">Stakeholder Directory — Hazard Response Reference</div>
      <div class="pdf-muni">${muniName}</div>
      <div class="pdf-meta">Generated: ${date} · Disaster Management Centre · CONFIDENTIAL — FOR OFFICIAL USE</div>
    </div>
  </div>
</div>
${sectionsHtml}
<div class="pdf-footer">
  <span>${muniName} Disaster Management Centre</span>
  <span>Generated ${date}</span>
</div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
  showToast('✓ PDF preview opened — click Print to save as PDF');
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
