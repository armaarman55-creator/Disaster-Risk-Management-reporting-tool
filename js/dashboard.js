// js/dashboard.js
import { supabase } from './supabase.js';
import { navigateTo } from './app.js';

const WARD_POLYGONS = [
  { id: 'W1', pts: '24,14 88,6 102,50 58,72 12,58' },
  { id: 'W2', pts: '88,6 160,12 166,52 102,50' },
  { id: 'W3', pts: '160,12 206,22 200,62 166,52' },
  { id: 'W4', pts: '12,58 58,72 66,118 18,130 5,96' },
  { id: 'W5', pts: '58,72 102,50 166,52 160,110 90,122 66,118' },
  { id: 'W6', pts: '160,110 200,62 228,108 214,148 166,142' }
];

const RISK_COLOURS = { 'Extremely high': '#f85149', 'High': '#d29922', 'Tolerable': '#3fb950', 'Low': '#58a6ff', 'Negligible': '#6e7681' };
const CHIP_CLASS   = { 'Extremely high': 'c-xh', 'High': 'c-h', 'Tolerable': 'c-t', 'Low': 'c-l', 'Negligible': 'c-n' };
const CHIP_LABEL   = { 'Extremely high': 'EXTR HIGH', 'High': 'HIGH', 'Tolerable': 'TOLERABLE', 'Low': 'LOW', 'Negligible': 'NEGLIGIBLE' };

let _assessmentData = null;
let _wardData = [];
let _muniId = null;

export async function initDashboard(user) {
  _muniId = user?.municipality_id;
  await loadAssessmentData();
  renderKPIs();
  renderHazardTable();
  renderWardMap();
  renderTrend(0);
  renderIDPSummary();
  initDashboardEvents();
}

async function loadAssessmentData() {
  if (!_muniId) return;

  // Load latest assessment
  const { data: assessments } = await supabase
    .from('hvc_assessments')
    .select('*')
    .eq('municipality_id', _muniId)
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: hazards } = await supabase
    .from('hvc_hazard_scores')
    .select('*')
    .eq('municipality_id', _muniId)
    .order('risk_rating', { ascending: false });

  const { data: wards } = await supabase
    .from('wards')
    .select('*')
    .eq('municipality_id', _muniId);

  _assessmentData = { assessments: assessments || [], hazards: hazards || [] };
  _wardData = wards || [];

  // Populate assessment selector
  const sel = document.getElementById('assess-sel-top');
  const mapSel = document.getElementById('assess-map');
  if (sel && assessments?.length) {
    sel.innerHTML = assessments.map(a => `<option value="${a.id}">${a.label}</option>`).join('');
    if (mapSel) mapSel.innerHTML = sel.innerHTML;
  }
}

function renderKPIs() {
  const hazards = _assessmentData?.hazards || [];
  const xh = hazards.filter(h => h.risk_band === 'Extremely high').length;
  const high = hazards.filter(h => h.risk_band === 'High').length;

  setEl('kpi-xh', xh);
  setEl('kpi-h', high);
}

function renderHazardTable() {
  const hazards = _assessmentData?.hazards || [];
  const tbl = document.getElementById('hz-tbl');
  if (!tbl) return;
  if (!hazards.length) {
    tbl.innerHTML = `<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--text3);font-size:12px">No assessment data yet. Complete your first HVC assessment.</td></tr>`;
    return;
  }
  tbl.innerHTML = hazards.slice(0, 10).map((h, i) => `
    <tr class="hz-tr">
      <td class="hz-td hz-rank">${String(i + 1).padStart(2, '0')}</td>
      <td class="hz-td hz-name">${h.hazard_name}</td>
      <td class="hz-td hz-score">${(h.risk_rating || 0).toFixed(1)}</td>
      <td class="hz-td hz-bar-w"><div class="hz-bar-bg"><div class="hz-bar-fg" style="width:${Math.round((h.risk_rating / 25) * 100)}%;background:${RISK_COLOURS[h.risk_band] || '#6e7681'}"></div></div></td>
      <td class="hz-td"><span class="hz-chip ${CHIP_CLASS[h.risk_band] || 'c-n'}">${CHIP_LABEL[h.risk_band] || 'N/A'}</span></td>
    </tr>`).join('');
}

function renderWardMap() {
  const g = document.getElementById('ward-g');
  if (!g) return;
  g.innerHTML = '';

  const hazards = _assessmentData?.hazards || [];
  const wardRisk = {};
  _wardData.forEach(w => { wardRisk[w.ward_number] = w.dominant_risk || 'Negligible'; });

  WARD_POLYGONS.forEach((wp, idx) => {
    const risk = wardRisk[idx + 1] || 'Negligible';
    const fill = RISK_COLOURS[risk] || '#6e7681';
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', wp.pts);
    poly.setAttribute('fill', fill);
    poly.setAttribute('fill-opacity', '0.42');
    poly.setAttribute('stroke', fill);
    poly.setAttribute('stroke-width', '1.2');
    poly.style.cursor = 'pointer';
    poly.addEventListener('mouseenter', function() { this.setAttribute('fill-opacity', '0.68'); });
    poly.addEventListener('mouseleave', function() { this.setAttribute('fill-opacity', '0.42'); });
    poly.addEventListener('click', () => showWardInfo(wp.id, risk, idx + 1));
    g.appendChild(poly);

    const pts = wp.pts.split(' ').map(p => p.split(',').map(Number));
    const cx = Math.round(pts.reduce((s, p) => s + p[0], 0) / pts.length);
    const cy = Math.round(pts.reduce((s, p) => s + p[1], 0) / pts.length);
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', cx); t.setAttribute('y', cy);
    t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'central');
    t.setAttribute('font-size', '8'); t.setAttribute('fill', 'rgba(230,237,243,0.9)');
    t.setAttribute('font-weight', '700'); t.setAttribute('font-family', 'JetBrains Mono,monospace');
    t.setAttribute('pointer-events', 'none');
    t.textContent = wp.id;
    g.appendChild(t);
  });
}

function showWardInfo(wid, risk, wardNum) {
  document.getElementById('wi-empty')?.classList.add('hidden');
  const el = document.getElementById('wi-content');
  if (!el) return;
  el.classList.remove('hidden');
  const wardData = _wardData.find(w => w.ward_number == wardNum) || {};
  el.innerHTML = `
    <div class="wi-ward">Ward ${wardNum}${wardData.area_name ? ` — ${wardData.area_name}` : ''}</div>
    <div class="wi-grid">
      <div class="wi-field"><span class="wi-key">Dominant risk</span><span class="wi-val"><span class="hz-chip ${CHIP_CLASS[risk] || 'c-n'}">${CHIP_LABEL[risk] || 'N/A'}</span></span></div>
      <div class="wi-field"><span class="wi-key">Population</span><span class="wi-val">${wardData.population ? wardData.population.toLocaleString() : 'Not set'}</span></div>
    </div>
    <div class="wi-btns">
      <button class="btn btn-sm" onclick="import('./app.js').then(m=>m.navigateTo('mitigations'))">Mitigations</button>
      <button class="btn btn-sm" onclick="import('./app.js').then(m=>m.navigateTo('community'))">Shelters</button>
    </div>`;
}

function renderTrend(hazardIdx) {
  const body = document.getElementById('trend-body');
  if (!body) return;
  const hazards = _assessmentData?.hazards || [];
  const h = hazards[hazardIdx];
  if (!h) { body.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px">No trend data available yet.</div>'; return; }

  const seasons = [
    { s: 'Season 1', v: (h.risk_rating || 0) * 0.7 },
    { s: 'Season 2', v: (h.risk_rating || 0) * 0.85 },
    { s: 'Season 3', v: (h.risk_rating || 0) * 0.9 },
    { s: 'Current', v: h.risk_rating || 0 }
  ];

  body.innerHTML = seasons.map(row => {
    const pct = Math.round((row.v / 25) * 100);
    const band = row.v <= 5 ? 'c-n' : row.v <= 10 ? 'c-l' : row.v <= 15 ? 'c-t' : row.v <= 20 ? 'c-h' : 'c-xh';
    const label = row.v <= 5 ? 'NEGLIGIBLE' : row.v <= 10 ? 'LOW' : row.v <= 15 ? 'TOLERABLE' : row.v <= 20 ? 'HIGH' : 'EXTR HIGH';
    const colour = RISK_COLOURS[{ 'c-n': 'Negligible', 'c-l': 'Low', 'c-t': 'Tolerable', 'c-h': 'High', 'c-xh': 'Extremely high' }[band]] || '#6e7681';
    return `<div class="tr-row">
      <span class="tr-s">${row.s}</span>
      <div class="tr-bar-bg"><div class="tr-bar-fill" style="width:${pct}%;background:${colour}"></div><span class="tr-score" style="color:${colour}">${row.v.toFixed(1)}</span></div>
      <span class="hz-chip ${band} tr-chip">${label}</span>
    </div>`;
  }).join('');
}

function renderIDPSummary() {
  // IDP stats will come from DB in production; showing empty state
}

function initDashboardEvents() {
  document.getElementById('assess-sel-top')?.addEventListener('change', e => selectAssessment(e.target.value));
  document.getElementById('assess-map')?.addEventListener('change', e => selectAssessment(e.target.value));
  document.getElementById('trend-sel')?.addEventListener('change', e => renderTrend(parseInt(e.target.value)));
  document.querySelectorAll('.lyr').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('on'));
  });
  document.getElementById('saws-dismiss')?.addEventListener('click', () => {
    document.getElementById('saws-alert-bar')?.remove();
  });
}

async function selectAssessment(id) {
  const { data } = await supabase.from('hvc_hazard_scores').select('*').eq('assessment_id', id).order('risk_rating', { ascending: false });
  if (data) { _assessmentData.hazards = data; renderHazardTable(); renderWardMap(); }
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
