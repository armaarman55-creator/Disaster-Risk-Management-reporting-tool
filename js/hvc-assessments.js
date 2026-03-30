// js/hvc-assessments (1).js — View, edit, delete assessments + all download helpers
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

// ── ASSESSMENT LIST, VIEW, EDIT, DELETE (unchanged) ───────
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

// [ VIEW, EDIT, SAVE, DELETE functions remain exactly the same as before - omitted for brevity ]
// ... (copy all the functions from openAssessment, editAssessment, saveEditedAssessment, deleteAssessment, _collectRows from your previous version)

export async function openAssessment(id, renderHVCPage) { /* unchanged */ }
export async function editAssessment(id, renderHVCPage) { /* unchanged */ }
async function saveEditedAssessment(assessmentId, assessment, renderHVCPage) { /* unchanged */ }
function _collectRows() { /* unchanged */ }
export async function deleteAssessment(id, label, renderHVCPage) { /* unchanged */ }

// ── FIXED & ROBUST XLSX EXPORT ─────────────────────────────
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

  // Assessment Details Sheet
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

  // Group Headers (Row 2)
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
    const cell = ws.getCell(`${g.col}2`);
    cell.value = g.text;
    cell.font = { bold: true };
  });

  // Column Headers (Row 3)
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

  // Write data rows safely
  scores.forEach((s, idx) => {
    const rowNum = 5 + idx;

    // Use direct worksheet.getCell() - more reliable than row.getCell()
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
    const combined = [wardsText, s.notes].filter(Boolean).join(' | ');
    setCell('AF', combined);

    // Apply softer colors
    if (s.risk_band && riskColors[s.risk_band]) {
      ws.getCell(`Z${rowNum}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: riskColors[s.risk_band] }
      };
    }
    if (s.priority_level && priorityColors[s.priority_level]) {
      ws.getCell(`AE${rowNum}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: priorityColors[s.priority_level] }
      };
    }
  });

  // Auto-fit columns
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
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });

  showToast(`✓ Exported ${scores.length} hazards to Excel`);
  return blob;
}

// ── WORD & PDF (unchanged) ───────────────────────────────
export function getHVCDocHTML(scores, assessment, muniName) {
  /* unchanged - keep your existing function */
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

export async function exportAssessmentPDF(id, label) {
  /* unchanged - keep your existing PDF function */
  // ... (your full PDF function here)
}

// Keep any other helper functions you had (emptyState, etc.)
