// js/dashboard.js
import { supabase } from './supabase.js';
import { parseMarkerCoords, getWardAtLngLat } from './dashboard-map.js';
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
  'High':'HIGH','Tolerable':'TOLERABLE','Low':'LOW','Negligible':'NEGLIGIBLE'
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

/* ... keep this section exactly as in your current file up to renderWardLayers ... */
