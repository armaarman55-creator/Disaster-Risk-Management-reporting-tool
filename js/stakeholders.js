// js/stakeholders.js — Stakeholder directory with hazard assignment
import { supabase } from './supabase.js';
import { showDownloadMenu } from './download.js';

let _muniId = null;
let _orgs = [];

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
  'Hydro-meteorological': ['Flooding','Flash flooding','Storm surge','Drought','Extreme heat','Extreme cold','High winds','Hailstorm','Lightning','Tornado / Whirlwind'],
  'Geological': ['Earthquake','Landslide / Mudslide','Sinkhole','Tsunami'],
  'Biological': ['Disease outbreak','Animal disease','Pest infestation','Algal bloom','Human epidemic / Pandemic'],
  'Fire': ['Wildfire / Veld fire','Urban fire','Industrial fire','Informal settlement fire'],
  'Technological': ['Hazardous materials spill','Chemical leak','Gas leak','Dam failure','Bridge failure','Building collapse','Power grid failure','Water supply failure','Sewage / Wastewater failure','Transport accident','Train accident'],
  'Socio-economic': ['Civil unrest','Illegal land invasion','Food insecurity','Mass casualty event','Gender-based violence']
};

const CAT_COLOURS = {
  'Hydro-meteorological': '#58a6ff',
  'Geological': '#d29922',
  'Biological': '#3fb950',
  'Fire': '#f85149',
  'Technological': '#bc8cff',
  'Socio-economic': '#f0883e'
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
          <label style="display:inline-flex;align-items:center;gap:5px;background:var(--bg3);border:1px solid ${sel.includes(h)?CAT_COLOURS[cat]:'var(--border)'};border-radius:5px;padding:3px 8px;cursor:pointer;font-size:11px;color:${sel.includes(h)?CAT_COLOURS[cat]:'var(--text2)'}">
            <input type="checkbox" class="${prefix}-hz-cb" value="${h}" ${sel.includes(h)?'checked':''} style="width:11px;height:11px;accent-color:${CAT_COLOURS[cat]}"/>
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
        getPDF: () => exportPDF(),
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
    list.innerHTML = filtered.length ? filtered.map(org => renderOrgCard(org)).join('') : emptyState('No organisations in this sector.');
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
          <span class="badge ${org.is_active?'b-green':'b-gray'}">${org.is_active
