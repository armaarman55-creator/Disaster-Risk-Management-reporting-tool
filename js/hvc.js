// js/hvc.js
import { supabase } from './supabase.js';

let _muniId = null;

const HAZARD_CATEGORIES = {
  'Hydro-meteorological': ['Floods','Droughts','Hailstorms','Strong Winds','Storm Surges','Extreme Heat','Cold Fronts','Lightning','Tornadoes','Snow/Ice'],
  'Geological': ['Earthquakes','Sinkholes','Landslides','Soil Erosion'],
  'Biological': ['Epidemics','Animal Disease','Locusts','Invasive Species','Waterborne Disease'],
  'Fire': ['Veld Fires','Structural Fires','Informal Settlement Fires','Industrial Fires','Agricultural Fires'],
  'Technological': ['Chemical Spills/HAZMAT','Electricity Disruption','Water Supply Disruption','Sewage Failure','Road/Rail Accidents','Dam Failure','Industrial Accidents','Oil Spills','Pipeline Failures','Telecoms Failure','Nuclear/Radiological'],
  'Socio-economic': ['Civil Unrest','Migration Pressure','Large Gatherings','Food Insecurity','Informal Settlement Hazards']
};

const SCORE_LABELS = {
  1: 'Very low', 2: 'Low', 3: 'Moderate', 4: 'High', 5: 'Very high'
};

export async function initHVC(user) {
  _muniId = user?.municipality_id;
  await renderHVCPage();
}

async function renderHVCPage() {
  const page = document.getElementById('page-hvc');
  if (!page) return;

  const { data: assessments } = await supabase
    .from('hvc_assessments')
    .select('*')
    .eq('municipality_id', _muniId)
    .order('created_at', { ascending: false });

  page.innerHTML = `
    <div style="display:flex;flex-direction:column;height:calc(100vh - 52px)">
      <div style="padding:13px 18px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div>
          <div style="font-family:var(--font-display);font-size:14px;font-weight:800;color:var(--text)">HVC Assessment Tool</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px;font-family:var(--font-mono)">Hazard · Vulnerability · Capacity — DMA Act 57 of 2002</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" id="export-hvc-btn">Export XLS</button>
          <button class="btn btn-red btn-sm" id="new-assessment-btn">+ New assessment</button>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:22px">
        ${assessments?.length ? renderAssessmentList(assessments) : renderNewAssessmentForm()}
      </div>
    </div>`;

  document.getElementById('new-assessment-btn')?.addEventListener('click', () => {
    document.querySelector('#page-hvc [style*="overflow-y:auto"]').innerHTML = renderNewAssessmentForm();
    bindNewAssessmentEvents();
  });
  document.getElementById('export-hvc-btn')?.addEventListener('click', exportHVC);
  bindNewAssessmentEvents();
}

function renderAssessmentList(assessments) {
  return `
    <div class="sec-hdr">
      <div><div class="sec-hdr-title">Assessments</div><div class="sec-hdr-sub">${assessments.length} completed</div></div>
    </div>
    ${assessments.map(a=>`
      <div class="rec-card" style="cursor:pointer" onclick="openAssessment('${a.id}')">
        <div class="rec-head">
          <div><div class="rec-name">${a.label || a.season || 'Assessment'}</div><div class="rec-meta">${a.created_at ? new Date(a.created_at).toLocaleDateString('en-ZA') : '—'} · ${a.hazard_count || 0} hazards assessed</div></div>
          <span class="badge b-${a.status === 'complete' ? 'green' : 'amber'}">${(a.status||'draft').toUpperCase()}</span>
        </div>
      </div>`).join('')}`;
}

function renderNewAssessmentForm() {
  return `
    <div class="sec-hdr">
      <div><div class="sec-hdr-title">New HVC Assessment</div><div class="sec-hdr-sub">Score each hazard across Hazard, Vulnerability and Capacity dimensions</div></div>
    </div>
    <div class="panel" style="margin-bottom:16px">
      <div class="ph"><div class="ph-title">Assessment details</div></div>
      <div class="pb">
        <div class="frow">
          <div class="fl"><span class="fl-label">Assessment label</span><input class="fl-input" id="assess-label" placeholder="e.g. Summer 2025"/></div>
          <div class="fl"><span class="fl-label">Season / period</span><select class="fl-sel" id="assess-season"><option>Summer</option><option>Autumn</option><option>Winter</option><option>Spring</option><option>Annual</option></select></div>
        </div>
        <div class="frow">
          <div class="fl"><span class="fl-label">Year</span><input class="fl-input" id="assess-year" value="${new Date().getFullYear()}"/></div>
          <div class="fl"><span class="fl-label">Lead assessor</span><input class="fl-input" id="assess-lead" placeholder="Name"/></div>
        </div>
      </div>
    </div>
    <div id="hazard-rows">
      ${Object.entries(HAZARD_CATEGORIES).map(([cat, hazards]) => `
        <div style="margin-bottom:24px">
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:10px;font-family:var(--font-mono);padding:6px 0;border-bottom:1px solid var(--border)">${cat}</div>
          ${hazards.map(h => renderHazardRow(h)).join('')}
        </div>`).join('')}
    </div>
    <button class="btn btn-green" id="save-assessment-btn" style="margin-bottom:20px">Save assessment</button>`;
}

function renderHazardRow(hazard) {
  const id = hazard.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const dims = [
    { key: 'affected_area', label: 'Affected area' },
    { key: 'probability',   label: 'Probability' },
    { key: 'frequency',     label: 'Frequency' },
    { key: 'predictability',label: 'Predictability' },
    { key: 'vulnerability', label: 'Vulnerability' },
    { key: 'capacity',      label: 'Capacity' }
  ];

  return `
    <div class="panel" style="margin-bottom:8px">
      <div style="padding:10px 14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border)">
        <div style="font-size:12px;font-weight:600;color:var(--text);flex:1">${hazard}</div>
        <div style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">Risk: <span id="risk-${id}" style="color:var(--text);font-weight:700">—</span></div>
        <span class="badge b-gray" id="chip-${id}">NOT SCORED</span>
      </div>
      <div style="padding:10px 14px;display:grid;grid-template-columns:repeat(6,1fr);gap:8px">
        ${dims.map(d=>`
          <div>
            <div style="font-size:9px;color:var(--text3);font-family:var(--font-mono);margin-bottom:3px;font-weight:700;letter-spacing:.04em">${d.label}</div>
            <select class="fl-sel" style="font-size:11px;padding:4px 6px" id="${id}-${d.key}" onchange="recalcHazard('${id}')">
              <option value="">—</option>
              ${[1,2,3,4,5].map(v=>`<option value="${v}">${v} — ${SCORE_LABELS[v]}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>
    </div>`;
}

window.recalcHazard = function(id) {
  const get = key => parseFloat(document.getElementById(`${id}-${key}`)?.value) || 0;
  const hazardScore = (get('affected_area') + get('probability') + get('frequency') + get('predictability')) / 4;
  const vulnScore = get('vulnerability');
  const capScore = get('capacity');
  if (!capScore) return;
  const resilience = vulnScore / capScore;
  const risk = hazardScore * resilience;

  const bands = [[5,'Negligible','b-gray'],[10,'Low','b-blue'],[15,'Tolerable','b-green'],[20,'High','b-amber'],[25,'Extremely high','b-red']];
  const [,band,cls] = bands.find(([max]) => risk <= max) || [25,'Extremely high','b-red'];

  const riskEl = document.getElementById(`risk-${id}`);
  const chipEl = document.getElementById(`chip-${id}`);
  if (riskEl) riskEl.textContent = risk.toFixed(1);
  if (chipEl) { chipEl.textContent = band.toUpperCase(); chipEl.className = `badge ${cls}`; }
};

function bindNewAssessmentEvents() {
  document.getElementById('save-assessment-btn')?.addEventListener('click', async () => {
    const label = document.getElementById('assess-label')?.value.trim();
    if (!label) { alert('Please enter an assessment label.'); return; }

    const hazardScores = [];
    Object.values(HAZARD_CATEGORIES).flat().forEach(hazard => {
      const id = hazard.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      const get = key => parseFloat(document.getElementById(`${id}-${key}`)?.value) || 0;
      const aa = get('affected_area'), pb = get('probability'), fr = get('frequency'), pr = get('predictability');
      const vl = get('vulnerability'), cp = get('capacity');
      if (!aa && !pb && !fr && !pr) return;
      const hazardScore = (aa + pb + fr + pr) / 4;
      const resilience = cp ? vl / cp : vl;
      const risk = hazardScore * resilience;
      const band = risk <= 5 ? 'Negligible' : risk <= 10 ? 'Low' : risk <= 15 ? 'Tolerable' : risk <= 20 ? 'High' : 'Extremely high';
      hazardScores.push({ municipality_id: _muniId, hazard_name: hazard, hazard_score: hazardScore, vulnerability_score: vl, capacity_score: cp, risk_rating: risk, risk_band: band });
    });

    const { data: assessment, error } = await supabase.from('hvc_assessments').insert({
      municipality_id: _muniId,
      label, season: document.getElementById('assess-season')?.value,
      year: parseInt(document.getElementById('assess-year')?.value),
      lead_assessor: document.getElementById('assess-lead')?.value,
      hazard_count: hazardScores.length,
      status: 'complete'
    }).select().single();

    if (error) { alert('Error saving: ' + error.message); return; }

    if (hazardScores.length) {
      await supabase.from('hvc_hazard_scores').insert(hazardScores.map(h => ({ ...h, assessment_id: assessment.id })));
    }

    alert(`Assessment saved! ${hazardScores.length} hazards scored.`);
    await renderHVCPage();
  });
}

window.openAssessment = function(id) {
  alert('Open assessment ' + id + ' — read-only view coming in next build.');
};

async function exportHVC() {
  alert('Excel export — requires openpyxl backend. See sql/04_hazard_library.sql for the data structure. A download endpoint can be added to a Supabase Edge Function.');
}
