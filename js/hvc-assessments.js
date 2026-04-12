// js/hvc-assessments (1).js — View, edit, delete assessments + all download helpers
import { supabase }              from './supabase.js';
import { writeAudit }            from './audit.js';
import { showDownloadMenu, docHeader } from './download.js';
import { confirmDialog }         from './confirm-dialog.js';
import {
  showToast,
  _muniId, _user, _wards,
  RISK_BAND, BAND_CLS, PRIO_LEVEL, slug, descriptorScale,
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
  document.getElementById('view-edit')?.addEventListener('click', () => editAssessment(id, renderHVCPage));
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
  if (!label) { showToast('Please enter a label.', true); return; }

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
  const ok = await confirmDialog({
    title: `Delete assessment "${label}"?`,
    message: 'This will permanently remove all hazard scores for this assessment.\n\nThis action cannot be undone.',
    confirmText: 'Delete assessment'
  });
  if (!ok) return;

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

// ── FIXED XLSX EXPORT (Robust cell writing + softer colors) ─────────────────────
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

const _ci = (col) => {
  let n = 0;
  for (const c of col.toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64;
  return n;
};

export async function getHVCXLSXBlob(scores, assessment, muniName) {
  await _loadExcelJS();

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'DRMSA';
  wb.created = new Date();

  // Assessment Details
  const wsD = wb.addWorksheet('Assessment Details');
  wsD.getCell('A1').value = 'HVC ASSESSMENT DETAILS';
  wsD.getCell('A1').font = { bold: true, size: 14 };

  const details = [
    ['Municipality', muniName],
    ['Lead Assessor', assessment.lead_assessor || ''],
    ['Season', assessment.season || ''],
    ['Year', assessment.year || new Date().getFullYear()],
    ['Total Hazards', scores.length],
    ['Generated', new Date().toLocaleString('en-ZA')]
  ];

  details.forEach((row, i) => {
    wsD.getCell(`A${i+3}`).value = row[0];
    wsD.getCell(`B${i+3}`).value = row[1];
  });

  // Main HVC Tool Sheet
  const ws = wb.addWorksheet('HVC Tool');
  ws.views = [{ state: 'frozen', ySplit: 4 }];

  ws.getCell('B1').value = 'HAZARD, VULNERABILITY AND CAPACITY ASSESSMENT TOOL';
  ws.getCell('B1').font = { bold: true, size: 14 };

  // Group headers
  const groupHeaders = [
    { col: 'C', text: 'RECOMMENDED ROLE PLAYERS' },
    { col: 'F', text: 'HAZARD ANALYSIS' },
    { col: 'K', text: 'VULNERABILITY ANALYSIS' },
    { col: 'Q', text: 'CAPACITY ANALYSIS' },
    { col: 'Y', text: 'FINAL DISASTER RISK RATING' },
    { col: 'AA', text: 'PRIORITY ANALYSIS' },
    { col: 'AF', text: 'ADDITIONAL INFORMATION' }
  ];

  groupHeaders.forEach(g => {
    ws.getCell(`${g.col}2`).value = g.text;
    ws.getCell(`${g.col}2`).font = { bold: true };
  });

  // Column headers
  const colHeaders = {
    B: 'HAZARD', C: 'PRIMARY', D: 'SECONDARY', E: 'TERTIARY',
    F: 'AFFECTED AREA', G: 'PROBABILITY', H: 'FREQUENCY', I: 'PREDICTABILITY', J: 'HAZARD SCORE',
    K: 'POLITICAL', L: 'ECONOMICAL', M: 'SOCIAL/HUMAN', N: 'TECHNOLOGICAL', O: 'ENVIRONMENTAL', P: 'VULNERABILITY SCORE',
    Q: 'INSTITUTIONAL', R: 'PROGRAMME', S: 'PUBLIC PARTICIPATION', T: 'FINANCIAL', U: 'PEOPLE', V: 'SUPPORT NETWORK', W: 'CAPACITY SCORE',
    X: 'RESILIENCE INDEX', Y: 'RISK RATING', Z: 'RISK PROFILE',
    AA: 'IMPORTANCE', AB: 'URGENCY', AC: 'GROWTH', AD: 'PRIORITY INDEX', AE: 'PRIORITY PROFILE',
    AF: 'WARDS / NOTES'
  };

  Object.entries(colHeaders).forEach(([col, text]) => {
    const cell = ws.getCell(`${col}3`);
    cell.value = text;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3A6B' } };
  });

  // Softer colors
  const riskColors = {
    'Extremely High': 'FFFFE6E6',
    'High': 'FFFFF0E0',
    'Tolerable': 'FFE6F0E6',
    'Low': 'FFE0E8FF',
    'Negligible': 'FFF5F5F5'
  };

  const priorityColors = {
    'HIGH': 'FFFFE6E6',
    'MEDIUM': 'FFFFF0E0',
    'LOW': 'FFF5F5F5'
  };

  // Write data safely using direct getCell
  scores.forEach((s, idx) => {
    const rowNum = 5 + idx;

    const setCell = (col, value) => {
      if (value == null || value === '') return;
      const cell = ws.getCell(`${col}${rowNum}`);
      cell.value = typeof value === 'number' ? Number(value) : String(value).trim();
    };

    setCell('B', s.hazard_name);
    setCell('C', s.primary_owner);
    setCell('D', s.secondary_owner);
    setCell('E', s.tertiary_owner);

    setCell('F', s.affected_area);
    setCell('G', s.probability);
    setCell('H', s.frequency);
    setCell('I', s.predictability);
    setCell('J', s.hazard_score);

    setCell('K', s.vp); setCell('L', s.ve); setCell('M', s.vs);
    setCell('N', s.vt); setCell('O', s.vn);
    setCell('P', s.vulnerability_score);

    setCell('Q', s.ci); setCell('R', s.cp); setCell('S', s.cq);
    setCell('T', s.cf); setCell('U', s.ch); setCell('V', s.cs);
    setCell('W', s.capacity_score);
    setCell('X', s.resilience_index);
    setCell('Y', s.risk_rating);
    setCell('Z', s.risk_band);

    setCell('AA', s.importance);
    setCell('AB', s.urgency);
    setCell('AC', s.growth);
    setCell('AD', s.priority_index);
    setCell('AE', s.priority_level);

    const wardsText = Array.isArray(s.affected_wards) && s.affected_wards.length 
      ? `Wards: ${s.affected_wards.join(', ')}` : '';
    const combined = [wardsText, s.notes || ''].filter(Boolean).join(' | ');
    setCell('AF', combined);

    // Apply colors
    if (s.risk_band && riskColors[s.risk_band]) {
      ws.getCell(`Z${rowNum}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: riskColors[s.risk_band] } };
    }
    if (s.priority_level && priorityColors[s.priority_level]) {
      ws.getCell(`AE${rowNum}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: priorityColors[s.priority_level] } };
    }
  });

  // Auto column widths
  ws.columns.forEach(column => {
    let maxLength = 10;
    column.eachCell({ includeEmpty: true }, cell => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLength) maxLength = len;
    });
    column.width = Math.min(maxLength + 3, 40);
  });

  // Summary
  const lastRow = 5 + scores.length + 2;
  ws.getCell(`B${lastRow}`).value = `Total Hazards: ${scores.length}`;
  ws.getCell(`B${lastRow}`).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  showToast(`✓ Exported ${scores.length} hazards to Excel successfully`);
  return blob;
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
  const [scoresRes, assessRes, muniRes] = await Promise.all([
    supabase.from('hvc_hazard_scores').select('*').eq('assessment_id', id).order('risk_rating', { ascending: false }),
    supabase.from('hvc_assessments').select('*').eq('id', id).single(),
    supabase.from('municipalities').select('logo_main_url,logo_dm_url,logo_display_mode').eq('id', _muniId).single()
  ]);

  const scores     = scoresRes.data || [];
  const assessment = assessRes.data || {};
  const muniName   = _user?.municipalities?.name || 'Municipality';
  const muni       = muniRes.data || {};
  const date       = new Date().toLocaleString('en-ZA', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const BAND_HEX = {
    'Extremely High':'#c0392b', 'High':'#d35400',
    'Tolerable':'#27ae60', 'Low':'#2980b9', 'Negligible':'#7f8c8d'
  };
  const PRIO_HEX = { HIGH:'#c0392b', MEDIUM:'#d35400', LOW:'#27ae60' };

  // ── Logo HTML ──────────────────────────────────────────
  let logoHTML = '';
  const { logo_main_url: logoMain, logo_dm_url: logoDM, logo_display_mode: logoMode } = muni;
  if (logoMode === 'both' && logoMain && logoDM) {
    logoHTML = `<img src="${logoMain}" style="max-height:52px;max-width:180px;object-fit:contain;margin-right:12px"/>
                <img src="${logoDM}"   style="max-height:52px;max-width:160px;object-fit:contain"/>`;
  } else if (logoMode === 'dm' && logoDM) {
    logoHTML = `<img src="${logoDM}"   style="max-height:52px;max-width:180px;object-fit:contain"/>`;
  } else if (logoMain) {
    logoHTML = `<img src="${logoMain}" style="max-height:52px;max-width:180px;object-fit:contain"/>`;
  }

  // ── Helper: risk band badge ────────────────────────────
  const bandBadge = (band) => {
    const c = BAND_HEX[band] || '#7f8c8d';
    return `<span style="background:${c};color:#fff;padding:2px 7px;border-radius:3px;font-size:9px;font-weight:700;white-space:nowrap">${(band||'—').toUpperCase()}</span>`;
  };
  const prioBadge = (lvl) => {
    const c = PRIO_HEX[lvl] || '#7f8c8d';
    return `<span style="background:${c};color:#fff;padding:2px 7px;border-radius:3px;font-size:9px;font-weight:700">${lvl||'—'}</span>`;
  };
  const n = (v, dp=2) => v != null ? Number(v).toFixed(dp) : '—';
  const riskRefLabel = (group, fieldSuffix, score) => {
    if (score == null || Number.isNaN(Number(score))) return '—';
    const scale = descriptorScale(group, `x_${fieldSuffix}`);
    const key = Math.max(1, Math.min(5, Math.round(Number(score))));
    const ref = scale?.[key];
    return ref?.label || '—';
  };
  const scoreWithRef = (group, fieldSuffix, v) => v != null
    ? `${Number(v)} <span class="dim">(${riskRefLabel(group, fieldSuffix, v)})</span>`
    : '—';
  // Backward-compatible alias in case cached modules still call the older helper name.
  const nWithText = (group, fieldSuffix, v, _dp = 2) => scoreWithRef(group, fieldSuffix, v);
  // Backward-compatible alias in case older code paths still call prioWithText.
  const prioWithText = (idx, level) => idx != null
    ? `${n(idx)} <span class="dim">(${riskRefLabel('priority', 'pi', idx)})</span>`
    : (level || '—');

  // ── Table 1: Risk Ranking Summary ─────────────────────
  const summaryRows = scores.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${s.hazard_name || '—'}</strong></td>
      <td class="dim">${s.hazard_category || '—'}</td>
      <td class="num">${n(s.hazard_score)}</td>
      <td class="num">${n(s.vulnerability_score)}</td>
      <td class="num">${n(s.capacity_score)}</td>
      <td class="num">${n(s.resilience_index, 3)}</td>
      <td class="num bold">${n(s.risk_rating)}</td>
      <td>${bandBadge(s.risk_band)}</td>
      <td class="num">${n(s.priority_index)}</td>
      <td>${prioBadge(s.priority_level)}</td>
    </tr>`).join('');

  // ── Table 2: Hazard Analysis Sub-scores ───────────────
  const hazardRows = scores.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${s.hazard_name || '—'}</strong></td>
      <td class="num">${s.affected_area  ?? '—'}</td>
      <td class="num">${s.probability    ?? '—'}</td>
      <td class="num">${s.frequency      ?? '—'}</td>
      <td class="num">${s.predictability ?? '—'}</td>
      <td class="num bold">${n(s.hazard_score)}</td>
    </tr>`).join('');

  // ── Table 3: Vulnerability Sub-scores (PESTE) ─────────
  const vulnRows = scores.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${s.hazard_name || '—'}</strong></td>
      <td class="num">${scoreWithRef('vulnerability', 'vp', s.vp)}</td>
      <td class="num">${scoreWithRef('vulnerability', 've', s.ve)}</td>
      <td class="num">${scoreWithRef('vulnerability', 'vs', s.vs)}</td>
      <td class="num">${scoreWithRef('vulnerability', 'vt', s.vt)}</td>
      <td class="num">${scoreWithRef('vulnerability', 'vn', s.vn)}</td>
      <td class="num bold">${n(s.vulnerability_score)}</td>
    </tr>`).join('');

  // ── Table 4: Capacity Sub-scores ──────────────────────
  const capRows = scores.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${s.hazard_name || '—'}</strong></td>
      <td class="num">${scoreWithRef('capacity', 'ci', s.ci)}</td>
      <td class="num">${scoreWithRef('capacity', 'cp', s.cp)}</td>
      <td class="num">${scoreWithRef('capacity', 'cq', s.cq)}</td>
      <td class="num">${scoreWithRef('capacity', 'cf', s.cf)}</td>
      <td class="num">${scoreWithRef('capacity', 'ch', s.ch)}</td>
      <td class="num">${scoreWithRef('capacity', 'cs', s.cs)}</td>
      <td class="num bold">${n(s.capacity_score)}</td>
      <td class="num">${n(s.resilience_index, 3)}</td>
    </tr>`).join('');

  // ── Table 5: Priority Analysis ─────────────────────────
  const prioRows = scores.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${s.hazard_name || '—'}</strong></td>
      <td>${bandBadge(s.risk_band)}</td>
      <td class="num bold">${n(s.risk_rating)}</td>
      <td class="num">${scoreWithRef('priority', 'pi', s.importance)}</td>
      <td class="num">${scoreWithRef('priority', 'pu', s.urgency)}</td>
      <td class="num">${scoreWithRef('priority', 'pg', s.growth)}</td>
      <td class="num bold">${n(s.priority_index)}</td>
      <td>${prioBadge(s.priority_level)}</td>
      <td class="dim">${Array.isArray(s.affected_wards) && s.affected_wards.length ? s.affected_wards.map(w=>'W'+w).join(', ') : '—'}</td>
      <td class="dim">${[s.primary_owner, s.secondary_owner, s.tertiary_owner].filter(Boolean).join(', ') || '—'}</td>
      <td class="dim">${s.notes || '—'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>HVC Assessment Report — ${label}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:9.5px;color:#1a1a2e;background:#fff;padding:14mm 12mm 18mm;line-height:1.4}
  @page{size:A4 landscape;margin:8mm}

  /* ── Header ── */
  .report-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:3px solid #1a3a6b;margin-bottom:16px}
  .logos{display:flex;align-items:center;gap:10px;margin-bottom:8px}
  .report-title{font-size:20px;font-weight:800;color:#1a3a6b;letter-spacing:-.3px}
  .report-sub{font-size:10px;color:#555;margin-top:3px}
  .report-meta{font-size:8.5px;color:#666;text-align:right;line-height:1.8}

  /* ── Section headings ── */
  .section{margin:22px 0 10px;page-break-inside:avoid}
  .section-title{font-size:12px;font-weight:800;color:#1a3a6b;text-transform:uppercase;letter-spacing:.5px;padding:7px 12px;background:#eef2f7;border-left:5px solid #1a3a6b;margin-bottom:8px}
  .section-sub{font-size:8.5px;color:#666;margin-bottom:8px;padding-left:2px}

  /* ── Tables ── */
  table{width:100%;border-collapse:collapse;font-size:8.2px;margin-bottom:6px}
  thead tr{background:#1a3a6b}
  th{color:#fff;padding:5px 7px;font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;text-align:left;white-space:nowrap}
  td{padding:4px 7px;border-bottom:1px solid #e8ecf0;vertical-align:middle}
  tr:nth-child(even) td{background:#f8fafc}
  .num{text-align:center;font-family:monospace}
  .bold{font-weight:700}
  .dim{color:#555;font-size:7.8px}

  /* ── Formula box ── */
  .formula-box{background:#f0f4ff;border-left:4px solid #1a3a6b;padding:10px 14px;border-radius:0 4px 4px 0;font-size:8.5px;color:#333;margin:10px 0;line-height:2}

  /* ── Risk band legend ── */
  .legend{display:flex;gap:16px;flex-wrap:wrap;margin:10px 0 16px;font-size:8px}
  .legend-item{display:flex;align-items:center;gap:5px}
  .legend-swatch{width:28px;height:12px;border-radius:2px}

  /* ── Footer ── */
  .footer{margin-top:24px;padding-top:10px;border-top:1px solid #ddd;font-size:7.8px;color:#888;text-align:center}

  /* ── Print button ── */
  .print-btn{position:fixed;bottom:24px;right:28px;padding:10px 22px;background:#1a3a6b;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.2)}
  @media print{.print-btn{display:none!important}}
</style>
</head>
<body>

<!-- ── HEADER ─────────────────────────────────────── -->
<div class="report-header">
  <div>
    <div class="logos">${logoHTML}</div>
    <div class="report-title">HVC ASSESSMENT REPORT</div>
    <div class="report-sub">Hazard · Vulnerability · Capacity — DMA Act 57 of 2002 · Annexure 3</div>
  </div>
  <div class="report-meta">
    <strong>${muniName}</strong><br>
    Assessment: ${label}<br>
    Season: ${assessment.season || '—'} ${assessment.year || ''}<br>
    Lead assessor: ${assessment.lead_assessor || '—'}<br>
    Generated: ${date}<br>
    <strong>CONFIDENTIAL</strong>
  </div>
</div>

<!-- ── FORMULA + LEGEND ───────────────────────────── -->
<div class="formula-box">
  <strong>Risk formula:</strong>
  &nbsp; Hazard Score = avg(Affected Area, Probability, Frequency, Predictability)
  &nbsp;·&nbsp; Vulnerability Score = avg(Political, Economic, Social, Technological, Environmental)
  &nbsp;·&nbsp; Capacity Score = avg(Institutional, Programme, Public Participation, Financial, People, Support Networks)
  &nbsp;·&nbsp; Resilience Index = Vulnerability ÷ Capacity
  &nbsp;·&nbsp; <strong>Risk Rating = Hazard Score × Resilience Index</strong>
</div>

<div class="legend">
  ${Object.entries(BAND_HEX).map(([band, col]) =>
    `<div class="legend-item"><div class="legend-swatch" style="background:${col}"></div><span>${band}</span></div>`
  ).join('')}
</div>

<!-- ── SECTION 1: RISK RANKING SUMMARY ───────────── -->
<div class="section">
  <div class="section-title">1 · Risk Ranking Summary</div>
  <div class="section-sub">${scores.length} hazards scored · sorted by risk rating (highest first)</div>
  <table>
    <thead><tr>
      <th>#</th><th>Hazard</th><th>Category</th>
      <th>H.Score</th><th>V.Score</th><th>C.Score</th><th>Resilience</th>
      <th>Risk Rating</th><th>Risk Band</th>
      <th>Priority Idx</th><th>Priority</th>
    </tr></thead>
    <tbody>${summaryRows}</tbody>
  </table>
</div>

<!-- ── SECTION 2: HAZARD ANALYSIS ────────────────── -->
<div class="section">
  <div class="section-title">2 · Hazard Analysis — Individual Scores</div>
  <div class="section-sub">Scores 1 (lowest) – 5 (highest)</div>
  <table>
    <thead><tr>
      <th>#</th><th>Hazard</th>
      <th>Affected Area</th><th>Probability</th><th>Frequency</th><th>Predictability</th>
      <th>Hazard Score</th>
    </tr></thead>
    <tbody>${hazardRows}</tbody>
  </table>
</div>

<!-- ── SECTION 3: VULNERABILITY (PESTE) ──────────── -->
<div class="section">
  <div class="section-title">3 · Vulnerability Assessment (PESTE)</div>
  <div class="section-sub">Scores 1 (Very Low) – 5 (Very High)</div>
  <table>
    <thead><tr>
      <th>#</th><th>Hazard</th>
      <th>Political</th><th>Economic</th><th>Social</th><th>Technological</th><th>Environmental</th>
      <th>Vuln. Score</th>
    </tr></thead>
    <tbody>${vulnRows}</tbody>
  </table>
</div>

<!-- ── SECTION 4: CAPACITY ASSESSMENT ────────────── -->
<div class="section">
  <div class="section-title">4 · Capacity Assessment</div>
  <div class="section-sub">Scores 1 (Very Low) – 5 (Very High)</div>
  <table>
    <thead><tr>
      <th>#</th><th>Hazard</th>
      <th>Institutional</th><th>Programme</th><th>Public Participation</th>
      <th>Financial</th><th>People</th><th>Support Networks</th>
      <th>Cap. Score</th><th>Resilience</th>
    </tr></thead>
    <tbody>${capRows}</tbody>
  </table>
</div>

<!-- ── SECTION 5: PRIORITY ANALYSIS ──────────────── -->
<div class="section">
  <div class="section-title">5 · Priority Analysis, Wards & Role Players</div>
  <div class="section-sub">Priority scores 1 (lowest) – 5 (highest) · Priority Index = avg(Importance, Urgency, Growth)</div>
  <table>
    <thead><tr>
      <th>#</th><th>Hazard</th><th>Risk Band</th><th>Risk Rating</th>
      <th>Importance</th><th>Urgency</th><th>Growth</th>
      <th>Priority Idx</th><th>Priority</th>
      <th>Wards Affected</th><th>Role Players</th><th>Notes</th>
    </tr></thead>
    <tbody>${prioRows}</tbody>
  </table>
</div>

<div class="footer">
  ${muniName} · DRMSA HVC Assessment · DMA Act 57 of 2002 · Annexure 3 · ${date}
</div>

<button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.onload = () => setTimeout(() => w.focus(), 400);
  }
}
