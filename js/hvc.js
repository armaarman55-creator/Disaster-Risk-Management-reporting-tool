// js/hvc.js — Full HVC Assessment Tool (Annexure 3 intact)
import { supabase } from './supabase.js';
import { writeAudit } from './audit.js';
import { showDownloadMenu, docHeader } from './download.js';

function showToast(msg, isError=false) {
  document.querySelectorAll('.drmsa-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'drmsa-toast';
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:var(--bg2);border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,.35);display:flex;align-items:center;gap:10px;max-width:340px;transition:opacity .3s;font-family:Inter,system-ui,sans-serif`;
  t.innerHTML = `<span style="font-size:16px">${isError?'✕':'✓'}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},3500);
}

let _muniId = null;
let _user   = null;
let _wards  = [];

// ── SCORING DESCRIPTORS (from Excel Annexure 3) ──────────
const DESCRIPTORS = {
  affected_area: {
    1: { label: 'Very small area',    desc: 'Affects only a very small part (roughly 20%) of the local municipality' },
    2: { label: 'Small area',         desc: 'Affects a small part (roughly 40%) of the local municipality' },
    3: { label: 'Just over half',     desc: 'Affects a part (roughly 60%) of the local municipality' },
    4: { label: 'Large area',         desc: 'Affects a large part (roughly 80%) of the local municipality' },
    5: { label: 'Whole municipality', desc: 'Affects the whole local municipality' }
  },
  probability: {
    1: { label: 'Highly improbable', desc: 'Unlikely' },
    2: { label: 'Slight probability', desc: 'Possible' },
    3: { label: 'Possible',          desc: '50/50 chance' },
    4: { label: 'Very good chance',  desc: 'Likely' },
    5: { label: 'Highly probable',   desc: 'Certain' }
  },
  frequency: {
    1: { label: 'Once every 5+ years', desc: 'Can occur once every 5 years or more' },
    2: { label: 'Annually',            desc: 'Can occur annually' },
    3: { label: 'Seasonally',          desc: 'Can occur seasonally' },
    4: { label: 'Monthly',             desc: 'Can occur monthly' },
    5: { label: 'Weekly',              desc: 'Can occur weekly' }
  },
  predictability: {
    1: { label: 'Predictable',         desc: 'Predictable' },
    2: { label: 'Fairly predictable',  desc: 'Fairly predictable' },
    3: { label: '50/50',               desc: '50/50 chance to predict' },
    4: { label: 'Slight chance',       desc: 'Slight chance to predict' },
    5: { label: 'Cannot predict',      desc: 'Cannot predict' }
  },
  vulnerability: {
    1: { label: 'Very Low',    desc: 'Negligible vulnerability — strong existing protections in place' },
    2: { label: 'Low',         desc: 'Minor vulnerability — some protections exist' },
    3: { label: 'Moderate',    desc: 'Moderate vulnerability — partial measures in place' },
    4: { label: 'High',        desc: 'High vulnerability — limited protections, high exposure' },
    5: { label: 'Very High',   desc: 'Extreme vulnerability — no protections, maximum exposure' }
  },
  capacity: {
    1: { label: 'Very Low',    desc: 'No capacity — resources, systems and people largely absent' },
    2: { label: 'Low',         desc: 'Limited capacity — some resources but significant gaps' },
    3: { label: 'Moderate',    desc: 'Moderate capacity — partial systems and resources available' },
    4: { label: 'High',        desc: 'Good capacity — well-resourced with minor gaps' },
    5: { label: 'Very High',   desc: 'Excellent capacity — fully resourced, trained and ready' }
  },
  priority: {
    1: { label: 'Very Low',    desc: 'Minimal — not an immediate concern' },
    2: { label: 'Low',         desc: 'Low priority — monitor but no urgent action' },
    3: { label: 'Moderate',    desc: 'Moderate — plan for medium-term action' },
    4: { label: 'High',        desc: 'High — requires near-term attention and resources' },
    5: { label: 'Critical',    desc: 'Critical — immediate action required' }
  }
};

// ── HAZARD CATEGORIES ────────────────────────────────────
const HAZARD_CATEGORIES = {
  'Hydro-meteorological': ['Floods','Droughts','Hailstorms','Strong Winds','Storm Surges','Extreme Heat','Cold Fronts','Lightning','Tornadoes','Snow/Ice'],
  'Geological':           ['Earthquakes','Sinkholes','Landslides','Soil Erosion'],
  'Biological':           ['Epidemics','Animal Disease','Locusts','Invasive Species','Waterborne Disease'],
  'Fire':                 ['Veld Fires','Structural Fires','Informal Settlement Fires','Industrial Fires','Agricultural Fires'],
  'Technological':        ['Chemical Spills/HAZMAT','Electricity Disruption','Water Supply Disruption','Sewage Failure','Road/Rail Accidents','Dam Failure','Industrial Accidents','Oil Spills','Pipeline Failures','Telecoms Failure','Nuclear/Radiological'],
  'Socio-economic':       ['Civil Unrest','Migration Pressure','Large Gatherings','Food Insecurity','Informal Settlement Hazards','Crime/Violence']
};

const RISK_BAND  = (r) => r<=5?'Negligible':r<=10?'Low':r<=15?'Tolerable':r<=20?'High':'Extremely High';
const BAND_CLS   = { 'Negligible':'c-n','Low':'c-l','Tolerable':'c-t','High':'c-h','Extremely High':'c-xh' };
const PRIO_LEVEL = (p) => p<=2?'LOW':p<=3.5?'MEDIUM':'HIGH';
const slug       = (s) => s.toLowerCase().replace(/[^a-z0-9]/g,'-');

// In-memory scores
const _scores = {};
// Custom hazards added by user
let _customHazards = [];
// Per-hazard ward selections for searchable picker
let _hvcWardSelections = {};
// Track which hazard pickers have been initialised
const _hvcPickerInited = new Set();
// Draft assessment ID — set when auto-save creates a draft record
let _draftId = null;
// Auto-save debounce timer
let _autoSaveTimer = null;

// ── HVC WARD PICKER ───────────────────────────────────────
function initHvcWardPicker(hazardId, existingWards = []) {
  _hvcWardSelections[hazardId] = [...existingWards];
  renderHvcWardTags(hazardId);

  const search   = document.getElementById(`hvc-ward-search-${hazardId}`);
  const dropdown = document.getElementById(`hvc-ward-dd-${hazardId}`);
  if (!search || !dropdown) return;

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { dropdown.style.display = 'none'; return; }

    const matches = _wards.filter(w => {
      const num  = String(w.ward_number);
      const name = (w.area_name||'').toLowerCase();
      return (num.includes(q) || name.includes(q)) &&
             !_hvcWardSelections[hazardId].includes(w.ward_number);
    }).slice(0, 10);

    if (!matches.length) { dropdown.style.display = 'none'; return; }

    dropdown.innerHTML = matches.map(w =>
      `<div data-ward="${w.ward_number}"
        style="padding:6px 10px;cursor:pointer;border-bottom:1px solid var(--border);font-size:11px;transition:background .1s"
        onmouseenter="this.style.background='var(--bg3)'"
        onmouseleave="this.style.background=''"
        >Ward ${w.ward_number}${w.area_name?' — '+w.area_name:''}</div>`
    ).join('');
    dropdown.style.display = 'block';

    dropdown.querySelectorAll('[data-ward]').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        _hvcWardSelections[hazardId].push(parseInt(item.dataset.ward));
        search.value = '';
        dropdown.style.display = 'none';
        renderHvcWardTags(hazardId);
        recalcHazardWards(hazardId);
      });
    });
  });

  // Close on blur
  search.addEventListener('blur', () => {
    setTimeout(() => { dropdown.style.display = 'none'; }, 150);
  });

  // Select all wards button
  document.getElementById(`hvc-ward-all-${hazardId}`)?.addEventListener('click', () => {
    _hvcWardSelections[hazardId] = _wards.map(w => w.ward_number);
    search.value = '';
    dropdown.style.display = 'none';
    renderHvcWardTags(hazardId);
    recalcHazardWards(hazardId);
  });

  // Close on outside click
  document.addEventListener('click', function closeDD(e) {
    if (!search.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
      document.removeEventListener('click', closeDD);
    }
  }, { once: true });
}

function renderHvcWardTags(hazardId) {
  const container = document.getElementById(`hvc-ward-tags-${hazardId}`);
  if (!container) return;
  const selected = _hvcWardSelections[hazardId] || [];

  container.innerHTML = selected.length
    ? selected.map(w => {
        const wd = _wards.find(x => x.ward_number === w);
        return `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--blue-dim);border:1px solid rgba(88,166,255,.25);color:var(--blue);border-radius:10px;padding:2px 7px;font-size:10px;font-weight:600">
          Ward ${w}${wd?.area_name?' · '+wd.area_name:''}
          <span style="cursor:pointer;opacity:.7;font-size:12px;line-height:1" data-remove="${w}">×</span>
        </span>`;
      }).join('')
    : '<span style="font-size:10px;color:var(--text3);font-style:italic">No wards selected</span>';

  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      _hvcWardSelections[hazardId] = (_hvcWardSelections[hazardId]||[]).filter(w => w !== parseInt(btn.dataset.remove));
      renderHvcWardTags(hazardId);
      recalcHazardWards(hazardId);
    });
  });

  // Sync to _scores
  recalcHazardWards(hazardId);
}

function recalcHazardWards(hazardId) {
  if (_scores[hazardId]) {
    _scores[hazardId].wards = _hvcWardSelections[hazardId] || [];
  }
}

export async function initHVC(user) {
  _user   = user;
  _muniId = user?.municipality_id;

  // Load stakeholder orgs for role player dropdowns
  let _stakeholderOrgs = [];
  if (_muniId) {
    const { data: orgsData } = await supabase
      .from('stakeholder_orgs')
      .select('id,name,sector')
      .eq('municipality_id', _muniId)
      .eq('is_active', true)
      .order('name');
    _stakeholderOrgs = orgsData || [];
    window._hvcStakeholderOrgs = _stakeholderOrgs;
  }

  // Load wards for affected areas selector
  if (_muniId) {
    const { data } = await supabase
      .from('wards')
      .select('ward_number,area_name')
      .eq('municipality_id', _muniId)
      .order('ward_number');
    _wards = data || [];

    // If no wards in DB but municipality has a ward_count, seed them
    if (!_wards.length && _user?.municipalities?.ward_count > 0) {
      const wardCount = _user.municipalities.ward_count;
      const rows = Array.from({ length: wardCount }, (_, i) => ({
        municipality_id: _muniId,
        ward_number: i + 1,
        area_name: null
      }));
      const { data: seeded, error } = await supabase
        .from('wards')
        .insert(rows)
        .select('ward_number,area_name');
      if (!error && seeded) {
        _wards = seeded;
        console.log(`Seeded ${seeded.length} wards for municipality`);
      }
    }
  }

  await renderHVCPage();
}

// ── MAIN PAGE ────────────────────────────────────────────
async function renderHVCPage() {
  const page = document.getElementById('page-hvc');
  if (!page) return;

  const { data: assessments } = await supabase
    .from('hvc_assessments')
    .select('id,label,season,year,hazard_count,status,created_at')
    .eq('municipality_id', _muniId)
    .order('created_at', { ascending: false });

  // If there's an active draft in progress, restore the form instead of showing list
  if (_draftId) {
    const draft = (assessments || []).find(a => a.id === _draftId);
    if (draft) {
      page.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
          <div style="padding:12px 20px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
            <div>
              <div style="font-size:15px;font-weight:800;color:var(--text)">HVC Assessment Tool</div>
              <div style="font-size:11px;color:var(--text3);margin-top:1px">Hazard · Vulnerability · Capacity — DMA Act 57 of 2002 · Annexure 3</div>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm" id="hvc-ref-btn">Risk reference</button>
              <button class="btn btn-sm btn-red" id="hvc-new-btn">+ New assessment</button>
            </div>
          </div>
          <div style="flex:1;overflow-y:auto" id="hvc-content">
            ${renderNewForm()}
          </div>
        </div>`;

      document.getElementById('hvc-new-btn')?.addEventListener('click', () => {
        _draftId = null;
        _customHazards = [];
        Object.keys(_scores).forEach(k => delete _scores[k]);
        _hvcWardSelections = {};
        _hvcPickerInited.clear();
        document.getElementById('hvc-content').innerHTML = renderNewForm();
        bindFormEvents();
      });
      document.getElementById('hvc-ref-btn')?.addEventListener('click', () => showReferenceModal());

      // Restore form field values from _scores in memory
      const labelEl = document.getElementById('a-label');
      if (labelEl && draft.label) labelEl.value = draft.label;
      const seasonEl = document.getElementById('a-season');
      if (seasonEl && draft.season) seasonEl.value = draft.season;
      const yearEl = document.getElementById('a-year');
      if (yearEl && draft.year) yearEl.value = draft.year;

      // Re-tick and restore scored hazards from _scores memory
      Object.entries(_scores).forEach(([hid, s]) => {
        const cb = document.querySelector(`.hvc-applicable[data-hazard="${hid}"]`);
        if (cb) {
          cb.checked = true;
          const body = document.getElementById(`hbody-${hid}`);
          if (body) body.style.display = 'block';
        }
        const fields = {
          [`${hid}_aa`]: s.aa, [`${hid}_pb`]: s.pb,
          [`${hid}_fr`]: s.fr, [`${hid}_pr`]: s.pr,
          [`${hid}_vp`]: s.vp, [`${hid}_ve`]: s.ve,
          [`${hid}_vs`]: s.vs, [`${hid}_vt`]: s.vt,
          [`${hid}_vn`]: s.vn, [`${hid}_ci`]: s.ci,
          [`${hid}_cp`]: s.cp, [`${hid}_cq`]: s.cq,
          [`${hid}_cf`]: s.cf, [`${hid}_ch`]: s.ch,
          [`${hid}_cs`]: s.cs, [`${hid}_pi`]: s.pi,
          [`${hid}_pu`]: s.pu, [`${hid}_pg`]: s.pg,
        };
        Object.entries(fields).forEach(([key, val]) => {
          if (val == null) return;
          const sel = document.querySelector(`[data-key="${key}"]`);
          if (sel) { sel.value = String(val); window.hvcScoreChanged(sel); }
        });
        if (s.wards?.length) {
          _hvcWardSelections[hid] = s.wards;
          _hvcPickerInited.add(hid);
          requestAnimationFrame(() => initHvcWardPicker(hid, s.wards));
        }
      });

      bindFormEvents();
      showToast('✓ Draft restored — your progress is still here.');
      return;
    } else {
      // Draft ID exists but record not found — clear stale state
      _draftId = null;
    }
  }

  page.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div style="padding:12px 20px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--text)">HVC Assessment Tool</div>
          <div style="font-size:11px;color:var(--text3);margin-top:1px">Hazard · Vulnerability · Capacity — DMA Act 57 of 2002 · Annexure 3</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" id="hvc-ref-btn">Risk reference</button>
          <button class="btn btn-sm btn-red" id="hvc-new-btn">+ New assessment</button>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto" id="hvc-content">
        ${assessments?.length ? renderAssessmentList(assessments) : renderNewForm()}
      </div>
    </div>`;

  document.getElementById('hvc-new-btn')?.addEventListener('click', () => {
    _draftId = null;
    _customHazards = [];
    Object.keys(_scores).forEach(k => delete _scores[k]);
    _hvcWardSelections = {};
    _hvcPickerInited.clear();
    document.getElementById('hvc-content').innerHTML = renderNewForm();
    bindFormEvents();
  });

  document.getElementById('hvc-ref-btn')?.addEventListener('click', () => showReferenceModal());

  if (assessments?.length) bindListEvents();
  else bindFormEvents();
}

// ── ASSESSMENT LIST ───────────────────────────────────────
function renderAssessmentList(assessments) {
  return `<div style="padding:22px">
    <div class="sec-hdr">
      <div><div class="sec-hdr-title">Assessments</div><div class="sec-hdr-sub">${assessments.length} saved</div></div>
    </div>
    ${assessments.map(a => `
      <div class="rec-card" style="margin-bottom:10px" id="assessment-card-${a.id}">
        <div class="rec-head">
          <div style="flex:1">
            <div class="rec-name">${a.label || (a.season + ' ' + a.year)}</div>
            <div class="rec-meta">
              ${a.created_at ? new Date(a.created_at).toLocaleDateString('en-ZA', {day:'numeric',month:'long',year:'numeric'}) : '—'}
              · ${a.hazard_count || 0} hazards scored
              · ${a.lead_assessor ? 'Lead: ' + a.lead_assessor : ''}
              · ${a.season || ''} ${a.year || ''}
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <span class="badge ${a.status==='complete'?'b-green':'b-amber'}">${(a.status||'draft').toUpperCase()}</span>
            <button class="btn btn-sm" data-open="${a.id}">View</button>
            <button class="btn btn-sm btn-green" data-edit="${a.id}">Edit</button>
            <button class="btn btn-sm" data-download="${a.id}" data-label="${a.label||a.season+' '+a.year}">↓ Download</button>
            <button class="btn btn-sm btn-red" data-delete="${a.id}" data-label="${a.label||a.season+' '+a.year}">Delete</button>
          </div>
        </div>
      </div>`).join('')}
  </div>`;
}

function bindListEvents() {
  document.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => openAssessment(btn.dataset.open));
  });

  document.querySelectorAll('[data-download]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id    = btn.dataset.download;
      const label = btn.dataset.label;
      const muniName = _user?.municipalities?.name || 'Municipality';
      const [scoresRes, assessRes] = await Promise.all([
        supabase.from('hvc_hazard_scores').select('*').eq('assessment_id', id).order('risk_rating', { ascending: false }),
        supabase.from('hvc_assessments').select('*').eq('id', id).single()
      ]);
      const scores = scoresRes.data || [];
      const assessment = assessRes.data || {};
      showDownloadMenu(btn, {
        filename: `HVC-${label.replace(/\s+/g,'-')}-${muniName.replace(/\s+/g,'-')}`,
        getPDF:     () => exportAssessmentPDF(id, label),
        getCSVRows: () => getHVCCSVRows(scores, assessment, muniName),
        getDocHTML: () => getHVCDocHTML(scores, assessment, muniName)
      });
    });
  });

  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => editAssessment(btn.dataset.edit));
  });

  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteAssessment(btn.dataset.delete, btn.dataset.label));
  });
}

// ── NEW ASSESSMENT FORM ───────────────────────────────────
function renderNewForm() {
  const cats = Object.keys(HAZARD_CATEGORIES);
  return `<div style="padding:22px">
    <div class="panel" style="margin-bottom:16px">
      <div class="ph"><div class="ph-title">Assessment details</div></div>
      <div class="pb">
        <div class="frow">
          <div class="fl"><span class="fl-label">Label</span><input class="fl-input" id="a-label" placeholder="e.g. Summer 2025"/></div>
          <div class="fl"><span class="fl-label">Season</span>
            <select class="fl-sel" id="a-season"><option>Summer</option><option>Autumn</option><option>Winter</option><option>Spring</option><option>Annual</option></select>
          </div>
        </div>
        <div class="frow">
          <div class="fl"><span class="fl-label">Year</span><input class="fl-input" id="a-year" type="number" value="${new Date().getFullYear()}"/></div>
          <div class="fl"><span class="fl-label">Lead assessor</span><input class="fl-input" id="a-lead" placeholder="Full name"/></div>
        </div>
      </div>
    </div>

    <!-- Category tabs -->
    <div style="display:flex;gap:2px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:3px;margin-bottom:16px;flex-wrap:wrap" id="hvc-tabs">
      ${cats.map((cat,i) => `
        <div class="hvc-tab ${i===0?'on':''}" data-cat="${cat}"
          style="flex:1;min-width:130px;text-align:center;padding:7px 8px;font-size:11px;font-weight:600;border-radius:5px;cursor:pointer;
          color:${i===0?'var(--text)':'var(--text3)'};background:${i===0?'var(--bg2)':'transparent'};transition:all .15s;white-space:nowrap">
          ${cat}
        </div>`).join('')}
      <div class="hvc-tab" data-cat="__custom__"
        style="flex:1;min-width:100px;text-align:center;padding:7px 8px;font-size:11px;font-weight:600;border-radius:5px;cursor:pointer;color:var(--purple);background:transparent;transition:all .15s;white-space:nowrap">
        + Custom
      </div>
    </div>

    <!-- Hazard sections -->
    ${cats.map((cat,i) => `
      <div id="tab-${slug(cat)}" style="display:${i===0?'block':'none'}">
        <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);padding:6px 0;border-bottom:1px solid var(--border);margin-bottom:10px">
          ${cat}
        </div>
        ${HAZARD_CATEGORIES[cat].map(h => renderHazardRow(h, cat)).join('')}
      </div>`).join('')}

    <!-- Custom hazards tab -->
    <div id="tab----custom--" style="display:none">
      <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--purple);padding:6px 0;border-bottom:1px solid var(--border);margin-bottom:10px">
        Custom hazards
      </div>
      <div id="custom-hazard-list"></div>
      <div class="panel" style="margin-top:12px">
        <div class="ph"><div class="ph-title">Add custom hazard</div></div>
        <div class="pb">
          <div class="frow">
            <div class="fl"><span class="fl-label">Hazard name</span><input class="fl-input" id="custom-h-name" placeholder="e.g. Coastal erosion"/></div>
            <div class="fl"><span class="fl-label">Category</span>
              <select class="fl-sel" id="custom-h-cat">
                ${Object.keys(HAZARD_CATEGORIES).map(c=>`<option>${c}</option>`).join('')}
                <option>Other</option>
              </select>
            </div>
          </div>
          <button class="btn btn-sm btn-purple" id="add-custom-hazard-btn" style="border-color:var(--purple);color:var(--purple)">+ Add hazard</button>
        </div>
      </div>
    </div>

    <div style="margin-top:20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" id="save-hvc-btn">Save assessment</button>
      <button class="btn btn-sm" id="preview-matrix-btn">Preview risk matrix</button>
      <span id="hvc-save-msg" style="font-size:12px;color:var(--green);display:none">✓ Saved</span>
    </div>
    <div id="risk-matrix-wrap" style="display:none;margin-top:20px">${renderRiskMatrix()}</div>
  </div>`;
}

// ── HAZARD ROW ────────────────────────────────────────────
function renderHazardRow(hazard, cat, isCustom=false) {
  const id = slug(hazard);

  const makeSelect = (key, descGroup, extraStyle='') => {
    const opts = Object.entries(DESCRIPTORS[descGroup]||{}).map(([v,d]) =>
      `<option value="${v}">${v} — ${d.label}</option>`
    ).join('');
    return `
      <select class="fl-sel hvc-score" style="font-size:11px;padding:4px 6px${extraStyle}"
        data-hazard="${id}" data-key="${key}" data-desc="${descGroup}"
        onchange="hvcScoreChanged(this)">
        <option value="">— not scored —</option>
        ${opts}
      </select>
      <div class="hvc-hint" id="hint-${id}-${key}" style="font-size:10px;color:var(--text3);margin-top:3px;min-height:14px;line-height:1.4;display:none"></div>`;
  };

  // Build ward options — use DB wards if available, else generate from municipality ward_count
  let wardOpts = '';
  if (_wards.length) {
    wardOpts = _wards.map(w =>
      `<option value="${w.ward_number}">Ward ${w.ward_number}${w.area_name ? ' — ' + w.area_name : ''}</option>`
    ).join('');
  } else {
    // Fall back to generating ward numbers from municipality ward_count
    const wardCount = _user?.municipalities?.ward_count || 0;
    if (wardCount > 0) {
      wardOpts = Array.from({ length: wardCount }, (_, i) =>
        `<option value="${i + 1}">Ward ${i + 1}</option>`
      ).join('');
    } else {
      // Last resort — allow free text entry instead of a select
      wardOpts = null;
    }
  }

  return `
    <div class="panel" style="margin-bottom:8px" id="hrow-${id}">
      <!-- Header -->
      <div style="padding:9px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text)">
            <input type="checkbox" class="hvc-applicable" data-hazard="${id}"
              style="width:15px;height:15px;cursor:pointer;accent-color:var(--red)"
              onchange="toggleHazardApplicable('${id}', this.checked)"/>
            ${hazard}
          </label>
          ${isCustom ? `<span class="badge b-purple" style="font-size:9px">CUSTOM</span>` : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:11px;color:var(--text3)">Risk: <strong id="risk-val-${id}" style="color:var(--text)">—</strong></span>
          <span class="badge b-gray" id="risk-chip-${id}">NOT APPLICABLE</span>
        </div>
      </div>

      <!-- Collapsed state -->
      <div id="hbody-${id}" style="display:none">

        <!-- A. Hazard Analysis -->
        <div style="padding:10px 14px;border-bottom:1px solid var(--border)">
          <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--blue);margin-bottom:10px">A. HAZARD ANALYSIS</div>

          <!-- Affected area + Wards -->
          <div class="frow" style="margin-bottom:10px">
            <div class="fl">
              <span class="fl-label">Affected area</span>
              ${makeSelect(`${id}_aa`, 'affected_area')}
            </div>
            <div class="fl">
              <span class="fl-label">Wards/areas affected</span>
              <div style="position:relative">
                <input id="hvc-ward-search-${id}" class="fl-input"
                  placeholder="Search ward number or area…"
                  autocomplete="off" style="font-size:11px"/>
                <div id="hvc-ward-dd-${id}"
                  style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg2);border:1px solid var(--border2);border-radius:0 0 6px 6px;max-height:140px;overflow-y:auto;z-index:50">
                </div>
              </div>
              <div id="hvc-ward-tags-${id}" style="display:flex;flex-wrap:wrap;gap:3px;margin-top:5px;min-height:20px"></div>
              <button type="button" id="hvc-ward-all-${id}"
                style="margin-top:4px;font-size:10px;color:var(--text3);background:none;border:none;cursor:pointer;padding:0;text-decoration:underline;text-align:left">
                Select all wards
              </button>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div class="fl"><span class="fl-label">Probability</span>${makeSelect(`${id}_pb`, 'probability')}</div>
            <div class="fl"><span class="fl-label">Frequency</span>${makeSelect(`${id}_fr`, 'frequency')}</div>
            <div class="fl"><span class="fl-label">Predictability</span>${makeSelect(`${id}_pr`, 'predictability')}</div>
          </div>

          <div style="margin-top:6px;font-size:11px;color:var(--text3)">
            Hazard Score (avg of above): <strong id="hs-${id}" style="color:var(--blue)">—</strong>
          </div>
        </div>

        <!-- B. Vulnerability (PESTE) -->
        <div style="padding:10px 14px;border-bottom:1px solid var(--border)">
          <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--amber);margin-bottom:10px">B. VULNERABILITY ASSESSMENT (PESTE)</div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">
            <div class="fl"><span class="fl-label">Political</span>${makeSelect(`${id}_vp`, 'vulnerability')}</div>
            <div class="fl"><span class="fl-label">Economic</span>${makeSelect(`${id}_ve`, 'vulnerability')}</div>
            <div class="fl"><span class="fl-label">Social</span>${makeSelect(`${id}_vs`, 'vulnerability')}</div>
            <div class="fl"><span class="fl-label">Technological</span>${makeSelect(`${id}_vt`, 'vulnerability')}</div>
            <div class="fl"><span class="fl-label">Environmental</span>${makeSelect(`${id}_vn`, 'vulnerability')}</div>
          </div>
          <div style="margin-top:6px;font-size:11px;color:var(--text3)">
            Vulnerability Score (avg): <strong id="vs-${id}" style="color:var(--amber)">—</strong>
          </div>
        </div>

        <!-- C. Capacity -->
        <div style="padding:10px 14px;border-bottom:1px solid var(--border)">
          <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--green);margin-bottom:10px">C. CAPACITY ASSESSMENT</div>
          <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">
            <div class="fl"><span class="fl-label">Institutional</span>${makeSelect(`${id}_ci`, 'capacity')}</div>
            <div class="fl"><span class="fl-label">Programme</span>${makeSelect(`${id}_cp`, 'capacity')}</div>
            <div class="fl"><span class="fl-label">Public Participation</span>${makeSelect(`${id}_cq`, 'capacity')}</div>
            <div class="fl"><span class="fl-label">Financial</span>${makeSelect(`${id}_cf`, 'capacity')}</div>
            <div class="fl"><span class="fl-label">People</span>${makeSelect(`${id}_ch`, 'capacity')}</div>
            <div class="fl"><span class="fl-label">Support Networks</span>${makeSelect(`${id}_cs`, 'capacity')}</div>
          </div>
          <div style="margin-top:6px;font-size:11px;color:var(--text3)">
            Capacity Score (avg): <strong id="cs-${id}" style="color:var(--green)">—</strong>
            &nbsp;·&nbsp; Resilience Index (V÷C): <strong id="ri-${id}" style="color:var(--text)">—</strong>
            &nbsp;·&nbsp; <strong>Risk Rating (H×R): <span id="risk-val2-${id}" style="color:var(--red)">—</span></strong>
          </div>
        </div>

        <!-- D. Priority Index -->
        <div style="padding:10px 14px;border-bottom:1px solid var(--border)">
          <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--purple);margin-bottom:10px">D. PRIORITY INDEX</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div class="fl"><span class="fl-label">Importance</span>${makeSelect(`${id}_pi`, 'priority')}</div>
            <div class="fl"><span class="fl-label">Urgency</span>${makeSelect(`${id}_pu`, 'priority')}</div>
            <div class="fl"><span class="fl-label">Growth</span>${makeSelect(`${id}_pg`, 'priority')}</div>
          </div>
          <div style="margin-top:6px;font-size:11px;color:var(--text3)">
            Priority Index (avg): <strong id="pi-${id}" style="color:var(--purple)">—</strong>
            &nbsp;·&nbsp; Level: <strong id="pl-${id}" style="color:var(--purple)">—</strong>
          </div>
        </div>

        <!-- E. Role Players -->
        <div style="padding:10px 14px">
          <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">E. ROLE PLAYERS</div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:8px">Select from your stakeholder directory or type a custom organisation name.</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div class="fl">
              <span class="fl-label">Primary owner</span>
              <input class="fl-input" id="${id}_r1" list="stakeholder-opts" placeholder="Select or type organisation"/>
            </div>
            <div class="fl">
              <span class="fl-label">Secondary owner</span>
              <input class="fl-input" id="${id}_r2" list="stakeholder-opts" placeholder="Select or type organisation"/>
            </div>
            <div class="fl">
              <span class="fl-label">Tertiary owner</span>
              <input class="fl-input" id="${id}_r3" list="stakeholder-opts" placeholder="Select or type organisation"/>
            </div>
          </div>
          <datalist id="stakeholder-opts">
            ${(window._hvcStakeholderOrgs||[]).map(o=>`<option value="${o.name}"/>`).join('')}
          </datalist>
          <div class="fl" style="margin-top:6px"><span class="fl-label">Notes</span><textarea class="fl-textarea" id="${id}_notes" rows="2" style="min-height:48px"></textarea></div>
        </div>
      </div>
    </div>`;
}

// ── WINDOW FUNCTIONS (called from onchange/onclick) ───────
window.toggleHazardApplicable = function(id, checked) {
  const body  = document.getElementById(`hbody-${id}`);
  const chip  = document.getElementById(`risk-chip-${id}`);
  if (!body) return;
  body.style.display = checked ? 'block' : 'none';
  if (checked) {
    // Use rAF to ensure the body is visible in DOM before initialising picker
    requestAnimationFrame(() => {
      if (!_hvcPickerInited.has(id)) {
        initHvcWardPicker(id, _hvcWardSelections[id] || []);
        _hvcPickerInited.add(id);
      }
    });
  } else {
    if (chip) { chip.textContent = 'NOT APPLICABLE'; chip.className = 'badge b-gray'; }
    document.getElementById(`risk-val-${id}`).textContent = '—';
    delete _scores[id];
    _hvcWardSelections[id] = [];
  }
};

window.hvcScoreChanged = function(sel) {
  const id      = sel.dataset.hazard;
  const key     = sel.dataset.key;
  const descGrp = sel.dataset.desc;
  const val     = sel.value;

  // Show hint text
  const shortKey = key.split('_').pop();
  // Use the field name portion after hazard slug
  const fieldKey = key.replace(id + '_', '');
  const hintId   = `hint-${id}-${id}_${fieldKey}`;
  const hint     = document.getElementById(hintId);

  if (hint && val && DESCRIPTORS[descGrp]?.[val]) {
    hint.textContent = DESCRIPTORS[descGrp][val].desc;
    hint.style.display = 'block';
    hint.style.color = 'var(--text2)';
  } else if (hint) {
    hint.style.display = 'none';
  }

  recalcHazard(id);
};

window.recalcHazard = function(id) {
  const g = (suffix) => {
    const el = document.querySelector(`[data-hazard="${id}"][data-key="${id}_${suffix}"]`);
    return el?.value ? parseFloat(el.value) : null;
  };

  const aa=g('aa'), pb=g('pb'), fr=g('fr'), pr=g('pr');
  const hVals = [aa,pb,fr,pr].filter(v=>v!==null);
  const hScore = hVals.length ? hVals.reduce((a,b)=>a+b,0)/hVals.length : null;

  const vp=g('vp'), ve=g('ve'), vs=g('vs'), vt=g('vt'), vn=g('vn');
  const vVals = [vp,ve,vs,vt,vn].filter(v=>v!==null);
  const vScore = vVals.length ? vVals.reduce((a,b)=>a+b,0)/vVals.length : null;

  const ci=g('ci'), cp=g('cp'), cq=g('cq'), cf=g('cf'), ch=g('ch'), cs=g('cs');
  const cVals = [ci,cp,cq,cf,ch,cs].filter(v=>v!==null);
  const cScore = cVals.length ? cVals.reduce((a,b)=>a+b,0)/cVals.length : null;

  const resilience  = (vScore!==null && cScore!==null && cScore>0) ? vScore/cScore : null;
  const riskRating  = (hScore!==null && resilience!==null) ? hScore*resilience : null;

  const pi=g('pi'), pu=g('pu'), pg=g('pg');
  const pVals = [pi,pu,pg].filter(v=>v!==null);
  const pIdx  = pVals.length ? pVals.reduce((a,b)=>a+b,0)/pVals.length : null;

  // Get selected wards from picker
  const wards = _hvcWardSelections[id] || [];

  _scores[id] = { hScore, vScore, cScore, resilience, riskRating, pIdx,
    aa,pb,fr,pr, vp,ve,vs,vt,vn, ci,cp,cq,cf,ch,cs, pi,pu,pg, wards };

  // Trigger debounced auto-save on every score change
  scheduleAutoSave();

  setTxt(`hs-${id}`,    hScore    !== null ? hScore.toFixed(2)     : '—');
  setTxt(`vs-${id}`,    vScore    !== null ? vScore.toFixed(2)     : '—');
  setTxt(`cs-${id}`,    cScore    !== null ? cScore.toFixed(2)     : '—');
  setTxt(`ri-${id}`,    resilience!== null ? resilience.toFixed(3) : '—');
  setTxt(`pi-${id}`,    pIdx      !== null ? pIdx.toFixed(2)       : '—');
  setTxt(`pl-${id}`,    pIdx      !== null ? PRIO_LEVEL(pIdx)      : '—');

  if (riskRating !== null) {
    const band = RISK_BAND(riskRating);
    setTxt(`risk-val-${id}`,  riskRating.toFixed(2));
    setTxt(`risk-val2-${id}`, riskRating.toFixed(2));
    const chip = document.getElementById(`risk-chip-${id}`);
    if (chip) { chip.textContent = band.toUpperCase(); chip.className = `badge ${BAND_CLS[band]}`; }
  }
};

// ── RISK MATRIX ───────────────────────────────────────────
function renderRiskMatrix() {
  const rows=[5,4,3,2,1], cols=[1,2,3,4,5];
  const colour=(i,l)=>{const s=i*l;return s>=20?'#f85149':s>=12?'#d29922':s>=6?'#3fb950':'#58a6ff';};
  return `<div class="panel"><div class="ph"><div class="ph-title">Risk Matrix — Impact vs Likelihood</div></div>
    <div class="pb" style="overflow-x:auto"><div style="display:inline-block;min-width:400px">
      <div style="display:flex;margin-bottom:4px;margin-left:56px">
        ${cols.map(c=>`<div style="width:60px;text-align:center;font-size:10px;color:var(--text3);font-weight:700">Impact ${c}</div>`).join('')}
      </div>
      ${rows.map(r=>`
        <div style="display:flex;align-items:center;margin-bottom:2px">
          <div style="width:56px;font-size:10px;color:var(--text3);font-weight:700;text-align:right;padding-right:8px">L${r}</div>
          ${cols.map(c=>`<div style="width:60px;height:44px;background:${colour(c,r)};opacity:.25;border-radius:3px;margin:1px;display:flex;align-items:center;justify-content:center;font-size:9px;color:rgba(230,237,243,.8);font-weight:700" id="mc-${r}-${c}"></div>`).join('')}
        </div>`).join('')}
      <div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap">
        ${[['#f85149','Extremely High (≥20)'],['#d29922','High (12–19)'],['#3fb950','Tolerable (6–11)'],['#58a6ff','Low/Negligible (<6)']].map(([bg,lbl])=>
          `<div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:12px;background:${bg};border-radius:2px"></div><span style="font-size:10px;color:var(--text3)">${lbl}</span></div>`
        ).join('')}
      </div>
    </div></div></div>`;
}

// ── REFERENCE MODAL ───────────────────────────────────────
function showReferenceModal() {
  document.getElementById('hvc-ref-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'hvc-ref-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto';
  modal.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:12px;width:100%;max-width:780px;max-height:90vh;overflow-y:auto">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--bg2);z-index:1">
        <div style="font-size:15px;font-weight:800;color:var(--text)">Risk Rating Indicators — Reference</div>
        <button class="btn btn-sm" onclick="document.getElementById('hvc-ref-modal').remove()">✕ Close</button>
      </div>
      <div style="padding:20px">
        ${renderRefTable('HAZARD ANALYSIS', 'var(--blue)', [
          ['Affected Area', Object.entries(DESCRIPTORS.affected_area).map(([v,d])=>`${v} — ${d.label}: ${d.desc}`)],
          ['Probability',   Object.entries(DESCRIPTORS.probability).map(([v,d])=>`${v} — ${d.label}: ${d.desc}`)],
          ['Frequency',     Object.entries(DESCRIPTORS.frequency).map(([v,d])=>`${v} — ${d.label}: ${d.desc}`)],
          ['Predictability',Object.entries(DESCRIPTORS.predictability).map(([v,d])=>`${v} — ${d.label}: ${d.desc}`)]
        ])}
        ${renderRefTable('VULNERABILITY (PESTE)', 'var(--amber)',
          [['Political / Economic / Social / Technological / Environmental', Object.entries(DESCRIPTORS.vulnerability).map(([v,d])=>`${v} — ${d.label}: ${d.desc}`)]]
        )}
        ${renderRefTable('CAPACITY ASSESSMENT', 'var(--green)',
          [['Institutional / Programme / Public Participation / Financial / People / Support Networks', Object.entries(DESCRIPTORS.capacity).map(([v,d])=>`${v} — ${d.label}: ${d.desc}`)]]
        )}
        ${renderRefTable('PRIORITY INDEX', 'var(--purple)',
          [['Importance / Urgency / Growth', Object.entries(DESCRIPTORS.priority).map(([v,d])=>`${v} — ${d.label}: ${d.desc}`)]]
        )}
        <div class="panel" style="margin-top:16px">
          <div class="ph"><div class="ph-title">Risk Band Definitions</div></div>
          <div class="pb">
            ${[['Negligible','c-n','≤ 5'],['Low','c-l','5.01 – 10'],['Tolerable','c-t','10.01 – 15'],['High','c-h','15.01 – 20'],['Extremely High','c-xh','> 20']].map(([band,cls,range])=>
              `<div style="display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid rgba(48,54,61,.3)">
                <span class="badge ${cls}" style="width:120px;text-align:center">${band.toUpperCase()}</span>
                <span style="font-size:12px;color:var(--text2)">Risk Rating: ${range}</span>
              </div>`
            ).join('')}
            <div style="margin-top:12px;font-size:12px;color:var(--text3);line-height:1.8">
              <strong style="color:var(--text)">Formula:</strong><br>
              Hazard Score = Average(Affected Area + Probability + Frequency + Predictability)<br>
              Vulnerability Score = Average(Political + Economic + Social + Technological + Environmental)<br>
              Capacity Score = Average(Institutional + Programme + Public Participation + Financial + People + Support Networks)<br>
              Resilience Index = Vulnerability Score ÷ Capacity Score<br>
              <strong style="color:var(--red)">Risk Rating = Hazard Score × Resilience Index</strong>
            </div>
          </div>
        </div>
        ${renderRiskMatrix()}
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function renderRefTable(title, colour, rows) {
  return `<div class="panel" style="margin-bottom:16px">
    <div class="ph"><div class="ph-title" style="color:${colour}">${title}</div></div>
    <div class="pb">
      ${rows.map(([label, items]) => `
        <div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px">${label}</div>
          ${items.map(item=>`<div style="font-size:12px;color:var(--text3);padding:3px 0;border-bottom:1px solid rgba(48,54,61,.25)">${item}</div>`).join('')}
        </div>`).join('')}
    </div>
  </div>`;
}

// ── BIND FORM EVENTS ──────────────────────────────────────
function bindFormEvents() {
  // Auto-save when header fields change
  ['a-label','a-season','a-year','a-lead'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', scheduleAutoSave);
    document.getElementById(id)?.addEventListener('change', scheduleAutoSave);
  });
  // Tab switching
  document.querySelectorAll('.hvc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.hvc-tab').forEach(t => {
        t.classList.remove('on'); t.style.background='transparent'; t.style.color='var(--text3)';
      });
      tab.classList.add('on'); tab.style.background='var(--bg2)'; tab.style.color='var(--text)';
      const cat = tab.dataset.cat;
      const targetId = cat === '__custom__' ? 'tab----custom--' : `tab-${slug(cat)}`;
      document.querySelectorAll('[id^="tab-"]').forEach(el => el.style.display='none');
      document.getElementById(targetId)?.style.setProperty('display','block');
    });
  });

  // Add custom hazard
  document.getElementById('add-custom-hazard-btn')?.addEventListener('click', () => {
    const name = document.getElementById('custom-h-name')?.value.trim();
    const cat  = document.getElementById('custom-h-cat')?.value;
    if (!name) { alert('Please enter a hazard name.'); return; }
    if (_customHazards.find(h=>h.name===name)) { alert('A hazard with this name already exists.'); return; }
    _customHazards.push({ name, cat });
    const list = document.getElementById('custom-hazard-list');
    if (list) {
      list.insertAdjacentHTML('beforeend', renderHazardRow(name, cat, true));
      const hid = slug(name);
      initHvcWardPicker(hid, []);
    }
    document.getElementById('custom-h-name').value = '';
  });

  // Preview matrix — bind after form renders
  requestAnimationFrame(() => {
    document.getElementById('preview-matrix-btn')?.addEventListener('click', () => {
      const wrap = document.getElementById('risk-matrix-wrap');
      if (wrap) wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
    });
  });

  // Save
  document.getElementById('save-hvc-btn')?.addEventListener('click', saveAssessment);
}

// ── AUTO-SAVE ─────────────────────────────────────────────
async function autoSaveDraft() {
  if (!_muniId) return;
  const label = document.getElementById('a-label')?.value.trim() || 'Untitled draft';

  const meta = {
    municipality_id: _muniId,
    label,
    season:       document.getElementById('a-season')?.value || '',
    year:         parseInt(document.getElementById('a-year')?.value) || new Date().getFullYear(),
    lead_assessor:document.getElementById('a-lead')?.value || '',
    hazard_count: Object.keys(_scores).length,
    status:       'draft'
  };

  if (_draftId) {
    // Update existing draft record
    await supabase.from('hvc_assessments').update(meta).eq('id', _draftId);
  } else {
    // Create new draft record and store its ID
    const { data } = await supabase.from('hvc_assessments').insert(meta).select().single();
    if (data?.id) {
      _draftId = data.id;
      console.log('[HVC] Draft created:', _draftId);
    }
  }
}

function scheduleAutoSave() {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => autoSaveDraft(), 2000); // debounce 2s
}

// ── SAVE ─────────────────────────────────────────────────
let _assessmentSaving = false;

async function saveAssessment() {
  if (_assessmentSaving) return;
  const label = document.getElementById('a-label')?.value.trim();
  if (!label) { alert('Please enter an assessment label.'); return; }

  _assessmentSaving = true;
  const btn = document.getElementById('save-hvc-btn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  const rows = [];

  Object.entries(HAZARD_CATEGORIES).forEach(([cat, hazards]) => {
    hazards.forEach(hazard => {
      const id = slug(hazard);
      const cb = document.querySelector(`.hvc-applicable[data-hazard="${id}"]`);
      if (!cb?.checked) return;
      const s = _scores[id];
      if (!s || s.riskRating === null || s.riskRating === undefined) return;
      rows.push(buildRow(id, hazard, cat, s));
    });
  });

  _customHazards.forEach(({ name, cat }) => {
    const id = slug(name);
    const cb = document.querySelector(`.hvc-applicable[data-hazard="${id}"]`);
    if (!cb?.checked) return;
    const s = _scores[id];
    if (!s || s.riskRating === null || s.riskRating === undefined) return;
    rows.push(buildRow(id, name, cat, s));
  });

  const meta = {
    municipality_id: _muniId,
    label,
    season:        document.getElementById('a-season')?.value,
    year:          parseInt(document.getElementById('a-year')?.value),
    lead_assessor: document.getElementById('a-lead')?.value,
    hazard_count:  rows.length,
    status:        'complete'
  };

  let assessmentId = _draftId;

  if (assessmentId) {
    // Promote the existing draft to complete
    const { error } = await supabase
      .from('hvc_assessments')
      .update(meta)
      .eq('id', assessmentId);
    if (error) {
      alert('Error saving: ' + error.message);
      _assessmentSaving = false;
      if (btn) { btn.textContent = 'Save assessment'; btn.disabled = false; }
      return;
    }
  } else {
    // No draft yet — insert fresh
    const { data, error } = await supabase
      .from('hvc_assessments')
      .insert(meta)
      .select().single();
    if (error) {
      alert('Error: ' + error.message);
      _assessmentSaving = false;
      if (btn) { btn.textContent = 'Save assessment'; btn.disabled = false; }
      return;
    }
    assessmentId = data.id;
  }

  // Delete any existing scores for this assessment then insert fresh
  await supabase.from('hvc_hazard_scores').delete().eq('assessment_id', assessmentId);

  if (rows.length) {
    const { error: scErr } = await supabase
      .from('hvc_hazard_scores')
      .insert(rows.map(r => ({ ...r, assessment_id: assessmentId })));
    if (scErr) {
      showToast('Warning: assessment saved but hazard scores failed — ' + scErr.message, true);
      console.error('hvc_hazard_scores insert error:', scErr);
    }
  }

  // Clear draft state now that it's been promoted to complete
  _draftId = null;
  clearTimeout(_autoSaveTimer);

  try {
    await supabase.rpc('update_ward_dominant_risk', { p_municipality_id: _muniId });
  } catch(e) { console.warn('Ward risk update failed:', e.message); }

  await writeAudit(
    'create', 'hvc_assessment', assessmentId,
    `HVC Assessment: ${label} (${rows.length} hazards scored)`,
    null,
    { label, hazard_count: rows.length, status: 'complete' }
  );

  if (btn) { btn.textContent = 'Save assessment'; btn.disabled = false; }
  showToast('✓ Assessment saved! Dashboard will update automatically.');
  setTimeout(async () => {
    await renderHVCPage();
    _assessmentSaving = false;
  }, 1500);
}

function buildRow(id, hazard, cat, s) {
  return {
    municipality_id:     _muniId,
    hazard_name:         hazard,
    hazard_category:     cat,
    affected_area:       s.aa, probability: s.pb, frequency: s.fr, predictability: s.pr,
    hazard_score:        s.hScore,
    vp: s.vp, ve: s.ve, vs: s.vs, vt: s.vt, vn: s.vn,
    vulnerability_score: s.vScore,
    ci: s.ci, cp: s.cp, cq: s.cq, cf: s.cf, ch: s.ch, cs: s.cs,
    capacity_score:      s.cScore,
    resilience_index:    s.resilience,
    risk_rating:         s.riskRating,
    risk_band:           s.riskRating!==null ? RISK_BAND(s.riskRating) : null,
    importance:          s.pi, urgency: s.pu, growth: s.pg,
    pi_val: s.pi, pu_val: s.pu, pg_val: s.pg,
    priority_index:      s.pIdx,
    priority_level:      s.pIdx!==null ? PRIO_LEVEL(s.pIdx) : null,
    affected_wards:      s.wards || []
  };
}

// ── VIEW EXISTING ─────────────────────────────────────────
async function openAssessment(id) {
  const [scoresRes, assessRes] = await Promise.all([
    supabase.from('hvc_hazard_scores').select('*').eq('assessment_id', id).order('risk_rating', { ascending: false }),
    supabase.from('hvc_assessments').select('*').eq('id', id).single()
  ]);

  const scores = scoresRes.data || [];
  const assessment = assessRes.data || {};
  const label = assessment.label || (assessment.season + ' ' + assessment.year) || 'Assessment';

  const content = document.getElementById('hvc-content');
  if (!content) return;

  content.innerHTML = `<div style="padding:22px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      <button class="btn btn-sm" id="hvc-back">← Back to list</button>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm" id="show-matrix">Risk matrix</button>
        <button class="btn btn-sm btn-green" id="view-edit">Edit assessment</button>
        <button class="btn btn-sm" id="view-download-btn">↓ Download</button>
        <button class="btn btn-sm btn-red" id="view-delete">Delete assessment</button>
      </div>
    </div>

    <!-- Assessment summary -->
    <div class="panel" style="margin-bottom:16px">
      <div class="ph">
        <div>
          <div class="ph-title">${label}</div>
          <div class="ph-sub">${assessment.season||''} ${assessment.year||''} · Lead: ${assessment.lead_assessor||'—'} · ${scores.length} hazards scored · ${new Date(assessment.created_at).toLocaleDateString('en-ZA',{day:'numeric',month:'long',year:'numeric'})}</div>
        </div>
        <span class="badge ${assessment.status==='complete'?'b-green':'b-amber'}">${(assessment.status||'draft').toUpperCase()}</span>
      </div>
    </div>

    <div class="sec-hdr">
      <div><div class="sec-hdr-title">Risk ranking</div><div class="sec-hdr-sub">${scores.length} hazards · sorted by risk rating</div></div>
    </div>
    <div class="panel">
      <div class="ph"><div class="ph-title">Risk ranking</div></div>
      <div class="pb" style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="border-bottom:1px solid var(--border)">
            ${['#','Hazard','Category','H.Score','V.Score','C.Score','Resilience','Risk Rating','Band','Priority Idx','Level','Wards affected'].map(h=>
              `<th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);white-space:nowrap">${h}</th>`
            ).join('')}
          </tr></thead>
          <tbody>
            ${(scores||[]).map((s,i)=>`
              <tr style="border-bottom:1px solid rgba(48,54,61,.4)">
                <td style="padding:6px 8px;color:var(--text3)">${i+1}</td>
                <td style="padding:6px 8px;font-weight:600;color:var(--text)">${s.hazard_name}</td>
                <td style="padding:6px 8px;color:var(--text3)">${s.hazard_category||'—'}</td>
                <td style="padding:6px 8px;font-family:monospace">${s.hazard_score?.toFixed(2)||'—'}</td>
                <td style="padding:6px 8px;font-family:monospace">${s.vulnerability_score?.toFixed(2)||'—'}</td>
                <td style="padding:6px 8px;font-family:monospace">${s.capacity_score?.toFixed(2)||'—'}</td>
                <td style="padding:6px 8px;font-family:monospace">${s.resilience_index?.toFixed(3)||'—'}</td>
                <td style="padding:6px 8px;font-family:monospace;font-weight:700">${s.risk_rating?.toFixed(2)||'—'}</td>
                <td style="padding:6px 8px"><span class="badge ${BAND_CLS[s.risk_band||'']||'b-gray'}">${(s.risk_band||'—').toUpperCase()}</span></td>
                <td style="padding:6px 8px;font-family:monospace">${s.priority_index?.toFixed(2)||'—'}</td>
                <td style="padding:6px 8px"><span class="badge ${s.priority_level==='HIGH'?'b-red':s.priority_level==='MEDIUM'?'b-amber':'b-gray'}">${s.priority_level||'—'}</span></td>
                <td style="padding:6px 8px;font-size:11px;color:var(--text3)">${Array.isArray(s.affected_wards)&&s.affected_wards.length?'Wards: '+s.affected_wards.join(', '):'—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div id="matrix-view" style="margin-top:16px;display:none">${renderRiskMatrix()}</div>
  </div>`;

  document.getElementById('hvc-back')?.addEventListener('click', renderHVCPage);
  document.getElementById('show-matrix')?.addEventListener('click', () => {
    const m = document.getElementById('matrix-view');
    if (m) m.style.display = m.style.display==='none'?'block':'none';
  });
  document.getElementById('view-edit')?.addEventListener('click', () => editAssessment(id));
  document.getElementById('view-download-btn')?.addEventListener('click', function() {
    const muniName = _user?.municipalities?.name || 'Municipality';
    showDownloadMenu(this, {
      filename: `HVC-${label.replace(/\s+/g,'-')}-${muniName.replace(/\s+/g,'-')}`,
      getPDF:     () => exportAssessmentPDF(id, label),
      getCSVRows: () => getHVCCSVRows(scores, assessment, muniName),
      getDocHTML: () => getHVCDocHTML(scores, assessment, muniName)
    });
  });
  document.getElementById('view-delete')?.addEventListener('click', () => deleteAssessment(id, label));
}

// ── EDIT ASSESSMENT ──────────────────────────────────────
async function editAssessment(id) {
  const [scoresRes, assessRes] = await Promise.all([
    supabase.from('hvc_hazard_scores').select('*').eq('assessment_id', id),
    supabase.from('hvc_assessments').select('*').eq('id', id).single()
  ]);

  const scores     = scoresRes.data || [];
  const assessment = assessRes.data || {};

  // Pre-fill _scores from existing data so recalcHazard shows correct values
  scores.forEach(s => {
    const id_ = slug(s.hazard_name);
    _scores[id_] = {
      hScore: s.hazard_score, vScore: s.vulnerability_score,
      cScore: s.capacity_score, resilience: s.resilience_index,
      riskRating: s.risk_rating, pIdx: s.priority_index,
      aa: s.affected_area, pb: s.probability, fr: s.frequency, pr: s.predictability,
      vp: s.vp, ve: s.ve, vs: s.vs, vt: s.vt, vn: s.vn,
      ci: s.ci, cp: s.cp, cq: s.cq, cf: s.cf, ch: s.ch, cs: s.cs,
      pi: s.importance, pu: s.urgency, pg: s.growth,
      wards: s.affected_wards || []
    };
  });

  // Clear any in-progress new draft — we're now editing an existing record
  _draftId = null;
  clearTimeout(_autoSaveTimer);

  // Render the new form with pre-filled values
  _customHazards = [];
  _hvcWardSelections = {};
  _hvcPickerInited.clear();
  const content = document.getElementById('hvc-content');
  if (!content) return;

  content.innerHTML = `<div style="padding:22px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-sm" id="hvc-edit-back">← Cancel</button>
      <div style="font-size:14px;font-weight:700;color:var(--text)">
        Editing: ${assessment.label || assessment.season + ' ' + assessment.year}
      </div>
      <span class="badge b-amber">EDIT MODE</span>
    </div>
    ${renderNewForm().replace(
      '<div style="padding:22px">',
      '<div>'
    )}
  </div>`;

  // Pre-fill assessment details
  const labelEl  = document.getElementById('a-label');
  const seasonEl = document.getElementById('a-season');
  const yearEl   = document.getElementById('a-year');
  const leadEl   = document.getElementById('a-lead');
  if (labelEl)  labelEl.value  = assessment.label || '';
  if (seasonEl) seasonEl.value = assessment.season || '';
  if (yearEl)   yearEl.value   = assessment.year   || '';
  if (leadEl)   leadEl.value   = assessment.lead_assessor || '';

  // Tick applicable hazards and pre-fill scores
  scores.forEach(s => {
    const hid = slug(s.hazard_name);
    const cb  = document.querySelector(`.hvc-applicable[data-hazard="${hid}"]`);
    if (cb) {
      cb.checked = true;
      const body = document.getElementById(`hbody-${hid}`);
      if (body) body.style.display = 'block';
    }

    // Set each dropdown value
    const fields = {
      [`${hid}_aa`]: s.affected_area, [`${hid}_pb`]: s.probability,
      [`${hid}_fr`]: s.frequency,     [`${hid}_pr`]: s.predictability,
      [`${hid}_vp`]: s.vp,            [`${hid}_ve`]: s.ve,
      [`${hid}_vs`]: s.vs,            [`${hid}_vt`]: s.vt,
      [`${hid}_vn`]: s.vn,            [`${hid}_ci`]: s.ci,
      [`${hid}_cp`]: s.cp,            [`${hid}_cq`]: s.cq,
      [`${hid}_cf`]: s.cf,            [`${hid}_ch`]: s.ch,
      [`${hid}_cs`]: s.cs,            [`${hid}_pi`]: s.importance,
      [`${hid}_pu`]: s.urgency,       [`${hid}_pg`]: s.growth,
    };

    Object.entries(fields).forEach(([key, val]) => {
      if (val == null) return;
      const sel = document.querySelector(`[data-key="${key}"]`);
      if (sel) { sel.value = String(val); window.hvcScoreChanged(sel); }
    });

    // Pre-fill ward selection via picker
    const existingWards = Array.isArray(s.affected_wards)
      ? s.affected_wards.map(Number).filter(Boolean)
      : [];
    _hvcWardSelections[hid] = existingWards;
    _hvcPickerInited.add(hid);
    requestAnimationFrame(() => initHvcWardPicker(hid, existingWards));

    // Pre-fill role players
    const r1 = document.getElementById(`${hid}_r1`);
    const r2 = document.getElementById(`${hid}_r2`);
    const r3 = document.getElementById(`${hid}_r3`);
    const notes = document.getElementById(`${hid}_notes`);
    if (r1 && s.primary_owner)    r1.value    = s.primary_owner;
    if (r2 && s.secondary_owner)  r2.value    = s.secondary_owner;
    if (r3 && s.tertiary_owner)   r3.value    = s.tertiary_owner;
    if (notes && s.notes)         notes.value = s.notes;
  });

  bindFormEvents();

  // Override save button to UPDATE instead of INSERT
  const saveBtn = document.getElementById('save-hvc-btn');
  if (saveBtn) {
    saveBtn.textContent = 'Save changes';
    saveBtn.onclick = () => saveEditedAssessment(id, assessment);
  }

  document.getElementById('hvc-edit-back')?.addEventListener('click', renderHVCPage);
}

async function saveEditedAssessment(assessmentId, assessment) {
  const label = document.getElementById('a-label')?.value.trim();
  if (!label) { alert('Please enter a label.'); return; }

  const btn = document.getElementById('save-hvc-btn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  const hazardRows = [];

  // Collect all ticked hazards
  Object.entries(HAZARD_CATEGORIES).forEach(([cat, hazards]) => {
    hazards.forEach(hazard => {
      const hid = slug(hazard);
      const cb  = document.querySelector(`.hvc-applicable[data-hazard="${hid}"]`);
      if (!cb?.checked) return;
      const s = _scores[hid];
      if (!s || s.riskRating === null || s.riskRating === undefined) return;
      hazardRows.push(buildRow(hid, hazard, cat, s));
    });
  });

  _customHazards.forEach(({ name, cat }) => {
    const hid = slug(name);
    const cb  = document.querySelector(`.hvc-applicable[data-hazard="${hid}"]`);
    if (!cb?.checked) return;
    const s = _scores[hid];
    if (!s || s.riskRating === null || s.riskRating === undefined) return;
    hazardRows.push(buildRow(hid, name, cat, s));
  });

  // Update assessment metadata
  const { error: aErr } = await supabase
    .from('hvc_assessments')
    .update({
      label,
      season:        document.getElementById('a-season')?.value,
      year:          parseInt(document.getElementById('a-year')?.value),
      lead_assessor: document.getElementById('a-lead')?.value,
      hazard_count:  hazardRows.length,
      updated_at:    new Date().toISOString()
    })
    .eq('id', assessmentId);

  if (aErr) {
    showToast('Error updating assessment: ' + aErr.message, true);
    if (btn) { btn.textContent = 'Save changes'; btn.disabled = false; }
    return;
  }

  // Delete old scores and insert new ones
  await supabase.from('hvc_hazard_scores').delete().eq('assessment_id', assessmentId);

  if (hazardRows.length) {
    await supabase.from('hvc_hazard_scores').insert(
      hazardRows.map(r => ({ ...r, assessment_id: assessmentId }))
    );
  }

  // Update ward dominant_risk
  try {
    await supabase.rpc('update_ward_dominant_risk', { p_municipality_id: _muniId });
  } catch(e) { console.warn('Ward risk update failed:', e.message); }

  await writeAudit(
    'update', 'hvc_assessment', assessmentId,
    'Updated HVC Assessment: ' + label,
    { label: assessment.label },
    { label, hazard_count: hazardRows.length }
  );

  showToast('✓ Assessment updated successfully!');
  setTimeout(() => renderHVCPage(), 1200);
}

// ── DELETE ASSESSMENT ────────────────────────────────────
async function deleteAssessment(id, label) {
  if (!confirm(`Delete assessment "${label}"?

This will permanently remove all hazard scores for this assessment. This cannot be undone.`)) return;

  const { error: scoreErr } = await supabase.from('hvc_hazard_scores').delete().eq('assessment_id', id);
  const { error: assessErr } = await supabase.from('hvc_assessments').delete().eq('id', id);

  if (scoreErr || assessErr) {
    showToast('Error deleting assessment: ' + (scoreErr?.message || assessErr?.message), true);
    return;
  }

  await writeAudit('delete', 'hvc_assessment', id, `Deleted HVC Assessment: ${label}`, { label }, null);
  showToast('✓ Assessment deleted');
  await renderHVCPage();
}

// ── DOWNLOAD HELPERS ─────────────────────────────────────
function getHVCCSVRows(scores, assessment, muniName) {
  const rows = [['Rank','Hazard','Category','H.Score','V.Score','C.Score','Resilience','Risk Rating','Band','Priority','Level','Wards']];
  scores.forEach((s, i) => {
    rows.push([
      i+1, s.hazard_name, s.hazard_category||'',
      s.hazard_score?.toFixed(2)||'', s.vulnerability_score?.toFixed(2)||'',
      s.capacity_score?.toFixed(2)||'', s.resilience_index?.toFixed(3)||'',
      s.risk_rating?.toFixed(2)||'', s.risk_band||'',
      s.priority_index?.toFixed(2)||'', s.priority_level||'',
      Array.isArray(s.affected_wards) ? s.affected_wards.join('; ') : ''
    ]);
  });
  return rows;
}

function getHVCDocHTML(scores, assessment, muniName) {
  const label = assessment.label || `${assessment.season||''} ${assessment.year||''}`;
  let rows = scores.map((s,i) => `
    <tr>
      <td>${i+1}</td><td><strong>${s.hazard_name}</strong></td><td>${s.hazard_category||'—'}</td>
      <td>${s.hazard_score?.toFixed(2)||'—'}</td><td>${s.vulnerability_score?.toFixed(2)||'—'}</td>
      <td>${s.capacity_score?.toFixed(2)||'—'}</td><td>${s.resilience_index?.toFixed(3)||'—'}</td>
      <td><strong>${s.risk_rating?.toFixed(2)||'—'}</strong></td><td>${s.risk_band||'—'}</td>
      <td>${s.priority_level||'—'}</td>
      <td>${Array.isArray(s.affected_wards)&&s.affected_wards.length?'Wards '+s.affected_wards.join(', '):'—'}</td>
    </tr>`).join('');
  return `${docHeader(`HVC Assessment — ${label}`, muniName, `Lead assessor: ${assessment.lead_assessor||'—'}`)}
  <h2>Risk Ranking — ${scores.length} hazards scored</h2>
  <table>
    <thead><tr><th>#</th><th>Hazard</th><th>Category</th><th>H.Score</th><th>V.Score</th><th>C.Score</th><th>Resilience</th><th>Risk Rating</th><th>Band</th><th>Priority</th><th>Wards</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="meta">Formula: Risk Rating = Hazard Score × (Vulnerability ÷ Capacity) | DMA Act 57 of 2002 · Annexure 3</p>`;
}

// ── EXPORT PDF ────────────────────────────────────────────
async function exportAssessmentPDF(id, label) {
  const [scoresRes, assessRes] = await Promise.all([
    supabase.from('hvc_hazard_scores').select('*').eq('assessment_id', id).order('risk_rating', { ascending: false }),
    supabase.from('hvc_assessments').select('*').eq('id', id).single()
  ]);

  const scores     = scoresRes.data || [];
  const assessment = assessRes.data || {};
  const muniName   = window._drmsaUser?.municipalities?.name || 'Municipality';

  const BAND_COL_HEX = {
    'Extremely High':'#f85149', 'High':'#d29922',
    'Tolerable':'#3fb950', 'Low':'#58a6ff', 'Negligible':'#6e7681'
  };

  const rows = scores.map((s, i) => `
    <tr style="border-bottom:1px solid #eee;${i%2===0?'background:#f9f9f9':''}">
      <td style="padding:6px 8px">${i+1}</td>
      <td style="padding:6px 8px;font-weight:600">${s.hazard_name||'—'}</td>
      <td style="padding:6px 8px;color:#666">${s.hazard_category||'—'}</td>
      <td style="padding:6px 8px;text-align:center">${s.hazard_score?.toFixed(2)||'—'}</td>
      <td style="padding:6px 8px;text-align:center">${s.vulnerability_score?.toFixed(2)||'—'}</td>
      <td style="padding:6px 8px;text-align:center">${s.capacity_score?.toFixed(2)||'—'}</td>
      <td style="padding:6px 8px;text-align:center">${s.resilience_index?.toFixed(3)||'—'}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:700">${s.risk_rating?.toFixed(2)||'—'}</td>
      <td style="padding:6px 8px;text-align:center">
        <span style="background:${BAND_COL_HEX[s.risk_band]||'#6e7681'}22;border:1px solid ${BAND_COL_HEX[s.risk_band]||'#6e7681'}55;
          color:${BAND_COL_HEX[s.risk_band]||'#6e7681'};padding:2px 6px;border-radius:3px;font-size:10px;font-weight:700">
          ${(s.risk_band||'—').toUpperCase()}
        </span>
      </td>
      <td style="padding:6px 8px;text-align:center">${s.priority_index?.toFixed(2)||'—'}</td>
      <td style="padding:6px 8px;text-align:center">
        <span style="font-weight:700;color:${s.priority_level==='HIGH'?'#f85149':s.priority_level==='MEDIUM'?'#d29922':'#6e7681'}">
          ${s.priority_level||'—'}
        </span>
      </td>
      <td style="padding:6px 8px;color:#666;font-size:11px">${Array.isArray(s.affected_wards)&&s.affected_wards.length?'Wards '+s.affected_wards.join(', '):'—'}</td>
      <td style="padding:6px 8px;color:#666;font-size:11px">${[s.primary_owner_name, s.secondary_owner_name, s.tertiary_owner_name].filter(Boolean).join(', ')||'—'}</td>
    </tr>`).join('');

  const html = `
    <html><head><title>HVC Assessment — ${label}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#0d1117;padding:24px;margin:0}
      h1{font-size:20px;color:#0d1117;margin:0 0 4px}
      h2{font-size:14px;color:#1a3a6b;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #1a3a6b}
      .meta{font-size:11px;color:#666;margin-bottom:4px}
      .badge{display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;margin-right:6px}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:20px}
      th{background:#1a3a6b;color:#fff;padding:7px 8px;text-align:left;font-size:10px;white-space:nowrap}
      td{vertical-align:middle}
      .formula{background:#f0f4ff;border-left:3px solid #1a3a6b;padding:10px 14px;font-size:11px;color:#333;margin:12px 0;border-radius:0 4px 4px 0;line-height:1.8}
      .footer{margin-top:30px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#999}
    </style></head><body>

    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px">
      <div>
        <h1>HVC Assessment Report</h1>
        <div class="meta"><strong>${muniName}</strong></div>
        <div class="meta">Assessment: <strong>${label}</strong></div>
        <div class="meta">${assessment.season||''} ${assessment.year||''} · Lead assessor: ${assessment.lead_assessor||'—'}</div>
        <div class="meta">Generated: ${new Date().toLocaleString('en-ZA')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:700;color:#1a3a6b">DRMSA</div>
        <div style="font-size:10px;color:#999">Disaster Risk Management Reporting Platform</div>
        <div style="font-size:10px;color:#999">DMA Act 57 of 2002 — Annexure 3</div>
      </div>
    </div>

    <div class="formula">
      <strong>Risk formula:</strong>
      Hazard Score = avg(Affected Area + Probability + Frequency + Predictability) ·
      Resilience = Vulnerability ÷ Capacity ·
      <strong>Risk Rating = Hazard Score × Resilience</strong>
    </div>

    <h2>Risk ranking — ${scores.length} hazards scored</h2>
    <table>
      <thead><tr>
        <th>#</th><th>Hazard</th><th>Category</th>
        <th>H.Score</th><th>V.Score</th><th>C.Score</th><th>Resilience</th>
        <th>Risk Rating</th><th>Band</th><th>Priority Idx</th><th>Priority</th>
        <th>Wards affected</th><th>Role players</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="footer">
      ${muniName} · DRMSA HVC Assessment · Apache 2.0 Open Source ·
      HVC framework: South African DMA Act 57 of 2002 Annexure 3 ·
      Created by Diswayne Maarman
    </div>
    </body></html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
    showToast('✓ PDF print dialog opened');
  }
}

// ── EXPORT CSV ────────────────────────────────────────────
async function exportAssessmentCSV(id, label) {
  const [scoresRes, assessRes] = await Promise.all([
    supabase.from('hvc_hazard_scores').select('*').eq('assessment_id', id).order('risk_rating', { ascending: false }),
    supabase.from('hvc_assessments').select('*').eq('id', id).single()
  ]);

  const scores     = scoresRes.data || [];
  const assessment = assessRes.data || {};
  const muniName   = window._drmsaUser?.municipalities?.name || 'Municipality';

  const headers = [
    'Rank','Hazard','Category',
    'Affected Area','Probability','Frequency','Predictability','Hazard Score',
    'Political','Economic','Social','Technological','Environmental','Vulnerability Score',
    'Institutional','Programme','Public Participation','Financial','People','Support Networks','Capacity Score',
    'Resilience Index','Risk Rating','Risk Band',
    'Importance','Urgency','Growth','Priority Index','Priority Level',
    'Wards Affected','Notes'
  ];

  const rows = scores.map((s, i) => [
    i+1, s.hazard_name||'', s.hazard_category||'',
    s.affected_area||'', s.probability||'', s.frequency||'', s.predictability||'', s.hazard_score?.toFixed(2)||'',
    s.vp||'', s.ve||'', s.vs||'', s.vt||'', s.vn||'', s.vulnerability_score?.toFixed(2)||'',
    s.ci||'', s.cp||'', s.cq||'', s.cf||'', s.ch||'', s.cs||'', s.capacity_score?.toFixed(2)||'',
    s.resilience_index?.toFixed(3)||'', s.risk_rating?.toFixed(2)||'', s.risk_band||'',
    s.importance||'', s.urgency||'', s.growth||'', s.priority_index?.toFixed(2)||'', s.priority_level||'',
    Array.isArray(s.affected_wards) ? s.affected_wards.join('; ') : '',
    s.notes||''
  ]);

  // Add metadata header rows
  const meta = [
    [`DRMSA HVC Assessment Report`],
    [`Municipality: ${muniName}`],
    [`Assessment: ${label}`],
    [`Season/Year: ${assessment.season||''} ${assessment.year||''}`],
    [`Lead assessor: ${assessment.lead_assessor||''}`],
    [`Generated: ${new Date().toLocaleString('en-ZA')}`],
    [`DMA Act 57 of 2002 — Annexure 3`],
    [],
    headers
  ];

  const allRows = [...meta, ...rows];
  const escQ = function(v) { return '"' + String(v||'').split('"').join('""') + '"'; };
  const csv = allRows.map(function(r) { return r.map(escQ).join(','); }).join('\n');

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: 'DRMSA-HVC-' + label.replace(/\s+/g,'-') + '-' + new Date().toISOString().slice(0,10) + '.csv'
  });
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ CSV downloaded — opens in Excel');
}

function setTxt(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }
