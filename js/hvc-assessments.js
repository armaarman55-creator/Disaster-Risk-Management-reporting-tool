// js/hvc-assessments.js — View, edit, delete assessments + all download helpers
import { supabase }              from './supabase.js';
import { writeAudit }            from './audit.js';
import { showDownloadMenu, docHeader } from './download.js';
import {
  showToast,
  _muniId, _user, _wards,
  RISK_BAND, BAND_CLS, PRIO_LEVEL, slug,
  _scores, _customHazards, _hvcWardSelections, _hvcPickerInited,
  setDraftId, setEditingAssessmentId, clearAssessmentState,
  initHvcWardPicker
} from './hvc-state.js';
import {
  renderNewForm, renderHazardRow, renderRiskMatrix,
  bindFormEvents, buildRow, scheduleAutoSave
} from './hvc-form.js';

// ── ASSESSMENT LIST ───────────────────────────────────────
export function renderAssessmentList(assessments) {
  return `<div style="padding:22px">
    <div class="sec-hdr">
      <div><div class="sec-hdr-title">Assessments</div><div class="sec-hdr-sub">${assessments.length} saved</div></div>
    </div>
    ${assessments.map(a => `
      <div class="rec-card" style="margin-bottom:10px" id="assessment-card-${a.id}">
        <div class="rec-head">
          <div style="flex:1">
            <div class="rec-name">${a.label || (a.season + ' ' + a.year)}</div>
            <div class="rec-meta">
              ${a.created_at ? new Date(a.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
              · ${a.hazard_count || 0} hazards scored
              · ${a.lead_assessor ? 'Lead: ' + a.lead_assessor : ''}
              · ${a.season || ''} ${a.year || ''}
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <span class="badge ${a.status === 'complete' ? 'b-green' : 'b-amber'}">${(a.status || 'draft').toUpperCase()}</span>
            <button class="btn btn-sm" data-open="${a.id}">View</button>
            <button class="btn btn-sm btn-green" data-edit="${a.id}">Edit</button>
            <button class="btn btn-sm" data-download="${a.id}" data-label="${a.label || a.season + ' ' + a.year}">↓ Download</button>
            <button class="btn btn-sm btn-red" data-delete="${a.id}" data-label="${a.label || a.season + ' ' + a.year}">Delete</button>
          </div>
        </div>
      </div>`).join('')}
  </div>`;
}

export function bindListEvents(renderHVCPage) {
  document.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => openAssessment(btn.dataset.open, renderHVCPage));
  });

  document.querySelectorAll('[data-download]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id       = btn.dataset.download;
      const label    = btn.dataset.label;
      const muniName = _user?.municipalities?.name || 'Municipality';
      const [scoresRes, assessRes] = await Promise.all([
        supabase.from('hvc_hazard_scores').select('*').eq('assessment_id', id).order('risk_rating', { ascending: false }),
        supabase.from('hvc_assessments').select('*').eq('id', id).single()
      ]);
      const scores     = scoresRes.data || [];
      const assessment = assessRes.data || {};
      showDownloadMenu(btn, {
        filename:    `HVC-${label.replace(/\s+/g, '-')}-${muniName.replace(/\s+/g, '-')}`,
        getPDF:      () => exportAssessmentPDF(id, label),
        getXLSXBlob: () => getHVCXLSXBlob(scores, assessment, muniName),
        getDocHTML:  () => getHVCDocHTML(scores, assessment, muniName)
      });
    });
  });

  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => editAssessment(btn.dataset.edit, renderHVCPage));
  });

  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteAssessment(btn.dataset.delete, btn.dataset.label, renderHVCPage));
  });
}

// ── VIEW ASSESSMENT ───────────────────────────────────────
export async function openAssessment(id, renderHVCPage) {
  const [scoresRes, assessRes] = await Promise.all([
    supabase.from('hvc_hazard_scores').select('*').eq('assessment_id', id).order('risk_rating', { ascending: false }),
    supabase.from('hvc_assessments').select('*').eq('id', id).single()
  ]);

  const scores     = scoresRes.data || [];
  const assessment = assessRes.data || {};
  const label      = assessment.label || (assessment.season + ' ' + assessment.year) || 'Assessment';

  const content = document.getElementById('hvc-content');
  if (!content) return;

  content.innerHTML = `<div style="padding:22px">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      <button class="btn btn-sm" id="hvc-back">← Back to list</button>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-sm" id="show-matrix">Risk matrix</button>
        <button class="btn btn-sm btn-green" id="view-edit">Edit assessment</button>
        <button class="btn btn-sm" id="view-download-btn">↓ Download</button>
        <button class="btn btn-sm btn-red" id="view-delete">Delete assessment</button>
      </div>
    </div>

    <div class="panel" style="margin-bottom:16px">
      <div class="ph">
        <div>
          <div class="ph-title">${label}</div>
          <div class="ph-sub">${assessment.season || ''} ${assessment.year || ''} · Lead: ${assessment.lead_assessor || '—'} · ${scores.length} hazards scored · ${new Date(assessment.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
        <span class="badge ${assessment.status === 'complete' ? 'b-green' : 'b-amber'}">${(assessment.status || 'draft').toUpperCase()}</span>
      </div>
    </div>

    <div class="sec-hdr">
      <div><div class="sec-hdr-title">Risk ranking</div><div class="sec-hdr-sub">${scores.length} hazards · sorted by risk rating</div></div>
    </div>
    <div class="panel">
      <div class="ph"><div class="ph-title">Risk ranking</div></div>
      <div class="pb" style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="border-bottom:1px solid var(--border)">
            ${['#','Hazard','Category','H.Score','V.Score','C.Score','Resilience','Risk Rating','Band','Priority Idx','Level','Wards affected'].map(h =>
              `<th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text3);white-space:nowrap">${h}</th>`
            ).join('')}
          </tr></thead>
          <tbody>
            ${(scores || []).map((s, i) => `
              <tr style="border-bottom:1px solid rgba(48,54,61,.4)">
                <td style="padding:6px 8px;color:var(--text3)">${i + 1}</td>
                <td style="padding:6px 8px;font-weight:600;color:var(--text)">${s.hazard_name}</td>
                <td style="padding:6px 8px;color:var(--text3)">${s.hazard_category || '—'}</td>
                <td style="padding:6px 8px;font-family:monospace">${s.hazard_score?.toFixed(2) || '—'}</td>
                <td style="padding:6px 8px;font-family:monospace">${s.vulnerability_score?.toFixed(2) || '—'}</td>
                <td style="padding:6px 8px;font-family:monospace">${s.capacity_score?.toFixed(2) || '—'}</td>
                <td style="padding:6px 8px;font-family:monospace">${s.resilience_index?.toFixed(3) || '—'}</td>
                <td style="padding:6px 8px;font-family:monospace;font-weight:700">${s.risk_rating?.toFixed(2) || '—'}</td>
                <td style="padding:6px 8px"><span class="badge ${BAND_CLS[s.risk_band || ''] || 'b-gray'}">${(s.risk_band || '—').toUpperCase()}</span></td>
                <td style="padding:6px 8px;font-family:monospace">${s.priority_index?.toFixed(2) || '—'}</td>
                <td style="padding:6px 8px"><span class="badge ${s.priority_level === 'HIGH' ? 'b-red' : s.priority_level === 'MEDIUM' ? 'b-amber' : 'b-gray'}">${s.priority_level || '—'}</span></td>
                <td style="padding:6px 8px;font-size:11px;color:var(--text3)">${Array.isArray(s.affected_wards) && s.affected_wards.length ? 'Wards: ' + s.affected_wards.join(', ') : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div id="matrix-view" style="margin-top:16px;display:none">${renderRiskMatrix()}</div>
  </div>`;

  document.getElementById('hvc-back')?.addEventListener('click', renderHVCPage);
  document.getElementById('show-matrix')?.addEventListener('click', () => {
    const m = document.getElementById('matrix-view');
    if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('view-edit')?.addEventListener('click',   () => editAssessment(id, renderHVCPage));
  document.getElementById('view-delete')?.addEventListener('click', () => deleteAssessment(id, label, renderHVCPage));
  document.getElementById('view-download-btn')?.addEventListener('click', function() {
    const muniName = _user?.municipalities?.name || 'Municipality';
    showDownloadMenu(this, {
      filename:    `HVC-${label.replace(/\s+/g, '-')}-${muniName.replace(/\s+/g, '-')}`,
      getPDF:      () => exportAssessmentPDF(id, label),
      getXLSXBlob: () => getHVCXLSXBlob(scores, assessment, muniName),
      getDocHTML:  () => getHVCDocHTML(scores, assessment, muniName)
    });
  });
}

// ── EDIT ASSESSMENT ───────────────────────────────────────
export async function editAssessment(id, renderHVCPage) {
  const [scoresRes, assessRes] = await Promise.all([
    supabase.from('hvc_hazard_scores').select('*').eq('assessment_id', id),
    supabase.from('hvc_assessments').select('*').eq('id', id).single()
  ]);

  const scores     = scoresRes.data || [];
  const assessment = assessRes.data || {};

  scores.forEach(s => {
    const hid = slug(s.hazard_name);
    _scores[hid] = {
      hScore: s.hazard_score, vScore: s.vulnerability_score,
      cScore: s.capacity_score, resilience: s.resilience_index,
      riskRating: s.risk_rating, pIdx: s.priority_index,
      aa: s.affected_area, pb: s.probability, fr: s.frequency, pr: s.predictability,
      vp: s.vp, ve: s.ve, vs: s.vs, vt: s.vt, vn: s.vn,
      ci: s.ci, cp: s.cp, cq: s.cq, cf: s.cf, ch: s.ch, cs: s.cs,
      pi: s.importance, pu: s.urgency, pg: s.growth,
      wards: s.affected_wards || []
    };
  });

  setDraftId(null);
  setEditingAssessmentId(id);
  clearTimeout(scheduleAutoSave._timer);

  const content = document.getElementById('hvc-content');
  if (!content) return;

  content.innerHTML = `<div style="padding:22px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-sm" id="hvc-edit-back">← Cancel</button>
      <div style="font-size:14px;font-weight:700;color:var(--text)">
        Editing: ${assessment.label || assessment.season + ' ' + assessment.year}
      </div>
      <span class="badge b-amber">EDIT MODE</span>
    </div>
    ${renderNewForm().replace('<div style="padding:22px">', '<div>')}
  </div>`;

  const labelEl  = document.getElementById('a-label');
  const seasonEl = document.getElementById('a-season');
  const yearEl   = document.getElementById('a-year');
  const leadEl   = document.getElementById('a-lead');
  if (labelEl)  labelEl.value  = assessment.label || '';
  if (seasonEl) seasonEl.value = assessment.season || '';
  if (yearEl)   yearEl.value   = assessment.year   || '';
  if (leadEl)   leadEl.value   = assessment.lead_assessor || '';

  scores.forEach(s => {
    const hid = slug(s.hazard_name);
    const cb  = document.querySelector(`.hvc-applicable[data-hazard="${hid}"]`);
    if (cb) {
      cb.checked = true;
      const body = document.getElementById(`hbody-${hid}`);
      if (body) body.style.display = 'block';
    }

    const fields = {
      [`${hid}_aa`]: s.affected_area, [`${hid}_pb`]: s.probability,
      [`${hid}_fr`]: s.frequency,     [`${hid}_pr`]: s.predictability,
      [`${hid}_vp`]: s.vp,            [`${hid}_ve`]: s.ve,
      [`${hid}_vs`]: s.vs,            [`${hid}_vt`]: s.vt,
      [`${hid}_vn`]: s.vn,            [`${hid}_ci`]: s.ci,
      [`${hid}_cp`]: s.cp,            [`${hid}_cq`]: s.cq,
      [`${hid}_cf`]: s.cf,            [`${hid}_ch`]: s.ch,
      [`${hid}_cs`]: s.cs,            [`${hid}_pi`]: s.importance,
      [`${hid}_pu`]: s.urgency,       [`${hid}_pg`]: s.growth,
    };

    Object.entries(fields).forEach(([key, val]) => {
      if (val == null) return;
      const sel = document.querySelector(`[data-key="${key}"]`);
      if (sel) { sel.value = String(val); window.hvcScoreChanged(sel); }
    });

    const existingWards = Array.isArray(s.affected_wards)
      ? s.affected_wards.map(Number).filter(Boolean) : [];
    _hvcWardSelections[hid] = existingWards;
    _hvcPickerInited.add(hid);
    requestAnimationFrame(() => initHvcWardPicker(hid, existingWards));

    const r1    = document.getElementById(`${hid}_r1`);
    const r2    = document.getElementById(`${hid}_r2`);
    const r3    = document.getElementById(`${hid}_r3`);
    const notes = document.getElementById(`${hid}_notes`);
    if (r1 && s.primary_owner)   r1.value    = s.primary_owner;
    if (r2 && s.secondary_owner) r2.value    = s.secondary_owner;
    if (r3 && s.tertiary_owner)  r3.value    = s.tertiary_owner;
    if (notes && s.notes)        notes.value = s.notes;
  });

  bindFormEvents(() => saveEditedAssessment(id, assessment, renderHVCPage));
  const saveBtn = document.getElementById('save-hvc-btn');
  if (saveBtn) saveBtn.textContent = 'Save changes';

  document.getElementById('hvc-edit-back')?.addEventListener('click', renderHVCPage);
}

async function saveEditedAssessment(assessmentId, assessment, renderHVCPage) {
  const label = document.getElementById('a-label')?.value.trim();
  if (!label) { alert('Please enter a label.'); return; }

  const btn = document.getElementById('save-hvc-btn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  const hazardRows = _collectRows();

  const { error: aErr } = await supabase
    .from('hvc_assessments')
    .update({
      label,
      season:        document.getElementById('a-season')?.value,
      year:          parseInt(document.getElementById('a-year')?.value),
      lead_assessor: document.getElementById('a-lead')?.value,
      hazard_count:  hazardRows.length,
      updated_at:    new Date().toISOString()
    })
    .eq('id', assessmentId);

  if (aErr) {
    showToast('Error updating assessment: ' + aErr.message, true);
    if (btn) { btn.textContent = 'Save changes'; btn.disabled = false; }
    return;
  }

  await supabase.from('hvc_hazard_scores').delete().eq('assessment_id', assessmentId);

  if (hazardRows.length) {
    await supabase.from('hvc_hazard_scores').insert(
      hazardRows.map(r => ({ ...r, assessment_id: assessmentId }))
    );
  }

  try {
    await supabase.rpc('update_ward_dominant_risk', { p_municipality_id: _muniId });
  } catch (e) { console.warn('Ward risk update failed:', e.message); }

  await writeAudit(
    'update', 'hvc_assessment', assessmentId,
    'Updated HVC Assessment: ' + label,
    { label: assessment.label },
    { label, hazard_count: hazardRows.length }
  );

  showToast('✓ Assessment updated successfully!');
  setTimeout(() => renderHVCPage(), 1200);
}

function _collectRows() {
  const rows = [];
  Object.entries(HAZARD_CATEGORIES).forEach(([cat, hazards]) => {
    hazards.forEach(hazard => {
      const hid = slug(hazard);
      const cb  = document.querySelector(`.hvc-applicable[data-hazard="${hid}"]`);
      if (!cb?.checked) return;
      const s = _scores[hid];
      if (!s || s.riskRating === null || s.riskRating === undefined) return;
      rows.push(buildRow(hid, hazard, cat, s));
    });
  });
  // custom hazards
  _customHazards.forEach(({ name, cat }) => {
    const hid = slug(name);
    const cb  = document.querySelector(`.hvc-applicable[data-hazard="${hid}"]`);
    if (!cb?.checked) return;
    const s = _scores[hid];
    if (!s || s.riskRating === null || s.riskRating === undefined) return;
    rows.push(buildRow(hid, name, cat, s));
  });
  return rows;
}

// ── DELETE ASSESSMENT ─────────────────────────────────────
export async function deleteAssessment(id, label, renderHVCPage) {
  if (!confirm(`Delete assessment "${label}"?\n\nThis will permanently remove all hazard scores for this assessment. This cannot be undone.`)) return;

  const { error: scoreErr } = await supabase.from('hvc_hazard_scores').delete().eq('assessment_id', id);
  const { error: assessErr } = await supabase.from('hvc_assessments').delete().eq('id', id);

  if (scoreErr || assessErr) {
    showToast('Error deleting assessment: ' + (scoreErr?.message || assessErr?.message), true);
    return;
  }

  await writeAudit('delete', 'hvc_assessment', id, `Deleted HVC Assessment: ${label}`, { label }, null);
  showToast('✓ Assessment deleted');
  await renderHVCPage();
}

// ── XLSX DOWNLOAD ─────────────────────────────────────────
// ── XLSX DOWNLOAD (ExcelJS) ───────────────────────────────

// Load ExcelJS from CDN (once). ExcelJS correctly round-trips formula cells;
// SheetJS 0.18.x serialises them as plain strings, breaking the IF-chain scoring.
async function _loadExcelJS() {
  if (window.ExcelJS) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load ExcelJS'));
    document.head.appendChild(s);
  });
}

// Lookup table: col letter → array of [score, descriptorText] for rows 6–10
// Row 5 is intentionally blank (score 0 / not applicable).
// Must match the original Annexure 3 template strings character-for-character.
const _LOOKUP_ROWS = {
  F:  [[1,'Affects only a very small part (roughly 20%)'],[2,'Affects a small part (roughly 40%)'],[3,'Affects a part (roughly 60%) '],[4,'Affects a large part (roughly 80%)'],[5,'Affects the whole local municipality']],
  H:  [[1,'Unlikely'],[2,'Possible'],[3,'50/50 Chance'],[4,'Likely'],[5,'Certain']],
  J:  [[1,'Once every 5 years'],[2,'Annually'],[3,'Seasonally'],[4,'Monthly'],[5,'Weekly']],
  L:  [[1,'Predictable'],[2,'Fairly accurate '],[3,'50/50 Chance '],[4,'Slight chance'],[5,'Cannot predict']],
  O:  [[1,'Very stable'],[2,'Limited political instability'],[3,'Slight political instability and conflict'],[4,'Politically unstable'],[5,'Very politically unstable, dysfunctional political structures']],
  Q:  [[1,'Unlikely impact on local economy'],[2,'Slight impact on local economy'],[3,'Parts of the local economy are disrupted'],[4,'Local economy and economic activities are seriously disrupted'],[5,'Local economy and economic activities are severely disrupted']],
  S:  [[1,'Unlikely impact on society'],[2,'Limited injuries  / discomfort  / displacement'],[3,'Multiple injuries / displacement of a small number of the population'],[4,null],[5,null]],
  U:  [[1,'Unlikely impact or disruption to critical systems and services'],[2,'Limited impact or disruption to critical systems and services'],[3,'Moderate impact or disruption to critical systems and services'],[4,'Serious impact or disruption to critical systems and services'],[5,'Severe impact or disruption to critical systems and services']],
  W:  [[1,'Limited impact on environmentally sensitive areas'],[2,'Moderate impact on environmentally sensitive areas'],[3,'Serious impact on environmentally sensitive areas'],[4,'Severe impact on environmentally sensitive areas'],[5,'Significant impact on environmentally sensitive areas']],
  Z:  [[1,'Policies, systems, processes and structures to effectively manage DRR activities largely non-existent or non-functional'],[2,'Limited policies, systems, processes and structures to effectively manage DRR activities'],[3,'Basic policies, systems, processes and structures to effectively manage DRR activities'],[4,'Functional policies, systems, processes and structures to effectively manage DRR activities'],[5,'Comprehensive policies, systems, processes and structures to effectively manage DRR activities']],
  AB: [[1,'No or limited programme capacity'],[2,'Level 1 plan in place '],[3,'Level 2 plan in place '],[4,'Level 3 plan in place'],[5,'Integrated and proactive plans and programmes in place']],
  AD: [[1,'No public participation or interest from public'],[2,'Limited public participation or interest from public'],[3,'Moderate public participation or interest from public'],[4,'Good public participation or interest from public'],[5,'Full public participation or interest from public']],
  AF: [[1,'Limited or no budget allocation, severely limiting access to resources'],[2,'Limited or small budget allocation to support, emphasis on response and recovery activities and resources only'],[3,'Moderate budget allocation, considering both reactive and proactive DRM activities and resource requirements'],[4,'Good budget allocation, with DRR activities and resources being prioritised'],[5,'Budget allocation for the entire DRM spectrum with emphasis on DRR and development activities with adequate provisions']],
  AH: [[1,'Limited or no training conducted, fundamental knowledge base'],[2,'Basic training conducted, informed understanding of the core elements of DRM '],[3,'Training demonstrates detailed knowledge of the main areas of DRM'],[4,'Well-balanced training programme implemented to capacitate all role-players'],[5,'Integrated multi-disciplinary and multi-sector teams are fully trained and demonstrate knowledge of and engagement in DRM']],
  AJ: [[1,'No or limited support, mainly verbal understandings'],[2,'Some agreements in place with internal role-players and external support network'],[3,'Well established agreements between internal role-players and external support network'],[4,'Comprehensive, fully formalised and dynamic support network with signed and executable agreements'],[5,'Comprehensive and dynamic network in place between internal and external role-players,  tested, can be implemented ']],
  AP: [[1,'Not important at all'],[2,'Negligible'],[3,'Important'],[4,'Very important'],[5,'Critically important']],
  AR: [[1,'No immediate action required'],[2,'Some small interventions within the next month'],[3,'Some small interventions within the next week'],[4,'Integrated actions within the next 24 hours'],[5,'Immediate drastic action required']],
  AT: [[1,'Situation will improve quickly '],[2,'Situation will improve slowly'],[3,'Situation will stay the same'],[4,'Situation will deteriorate slowly'],[5,'Situation will definite deteriorate quickly']],
};

// Convert column letter(s) to 1-based index (A=1, Z=26, AA=27, AX=50 …)
const _ci = (col) => { let n = 0; for (const c of col.toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64; return n; };

// Return descriptor text for a given input column and numeric score (1–5).
// For vs scores 4/5 (null in template) fall back to the raw number.
function _desc(col, score) {
  if (score == null) return null;
  const row = (_LOOKUP_ROWS[col] || []).find(([s]) => s === score);
  if (!row) return null;
  return row[1] === null ? String(score) : row[1];
}

// Build an IF-chain formula matching the template logic.
// Lookup rows are at rows 6–10 (score 1–5). Row 5 is blank (score 0/N/A).
// The formula outputs a NUMBER not a string so aggregate AVERAGEs work.
function _ifFormula(inputCol, rowNum) {
  const lookup = _LOOKUP_ROWS[inputCol];
  if (!lookup) return '0';
  let formula = '0';
  for (let i = lookup.length - 1; i >= 0; i--) {
    const score  = i + 1;           // scores 1–5
    const refRow = 6 + i;           // rows 6–10
    formula = `IF(${inputCol}${rowNum}=$${inputCol}$${refRow},${score},${formula})`;
  }
  return formula; // no leading = — caller wraps in { formula: }
}

export async function getHVCXLSXBlob(scores, assessment, muniName) {
  await _loadExcelJS();

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'DRMSA';
  wb.created = new Date();

  // ── Sheet 1: Assessment Details ───────────────────────
  const wsD = wb.addWorksheet('Assessment Details');
  wsD.getCell('A1').value = 'HVC TOOL ASSESSMENT DETAILS';
  [['A2', 'Conducted by:',                    'B2', assessment.lead_assessor || ''],
   ['A3', 'Date Conducted:',                  'B3', String(assessment.year || new Date().getFullYear())],
   ['A4', 'Conducted at: Local Municipality', 'B4', muniName],
   ['A5', 'Season:',                          'B5', assessment.season || ''],
  ].forEach(([la, lv, va, vv]) => {
    wsD.getCell(la).value = lv;
    wsD.getCell(va).value = vv;
  });

  // ── Sheet 2: HVC Tool ────────────────────────────────
  const ws = wb.addWorksheet('HVC Tool');

  // Row 1 — title
  ws.getRow(1).getCell(_ci('B')).value = 'HAZARD, VULNERABILITY AND CAPACITY ASSESSMENT TOOL';

  // Row 3 — column headers
  const headers = {
    B:'HAZARD', C:'PRIMARY', D:'SECONDARY', E:'TERTIARY',
    F:'AFFECTED AREA', H:'PROBABILITY', J:'FREQUENCY', L:'PREDICTABILITY', N:'HAZARD SCORE',
    O:'POLITICAL', Q:'ECONOMICAL', S:'SOCIAL/HUMAN', U:'TECHNOLOGICAL', W:'ENVIRONMENTAL', Y:'VULNERABILITY SCORE',
    Z:'INSTITUTIONAL AND MANAGEMENT CAPACITY', AB:'PROGRAMME CAPACITY', AD:'PUBLIC PARTICIPATION',
    AF:'FINANCIAL CAPACITY', AH:'PEOPLE CAPACITY', AJ:'SUPPORT NETWORK', AL:'CAPACITY SCORE',
    AM:'RESILIENCE INDEX', AN:'RISK RATING', AO:'RISK PROFILE',
    AP:'IMPORTANCE', AR:'URGENCY', AT:'GROWTH', AV:'PRIORITY INDEX', AW:'PRIORITY PROFILE',
    AX:'ADDITIONAL INFORMATION',
  };
  Object.entries(headers).forEach(([col, val]) => { ws.getRow(3).getCell(_ci(col)).value = val; });

  // Rows 6–10 — descriptor lookup rows (score 1=row6, 2=row7, …, 5=row10)
  // Row 5 is intentionally blank (no-score / zero row referenced by IF formula base case)
  Object.entries(_LOOKUP_ROWS).forEach(([col, entries]) => {
    entries.forEach(([, text], i) => {
      if (text !== null) {
        ws.getRow(6 + i).getCell(_ci(col)).value = text;
      }
    });
  });

  // Rows 6–10 — numeric score values in the score cols (right of each input col)
  // These aren't used by the formulas but keep the sheet self-documenting
  const scoreCols = {
    F:'G', H:'I', J:'K', L:'M',
    O:'P', Q:'R', S:'T', U:'V', W:'X',
    Z:'AA', AB:'AC', AD:'AE', AF:'AG', AH:'AI', AJ:'AK',
    AP:'AQ', AR:'AS', AT:'AU'
  };
  Object.values(scoreCols).forEach(scoreCol => {
    for (let score = 1; score <= 5; score++) {
      ws.getRow(5 + score).getCell(_ci(scoreCol)).value = score;
    }
  });

  // Rows 12+ — one data row per hazard
  scores.forEach((s, idx) => {
    const r   = 12 + idx;
    const row = ws.getRow(r);

    // Helper: set plain text/number value
    const sc = (col, val) => {
      if (val != null && val !== '') row.getCell(_ci(col)).value = val;
    };
    // Helper: set formula cell with a numeric 0 result placeholder
    const sf = (col, formula) => {
      row.getCell(_ci(col)).value = { formula, result: 0 };
    };

    // Identity & role players
    sc('B', s.hazard_name     || '');
    sc('C', s.primary_owner   || '');
    sc('D', s.secondary_owner || '');
    sc('E', s.tertiary_owner  || '');

    // Descriptor text into input cols
    sc('F', _desc('F',  s.affected_area));
    sc('H', _desc('H',  s.probability));
    sc('J', _desc('J',  s.frequency));
    sc('L', _desc('L',  s.predictability));
    sc('O', _desc('O',  s.vp));
    sc('Q', _desc('Q',  s.ve));
    sc('S', _desc('S',  s.vs));
    sc('U', _desc('U',  s.vt));
    sc('W', _desc('W',  s.vn));
    sc('Z',  _desc('Z',  s.ci));
    sc('AB', _desc('AB', s.cp));
    sc('AD', _desc('AD', s.cq));
    sc('AF', _desc('AF', s.cf));
    sc('AH', _desc('AH', s.ch));
    sc('AJ', _desc('AJ', s.cs));
    sc('AP', _desc('AP', s.importance));
    sc('AR', _desc('AR', s.urgency));
    sc('AT', _desc('AT', s.growth));

    // IF-chain score formulas in score cols — produce numbers, not strings
    Object.entries(scoreCols).forEach(([inputCol, scoreCol]) => {
      sf(scoreCol, _ifFormula(inputCol, r));
    });

    // Aggregate formulas
    sf('N',  `(G${r}+I${r}+K${r}+M${r})/4`);
    sf('Y',  `(P${r}+R${r}+T${r}+V${r}+X${r})/5`);
    sf('AL', `(AA${r}+AC${r}+AE${r}+AG${r}+AI${r}+AK${r})/6`);
    sf('AM', `Y${r}/AL${r}`);
    sf('AN', `N${r}*Y${r}/AL${r}`);
    row.getCell(_ci('AO')).value = {
      formula: `IF(AND(AN${r}>20,AN${r}<=25),"EXTREMELY HIGH",IF(AND(AN${r}>15,AN${r}<=20),"HIGH",IF(AND(AN${r}>10,AN${r}<=15),"TOLERABLE",IF(AND(AN${r}>5,AN${r}<=10),"LOW",IF(AN${r}<=5,"NEGLIGIBLE",0)))))`,
      result: ''
    };
    sf('AV', `(AQ${r}+AS${r}+AU${r})/3`);
    row.getCell(_ci('AW')).value = {
      formula: `IF(AV${r}>=3.3,"HIGH",IF(AV${r}>=1.6,"MEDIUM",IF(AV${r}>=0,"LOW",0)))`,
      result: ''
    };

    // Wards + notes
    const wardsText = Array.isArray(s.affected_wards) && s.affected_wards.length
      ? 'Wards: ' + s.affected_wards.join(', ') : '';
    const combined = [wardsText, s.notes].filter(Boolean).join(' | ');
    if (combined) sc('AX', combined);

    row.commit();
  });

  // Make HVC Tool the active sheet when the file opens
  wb.views = [{ firstSheet: 1, activeTab: 1 }];

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ── WORD DOWNLOAD ─────────────────────────────────────────
export function getHVCDocHTML(scores, assessment, muniName) {
  const label = assessment.label || `${assessment.season || ''} ${assessment.year || ''}`;
  const rows  = scores.map((s, i) => `
    <tr>
      <td>${i + 1}</td><td><strong>${s.hazard_name}</strong></td><td>${s.hazard_category || '—'}</td>
      <td>${s.hazard_score?.toFixed(2) || '—'}</td><td>${s.vulnerability_score?.toFixed(2) || '—'}</td>
      <td>${s.capacity_score?.toFixed(2) || '—'}</td><td>${s.resilience_index?.toFixed(3) || '—'}</td>
      <td><strong>${s.risk_rating?.toFixed(2) || '—'}</strong></td><td>${s.risk_band || '—'}</td>
      <td>${s.priority_level || '—'}</td>
      <td>${Array.isArray(s.affected_wards) && s.affected_wards.length ? 'Wards ' + s.affected_wards.join(', ') : '—'}</td>
    </tr>`).join('');
  return `${docHeader(`HVC Assessment — ${label}`, muniName, `Lead assessor: ${assessment.lead_assessor || '—'}`)}
  <h2>Risk Ranking — ${scores.length} hazards scored</h2>
  <table>
    <thead><tr><th>#</th><th>Hazard</th><th>Category</th><th>H.Score</th><th>V.Score</th><th>C.Score</th><th>Resilience</th><th>Risk Rating</th><th>Band</th><th>Priority</th><th>Wards</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="meta">Formula: Risk Rating = Hazard Score × (Vulnerability ÷ Capacity) | DMA Act 57 of 2002 · Annexure 3</p>`;
}

// ── PDF EXPORT ────────────────────────────────────────────
export async function exportAssessmentPDF(id, label) {
  const [scoresRes, assessRes] = await Promise.all([
    supabase.from('hvc_hazard_scores').select('*').eq('assessment_id', id).order('risk_rating', { ascending: false }),
    supabase.from('hvc_assessments').select('*').eq('id', id).single()
  ]);

  const scores     = scoresRes.data || [];
  const assessment = assessRes.data || {};
  const muniName   = _user?.municipalities?.name || 'Municipality';

  const BAND_COL_HEX = {
    'Extremely High': '#f85149', 'High': '#d29922',
    'Tolerable': '#3fb950', 'Low': '#58a6ff', 'Negligible': '#6e7681'
  };
  const PRIORITY_BG     = { HIGH: '#f8514922', MEDIUM: '#d2992222', LOW: '#6e768122' };
  const PRIORITY_BORDER = { HIGH: '#f85149',   MEDIUM: '#d29922',   LOW: '#6e7681'   };

  const subRows = scores.map((s, i) => `
    <tr style="border-bottom:1px solid #eee;${i % 2 === 0 ? 'background:#f9f9f9' : ''}">
      <td style="padding:5px 6px;font-weight:700;color:#1a3a6b">${i + 1}</td>
      <td style="padding:5px 6px;font-weight:600">${s.hazard_name || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.affected_area || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.probability || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.frequency || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.predictability || '—'}</td>
      <td style="padding:5px 6px;text-align:center;font-weight:700;color:#1a3a6b">${s.hazard_score?.toFixed(2) || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.vp || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.ve || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.vs || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.vt || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.vn || '—'}</td>
      <td style="padding:5px 6px;text-align:center;font-weight:700;color:#d29922">${s.vulnerability_score?.toFixed(2) || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.ci || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.cp || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.cq || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.cf || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.ch || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.cs || '—'}</td>
      <td style="padding:5px 6px;text-align:center;font-weight:700;color:#3fb950">${s.capacity_score?.toFixed(2) || '—'}</td>
      <td style="padding:5px 6px;text-align:center;font-weight:700">${s.resilience_index?.toFixed(3) || '—'}</td>
    </tr>`).join('');

  const priorityRows = scores.map((s, i) => {
    const pb = PRIORITY_BG[s.priority_level] || '#6e768122';
    const pc = PRIORITY_BORDER[s.priority_level] || '#6e7681';
    const bc = BAND_COL_HEX[s.risk_band] || '#6e7681';
    const wardsText = Array.isArray(s.affected_wards) && s.affected_wards.length
      ? s.affected_wards.map(w => 'W' + w).join(', ') : '—';
    const owners = [s.primary_owner, s.secondary_owner, s.tertiary_owner].filter(Boolean).join(', ') || '—';
    return `
    <tr style="border-bottom:1px solid #eee;${i % 2 === 0 ? 'background:#f9f9f9' : ''}">
      <td style="padding:5px 6px;font-weight:700;color:#1a3a6b">${i + 1}</td>
      <td style="padding:5px 6px;font-weight:600">${s.hazard_name || '—'}</td>
      <td style="padding:5px 6px">
        <span style="background:${bc}22;border:1px solid ${bc}55;color:${bc};padding:2px 6px;border-radius:3px;font-size:10px;font-weight:700;white-space:nowrap">${(s.risk_band || '—').toUpperCase()}</span>
      </td>
      <td style="padding:5px 6px;text-align:center">${s.importance || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.urgency || '—'}</td>
      <td style="padding:5px 6px;text-align:center">${s.growth || '—'}</td>
      <td style="padding:5px 6px;text-align:center;font-weight:700">${s.priority_index?.toFixed(2) || '—'}</td>
      <td style="padding:5px 6px;text-align:center">
        <span style="background:${pb};border:1px solid ${pc}55;color:${pc};padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700">${s.priority_level || '—'}</span>
      </td>
      <td style="padding:5px 6px;font-size:10px;color:#555">${wardsText}</td>
      <td style="padding:5px 6px;font-size:10px;color:#555">${owners}</td>
    </tr>`;
  }).join('');

  const rows = scores.map((s, i) => `
    <tr style="border-bottom:1px solid #eee;${i % 2 === 0 ? 'background:#f9f9f9' : ''}">
      <td style="padding:6px 8px">${i + 1}</td>
      <td style="padding:6px 8px;font-weight:600">${s.hazard_name || '—'}</td>
      <td style="padding:6px 8px;color:#666">${s.hazard_category || '—'}</td>
      <td style="padding:6px 8px;text-align:center">${s.hazard_score?.toFixed(2) || '—'}</td>
      <td style="padding:6px 8px;text-align:center">${s.vulnerability_score?.toFixed(2) || '—'}</td>
      <td style="padding:6px 8px;text-align:center">${s.capacity_score?.toFixed(2) || '—'}</td>
      <td style="padding:6px 8px;text-align:center">${s.resilience_index?.toFixed(3) || '—'}</td>
      <td style="padding:6px 8px;text-align:center;font-weight:700">${s.risk_rating?.toFixed(2) || '—'}</td>
      <td style="padding:6px 8px;text-align:center">
        <span style="background:${BAND_COL_HEX[s.risk_band] || '#6e7681'}22;border:1px solid ${BAND_COL_HEX[s.risk_band] || '#6e7681'}55;
          color:${BAND_COL_HEX[s.risk_band] || '#6e7681'};padding:2px 6px;border-radius:3px;font-size:10px;font-weight:700">
          ${(s.risk_band || '—').toUpperCase()}
        </span>
      </td>
      <td style="padding:6px 8px;text-align:center">${s.priority_index?.toFixed(2) || '—'}</td>
      <td style="padding:6px 8px;text-align:center">
        <span style="font-weight:700;color:${s.priority_level === 'HIGH' ? '#f85149' : s.priority_level === 'MEDIUM' ? '#d29922' : '#6e7681'}">
          ${s.priority_level || '—'}
        </span>
      </td>
      <td style="padding:6px 8px;color:#666;font-size:11px">${Array.isArray(s.affected_wards) && s.affected_wards.length ? 'Wards ' + s.affected_wards.join(', ') : '—'}</td>
      <td style="padding:6px 8px;color:#666;font-size:11px">${[s.primary_owner, s.secondary_owner, s.tertiary_owner].filter(Boolean).join(', ') || '—'}</td>
    </tr>`).join('');

  const html = `
    <html><head><title>HVC Assessment — ${label}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#0d1117;padding:24px;margin:0}
      h1{font-size:20px;color:#0d1117;margin:0 0 4px}
      h2{font-size:14px;color:#1a3a6b;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #1a3a6b}
      .meta{font-size:11px;color:#666;margin-bottom:4px}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:20px}
      th{background:#1a3a6b;color:#fff;padding:7px 8px;text-align:left;font-size:10px;white-space:nowrap}
      td{vertical-align:middle}
      .formula{background:#f0f4ff;border-left:3px solid #1a3a6b;padding:10px 14px;font-size:11px;color:#333;margin:12px 0;border-radius:0 4px 4px 0;line-height:1.8}
      .footer{margin-top:30px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#999}
    </style></head><body>

    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px">
      <div>
        <h1>HVC Assessment Report</h1>
        <div class="meta"><strong>${muniName}</strong></div>
        <div class="meta">Assessment: <strong>${label}</strong></div>
        <div class="meta">${assessment.season || ''} ${assessment.year || ''} · Lead assessor: ${assessment.lead_assessor || '—'}</div>
        <div class="meta">Generated: ${new Date().toLocaleString('en-ZA')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:700;color:#1a3a6b">DRMSA</div>
        <div style="font-size:10px;color:#999">Disaster Risk Management Reporting Platform</div>
        <div style="font-size:10px;color:#999">DMA Act 57 of 2002 — Annexure 3</div>
      </div>
    </div>

    <div class="formula">
      <strong>Risk formula:</strong>
      Hazard Score = avg(Affected Area + Probability + Frequency + Predictability) ·
      Resilience = Vulnerability ÷ Capacity ·
      <strong>Risk Rating = Hazard Score × Resilience</strong>
    </div>

    <h2>Risk ranking — ${scores.length} hazards scored</h2>
    <table>
      <thead><tr>
        <th>#</th><th>Hazard</th><th>Category</th>
        <th>H.Score</th><th>V.Score</th><th>C.Score</th><th>Resilience</th>
        <th>Risk Rating</th><th>Band</th><th>Priority Idx</th><th>Priority</th>
        <th>Wards affected</th><th>Role players</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <h2>Sub-score breakdown — all scoring dimensions</h2>
    <table>
      <thead><tr>
        <th>#</th><th>Hazard</th>
        <th title="Affected Area">Aff.Area</th><th title="Probability">Prob</th>
        <th title="Frequency">Freq</th><th title="Predictability">Pred</th>
        <th>H.Score</th>
        <th title="Political">Pol</th><th title="Economic">Econ</th>
        <th title="Social">Soc</th><th title="Technological">Tech</th><th title="Environmental">Env</th>
        <th>V.Score</th>
        <th title="Institutional">Inst</th><th title="Programme">Prog</th>
        <th title="Public Participation">PubP</th><th title="Financial">Fin</th>
        <th title="Human Resources">HR</th><th title="Support Networks">Supp</th>
        <th>C.Score</th><th>Resilience</th>
      </tr></thead>
      <tbody>${subRows}</tbody>
    </table>

    <h2>Priority analysis</h2>
    <table>
      <thead><tr>
        <th>#</th><th>Hazard</th><th>Risk Band</th>
        <th>Importance</th><th>Urgency</th><th>Growth</th>
        <th>Priority Index</th><th>Priority Level</th>
        <th>Wards Affected</th><th>Role Players</th>
      </tr></thead>
      <tbody>${priorityRows}</tbody>
    </table>

    <div class="footer">
      ${muniName} · DRMSA HVC Assessment · Apache 2.0 Open Source ·
      HVC framework: South African DMA Act 57 of 2002 ·
      Created by Diswayne Maarman
    </div>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
    showToast('✓ PDF print dialog opened');
  }
}
