// js/dashboard.js
import { supabase } from './supabase.js';
import {
  parseMarkerCoords,
  getWardAtLngLat,
  flattenCoords,
  boundsFromCoords,
  extendBounds,
  zoomToWardOnMap
} from './dashboard-map.js';
import { buildProjectFeatures, projectOptionLabel } from './dashboard-projects.js';

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
  'High':'HIGH','TOLERABLE':'Tolerable','Low':'LOW','Negligible':'NEGLIGIBLE'
};

let _assessmentData = null;
let _wardData = [];
let _muniId = null;
let _mdbWardNumField = 'WARD_NO';
let _wardCentroids = {};
let _wardFeatureIndex = {};
let _mapBounds = null;
let _wardFeatures = [];
let _map = null;
let _mapMode = 'hazard';
let _mapHandlersBound = false;
let _shelterClickBound = false;
let _projectsClickBound = false;
let _osmPlacesCacheKey = '';
let _osmPlacesInFlight = false;
let _osmPlacesLastFetchAt = 0;
let _osmPlacesDebounceTimer = null;
let _osmEndpointCooldownUntil = {};
let _osmPlacesAbortController = null;
let _osmPlacesFailureBackoffUntil = 0;
let _osmPlacesLastWarnAt = 0;
let _isAddingProjectMarker = false;
let _selectedProjectForPlacement = null;
let _wardFillVisible = true;
let _trendSelectedIndex = 0;

function notify(message, isError = false) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, isError);
    return;
  }
  if (isError) console.error(message);
  else console.log(message);
}

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
    syncTrendSelector();
    await renderWardMap();
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
    if (risks.every(r => !r) && (assessments||[]).length > 0) {
      console.warn('  All dominant_risk values are NULL — run SQL 18_fix_ward_risk_fallback.sql');
    }
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

  // Use risk_rating threshold as primary — works even when risk_band is null
  const xh  = hazards.filter(h => (h.risk_rating > 20) ||
    (h.risk_band||'').toLowerCase().replace(/\s/g,'') === 'extremelyhigh').length;
  const high = hazards.filter(h => (h.risk_rating > 15 && h.risk_rating <= 20) ||
    (h.risk_band||'').toLowerCase() === 'high').length;

  setEl('kpi-xh', xh || (hazards.length ? xh : '—'));
  setEl('kpi-h',  high || (hazards.length ? high : '—'));

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

function ratingToBand(r) {
  if (r == null) return null;
  if (r <= 5)  return 'Negligible';
  if (r <= 10) return 'Low';
  if (r <= 15) return 'Tolerable';
  if (r <= 20) return 'High';
  return 'Extremely High';
}

async function renderWardMap(neutralMode = false) {
  const mapContainer = document.getElementById('maplibre-map');
  if (!mapContainer) return;

  const wardRisk = {};
  const wardPeak = {};
  const hazards  = neutralMode ? [] : (_assessmentData?.hazards || []);
  const RISK_ORDER = ['Extremely High','High','Tolerable','Low','Negligible'];

  if (!neutralMode && hazards.length > 0) {
    const allWardNums = _wardData.map(w => parseInt(w.ward_number)).filter(Boolean);
    const wardRatings = {};
    allWardNums.forEach(n => { wardRatings[n] = []; });

    let hasExplicitWards = false;
    hazards.forEach(h => {
      const rating = h.risk_rating ?? null;
      if (rating === null) return;
      const band = h.risk_band || ratingToBand(rating);
      if (Array.isArray(h.affected_wards) && h.affected_wards.length > 0) {
        hasExplicitWards = true;
        h.affected_wards.forEach(wRaw => {
          const wNum = parseInt(wRaw);
          if (isNaN(wNum) || !wardRatings[wNum]) return;
          wardRatings[wNum].push(rating);
          const cur = wardPeak[wNum];
          if (!cur || RISK_ORDER.indexOf(band) < RISK_ORDER.indexOf(cur)) wardPeak[wNum] = band;
        });
      }
    });

    if (!hasExplicitWards) {
      const sortedWards = [...allWardNums].sort((a, b) => a - b);
      hazards.forEach(h => {
        const rating = h.risk_rating ?? null;
        if (rating === null) return;
        const band = h.risk_band || ratingToBand(rating);
        const areaPct = Math.min(5, Math.max(1, h.affected_area || 3));
        const coverCount = Math.max(1, Math.round((areaPct / 5) * sortedWards.length));
        sortedWards.slice(0, coverCount).forEach(wNum => {
          wardRatings[wNum].push(rating);
          const cur = wardPeak[wNum];
          if (!cur || RISK_ORDER.indexOf(band) < RISK_ORDER.indexOf(cur)) wardPeak[wNum] = band;
        });
      });
    }
        allWardNums.forEach(wNum => {
      const ratings = wardRatings[wNum];
                if (!ratings.length) return;
      const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      const peak = Math.max(...ratings);
      wardRisk[wNum] = ratingToBand(avg + 0.2 * (peak - avg));
    });

    _wardData.forEach(w => {
      const wNum = parseInt(w.ward_number);
      if (w.dominant_risk && !wardRisk[wNum]) wardRisk[wNum] = w.dominant_risk;
    });

    console.log('[Dashboard] Per-ward risk computed:', wardRisk);
  }

  const mdbWards = await fetchMdbWards();
  if (!mdbWards?.length) {
    mapContainer.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:12px">Ward boundaries unavailable for this municipality.</div>';
    return;
  }

  const featureCollection = {
    type: 'FeatureCollection',
    features: mdbWards.map((f, idx) => {
      const props = f.properties || {};
      const wardNo = props[_mdbWardNumField]
        ?? props['WARD_NO'] ?? props['WARD_NUM'] ?? props['WardNo']
        ?? props['ward_no'] ?? props['ward_num'] ?? null;
      const wNum = parseInt(wardNo);
      const rawRisk = wardRisk[wNum] || 'Negligible';
      const risk = normalizeRiskBand(rawRisk);
      const peakBand = normalizeRiskBand(wardPeak[wNum]);
      return {
        ...f,
        id: idx + 1,
        properties: {
          ...props,
          ward_number: wNum,
          risk_band: risk,
          peak_band: peakBand || null,
          fill_color: RISK_COLOURS[risk] || '#6e7681'
        }
      };
    }).filter(f => Number.isFinite(f.properties.ward_number))
  };

  await ensureMapInitialized();
  await renderWardLayers(featureCollection);
  await renderBackgroundPlaceNames();
  updateMapLegend();
  if (_mapMode === 'shelters') {
    await renderSheltersOnMap();
  } else if (_mapMode === 'projects') {
    await renderProjectsOnMap();
  }
  window._drmsaZoomToWard = zoomToWard;
}

function normalizeRiskBand(rawRisk) {
  if (!rawRisk) return 'Negligible';
  const risk = String(rawRisk).trim().toLowerCase();
  if (risk === 'extremely high' || risk === 'extremelyhigh') return 'Extremely High';
  if (risk === 'high') return 'High';
  if (risk === 'tolerable') return 'Tolerable';
  if (risk === 'low') return 'Low';
  return 'Negligible';
}

async function fetchMdbWards() {
  const muniCode = window._drmsaUser?.municipalities?.code;
  const rawName = window._drmsaUser?.municipalities?.name || '';
  const muniName = rawName.replace(' LM','').replace(' DM','').replace(' Metropolitan Municipality','').trim();
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
    console.warn('MDB API failed:', e.message);
  }
  return null;
}

async function ensureMapInitialized() {
  if (_map) return;
  if (!window.maplibregl) {
    throw new Error('MapLibre GL not loaded on page');
  }
  _map = new window.maplibregl.Map({
    container: 'maplibre-map',
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
  bindMapControls();
  _map.on('moveend', () => {
    if (_osmPlacesDebounceTimer) clearTimeout(_osmPlacesDebounceTimer);
    _osmPlacesDebounceTimer = setTimeout(() => {
      renderBackgroundPlaceNames();
    }, 700);
  });
}

async function renderWardLayers(featureCollection) {
  _wardCentroids = {};
  _wardFeatureIndex = {};
  _mapBounds = null;
  _wardFeatures = featureCollection?.features || [];

  featureCollection.features.forEach(f => {
    const wNum = parseInt(f.properties.ward_number);
    if (!Number.isFinite(wNum)) return;
    const coords = flattenCoords(f.geometry);
    if (!coords.length) return;
    const bbox = boundsFromCoords(coords);
    const centroid = { cx: (bbox.minX + bbox.maxX) / 2, cy: (bbox.minY + bbox.maxY) / 2 };
    _wardCentroids[wNum] = centroid;
    _wardFeatureIndex[wNum] = { bbox, centroid, properties: f.properties };
    _mapBounds = _mapBounds ? extendBounds(_mapBounds, bbox) : { ...bbox };
  });
  window._drmsaWardCentroids = _wardCentroids;

  if (_map.getLayer('ward-label')) _map.removeLayer('ward-label');
  if (_map.getLayer('ward-outline')) _map.removeLayer('ward-outline');
  if (_map.getLayer('ward-fill')) _map.removeLayer('ward-fill');
  if (_map.getSource('ward-source')) _map.removeSource('ward-source');

  _map.addSource('ward-source', { type: 'geojson', data: featureCollection });
  _map.addLayer({
    id: 'ward-fill',
    type: 'fill',
    source: 'ward-source',
    paint: {
      'fill-color': ['coalesce', ['get', 'fill_color'], '#6e7681'],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.75, 0.45]
    }
  });
  _map.addLayer({
    id: 'ward-outline',
    type: 'line',
    source: 'ward-source',
    paint: { 'line-color': '#ffffff', 'line-opacity': 0.9, 'line-width': 1.1 }
  });
  _map.addLayer({
    id: 'ward-label',
    type: 'symbol',
    source: 'ward-source',
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
  // area-label layer removed — MDB ward features carry no place name attributes.
  // Place names are sourced exclusively from the OSM Overpass layer (renderBackgroundPlaceNames).

  if (_mapBounds) {
    _map.fitBounds([[ _mapBounds.minX, _mapBounds.minY ], [ _mapBounds.maxX, _mapBounds.maxY ]], { padding: 30, maxZoom: 12 });
  }

  if (!_mapHandlersBound) {
    let hoveredId = null;
    _map.on('mousemove', 'ward-fill', e => {
      _map.getCanvas().style.cursor = 'pointer';
      if (hoveredId !== null) _map.setFeatureState({ source: 'ward-source', id: hoveredId }, { hover: false });
      const nextId = e.features?.[0]?.id;
      if (nextId !== undefined) {
        hoveredId = nextId;
        _map.setFeatureState({ source: 'ward-source', id: hoveredId }, { hover: true });
      }
    });
    _map.on('mouseleave', 'ward-fill', () => {
      _map.getCanvas().style.cursor = '';
      if (hoveredId !== null) _map.setFeatureState({ source: 'ward-source', id: hoveredId }, { hover: false });
      hoveredId = null;
    });

    _map.on('click', 'ward-fill', e => {
      const feature = e.features?.[0];
      if (!feature) return;
      const wardNum = parseInt(feature.properties?.ward_number);
      const risk = normalizeRiskBand(feature.properties?.risk_band);
      const wrap = document.getElementById('map-canvas-wrap');
      const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
      const clickX = e.point?.x ?? (e.originalEvent?.clientX - rect.left);
      const clickY = e.point?.y ?? (e.originalEvent?.clientY - rect.top);
      showWardInfo(wardNum, risk, wardNum, clickX, clickY);
      const coords = flattenCoords(feature.geometry);
      if (coords.length) {
        const bbox = boundsFromCoords(coords);
        _map.fitBounds([[bbox.minX, bbox.minY], [bbox.maxX, bbox.maxY]], { padding: 70, maxZoom: 13 });
      } else if (Number.isFinite(wardNum)) {
        zoomToWard(wardNum);
      }
    });
        _map.on('click', async e => {
      if (!_isAddingProjectMarker || !_selectedProjectForPlacement?.id) return;
      const wardNum = getWardAtLngLat(_map, e.lngLat, _wardFeatures);
      if (!Number.isFinite(wardNum)) {
        notify('Please click inside a ward polygon to place this project.', true);
        return;
      }
      _isAddingProjectMarker = false;
      _map.getCanvas().style.cursor = '';
      await saveProjectMarkerAt(e.lngLat, wardNum, _selectedProjectForPlacement.id);
      _selectedProjectForPlacement = null;
                hideProjectPlacementForm();
    });
    _mapHandlersBound = true;
  }

  setMapMode(_mapMode);
}

function zoomToWard(wardNum) {
  const target = parseInt(wardNum, 10);
  if (!Number.isFinite(target)) {
    notify('Enter a valid ward number.', true);
    return;
  }
  if (!_map) {
    notify('Map is not ready yet.', true);
    return;
  }
  const didZoom = zoomToWardOnMap(_map, target, _wardFeatureIndex, _wardFeatures, { padding: 70, maxZoom: 13 });
  if (!didZoom) {
    notify('Ward ' + target + ' not found on map', true);
  }
}

function bindMapControls() {
  document.getElementById('map-zoom-in')?.addEventListener('click', () => _map?.zoomIn());
  document.getElementById('map-zoom-out')?.addEventListener('click', () => _map?.zoomOut());
  document.getElementById('map-zoom-reset')?.addEventListener('click', () => {
    if (_map && _mapBounds) {
      _map.fitBounds([[ _mapBounds.minX, _mapBounds.minY ], [ _mapBounds.maxX, _mapBounds.maxY ]], { padding: 30, maxZoom: 12 });
    }
  });
  document.getElementById('map-toggle-fill')?.addEventListener('click', () => {
    _wardFillVisible = !_wardFillVisible;
    applyWardLayerVisibility();
    const btn = document.getElementById('map-toggle-fill');
    if (btn) btn.textContent = _wardFillVisible ? 'Hide ward fill' : 'Show ward fill';
  });
  document.getElementById('map-download')?.addEventListener('click', async () => {
    const scope = document.getElementById('map-download-scope')?.value || 'current';
    await downloadMapImage(scope);
  });
}

function updateMapLegend() {
  const legend = document.getElementById('map-legend-bar');
  if (!legend || _mapMode !== 'hazard') return;
  legend.innerHTML = [
    ['#f85149','Extremely high'],['#d29922','High'],['#3fb950','Tolerable'],['#58a6ff','Low'],['#6e7681','Unscored']
  ].map(([col,lbl]) => '<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text3)"><span style="width:10px;height:10px;border-radius:2px;background:'+col+';display:inline-block"></span>'+lbl+'</div>').join('');
}

function setMapMode(mode) {
  _mapMode = mode;
  if (!_map) return;
  const hazardVisible = mode === 'hazard';
  const sheltersVisible = mode === 'shelters';
  const projectsVisible = mode === 'projects';
  applyWardLayerVisibility();
  if (_map.getLayer('ward-label')) _map.setLayoutProperty('ward-label', 'visibility', (hazardVisible || projectsVisible) ? 'visible' : 'none');
  if (_map.getLayer('shelter-circle')) _map.setLayoutProperty('shelter-circle', 'visibility', sheltersVisible ? 'visible' : 'none');
  if (_map.getLayer('shelter-label')) _map.setLayoutProperty('shelter-label', 'visibility', sheltersVisible ? 'visible' : 'none');
  if (_map.getLayer('project-circle')) _map.setLayoutProperty('project-circle', 'visibility', projectsVisible ? 'visible' : 'none');
  if (_map.getLayer('project-label')) _map.setLayoutProperty('project-label', 'visibility', projectsVisible ? 'visible' : 'none');
  if (_map.getLayer('osm-place-label')) _map.setLayoutProperty('osm-place-label', 'visibility', 'visible');
}

function applyWardLayerVisibility() {
  if (!_map) return;
  const showWardLayers = (_mapMode === 'hazard' || _mapMode === 'projects');
  if (_map.getLayer('ward-fill')) _map.setLayoutProperty('ward-fill', 'visibility', (showWardLayers && _wardFillVisible) ? 'visible' : 'none');
  if (_map.getLayer('ward-outline')) _map.setLayoutProperty('ward-outline', 'visibility', showWardLayers ? 'visible' : 'none');
}

async function waitForMapIdle() {
  if (!_map) return;
  await new Promise(resolve => {
    const done = () => resolve();
    _map.once('idle', done);
  });
}

async function downloadMapImage(scope = 'current') {
  if (!_map) return;
  const previousMode = _mapMode;
  const targetMode = previousMode === 'shelters' ? 'hazard' : previousMode;
  const cam = {
    center: _map.getCenter(),
    zoom: _map.getZoom(),
    bearing: _map.getBearing(),
    pitch: _map.getPitch()
  };
  try {
    if (scope === 'full' && _mapBounds) {
      _map.fitBounds([[ _mapBounds.minX, _mapBounds.minY ], [ _mapBounds.maxX, _mapBounds.maxY ]], { padding: 30, maxZoom: 12, duration: 0 });
      await waitForMapIdle();
    } else if (previousMode !== targetMode) {
      setMapMode(targetMode);
      await waitForMapIdle();
    }
    const url = _map.getCanvas().toDataURL('image/png');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const a = document.createElement('a');
    a.href = url;
    a.download = `ward-map-${scope}-${stamp}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    notify(`Map image downloaded (${scope === 'full' ? 'full extent' : 'current view'}).`);
  } catch (e) {
    notify(`Could not download map image: ${e.message}`, true);
  } finally {
    _map.jumpTo(cam);
    setMapMode(previousMode);
  }
}

// pickAreaNameLabel is intentionally removed.
// MDB ward features only carry ward number and municipal code — no suburb, town, or
// settlement attributes. Place name labels are rendered exclusively by the OSM
// Overpass layer in renderBackgroundPlaceNames().

function pickOsmPlaceName(tags = {}) {
  const candidates = [
    'name',
    'name:en',
    'official_name',
    'short_name',
    'int_name',
    'loc_name',
    'alt_name',
    'place_name',
    'addr:suburb',
    'addr:city',
    'is_in'
  ];
  for (const key of candidates) {
    const value = tags?.[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

async function renderBackgroundPlaceNames() {
  if (!_map || !_mapBounds) return;
  if ((_map.getZoom?.() || 0) < 8) return;
  if (Date.now() < _osmPlacesFailureBackoffUntil) return;
  if (_osmPlacesInFlight) return;
  const now = Date.now();
  if (now - _osmPlacesLastFetchAt < 5000) return;
  const view = _map.getBounds?.();
  const viewBox = view ? {
    south: view.getSouth(),
    west: view.getWest(),
    north: view.getNorth(),
    east: view.getEast()
  } : null;
  const bbox = {
    south: Math.max(_mapBounds.minY, viewBox?.south ?? _mapBounds.minY),
    west: Math.max(_mapBounds.minX, viewBox?.west ?? _mapBounds.minX),
    north: Math.min(_mapBounds.maxY, viewBox?.north ?? _mapBounds.maxY),
    east: Math.min(_mapBounds.maxX, viewBox?.east ?? _mapBounds.maxX)
  };
  const hasValidBbox =
    [bbox.south, bbox.west, bbox.north, bbox.east].every(Number.isFinite) &&
    bbox.south < bbox.north &&
    bbox.west < bbox.east;
  if (!hasValidBbox) return;
  const bboxArea = (bbox.north - bbox.south) * (bbox.east - bbox.west);
  if (bboxArea > 2.5) return;
  const cacheKey = `${bbox.south.toFixed(3)},${bbox.west.toFixed(3)},${bbox.north.toFixed(3)},${bbox.east.toFixed(3)}`;
  if (_osmPlacesCacheKey === cacheKey && _map.getSource('osm-place-source')) return;
  _osmPlacesCacheKey = cacheKey;
  _osmPlacesInFlight = true;
  _osmPlacesLastFetchAt = now;
  const zoom = _map.getZoom?.() || 8;
  const placeTypes = zoom >= 10
    ? 'city|town|suburb|neighbourhood|village|hamlet'
    : 'city|town|suburb|village';

  const query = `
    [out:json][timeout:25];
    (
      node["place"~"${placeTypes}"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["place"~"${placeTypes}"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      relation["place"~"${placeTypes}"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out center tags;
  `;
  try {
    const OVERPASS_ENDPOINTS = [
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass-api.de/api/interpreter',
      'https://overpass.openstreetmap.ru/api/interpreter'
    ];
    let res = null;
    let lastErr = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const cooldownUntil = _osmEndpointCooldownUntil[endpoint] || 0;
      if (Date.now() < cooldownUntil) continue;
      try {
        if (_osmPlacesAbortController) _osmPlacesAbortController.abort();
        const ctl = new AbortController();
        _osmPlacesAbortController = ctl;
        const t = setTimeout(() => ctl.abort(), 12000);
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: query.trim(),
          signal: ctl.signal
        });
        clearTimeout(t);
        if (!r.ok) {
          if (r.status === 429 || r.status === 504) {
            _osmEndpointCooldownUntil[endpoint] = Date.now() + 60000;
          }
          throw new Error(`HTTP ${r.status}`);
        }
        res = r;
                break;
      } catch (e) {
        if (String(e?.name || '').toLowerCase() === 'aborterror') {
          lastErr = new Error('Request timeout');
          continue;
        }
        lastErr = e;
      }
    }
    if (!res) throw new Error(lastErr?.message || 'All Overpass endpoints failed');
    const data = await res.json();
    const features = (data.elements || []).map(el => {
      const name = pickOsmPlaceName(el.tags || {});
      const lat = typeof el.lat === 'number' ? el.lat : (typeof el.center?.lat === 'number' ? el.center.lat : null);
      const lon = typeof el.lon === 'number' ? el.lon : (typeof el.center?.lon === 'number' ? el.center.lon : null);
      if (!name || typeof lat !== 'number' || typeof lon !== 'number') return null;
      return {
        type: 'Feature',
        id: `osm-${el.id}`,
        properties: {
                    name,
                    place: el.tags?.place || 'locality'
        },
        geometry: { type: 'Point', coordinates: [lon, lat] }
      };
    }).filter(Boolean);

    if (!features.length) {
      if (_map.getLayer('osm-place-label')) _map.removeLayer('osm-place-label');
      if (_map.getSource('osm-place-source')) _map.removeSource('osm-place-source');
      return;
    }

    if (_map.getLayer('osm-place-label')) _map.removeLayer('osm-place-label');
    if (_map.getSource('osm-place-source')) _map.removeSource('osm-place-source');
    _map.addSource('osm-place-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features }
    });
    _map.addLayer({
      id: 'osm-place-label',
      type: 'symbol',
      source: 'osm-place-source',
      minzoom: 8,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-size': [
          'match', ['get', 'place'],
          'city', 13,
          'town', 12,
          'suburb', 11,
          'village', 11,
          'neighbourhood', 10,
          10
        ]
      },
      paint: {
        'text-color': '#dbe7ff',
        'text-halo-color': '#111827',
        'text-halo-width': 1
      }
    });
    _osmPlacesFailureBackoffUntil = 0;
  } catch (e) {
    _osmPlacesFailureBackoffUntil = Date.now() + 60000;
    const shouldWarn = (Date.now() - _osmPlacesLastWarnAt) > 30000;
    if (shouldWarn) {
      _osmPlacesLastWarnAt = Date.now();
      console.warn('OSM place labels unavailable:', e.message);
    }
  } finally {
    _osmPlacesAbortController = null;
    _osmPlacesInFlight = false;
  }
}

async function renderProjectsOnMap({ switchMode = true } = {}) {
  if (!_map || !_muniId) return;

  const { data: mits } = await supabase
    .from('mitigations')
    .select('id,hazard_name,description,specific_location,affected_wards,idp_status,cost_estimate,responsible_owner,timeframe')
    .eq('municipality_id', _muniId)
    .eq('is_library', false);

  const features = buildProjectFeatures(mits || []);
  if (_map.getLayer('project-label')) _map.removeLayer('project-label');
  if (_map.getLayer('project-circle')) _map.removeLayer('project-circle');
  if (_map.getSource('project-source')) _map.removeSource('project-source');

  _map.addSource('project-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features }
  });
  _map.addLayer({
    id: 'project-circle',
    type: 'circle',
    source: 'project-source',
    paint: {
      'circle-radius': 7,
      'circle-color': [
        'match', ['get', 'status'],
        'linked-funded', '#3fb950',
        'linked-awaiting', '#d29922',
        'proposed', '#58a6ff',
        'in-progress', '#d29922',
        'completed', '#3fb950',
        '#58a6ff'
      ],
      'circle-stroke-width': 1.4,
      'circle-stroke-color': ['case', ['boolean', ['get', 'linked_idp'], false], '#ffffff', '#0d1117']
    },
    layout: { visibility: 'none' }
  });
  _map.addLayer({
    id: 'project-label',
    type: 'symbol',
    source: 'project-source',
    layout: {
      'text-font': ['Noto Sans Regular'],
      'text-field': ['coalesce', ['get', 'name'], 'Project'],
      'text-size': 9,
      'text-offset': [0, 1.3]
    },
    paint: {
      'text-color': '#e6edf3',
      'text-halo-color': '#0d1117',
      'text-halo-width': 1
    },
    minzoom: 10
  });

  if (!_projectsClickBound) {
    _map.on('click', 'project-circle', e => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      showProjectTooltip(p, e.point?.x, e.point?.y);
    });
    _projectsClickBound = true;
  }

  const legend = document.getElementById('map-legend-bar');
  if (legend) {
    legend.innerHTML = [
      ['#3fb950', 'Linked funded'],
      ['#d29922', 'Linked awaiting / In progress'],
      ['#58a6ff', 'Proposed / Planned'],
      ['#ffffff', 'White ring = IDP linked']
    ].map(([col, label]) =>
      `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text3)"><span style="width:10px;height:10px;border-radius:50%;display:inline-block;background:${col}"></span>${label}</div>`
    ).join('');
  }

  if (switchMode) setMapMode('projects');
}

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
    '<div style="max-height:170px;overflow:auto;padding-right:4px">' +
      (wardHazards.length ? '<div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text3);margin-bottom:5px">Hazards in ward</div>' + hazardRows + extra : noHazards) +
    '</div>';

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


function syncTrendSelector() {
  const sel = document.getElementById('trend-sel');
  if (!sel) return;

  const hazards = _assessmentData?.hazards || [];
  if (!hazards.length) {
    sel.disabled = true;
    sel.innerHTML = '<option value="0">No data</option>';
    _trendSelectedIndex = 0;
    renderTrend(0);
    return;
  }

  sel.disabled = false;
  sel.innerHTML = hazards.slice(0, 25).map((h, idx) =>
    `<option value="${idx}">${h.hazard_name || `Hazard ${idx + 1}`}</option>`
  ).join('');

  const idx = Number.isFinite(_trendSelectedIndex) && _trendSelectedIndex >= 0 && _trendSelectedIndex < hazards.length ? _trendSelectedIndex : 0;
  sel.value = String(idx);
  _trendSelectedIndex = idx;
  renderTrend(idx);
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
      syncTrendSelector();
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

async function renderSheltersOnMap() {
  if (!_map || !_muniId) return;

  const { data: shelters } = await supabase
    .from('shelters')
    .select('name,ward_number,status,current_occupancy,capacity,gps_lat,gps_lng')
      .eq('municipality_id', _muniId);

  const features = (shelters || []).map((s, idx) => {
    const entry = _wardFeatureIndex[parseInt(s.ward_number)];
    const coords = entry
      ? [entry.centroid.cx, entry.centroid.cy]
      : (_mapBounds ? [(_mapBounds.minX + _mapBounds.maxX) / 2, (_mapBounds.minY + _mapBounds.maxY) / 2] : [27.9, -26.1]);
    return {
      type: 'Feature',
      id: idx + 1,
      properties: {
        ...s,
        occ_pct: s.capacity ? Math.round(((s.current_occupancy || 0) / s.capacity) * 100) : 0
      },
            geometry: { type: 'Point', coordinates: coords }
    };
  });

  if (_map.getLayer('shelter-label')) _map.removeLayer('shelter-label');
  if (_map.getLayer('shelter-circle')) _map.removeLayer('shelter-circle');
  if (_map.getSource('shelter-source')) _map.removeSource('shelter-source');

  _map.addSource('shelter-source', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features }
  });

  _map.addLayer({
    id: 'shelter-circle',
    type: 'circle',
    source: 'shelter-source',
    paint: {
      'circle-radius': 7,
      'circle-opacity': 0.95,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.4,
      'circle-color': [
        'match', ['get', 'status'],
        'open', '#3fb950',
        'partial', '#d29922',
        'at-capacity', '#f85149',
        'closed', '#6e7681',
        '#6e7681'
      ]
    }
  });

  _map.addLayer({
    id: 'shelter-label',
    type: 'symbol',
    source: 'shelter-source',
    layout: {
      'text-font': ['Noto Sans Regular'],
      'text-field': ['coalesce', ['get', 'name'], 'Shelter'],
      'text-size': 9,
      'text-offset': [0, 1.3]
    },
    paint: {
      'text-color': '#e6edf3',
      'text-halo-color': '#0d1117',
      'text-halo-width': 1
    }
  });

  if (!_shelterClickBound) {
    _map.on('click', 'shelter-circle', e => {
      const s = e.features?.[0]?.properties;
      if (!s) return;
      const wrap = document.getElementById('map-canvas-wrap');
      const rect = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
      const clickX = e.point?.x ?? (e.originalEvent?.clientX - rect.left);
      const clickY = e.point?.y ?? (e.originalEvent?.clientY - rect.top);
      showShelterTooltip(s, clickX, clickY);
    });
    _shelterClickBound = true;
  }

  const legend = document.getElementById('map-legend-bar');
  if (legend) {
    legend.innerHTML = [
      ['#3fb950','Open'],['#d29922','Partial'],['#f85149','At capacity'],['#6e7681','Closed']
    ].map(([col,lbl]) =>
      '<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text3)">' +
      '<span style="width:10px;height:10px;border-radius:50%;background:'+col+';display:inline-block;flex-shrink:0"></span>'+lbl+'</div>'
    ).join('');
  }

  setMapMode('shelters');
}

function showShelterTooltip(s, clickX, clickY) {
  document.getElementById('ward-tooltip')?.remove();
  const wrap = document.getElementById('map-canvas-wrap');
  if (!wrap) return;

  const pct = s.capacity ? Math.round(((s.current_occupancy||0)/s.capacity)*100) : 0;
  const STATUS_COL = { open:'#3fb950','at-capacity':'#f85149',closed:'#6e7681',partial:'#d29922' };
  const col = STATUS_COL[s.status] || '#6e7681';

  const tooltip = document.createElement('div');
  tooltip.id = 'ward-tooltip';
  tooltip.style.cssText = 'position:absolute;background:var(--bg2);border:1px solid var(--border2);border-left:3px solid '+col+';border-radius:8px;padding:12px 14px;min-width:190px;max-width:240px;box-shadow:0 4px 20px rgba(0,0,0,.45);z-index:100;font-family:Inter,system-ui,sans-serif';

  const wW = wrap.offsetWidth || 900;
  const wH = wrap.offsetHeight || 380;
  tooltip.style.left = Math.min(Math.max(clickX+12, 8), wW-250) + 'px';
  tooltip.style.top  = Math.min(Math.max(clickY-10, 8), wH-180) + 'px';

  tooltip.innerHTML =
    '<div style="display:flex;justify-content:space-between;margin-bottom:8px">' +
      '<div style="font-size:13px;font-weight:700;color:var(--text)">' + s.name + '</div>' +
      '<button id="wtt-close" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px;line-height:1">×</button>' +
    '</div>' +
    '<div style="font-size:11px;color:var(--text3);margin-bottom:6px">Ward ' + (s.ward_number||'?') + '</div>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<div style="flex:1;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden">' +
        '<div style="width:'+pct+'%;height:6px;background:'+col+';border-radius:3px"></div>' +
      '</div>' +
      '<span style="font-size:12px;font-weight:700;color:'+col+'">' + (s.current_occupancy||0) + ' / ' + (s.capacity||0) + '</span>' +
    '</div>' +
    '<div style="font-size:11px;color:var(--text3)">' +
      '<span style="font-weight:700;color:'+col+'">' + (s.status||'unknown').toUpperCase() + '</span>' +
    '</div>';

  wrap.appendChild(tooltip);
  document.getElementById('wtt-close')?.addEventListener('click', e => { e.stopPropagation(); tooltip.remove(); });
  setTimeout(() => {
    document.addEventListener('click', function h(e) { if (!tooltip.contains(e.target)) { tooltip.remove(); document.removeEventListener('click',h); } });
  }, 80);
}

function initDashboardEvents() {
  document.getElementById('assess-sel-top')?.addEventListener('change', e => selectAssessment(e.target.value));
  document.getElementById('assess-map')?.addEventListener('change', e => selectAssessment(e.target.value));
  document.getElementById('trend-sel')?.addEventListener('change', e => {
    _trendSelectedIndex = parseInt(e.target.value, 10) || 0;
    renderTrend(_trendSelectedIndex);
  });

  // Ward search on hazard map — init here so app is loaded and elements are visible
  const mapSearch = document.getElementById('map-ward-search');
  const mapDd     = document.getElementById('map-ward-dd');
  if (mapSearch && mapDd && !mapSearch._searchInited) {
    mapSearch._searchInited = true;
    const selectWard = ward => {
      const wardNum = parseInt(ward, 10);
      if (!Number.isFinite(wardNum)) return;
      zoomToWard(wardNum);
      mapSearch.value = '';
      mapDd.style.display = 'none';
    };
    mapSearch.addEventListener('input', () => {
      const q = mapSearch.value.trim().toLowerCase();
      if (!q) { mapDd.style.display = 'none'; return; }
            const nums = Object.keys(_wardFeatureIndex).map(Number).sort((a, b) => a - b);
      if (!nums.length) {
        mapDd.innerHTML = '<div style="padding:8px 12px;font-size:11px;color:var(--text3)">Map not loaded yet — complete an HVC assessment first</div>';
        mapDd.style.display = 'block';
        return;
      }
      const needle = q.replace(/[^\d]/g, '');
      const matches = nums.filter(w => {
        const wardStr = String(w);
        if (needle) return wardStr.includes(needle);
        return (`ward ${wardStr}`).includes(q) || wardStr.includes(q);
      }).slice(0, 50);
      if (!matches.length) { mapDd.style.display = 'none'; return; }
      mapDd.innerHTML = matches.map(item =>
        `<div data-ward="${item}"
          style="padding:6px 10px;cursor:pointer;border-bottom:1px solid var(--border);font-size:11px;transition:background .1s"
          onmouseenter="this.style.background='var(--bg3)'"
          onmouseleave="this.style.background=''">Ward ${item}</div>`
      ).join('');
      mapDd.style.display = 'block';
      mapDd.style.maxHeight = '220px';
      mapDd.style.overflowY = 'auto';
      mapDd.querySelectorAll('[data-ward]').forEach(item => {
        const handlePick = e => {
          e.preventDefault();
          e.stopPropagation();
          selectWard(item.dataset.ward);
        };
        item.addEventListener('pointerdown', handlePick);
        item.addEventListener('mousedown', handlePick);
        item.addEventListener('click', handlePick);
      });
    });
    mapSearch.addEventListener('blur', () => {
      setTimeout(() => { mapDd.style.display = 'none'; }, 150);
    });
    mapSearch.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const wardNum = parseInt((mapSearch.value || '').replace(/[^\d]/g, ''), 10);
      if (!Number.isFinite(wardNum)) return;
      e.preventDefault();
      selectWard(wardNum);
    });
  }
  document.getElementById('map-add-project')?.addEventListener('click', async () => {
    setMapMode('projects');
    await renderProjectsOnMap({ switchMode: false });
    await startAddProjectMode();
  });
  document.getElementById('map-project-place')?.addEventListener('click', () => {
    const select = document.getElementById('map-project-select');
    const selectedId = String(select?.value || '').trim();
    if (!selectedId) {
      notify('Select an IDP project before placing it on the map.', true);
      return;
    }
    _selectedProjectForPlacement = { id: selectedId };
    _isAddingProjectMarker = true;
    if (_map) _map.getCanvas().style.cursor = 'crosshair';
    const hint = document.getElementById('map-project-hint');
    if (hint) hint.textContent = 'Placement mode active: click anywhere inside a ward.';
    notify('Placement mode active. Click anywhere inside a ward to place this project.');
  });
  document.getElementById('map-project-cancel')?.addEventListener('click', () => {
    hideProjectPlacementForm();
  });
  // Layer toggle — Hazard shows risk colours, Shelters/Projects show other layers
  document.querySelectorAll('.lyr').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.lyr').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      const layer = btn.textContent.trim().toLowerCase();
      if (layer === 'shelters') {
        hideProjectPlacementForm();
        await renderSheltersOnMap();
      } else if (layer === 'projects') {
        hideProjectPlacementForm();
        await renderProjectsOnMap();
      } else {
        hideProjectPlacementForm();
        setMapMode('hazard');
        updateMapLegend();
      }
    });
  });
  document.getElementById('saws-dismiss')?.addEventListener('click', () => {
    document.getElementById('saws-alert-bar')?.remove();
  });
}

async function selectAssessment(id) {
  const { data } = await supabase.from('hvc_hazard_scores').select('*').eq('assessment_id', id).order('risk_rating', { ascending: false });
  if (data) { _assessmentData.hazards = data; renderHazardTable(); syncTrendSelector(); await renderWardMap(_mapMode !== 'hazard'); }
}

function resolveWardPoint(wardNum) {
  const entry = _wardFeatureIndex[parseInt(wardNum)];
  return entry ? [entry.centroid.cx, entry.centroid.cy] : null;
}

function mapCenterPoint() {
  if (_mapBounds) return [(_mapBounds.minX + _mapBounds.maxX) / 2, (_mapBounds.minY + _mapBounds.maxY) / 2];
  return [27.9, -26.1];
}

function showProjectTooltip(p, clickX, clickY) {
  document.getElementById('ward-tooltip')?.remove();
  const wrap = document.getElementById('map-canvas-wrap');
  if (!wrap) return;
  const linked = String(p.linked_idp) === 'true' || p.linked_idp === true;
  const tooltip = document.createElement('div');
  tooltip.id = 'ward-tooltip';
  tooltip.style.cssText = `position:absolute;background:var(--bg2);border:1px solid var(--border2);border-left:3px solid ${linked ? '#ffffff' : '#58a6ff'};border-radius:8px;padding:12px 14px;min-width:230px;max-width:280px;box-shadow:0 4px 20px rgba(0,0,0,.45);z-index:100;font-family:Inter,system-ui,sans-serif`;
  tooltip.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px">
      <div style="font-size:13px;font-weight:700;color:var(--text)">${p.name || 'Project'}</div>
      <button id="wtt-close" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px;line-height:1">×</button>
    </div>
    <div style="font-size:11px;color:var(--text3);line-height:1.6;max-height:180px;overflow:auto;padding-right:4px">
      <div><strong style="color:var(--text2)">Ward:</strong> ${p.ward_number || '—'}</div>
      <div><strong style="color:var(--text2)">Type:</strong> ${p.project_type || '—'}</div>
      <div><strong style="color:var(--text2)">Status:</strong> ${p.status || '—'}</div>
      ${p.owner ? `<div><strong style="color:var(--text2)">Owner:</strong> ${p.owner}</div>` : ''}
      ${p.timeframe ? `<div><strong style="color:var(--text2)">Timeframe:</strong> ${p.timeframe}</div>` : ''}
      ${p.cost_estimate ? `<div><strong style="color:var(--text2)">Cost:</strong> ${p.cost_estimate}</div>` : ''}
      ${p.description ? `<div style="margin-top:6px">${p.description}</div>` : ''}
      <div style="margin-top:6px;color:${linked ? '#e6edf3' : '#58a6ff'}">${linked ? '🔗 IDP linked project' : '📍 Manual project marker'}</div>
    </div>`;
  wrap.appendChild(tooltip);
  const wW = wrap.offsetWidth || 900;
  const wH = wrap.offsetHeight || 380;
  const tipW = tooltip.offsetWidth || 250;
  const tipH = tooltip.offsetHeight || 200;
  const x = Math.min(Math.max((clickX || 20) + 12, 8), wW - tipW - 8);
  const y = Math.min(Math.max((clickY || 20) - 10, 8), wH - tipH - 8);
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  document.getElementById('wtt-close')?.addEventListener('click', e => { e.stopPropagation(); tooltip.remove(); });
}

async function startAddProjectMode() {
  if (!_map) return;
  _isAddingProjectMarker = false;
  _selectedProjectForPlacement = null;
  await populateProjectPlacementOptions();
  showProjectPlacementForm();
}

function showProjectPlacementForm() {
  const wrap = document.getElementById('map-project-form');
  if (wrap) wrap.style.display = 'block';
}

function hideProjectPlacementForm() {
  const wrap = document.getElementById('map-project-form');
  if (wrap) wrap.style.display = 'none';
  _isAddingProjectMarker = false;
  _selectedProjectForPlacement = null;
  if (_map) _map.getCanvas().style.cursor = '';
  const hint = document.getElementById('map-project-hint');
  if (hint) hint.textContent = 'Pick an IDP project, then click anywhere inside a ward.';
}

async function populateProjectPlacementOptions() {
  const sel = document.getElementById('map-project-select');
  const placeBtn = document.getElementById('map-project-place');
  if (!sel) return;
  const { data, error } = await supabase
    .from('mitigations')
    .select('id,hazard_name,idp_status,specific_location')
    .eq('municipality_id', _muniId)
    .eq('is_library', false)
    .order('hazard_name', { ascending: true });
  if (error) {
    notify(`Could not load project options: ${error.message}`, true);
    if (placeBtn) placeBtn.disabled = true;
    return;
  }
  const options = (data || []).map(p => {
    return `<option value="${p.id}">${projectOptionLabel(p)}</option>`;
  }).join('');
  sel.innerHTML = '<option value="">Select IDP project…</option>' + options;
  if (options) {
    sel.value = String(data[0].id);
    if (placeBtn) placeBtn.disabled = false;
  } else if (placeBtn) {
    placeBtn.disabled = true;
  }
}

async function saveProjectMarkerAt(lngLat, wardNumFromClick, mitigationId) {
  const wardNum = parseInt(wardNumFromClick, 10);
  const projectId = String(mitigationId || '').trim();
  if (!projectId || !Number.isFinite(wardNum)) {
    notify('Select a valid project and click inside a ward to place it.', true);
    return;
  }
  const { data: existingRow, error: existingErr } = await supabase
    .from('mitigations')
    .select('specific_location')
    .eq('id', projectId)
    .maybeSingle();
  if (existingErr) {
    notify(`Could not read existing marker locations: ${existingErr.message}`, true);
    return;
  }
  const newEntry = `@map:${lngLat.lat},${lngLat.lng}`;
  const existingText = String(existingRow?.specific_location || '').trim();
  const nextLocation = existingText
    ? `${existingText}\n${newEntry}`
    : newEntry;
  const payload = {
    affected_wards: [wardNum],
    specific_location: nextLocation
  };
  const { error } = await supabase.from('mitigations').update(payload).eq('id', projectId);
  if (error) {
    notify(`Could not save marker to backend: ${error.message}`, true);
    return;
  }
  notify('Project marker saved and shared with your municipality team.');
  await renderProjectsOnMap();
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
