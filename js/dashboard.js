// js/dashboard.js
import { supabase } from './supabase.js';

const WARD_POLYGONS = [
  { id: 'W1', pts: '24,14 88,6 102,50 58,72 12,58' },
  { id: 'W2', pts: '88,6 160,12 166,52 102,50' },
  { id: 'W3', pts: '160,12 206,22 200,62 166,52' },
  { id: 'W4', pts: '12,58 58,72 66,118 18,130 5,96' },
  { id: 'W5', pts: '58,72 102,50 166,52 160,110 90,122 66,118' },
  { id: 'W6', pts: '160,110 200,62 228,108 214,148 166,142' }
];

const RISK_COLOURS = {
  'Extremely High': '#f85149', 'Extremely high': '#f85149',
  'High':           '#d29922',
  'Tolerable':      '#3fb950',
  'Low':            '#58a6ff',
  'Negligible':     '#6e7681'
};
const CHIP_CLASS   = {
  'Extremely High':'c-xh','Extremely high':'c-xh',
  'High':'c-h','Tolerable':'c-t','Low':'c-l','Negligible':'c-n'
};
const CHIP_LABEL   = {
  'Extremely High':'EXTR HIGH','Extremely high':'EXTR HIGH',
  'High':'HIGH','Tolerable':'TOLERABLE','Low':'LOW','Negligible':'NEGLIGIBLE'
};

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
        <button class="btn btn-primary" onclick="window._drmsaNavigate('profile')">Go to My Profile →</button>
      </div>`;
    return;
  }

  try {
    await loadAssessmentData();
    await renderKPIs();
    renderHazardTable();
    await renderWardMap();
    renderTrend(0);
    await renderIDPSummary();
    initDashboardEvents();
    initRealtimeRefresh();
  } catch(e) {
    console.error('[Dashboard] Render error:', e);
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

  // Diagnostic console output — open F12 to see
  console.log('[Dashboard] DB data loaded:');
  console.log('  Assessments:', (assessments||[]).length);
  console.log('  Hazard scores:', (hazards||[]).length);
  console.log('  Ward rows:', (wards||[]).length);
  if ((hazards||[]).length) {
    const bands = [...new Set((hazards||[]).map(h => h.risk_band))];
    console.log('  Unique risk_band values in DB:', bands);
    console.log('  Sample hazards:', (hazards||[]).slice(0,3).map(h => h.hazard_name + ' → ' + h.risk_band + ' (' + h.risk_rating + ')'));
  } else {
    console.warn('  No hazard scores found — complete an HVC assessment first');
  }
  if ((wards||[]).length) {
    const risks = [...new Set((wards||[]).map(w => w.dominant_risk))];
    console.log('  Unique dominant_risk values:', risks);
    if (risks.every(r => !r)) console.warn('  All dominant_risk values are NULL — run SQL 18_fix_ward_risk_fallback.sql');
  }

  // Populate assessment selector
  const sel = document.getElementById('assess-sel-top');
  const mapSel = document.getElementById('assess-map');
  if (sel && assessments?.length) {
    sel.innerHTML = assessments.map(a => `<option value="${a.id}">${a.label}</option>`).join('');
    if (mapSel) mapSel.innerHTML = sel.innerHTML;
  }
}

async function renderKPIs() {
  const hazards = _assessmentData?.hazards || [];
  const norm = s => (s||'').toLowerCase().replace(/\s+/g,'');
  const xh   = hazards.filter(h => norm(h.risk_band) === 'extremelyhigh').length;
  const high  = hazards.filter(h => norm(h.risk_band) === 'high').length;

  setEl('kpi-xh', xh);
  setEl('kpi-h',  high);

  // Active shelters count
  if (_muniId) {
    try {
      const { count: shelterCount } = await supabase
        .from('shelters')
        .select('id', { count: 'exact', head: true })
        .eq('municipality_id', _muniId)
        .eq('status', 'open');
      setEl('kpi-shelters', shelterCount || 0);
    } catch(e) {}

    // Funded mitigations count
    try {
      const { count: idpCount } = await supabase
        .from('mitigations')
        .select('id', { count: 'exact', head: true })
        .eq('municipality_id', _muniId)
        .eq('idp_status', 'linked-funded')
        .eq('is_library', false);
      setEl('kpi-idp', idpCount || 0);
    } catch(e) {}
  }
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
      <td class="hz-td"><span class="hz-chip ${CHIP_CLASS[h.risk_band] || CHIP_CLASS[h.risk_band?.replace(/high$/i,'High')] || 'c-n'}">${CHIP_LABEL[h.risk_band] || CHIP_LABEL[h.risk_band?.replace(/high$/i,'High')] || (h.risk_band||'N/A').toUpperCase()}</span></td>
    </tr>`).join('');
}

async function renderWardMap() {
  const g = document.getElementById('ward-g');
  if (!g) return;

  g.innerHTML = '<text x="155" y="95" text-anchor="middle" font-size="10" fill="var(--text3)" font-family="monospace">Loading ward boundaries…</text>';

  const wardRisk = {};
  _wardData.forEach(w => { wardRisk[w.ward_number] = w.dominant_risk || 'Negligible'; });

  const muniCode = window._drmsaUser?.municipalities?.code;
  const rawName  = window._drmsaUser?.municipalities?.name || '';
  const muniName = rawName.replace(' LM','').replace(' DM','').replace(' Metropolitan Municipality','').trim();
  let mdbWards = null;

  if (muniCode) {
    try {
      const BASE = 'https://services7.arcgis.com/oeoyTUJC8HEeYsRB/arcgis/rest/services/MDB_Wards_2020/FeatureServer/0/query';

      // Probe one record to discover field names
      const probeRes  = await fetch(`${BASE}?where=1%3D1&outFields=*&f=json&resultRecordCount=1`);
      const probeData = await probeRes.json();
      const fields    = (probeData.fields || []).map(f => f.name);
      const sample    = probeData.features?.[0]?.attributes || {};
      console.log('MDB fields:', fields);
      console.log('MDB sample:', sample);

      // Detect ward number field
      const wardNumField = fields.find(f => /ward.?n(o|um)/i.test(f)) || 'WARD_NO';
      // Detect municipality code/name field
      const codeFields = fields.filter(f => /cat_b|lb_|muni.*c/i.test(f));
      const nameFields = fields.filter(f => /muni.*name|municname/i.test(f));

      console.log('Ward num field:', wardNumField, 'Code fields:', codeFields, 'Name fields:', nameFields);

      // Build query attempts — code match first, then name
      const attempts = [];
      codeFields.forEach(f => attempts.push(`${f}='${muniCode}'`));
      nameFields.forEach(f => { if (muniName) attempts.push(`${f} LIKE '%${muniName}%'`); });

      for (const where of attempts) {
        const url  = `${BASE}?where=${encodeURIComponent(where)}&outFields=*&outSR=4326&f=geojson&resultRecordCount=200&returnGeometry=true`;
        const res  = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const n    = data?.features?.length || 0;
        console.log(`MDB "${where}" → ${n} features`);
        if (n > 0) { mdbWards = data.features; _mdbWardNumField = wardNumField; break; }
      }
    } catch(e) { console.warn('MDB API failed:', e.message); }
  }

  g.innerHTML = '';

  if (mdbWards?.length) {
    // Project GeoJSON to SVG 0 0 310 200
    const allCoords = mdbWards.flatMap(f => {
      const geom = f.geometry;
      if (!geom) return [];
      const rings = geom.type === 'MultiPolygon' ? geom.coordinates.flat(1) : geom.coordinates;
      return rings.flat();
    });
    const lngs = allCoords.map(c => c[0]), lats = allCoords.map(c => c[1]);
    const minLng=Math.min(...lngs), maxLng=Math.max(...lngs);
    const minLat=Math.min(...lats), maxLat=Math.max(...lats);
    // Project to 900x380 viewBox with 20px padding each side
    const W = 860, H = 340, padX = 20, padY = 20;
    const project = ([lng,lat]) => [
      ((lng-minLng)/(maxLng-minLng))*W + padX,
      ((maxLat-lat)/(maxLat-minLat))*H + padY
    ];

    mdbWards.forEach(f => {
      const props  = f.properties || {};
      // Try multiple field name variants
      const wardNo = props[_mdbWardNumField]
        ?? props['WARD_NO'] ?? props['WARD_NUM'] ?? props['WardNo']
        ?? props['ward_no'] ?? props['ward_num'] ?? '?';
      const rawRisk2 = wardRisk[parseInt(wardNo)] || 'Negligible';
      const risk   = Object.keys(RISK_COLOURS).find(k => k.toLowerCase() === rawRisk2.toLowerCase()) || rawRisk2;
      const fill   = RISK_COLOURS[risk] || '#6e7681';
      const geom   = f.geometry;
      if (!geom) return;
      const rings  = geom.type==='MultiPolygon' ? geom.coordinates.flat(1) : geom.coordinates;

      rings.forEach(ring => {
        const pts = ring.map(coord => project(coord).map(v=>v.toFixed(1)).join(',')).join(' ');
        const poly = document.createElementNS('http://www.w3.org/2000/svg','polygon');
        poly.setAttribute('points', pts);
        poly.setAttribute('fill', fill);
        poly.setAttribute('fill-opacity','0.45');
        poly.setAttribute('stroke', fill);
        poly.setAttribute('stroke-width','0.6');
        poly.style.cursor = 'pointer';
        poly.addEventListener('mouseenter', function(){ this.setAttribute('fill-opacity','0.75'); });
        poly.addEventListener('mouseleave', function(){ this.setAttribute('fill-opacity','0.45'); });
        poly.addEventListener('click', (e) => {
          const wrap = document.getElementById('map-canvas-wrap');
          const rect = wrap ? wrap.getBoundingClientRect() : {left:0,top:0};
          showWardInfo(wardNo, risk, wardNo, e.clientX - rect.left, e.clientY - rect.top);
        });
        g.appendChild(poly);
      });

      // Centroid label
      const allPts = rings.flat().map(project);
      const cx = allPts.reduce((s,p)=>s+p[0],0)/allPts.length;
      const cy = allPts.reduce((s,p)=>s+p[1],0)/allPts.length;
      const t  = document.createElementNS('http://www.w3.org/2000/svg','text');
      t.setAttribute('x', cx.toFixed(1)); t.setAttribute('y', cy.toFixed(1));
      t.setAttribute('text-anchor','middle'); t.setAttribute('dominant-baseline','central');
      t.setAttribute('font-size','9'); t.setAttribute('fill','rgba(230,237,243,0.9)');
      t.setAttribute('font-weight','700'); t.setAttribute('font-family','monospace');
      t.setAttribute('pointer-events','none');
      t.setAttribute('class','ward-label');
      t.textContent = `W${wardNo}`;
      g.appendChild(t);
    });

  } else {
    // Fallback placeholder polygons
    WARD_POLYGONS.forEach((wp, idx) => {
      const rawRisk = wardRisk[idx+1] || 'Negligible';
      const risk = Object.keys(RISK_COLOURS).find(k => k.toLowerCase() === rawRisk.toLowerCase()) || rawRisk;
      const fill = RISK_COLOURS[risk] || '#6e7681';
      const poly = document.createElementNS('http://www.w3.org/2000/svg','polygon');
      poly.setAttribute('points',wp.pts); poly.setAttribute('fill',fill);
      poly.setAttribute('fill-opacity','0.42'); poly.setAttribute('stroke',fill); poly.setAttribute('stroke-width','1.2');
      poly.style.cursor='pointer';
      poly.addEventListener('mouseenter',function(){this.setAttribute('fill-opacity','0.68');});
      poly.addEventListener('mouseleave',function(){this.setAttribute('fill-opacity','0.42');});
      poly.addEventListener('click',(e)=>{
        const wrap = document.getElementById('map-canvas-wrap');
        const rect = wrap ? wrap.getBoundingClientRect() : {left:0,top:0};
        showWardInfo(wp.id,risk,idx+1,e.clientX-rect.left,e.clientY-rect.top);
      });
      g.appendChild(poly);
      const pts=wp.pts.split(' ').map(p=>p.split(',').map(Number));
      const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length;
      const cy=pts.reduce((s,p)=>s+p[1],0)/pts.length;
      const t=document.createElementNS('http://www.w3.org/2000/svg','text');
      t.setAttribute('x',cx.toFixed(1)); t.setAttribute('y',cy.toFixed(1));
      t.setAttribute('text-anchor','middle'); t.setAttribute('dominant-baseline','central');
      t.setAttribute('font-size','8'); t.setAttribute('fill','rgba(230,237,243,0.9)');
      t.setAttribute('font-weight','700'); t.setAttribute('font-family','monospace');
      t.setAttribute('pointer-events','none');
      t.setAttribute('class','ward-label');
      t.textContent = wp.id;
      g.appendChild(t);
    });
    const note=document.createElementNS('http://www.w3.org/2000/svg','text');
    note.setAttribute('x','155'); note.setAttribute('y','195');
    note.setAttribute('text-anchor','middle'); note.setAttribute('font-size','8');
    note.setAttribute('fill','var(--text3)'); note.setAttribute('font-family','monospace');
    note.textContent='Showing placeholder — MDB API unavailable or municipality not found';
    g.appendChild(note);
  }

  // Init zoom after rendering
  initMapZoom();
}

// Track MDB ward number field globally
let _mdbWardNumField = 'WARD_NO';


function showWardInfo(wid, risk, wardNum, clickX, clickY) {
  const BAND_COL = {
    'Extremely High':'#f85149','High':'#d29922',
    'Tolerable':'#3fb950','Low':'#58a6ff','Negligible':'#6e7681'
  };
  const bandCol   = BAND_COL[risk] || '#6e7681';
  const hazards   = _assessmentData?.hazards || [];
  const wardHazards = hazards.filter(h =>
    Array.isArray(h.affected_wards) && h.affected_wards.map(String).includes(String(wardNum))
  );

  // Remove existing tooltip
  document.getElementById('ward-tooltip')?.remove();

  const wrap = document.getElementById('map-canvas-wrap');
  if (!wrap) return;

  const tooltip = document.createElement('div');
  tooltip.id = 'ward-tooltip';
  tooltip.style.cssText = [
    'position:absolute',
    'background:var(--bg2)',
    'border:1px solid var(--border2)',
    'border-left:3px solid ' + bandCol,
    'border-radius:8px',
    'padding:12px 14px',
    'min-width:200px',
    'max-width:260px',
    'box-shadow:0 4px 20px rgba(0,0,0,.45)',
    'z-index:100',
    'font-family:Inter,system-ui,sans-serif',
    'pointer-events:auto'
  ].join(';');

  // Keep tooltip inside the map canvas
  const wW = wrap.offsetWidth  || 900;
  const wH = wrap.offsetHeight || 380;
  const tipX = clickX !== undefined ? Math.min(Math.max(clickX + 12, 8), wW - 270) : 12;
  const tipY = clickY !== undefined ? Math.min(Math.max(clickY - 10, 8), wH - 220) : 12;
  tooltip.style.left = tipX + 'px';
  tooltip.style.top  = tipY + 'px';

  const hazardRows = wardHazards.slice(0,6).map(h =>
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(48,54,61,.3)">' +
    '<span style="font-size:11px;color:var(--text2)">' + h.hazard_name + '</span>' +
    '<span style="font-size:10px;font-weight:700;color:' + (BAND_COL[h.risk_band]||'#6e7681') + '">' + (h.risk_band||'?') + '</span>' +
    '</div>'
  ).join('');

  const extra = wardHazards.length > 6
    ? '<div style="font-size:10px;color:var(--text3);margin-top:4px">+' + (wardHazards.length-6) + ' more hazards</div>'
    : '';

  const noHazards = wardHazards.length === 0
    ? '<div style="font-size:11px;color:var(--text3);line-height:1.6">No hazards scored for this ward yet.<br><span style="font-size:10px">Complete an HVC assessment and select this ward.</span></div>'
    : '';

  tooltip.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">' +
      '<div style="font-size:13px;font-weight:700;color:var(--text)">Ward ' + wardNum + '</div>' +
      '<button id="wtt-close" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px;line-height:1;padding:0 2px">×</button>' +
    '</div>' +
    '<div style="display:inline-block;background:' + bandCol + '22;border:1px solid ' + bandCol + '55;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;color:' + bandCol + ';margin-bottom:8px;letter-spacing:.04em">' +
      risk.toUpperCase() +
    '</div>' +
    (wardHazards.length ? '<div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text3);margin-bottom:5px">Hazards in ward</div>' + hazardRows + extra : noHazards);

  wrap.appendChild(tooltip);

  document.getElementById('wtt-close')?.addEventListener('click', e => {
    e.stopPropagation();
    tooltip.remove();
  });

  // Click outside closes
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!tooltip.contains(e.target)) {
        tooltip.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 80);
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

async function renderIDPSummary() {
  if (!_muniId) return;
  try {
    const { data: mits } = await supabase
      .from('mitigations')
      .select('idp_status')
      .eq('municipality_id', _muniId)
      .eq('is_library', false);

    const funded   = (mits||[]).filter(m => m.idp_status === 'linked-funded').length;
    const total    = (mits||[]).length;
    const awaiting = (mits||[]).filter(m => m.idp_status === 'linked-awaiting').length;

    setEl('kpi-idp', funded);

    const body = document.getElementById('idp-summary-body');
    if (!body) return;

    if (!total) {
      body.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px">No mitigations registered yet. Go to IDP Linkage to add spatial mitigations.</div>';
      return;
    }

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">
        <div class="stat-box"><div class="stat-lbl">Total</div><div class="stat-num blue" style="font-size:22px">${total}</div></div>
        <div class="stat-box"><div class="stat-lbl">Funded</div><div class="stat-num green" style="font-size:22px">${funded}</div></div>
        <div class="stat-box"><div class="stat-lbl">Awaiting</div><div class="stat-num amber" style="font-size:22px">${awaiting}</div></div>
      </div>
      <div style="font-size:12px;color:var(--text3);display:flex;align-items:center;gap:8px">
        <div style="flex:1;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden">
          <div style="width:${total?Math.round((funded/total)*100):0}%;height:6px;background:var(--green);border-radius:3px"></div>
        </div>
        <span>${total ? Math.round((funded/total)*100) : 0}% funded</span>
      </div>
      <div style="margin-top:10px;text-align:right">
        <button class="btn btn-sm" onclick="window._drmsaNavigate('idp')">View register →</button>
      </div>`;
  } catch(e) {
    console.warn('IDP summary error:', e);
  }
}

function initMapZoom() {
  const svg     = document.getElementById('ward-svg');
  const g       = document.getElementById('ward-g');
  const canvas  = svg?.closest('#map-canvas-wrap') || svg?.parentElement;
  if (!svg || !g) return;

  let scale=1, tx=0, ty=0, dragging=false, startX=0, startY=0, lastTx=0, lastTy=0;

  function applyTransform() {
    g.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
    // Inverse-scale all ward labels so they stay constant visual size
    const baseSize = 9;
    g.querySelectorAll('text.ward-label').forEach(t => {
      t.setAttribute('font-size', (baseSize / scale).toFixed(2));
    });
  }

  // Zoom buttons
  document.getElementById('map-zoom-in')?.addEventListener('click', () => {
    scale = Math.min(scale * 1.4, 12);
    applyTransform();
  });
  document.getElementById('map-zoom-out')?.addEventListener('click', () => {
    scale = Math.max(scale / 1.4, 0.8);
    applyTransform();
  });
  document.getElementById('map-zoom-reset')?.addEventListener('click', () => {
    scale=1; tx=0; ty=0; applyTransform();
  });

  // Scroll wheel zoom (desktop)
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.max(0.8, Math.min(12, scale * delta));
    tx = mx - (mx - tx) * (newScale / scale);
    ty = my - (my - ty) * (newScale / scale);
    scale = newScale;
    applyTransform();
  }, { passive: false });

  // Mouse drag (desktop)
  svg.addEventListener('mousedown', e => {
    dragging=true; startX=e.clientX-tx; startY=e.clientY-ty;
    svg.style.cursor='grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    tx=e.clientX-startX; ty=e.clientY-startY;
    applyTransform();
  });
  window.addEventListener('mouseup', () => {
    dragging=false; svg.style.cursor='crosshair';
  });

  // Touch pinch zoom + drag (mobile)
  let lastDist=0, lastMidX=0, lastMidY=0;
  svg.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      const t1=e.touches[0], t2=e.touches[1];
      lastDist = Math.hypot(t2.clientX-t1.clientX, t2.clientY-t1.clientY);
      lastMidX = (t1.clientX+t2.clientX)/2;
      lastMidY = (t1.clientY+t2.clientY)/2;
    } else if (e.touches.length === 1) {
      startX=e.touches[0].clientX-tx;
      startY=e.touches[0].clientY-ty;
    }
    e.preventDefault();
  }, { passive: false });

  svg.addEventListener('touchmove', e => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    if (e.touches.length === 2) {
      const t1=e.touches[0], t2=e.touches[1];
      const dist = Math.hypot(t2.clientX-t1.clientX, t2.clientY-t1.clientY);
      const midX = (t1.clientX+t2.clientX)/2 - rect.left;
      const midY = (t1.clientY+t2.clientY)/2 - rect.top;
      const ratio = dist / lastDist;
      const newScale = Math.max(0.8, Math.min(12, scale * ratio));
      tx = midX - (midX - tx) * (newScale / scale);
      ty = midY - (midY - ty) * (newScale / scale);
      scale = newScale;
      lastDist=dist; lastMidX=midX; lastMidY=midY;
      applyTransform();
    } else if (e.touches.length === 1) {
      tx=e.touches[0].clientX-startX;
      ty=e.touches[0].clientY-startY;
      applyTransform();
    }
  }, { passive: false });
}

function initRealtimeRefresh() {
  if (!_muniId) return;
  // Unsubscribe any existing channel first
  if (window._dashboardChannel) {
    supabase.removeChannel(window._dashboardChannel);
  }
  // Subscribe to new HVC assessments for this municipality
  window._dashboardChannel = supabase
    .channel('dashboard-refresh-' + _muniId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'hvc_assessments',
      filter: `municipality_id=eq.${_muniId}`
    }, async () => {
      console.log('HVC assessment changed — refreshing dashboard');
      await loadAssessmentData();
      await renderKPIs();
      renderHazardTable();
      renderWardMap();
      await renderIDPSummary();
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'mitigations',
      filter: `municipality_id=eq.${_muniId}`
    }, async () => {
      console.log('Mitigation changed — refreshing IDP summary');
      await renderIDPSummary();
    })
    .subscribe();
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
