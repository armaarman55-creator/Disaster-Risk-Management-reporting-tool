// js/idp.js — IDP Linkage & Spatial Mitigation Register
import { supabase } from './supabase.js';

function showToast(msg, isError=false) {
  document.querySelectorAll('.drmsa-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'drmsa-toast';
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:var(--bg2);border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,.35);display:flex;align-items:center;gap:10px;max-width:340px;transition:opacity .3s;font-family:Inter,system-ui,sans-serif`;
  t.innerHTML = `<span style="font-size:16px">${isError?'✕':'✓'}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},3000);
}

let _muniId = null;
let _libCache = [];
let _user   = null;
let _wards  = [];
let _hazards = [];

const IDP_KPAS = [
  'KPA 1 — Municipal transformation and institutional development',
  'KPA 2 — Basic service delivery and infrastructure development',
  'KPA 3 — Local economic development',
  'KPA 4 — Municipal financial viability and management',
  'KPA 5 — Good governance and public participation'
];
const DRR       = ['Treat/Mitigate','Tolerate/Accept','Transfer/Share','Terminate/Prevent'];
const TIMEFRAMES = ['Short term (< 1 year)','Medium term (1–3 years)','Long term (3–5 years)'];
const MIT_TYPES  = ['Structural','Non-structural','Policy/Plan','Awareness/Training'];
const STATUSES   = [
  { label: 'Proposed',                  value: 'proposed' },
  { label: 'Linked — awaiting funding', value: 'linked-awaiting' },
  { label: 'Linked — funded',           value: 'linked-funded' },
  { label: 'Under review',              value: 'under-review' },
  { label: 'In progress',               value: 'in-progress' },
  { label: 'Completed',                 value: 'completed' }
];

// ── SMART DRR MODELING CONSTANTS ─────────────────────────
const IMPACT_AREAS = [
  'Reduce frequency',
  'Reduce severity',
  'Reduce response time',
  'Reduce economic loss',
  'Protect infrastructure',
  'Environmental protection'
];

const IMPACT_RATINGS = [
  { value: 'Low',    label: 'Low',    sub: 'Minimal improvement',    col: 'var(--green)',  range: [5,  15] },
  { value: 'Medium', label: 'Medium', sub: 'Noticeable reduction',   col: 'var(--amber)',  range: [20, 40] },
  { value: 'High',   label: 'High',   sub: 'Significant reduction',  col: 'var(--red)',    range: [45, 70] }
];

const COST_BASES = [
  'Historical data',
  'Similar project',
  'Expert judgement',
  'Assumed',
  'Mixed sources'
];

// Calculate risk reduction range from rating + impact area count
function calcRiskReduction(rating, impactAreas) {
  const r = IMPACT_RATINGS.find(x => x.value === rating);
  if (!r) return null;
  const [min, max] = r.range;
  const bonus = Math.min(Math.max(0, (impactAreas.length - 2) * 3), 15);
  return { min, max: Math.min(max + bonus, 75), label: rating };
}

// Auto-generate justification paragraph
function generateJustification(fields) {
  const {
    hazard, wards, description, impactAreas,
    costBasis, riskRange, muniName, mitigationType, impactRating
  } = fields;

  if (!hazard && !description) return '';

  const wardText = wards.length
    ? (wards.length === 1 ? `Ward ${wards[0]}` : `Wards ${wards.slice(0,-1).join(', ')} and ${wards[wards.length-1]}`)
    : 'the affected area';

  const impactText = impactAreas.length
    ? impactAreas.map((a,i) => {
        if (i === 0) return a.toLowerCase();
        if (i === impactAreas.length - 1) return ' and ' + a.toLowerCase();
        return ', ' + a.toLowerCase();
      }).join('')
    : 'reduce disaster impact';

  const interventionText = description
    ? description.charAt(0).toLowerCase() + description.slice(1)
    : 'the proposed intervention';

  const basisText = costBasis || 'available data';

  const reductionText = riskRange
    ? `approximately ${riskRange.min}–${riskRange.max}%`
    : 'a measurable percentage';

  const ratingText = impactRating ? ` (${impactRating.toLowerCase()} impact level)` : '';

  return `This project addresses ${hazard || 'the identified hazard'} risk in ${wardText}. The proposed ${mitigationType ? mitigationType.toLowerCase() : 'intervention'} — ${interventionText} — is expected to ${impactText}${ratingText}. Based on ${basisText}, the project may reduce disaster risk by ${reductionText}. This will contribute to reduced damage, improved safety and better resilience for communities in ${muniName || 'the municipality'}.`;
}

export async function initIDP(user) {
  _user   = user;
  _muniId = user?.municipality_id;

  if (!_muniId) {
    const page = document.getElementById('page-idp');
    if (page) page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">No municipality linked. Go to My Profile to set your municipality.</div>';
    return;
  }

  const [wr, hr] = await Promise.all([
    supabase.from('wards').select('ward_number,area_name').eq('municipality_id',_muniId).order('ward_number'),
    supabase.from('hvc_hazard_scores').select('hazard_name,hazard_category,risk_band,risk_rating').eq('municipality_id',_muniId).order('risk_rating',{ascending:false})
  ]);

  _wards   = wr.data || [];
  const seen = new Set();
  _hazards = (hr.data||[]).filter(h => { if(seen.has(h.hazard_name)) return false; seen.add(h.hazard_name); return true; });

  // Fallback ward generation from ward_count
  if (!_wards.length && user?.municipalities?.ward_count > 0) {
    _wards = Array.from({length:user.municipalities.ward_count},(_,i)=>({ward_number:i+1,area_name:null}));
  }

  await renderIDP();
}

async function renderIDP() {
  const page = document.getElementById('page-idp');
  if (!page) return;

  const { data: mits } = await supabase
    .from('mitigations').select('*')
    .eq('municipality_id', _muniId).eq('is_library', false)
    .order('created_at', { ascending: false });

  const total    = mits?.length||0;
  const funded   = mits?.filter(m=>m.idp_status==='linked-funded').length||0;
  const awaiting = mits?.filter(m=>m.idp_status==='linked-awaiting').length||0;
  const proposed = mits?.filter(m=>m.idp_status==='proposed').length||0;

  page.innerHTML = `
    <div style="display:flex;flex-direction:column;min-height:100%;overflow:visible">
      <div style="padding:12px 20px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--text)">IDP Linkage & Mitigation Register</div>
          <div style="font-size:11px;color:var(--text3);margin-top:1px">Spatial mitigations linked to IDP projects and budget votes</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm" id="idp-library-btn">Library suggestions</button>
          <button class="btn btn-sm" id="idp-email-btn">Email report</button>
          <button class="btn btn-red btn-sm" id="idp-add-btn">+ Add mitigation</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px 20px;background:var(--bg);border-bottom:1px solid var(--border);flex-shrink:0">
        <div class="stat-box"><div class="stat-lbl">Total</div><div class="stat-num blue">${total}</div></div>
        <div class="stat-box"><div class="stat-lbl">Funded</div><div class="stat-num green">${funded}</div></div>
        <div class="stat-box"><div class="stat-lbl">Awaiting funding</div><div class="stat-num amber">${awaiting}</div></div>
        <div class="stat-box"><div class="stat-lbl">Proposed</div><div class="stat-num" style="color:var(--text3)">${proposed}</div></div>
      </div>

      <div style="display:flex;gap:8px;padding:10px 20px;background:var(--bg);border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap">
        <select class="fl-sel" id="idp-filter-hazard" style="font-size:12px;max-width:180px">
          <option value="">All hazards</option>
          ${_hazards.map(h=>`<option value="${h.hazard_name}">${h.hazard_name}</option>`).join('')}
        </select>
        <select class="fl-sel" id="idp-filter-ward" style="font-size:12px;max-width:140px">
          <option value="">All wards</option>
          ${_wards.map(w=>`<option value="${w.ward_number}">Ward ${w.ward_number}${w.area_name?' — '+w.area_name:''}</option>`).join('')}
        </select>
        <select class="fl-sel" id="idp-filter-status" style="font-size:12px;max-width:170px">
          <option value="">All statuses</option>
          ${STATUSES.map(s=>`<option value="${s.value}">${s.label}</option>`).join('')}
        </select>
        <button class="btn btn-sm" id="idp-filter-btn">Filter</button>
        <button class="btn btn-sm" id="idp-clear-btn">Clear</button>
      </div>

      <div id="idp-form-area" style="flex-shrink:0"></div>
      <div id="idp-library-area" style="flex-shrink:0"></div>
      <div style="padding:16px 20px" id="idp-mit-list">
        ${renderMitList(mits||[])}
      </div>
    </div>`;

  document.getElementById('idp-add-btn')?.addEventListener('click', () => showMitForm(null));
  document.getElementById('idp-library-btn')?.addEventListener('click', () => showLibrary(mits||[]));
  document.getElementById('idp-email-btn')?.addEventListener('click', () => emailReport(mits||[]));
  document.getElementById('idp-filter-btn')?.addEventListener('click', () => applyFilters(mits||[]));
  document.getElementById('idp-clear-btn')?.addEventListener('click', async () => { await renderIDP(); });
  bindMitEvents(mits||[]);
}

function renderMitList(mits) {
  if (!mits.length) return `<div style="text-align:center;padding:48px;color:var(--text3);font-size:13px">
    No mitigations yet. Click <strong style="color:var(--text)">+ Add mitigation</strong> or use <strong style="color:var(--text)">Library suggestions</strong>.</div>`;

  const statusCls = {
    'proposed':'b-gray','linked-awaiting':'b-amber','linked-funded':'b-green',
    'under-review':'b-blue','in-progress':'b-blue','completed':'b-green'
  };
  const statusLabel = {
    'proposed':'Proposed','linked-awaiting':'Awaiting funding','linked-funded':'Funded',
    'under-review':'Under review','in-progress':'In progress','completed':'Completed'
  };

  return mits.map(m => {
    const wardLabels = (Array.isArray(m.affected_wards) && m.affected_wards.length)
      ? m.affected_wards.map(w => { const wd=_wards.find(x=>x.ward_number==w); return `Ward ${w}${wd?.area_name?' ('+wd.area_name+')':''}`; }).join(', ')
      : 'No wards specified';
    const riskCls = m.risk_band==='Extremely High'?'b-red':m.risk_band==='High'?'b-amber':m.risk_band==='Tolerable'?'b-green':'b-gray';

    // Impact rating colour
    const ratingCol = m.impact_rating==='High'?'var(--red)':m.impact_rating==='Medium'?'var(--amber)':m.impact_rating==='Low'?'var(--green)':null;
    const impactAreas = Array.isArray(m.impact_areas) ? m.impact_areas : [];

    return `
      <div class="rec-card" style="margin-bottom:12px" id="mit-card-${m.id}">
        <div class="rec-head" style="flex-wrap:wrap;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;gap:6px;margin-bottom:5px;flex-wrap:wrap">
              <span class="badge ${riskCls}" style="font-size:9px">${m.hazard_name||'—'}</span>
              <span class="badge ${statusCls[m.idp_status]||'b-gray'}" style="font-size:9px">${statusLabel[m.idp_status]||m.idp_status||'Proposed'}</span>
              ${m.idp_kpa?`<span class="badge b-blue" style="font-size:9px">${m.idp_kpa.split(' — ')[0]}</span>`:''}
              ${ratingCol?`<span style="font-size:9px;font-weight:700;color:${ratingCol};font-family:monospace">${m.impact_rating} impact</span>`:''}
              ${m.risk_reduction_pct?`<span style="font-size:9px;font-weight:700;color:var(--purple);font-family:monospace">~${m.risk_reduction_pct}% risk reduction</span>`:''}
              <span style="font-size:10px;color:var(--text3)">${m.mitigation_type||''}</span>
            </div>
            <div style="font-size:13px;font-weight:600;color:var(--text);line-height:1.4">${m.description}</div>
            ${impactAreas.length?`<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:5px">${impactAreas.map(a=>`<span style="font-size:9px;background:var(--blue-dim);border:1px solid rgba(88,166,255,.2);color:var(--blue);border-radius:8px;padding:1px 6px;font-weight:600">${a}</span>`).join('')}</div>`:''}
          </div>
          <div style="display:flex;gap:5px;flex-shrink:0;flex-wrap:wrap">
            <button class="btn btn-sm mit-edit" data-id="${m.id}">Edit</button>
            <button class="btn btn-sm" onclick="window._downloadMit('${m.id}')">↓</button>
            <button class="btn btn-sm btn-red mit-delete" data-id="${m.id}">✕</button>
          </div>
        </div>
        ${m.specific_location?`
          <div style="padding:8px 16px;background:var(--bg3);border-top:1px solid var(--border);display:flex;gap:8px;align-items:flex-start">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="var(--red)" stroke-width="1.5" stroke-linecap="round" style="margin-top:2px;flex-shrink:0"><circle cx="7" cy="6" r="2.5"/><path d="M7 14C7 14 2 9 2 6a5 5 0 0110 0c0 3-5 8-5 8z"/></svg>
            <div>
              <div style="font-size:12px;color:var(--text2)">${m.specific_location}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">${wardLabels}</div>
            </div>
          </div>` : `<div style="padding:5px 16px;border-top:1px solid var(--border);font-size:11px;color:var(--text3)">${wardLabels}</div>`}
        <div style="padding:10px 16px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px 14px">
          <div class="rf"><span class="rf-key">DRR strategy</span><span class="rf-val">${m.drr_strategy||'—'}</span></div>
          <div class="rf"><span class="rf-key">Timeframe</span><span class="rf-val">${m.timeframe||'—'}</span></div>
          <div class="rf"><span class="rf-key">Cost estimate</span><span class="rf-val">${m.cost_estimate||'—'}</span></div>
          <div class="rf"><span class="rf-key">Cost basis</span><span class="rf-val">${m.cost_basis||'—'}</span></div>
          <div class="rf"><span class="rf-key">Responsible</span><span class="rf-val">${m.responsible_owner||'—'}</span></div>
          ${m.idp_vote_number?`<div class="rf"><span class="rf-key">Vote number</span><span class="rf-val" style="font-family:monospace">${m.idp_vote_number}</span></div>`:''}
          ${m.legislation_ref?`<div class="rf" style="grid-column:span 2"><span class="rf-key">Legislation</span><span class="rf-val">${m.legislation_ref}</span></div>`:''}
        </div>
        ${m.drr_justification?`
          <div style="padding:10px 16px;border-top:1px solid var(--border);background:var(--bg3)">
            <div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text3);margin-bottom:5px">DRR Justification</div>
            <div style="font-size:12px;color:var(--text2);line-height:1.7;font-style:italic">${m.drr_justification}</div>
          </div>`:''}
      </div>`;
  }).join('');
}

// ── WARD PICKER HELPERS ───────────────────────────────────
let _selectedWards = [];

function initWardPicker(existingWards = []) {
  _selectedWards = [...existingWards];
  renderWardTags();

  const search = document.getElementById('mf-ward-search');
  const dropdown = document.getElementById('mf-ward-dropdown');
  if (!search || !dropdown) return;

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { dropdown.style.display = 'none'; return; }

    const matches = _wards.filter(w => {
      const num = String(w.ward_number);
      const name = (w.area_name||'').toLowerCase();
      return (num.includes(q) || name.includes(q)) && !_selectedWards.includes(w.ward_number);
    }).slice(0, 12);

    if (!matches.length) { dropdown.style.display = 'none'; return; }

    dropdown.innerHTML = matches.map(w =>
      `<div data-ward="${w.ward_number}" style="padding:7px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s"
        onmouseenter="this.style.background='var(--bg3)'" onmouseleave="this.style.background=''"
        >Ward ${w.ward_number}${w.area_name?' — '+w.area_name:''}</div>`
    ).join('');
    dropdown.style.display = 'block';

    dropdown.querySelectorAll('[data-ward]').forEach(item => {
      item.addEventListener('click', () => {
        _selectedWards.push(parseInt(item.dataset.ward));
        search.value = '';
        dropdown.style.display = 'none';
        renderWardTags();
        updateRiskReduction();
        regenerateJustification();
      });
    });
  });

  // Close dropdown on outside click
  document.addEventListener('click', function closeDD(e) {
    if (!search.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
      document.removeEventListener('click', closeDD);
    }
  });
}

function renderWardTags() {
  const container = document.getElementById('mf-ward-tags');
  const hidden    = document.getElementById('mf-wards-hidden');
  if (!container) return;

  container.innerHTML = _selectedWards.length
    ? _selectedWards.map(w => {
        const wd = _wards.find(x => x.ward_number === w);
        return `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--blue-dim);border:1px solid rgba(88,166,255,.25);color:var(--blue);border-radius:12px;padding:3px 8px;font-size:11px;font-weight:600">
          Ward ${w}${wd?.area_name?' · '+wd.area_name:''}
          <span style="cursor:pointer;opacity:.7;font-size:13px;line-height:1" data-remove="${w}">×</span>
        </span>`;
      }).join('')
    : '<span style="font-size:11px;color:var(--text3);font-style:italic">No wards selected</span>';

  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedWards = _selectedWards.filter(w => w !== parseInt(btn.dataset.remove));
      renderWardTags();
      updateRiskReduction();
      regenerateJustification();
    });
  });

  if (hidden) hidden.value = JSON.stringify(_selectedWards);
}

// ── SMART DRR MODELING HELPERS ────────────────────────────
function getSelectedImpactAreas() {
  return [...document.querySelectorAll('.mf-impact-cb:checked')].map(cb => cb.value);
}

function getSelectedRating() {
  return document.querySelector('.mf-rating-card.selected')?.dataset.rating || '';
}

function updateRiskReduction() {
  const rating = getSelectedRating();
  const areas  = getSelectedImpactAreas();
  const rr     = calcRiskReduction(rating, areas);
  const el     = document.getElementById('mf-risk-range');
  const inp    = document.getElementById('mf-risk-pct');
  if (!el) return;
  if (rr) {
    el.textContent = `Estimated ${rr.min}–${rr.max}% risk reduction`;
    el.style.color = rr.label==='High'?'var(--red)':rr.label==='Medium'?'var(--amber)':'var(--green)';
    if (inp && !inp.dataset.manual) inp.value = Math.round((rr.min + rr.max) / 2);
  } else {
    el.textContent = 'Select impact rating to estimate risk reduction';
    el.style.color = 'var(--text3)';
  }
}

function regenerateJustification() {
  const hazardSel = document.getElementById('mf-hazard')?.value;
  const hazard    = hazardSel === '__custom__'
    ? document.getElementById('mf-hazard-custom')?.value.trim()
    : hazardSel;
  const desc      = document.getElementById('mf-desc')?.value.trim();
  const mitType   = document.getElementById('mf-type')?.value;
  const costBasis = document.getElementById('mf-cost-basis')?.value;
  const rating    = getSelectedRating();
  const areas     = getSelectedImpactAreas();
  const rr        = calcRiskReduction(rating, areas);

  const text = generateJustification({
    hazard,
    wards:        _selectedWards,
    description:  desc,
    impactAreas:  areas,
    costBasis,
    riskRange:    rr,
    muniName:     _user?.municipalities?.name || '',
    mitigationType: mitType,
    impactRating: rating
  });

  const el = document.getElementById('mf-justification');
  if (el && text) el.value = text;
}

// ── FORM ─────────────────────────────────────────────────
function showMitForm(existing) {
  const area = document.getElementById('idp-form-area');
  if (!area) return;
  if (area.innerHTML && !existing) { area.innerHTML=''; return; }

  const m = existing || {};
  const existingWards    = Array.isArray(m.affected_wards) ? m.affected_wards : [];
  const existingAreas    = Array.isArray(m.impact_areas)   ? m.impact_areas   : [];
  const existingRating   = m.impact_rating || '';
  const existingCostBasis= m.cost_basis    || '';
  const existingRiskPct  = m.risk_reduction_pct || '';
  const existingJust     = m.drr_justification  || '';

  area.innerHTML = `
    <div style="background:var(--bg2);border-bottom:2px solid var(--red);padding:20px;border-top:1px solid var(--border)">
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:16px">${existing?'Edit mitigation':'Add mitigation'}</div>

      <!-- Row 1: Hazard · Ward picker · Type -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="fl">
          <span class="fl-label">Hazard</span>
          <select class="fl-sel" id="mf-hazard">
            <option value="">— Select —</option>
            ${_hazards.map(h=>`<option value="${h.hazard_name}" ${m.hazard_name===h.hazard_name?'selected':''}>${h.hazard_name} (${h.risk_band||'?'})</option>`).join('')}
            <option value="__custom__" ${m.hazard_name&&!_hazards.find(h=>h.hazard_name===m.hazard_name)?'selected':''}>Custom</option>
          </select>
          <input class="fl-input" id="mf-hazard-custom" placeholder="Custom hazard name"
            value="${m.hazard_name&&!_hazards.find(h=>h.hazard_name===m.hazard_name)?m.hazard_name:''}"
            style="display:${m.hazard_name&&!_hazards.find(h=>h.hazard_name===m.hazard_name)?'block':'none'};margin-top:4px"/>
        </div>
        <div class="fl">
          <span class="fl-label">Ward(s) affected</span>
          <div style="position:relative">
            <input class="fl-input" id="mf-ward-search" placeholder="Search ward number or area…"
              autocomplete="off" style="font-size:12px"/>
            <div id="mf-ward-dropdown"
              style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg2);border:1px solid var(--border2);border-radius:0 0 6px 6px;max-height:160px;overflow-y:auto;z-index:50;font-size:12px">
            </div>
          </div>
          <div id="mf-ward-tags" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;min-height:24px"></div>
          <input type="hidden" id="mf-wards-hidden"/>
        </div>
        <div class="fl">
          <span class="fl-label">Mitigation type</span>
          <select class="fl-sel" id="mf-type">
            ${MIT_TYPES.map(t=>`<option ${m.mitigation_type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Location + description -->
      <div class="fl" style="margin-bottom:12px">
        <span class="fl-label">Specific location <span style="color:var(--text3);font-size:10px;font-weight:400">Street, river, bridge, landmark, GPS</span></span>
        <input class="fl-input" id="mf-location" value="${m.specific_location||''}"
          placeholder="e.g. Van Riebeeck Street bridge over Grobbelaarsrivier, Ward 4"/>
      </div>
      <div class="fl" style="margin-bottom:12px">
        <span class="fl-label">Intervention description <span style="color:var(--text3);font-size:10px;font-weight:400">Detail for project brief or IDP entry</span></span>
        <textarea class="fl-textarea" id="mf-desc" rows="3" style="min-height:72px">${m.description||''}</textarea>
      </div>

      <!-- IDP fields -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="fl"><span class="fl-label">IDP KPA</span>
          <select class="fl-sel" id="mf-kpa">
            <option value="">— Select —</option>
            ${IDP_KPAS.map(k=>`<option value="${k}" ${m.idp_kpa===k?'selected':''}>${k}</option>`).join('')}
          </select>
        </div>
        <div class="fl"><span class="fl-label">Vote / project number</span>
          <input class="fl-input" id="mf-vote" value="${m.idp_vote_number||''}" placeholder="e.g. 3/4/5/2"/>
        </div>
        <div class="fl"><span class="fl-label">Status</span>
          <select class="fl-sel" id="mf-status">
            ${STATUSES.map(s=>`<option value="${s.value}" ${m.idp_status===s.value?'selected':''}>${s.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- DRR + timeframe + cost -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:20px">
        <div class="fl"><span class="fl-label">DRR strategy</span>
          <select class="fl-sel" id="mf-drr">
            ${DRR.map(s=>`<option ${m.drr_strategy===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="fl"><span class="fl-label">Timeframe</span>
          <select class="fl-sel" id="mf-tf">
            ${TIMEFRAMES.map(t=>`<option ${m.timeframe===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="fl"><span class="fl-label">Cost estimate</span>
          <input class="fl-input" id="mf-cost" value="${m.cost_estimate||''}" placeholder="e.g. R 2.4 million"/>
        </div>
        <div class="fl"><span class="fl-label">Cost estimation basis</span>
          <select class="fl-sel" id="mf-cost-basis">
            <option value="">— Select —</option>
            ${COST_BASES.map(b=>`<option value="${b}" ${existingCostBasis===b?'selected':''}>${b}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- ── SMART DRR MODELING SECTION ── -->
      <div style="background:var(--bg3);border:1px solid var(--border);border-left:3px solid var(--purple);border-radius:0 6px 6px 0;padding:16px;margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:var(--purple);letter-spacing:.06em;text-transform:uppercase;margin-bottom:14px;font-family:monospace">
          Smart Risk Reduction Modelling
        </div>

        <!-- Expected impact areas -->
        <div class="fl" style="margin-bottom:14px">
          <span class="fl-label">Expected impact area <span style="color:var(--text3);font-size:10px;font-weight:400">Select all that apply</span></span>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
            ${IMPACT_AREAS.map(a => `
              <label style="display:inline-flex;align-items:center;gap:5px;background:var(--bg2);border:1px solid ${existingAreas.includes(a)?'var(--blue)':'var(--border)'};border-radius:5px;padding:4px 10px;cursor:pointer;font-size:11px;color:${existingAreas.includes(a)?'var(--blue)':'var(--text2)'};transition:all .12s">
                <input type="checkbox" class="mf-impact-cb" value="${a}" ${existingAreas.includes(a)?'checked':''}
                  style="width:11px;height:11px;accent-color:var(--blue);cursor:pointer"
                  onchange="this.closest('label').style.borderColor=this.checked?'var(--blue)':'var(--border)';this.closest('label').style.color=this.checked?'var(--blue)':'var(--text2)';window._drmsaUpdateRR?.()"/>
                ${a}
              </label>`).join('')}
          </div>
        </div>

        <!-- Impact rating cards -->
        <div class="fl" style="margin-bottom:14px">
          <span class="fl-label">Impact rating</span>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:6px">
            ${IMPACT_RATINGS.map(r => `
              <div class="mf-rating-card ${existingRating===r.value?'selected':''}" data-rating="${r.value}"
                style="border:1px solid ${existingRating===r.value?r.col:'var(--border)'};border-radius:6px;padding:10px 12px;cursor:pointer;text-align:center;transition:all .15s;background:${existingRating===r.value?r.col+'18':'transparent'}">
                <div style="font-size:13px;font-weight:700;color:${r.col}">${r.label}</div>
                <div style="font-size:10px;color:var(--text3);margin-top:3px">${r.sub}</div>
                <div style="font-size:9px;color:var(--text3);margin-top:2px;font-family:monospace">${r.range[0]}–${r.range[1]}% reduction</div>
              </div>`).join('')}
          </div>
        </div>

        <!-- Risk reduction estimate + override -->
        <div style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;margin-bottom:14px">
          <div id="mf-risk-range" style="font-size:13px;font-weight:700;font-family:monospace;color:var(--text3)">
            Select impact rating to estimate risk reduction
          </div>
          <div class="fl" style="margin:0;width:120px">
            <span class="fl-label" style="font-size:10px">Override %</span>
            <input class="fl-input" id="mf-risk-pct" type="number" min="0" max="100"
              value="${existingRiskPct||''}" placeholder="Auto"
              style="font-family:monospace;font-size:13px"
              oninput="this.dataset.manual='1'"/>
          </div>
        </div>

        <!-- Intelligent justification -->
        <div class="fl">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
            <span class="fl-label" style="margin:0">Intelligent justification <span style="color:var(--text3);font-size:10px;font-weight:400">Auto-generated · fully editable</span></span>
            <button class="btn btn-sm" id="mf-regen-btn" style="font-size:10px;padding:3px 10px">↺ Regenerate</button>
          </div>
          <textarea class="fl-textarea" id="mf-justification" rows="4"
            style="min-height:90px;font-size:12px;line-height:1.7;color:var(--text2)"
            placeholder="Fill in the form fields above to auto-generate a justification…">${existingJust}</textarea>
        </div>
      </div>

      <!-- Remaining fields -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="fl"><span class="fl-label">Responsible</span>
          <input class="fl-input" id="mf-owner" value="${m.responsible_owner||''}" placeholder="Dept / Organisation"/>
        </div>
        <div class="fl"><span class="fl-label">Legislation / policy reference</span>
          <input class="fl-input" id="mf-legislation" value="${m.legislation_ref||''}" placeholder="e.g. National Water Act 36 of 1998"/>
        </div>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-green btn-sm" id="mf-save-btn" data-id="${m.id||''}">Save mitigation</button>
        <button class="btn btn-sm" onclick="document.getElementById('idp-form-area').innerHTML=''">Cancel</button>
      </div>
    </div>`;

  // Init ward picker with existing wards
  initWardPicker(existingWards);

  // Expose update functions globally for inline onchange handlers
  window._drmsaUpdateRR = () => { updateRiskReduction(); regenerateJustification(); };

  // Rating card click
  area.querySelectorAll('.mf-rating-card').forEach(card => {
    card.addEventListener('click', () => {
      area.querySelectorAll('.mf-rating-card').forEach(c => {
        const r = IMPACT_RATINGS.find(x => x.value === c.dataset.rating);
        c.classList.remove('selected');
        c.style.borderColor = 'var(--border)';
        c.style.background  = 'transparent';
      });
      const r = IMPACT_RATINGS.find(x => x.value === card.dataset.rating);
      card.classList.add('selected');
      card.style.borderColor = r.col;
      card.style.background  = r.col + '18';
      updateRiskReduction();
      regenerateJustification();
    });
  });

  // Auto-regen on key field changes
  ['mf-hazard','mf-desc','mf-type','mf-cost-basis'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      updateRiskReduction();
      regenerateJustification();
    });
  });
  document.getElementById('mf-desc')?.addEventListener('input', regenerateJustification);

  // Regen button
  document.getElementById('mf-regen-btn')?.addEventListener('click', () => {
    const pct = document.getElementById('mf-risk-pct');
    if (pct) delete pct.dataset.manual;
    updateRiskReduction();
    regenerateJustification();
  });

  // Hazard custom toggle
  document.getElementById('mf-hazard')?.addEventListener('change', function() {
    const custom = document.getElementById('mf-hazard-custom');
    if (custom) custom.style.display = this.value==='__custom__'?'block':'none';
    regenerateJustification();
  });

  // If editing, run initial calculation
  if (existing) {
    updateRiskReduction();
    // Only regenerate if no existing justification
    if (!existingJust) regenerateJustification();
  }

  document.getElementById('mf-save-btn')?.addEventListener('click', saveMit);
}

async function saveMit() {
  const hSel   = document.getElementById('mf-hazard')?.value;
  const hazard = hSel==='__custom__'
    ? (document.getElementById('mf-hazard-custom')?.value.trim()||'')
    : hSel;
  const desc   = document.getElementById('mf-desc')?.value.trim();
  const id     = document.getElementById('mf-save-btn')?.dataset.id;

  if (!hazard) { alert('Please select a hazard.'); return; }
  if (!desc)   { alert('Please enter a description.'); return; }

  const hData   = _hazards.find(h=>h.hazard_name===hazard);
  const btn     = document.getElementById('mf-save-btn');
  if (btn) { btn.textContent='Saving…'; btn.disabled=true; }

  // Read risk reduction — manual override takes priority
  const riskPctEl = document.getElementById('mf-risk-pct');
  const riskPct   = riskPctEl?.value ? parseInt(riskPctEl.value) : null;

  const payload = {
    municipality_id:    _muniId,
    hazard_name:        hazard,
    hazard_category:    hData?.hazard_category||null,
    risk_band:          hData?.risk_band||null,
    mitigation_type:    {'Structural':'structural','Non-structural':'non-structural','Policy/Plan':'Policy/Plan','Awareness/Training':'Awareness/Training'}[document.getElementById('mf-type')?.value] || document.getElementById('mf-type')?.value || 'structural',
    description:        desc,
    specific_location:  document.getElementById('mf-location')?.value.trim(),
    affected_wards:     _selectedWards,
    idp_kpa:            document.getElementById('mf-kpa')?.value,
    idp_vote_number:    document.getElementById('mf-vote')?.value.trim(),
    idp_status:         document.getElementById('mf-status')?.value||'proposed',
    drr_strategy:       document.getElementById('mf-drr')?.value,
    timeframe:          document.getElementById('mf-tf')?.value,
    cost_estimate:      document.getElementById('mf-cost')?.value.trim(),
    cost_basis:         document.getElementById('mf-cost-basis')?.value||null,
    responsible_owner:  document.getElementById('mf-owner')?.value.trim(),
    legislation_ref:    document.getElementById('mf-legislation')?.value.trim(),
    impact_areas:       getSelectedImpactAreas(),
    impact_rating:      getSelectedRating()||null,
    risk_reduction_pct: riskPct,
    drr_justification:  document.getElementById('mf-justification')?.value.trim()||null,
    is_library:         false
  };

  const { error } = id
    ? await supabase.from('mitigations').update(payload).eq('id',id)
    : await supabase.from('mitigations').insert(payload);

  if (error) { showToast(error.message, true); if(btn){btn.textContent='Save mitigation';btn.disabled=false;} return; }

  showToast('✓ Mitigation saved successfully!');
  document.getElementById('idp-form-area').innerHTML = '';
  _selectedWards = [];
  await renderIDP();
}

async function showLibrary() {
  const area = document.getElementById('idp-library-area');
  if (!area) return;
  if (area.innerHTML) { area.innerHTML=''; return; }
  _libCache = [];

  const names = _hazards.map(h=>h.hazard_name);
  const { data: suggestions } = await supabase
    .from('mitigations').select('*').eq('is_library',true)
    .in('hazard_name', names.length ? names : ['__none__']);

  area.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-left:3px solid var(--blue);padding:16px 20px;border-top:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:var(--text)">Library suggestions for your assessed hazards</div>
        <button class="btn btn-sm" onclick="document.getElementById('idp-library-area').innerHTML=''">Close</button>
      </div>
      ${suggestions?.length ? suggestions.map(s=>`
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;display:flex;align-items:flex-start;gap:12px">
          <div style="flex:1">
            <div style="display:flex;gap:6px;margin-bottom:4px;flex-wrap:wrap">
              <span class="badge b-blue" style="font-size:9px">${s.hazard_name}</span>
              <span class="badge b-gray" style="font-size:9px">${s.mitigation_type}</span>
              ${s.idp_kpa?`<span class="badge b-purple" style="font-size:9px">${s.idp_kpa.split(' — ')[0]}</span>`:''}
            </div>
            <div style="font-size:12px;color:var(--text2);line-height:1.5">${s.description}</div>
            ${s.legislation_ref?`<div style="font-size:11px;color:var(--text3);margin-top:3px">${s.legislation_ref}</div>`:''}
            ${s.cost_estimate?`<div style="font-size:11px;color:var(--text3)">${s.cost_estimate}</div>`:''}
          </div>
          <button class="btn btn-sm btn-green idp-lib-add" style="flex-shrink:0"
            data-idx="${_libCache.push({hazard_name:s.hazard_name,description:s.description,mitigation_type:s.mitigation_type,idp_kpa:s.idp_kpa,legislation_ref:s.legislation_ref,drr_strategy:s.drr_strategy,cost_estimate:s.cost_estimate})-1}">+ Add</button>
        </div>`).join('')
      : '<div style="font-size:12px;color:var(--text3)">No library suggestions for your assessed hazards. Complete an HVC assessment first.</div>'}
    </div>`;

  area.querySelectorAll('.idp-lib-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx  = parseInt(btn.dataset.idx);
      const data = _libCache[idx];
      if (data) { area.innerHTML = ''; showMitForm(data); }
    });
  });
}

function emailReport(mits) {
  const muniName = _user?.municipalities?.name || 'Municipality';
  const lines = [`IDP MITIGATION REGISTER — ${muniName}`, `Generated: ${new Date().toLocaleString('en-ZA')}`, ''];
  mits.forEach((m,i) => {
    lines.push(`${i+1}. ${m.hazard_name} — ${m.description}`);
    if (m.specific_location) lines.push(`   Location: ${m.specific_location}`);
    if (m.affected_wards?.length) lines.push(`   Wards: ${m.affected_wards.join(', ')}`);
    if (m.idp_kpa) lines.push(`   ${m.idp_kpa}`);
    if (m.idp_vote_number) lines.push(`   Vote: ${m.idp_vote_number}`);
    if (m.cost_estimate) lines.push(`   Cost: ${m.cost_estimate}`);
    if (m.cost_basis) lines.push(`   Cost basis: ${m.cost_basis}`);
    if (m.impact_rating) lines.push(`   Impact: ${m.impact_rating}`);
    if (m.risk_reduction_pct) lines.push(`   Est. risk reduction: ~${m.risk_reduction_pct}%`);
    if (m.responsible_owner) lines.push(`   Responsible: ${m.responsible_owner}`);
    if (m.drr_justification) lines.push(`   Justification: ${m.drr_justification}`);
    lines.push('');
  });
  const subject = encodeURIComponent(`IDP Mitigation Register — ${muniName}`);
  const body    = encodeURIComponent(lines.join('\n'));
  window.open(`mailto:?subject=${subject}&body=${body}`);
}

function applyFilters(all) {
  const hazard = document.getElementById('idp-filter-hazard')?.value;
  const ward   = document.getElementById('idp-filter-ward')?.value;
  const status = document.getElementById('idp-filter-status')?.value;
  let f = all;
  if (hazard) f=f.filter(m=>m.hazard_name===hazard);
  if (ward)   f=f.filter(m=>Array.isArray(m.affected_wards)&&m.affected_wards.includes(parseInt(ward)));
  if (status) f=f.filter(m=>m.idp_status?.toLowerCase().includes(status.toLowerCase().split(' ')[0]));
  document.getElementById('idp-mit-list').innerHTML = renderMitList(f);
  bindMitEvents(f);
}

function bindMitEvents(mits) {
  document.querySelectorAll('.mit-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this mitigation?')) return;
      await supabase.from('mitigations').delete().eq('id',btn.dataset.id);
      showToast('Deleted');
      await renderIDP();
    });
  });
  document.querySelectorAll('.mit-edit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { data:m } = await supabase.from('mitigations').select('*').eq('id',btn.dataset.id).single();
      if (m) showMitForm(m);
    });
  });
}

window._downloadMit = function(id) {
  const el = document.getElementById(`mit-card-${id}`);
  const text = el ? el.innerText : 'Mitigation record';
  const blob = new Blob([text], { type:'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href:url, download:`DRMSA-mitigation-${id}.txt` });
  a.click(); URL.revokeObjectURL(url);
};
