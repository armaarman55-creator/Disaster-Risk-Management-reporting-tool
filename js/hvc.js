// js/hvc.js — Full HVC Assessment Tool (scientifically intact)
import { supabase } from './supabase.js';

let _muniId = null;
let _user   = null;

// ── HAZARD CATEGORIES (38 total) ─────────────────────────
const HAZARD_CATEGORIES = {
  'Hydro-meteorological': ['Floods','Droughts','Hailstorms','Strong Winds','Storm Surges','Extreme Heat','Cold Fronts','Lightning','Tornadoes','Snow/Ice'],
  'Geological':           ['Earthquakes','Sinkholes','Landslides','Soil Erosion'],
  'Biological':           ['Epidemics','Animal Disease','Locusts','Invasive Species','Waterborne Disease'],
  'Fire':                 ['Veld Fires','Structural Fires','Informal Settlement Fires','Industrial Fires','Agricultural Fires'],
  'Technological':        ['Chemical Spills/HAZMAT','Electricity Disruption','Water Supply Disruption','Sewage Failure','Road/Rail Accidents','Dam Failure','Industrial Accidents','Oil Spills','Pipeline Failures','Telecoms Failure','Nuclear/Radiological'],
  'Socio-economic':       ['Civil Unrest','Migration Pressure','Large Gatherings','Food Insecurity','Informal Settlement Hazards','Crime/Violence']
};

const SCORE_OPTS = [1,2,3,4,5];
const SCORE_LABEL = { 1:'1 – Very Low', 2:'2 – Low', 3:'3 – Moderate', 4:'4 – High', 5:'5 – Very High' };
const RISK_BAND = (r) => r<=5?'Negligible':r<=10?'Low':r<=15?'Tolerable':r<=20?'High':'Extremely High';
const BAND_CLS  = { 'Negligible':'c-n','Low':'c-l','Tolerable':'c-t','High':'c-h','Extremely High':'c-xh' };
const PRIORITY_LEVEL = (p) => p<=2?'LOW':p<=3.5?'MEDIUM':'HIGH';

// Store scores in memory during session
const _scores = {};

export async function initHVC(user) {
  _user   = user;
  _muniId = user?.municipality_id;
  await renderHVCPage();
}

async function renderHVCPage() {
  const page = document.getElementById('page-hvc');
  if (!page) return;

  const { data: assessments } = await supabase
    .from('hvc_assessments')
    .select('id, label, season, year, hazard_count, status, created_at')
    .eq('municipality_id', _muniId)
    .order('created_at', { ascending: false });

  page.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div style="padding:14px 20px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div>
          <div style="font-family:Inter,system-ui,sans-serif;font-size:15px;font-weight:800;color:var(--text)">HVC Assessment Tool</div>
          <div style="font-size:11px;color:var(--text3);margin-top:1px;font-family:monospace">Hazard · Vulnerability · Capacity — DMA Act 57 of 2002 · Annexure 3</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" id="hvc-view-matrix-btn" style="display:none">Risk Matrix</button>
          <button class="btn btn-sm btn-red" id="hvc-new-btn">+ New assessment</button>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto" id="hvc-content">
        ${assessments?.length ? renderAssessmentList(assessments) : renderNewForm()}
      </div>
    </div>`;

  document.getElementById('hvc-new-btn')?.addEventListener('click', () => {
    document.getElementById('hvc-content').innerHTML = renderNewForm();
    document.getElementById('hvc-view-matrix-btn').style.display = 'none';
    bindNewFormEvents();
  });

  if (assessments?.length) bindListEvents(assessments);
  else bindNewFormEvents();
}

// ── ASSESSMENT LIST ───────────────────────────────────────
function renderAssessmentList(assessments) {
  return `
    <div style="padding:22px">
      <div class="sec-hdr">
        <div><div class="sec-hdr-title">Assessments</div><div class="sec-hdr-sub">${assessments.length} completed</div></div>
      </div>
      ${assessments.map(a => `
        <div class="rec-card" style="cursor:pointer;margin-bottom:10px" data-id="${a.id}">
          <div class="rec-head">
            <div>
              <div class="rec-name">${a.label || a.season + ' ' + a.year}</div>
              <div class="rec-meta">${a.created_at ? new Date(a.created_at).toLocaleDateString('en-ZA') : '—'} · ${a.hazard_count || 0} hazards scored</div>
            </div>
            <div style="display:flex;gap:8px">
              <span class="badge ${a.status === 'complete' ? 'b-green' : 'b-amber'}">${(a.status||'draft').toUpperCase()}</span>
              <button class="btn btn-sm" data-open="${a.id}">View →</button>
            </div>
          </div>
        </div>`).join('')}
    </div>`;
}

function bindListEvents(assessments) {
  document.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => openAssessment(btn.dataset.open));
  });
}

// ── NEW ASSESSMENT FORM ───────────────────────────────────
function renderNewForm() {
  const tabs = Object.keys(HAZARD_CATEGORIES);
  return `
    <div style="padding:22px">
      <div class="panel" style="margin-bottom:16px">
        <div class="ph"><div class="ph-title">Assessment details</div></div>
        <div class="pb">
          <div class="frow">
            <div class="fl"><span class="fl-label">Label</span><input class="fl-input" id="a-label" placeholder="e.g. Summer 2025"/></div>
            <div class="fl"><span class="fl-label">Season</span>
              <select class="fl-sel" id="a-season">
                <option>Summer</option><option>Autumn</option><option>Winter</option><option>Spring</option><option>Annual</option>
              </select>
            </div>
          </div>
          <div class="frow">
            <div class="fl"><span class="fl-label">Year</span><input class="fl-input" id="a-year" type="number" value="${new Date().getFullYear()}"/></div>
            <div class="fl"><span class="fl-label">Lead assessor</span><input class="fl-input" id="a-lead" placeholder="Full name"/></div>
          </div>
        </div>
      </div>

      <!-- Section tabs -->
      <div style="display:flex;gap:2px;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:3px;margin-bottom:16px;flex-wrap:wrap" id="hvc-tabs">
        ${tabs.map((cat, i) => `
          <div class="hvc-tab ${i===0?'on':''}" data-cat="${cat}"
            style="flex:1;min-width:120px;text-align:center;padding:7px 10px;font-size:11px;font-weight:600;border-radius:6px;cursor:pointer;color:${i===0?'var(--text)':'var(--text3)'};background:${i===0?'var(--bg2)':'transparent'};transition:all .15s;font-family:Inter,system-ui,sans-serif;white-space:nowrap">
            ${cat}
          </div>`).join('')}
      </div>

      <!-- Hazard rows per tab -->
      ${tabs.map((cat, i) => `
        <div id="tab-${slugify(cat)}" style="display:${i===0?'block':'none'}">
          ${renderHazardSection(cat)}
        </div>`).join('')}

      <div style="margin-top:20px;display:flex;gap:10px;align-items:center">
        <button class="btn btn-primary" id="save-hvc-btn">Save assessment</button>
        <button class="btn btn-sm" id="preview-matrix-btn">Preview risk matrix</button>
        <span id="hvc-save-msg" style="font-size:12px;color:var(--green);display:none;font-family:monospace">✓ Saved</span>
      </div>

      <!-- Risk matrix (hidden until preview) -->
      <div id="risk-matrix-wrap" style="display:none;margin-top:20px">
        ${renderRiskMatrix()}
      </div>
    </div>`;
}

function renderHazardSection(cat) {
  const hazards = HAZARD_CATEGORIES[cat];
  return `
    <div style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);padding:8px 0 6px;border-bottom:1px solid var(--border);margin-bottom:10px;font-family:monospace">${cat}</div>
      ${hazards.map(h => renderHazardRow(h, cat)).join('')}
    </div>`;
}

function renderHazardRow(hazard, cat) {
  const id = slugify(hazard);
  const sel = (key, label) => `
    <div style="display:flex;flex-direction:column;gap:3px">
      <div style="font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--text3);font-family:monospace">${label}</div>
      <select class="fl-sel hvc-score" style="font-size:11px;padding:5px 6px" data-hazard="${id}" data-key="${key}" onchange="recalcHazard('${id}')">
        <option value="">—</option>
        ${SCORE_OPTS.map(v=>`<option value="${v}">${SCORE_LABEL[v]}</option>`).join('')}
      </select>
    </div>`;

  return `
    <div class="panel" style="margin-bottom:8px" id="hrow-${id}">
      <div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="font-size:13px;font-weight:600;color:var(--text);font-family:Inter,system-ui,sans-serif">${hazard}</div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:11px;color:var(--text3);font-family:monospace">Risk: <strong id="risk-val-${id}" style="color:var(--text)">—</strong></span>
          <span class="badge b-gray" id="risk-chip-${id}">NOT SCORED</span>
        </div>
      </div>

      <!-- HAZARD ANALYSIS -->
      <div style="padding:10px 14px;border-bottom:1px solid var(--border)">
        <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--blue);margin-bottom:8px;font-family:monospace">A. HAZARD ANALYSIS</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
          ${sel(`${id}_aa`, 'Affected Area')}
          ${sel(`${id}_pb`, 'Probability')}
          ${sel(`${id}_fr`, 'Frequency')}
          ${sel(`${id}_pr`, 'Predictability')}
        </div>
        <div style="margin-top:6px;font-size:11px;color:var(--text3);font-family:monospace">
          Hazard Score (avg): <strong id="hs-${id}" style="color:var(--blue)">—</strong>
        </div>
      </div>

      <!-- VULNERABILITY -->
      <div style="padding:10px 14px;border-bottom:1px solid var(--border)">
        <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--amber);margin-bottom:8px;font-family:monospace">B. VULNERABILITY ASSESSMENT (PESTE)</div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">
          ${sel(`${id}_vp`, 'Political')}
          ${sel(`${id}_ve`, 'Economic')}
          ${sel(`${id}_vs`, 'Social')}
          ${sel(`${id}_vt`, 'Technological')}
          ${sel(`${id}_vn`, 'Environmental')}
        </div>
        <div style="margin-top:6px;font-size:11px;color:var(--text3);font-family:monospace">
          Vulnerability Score (avg): <strong id="vs-${id}" style="color:var(--amber)">—</strong>
        </div>
      </div>

      <!-- CAPACITY -->
      <div style="padding:10px 14px;border-bottom:1px solid var(--border)">
        <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--green);margin-bottom:8px;font-family:monospace">C. CAPACITY ASSESSMENT</div>
        <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">
          ${sel(`${id}_ci`, 'Institutional')}
          ${sel(`${id}_cp`, 'Programme')}
          ${sel(`${id}_cq`, 'Public Participation')}
          ${sel(`${id}_cf`, 'Financial')}
          ${sel(`${id}_ch`, 'People')}
          ${sel(`${id}_cs`, 'Support Networks')}
        </div>
        <div style="margin-top:6px;font-size:11px;color:var(--text3);font-family:monospace">
          Capacity Score (avg): <strong id="cs-${id}" style="color:var(--green)">—</strong>
          &nbsp;&nbsp;Resilience Index (V÷C): <strong id="ri-${id}" style="color:var(--text)">—</strong>
        </div>
      </div>

      <!-- PRIORITY INDEX -->
      <div style="padding:10px 14px;border-bottom:1px solid var(--border)">
        <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--purple);margin-bottom:8px;font-family:monospace">D. PRIORITY INDEX</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          ${sel(`${id}_pi`, 'Importance')}
          ${sel(`${id}_pu`, 'Urgency')}
          ${sel(`${id}_pg`, 'Growth')}
        </div>
        <div style="margin-top:6px;font-size:11px;color:var(--text3);font-family:monospace">
          Priority Index (avg): <strong id="pi-${id}" style="color:var(--purple)">—</strong>
          &nbsp;&nbsp;Priority Level: <strong id="pl-${id}" style="color:var(--purple)">—</strong>
        </div>
      </div>

      <!-- ROLE PLAYERS -->
      <div style="padding:10px 14px">
        <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);margin-bottom:8px;font-family:monospace">E. ROLE PLAYERS</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
          <div class="fl"><span class="fl-label">Primary owner</span><input class="fl-input" id="${id}_r1" placeholder="Organisation"/></div>
          <div class="fl"><span class="fl-label">Secondary owner</span><input class="fl-input" id="${id}_r2" placeholder="Organisation"/></div>
          <div class="fl"><span class="fl-label">Tertiary owner</span><input class="fl-input" id="${id}_r3" placeholder="Organisation"/></div>
        </div>
        <div class="fl" style="margin-top:6px"><span class="fl-label">Notes</span><textarea class="fl-textarea" id="${id}_notes" rows="2" style="min-height:52px"></textarea></div>
      </div>
    </div>`;
}

// ── RISK MATRIX ───────────────────────────────────────────
function renderRiskMatrix() {
  const rows = [5,4,3,2,1];
  const cols = [1,2,3,4,5];
  const cellColour = (impact, likelihood) => {
    const score = impact * likelihood;
    if (score >= 20) return '#f85149';
    if (score >= 12) return '#d29922';
    if (score >= 6)  return '#3fb950';
    return '#58a6ff';
  };

  return `
    <div class="panel">
      <div class="ph"><div class="ph-title">Risk Matrix — Likelihood vs Impact</div></div>
      <div class="pb" style="overflow-x:auto">
        <div style="display:inline-block;min-width:400px">
          <div style="display:flex;margin-bottom:4px;margin-left:60px">
            ${cols.map(c=>`<div style="width:60px;text-align:center;font-size:10px;color:var(--text3);font-family:monospace;font-weight:700">Impact ${c}</div>`).join('')}
          </div>
          ${rows.map(r => `
            <div style="display:flex;align-items:center;margin-bottom:3px">
              <div style="width:60px;font-size:10px;color:var(--text3);font-family:monospace;font-weight:700;padding-right:8px;text-align:right">L${r}</div>
              ${cols.map(c => {
                const bg = cellColour(c, r);
                return `<div style="width:60px;height:44px;background:${bg};opacity:.22;border-radius:3px;margin:1px;position:relative" id="matrix-cell-${r}-${c}">
                  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-family:monospace;color:rgba(230,237,243,.7);font-weight:700"></div>
                </div>`;
              }).join('')}
            </div>`).join('')}
          <div style="display:flex;margin-top:8px;gap:12px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:12px;background:#f85149;border-radius:2px"></div><span style="font-size:10px;color:var(--text3);font-family:monospace">Extremely High (≥20)</span></div>
            <div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:12px;background:#d29922;border-radius:2px"></div><span style="font-size:10px;color:var(--text3);font-family:monospace">High (12–19)</span></div>
            <div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:12px;background:#3fb950;border-radius:2px"></div><span style="font-size:10px;color:var(--text3);font-family:monospace">Tolerable (6–11)</span></div>
            <div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:12px;background:#58a6ff;border-radius:2px"></div><span style="font-size:10px;color:var(--text3);font-family:monospace">Low/Negligible (&lt;6)</span></div>
          </div>
        </div>
      </div>
    </div>`;
}

// ── RECALCULATION ─────────────────────────────────────────
window.recalcHazard = function(id) {
  const g = (key) => {
    const el = document.querySelector(`[data-hazard="${id}"][data-key="${id}_${key}"]`);
    return el?.value ? parseFloat(el.value) : null;
  };

  // A. Hazard Score
  const aa=g('aa'), pb=g('pb'), fr=g('fr'), pr=g('pr');
  const hVals = [aa,pb,fr,pr].filter(v=>v!==null);
  const hScore = hVals.length ? hVals.reduce((a,b)=>a+b,0)/hVals.length : null;

  // B. Vulnerability Score
  const vp=g('vp'), ve=g('ve'), vs=g('vs'), vt=g('vt'), vn=g('vn');
  const vVals = [vp,ve,vs,vt,vn].filter(v=>v!==null);
  const vScore = vVals.length ? vVals.reduce((a,b)=>a+b,0)/vVals.length : null;

  // C. Capacity Score
  const ci=g('ci'), cp=g('cp'), cq=g('cq'), cf=g('cf'), ch=g('ch'), cs=g('cs');
  const cVals = [ci,cp,cq,cf,ch,cs].filter(v=>v!==null);
  const cScore = cVals.length ? cVals.reduce((a,b)=>a+b,0)/cVals.length : null;

  // Resilience = V / C
  const resilience = (vScore !== null && cScore !== null && cScore > 0) ? vScore / cScore : null;

  // Risk Rating = Hazard × Resilience
  const riskRating = (hScore !== null && resilience !== null) ? hScore * resilience : null;

  // D. Priority Index
  const pi=g('pi'), pu=g('pu'), pg=g('pg');
  const pVals = [pi,pu,pg].filter(v=>v!==null);
  const priorityIdx = pVals.length ? pVals.reduce((a,b)=>a+b,0)/pVals.length : null;

  // Store in memory
  _scores[id] = { hScore, vScore, cScore, resilience, riskRating, priorityIdx,
    aa,pb,fr,pr, vp,ve,vs,vt,vn, ci,cp,cq,cf,ch,cs, pi,pu,pg };

  // Update display
  setTxt(`hs-${id}`,  hScore    !== null ? hScore.toFixed(2)    : '—');
  setTxt(`vs-${id}`,  vScore    !== null ? vScore.toFixed(2)    : '—');
  setTxt(`cs-${id}`,  cScore    !== null ? cScore.toFixed(2)    : '—');
  setTxt(`ri-${id}`,  resilience!== null ? resilience.toFixed(3): '—');
  setTxt(`pi-${id}`,  priorityIdx!==null ? priorityIdx.toFixed(2):'—');
  setTxt(`pl-${id}`,  priorityIdx!==null ? PRIORITY_LEVEL(priorityIdx):'—');

  if (riskRating !== null) {
    const band = RISK_BAND(riskRating);
    setTxt(`risk-val-${id}`, riskRating.toFixed(2));
    const chip = document.getElementById(`risk-chip-${id}`);
    if (chip) { chip.textContent = band.toUpperCase(); chip.className = `badge ${BAND_CLS[band]}`; }
  }
};

// ── BIND FORM EVENTS ──────────────────────────────────────
function bindNewFormEvents() {
  // Tab switching
  document.querySelectorAll('.hvc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.hvc-tab').forEach(t => {
        t.classList.remove('on');
        t.style.background = 'transparent';
        t.style.color = 'var(--text3)';
      });
      tab.classList.add('on');
      tab.style.background = 'var(--bg2)';
      tab.style.color = 'var(--text)';

      Object.keys(HAZARD_CATEGORIES).forEach(cat => {
        const el = document.getElementById(`tab-${slugify(cat)}`);
        if (el) el.style.display = cat === tab.dataset.cat ? 'block' : 'none';
      });
    });
  });

  // Preview matrix
  document.getElementById('preview-matrix-btn')?.addEventListener('click', () => {
    const wrap = document.getElementById('risk-matrix-wrap');
    if (wrap) {
      wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
      updateRiskMatrix();
    }
  });

  // Save
  document.getElementById('save-hvc-btn')?.addEventListener('click', saveAssessment);
}

function updateRiskMatrix() {
  // Plot scored hazards on the matrix
  Object.entries(_scores).forEach(([id, s]) => {
    if (s.riskRating === null) return;
    const impact     = Math.round(s.hScore || 1);
    const likelihood = Math.round(((s.pb || 1) + (s.fr || 1)) / 2);
    const cell = document.getElementById(`matrix-cell-${likelihood}-${impact}`);
    if (cell) {
      cell.style.opacity = '0.85';
      const inner = cell.querySelector('div');
      if (inner) inner.textContent = id.slice(0,3).toUpperCase();
    }
  });
}

// ── SAVE ─────────────────────────────────────────────────
async function saveAssessment() {
  const label = document.getElementById('a-label')?.value.trim();
  if (!label) { alert('Please enter an assessment label.'); return; }

  const btn = document.getElementById('save-hvc-btn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  const hazardRows = [];
  let totalCat = null;

  Object.entries(HAZARD_CATEGORIES).forEach(([cat, hazards]) => {
    hazards.forEach(hazard => {
      const id = slugify(hazard);
      const s = _scores[id];
      if (!s || s.hScore === null) return;
      hazardRows.push({
        municipality_id:    _muniId,
        hazard_name:        hazard,
        hazard_category:    cat,
        affected_area:      s.aa, probability: s.pb, frequency: s.fr, predictability: s.pr,
        hazard_score:       s.hScore,
        vulnerability_score: s.vScore,
        capacity_score:     s.cScore,
        resilience_index:   s.resilience,
        risk_rating:        s.riskRating,
        risk_band:          s.riskRating !== null ? RISK_BAND(s.riskRating) : null,
        importance:         s.pi, urgency: s.pu, growth: s.pg,
        priority_index:     s.priorityIdx,
        priority_level:     s.priorityIdx !== null ? PRIORITY_LEVEL(s.priorityIdx) : null,
      });
    });
  });

  const { data: assessment, error } = await supabase
    .from('hvc_assessments')
    .insert({
      municipality_id: _muniId,
      label,
      season:        document.getElementById('a-season')?.value,
      year:          parseInt(document.getElementById('a-year')?.value),
      lead_assessor: document.getElementById('a-lead')?.value,
      hazard_count:  hazardRows.length,
      status:        'complete'
    })
    .select().single();

  if (error) { alert('Error saving: ' + error.message); if(btn){btn.textContent='Save assessment';btn.disabled=false;} return; }

  if (hazardRows.length) {
    await supabase.from('hvc_hazard_scores')
      .insert(hazardRows.map(r => ({ ...r, assessment_id: assessment.id })));
  }

  const msg = document.getElementById('hvc-save-msg');
  if (msg) msg.style.display = 'inline';
  if (btn) { btn.textContent = 'Save assessment'; btn.disabled = false; }
  setTimeout(() => renderHVCPage(), 1500);
}

// ── OPEN EXISTING ─────────────────────────────────────────
async function openAssessment(id) {
  const { data: scores } = await supabase
    .from('hvc_hazard_scores')
    .select('*')
    .eq('assessment_id', id)
    .order('risk_rating', { ascending: false });

  const content = document.getElementById('hvc-content');
  if (!content) return;

  content.innerHTML = `
    <div style="padding:22px">
      <button class="btn btn-sm" id="hvc-back-btn" style="margin-bottom:16px">← Back to list</button>
      <div class="sec-hdr">
        <div><div class="sec-hdr-title">Assessment results</div><div class="sec-hdr-sub">${scores?.length || 0} hazards scored</div></div>
        <button class="btn btn-sm" id="show-matrix-btn">Show risk matrix</button>
      </div>
      <div class="panel">
        <div class="ph"><div class="ph-title">Risk ranking</div></div>
        <div class="pb" style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="border-bottom:1px solid var(--border)">
                ${['#','Hazard','Category','H.Score','V.Score','C.Score','Resilience','Risk Rating','Band','Priority','Level'].map(h=>
                  `<th style="padding:7px 8px;text-align:left;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text3);font-family:monospace;white-space:nowrap">${h}</th>`
                ).join('')}
              </tr>
            </thead>
            <tbody>
              ${(scores||[]).map((s,i) => `
                <tr style="border-bottom:1px solid rgba(48,54,61,.4)">
                  <td style="padding:7px 8px;color:var(--text3);font-family:monospace">${i+1}</td>
                  <td style="padding:7px 8px;font-weight:600;color:var(--text)">${s.hazard_name}</td>
                  <td style="padding:7px 8px;color:var(--text3)">${s.hazard_category||'—'}</td>
                  <td style="padding:7px 8px;font-family:monospace">${s.hazard_score?.toFixed(2)||'—'}</td>
                  <td style="padding:7px 8px;font-family:monospace">${s.vulnerability_score?.toFixed(2)||'—'}</td>
                  <td style="padding:7px 8px;font-family:monospace">${s.capacity_score?.toFixed(2)||'—'}</td>
                  <td style="padding:7px 8px;font-family:monospace">${s.resilience_index?.toFixed(3)||'—'}</td>
                  <td style="padding:7px 8px;font-family:monospace;font-weight:700">${s.risk_rating?.toFixed(2)||'—'}</td>
                  <td style="padding:7px 8px"><span class="badge ${BAND_CLS[s.risk_band||'']||'b-gray'}">${(s.risk_band||'—').toUpperCase()}</span></td>
                  <td style="padding:7px 8px;font-family:monospace">${s.priority_index?.toFixed(2)||'—'}</td>
                  <td style="padding:7px 8px"><span class="badge ${s.priority_level==='HIGH'?'b-red':s.priority_level==='MEDIUM'?'b-amber':'b-gray'}">${s.priority_level||'—'}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div id="matrix-view" style="margin-top:16px;display:none">${renderRiskMatrix()}</div>
    </div>`;

  document.getElementById('hvc-back-btn')?.addEventListener('click', renderHVCPage);
  document.getElementById('show-matrix-btn')?.addEventListener('click', () => {
    const m = document.getElementById('matrix-view');
    if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
  });
}

// ── HELPERS ───────────────────────────────────────────────
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]/g,'-'); }
function setTxt(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }
