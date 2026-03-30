// js/hvc-state.js — Shared state, constants, descriptors, ward picker
// Imported by hvc-form.js and hvc-assessments.js — never import those here.
import { supabase } from './supabase.js';

// ── TOAST ─────────────────────────────────────────────────
export function showToast(msg, isError = false) {
  document.querySelectorAll('.drmsa-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'drmsa-toast';
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:var(--bg2);border:1px solid ${isError ? 'var(--red)' : 'var(--green)'};color:${isError ? 'var(--red)' : 'var(--green)'};padding:12px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,.35);display:flex;align-items:center;gap:10px;max-width:340px;transition:opacity .3s;font-family:Inter,system-ui,sans-serif`;
  t.innerHTML = `<span style="font-size:16px">${isError ? '✕' : '✓'}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
}

// ── MODULE-LEVEL STATE ────────────────────────────────────
export let _muniId = null;
export let _user   = null;
export let _wards  = [];

export function setState(key, val) {
  if (key === '_muniId') _muniId = val;
  else if (key === '_user')   _user   = val;
  else if (key === '_wards')  _wards  = val;
}

// ── SCORING DESCRIPTORS (from Excel Annexure 3) ──────────
export const DESCRIPTORS = {
  affected_area: {
    1: { label: 'Very small area',    desc: 'Affects only a very small part (roughly 20%) of the local municipality' },
    2: { label: 'Small area',         desc: 'Affects a small part (roughly 40%) of the local municipality' },
    3: { label: 'Just over half',     desc: 'Affects a part (roughly 60%) of the local municipality' },
    4: { label: 'Large area',         desc: 'Affects a large part (roughly 80%) of the local municipality' },
    5: { label: 'Whole municipality', desc: 'Affects the whole local municipality' }
  },

  probability: {
    1: { label: 'Highly improbable',  desc: 'Unlikely' },
    2: { label: 'Slight probability', desc: 'Possible' },
    3: { label: 'Possible',           desc: '50/50 chance' },
    4: { label: 'Very good chance',   desc: 'Likely' },
    5: { label: 'Highly probable',    desc: 'Certain' }
  },

  frequency: {
    1: { label: 'Once every 5+ years', desc: 'Can occur once every 5 years or more' },
    2: { label: 'Annually',            desc: 'Can occur annually' },
    3: { label: 'Seasonally',          desc: 'Can occur seasonally' },
    4: { label: 'Monthly',             desc: 'Can occur monthly' },
    5: { label: 'Weekly',              desc: 'Can occur weekly' }
  },

  predictability: {
    1: { label: 'Predictable',        desc: 'Predictable' },
    2: { label: 'Fairly predictable', desc: 'Fairly predictable' },
    3: { label: '50/50',              desc: '50/50 chance to predict' },
    4: { label: 'Slight chance',      desc: 'Slight chance to predict' },
    5: { label: 'Cannot predict',     desc: 'Cannot predict' }
  },

  vulnerability: {
    political: {
      1: { label: 'Very Low',  desc: 'Stable governance environment — strong leadership and high public trust minimise risk exposure' },
      2: { label: 'Low',       desc: 'Minor political tensions present — governance structures remain functional' },
      3: { label: 'Moderate',  desc: 'Noticeable governance challenges — occasional instability may affect service delivery' },
      4: { label: 'High',      desc: 'Frequent instability or weak governance — protests or coordination failures increase risk' },
      5: { label: 'Very High', desc: 'Severe instability — breakdown in authority and inability to coordinate response' }
    },
    economic: {
      1: { label: 'Very Low',  desc: 'Strong economy — high resilience and low poverty reduce vulnerability' },
      2: { label: 'Low',       desc: 'Generally stable economy — most households can absorb shocks' },
      3: { label: 'Moderate',  desc: 'Mixed conditions — many households have limited financial resilience' },
      4: { label: 'High',      desc: 'Widespread poverty and unemployment increase vulnerability' },
      5: { label: 'Very High', desc: 'Severe economic distress — extreme poverty and lack of livelihoods' }
    },
    social: {
      1: { label: 'Very Low',  desc: 'Strong social cohesion and service access — communities are resilient' },
      2: { label: 'Low',       desc: 'Stable social conditions with minor service gaps' },
      3: { label: 'Moderate',  desc: 'Unequal service access — some marginalised groups' },
      4: { label: 'High',      desc: 'Significant inequality and poor service delivery increase risk' },
      5: { label: 'Very High', desc: 'Severe social vulnerability — lack of basic services and high dependency' }
    },
    environmental: {
      1: { label: 'Very Low',  desc: 'Environment well-managed with minimal degradation' },
      2: { label: 'Low',       desc: 'Minor environmental stress with limited impact' },
      3: { label: 'Moderate',  desc: 'Noticeable degradation contributes to risk exposure' },
      4: { label: 'High',      desc: 'Significant environmental degradation increases hazard impact' },
      5: { label: 'Very High', desc: 'Severe degradation — no natural buffers remain' }
    },
    technological: {
      1: { label: 'Very Low',  desc: 'Robust systems — infrastructure and technology are resilient' },
      2: { label: 'Low',       desc: 'Minor technical vulnerabilities — systems generally reliable' },
      3: { label: 'Moderate',  desc: 'Ageing infrastructure — some systems fail under stress' },
      4: { label: 'High',      desc: 'Frequent failures increase vulnerability' },
      5: { label: 'Very High', desc: 'Critical infrastructure failing — high exposure to technological risk' }
    }
  },

  capacity: {
    institutional: {
      1: { label: 'Very Low',  desc: 'No disaster management structures or plans' },
      2: { label: 'Low',       desc: 'Basic structures exist but poorly coordinated' },
      3: { label: 'Moderate',  desc: 'Functional plans but inconsistent implementation' },
      4: { label: 'High',      desc: 'Well-established frameworks and coordination' },
      5: { label: 'Very High', desc: 'Highly effective governance and integrated systems' }
    },
    technical: {
      1: { label: 'Very Low',  desc: 'No technical systems or expertise' },
      2: { label: 'Low',       desc: 'Limited tools and technical skills' },
      3: { label: 'Moderate',  desc: 'Some systems and trained personnel available' },
      4: { label: 'High',      desc: 'Strong technical systems and reliable data' },
      5: { label: 'Very High', desc: 'Advanced systems with real-time data and modelling' }
    },
    financial: {
      1: { label: 'Very Low',  desc: 'No dedicated funding available' },
      2: { label: 'Low',       desc: 'Limited financial resources' },
      3: { label: 'Moderate',  desc: 'Partial funding available' },
      4: { label: 'High',      desc: 'Adequate funding for most activities' },
      5: { label: 'Very High', desc: 'Strong financial resilience and contingency funding' }
    },
    people: {
      1: { label: 'Very Low',  desc: 'No trained personnel or responders available' },
      2: { label: 'Low',       desc: 'Limited skilled personnel with gaps' },
      3: { label: 'Moderate',  desc: 'Some trained staff and volunteers available' },
      4: { label: 'High',      desc: 'Well-trained personnel with adequate coverage' },
      5: { label: 'Very High', desc: 'Highly skilled workforce with strong surge capacity' }
    },
    infrastructure: {
      1: { label: 'Very Low',  desc: 'Critical infrastructure lacking or non-functional' },
      2: { label: 'Low',       desc: 'Limited and unreliable infrastructure' },
      3: { label: 'Moderate',  desc: 'Basic infrastructure with some gaps' },
      4: { label: 'High',      desc: 'Reliable infrastructure supports response' },
      5: { label: 'Very High', desc: 'Robust and resilient systems' }
    },
    community: {
      1: { label: 'Very Low',  desc: 'No community awareness or preparedness' },
      2: { label: 'Low',       desc: 'Limited awareness and engagement' },
      3: { label: 'Moderate',  desc: 'Some community participation' },
      4: { label: 'High',      desc: 'Active community involvement' },
      5: { label: 'Very High', desc: 'Highly resilient communities' }
    }
  },

  priority: {
    importance: {
      1: { label: 'Very Low',  desc: 'Minimal impact on communities or municipal functions — limited consequence' },
      2: { label: 'Low',       desc: 'Minor impacts — manageable within routine municipal operations' },
      3: { label: 'Moderate',  desc: 'Noticeable impacts — requires planning and departmental coordination' },
      4: { label: 'High',      desc: 'Significant impacts — affects critical services and vulnerable populations' },
      5: { label: 'Very High', desc: 'Severe impacts — threatens lives, infrastructure, and municipal stability' }
    },
    urgency: {
      1: { label: 'Very Low',  desc: 'No immediate action required — long-term monitoring sufficient' },
      2: { label: 'Low',       desc: 'Action can be delayed — address in routine planning cycles' },
      3: { label: 'Moderate',  desc: 'Timely intervention required — include in current planning cycle' },
      4: { label: 'High',      desc: 'Near-term action required — prioritise within departmental plans' },
      5: { label: 'Critical',  desc: 'Immediate action required — urgent intervention and response needed' }
    },
    growth: {
      1: { label: 'Very Low',  desc: 'Risk unlikely to increase — stable or declining trend' },
      2: { label: 'Low',       desc: 'Slow growth — minor increase over time' },
      3: { label: 'Moderate',  desc: 'Gradual increase — risk expected to grow if unmanaged' },
      4: { label: 'High',      desc: 'Rapid growth — risk escalating quickly due to conditions' },
      5: { label: 'Very High', desc: 'Exponential growth — risk increasing rapidly and likely to worsen significantly' }
    }
  }
};

// ── HAZARD CATEGORIES ────────────────────────────────────
export const HAZARD_CATEGORIES = {
  'Hydro-meteorological': ['Floods','Droughts','Hailstorms','Strong Winds','Storm Surges','Extreme Heat','Cold Fronts','Lightning','Tornadoes','Snow/Ice'],
  'Geological':           ['Earthquakes','Sinkholes','Landslides','Soil Erosion'],
  'Biological':           ['Epidemics','Animal Disease','Locusts','Invasive Species','Waterborne Disease'],
  'Fire':                 ['Veld Fires','Structural Fires','Informal Settlement Fires','Industrial Fires','Agricultural Fires'],
  'Technological':        ['Chemical Spills/HAZMAT','Electricity Disruption','Water Supply Disruption','Sewage Failure','Road/Rail Accidents','Dam Failure','Industrial Accidents','Oil Spills','Pipeline Failures','Telecoms Failure','Nuclear/Radiological'],
  'Socio-economic':       ['Civil Unrest','Migration Pressure','Large Gatherings','Food Insecurity','Informal Settlement Hazards','Crime/Violence']
};

// ── SCORING HELPERS ───────────────────────────────────────
export const RISK_BAND  = (r) => r <= 5 ? 'Negligible' : r <= 10 ? 'Low' : r <= 15 ? 'Tolerable' : r <= 20 ? 'High' : 'Extremely High';
export const BAND_CLS   = { 'Negligible': 'c-n', 'Low': 'c-l', 'Tolerable': 'c-t', 'High': 'c-h', 'Extremely High': 'c-xh' };
export const PRIO_LEVEL = (p) => p <= 2 ? 'LOW' : p <= 3.5 ? 'MEDIUM' : 'HIGH';
export const slug       = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '-');
export const setTxt     = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

export const FIELD_SUBTYPE_ALIASES = {
  vulnerability: {
    vp: ['political'],
    ve: ['economic'],
    vs: ['social'],
    vt: ['technological'],
    vn: ['environmental']
  },
  capacity: {
    ci: ['institutional'],
    cp: ['programme', 'program', 'technical'],
    cq: ['public_participation', 'public-participation', 'participation', 'community'],
    cf: ['financial'],
    ch: ['people', 'human_resources'],
    cs: ['support_networks', 'support-networks', 'infrastructure']
  },
  priority: {
    pi: ['importance'],
    pu: ['urgency'],
    pg: ['growth']
  }
};

export function isScoreScale(obj) {
  return !!(obj && typeof obj === 'object' && obj[1]?.label);
}

export function descriptorScale(descGroup, fieldKey = '') {
  const group = DESCRIPTORS?.[descGroup];
  if (!group) return null;
  if (isScoreScale(group)) return group;

  const suffix = String(fieldKey).split('_').pop();
  const aliases = FIELD_SUBTYPE_ALIASES?.[descGroup]?.[suffix] || [];
  for (const a of aliases) {
    if (isScoreScale(group?.[a])) return group[a];
  }
  return Object.values(group).find(isScoreScale) || null;
}

// ── IN-MEMORY ASSESSMENT STATE ────────────────────────────
export const _scores          = {};
export let   _customHazards   = [];
export let   _hvcWardSelections = {};
export const _hvcPickerInited = new Set();
export let   _draftId               = null;
export let   _editingAssessmentId   = null;
export let   _autoSaveTimer         = null;

export function setDraftId(val)             { _draftId = val; }
export function setEditingAssessmentId(val) { _editingAssessmentId = val; }
export function setAutoSaveTimer(val)       { _autoSaveTimer = val; }
export function setCustomHazards(val)       { _customHazards = val; }
export function setHvcWardSelections(val)   { _hvcWardSelections = val; }

export function clearAssessmentState() {
  _draftId             = null;
  _editingAssessmentId = null;
  _customHazards       = [];
  _hvcWardSelections   = {};
  _hvcPickerInited.clear();
  Object.keys(_scores).forEach(k => delete _scores[k]);
}

// ── WARD PICKER ───────────────────────────────────────────
export function initHvcWardPicker(hazardId, existingWards = []) {
  _hvcWardSelections[hazardId] = [...existingWards];
  renderHvcWardTags(hazardId);

  const search   = document.getElementById(`hvc-ward-search-${hazardId}`);
  const dropdown = document.getElementById(`hvc-ward-dd-${hazardId}`);
  if (!search || !dropdown) return;

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { dropdown.style.display = 'none'; return; }

    const matches = _wards.filter(w => {
      const num  = String(w.ward_number);
      const name = (w.area_name || '').toLowerCase();
      return (num.includes(q) || name.includes(q)) &&
             !_hvcWardSelections[hazardId].includes(w.ward_number);
    }).slice(0, 10);

    if (!matches.length) { dropdown.style.display = 'none'; return; }

    dropdown.innerHTML = matches.map(w =>
      `<div data-ward="${w.ward_number}"
        style="padding:6px 10px;cursor:pointer;border-bottom:1px solid var(--border);font-size:11px;transition:background .1s"
        onmouseenter="this.style.background='var(--bg3)'"
        onmouseleave="this.style.background=''"
        >Ward ${w.ward_number}${w.area_name ? ' — ' + w.area_name : ''}</div>`
    ).join('');
    dropdown.style.display = 'block';

    dropdown.querySelectorAll('[data-ward]').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        _hvcWardSelections[hazardId].push(parseInt(item.dataset.ward));
        search.value = '';
        dropdown.style.display = 'none';
        renderHvcWardTags(hazardId);
        recalcHazardWards(hazardId);
      });
    });
  });

  search.addEventListener('blur', () => {
    setTimeout(() => { dropdown.style.display = 'none'; }, 150);
  });

  document.getElementById(`hvc-ward-all-${hazardId}`)?.addEventListener('click', () => {
    _hvcWardSelections[hazardId] = _wards.map(w => w.ward_number);
    search.value = '';
    dropdown.style.display = 'none';
    renderHvcWardTags(hazardId);
    recalcHazardWards(hazardId);
  });

  document.addEventListener('click', function closeDD(e) {
    if (!search.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
      document.removeEventListener('click', closeDD);
    }
  }, { once: true });
}

export function renderHvcWardTags(hazardId) {
  const container = document.getElementById(`hvc-ward-tags-${hazardId}`);
  if (!container) return;
  const selected = _hvcWardSelections[hazardId] || [];

  container.innerHTML = selected.length
    ? selected.map(w => {
        const wd = _wards.find(x => x.ward_number === w);
        return `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--blue-dim);border:1px solid rgba(88,166,255,.25);color:var(--blue);border-radius:10px;padding:2px 7px;font-size:10px;font-weight:600">
          Ward ${w}${wd?.area_name ? ' · ' + wd.area_name : ''}
          <span style="cursor:pointer;opacity:.7;font-size:12px;line-height:1" data-remove="${w}">×</span>
        </span>`;
      }).join('')
    : '<span style="font-size:10px;color:var(--text3);font-style:italic">No wards selected</span>';

  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      _hvcWardSelections[hazardId] = (_hvcWardSelections[hazardId] || []).filter(w => w !== parseInt(btn.dataset.remove));
      renderHvcWardTags(hazardId);
      recalcHazardWards(hazardId);
    });
  });

  recalcHazardWards(hazardId);
}

export function recalcHazardWards(hazardId) {
  if (_scores[hazardId]) {
    _scores[hazardId].wards = _hvcWardSelections[hazardId] || [];
  }
}
