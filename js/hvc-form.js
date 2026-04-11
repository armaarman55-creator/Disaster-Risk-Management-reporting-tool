// js/hvc-form.js — HVC page rendering, form, scoring, save, auto-save
import { supabase }    from './supabase.js';
import { writeAudit }  from './audit.js';
import {
  showToast, setState,
  _muniId, _user, _wards,
  DESCRIPTORS, HAZARD_CATEGORIES,
  RISK_BAND, BAND_CLS, PRIO_LEVEL, slug, setTxt,
  FIELD_SUBTYPE_ALIASES, descriptorScale,
  _scores, _customHazards, _hvcWardSelections, _hvcPickerInited,
  _draftId, _editingAssessmentId, _autoSaveTimer,
  setDraftId, setEditingAssessmentId, setAutoSaveTimer,
  setCustomHazards, setHvcWardSelections, clearAssessmentState,
  initHvcWardPicker, renderHvcWardTags, recalcHazardWards
} from './hvc-state.js';
import { renderAssessmentList, bindListEvents, openAssessment, editAssessment } from './hvc-assessments.js?v=20260412';

// ── INIT ──────────────────────────────────────────────────
export async function initHVC(user) {
  setState('_user',   user);
  setState('_muniId', user?.municipality_id);

  if (_muniId) {
    const { data: orgsData } = await supabase
      .from('stakeholder_orgs')
      .select('id,name,sector')
      .eq('municipality_id', _muniId)
      .eq('is_active', true)
      .order('name');
    window._hvcStakeholderOrgs = orgsData || [];
  }

  if (_muniId) {
    const { data } = await supabase
      .from('wards')
      .select('ward_number,area_name')
      .eq('municipality_id', _muniId)
      .order('ward_number');
    setState('_wards', data || []);

    if (!_wards.length && _user?.municipalities?.ward_count > 0) {
      const wardCount = _user.municipalities.ward_count;
      const rows = Array.from({ length: wardCount }, (_, i) => ({
        municipality_id: _muniId,
        ward_number: i + 1,
        area_name: null
      }));
      const { data: seeded, error } = await supabase
        .from('wards')
        .insert(rows)
        .select('ward_number,area_name');
      if (!error && seeded) {
        setState('_wards', seeded);
        console.log(`Seeded ${seeded.length} wards for municipality`);
      }
    }
  }

  await renderHVCPage();
}

// ── MAIN PAGE ─────────────────────────────────────────────
export async function renderHVCPage() {
  const page = document.getElementById('page-hvc');
  if (!page) return;

  const { data: assessments } = await supabase
    .from('hvc_assessments')
    .select('id,label,season,year,hazard_count,status,created_at')
    .eq('municipality_id', _muniId)
    .order('created_at', { ascending: false });

  // Restore in-progress draft
  if (_draftId) {
    const draft = (assessments || []).find(a => a.id === _draftId);
    if (draft) {
      page.innerHTML = _pageShell();
      _bindHeaderBtns(true);

      const labelEl = document.getElementById('a-label');
      if (labelEl && draft.label) labelEl.value = draft.label;
      const seasonEl = document.getElementById('a-season');
      if (seasonEl && draft.season) seasonEl.value = draft.season;
      const yearEl = document.getElementById('a-year');
      if (yearEl && draft.year) yearEl.value = draft.year;

      Object.entries(_scores).forEach(([hid, s]) => {
        const cb = document.querySelector(`.hvc-applicable[data-hazard="${hid}"]`);
        if (cb) {
          cb.checked = true;
          const body = document.getElementById(`hbody-${hid}`);
          if (body) body.style.display = 'block';
        }
        const fields = _scoreFieldMap(hid, s);
        Object.entries(fields).forEach(([key, val]) => {
          if (val == null) return;
          const sel = document.querySelector(`[data-key="${key}"]`);
          if (sel) { sel.value = String(val); window.hvcScoreChanged(sel); }
        });
        if (s.wards?.length) {
          _hvcWardSelections[hid] = s.wards;
          _hvcPickerInited.add(hid);
          requestAnimationFrame(() => initHvcWardPicker(hid, s.wards));
        }
      });

      bindFormEvents();
      showToast('✓ Draft restored — your progress is still here.');
      return;
    } else {
      setDraftId(null);
    }
  }

  page.innerHTML = _pageShell();
  _bindHeaderBtns(false);

  const content = document.getElementById('hvc-content');
  if (assessments?.length) {
    content.innerHTML = renderAssessmentList(assessments);
    bindListEvents(renderHVCPage);
  } else {
    content.innerHTML = renderNewForm();
    bindFormEvents();
  }
}

function _pageShell() {
  return `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div style="padding:12px 20px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--text)">HVC Assessment Tool</div>
          <div style="font-size:11px;color:var(--text3);margin-top:1px">Hazard · Vulnerability · Capacity — DMA Act 57 of 2002 · Annexure 3</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" id="hvc-ref-btn">Risk reference</button>
          <button class="btn btn-sm btn-red" id="hvc-new-btn">+ New assessment</button>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto" id="hvc-content">
        ${renderNewForm()}
      </div>
    </div>`;
}

function _bindHeaderBtns(isDraft) {
  document.getElementById('hvc-new-btn')?.addEventListener('click', () => {
    clearAssessmentState();
    document.getElementById('hvc-content').innerHTML = renderNewForm();
    bindFormEvents();
  });
  document.getElementById('hvc-ref-btn')?.addEventListener('click', () => showReferenceModal());
}

// ── NEW ASSESSMENT FORM ───────────────────────────────────
export function renderNewForm() {
  const cats = Object.keys(HAZARD_CATEGORIES);
  return `<div style="padding:22px">
    <div class="panel" style="margin-bottom:16px">
      <div class="ph"><div class="ph-title">Assessment details</div></div>
      <div class="pb">
        <div class="frow">
          <div class="fl"><span class="fl-label">Label</span><input class="fl-input" id="a-label" placeholder="e.g. Summer 2025"/></div>
          <div class="fl"><span class="fl-label">Season</span>
            <select class="fl-sel" id="a-season"><option>Summer</option><option>Autumn</option><option>Winter</option><option>Spring</option><option>Annual</option></select>
          </div>
        </div>
        <div class="frow">
          <div class="fl"><span class="fl-label">Year</span><input class="fl-input" id="a-year" type="number" value="${new Date().getFullYear()}"/></div>
          <div class="fl"><span class="fl-label">Lead assessor</span><input class="fl-input" id="a-lead" placeholder="Full name"/></div>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:2px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:3px;margin-bottom:16px;flex-wrap:wrap" id="hvc-tabs">
      ${cats.map((cat, i) => `
        <div class="hvc-tab ${i === 0 ? 'on' : ''}" data-cat="${cat}"
          style="flex:1;min-width:130px;text-align:center;padding:7px 8px;font-size:11px;font-weight:600;border-radius:5px;cursor:pointer;
          color:${i === 0 ? 'var(--text)' : 'var(--text3)'};background:${i === 0 ? 'var(--bg2)' : 'transparent'};transition:all .15s;white-space:nowrap">
          ${cat}
        </div>`).join('')}
      <div class="hvc-tab" data-cat="__custom__"
        style="flex:1;min-width:100px;text-align:center;padding:7px 8px;font-size:11px;font-weight:600;border-radius:5px;cursor:pointer;color:var(--purple);background:transparent;transition:all .15s;white-space:nowrap">
        + Custom
      </div>
    </div>

    ${cats.map((cat, i) => `
      <div id="tab-${slug(cat)}" style="display:${i === 0 ? 'block' : 'none'}">
        <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);padding:6px 0;border-bottom:1px solid var(--border);margin-bottom:10px">
          ${cat}
        </div>
        ${HAZARD_CATEGORIES[cat].map(h => renderHazardRow(h, cat)).join('')}
      </div>`).join('')}

    <div id="tab----custom--" style="display:none">
      <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--purple);padding:6px 0;border-bottom:1px solid var(--border);margin-bottom:10px">
        Custom hazards
      </div>
      <div id="custom-hazard-list"></div>
      <div class="panel" style="margin-top:12px">
        <div class="ph"><div class="ph-title">Add custom hazard</div></div>
        <div class="pb">
          <div class="frow">
            <div class="fl"><span class="fl-label">Hazard name</span><input class="fl-input" id="custom-h-name" placeholder="e.g. Coastal erosion"/></div>
            <div class="fl"><span class="fl-label">Category</span>
              <select class="fl-sel" id="custom-h-cat">
                ${Object.keys(HAZARD_CATEGORIES).map(c => `<option>${c}</option>`).join('')}
                <option>Other</option>
              </select>
            </div>
          </div>
          <button class="btn btn-sm btn-purple" id="add-custom-hazard-btn" style="border-color:var(--purple);color:var(--purple)">+ Add hazard</button>
        </div>
      </div>
    </div>

    <div style="margin-top:20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" id="save-hvc-btn">Save assessment</button>
      <button class="btn btn-sm" id="preview-matrix-btn">Preview risk matrix</button>
      <span id="hvc-save-msg" style="font-size:12px;color:var(--green);display:none">✓ Saved</span>
    </div>
    <div id="risk-matrix-wrap" style="display:none;margin-top:20px">${renderRiskMatrix()}</div>
  </div>`;
}

// ── HAZARD ROW ────────────────────────────────────────────
export function renderHazardRow(hazard, cat, isCustom = false) {
  const id = slug(hazard);

  const makeSelect = (key, descGroup, extraStyle = '') => {
    const scale = descriptorScale(descGroup, key) || {};
    const opts  = Object.entries(scale).map(([v, d]) =>
      `<option value="${v}">${v} — ${d.label}</option>`
    ).join('');
    return `
      <select class="fl-sel hvc-score" style="font-size:11px;padding:4px 6px${extraStyle}"
        data-hazard="${id}" data-key="${key}" data-desc="${descGroup}"
        onchange="hvcScoreChanged(this)">
        <option value="">— not scored —</option>
        ${opts}
      </select>
      <div class="hvc-hint" id="hint-${id}-${key}" style="font-size:10px;color:var(--text3);margin-top:3px;min-height:14px;line-height:1.4;display:none"></div>`;
  };

  return `
    <div class="panel" style="margin-bottom:8px" id="hrow-${id}">
      <div style="padding:9px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text)">
            <input type="checkbox" class="hvc-applicable" data-hazard="${id}"
              style="width:15px;height:15px;cursor:pointer;accent-color:var(--red)"
              onchange="toggleHazardApplicable('${id}', this.checked)"/>
            ${hazard}
          </label>
          ${isCustom ? `<span class="badge b-purple" style="font-size:9px">CUSTOM</span>` : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="font-size:11px;color:var(--text3)">Risk: <strong id="risk-val-${id}" style="color:var(--text)">—</strong></span>
          <span class="badge b-gray" id="risk-chip-${id}">NOT APPLICABLE</span>
        </div>
      </div>

      <div id="hbody-${id}" style="display:none">
        <div style="padding:10px 14px;border-bottom:1px solid var(--border)">
          <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--blue);margin-bottom:10px">A. HAZARD ANALYSIS</div>
          <div class="frow" style="margin-bottom:10px">
            <div class="fl">
              <span class="fl-label">Affected area</span>
              ${makeSelect(`${id}_aa`, 'affected_area')}
            </div>
            <div class="fl">
              <span class="fl-label">Wards/areas affected</span>
              <div style="position:relative">
                <input id="hvc-ward-search-${id}" class="fl-input"
                  placeholder="Search ward number or area…"
                  autocomplete="off" style="font-size:11px"/>
                <div id="hvc-ward-dd-${id}"
                  style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg2);border:1px solid var(--border2);border-radius:0 0 6px 6px;max-height:140px;overflow-y:auto;z-index:50">
                </div>
              </div>
              <div id="hvc-ward-tags-${id}" style="display:flex;flex-wrap:wrap;gap:3px;margin-top:5px;min-height:20px"></div>
              <button type="button" id="hvc-ward-all-${id}"
                style="margin-top:4px;font-size:10px;color:var(--text3);background:none;border:none;cursor:pointer;padding:0;text-decoration:underline;text-align:left">
                Select all wards
              </button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div class="fl"><span class="fl-label">Probability</span>${makeSelect(`${id}_pb`, 'probability')}</div>
            <div class="fl"><span class="fl-label">Frequency</span>${makeSelect(`${id}_fr`, 'frequency')}</div>
            <div class="fl"><span class="fl-label">Predictability</span>${makeSelect(`${id}_pr`, 'predictability')}</div>
          </div>
          <div style="margin-top:6px;font-size:11px;color:var(--text3)">
            Hazard Score (avg of above): <strong id="hs-${id}" style="color:var(--blue)">—</strong>
          </div>
        </div>

        <div style="padding:10px 14px;border-bottom:1px solid var(--border)">
          <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--amber);margin-bottom:10px">B. VULNERABILITY ASSESSMENT (PESTE)</div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">
            <div class="fl"><span class="fl-label">Political</span>${makeSelect(`${id}_vp`, 'vulnerability')}</div>
            <div class="fl"><span class="fl-label">Economic</span>${makeSelect(`${id}_ve`, 'vulnerability')}</div>
            <div class="fl"><span class="fl-label">Social</span>${makeSelect(`${id}_vs`, 'vulnerability')}</div>
            <div class="fl"><span class="fl-label">Technological</span>${makeSelect(`${id}_vt`, 'vulnerability')}</div>
            <div class="fl"><span class="fl-label">Environmental</span>${makeSelect(`${id}_vn`, 'vulnerability')}</div>
          </div>
          <div style="margin-top:6px;font-size:11px;color:var(--text3)">
            Vulnerability Score (avg): <strong id="vs-${id}" style="color:var(--amber)">—</strong>
          </div>
        </div>

        <div style="padding:10px 14px;border-bottom:1px solid var(--border)">
          <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--green);margin-bottom:10px">C. CAPACITY ASSESSMENT</div>
          <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px">
            <div class="fl"><span class="fl-label">Institutional</span>${makeSelect(`${id}_ci`, 'capacity')}</div>
            <div class="fl"><span class="fl-label">Programme</span>${makeSelect(`${id}_cp`, 'capacity')}</div>
            <div class="fl"><span class="fl-label">Public Participation</span>${makeSelect(`${id}_cq`, 'capacity')}</div>
            <div class="fl"><span class="fl-label">Financial</span>${makeSelect(`${id}_cf`, 'capacity')}</div>
            <div class="fl"><span class="fl-label">People</span>${makeSelect(`${id}_ch`, 'capacity')}</div>
            <div class="fl"><span class="fl-label">Support Networks</span>${makeSelect(`${id}_cs`, 'capacity')}</div>
          </div>
          <div style="margin-top:6px;font-size:11px;color:var(--text3)">
            Capacity Score (avg): <strong id="cs-${id}" style="color:var(--green)">—</strong>
            &nbsp;·&nbsp; Resilience Index (V÷C): <strong id="ri-${id}" style="color:var(--text)">—</strong>
            &nbsp;·&nbsp; <strong>Risk Rating (H×R): <span id="risk-val2-${id}" style="color:var(--red)">—</span></strong>
          </div>
        </div>

        <div style="padding:10px 14px;border-bottom:1px solid var(--border)">
          <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--purple);margin-bottom:10px">D. PRIORITY INDEX</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div class="fl"><span class="fl-label">Importance</span>${makeSelect(`${id}_pi`, 'priority')}</div>
            <div class="fl"><span class="fl-label">Urgency</span>${makeSelect(`${id}_pu`, 'priority')}</div>
            <div class="fl"><span class="fl-label">Growth</span>${makeSelect(`${id}_pg`, 'priority')}</div>
          </div>
          <div style="margin-top:6px;font-size:11px;color:var(--text3)">
            Priority Index (avg): <strong id="pi-${id}" style="color:var(--purple)">—</strong>
            &nbsp;·&nbsp; Level: <strong id="pl-${id}" style="color:var(--purple)">—</strong>
          </div>
        </div>

        <div style="padding:10px 14px">
          <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);margin-bottom:8px">E. ROLE PLAYERS</div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:8px">Select from your stakeholder directory or type a custom organisation name.</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <div class="fl">
              <span class="fl-label">Primary owner</span>
              <input class="fl-input" id="${id}_r1" list="stakeholder-opts" placeholder="Select or type organisation"/>
            </div>
            <div class="fl">
              <span class="fl-label">Secondary owner</span>
              <input class="fl-input" id="${id}_r2" list="stakeholder-opts" placeholder="Select or type organisation"/>
            </div>
            <div class="fl">
              <span class="fl-label">Tertiary owner</span>
              <input class="fl-input" id="${id}_r3" list="stakeholder-opts" placeholder="Select or type organisation"/>
            </div>
          </div>
          <datalist id="stakeholder-opts">
            ${(window._hvcStakeholderOrgs || []).map(o => `<option value="${o.name}"/>`).join('')}
          </datalist>
          <div class="fl" style="margin-top:6px"><span class="fl-label">Notes</span><textarea class="fl-textarea" id="${id}_notes" rows="2" style="min-height:48px"></textarea></div>
        </div>
      </div>
    </div>`;
}

// ── WINDOW CALLBACKS (invoked from inline onchange/onclick) ──
window.toggleHazardApplicable = function(id, checked) {
  const body = document.getElementById(`hbody-${id}`);
  const chip = document.getElementById(`risk-chip-${id}`);
  if (!body) return;
  body.style.display = checked ? 'block' : 'none';
  if (checked) {
    requestAnimationFrame(() => {
      if (!_hvcPickerInited.has(id)) {
        initHvcWardPicker(id, _hvcWardSelections[id] || []);
        _hvcPickerInited.add(id);
      }
    });
  } else {
    if (chip) { chip.textContent = 'NOT APPLICABLE'; chip.className = 'badge b-gray'; }
    document.getElementById(`risk-val-${id}`).textContent = '—';
    delete _scores[id];
    _hvcWardSelections[id] = [];
  }
};

window.hvcScoreChanged = function(sel) {
  const id      = sel.dataset.hazard;
  const key     = sel.dataset.key;
  const descGrp = sel.dataset.desc;
  const val     = sel.value;

  const fieldKey = key.replace(id + '_', '');
  const hintId   = `hint-${id}-${id}_${fieldKey}`;
  const hint     = document.getElementById(hintId);
  const scale    = descriptorScale(descGrp, key);

  if (hint && val && scale?.[val]) {
    hint.textContent = scale[val].desc;
    hint.style.display = 'block';
    hint.style.color = 'var(--text2)';
  } else if (hint) {
    hint.style.display = 'none';
  }

  window.recalcHazard(id);
};

window.recalcHazard = function(id) {
  const g = (suffix) => {
    const el = document.querySelector(`[data-hazard="${id}"][data-key="${id}_${suffix}"]`);
    return el?.value ? parseFloat(el.value) : null;
  };

  const aa = g('aa'), pb = g('pb'), fr = g('fr'), pr = g('pr');
  const hVals  = [aa, pb, fr, pr].filter(v => v !== null);
  const hScore = hVals.length ? hVals.reduce((a, b) => a + b, 0) / hVals.length : null;

  const vp = g('vp'), ve = g('ve'), vs = g('vs'), vt = g('vt'), vn = g('vn');
  const vVals  = [vp, ve, vs, vt, vn].filter(v => v !== null);
  const vScore = vVals.length ? vVals.reduce((a, b) => a + b, 0) / vVals.length : null;

  const ci = g('ci'), cp = g('cp'), cq = g('cq'), cf = g('cf'), ch = g('ch'), cs = g('cs');
  const cVals  = [ci, cp, cq, cf, ch, cs].filter(v => v !== null);
  const cScore = cVals.length ? cVals.reduce((a, b) => a + b, 0) / cVals.length : null;

  const resilience = (vScore !== null && cScore !== null && cScore > 0) ? vScore / cScore : null;
  const riskRating = (hScore !== null && resilience !== null) ? hScore * resilience : null;

  const pi = g('pi'), pu = g('pu'), pg = g('pg');
  const pVals = [pi, pu, pg].filter(v => v !== null);
  const pIdx  = pVals.length ? pVals.reduce((a, b) => a + b, 0) / pVals.length : null;

  const wards = _hvcWardSelections[id] || [];

  _scores[id] = { hScore, vScore, cScore, resilience, riskRating, pIdx,
    aa, pb, fr, pr, vp, ve, vs, vt, vn, ci, cp, cq, cf, ch, cs, pi, pu, pg, wards };

  scheduleAutoSave();

  setTxt(`hs-${id}`,    hScore     !== null ? hScore.toFixed(2)     : '—');
  setTxt(`vs-${id}`,    vScore     !== null ? vScore.toFixed(2)     : '—');
  setTxt(`cs-${id}`,    cScore     !== null ? cScore.toFixed(2)     : '—');
  setTxt(`ri-${id}`,    resilience !== null ? resilience.toFixed(3) : '—');
  setTxt(`pi-${id}`,    pIdx       !== null ? pIdx.toFixed(2)       : '—');
  setTxt(`pl-${id}`,    pIdx       !== null ? PRIO_LEVEL(pIdx)      : '—');

  if (riskRating !== null) {
    const band = RISK_BAND(riskRating);
    setTxt(`risk-val-${id}`,  riskRating.toFixed(2));
    setTxt(`risk-val2-${id}`, riskRating.toFixed(2));
    const chip = document.getElementById(`risk-chip-${id}`);
    if (chip) { chip.textContent = band.toUpperCase(); chip.className = `badge ${BAND_CLS[band]}`; }
  }
};

// ── RISK MATRIX ───────────────────────────────────────────
export function renderRiskMatrix() {
  const rows = [5, 4, 3, 2, 1], cols = [1, 2, 3, 4, 5];
  const colour = (i, l) => { const s = i * l; return s >= 20 ? '#f85149' : s >= 12 ? '#d29922' : s >= 6 ? '#3fb950' : '#58a6ff'; };
  return `<div class="panel"><div class="ph"><div class="ph-title">Risk Matrix — Impact vs Likelihood</div></div>
    <div class="pb" style="overflow-x:auto"><div style="display:inline-block;min-width:400px">
      <div style="display:flex;margin-bottom:4px;margin-left:56px">
        ${cols.map(c => `<div style="width:60px;text-align:center;font-size:10px;color:var(--text3);font-weight:700">Impact ${c}</div>`).join('')}
      </div>
      ${rows.map(r => `
        <div style="display:flex;align-items:center;margin-bottom:2px">
          <div style="width:56px;font-size:10px;color:var(--text3);font-weight:700;text-align:right;padding-right:8px">L${r}</div>
          ${cols.map(c => `<div style="width:60px;height:44px;background:${colour(c, r)};opacity:.25;border-radius:3px;margin:1px;display:flex;align-items:center;justify-content:center;font-size:9px;color:rgba(230,237,243,.8);font-weight:700" id="mc-${r}-${c}"></div>`).join('')}
        </div>`).join('')}
      <div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap">
        ${[['#f85149', 'Extremely High (≥20)'], ['#d29922', 'High (12–19)'], ['#3fb950', 'Tolerable (6–11)'], ['#58a6ff', 'Low/Negligible (<6)']].map(([bg, lbl]) =>
          `<div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:12px;background:${bg};border-radius:2px"></div><span style="font-size:10px;color:var(--text3)">${lbl}</span></div>`
        ).join('')}
      </div>
    </div></div></div>`;
}

// ── REFERENCE MODAL ───────────────────────────────────────
function showReferenceModal() {
  document.getElementById('hvc-ref-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'hvc-ref-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto';
  modal.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-radius:12px;width:100%;max-width:780px;max-height:90vh;overflow-y:auto">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--bg2);z-index:1">
        <div style="font-size:15px;font-weight:800;color:var(--text)">Risk Rating Indicators — Reference</div>
        <button class="btn btn-sm" onclick="document.getElementById('hvc-ref-modal').remove()">✕ Close</button>
      </div>
      <div style="padding:20px">
        ${_renderRefTable('HAZARD ANALYSIS', 'var(--blue)', [
          ['Affected Area',   _descriptorItems('affected_area')],
          ['Probability',     _descriptorItems('probability')],
          ['Frequency',       _descriptorItems('frequency')],
          ['Predictability',  _descriptorItems('predictability')]
        ])}
        ${_renderRefTable('VULNERABILITY (PESTE)', 'var(--amber)', [
          ['Political',    _descriptorItems('vulnerability', 'vp')],
          ['Economic',     _descriptorItems('vulnerability', 've')],
          ['Social',       _descriptorItems('vulnerability', 'vs')],
          ['Technological',_descriptorItems('vulnerability', 'vt')],
          ['Environmental',_descriptorItems('vulnerability', 'vn')]
        ])}
        ${_renderRefTable('CAPACITY ASSESSMENT', 'var(--green)', [
          ['Institutional',       _descriptorItems('capacity', 'ci')],
          ['Programme',           _descriptorItems('capacity', 'cp')],
          ['Public Participation',_descriptorItems('capacity', 'cq')],
          ['Financial',           _descriptorItems('capacity', 'cf')],
          ['People',              _descriptorItems('capacity', 'ch')],
          ['Support Networks',    _descriptorItems('capacity', 'cs')]
        ])}
        ${_renderRefTable('PRIORITY INDEX', 'var(--purple)', [
          ['Importance', _descriptorItems('priority', 'pi')],
          ['Urgency',    _descriptorItems('priority', 'pu')],
          ['Growth',     _descriptorItems('priority', 'pg')]
        ])}
        <div class="panel" style="margin-top:16px">
          <div class="ph"><div class="ph-title">Risk Band Definitions</div></div>
          <div class="pb">
            ${[['Negligible','c-n','≤ 5'],['Low','c-l','5.01 – 10'],['Tolerable','c-t','10.01 – 15'],['High','c-h','15.01 – 20'],['Extremely High','c-xh','> 20']].map(([band, cls, range]) =>
              `<div style="display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px solid rgba(48,54,61,.3)">
                <span class="badge ${cls}" style="width:120px;text-align:center">${band.toUpperCase()}</span>
                <span style="font-size:12px;color:var(--text2)">Risk Rating: ${range}</span>
              </div>`
            ).join('')}
            <div style="margin-top:12px;font-size:12px;color:var(--text3);line-height:1.8">
              <strong style="color:var(--text)">Formula:</strong><br>
              Hazard Score = Average(Affected Area + Probability + Frequency + Predictability)<br>
              Vulnerability Score = Average(Political + Economic + Social + Technological + Environmental)<br>
              Capacity Score = Average(Institutional + Programme + Public Participation + Financial + People + Support Networks)<br>
              Resilience Index = Vulnerability Score ÷ Capacity Score<br>
              <strong style="color:var(--red)">Risk Rating = Hazard Score × Resilience Index</strong>
            </div>
          </div>
        </div>
        ${renderRiskMatrix()}
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function _renderRefTable(title, colour, rows) {
  return `<div class="panel" style="margin-bottom:16px">
    <div class="ph"><div class="ph-title" style="color:${colour}">${title}</div></div>
    <div class="pb">
      ${rows.map(([label, items]) => `
        <div style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:700;color:var(--text2);margin-bottom:6px">${label}</div>
          ${items.map(item => `<div style="font-size:12px;color:var(--text3);padding:3px 0;border-bottom:1px solid rgba(48,54,61,.25)">${item}</div>`).join('')}
        </div>`).join('')}
    </div>
  </div>`;
}

function _descriptorItems(descGroup, fieldKey = '') {
  const scale = descriptorScale(descGroup, fieldKey) || {};
  return Object.entries(scale).map(([v, d]) => `${v} — ${d.label}: ${d.desc}`);
}

// ── BIND FORM EVENTS ──────────────────────────────────────
export function bindFormEvents(saveHandler = saveAssessment) {
  ['a-label', 'a-season', 'a-year', 'a-lead'].forEach(id => {
    document.getElementById(id)?.addEventListener('input',  scheduleAutoSave);
    document.getElementById(id)?.addEventListener('change', scheduleAutoSave);
  });

  document.querySelectorAll('.hvc-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.hvc-tab').forEach(t => {
        t.classList.remove('on'); t.style.background = 'transparent'; t.style.color = 'var(--text3)';
      });
      tab.classList.add('on'); tab.style.background = 'var(--bg2)'; tab.style.color = 'var(--text)';
      const cat      = tab.dataset.cat;
      const targetId = cat === '__custom__' ? 'tab----custom--' : `tab-${slug(cat)}`;
      document.querySelectorAll('[id^="tab-"]').forEach(el => el.style.display = 'none');
      document.getElementById(targetId)?.style.setProperty('display', 'block');
    });
  });

  document.getElementById('add-custom-hazard-btn')?.addEventListener('click', () => {
    const name = document.getElementById('custom-h-name')?.value.trim();
    const cat  = document.getElementById('custom-h-cat')?.value;
    if (!name) { alert('Please enter a hazard name.'); return; }
    if (_customHazards.find(h => h.name === name)) { alert('A hazard with this name already exists.'); return; }
    _customHazards.push({ name, cat });
    const list = document.getElementById('custom-hazard-list');
    if (list) {
      list.insertAdjacentHTML('beforeend', renderHazardRow(name, cat, true));
      const hid = slug(name);
      initHvcWardPicker(hid, []);
    }
    document.getElementById('custom-h-name').value = '';
  });

  requestAnimationFrame(() => {
    document.getElementById('preview-matrix-btn')?.addEventListener('click', () => {
      const wrap = document.getElementById('risk-matrix-wrap');
      if (wrap) wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
    });
  });

  const saveBtn = document.getElementById('save-hvc-btn');
  if (saveBtn) saveBtn.onclick = saveHandler;
}

// ── AUTO-SAVE ─────────────────────────────────────────────
async function autoSaveDraft() {
  if (!_muniId || _editingAssessmentId) return;

  const label = document.getElementById('a-label')?.value.trim() || 'Untitled draft';
  const meta  = {
    municipality_id: _muniId,
    label,
    season:        document.getElementById('a-season')?.value || '',
    year:          parseInt(document.getElementById('a-year')?.value) || new Date().getFullYear(),
    lead_assessor: document.getElementById('a-lead')?.value || '',
    hazard_count:  Object.keys(_scores).length,
    status:        'draft'
  };

  if (_draftId) {
    await supabase.from('hvc_assessments').update(meta).eq('id', _draftId);
  } else {
    const { data } = await supabase.from('hvc_assessments').insert(meta).select().single();
    if (data?.id) {
      setDraftId(data.id);
      console.log('[HVC] Draft created:', _draftId);
    }
  }
}

export function scheduleAutoSave() {
  if (_editingAssessmentId) return;
  clearTimeout(_autoSaveTimer);
  setAutoSaveTimer(setTimeout(() => autoSaveDraft(), 2000));
}

// ── SAVE (new assessment) ─────────────────────────────────
let _assessmentSaving = false;

export async function saveAssessment() {
  if (_assessmentSaving) return;
  const label = document.getElementById('a-label')?.value.trim();
  if (!label) { showToast('Please enter an assessment label.', true); return; }

  _editingAssessmentId = null;
  _assessmentSaving    = true;
  const btn = document.getElementById('save-hvc-btn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  const rows = _collectRows();

  const meta = {
    municipality_id: _muniId,
    label,
    season:        document.getElementById('a-season')?.value,
    year:          parseInt(document.getElementById('a-year')?.value),
    lead_assessor: document.getElementById('a-lead')?.value,
    hazard_count:  rows.length,
    status:        'complete'
  };

  let assessmentId = _draftId;

  if (assessmentId) {
    const { error } = await supabase.from('hvc_assessments').update(meta).eq('id', assessmentId);
    if (error) {
      showToast('Error saving: ' + error.message, true);
      _assessmentSaving = false;
      if (btn) { btn.textContent = 'Save assessment'; btn.disabled = false; }
      return;
    }
  } else {
    const { data, error } = await supabase.from('hvc_assessments').insert(meta).select().single();
    if (error) {
      showToast('Error: ' + error.message, true);
      _assessmentSaving = false;
      if (btn) { btn.textContent = 'Save assessment'; btn.disabled = false; }
      return;
    }
    assessmentId = data.id;
  }

  await supabase.from('hvc_hazard_scores').delete().eq('assessment_id', assessmentId);

  if (rows.length) {
    const { error: scErr } = await supabase
      .from('hvc_hazard_scores')
      .insert(rows.map(r => ({ ...r, assessment_id: assessmentId })));
    if (scErr) {
      showToast('Warning: assessment saved but hazard scores failed — ' + scErr.message, true);
      console.error('hvc_hazard_scores insert error:', scErr);
    }
  }

  setDraftId(null);
  setEditingAssessmentId(null);
  clearTimeout(_autoSaveTimer);

  try {
    await supabase.rpc('update_ward_dominant_risk', { p_municipality_id: _muniId });
  } catch (e) { console.warn('Ward risk update failed:', e.message); }

  await writeAudit(
    'create', 'hvc_assessment', assessmentId,
    `HVC Assessment: ${label} (${rows.length} hazards scored)`,
    null,
    { label, hazard_count: rows.length, status: 'complete' }
  );

  if (btn) { btn.textContent = 'Save assessment'; btn.disabled = false; }
  showToast('✓ Assessment saved! Dashboard will update automatically.');
  setTimeout(async () => {
    await renderHVCPage();
    _assessmentSaving = false;
  }, 1500);
}

// ── ROW BUILDER ───────────────────────────────────────────
function _collectRows() {
  const rows = [];
  Object.entries(HAZARD_CATEGORIES).forEach(([cat, hazards]) => {
    hazards.forEach(hazard => {
      const id = slug(hazard);
      const cb = document.querySelector(`.hvc-applicable[data-hazard="${id}"]`);
      if (!cb?.checked) return;
      const s = _scores[id];
      if (!s || s.riskRating === null || s.riskRating === undefined) return;
      rows.push(buildRow(id, hazard, cat, s));
    });
  });
  _customHazards.forEach(({ name, cat }) => {
    const id = slug(name);
    const cb = document.querySelector(`.hvc-applicable[data-hazard="${id}"]`);
    if (!cb?.checked) return;
    const s = _scores[id];
    if (!s || s.riskRating === null || s.riskRating === undefined) return;
    rows.push(buildRow(id, name, cat, s));
  });
  return rows;
}

export function buildRow(id, hazard, cat, s) {
  return {
    municipality_id:     _muniId,
    hazard_name:         hazard,
    hazard_category:     cat,
    affected_area:       s.aa, probability: s.pb, frequency: s.fr, predictability: s.pr,
    hazard_score:        s.hScore,
    vp: s.vp, ve: s.ve, vs: s.vs, vt: s.vt, vn: s.vn,
    vulnerability_score: s.vScore,
    ci: s.ci, cp: s.cp, cq: s.cq, cf: s.cf, ch: s.ch, cs: s.cs,
    capacity_score:      s.cScore,
    resilience_index:    s.resilience,
    risk_rating:         s.riskRating,
    risk_band:           s.riskRating !== null ? RISK_BAND(s.riskRating) : null,
    importance:          s.pi, urgency: s.pu, growth: s.pg,
    pi_val: s.pi, pu_val: s.pu, pg_val: s.pg,
    priority_index:      s.pIdx,
    priority_level:      s.pIdx !== null ? PRIO_LEVEL(s.pIdx) : null,
    affected_wards:      s.wards || [],
    primary_owner:       document.getElementById(`${id}_r1`)?.value   || null,
    secondary_owner:     document.getElementById(`${id}_r2`)?.value   || null,
    tertiary_owner:      document.getElementById(`${id}_r3`)?.value   || null,
    notes:               document.getElementById(`${id}_notes`)?.value || null
  };
}

// ── SCORE FIELD MAP (used when restoring draft/edit state) ──
function _scoreFieldMap(hid, s) {
  return {
    [`${hid}_aa`]: s.aa, [`${hid}_pb`]: s.pb,
    [`${hid}_fr`]: s.fr, [`${hid}_pr`]: s.pr,
    [`${hid}_vp`]: s.vp, [`${hid}_ve`]: s.ve,
    [`${hid}_vs`]: s.vs, [`${hid}_vt`]: s.vt,
    [`${hid}_vn`]: s.vn, [`${hid}_ci`]: s.ci,
    [`${hid}_cp`]: s.cp, [`${hid}_cq`]: s.cq,
    [`${hid}_cf`]: s.cf, [`${hid}_ch`]: s.ch,
    [`${hid}_cs`]: s.cs, [`${hid}_pi`]: s.pi,
    [`${hid}_pu`]: s.pu, [`${hid}_pg`]: s.pg,
  };
}
