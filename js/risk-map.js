// js/risk-map.js — Dedicated Risk Map page (Hazard/Vulnerability/Capacity/Priority)
import { supabase } from './supabase.js';
import { boundsFromCoords, extendBounds, flattenCoords, zoomToWardOnMap } from './dashboard-map.js';

const ANALYSIS_MODES = [
  { key: 'hazard', label: 'Hazard Analysis' },
  { key: 'vulnerability', label: 'Vulnerability Analysis' },
  { key: 'capacity', label: 'Capacity Analysis' },
  { key: 'priority', label: 'Priority Analysis' }
];

const BAND_COLORS = {
  'VERY LOW': '#8CE99A',
  LOW: '#2B8A3E',
  MEDIUM: '#F2C94C',
  HIGH: '#EB5757',
  'NO DATA': '#9CA3AF'
};

let _user = null;
let _muniId = null;
let _rows = [];
let _map = null;
let _wardFeatures = [];
let _wardFeatureIndex = {};
let _mapBounds = null;
let _handlersBound = false;
let _mode = 'hazard';
let _mdbWardNumField = 'WARD_NO';
let _currentFeatureCollection = null;
let _navControlsAdded = false;

export async function initRiskMap(user) {
  _user = user;
  _muniId = user?.municipality_id || null;

  const page = document.getElementById('page-risk-map');
  if (!page) return;

  destroyMap();
  renderShell(page);

  if (!_muniId) {
    const map = document.getElementById('risk-maplibre-map');
    if (map) map.innerHTML = '<div class="rm-empty">No municipality linked. Set municipality in My Profile first.</div>';
    return;
  }

  await loadScores();
  await renderMap();
  bindUi();
}

function renderShell(page) {
  page.innerHTML = `
    <div class="rm-wrap">
      <div class="rm-head">
        <div>
          <div class="rm-title">Risk Map</div>
          <div class="rm-sub">Ward-level analysis from HVC assessment scores</div>
        </div>
        <div class="rm-actions">
          <button class="btn btn-sm" id="rm-reset">Reset map</button>
          <button class="btn btn-sm" id="rm-png-current">Download PNG (Current View)</button>
          <button class="btn btn-sm" id="rm-png-full">Download PNG (Full Map)</button>
        </div>
      </div>

      <div class="rm-toolbar">
        <div class="fl" style="min-width:220px">
          <span class="fl-label">Analysis</span>
          <select class="fl-sel" id="rm-analysis">
            ${ANALYSIS_MODES.map(m => `<option value="${m.key}">${m.label}</option>`).join('')}
          </select>
        </div>

        <div class="fl" style="min-width:220px;position:relative">
          <span class="fl-label">Ward search</span>
          <input class="fl-input" id="rm-ward-search" placeholder="Type ward number (e.g. 12)" />
          <div class="rm-dd" id="rm-ward-dd"></div>
        </div>
      </div>

      <div class="rm-map-wrap" id="risk-map-canvas-wrap">
        <div id="risk-maplibre-map"></div>
      </div>

      <div class="rm-legend" id="rm-legend"></div>
    </div>
  `;
}

function bindUi() {
  document.getElementById('rm-analysis')?.addEventListener('change', async (e) => {
    _mode = e.target.value;
    await renderMapLayers();
    renderLegend();
  });

  bindWardSearch();

  document.getElementById('rm-reset')?.addEventListener('click', () => resetMapView());
  document.getElementById('rm-png-current')?.addEventListener('click', () => downloadCurrentViewPng());
  document.getElementById('rm-png-full')?.addEventListener('click', () => downloadFullExtentPng());
}

function bindWardSearch() {
  const input = document.getElementById('rm-ward-search');
  const dd = document.getElementById('rm-ward-dd');
  if (!input || !dd) return;

  const wards = Object.keys(_wardFeatureIndex).map(n => parseInt(n, 10)).filter(Number.isFinite).sort((a, b) => a - b);

  const draw = (term = '') => {
    const t = String(term || '').trim();
    const items = wards.filter(w => !t || String(w).startsWith(t)).slice(0, 30);
    if (!items.length) {
      dd.innerHTML = '<div class="rm-dd-item muted">No matching wards</div>';
      dd.style.display = 'block';
      return;
    }
    dd.innerHTML = items.map(w => `<button class="rm-dd-item" type="button" data-ward="${w}">Ward ${w}</button>`).join('');
    dd.style.display = 'block';

    dd.querySelectorAll('button[data-ward]').forEach(btn => {
      btn.addEventListener('click', () => {
        const wn = parseInt(btn.dataset.ward, 10);
        input.value = String(wn);
        dd.style.display = 'none';
        zoomToWard(wn);
      });
    });
  };

  input.addEventListener('focus', () => draw(input.value));
  input.addEventListener('input', () => draw(input.value));
  document.addEventListener('click', (e) => {
    if (!dd.contains(e.target) && e.target !== input) dd.style.display = 'none';
  });
}

async function loadScores() {
  const { data } = await supabase
    .from('hvc_hazard_scores')
    .select('*')
    .eq('municipality_id', _muniId)
    .order('risk_rating', { ascending: false });

  _rows = data || [];
}

async function renderMap() {
  const host = document.getElementById('risk-maplibre-map');
  if (!host) return;

  const mdbWards = await fetchMdbWards();
  if (!mdbWards?.length) {
    host.innerHTML = '<div class="rm-empty">Ward boundaries unavailable for this municipality.</div>';
    return;
  }

  _wardFeatures = mdbWards;
  await ensureMapInitialized();
  await renderMapLayers();
  renderLegend();
}

async function ensureMapInitialized() {
  if (_map) return;
  _map = new window.maplibregl.Map({
    container: 'risk-maplibre-map',
    preserveDrawingBuffer: true,
    style: {
      version: 8,
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      sources: {
        satellite: {
          type: 'raster',
          tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          attribution: 'Esri'
        }
      },
      layers: [{ id: 'satellite-base', type: 'raster', source: 'satellite' }]
    },
    center: [27.9, -26.1],
    zoom: 7
  });

  await new Promise(resolve => _map.once('load', resolve));

  if (!_navControlsAdded && window.maplibregl?.NavigationControl) {
    _map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    _navControlsAdded = true;
  }
}

async function renderMapLayers() {
  if (!_map || !_wardFeatures.length) return;

  const wardSummary = buildWardSummary();

  const featureCollection = {
    type: 'FeatureCollection',
    features: _wardFeatures.map((f, idx) => {
      const props = f.properties || {};
      const wardNo = props[_mdbWardNumField]
        ?? props.WARD_NO ?? props.WARD_NUM ?? props.WardNo
        ?? props.ward_no ?? props.ward_num ?? null;
      const wardNum = parseInt(wardNo, 10);
      const summary = wardSummary[wardNum] || { band: 'NO DATA', avg: null, count: 0 };
      return {
        ...f,
        id: idx + 1,
        properties: {
          ...props,
          ward_number: wardNum,
          band: summary.band,
          avg_score: summary.avg,
          item_count: summary.count,
          fill_color: BAND_COLORS[summary.band] || BAND_COLORS['NO DATA']
        }
      };
    }).filter(f => Number.isFinite(f.properties.ward_number))
  };

  _currentFeatureCollection = featureCollection;

  _wardFeatureIndex = {};
  _mapBounds = null;
  featureCollection.features.forEach(f => {
    const wn = parseInt(f.properties.ward_number, 10);
    if (!Number.isFinite(wn)) return;
    const coords = flattenCoords(f.geometry);
    const bbox = boundsFromCoords(coords);
    if (!bbox) return;
    _wardFeatureIndex[wn] = { bbox, properties: f.properties };
    _mapBounds = _mapBounds ? extendBounds(_mapBounds, bbox) : { ...bbox };
  });

  if (_map.getLayer('rm-ward-label')) _map.removeLayer('rm-ward-label');
  if (_map.getLayer('rm-ward-outline')) _map.removeLayer('rm-ward-outline');
  if (_map.getLayer('rm-ward-fill')) _map.removeLayer('rm-ward-fill');
  if (_map.getSource('rm-ward-source')) _map.removeSource('rm-ward-source');

  _map.addSource('rm-ward-source', { type: 'geojson', data: featureCollection });
  _map.addLayer({
    id: 'rm-ward-fill',
    type: 'fill',
    source: 'rm-ward-source',
    paint: {
      'fill-color': ['coalesce', ['get', 'fill_color'], BAND_COLORS['NO DATA']],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.78, 0.48]
    }
  });

  _map.addLayer({
    id: 'rm-ward-outline',
    type: 'line',
    source: 'rm-ward-source',
    paint: { 'line-color': '#ffffff', 'line-opacity': 0.9, 'line-width': 1.1 }
  });

  _map.addLayer({
    id: 'rm-ward-label',
    type: 'symbol',
    source: 'rm-ward-source',
    minzoom: 9,
    layout: {
      'text-font': ['Noto Sans Regular'],
      'text-field': ['concat', 'W', ['to-string', ['get', 'ward_number']]],
      'text-size': ['interpolate', ['linear'], ['zoom'], 9, 9, 12, 12]
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': '#000000',
      'text-halo-width': 1
    }
  });

  if (_mapBounds) {
    _map.fitBounds([[_mapBounds.minX, _mapBounds.minY], [_mapBounds.maxX, _mapBounds.maxY]], { padding: 30, maxZoom: 12 });
  }

  bindMapHandlers();
}

function buildWardSummary() {
  const map = {};

  const modeCfg = {
    hazard: {
      value: (r) => Number.isFinite(r?.hazard_score) ? Number(r.hazard_score) : null,
      band: (v) => bandFromFiveScale(v)
    },
    vulnerability: {
      value: (r) => Number.isFinite(r?.vulnerability_score) ? Number(r.vulnerability_score) : null,
      band: (v) => bandFromFiveScale(v)
    },
    capacity: {
      value: (r) => Number.isFinite(r?.capacity_score) ? Number(r.capacity_score) : null,
      band: (v) => bandFromFiveScale(v)
    },
    priority: {
      value: (r) => Number.isFinite(r?.priority_index) ? Number(r.priority_index) : null,
      band: (v) => bandFromFiveScale(v)
    }
  }[_mode] || null;

  if (!modeCfg) return map;

  _rows.forEach(r => {
    const wards = Array.isArray(r.affected_wards) ? r.affected_wards : [];
    const value = modeCfg.value(r);

    wards.forEach(wRaw => {
      const ward = parseInt(wRaw, 10);
      if (!Number.isFinite(ward)) return;
      if (!map[ward]) map[ward] = { scores: [], count: 0 };

      if (value != null) map[ward].scores.push(value);
      map[ward].count += 1;
    });
  });

  Object.entries(map).forEach(([ward, rec]) => {
    const avg = rec.scores.length ? rec.scores.reduce((a, b) => a + b, 0) / rec.scores.length : null;
    map[ward] = { band: modeCfg.band(avg), avg, count: rec.count };
  });

  return map;
}


function bandFromFiveScale(v) {
  if (v == null) return 'NO DATA';
  if (v <= 2) return 'VERY LOW';
  if (v <= 3) return 'LOW';
  if (v <= 4) return 'MEDIUM';
  return 'HIGH';
}

function bindMapHandlers() {
  if (_handlersBound) return;
  let hoveredId = null;

  _map.on('mousemove', 'rm-ward-fill', e => {
    _map.getCanvas().style.cursor = 'pointer';
    if (hoveredId !== null) _map.setFeatureState({ source: 'rm-ward-source', id: hoveredId }, { hover: false });
    const nextId = e.features?.[0]?.id;
    if (nextId !== undefined) {
      hoveredId = nextId;
      _map.setFeatureState({ source: 'rm-ward-source', id: hoveredId }, { hover: true });
    }
  });

  _map.on('mouseleave', 'rm-ward-fill', () => {
    _map.getCanvas().style.cursor = '';
    if (hoveredId !== null) _map.setFeatureState({ source: 'rm-ward-source', id: hoveredId }, { hover: false });
    hoveredId = null;
  });

  _map.on('click', 'rm-ward-fill', e => {
    const feature = e.features?.[0];
    if (!feature) return;
    const wrap = document.getElementById('risk-map-canvas-wrap');
    const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
    const clickX = e.point?.x ?? (e.originalEvent?.clientX - rect.left);
    const clickY = e.point?.y ?? (e.originalEvent?.clientY - rect.top);
    showWardTooltip(feature, clickX, clickY);
  });

  _handlersBound = true;
}

function showWardTooltip(feature, clickX, clickY) {
  const props = feature.properties || {};
  const ward = props.ward_number || '—';
  const band = props.band || 'NO DATA';
  const avg = props.avg_score;
  const count = props.item_count || 0;
  const col = BAND_COLORS[band] || BAND_COLORS['NO DATA'];

  document.getElementById('rm-ward-tooltip')?.remove();

  const wrap = document.getElementById('risk-map-canvas-wrap');
  if (!wrap) return;

  const tooltip = document.createElement('div');
  tooltip.id = 'rm-ward-tooltip';
  tooltip.className = 'rm-tooltip';

  const modeLabel = ANALYSIS_MODES.find(m => m.key === _mode)?.label || _mode;
  tooltip.innerHTML = `
    <div class="rm-tooltip-head">
      <div class="rm-tooltip-title">Ward ${ward}</div>
      <button class="rm-tooltip-close" id="rm-tt-close">×</button>
    </div>
    <div class="rm-pill" style="--pill-col:${col}">${band}</div>
    <div class="rm-tooltip-line"><span>Mode:</span><strong>${modeLabel}</strong></div>
    <div class="rm-tooltip-line"><span>Records:</span><strong>${count}</strong></div>
    <div class="rm-tooltip-line"><span>Average score:</span><strong>${avg == null ? '—' : Number(avg).toFixed(2)}</strong></div>
  `;

  const wW = wrap.offsetWidth || 900;
  const wH = wrap.offsetHeight || 380;
  tooltip.style.left = `${Math.min(Math.max((clickX || 0) + 12, 8), wW - 260)}px`;
  tooltip.style.top = `${Math.min(Math.max((clickY || 0) - 10, 8), wH - 210)}px`;

  wrap.appendChild(tooltip);
  document.getElementById('rm-tt-close')?.addEventListener('click', () => tooltip.remove());
}

function renderLegend() {
  const el = document.getElementById('rm-legend');
  if (!el) return;

  const modeLabel = ANALYSIS_MODES.find(m => m.key === _mode)?.label || _mode;
  el.innerHTML = `
    <div class="rm-legend-title">${modeLabel} legend</div>
    ${['HIGH', 'MEDIUM', 'LOW', 'VERY LOW', 'NO DATA'].map(label => `
      <div class="rm-leg-item">
        <span class="rm-leg-dot" style="background:${BAND_COLORS[label]}"></span>
        <span>${label}</span>
      </div>
    `).join('')}
  `;
}

function zoomToWard(wardNum) {
  if (!_map) return;
  zoomToWardOnMap(_map, wardNum, _wardFeatureIndex, _currentFeatureCollection?.features || [], { padding: 70, maxZoom: 13 });
}

function resetMapView() {
  if (!_map || !_mapBounds) return;
  _map.fitBounds([[_mapBounds.minX, _mapBounds.minY], [_mapBounds.maxX, _mapBounds.maxY]], { padding: 30, maxZoom: 12 });
  document.getElementById('rm-ward-tooltip')?.remove();
}

function destroyMap() {
  document.getElementById('rm-ward-tooltip')?.remove();
  if (_map) {
    _map.remove();
    _map = null;
  }
  _handlersBound = false;
  _navControlsAdded = false;
}

function downloadCurrentViewPng() {
  if (!_map) return;
  const url = _map.getCanvas().toDataURL('image/png');
  downloadDataUrl(url, `RiskMap-${_mode}-current.png`);
}

async function downloadFullExtentPng() {
  if (!_map || !_mapBounds) return;

  const center = _map.getCenter();
  const zoom = _map.getZoom();
  const bearing = _map.getBearing();
  const pitch = _map.getPitch();

  _map.fitBounds([[_mapBounds.minX, _mapBounds.minY], [_mapBounds.maxX, _mapBounds.maxY]], { padding: 30, maxZoom: 12, duration: 0 });
  await waitMapIdle();

  const url = _map.getCanvas().toDataURL('image/png');
  downloadDataUrl(url, `RiskMap-${_mode}-full.png`);

  _map.jumpTo({ center, zoom, bearing, pitch });
}

function waitMapIdle() {
  return new Promise(resolve => {
    if (_map.areTilesLoaded?.()) {
      setTimeout(resolve, 150);
      return;
    }
    _map.once('idle', () => setTimeout(resolve, 150));
  });
}

function downloadDataUrl(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function fetchMdbWards() {
  const muniCode = _user?.municipalities?.code;
  const rawName = _user?.municipalities?.name || '';
  const muniName = rawName.replace(' LM', '').replace(' DM', '').replace(' Metropolitan Municipality', '').trim();
  if (!muniCode && !muniName) return null;

  try {
    const BASE = 'https://services7.arcgis.com/oeoyTUJC8HEeYsRB/arcgis/rest/services/MDB_Wards_2020/FeatureServer/0/query';
    const probeRes = await fetch(`${BASE}?where=1%3D1&outFields=*&f=json&resultRecordCount=1`);
    const probeData = await probeRes.json();
    const fields = (probeData.fields || []).map(f => f.name);
    const wardNumField = fields.find(f => /ward.?n(o|um)/i.test(f)) || 'WARD_NO';
    const codeFields = fields.filter(f => /cat_b|lb_|muni.*c/i.test(f));
    const nameFields = fields.filter(f => /muni.*name|municname/i.test(f));

    const attempts = [];
    codeFields.forEach(f => { if (muniCode) attempts.push(`${f}='${muniCode}'`); });
    nameFields.forEach(f => { if (muniName) attempts.push(`${f} LIKE '%${muniName}%'`); });

    for (const where of attempts) {
      const url = `${BASE}?where=${encodeURIComponent(where)}&outFields=*&outSR=4326&f=geojson&resultRecordCount=200&returnGeometry=true`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.features?.length) {
        _mdbWardNumField = wardNumField;
        return data.features;
      }
    }
  } catch (e) {
    console.warn('[RiskMap] MDB API failed:', e.message);
  }

  return null;
}
