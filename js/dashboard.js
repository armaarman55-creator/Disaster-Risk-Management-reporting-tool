// js/dashboard.js
const _V = '?v=3';
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
  window._drmsaUser = user;

  // If no municipality set, show a helpful empty state instead of errors
  if (!_muniId) {
    const dash = document.getElementById('page-dashboard');
    const kpiStrip = dash?.querySelector('.kpi-strip');
    const bodyGrid = dash?.querySelector('.body-grid');
    const sawsBar  = document.getElementById('saws-alert-bar');
    if (sawsBar) sawsBar.style.display = 'none';
    if (kpiStrip) kpiStrip.style.opacity = '0.3';
    if (bodyGrid) bodyGrid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px">
        <div style="font-size:32px;margin-bottom:16px">⚠</div>
        <div style="font-family:Inter,system-ui,sans-serif;font-size:16px;font-weight:700;color:var(--text);margin-bottom:8px">No municipality linked</div>
        <div style="font-size:13px;color:var(--text3);line-height:1.7;margin-bottom:20px">
          Your account is not linked to a municipality yet.<br>
          Go to <strong style="color:var(--text)">My Profile</strong> to select your municipality.
        </div>
        <button class="btn btn-primary" onclick="import(`./app.js${_V}`).then(m=>m.navigateTo('profile'))">Go to My Profile →</button>
      </div>`;
    return;
  }

  try {
    await loadAssessmentData();
    renderKPIs();
    renderHazardTable();
    await renderWardMap();
    renderTrend(0);
    renderIDPSummary();
    initDashboardEvents();
  } catch(e) {
    console.warn('Dashboard render error:', e);
  }
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

async function renderWardMap() {
  const g = document.getElementById('ward-g');
  if (!g) return;

  g.innerHTML = '<text x="155" y="95" text-anchor="middle" font-size="10" fill="var(--text3)" font-family="monospace">Loading ward boundaries…</text>';

  const wardRisk = {};
  _wardData.forEach(w => { wardRisk[w.ward_number] = w.dominant_risk || 'Negligible'; });

  // Try MDB ArcGIS REST API for real ward boundaries
  const muniCode = window._drmsaUser?.municipalities?.code;
  let mdbWards = null;

  if (muniCode) {
    try {
      const BASE = 'https://services7.arcgis.com/oeoyTUJC8HEeYsRB/arcgis/rest/services/MDB_Wards_2020/FeatureServer/0/query';

      // Step 1: probe one record to discover actual field names
      const probeUrl = `${BASE}?where=1%3D1&outFields=*&f=json&resultRecordCount=1`;
      const probeRes = await fetch(probeUrl);
      const probeData = await probeRes.json();
      const fields = (probeData.fields || []).map(f => f.name);
      console.log('MDB API fields:', fields);

      // Step 2: find correct municipality field (could be CAT_B, LB_BND_C, MUNICNAME, etc.)
      const muniName = window._drmsaUser?.municipalities?.name?.replace(' LM','').replace(' DM','').trim() || '';
      
      // Try different field/value combinations
      const attempts = [];
      
      // Try by code fields first
      const codeFields = fields.filter(f => f.match(/CAT|CODE|LB_|MUNI.*C/i));
      codeFields.forEach(f => attempts.push(`${f}='${muniCode}'`));
      
      // Try by name
      const nameFields = fields.filter(f => f.match(/NAME|MUNI/i));
      nameFields.forEach(f => {
        if (muniName) attempts.push(`${f} LIKE '%${muniName}%'`);
      });

      console.log('MDB: will try queries:', attempts.slice(0,3));

      let found = false;
      for (const where of attempts) {
        const url = `${BASE}?where=${encodeURIComponent(where)}&outFields=*&outSR=4326&f=geojson&resultRecordCount=200&returnGeometry=true`;
        console.log('MDB trying:', where);
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const count = data?.features?.length || 0;
        console.log(`MDB: "${where}" → ${count} wards`);
        if (count > 0) {
          mdbWards = data.features;
          console.log('MDB: SUCCESS with query:', where);
          found = true;
          break;
        }
      }

      if (!found) {
        console.warn('MDB: all queries returned 0 wards. Available fields:', fields);
        // Log a sample attribute to help debug
        if (probeData.features?.[0]) {
          console.log('MDB sample record attributes:', probeData.features[0].attributes);
        }
      }
    } catch(e) {
      console.warn('MDB API failed:', e.message);
    }
  }

  g.innerHTML = '';

  if (mdbWards?.length) {
    // Project GeoJSON coords to SVG viewBox 0 0 310 200
    const allCoords = mdbWards.flatMap(f => {
      const geom = f.geometry;
      if (!geom) return [];
      const rings = geom.type === 'MultiPolygon' ? geom.coordinates.flat(1) : geom.coordinates;
      return rings.flat();
    });

    const lngs = allCoords.map(c => c[0]);
    const lats = allCoords.map(c => c[1]);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);

    const project = ([lng, lat]) => [
      Math.round(((lng - minLng) / (maxLng - minLng)) * 290 + 10),
      Math.round(((maxLat - lat) / (maxLat - minLat)) * 180 + 10)
    ];

    mdbWards.forEach(f => {
      const props = f.properties;
      const wardNo = props.WARD_NO || props.WARD_ID;
      const risk = wardRisk[wardNo] || 'Negligible';
      const fill = RISK_COLOURS[risk] || '#6e7681';

      const geom = f.geometry;
      if (!geom) return;
      const rings = geom.type === 'MultiPolygon' ? geom.coordinates.flat(1) : geom.coordinates;

      rings.forEach(ring => {
        const pts = ring.map(coord => project(coord).join(',')).join(' ');
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', pts);
        poly.setAttribute('fill', fill);
        poly.setAttribute('fill-opacity', '0.42');
        poly.setAttribute('stroke', fill);
        poly.setAttribute('stroke-width', '0.8');
        poly.style.cursor = 'pointer';
        poly.addEventListener('mouseenter', function() { this.setAttribute('fill-opacity', '0.68'); });
        poly.addEventListener('mouseleave', function() { this.setAttribute('fill-opacity', '0.42'); });
        poly.addEventListener('click', () => showWardInfo(wardNo, risk, wardNo));
        g.appendChild(poly);
      });

      // Ward label
      const allPts = rings.flat().map(project);
      const cx = Math.round(allPts.reduce((s,p)=>s+p[0],0)/allPts.length);
      const cy = Math.round(allPts.reduce((s,p)=>s+p[1],0)/allPts.length);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', cx); t.setAttribute('y', cy);
      t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'central');
      t.setAttribute('font-size', '7'); t.setAttribute('fill', 'rgba(230,237,243,0.85)');
      t.setAttribute('font-weight', '700'); t.setAttribute('font-family', 'monospace');
      t.setAttribute('pointer-events', 'none');
      t.textContent = `W${wardNo}`;
      g.appendChild(t);
    });

  } else {
    // Fallback: simple placeholder polygons
    WARD_POLYGONS.forEach((wp, idx) => {
      const risk = wardRisk[idx + 1] || 'Negligible';
      const fill = RISK_COLOURS[risk] || '#6e7681';
      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', wp.pts);
      poly.setAttribute('fill', fill); poly.setAttribute('fill-opacity', '0.42');
      poly.setAttribute('stroke', fill); poly.setAttribute('stroke-width', '1.2');
      poly.style.cursor = 'pointer';
      poly.addEventListener('mouseenter', function() { this.setAttribute('fill-opacity', '0.68'); });
      poly.addEventListener('mouseleave', function() { this.setAttribute('fill-opacity', '0.42'); });
      poly.addEventListener('click', () => showWardInfo(wp.id, risk, idx + 1));
      g.appendChild(poly);
      const pts = wp.pts.split(' ').map(p=>p.split(',').map(Number));
      const cx = Math.round(pts.reduce((s,p)=>s+p[0],0)/pts.length);
      const cy = Math.round(pts.reduce((s,p)=>s+p[1],0)/pts.length);
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x',cx); t.setAttribute('y',cy);
      t.setAttribute('text-anchor','middle'); t.setAttribute('dominant-baseline','central');
      t.setAttribute('font-size','8'); t.setAttribute('fill','rgba(230,237,243,0.9)');
      t.setAttribute('font-weight','700'); t.setAttribute('font-family','monospace');
      t.setAttribute('pointer-events','none');
      t.textContent = wp.id;
      g.appendChild(t);
    });

    // Show note
    const note = document.createElementNS('http://www.w3.org/2000/svg','text');
    note.setAttribute('x','155'); note.setAttribute('y','195');
    note.setAttribute('text-anchor','middle'); note.setAttribute('font-size','8');
    note.setAttribute('fill','var(--text3)'); note.setAttribute('font-family','monospace');
    note.textContent = 'Ward boundaries load when municipality is set';
    g.appendChild(note);
  }
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
      <button class="btn btn-sm" onclick="import(`./app.js${_V}`).then(m=>m.navigateTo('mitigations'))">Mitigations</button>
      <button class="btn btn-sm" onclick="import(`./app.js${_V}`).then(m=>m.navigateTo('community'))">Shelters</button>
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
