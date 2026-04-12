// js/risk-map.js — Dedicated Risk Map page (Hazard/Vulnerability/Capacity/Priority)
import { supabase } from './supabase.js';
import { boundsFromCoords, extendBounds, flattenCoords, zoomToWardOnMap } from './dashboard-map.js';
import { fetchMdbWardsByMunicipality } from './mdb-wards-service.js';

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
  HIGH: '#F2994A',
  'VERY HIGH': '#EB5757',
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
let _placesDebounceTimer = null;
let _placesCacheKey = '';
let _currentWardSummary = {};

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
          <button class="btn btn-sm" id="rm-report-preview">Open Report</button>
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
        <div class="rm-legend rm-legend-overlay" id="rm-legend"></div>
      </div>
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
  document.getElementById('rm-report-preview')?.addEventListener('click', () => openReportPreview());
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

  _map.on('moveend', () => {
    if (_placesDebounceTimer) clearTimeout(_placesDebounceTimer);
    _placesDebounceTimer = setTimeout(() => renderBackgroundPlaceNames(), 500);
  });
}

async function renderMapLayers() {
  if (!_map || !_wardFeatures.length) return;

  const wardSummary = buildWardSummary();
  _currentWardSummary = wardSummary;

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
          p90_score: summary.p90,
          composite_score: summary.composite,
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
  renderBackgroundPlaceNames();
}

function buildWardSummary() {
  const map = {};

  const valueFn = {
    hazard: (r) => Number.isFinite(r?.hazard_score) ? Number(r.hazard_score) : null,
    vulnerability: (r) => Number.isFinite(r?.vulnerability_score) ? Number(r.vulnerability_score) : null,
    capacity: (r) => Number.isFinite(r?.capacity_score) ? Number(r.capacity_score) : null,
    priority: (r) => Number.isFinite(r?.priority_index) ? Number(r.priority_index) : null
  }[_mode];

  if (!valueFn) return map;

  _rows.forEach(r => {
    const wards = Array.isArray(r.affected_wards) ? r.affected_wards : [];
    const value = valueFn(r);

    wards.forEach(wRaw => {
      const ward = parseInt(wRaw, 10);
      if (!Number.isFinite(ward)) return;
      if (!map[ward]) map[ward] = { scores: [], count: 0 };
      if (value != null) map[ward].scores.push(value);
      map[ward].count += 1;
    });
  });

  const composites = [];
  Object.entries(map).forEach(([ward, rec]) => {
    const avg = rec.scores.length ? rec.scores.reduce((a, b) => a + b, 0) / rec.scores.length : null;
    const p90 = rec.scores.length ? percentile(rec.scores, 0.9) : null;
    const composite = (avg == null || p90 == null) ? null : (0.7 * avg + 0.3 * p90);
    map[ward] = { avg, p90, composite, count: rec.count, band: 'NO DATA' };
    if (composite != null) composites.push(composite);
  });

  const breaks = quantileBreaks(composites, 5);
  Object.entries(map).forEach(([ward, rec]) => {
    map[ward] = { ...rec, band: bandFromBreaks(rec.composite, breaks) };
  });

  return map;
}

function percentile(values, p) {
  if (!Array.isArray(values) || !values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const w = idx - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function quantileBreaks(values, bins = 5) {
  if (!Array.isArray(values) || !values.length) return [];
  const b = [];
  for (let i = 1; i < bins; i++) b.push(percentile(values, i / bins));
  return b;
}

function bandFromBreaks(v, breaks) {
  if (v == null || !Array.isArray(breaks) || breaks.length < 4) return 'NO DATA';
  if (v <= breaks[0]) return 'VERY LOW';
  if (v <= breaks[1]) return 'LOW';
  if (v <= breaks[2]) return 'MEDIUM';
  if (v <= breaks[3]) return 'HIGH';
  return 'VERY HIGH';
}

async function renderBackgroundPlaceNames() {
  if (!_map) return;
  const zoom = _map.getZoom?.() || 0;

  if (zoom < 10) {
    if (_map.getLayer('rm-osm-place-label')) _map.removeLayer('rm-osm-place-label');
    if (_map.getSource('rm-osm-place-source')) _map.removeSource('rm-osm-place-source');
    _placesCacheKey = '';
    return;
  }

  const b = _map.getBounds?.();
  if (!b) return;
  const bbox = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  const zBucket = Math.floor(zoom * 2) / 2;
  const cacheKey = [zBucket, bbox.south.toFixed(3), bbox.west.toFixed(3), bbox.north.toFixed(3), bbox.east.toFixed(3)].join('|');
  if (_placesCacheKey === cacheKey && _map.getSource('rm-osm-place-source')) return;
  _placesCacheKey = cacheKey;

  const placeTypes = zoom >= 13 ? 'city|town|village|suburb|neighbourhood' : 'city|town|village|suburb';
  const query = `
[out:json][timeout:20];
(
  node["place"~"${placeTypes}"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["place"~"${placeTypes}"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  relation["place"~"${placeTypes}"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out center;
`;

  try {
    const endpoints = [
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass-api.de/api/interpreter'
    ];

    let data = null;
    for (const endpoint of endpoints) {
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: `data=${encodeURIComponent(query)}` });
      if (!r.ok) continue;
      data = await r.json();
      if (data?.elements) break;
    }
    if (!data?.elements) return;

    const seen = new Set();
    const features = data.elements.map(el => {
      const name = el.tags?.name;
      if (!name) return null;
      const place = el.tags?.place || 'locality';
      const key = `${name}|${place}`;
      if (seen.has(key)) return null;
      seen.add(key);
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { name, place } };
    }).filter(Boolean);

    if (_map.getLayer('rm-osm-place-label')) _map.removeLayer('rm-osm-place-label');
    if (_map.getSource('rm-osm-place-source')) _map.removeSource('rm-osm-place-source');

    _map.addSource('rm-osm-place-source', { type: 'geojson', data: { type: 'FeatureCollection', features } });
    _map.addLayer({
      id: 'rm-osm-place-label',
      type: 'symbol',
      source: 'rm-osm-place-source',
      minzoom: 10,
      layout: {
        'text-font': ['Noto Sans Regular'],
        'text-field': ['get', 'name'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 13, 12],
        'text-allow-overlap': false,
        'text-ignore-placement': false
      },
      paint: {
        'text-color': '#dbe6f3',
        'text-halo-color': '#0d1117',
        'text-halo-width': 1.1,
        'text-opacity': 0.9
      }
    });
  } catch (e) {
    console.warn('[RiskMap] OSM place labels unavailable:', e.message);
  }
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
  const p90 = props.p90_score;
  const composite = props.composite_score;
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
    <div class="rm-tooltip-line"><span>Composite:</span><strong>${composite == null ? '—' : Number(composite).toFixed(2)}</strong></div>
    <div class="rm-tooltip-line"><span>Average:</span><strong>${avg == null ? '—' : Number(avg).toFixed(2)}</strong></div>
    <div class="rm-tooltip-line"><span>P90:</span><strong>${p90 == null ? '—' : Number(p90).toFixed(2)}</strong></div>
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
    ${['VERY HIGH', 'HIGH', 'MEDIUM', 'LOW', 'VERY LOW', 'NO DATA'].map(label => `
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
  _placesCacheKey = '';
  if (_placesDebounceTimer) clearTimeout(_placesDebounceTimer);
  _placesDebounceTimer = null;
}


function openReportPreview() {
  if (!_map) return;
  const mapImage = _map.getCanvas().toDataURL('image/png');
  const modeLabel = ANALYSIS_MODES.find(m => m.key === _mode)?.label || _mode;
  const generatedAt = new Date().toLocaleString();
  const muniName = _user?.municipalities?.name || 'Municipality';

  const wardRows = Object.entries(_currentWardSummary || {})
    .map(([ward, s]) => ({ ward: Number(ward), ...s }))
    .sort((a, b) => a.ward - b.ward);

  const metricLabel = {
    hazard: 'Hazard score',
    vulnerability: 'Vulnerability score',
    capacity: 'Capacity score',
    priority: 'Priority index'
  }[_mode] || 'Score';

  const detailRows = wardRows.map(w => {
    const hazards = (_rows || []).filter(r => Array.isArray(r.affected_wards) && r.affected_wards.map(String).includes(String(w.ward)));
    const hazardList = hazards.map(h => {
      const metric = {
        hazard: h.hazard_score,
        vulnerability: h.vulnerability_score,
        capacity: h.capacity_score,
        priority: h.priority_index
      }[_mode];
      return `<tr>
        <td>${escapeHtml(h.hazard_name || '—')}</td>
        <td>${escapeHtml(h.hazard_category || '—')}</td>
        <td>${metric == null ? '—' : Number(metric).toFixed(2)}</td>
        <td>${h.risk_rating == null ? '—' : Number(h.risk_rating).toFixed(2)}</td>
        <td>${escapeHtml(h.risk_band || '—')}</td>
      </tr>`;
    }).join('');

    return `
      <h3>Ward ${w.ward} — ${w.band || 'NO DATA'}</h3>
      <p><strong>Composite:</strong> ${w.composite == null ? '—' : Number(w.composite).toFixed(2)} · <strong>Average:</strong> ${w.avg == null ? '—' : Number(w.avg).toFixed(2)} · <strong>P90:</strong> ${w.p90 == null ? '—' : Number(w.p90).toFixed(2)} · <strong>Records:</strong> ${w.count || 0}</p>
      <table>
        <thead><tr><th>Hazard</th><th>Category</th><th>${metricLabel}</th><th>Risk rating</th><th>Risk band</th></tr></thead>
        <tbody>${hazardList || '<tr><td colspan="5">No hazard rows linked to this ward.</td></tr>'}</tbody>
      </table>
    `;
  }).join('');

  const summaryTable = wardRows.map(w => `
    <tr>
      <td>${w.ward}</td>
      <td>${escapeHtml(w.band || 'NO DATA')}</td>
      <td>${w.avg == null ? '—' : Number(w.avg).toFixed(2)}</td>
      <td>${w.p90 == null ? '—' : Number(w.p90).toFixed(2)}</td>
      <td>${w.composite == null ? '—' : Number(w.composite).toFixed(2)}</td>
      <td>${w.count || 0}</td>
    </tr>
  `).join('');

  const legendRows = ['VERY HIGH','HIGH','MEDIUM','LOW','VERY LOW','NO DATA']
    .map(l => `<div class="legend-row"><span class="dot" style="background:${BAND_COLORS[l] || '#999'}"></span>${l}</div>`)
    .join('');

  const methodology = `
    <ul>
      <li><strong>Input data:</strong> This analysis uses HVC records linked to each ward through <code>affected_wards</code>.</li>
      <li><strong>Mode metric:</strong> The selected analysis uses ${metricLabel.toLowerCase()} as the per-record value.</li>
      <li><strong>Average (Mean):</strong> Typical ward-level score across linked hazards.</li>
      <li><strong>P90 (90th percentile):</strong> Score above which only 10% of linked records lie; captures elevated risk pressure without relying only on the maximum.</li>
      <li><strong>Composite score:</strong> <code>0.7 × Average + 0.3 × P90</code> to balance general conditions and high-end risk behavior.</li>
      <li><strong>Banding:</strong> Composite scores are split into five quantile classes (Very Low → Very High) so classes are relative to the municipality dataset.</li>
      <li><strong>No Data:</strong> Assigned when no valid metric values are available for ward-linked records.</li>
      <li><strong>Interpretation:</strong> Higher classes indicate comparatively higher local concentration of risk for the selected analysis mode.</li>
    </ul>
  `;

  const html = `
  <html>
    <head>
      <title>${escapeHtml(modeLabel)} Report</title>
      <style>
        body{font-family:Inter,Arial,sans-serif;padding:24px;color:#111;line-height:1.45}
        h1{margin:0 0 4px;font-size:22px;border-bottom:1px solid #ddd;padding-bottom:6px}
        h2{margin:20px 0 8px;font-size:16px;border-bottom:1px solid #e6e6e6;padding-bottom:4px}
        h3{margin:16px 0 4px;font-size:14px}
        .meta{font-size:12px;color:#555;margin-bottom:12px}
        .top-actions{position:sticky;top:0;background:#fff;padding:8px 0 10px;border-bottom:1px solid #ececec;margin-bottom:10px;display:flex;gap:8px;z-index:5}
        .btn{border:1px solid #bbb;background:#fff;padding:6px 10px;border-radius:6px;font-size:12px;cursor:pointer}
        .map{width:100%;max-width:900px;border:1px solid #ccc;border-radius:8px}
        .legend{display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 12px}
        .legend-row{display:flex;align-items:center;gap:6px;font-size:12px}
        .dot{width:10px;height:10px;border-radius:50%;display:inline-block}
        table{width:100%;border-collapse:collapse;margin-top:6px}
        th,td{border:1px solid #ddd;padding:6px;font-size:11px;vertical-align:top}
        th{background:#e3e3e3;background:linear-gradient(180deg,#ececec 0%,#dddddd 100%);text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        @media print{
          .no-print{display:none !important}
          body{padding:12mm}
        }
      </style>
    </head>
    <body>
      <h1>Risk Map Analysis Report</h1>
      <div class="meta"><strong>Municipality:</strong> ${escapeHtml(muniName)} · <strong>Analysis:</strong> ${escapeHtml(modeLabel)} · <strong>Generated:</strong> ${escapeHtml(generatedAt)}</div>
      <div class="top-actions no-print">
        <button class="btn" onclick="window.print()">Download PDF</button>
        <button class="btn" onclick="window.print()">Print</button>
      </div>

      <h2>Map</h2>
      <img class="map" src="${mapImage}" alt="Risk map" />
      <div class="legend">${legendRows}</div>

      <h2>Methodology</h2>
      ${methodology}

      <h2>Ward Summary</h2>
      <table>
        <thead><tr><th>Ward</th><th>Band</th><th>Average</th><th>P90</th><th>Composite</th><th>Records</th></tr></thead>
        <tbody>${summaryTable || '<tr><td colspan="6">No ward data.</td></tr>'}</tbody>
      </table>

      <h2>Ward Hazard Detail</h2>
      ${detailRows || '<p>No ward-linked hazard data available.</p>'}
    </body>
  </html>`;

  const win = window.open('', '_blank');
  if (!win) { alert('Unable to open report window. Please allow popups.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    const { features, wardNumField } = await fetchMdbWardsByMunicipality({ muniCode, muniName });
    _mdbWardNumField = wardNumField;
    return features;
  } catch (e) {
    console.warn('[RiskMap] MDB API failed:', e.message);
  }

  return null;
}
