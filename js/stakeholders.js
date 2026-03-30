// js/stakeholders.js — Stakeholder directory with hazard assignment
import { supabase } from './supabase.js';
import { showDownloadMenu } from './download.js';

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
        filename: `DRMSA-stakeholders-${muniName.replace(/\s+/g,'-')}`,
        getPDF:     () => exportPDF(),
        getCSVRows: () => getStakeholderCSVRows(),
        getDocHTML: () => getStakeholderDocHTML(muniName)
      });
    });
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

// ── ORG & CONTACT FORMS (unchanged) ──────────────────────────────────────────────
function showOrgForm(existing) { /* ... keep your existing showOrgForm ... */ 
  // (Paste your original showOrgForm function here - unchanged)
  const area = document.getElementById('org-form-area');
  if (!area) return;
  if (area.innerHTML && !existing) { area.innerHTML = ''; return; }

  const org = existing || {};
  const orgHazards = Array.isArray(org.hazard_types) ? org.hazard_types : [];

  area.innerHTML = `... (your original form code) ...`;   // Keep as is
  // ... rest of your original showOrgForm ...
}

function showContactForm(orgId, existing) { /* keep your original */ 
  // Paste your original showContactForm here
}

function bindOrgEvents() { /* keep your original */ 
  // Paste your original bindOrgEvents here
}

// ── GROUPING & CSV / DOC (unchanged) ─────────────────────────────────────────────
function buildHazardGroups() { /* keep original */ }
function buildCategoryGroups() { /* keep original */ }
function getStakeholderCSVRows() { /* keep original */ }
function getStakeholderDocHTML(muniName) { /* keep original */ }

// ── COMPACT PDF EXPORT ───────────────────────────────────────────────────────────
async function exportPDF() {
  const { catGroups } = buildCategoryGroups();
  const muniName = window._drmsaUser?.municipalities?.name || 'Municipality';
  const date = new Date().toLocaleString('en-ZA');

  const { data: muni } = await supabase
    .from('municipalities')
    .select('logo_main_url, logo_dm_url, logo_display_mode')
    .eq('id', _muniId)
    .single();

  const logoMain = muni?.logo_main_url || null;
  const logoDM   = muni?.logo_dm_url   || null;
  const mode     = muni?.logo_display_mode || 'main';

  let logoHTML = '';
  if (mode === 'both' && logoMain && logoDM) {
    logoHTML = `<div style="display:flex;gap:15px;justify-content:center;margin:10px 0 15px 0;">
      <img src="${logoMain}" style="max-height:48px;max-width:160px;object-fit:contain"/>
      <img src="${logoDM}" style="max-height:48px;max-width:160px;object-fit:contain"/>
    </div>`;
  } else if (mode === 'dm' && logoDM) {
    logoHTML = `<div style="text-align:center;margin:10px 0 15px 0;"><img src="${logoDM}" style="max-height:55px;object-fit:contain"/></div>`;
  } else if (logoMain) {
    logoHTML = `<div style="text-align:center;margin:10px 0 15px 0;"><img src="${logoMain}" style="max-height:55px;object-fit:contain"/></div>`;
  }

  let sectionsHTML = '';
  const categories = Object.entries(catGroups);

  for (let i = 0; i < categories.length; i += 2) {
    const left = categories[i];
    const right = categories[i + 1];

    sectionsHTML += `<div class="hazard-grid">`;

    if (left) {
      const [catName, hazards] = left;
      const col = CAT_COLOURS[catName] || '#1a3a6b';
      sectionsHTML += `<div class="hazard-column"><div class="cat-header" style="color:${col};border-left:5px solid ${col}">${catName}</div>`;

      Object.entries(hazards).forEach(([hazard, entries]) => {
        const totalContacts = entries.reduce((t, e) => t + (e.contacts?.length || 0), 0);
        let rows = '';
        entries.forEach(({ org, contacts }) => {
          if (!contacts || contacts.length === 0) {
            rows += `<tr><td><strong>${org.name}</strong><br><span class="pdf-sector">${org.sector||''}</span></td><td colspan="6" style="color:#888;font-style:italic">No contacts</td></tr>`;
          } else {
            contacts.forEach((c, idx) => {
              rows += `<tr>
                <td>${idx === 0 ? `<strong>${org.name}</strong><br><span class="pdf-sector">${org.sector||''}</span>` : ''}</td>
                <td>${c.full_name||'—'}${c.is_primary ? ' <span class="pdf-primary">PRIMARY</span>' : ''}</td>
                <td>${c.position||'—'}</td>
                <td>${c.cell||'—'}</td>
                <td>${c.direct_tel||'—'}</td>
                <td>${c.email||'—'}</td>
                <td>${c.after_hours||'—'}</td>
              </tr>`;
            });
          }
        });

        sectionsHTML += `
          <div class="hazard-item">
            <div class="hazard-header" style="border-left:3px solid ${col}">${hazard} <span class="hazard-meta">(${entries.length} orgs · ${totalContacts} contacts)</span></div>
            <table class="pdf-table"><thead><tr><th>Org</th><th>Contact</th><th>Position</th><th>Cell</th><th>Tel</th><th>Email</th><th>After hrs</th></tr></thead><tbody>${rows}</tbody></table>
          </div>`;
      });
      sectionsHTML += `</div>`;
    }

    if (right) {
      const [catName, hazards] = right;
      const col = CAT_COLOURS[catName] || '#1a3a6b';
      sectionsHTML += `<div class="hazard-column"><div class="cat-header" style="color:${col};border-left:5px solid ${col}">${catName}</div>`;

      Object.entries(hazards).forEach(([hazard, entries]) => {
        const totalContacts = entries.reduce((t, e) => t + (e.contacts?.length || 0), 0);
        let rows = '';
        entries.forEach(({ org, contacts }) => {
          if (!contacts || contacts.length === 0) {
            rows += `<tr><td><strong>${org.name}</strong><br><span class="pdf-sector">${org.sector||''}</span></td><td colspan="6" style="color:#888;font-style:italic">No contacts</td></tr>`;
          } else {
            contacts.forEach((c, idx) => {
              rows += `<tr>
                <td>${idx === 0 ? `<strong>${org.name}</strong><br><span class="pdf-sector">${org.sector||''}</span>` : ''}</td>
                <td>${c.full_name||'—'}${c.is_primary ? ' <span class="pdf-primary">PRIMARY</span>' : ''}</td>
                <td>${c.position||'—'}</td>
                <td>${c.cell||'—'}</td>
                <td>${c.direct_tel||'—'}</td>
                <td>${c.email||'—'}</td>
                <td>${c.after_hours||'—'}</td>
              </tr>`;
            });
          }
        });

        sectionsHTML += `
          <div class="hazard-item">
            <div class="hazard-header" style="border-left:3px solid ${col}">${hazard} <span class="hazard-meta">(${entries.length} orgs · ${totalContacts} contacts)</span></div>
            <table class="pdf-table"><thead><tr><th>Org</th><th>Contact</th><th>Position</th><th>Cell</th><th>Tel</th><th>Email</th><th>After hrs</th></tr></thead><tbody>${rows}</tbody></table>
          </div>`;
      });
      sectionsHTML += `</div>`;
    }

    sectionsHTML += `</div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Stakeholder Directory — ${muniName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#1a1a2e;background:#fff;line-height:1.3}
  @page{size:A4 landscape;margin:10mm}
  .hazard-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.9cm;margin:12px 0 18px 0;}
  .hazard-column{break-inside:avoid;page-break-inside:avoid;}
  .cat-header{font-size:12px;font-weight:800;text-transform:uppercase;padding:6px 10px;margin-bottom:8px;border-radius:4px;background:#f8f9fa;page-break-after:avoid;}
  .hazard-header{font-size:10px;font-weight:700;padding:5px 9px;margin:8px 0 5px 0;background:#f0f4f8;border-left:3px solid #1a3a6b;page-break-after:avoid;}
  .hazard-meta{font-size:8px;color:#666;margin-left:6px;}
  .pdf-table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:8.5px;}
  .pdf-table th{background:#1a3a6b;color:#fff;padding:5px 7px;font-size:7.5px;font-weight:700;text-transform:uppercase;}
  .pdf-table td{padding:4px 7px;border-bottom:1px solid #e5e7eb;}
  .pdf-table tr:nth-child(even) td{background:#f9fafb;}
  .pdf-primary{font-size:7px;background:#e8f0fe;color:#1a3a6b;padding:1px 4px;border-radius:3px;}
  .pdf-sector{font-size:7.2px;color:#777;}
  .save-btn{display:block;margin:15px auto;padding:10px 25px;background:#1a3a6b;color:white;border:none;border-radius:6px;font-weight:700;cursor:pointer;}
</style>
</head>
<body>
  <div style="text-align:center;margin-bottom:8px">
    <div style="font-size:17px;font-weight:800;color:#1a3a6b">STAKEHOLDER DIRECTORY</div>
    <div style="font-size:10px;color:#555">Hazard Response Reference • ${muniName}</div>
  </div>
  
  ${logoHTML}
  
  <div style="font-size:8.5px;color:#777;text-align:center;margin-bottom:15px">
    Generated: ${date} • CONFIDENTIAL
  </div>

  ${sectionsHTML}

  <button class="save-btn" onclick="window.print()">💾 Save as PDF (A4 Landscape)</button>

  <div style="margin-top:20px;padding-top:10px;border-top:1px solid #ddd;font-size:8px;color:#888;text-align:center">
    ${muniName} Disaster Management Centre
  </div>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

function emptyState(msg) {
  return `<div style="text-align:center;padding:48px 20px;color:var(--text3);font-size:12px">${msg}</div>`;
}

function showToast(msg, isError=false) {
  document.querySelectorAll('.drmsa-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'drmsa-toast';
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:${isError?'var(--bg2)':'var(--bg2)'};border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,.35);display:flex;align-items:center;gap:10px;max-width:340px;transition:opacity .3s;`;
  t.innerHTML = `<span style="font-size:16px">${isError?'✕':'✓'}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},3000);
}
