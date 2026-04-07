import { addSection, createPlan, generateFromSeed, getPlan, listPlans, setPlan, updateSection } from './contingency-dist/plan-engine.js';
import { loadSeed } from './contingency-dist/seed-loader.js';
import { saveVersionSnapshot, submitForReview, approvePlan } from './contingency-dist/versioning.js';
import { createAnnexureFromTemplate, attachAnnexureToPlan } from './contingency-dist/annexure-engine.js';
import {
  getAllPlanTypes,
  getPlanTypeByCode,
  getPlanTypesByCategory
} from './contingency-plan-type-registry.js';
import { fetchPlansFromBackend, savePlanToBackend } from './contingency-repo.js';
import { buildLibrarySections } from './contingency-section-library.js';
import { showDownloadMenu, docHeader } from './download.js';
import { supabase } from './supabase.js';
import { initAssistantPanel, destroyAssistantPanel } from './contingency-assistant-panel.js';

let _activePlanId = null;
let _activeCategory = '';
let _filteredPlanTypes = [];
let _context = null;
let _autoSaveTimer = null;
let _menuCollapsed = false;
let _splitView = false;

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function richBlockHtml(content) {
  const raw = String(content ?? '');
  if (!raw.trim()) return '';
  if (raw.includes('<') && raw.includes('>')) return raw;
  return esc(raw).replace(/\n/g, '<br/>');
}

function textFromHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hvcSectionsAsList(plan) {
  return (plan.sections || [])
    .filter(s => s.key === 'hvc_placeholders' || s.key === 'environmental_health_safety')
    .map(s => `• ${s.title}`)
    .join('\n');
}

function contingencyDocHtml(plan) {
  const meta = plan?.metadata || {};
  const docEsc = v => esc(String(v ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  const secHtml = (plan.sections || [])
    .sort((a, b) => a.order - b.order)
    .map(s => {
      const blockHtml = (s.content_blocks || [])
        .map(b => {
          if (b.type === 'table') {
            const headers = Array.isArray(b.content?.headers) ? b.content.headers : [];
            const rows = Array.isArray(b.content?.rows) ? b.content.rows : [];
            return `<table><thead><tr>${headers.map(h => `<th>${docEsc(h)}</th>`).join('')}</tr></thead><tbody>${
              rows.length
                ? rows.map(r => `<tr>${(Array.isArray(r) ? r : []).map(c => `<td>${docEsc(c)}</td>`).join('')}</tr>`).join('')
                : `<tr><td colspan="${headers.length || 1}" style="color:#999;font-style:italic">No entries yet</td></tr>`
            }</tbody></table>`;
          }
          if (b.type === 'list') {
            const items = Array.isArray(b.content) ? b.content : [];
            return `<ul>${items.map(i => `<li>${docEsc(i)}</li>`).join('')}</ul>`;
          }
          return `<div>${richBlockHtml(b.content)}</div>`;
        })
        .join('');
      return `<h2>${docEsc(s.title)}</h2>${blockHtml}`;
    })
    .join('');

  return `${docHeader(`Contingency Plan — ${meta.title || 'Plan'}`, meta.municipality_name || 'Municipality')}
    <div class="meta">Category: ${docEsc(meta.plan_category || '—')} · Type: ${docEsc(meta.plan_type || '—')} · Status: ${docEsc(plan.status || 'draft')}</div>
    ${hvcSectionsAsList(plan) ? `<p><strong>HVC/Environmental enrichments</strong><br/>${esc(hvcSectionsAsList(plan)).replace(/\n/g, '<br/>')}</p>` : ''}
    ${secHtml}`;
}

async function fetchHvcPlacementBlocks() {
  if (!_context?.municipalityId) return [];
  const { data: assessment, error: assessmentErr } = await supabase
    .from('hvc_assessments')
    .select('id,created_at')
    .eq('municipality_id', _context.municipalityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (assessmentErr || !assessment?.id) return [];

  const { data, error } = await supabase
    .from('hvc_hazard_scores')
    .select('hazard_name,risk_band,risk_rating,affected_wards')
    .eq('assessment_id', assessment.id)
    .order('risk_rating', { ascending: false })
    .limit(5);
  if (error || !data?.length) return [];

  return [
    {
      id: 'hvc_summary_1',
      type: 'table',
      content: {
        headers: ['Assessment Date', 'Hazard', 'Risk Band', 'Risk Rating', 'Affected Wards'],
        rows: data.map(h => [
          new Date(assessment.created_at).toLocaleDateString('en-ZA'),
          h.hazard_name || '—',
          h.risk_band || '—',
          h.risk_rating ?? '—',
          Array.isArray(h.affected_wards) && h.affected_wards.length ? h.affected_wards.join(', ') : '—'
        ])
      }
    }
  ];
}

function scheduleAutoSave(planId) {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => {
    persistPlan(planId);
  }, 900);
}

function showContingencyExportMenu(anchorBtn, plan) {
  showDownloadMenu(anchorBtn, {
    filename: `contingency-plan-${plan.id}`,
    getDocHTML: () => contingencyDocHtml(plan),
    dropup: true
  });
}

function stripLegacySuggestionArtifacts(plan) {
  if (!plan || !Array.isArray(plan.sections)) return plan;
  const cleaned = {
    ...plan,
    sections: plan.sections
      .filter(s => s?.key !== 'cp-suggestion-panel')
      .map(s => ({
        ...s,
        title: String(s.title || '').replace(/suggestion library\s*\(idp-style\)/gi, '').trim() || s.title,
        content_blocks: (s.content_blocks || []).map(b => ({
          ...b,
          content:
            typeof b.content === 'string'
              ? b.content
                  .replace(/loading contextual suggestions\.\.\./gi, '')
                  .replace(/suggestion library\s*\(idp-style\)/gi, '')
                  .trim()
              : b.content
        }))
      }))
  };
  return cleaned;
}

function purgeLegacySuggestionNodes(root) {
  if (!root) return;
  root.querySelectorAll('*').forEach(node => {
    const txt = (node.textContent || '').toLowerCase().trim();
    if (!txt) return;
    if (txt === 'loading contextual suggestions...' || txt === 'suggestion library (idp-style)') {
      node.remove();
    }
  });
}

function applyLayoutState() {
  const layout = document.getElementById('cp-layout');
  const toggleMenu = document.getElementById('cp-toggle-menu');
  const toggleSplit = document.getElementById('cp-toggle-split');
  const sidebar = document.getElementById('cp-sidebar');
  if (!layout) return;
  layout.classList.toggle('generate-collapsed', !!_menuCollapsed);
  layout.classList.toggle('split-view', !!_splitView);
  if (sidebar) sidebar.classList.toggle('cp-generate-collapsed', !!_menuCollapsed);
  if (toggleMenu) toggleMenu.textContent = _menuCollapsed ? 'Expand generate' : 'Collapse generate';
  if (toggleSplit) toggleSplit.textContent = _splitView ? 'Single view' : 'Split view';
}

function planPreviewHtml(plan) {
  return (plan.sections || [])
    .sort((a, b) => a.order - b.order)
    .map(
      s => `<div class="cp-preview-section">
        <div class="cp-preview-title">${esc(s.title)}</div>
        ${(s.content_blocks || [])
          .map(b => {
            if (b.type === 'list') {
              const items = Array.isArray(b.content) ? b.content : [];
              return `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
            }
            if (b.type === 'table') {
              const headers = Array.isArray(b.content?.headers) ? b.content.headers : [];
              return `<div class="cp-preview-table">${esc(headers.join(' | '))}</div>`;
            }
            return `<p>${richBlockHtml(b.content)}</p>`;
          })
          .join('')}
      </div>`
    )
    .join('');
}

export function getCurrentPlanningContext(user) {
  const profile = user?.profile || user?.profiles || {};
  const metadata = user?.user_metadata || user?.raw_user_meta_data || {};

  const municipalityId =
    user?.municipality_id ||
    user?.municipalities?.id ||
    profile?.municipality_id ||
    metadata?.municipality_id ||
    null;
  const municipalityName =
    user?.municipalities?.name ||
    profile?.municipality_name ||
    metadata?.municipality_name ||
    user?.municipality_name ||
    null;

  const organisationId =
    user?.organisation_id ||
    user?.organization_id ||
    profile?.organisation_id ||
    profile?.organization_id ||
    metadata?.organisation_id ||
    metadata?.organization_id ||
    null;

  const organisationName =
    user?.organisation_name ||
    user?.organization_name ||
    profile?.organisation_name ||
    profile?.organization_name ||
    metadata?.organisation_name ||
    metadata?.organization_name ||
    null;

  return {
    userId: user?.id || null,
    municipalityId,
    municipalityName,
    organisationId,
    organisationName
  };
}


function ensurePlanHasSections(planId, planType) {
  const fresh = getPlan(planId);
  if (!fresh) return;

  const librarySections = buildLibrarySections(planType?.category, planType?.code);
  if (!librarySections.length) return;

  const existing = new Set((fresh.sections || []).map(s => s.key));
  let working = fresh;
  librarySections.forEach(section => {
    if (existing.has(section.key)) return;
    working = addSection(working, {
      ...section,
      order: (working.sections?.length || 0) + 1
    });
  });
}

function normalizeSectionOrder(sections = []) {
  return (sections || [])
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((section, idx) => ({ ...section, order: idx + 1 }));
}

function getExcludedSectionStore(plan) {
  return (plan?.metadata?.excluded_sections_data && typeof plan.metadata.excluded_sections_data === 'object')
    ? { ...plan.metadata.excluded_sections_data }
    : {};
}

function excludeSection(planId, sectionKey) {
  const fresh = getPlan(planId);
  if (!fresh) throw new Error('Plan not found');
  const section = (fresh.sections || []).find(s => s.key === sectionKey);
  if (!section) throw new Error('Section not found');

  const excludedStore = getExcludedSectionStore(fresh);
  excludedStore[sectionKey] = section;

  fresh.sections = normalizeSectionOrder((fresh.sections || []).filter(s => s.key !== sectionKey));
  fresh.metadata = {
    ...(fresh.metadata || {}),
    excluded_sections_data: excludedStore,
    updated_at: new Date().toISOString()
  };

  setPlan(fresh);
}

function findLibrarySectionForPlan(plan, sectionKey) {
  const category = plan?.metadata?.plan_category;
  const planTypeCode = plan?.metadata?.plan_type;
  if (!category || !planTypeCode) return null;
  const librarySections = buildLibrarySections(category, planTypeCode);
  return librarySections.find(s => s.key === sectionKey) || null;
}

function includeSection(planId, sectionKey) {
  const fresh = getPlan(planId);
  if (!fresh) throw new Error('Plan not found');
  if ((fresh.sections || []).some(s => s.key === sectionKey)) return;

  const excludedStore = getExcludedSectionStore(fresh);
  const storedSection = excludedStore[sectionKey];
  const librarySection = findLibrarySectionForPlan(fresh, sectionKey);
  const sectionToRestore = storedSection || librarySection;
  if (!sectionToRestore) throw new Error('Section source not found');

  delete excludedStore[sectionKey];
  const sections = (fresh.sections || []).concat({ ...sectionToRestore });
  fresh.sections = normalizeSectionOrder(sections);
  fresh.metadata = {
    ...(fresh.metadata || {}),
    excluded_sections_data: excludedStore,
    updated_at: new Date().toISOString()
  };

  setPlan(fresh);
}

function renderPlanList() {
  const host = document.getElementById('cp-plan-list');
  if (!host) return;
  const plans = listPlans().filter(p => !p?.deleted && p?.status !== 'deleted');

  if (!plans.length) {
    host.innerHTML = '<div class="cp-empty">No contingency plans yet. Use the wizard to create one.</div>';
    return;
  }

  host.innerHTML = plans
    .map(
      p => `<div class="cp-plan-item ${p.id === _activePlanId ? 'active' : ''}"
        style="display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:6px;
               border:1px solid ${p.id === _activePlanId ? 'var(--accent,#2563eb)' : 'transparent'};
               background:${p.id === _activePlanId ? 'var(--bg3,#eff3fb)' : 'transparent'}">
        <div class="cp-plan-item-select" data-plan-id="${esc(p.id)}" style="flex:1;min-width:0;cursor:pointer">
          <div><strong>${esc(p.metadata.title)}</strong></div>
          <div class="cp-plan-meta">${esc(p.metadata.plan_type)} · ${esc(p.status)}</div>
        </div>
        <button class="cp-plan-delete btn btn-sm" data-plan-id="${esc(p.id)}" data-plan-title="${esc(p.metadata.title)}"
          style="flex-shrink:0;padding:2px 7px;font-size:11px;color:#c44;border-color:#c44" title="Delete plan">✕</button>
      </div>`
    )
    .join('');

  host.querySelectorAll('.cp-plan-item-select[data-plan-id]').forEach(el => {
    el.addEventListener('click', () => {
      _activePlanId = el.getAttribute('data-plan-id');
      renderPlanList();
      renderPlanDetail();
    });
  });

  host.querySelectorAll('.cp-plan-delete[data-plan-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.getAttribute('data-plan-id');
      const title = btn.getAttribute('data-plan-title') || 'this plan';
      if (!confirm(`Delete "${title}"?\n\nThis cannot be undone.`)) return;
      const p = getPlan(id);
      if (p) setPlan({ ...p, deleted: true, status: 'deleted' });
      if (_activePlanId === id) _activePlanId = null;
      renderPlanList();
      renderPlanDetail();
    });
  });
}

// ─── blockEditor ─────────────────────────────────────────────────────────────
// planTypeCode and planCategory are threaded in from renderPlanDetail so the
// assistant panel knows which plan type is active when a block is focused.
function blockEditor(sectionKey: string, block: any, idx: number, planTypeCode = '', planCategory = '') {
  const base = `data-sec="${esc(sectionKey)}" data-idx="${idx}"`;

  // Attributes added to every editable element so the assistant panel can
  // detect focus and load the right references without any extra logic.
  const assistantAttrs = [
    'data-assistant-trigger',
    `data-sec-key="${esc(sectionKey)}"`,
    `data-plan-type="${esc(planTypeCode)}"`,
    `data-plan-cat="${esc(planCategory)}"`,
  ].join(' ');

  if (block.type === 'text') {
    const editorId = `cp_rich_${esc(sectionKey)}_${idx}`;
    return `<div class="cp-field"><div style="font-size:12px;margin-bottom:6px">Text block</div>
      <div class="cp-rich-tools" style="display:flex;gap:6px;margin-bottom:6px">
        <button type="button" class="btn btn-sm" data-rich-cmd="bold" data-rich-target="${editorId}"><b>B</b></button>
        <button type="button" class="btn btn-sm" data-rich-cmd="italic" data-rich-target="${editorId}"><i>I</i></button>
        <button type="button" class="btn btn-sm" data-rich-cmd="insertUnorderedList" data-rich-target="${editorId}">• List</button>
      </div>
      <div class="cp-textarea" ${base} data-kind="rich-text" id="${editorId}"
           contenteditable="true" style="min-height:96px"
           ${assistantAttrs} data-block-type="text">${richBlockHtml(block.content)}</div>
    </div>`;
  }

  if (block.type === 'list') {
    const value = Array.isArray(block.content) ? block.content.join('\n') : '';
    return `<label class="cp-field">List block (one item per line)
      <textarea class="cp-textarea" ${base} data-kind="list"
        ${assistantAttrs} data-block-type="list">${esc(value)}</textarea>
    </label>`;
  }

  if (block.type === 'table') {
    const headers = Array.isArray(block.content?.headers) ? block.content.headers : [];
    const rows = Array.isArray(block.content?.rows) ? block.content.rows : [];
    const gridId = `cp_tbl_${esc(sectionKey)}_${idx}`;
    const colCount = headers.length;

    const buildRowHtml = (cells: string[], rowIdx: number) => {
      const tds = headers.map((_, ci) => `<td style="padding:2px 4px">
          <input class="cp-table-cell" data-grid="${gridId}" data-row="${rowIdx}" data-col="${ci}"
            value="${esc(cells[ci] ?? '')}" placeholder="—"
            style="width:100%;min-width:60px;box-sizing:border-box;padding:4px 6px;border:1px solid var(--border,#ccc);border-radius:3px;font-size:12px;background:var(--bg,#fff);color:var(--text,#111)"/>
        </td>`).join('');
      return `<tr data-row="${rowIdx}">${tds}
        <td style="padding:2px 4px;width:28px;vertical-align:middle">
          <button type="button" class="cp-tbl-del-row btn btn-sm" data-grid="${gridId}"
            style="padding:2px 6px;font-size:11px;color:#c44;border-color:#c44;line-height:1" title="Delete row">✕</button>
        </td></tr>`;
    };

    const initialRows = rows.length
      ? rows.map((r, ri) => buildRowHtml(Array.isArray(r) ? r : [], ri)).join('')
      : buildRowHtml(Array(colCount).fill(''), 0);

    // The outer div carries the assistant trigger so clicking anywhere in the
    // table (including headers) opens the fill guide for that section.
    return `<div class="cp-field" ${base} data-kind="table-grid"
        ${assistantAttrs} data-block-type="table"
        tabindex="0" style="outline:none">
      <div style="font-size:11px;font-weight:600;margin-bottom:6px;color:var(--text3,#888);display:flex;align-items:center;justify-content:space-between">
        <span>Table</span>
        <span style="font-size:10px;color:var(--accent,#2563eb);font-weight:500;cursor:default">
          ✦ Click to open fill guide
        </span>
      </div>
      <div style="overflow-x:auto">
        <table id="${gridId}" style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:var(--bg3,#f0f4fa)">
            ${headers.map(h => `<th style="text-align:left;padding:5px 8px;font-size:11px;font-weight:600;color:var(--text2,#333);border-bottom:2px solid var(--border2,#c0cadf);white-space:nowrap">${esc(h)}</th>`).join('')}
            <th style="width:28px;border-bottom:2px solid var(--border2,#c0cadf)"></th>
          </tr></thead>
          <tbody id="${gridId}_body">${initialRows}</tbody>
        </table>
      </div>
      <button type="button" class="cp-tbl-add-row btn btn-sm" data-grid="${gridId}" data-cols="${colCount}"
        style="margin-top:6px;font-size:11px">+ Add row</button>
    </div>`;
  }

  return `<label class="cp-field">Block (${esc(block.type)})
    <textarea class="cp-textarea" ${base} data-kind="text"
      ${assistantAttrs} data-block-type="text">${esc(String(block.content ?? ''))}</textarea>
  </label>`;
}

function collectBlocksFromForm(host, section) {
  const blocks = [];
  (section.content_blocks || []).forEach((block, idx) => {
    const q = (kind) => host.querySelector(`[data-sec="${section.key}"][data-idx="${idx}"][data-kind="${kind}"]`);
    if (block.type === 'text') {
      const html = q('rich-text')?.innerHTML || '';
      blocks.push({ ...block, content: html || textFromHtml(q('text')?.value || '') });
      return;
    }
    if (block.type === 'list') {
      const items = (q('list')?.value || '').split('\n').map(v => v.trim()).filter(Boolean);
      blocks.push({ ...block, content: items });
      return;
    }
    if (block.type === 'table') {
      const gridId = `cp_tbl_${section.key}_${idx}`;
      const headers = Array.isArray(block.content?.headers) ? block.content.headers : [];
      const rows = [];
      const tbody = host.querySelector(`#${gridId}_body`);
      if (tbody) {
        tbody.querySelectorAll('tr[data-row]').forEach(tr => {
          const cells = [];
          tr.querySelectorAll('input.cp-table-cell').forEach(inp => {
            cells[parseInt(inp.dataset.col)] = inp.value.trim();
          });
          if (cells.some(c => c)) rows.push(cells);
        });
      } else if (Array.isArray(block.content?.rows)) {
        rows.push(...block.content.rows);
      }
      blocks.push({ ...block, content: { headers, rows } });
      return;
    }
    blocks.push({ ...block, content: q('text')?.value || '' });
  });
  return blocks;
}

async function persistPlan(planId) {
  const plan = getPlan(planId);
  if (!plan) return;
  try {
    await savePlanToBackend(plan, _context);
  } catch (e) {
    console.warn('[Contingency] backend save failed:', e.message || e);
  }
}

async function hydratePlansFromBackend() {
  if (!_context?.municipalityId) return;
  try {
    const plans = await fetchPlansFromBackend(_context.municipalityId);
    plans.forEach(p => {
      if (p?.id) setPlan(stripLegacySuggestionArtifacts(p));
    });
  } catch (e) {
    console.warn('[Contingency] backend load failed:', e.message || e);
  }
}

function renderPlanDetail() {
  const host = document.getElementById('cp-plan-detail');
  if (!host) return;

  // Tear down assistant listeners before re-rendering so we don't accumulate
  // duplicate focus handlers on stale DOM nodes.
  destroyAssistantPanel();

  const plan = _activePlanId ? stripLegacySuggestionArtifacts(getPlan(_activePlanId)) : null;
  if (!plan || plan.deleted || plan.status === 'deleted') {
    host.innerHTML = '<div class="cp-empty">Select a plan from the list to view details.</div>';
    return;
  }

  const excludedSectionStore = getExcludedSectionStore(plan);
  const excludedSections = Object.values(excludedSectionStore).sort((a, b) => a.title.localeCompare(b.title));

  // Pull plan type + category once so every blockEditor call gets them.
  const planTypeCode  = plan.metadata?.plan_type     || '';
  const planCategory  = plan.metadata?.plan_category || '';

  host.innerHTML = `
    <div class="cp-detail-wrap">
      <div class="cp-editor-pane">
    <div class="cp-detail-head">
      <div>
        <h3>${esc(plan.metadata.title)}</h3>
        <div class="cp-plan-meta">${esc(plan.metadata.municipality_name)} · ${esc(plan.status)}</div>
      </div>
      <div class="cp-actions">
        <button id="cp-save-version" class="btn">Save version</button>
        <button id="cp-submit-review" class="btn">Submit review</button>
        <button id="cp-approve" class="btn">Approve</button>
        <button id="cp-export" class="btn btn-primary">Export Word</button>
      </div>
    </div>
    <div class="cp-section-card" style="margin-bottom:8px">
      <div class="cp-section-head">Excluded sections</div>
      ${
        excludedSections.length
          ? `<div class="cp-excluded-list">
              ${excludedSections
                .map(
                  s => `<button type="button" class="btn btn-sm cp-excluded-item" data-add-section="${esc(s.key)}" title="Add section back">${esc(s.title)}</button>`
                )
                .join('')}
            </div>`
          : '<div class="cp-empty">No excluded sections.</div>'
      }
    </div>
    <div class="cp-sections">
      ${!plan.sections.length ? '<div class="cp-empty">No sections found for this plan. Starter sections will be added on generate.</div>' : ''}
      ${plan.sections
        .map(
          s => `<div class="cp-section-card">
              <div class="cp-section-head" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                <span>${esc(s.title)}</span>
                <button type="button" class="btn btn-sm" data-remove-section="${esc(s.key)}" title="Exclude this section">Remove section</button>
              </div>
              <div class="cp-blocks">${(s.content_blocks || []).map((b, idx) => blockEditor(s.key, b, idx, planTypeCode, planCategory)).join('')}</div>
              <div class="cp-row-end">
                <button class="btn" data-save-section="${esc(s.key)}">Save section</button>
              </div>
            </div>`
        )
        .join('')}
    </div>
      </div>
      <div class="cp-preview-pane">
        <div class="cp-section-head">Live preview</div>
        <div class="cp-preview-body">${planPreviewHtml(plan)}</div>
      </div>
    </div>
  `;
  purgeLegacySuggestionNodes(host);

  document.getElementById('cp-save-version')?.addEventListener('click', () => {
    saveVersionSnapshot(plan, _context?.userId || 'local-user');
    persistPlan(plan.id);
    renderPlanDetail();
  });

  document.getElementById('cp-submit-review')?.addEventListener('click', () => {
    submitForReview(plan.id, _context?.userId || 'local-user', 'Submitted from contingency page');
    persistPlan(plan.id);
    persistPlan(plan.id);
    renderPlanList();
    renderPlanDetail();
  });

  document.getElementById('cp-approve')?.addEventListener('click', () => {
    approvePlan(plan.id, _context?.userId || 'local-user', 'Approved from contingency page');
    renderPlanList();
    renderPlanDetail();
  });

  document.getElementById('cp-export')?.addEventListener('click', (evt) => {
    const fresh = getPlan(plan.id);
    if (!fresh) return;
    showContingencyExportMenu(evt.currentTarget, fresh);
  });

  host.querySelectorAll('[data-rich-cmd][data-rich-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-rich-cmd');
      const targetId = btn.getAttribute('data-rich-target');
      const editor = targetId ? host.querySelector(`#${targetId}`) : null;
      if (!cmd || !editor) return;
      editor.focus();
      document.execCommand(cmd, false);
    });
  });

  host.querySelectorAll('[data-save-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-save-section');
      if (!key) return;
      try {
        const section = plan.sections.find(s => s.key === key);
        if (!section) return;
        const blocks = collectBlocksFromForm(host, section);
        updateSection(plan.id, key, blocks);
        persistPlan(plan.id);
        renderPlanDetail();
      } catch (e) {
        alert(`Failed to save section (${key}): ${e.message}`);
      }
    });
  });

  host.querySelectorAll('[data-remove-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-remove-section');
      if (!key) return;
      try {
        excludeSection(plan.id, key);
        persistPlan(plan.id);
        renderPlanDetail();
      } catch (e) {
        alert(`Failed to remove section (${key}): ${e.message}`);
      }
    });
  });

  host.querySelectorAll('[data-add-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-add-section');
      if (!key) return;
      try {
        includeSection(plan.id, key);
        persistPlan(plan.id);
        renderPlanDetail();
      } catch (e) {
        alert(`Failed to add section (${key}): ${e.message}`);
      }
    });
  });

  host.querySelectorAll('textarea,input,[contenteditable="true"]').forEach(el => {
    el.addEventListener('input', () => scheduleAutoSave(plan.id));
  });

  // Table grid: Add row
  host.querySelectorAll('.cp-tbl-add-row[data-grid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const gridId = btn.getAttribute('data-grid');
      const colCount = parseInt(btn.getAttribute('data-cols')) || 1;
      const tbody = host.querySelector(`#${gridId}_body`);
      if (!tbody) return;
      const nextRow = tbody.querySelectorAll('tr[data-row]').length;
      const tr = document.createElement('tr');
      tr.setAttribute('data-row', String(nextRow));
      let tds = '';
      for (let ci = 0; ci < colCount; ci++) {
        tds += `<td style="padding:2px 4px"><input class="cp-table-cell" data-grid="${gridId}" data-row="${nextRow}" data-col="${ci}" value="" placeholder="—"
          style="width:100%;min-width:60px;box-sizing:border-box;padding:4px 6px;border:1px solid var(--border,#ccc);border-radius:3px;font-size:12px;background:var(--bg,#fff);color:var(--text,#111)"/></td>`;
      }
      tds += `<td style="padding:2px 4px;width:28px;vertical-align:middle">
        <button type="button" class="cp-tbl-del-row btn btn-sm" data-grid="${gridId}"
          style="padding:2px 6px;font-size:11px;color:#c44;border-color:#c44;line-height:1" title="Delete row">✕</button>
      </td>`;
      tr.innerHTML = tds;
      tbody.appendChild(tr);
      tr.querySelector('.cp-tbl-del-row')?.addEventListener('click', function () { this.closest('tr')?.remove(); scheduleAutoSave(plan.id); });
      tr.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => scheduleAutoSave(plan.id)));
      scheduleAutoSave(plan.id);
    });
  });

  // Table grid: Delete row (initial rows)
  host.querySelectorAll('.cp-tbl-del-row[data-grid]').forEach(btn => {
    btn.addEventListener('click', function () { this.closest('tr')?.remove(); scheduleAutoSave(plan.id); });
  });

  // ── Wire up the assistant panel after all DOM is ready ──────────────────
  // initAssistantPanel attaches focus/click listeners to every element that
  // has data-assistant-trigger. It is safe to call on every render because
  // destroyAssistantPanel() was called at the top of this function.
  initAssistantPanel();
}

function renderTypeOptions() {
  const select = document.getElementById('cp-plan-type');
  const status = document.getElementById('cp-type-status');
  const desc = document.getElementById('cp-plan-type-desc');
  if (!select) return;

  if (!_activeCategory) {
    select.innerHTML = '<option value="">Select category first</option>';
    select.disabled = true;
    if (desc) desc.textContent = '';
    return;
  }

  if (!_filteredPlanTypes.length) {
    select.innerHTML = '<option value="">No plan types available</option>';
    select.disabled = true;
    if (status) status.textContent = 'No plan types available for this category.';
    if (desc) desc.textContent = '';
    return;
  }

  select.disabled = false;
  select.innerHTML = ['<option value="">Select plan type</option>']
    .concat(_filteredPlanTypes.map(p => `<option value="${esc(p.code)}">${esc(p.name)}</option>`))
    .join('');

  if (status) status.textContent = '';
  if (desc) desc.textContent = '';
}

function updateSelectedTypeDescription() {
  const code = selectedPlanTypeCode();
  const desc = document.getElementById('cp-plan-type-desc');
  if (!desc) return;
  const found = _filteredPlanTypes.find(p => p.code === code);
  desc.textContent = found ? (found.description || `Code: ${found.code}`) : '';
}

async function loadTypesForCategory(category) {
  _activeCategory = category;
  const status = document.getElementById('cp-type-status');
  if (status) status.textContent = 'Loading plan types...';

  try {
    _filteredPlanTypes = await getPlanTypesByCategory(category);
    renderTypeOptions();
    if (status) status.textContent = _filteredPlanTypes.length ? '' : 'No plan types available for this category.';
  } catch (e) {
    _filteredPlanTypes = [];
    renderTypeOptions();
    if (status) status.textContent = `Unable to load plan types: ${e.message}`;
  }
}

function selectedPlanTypeCode() {
  return document.getElementById('cp-plan-type')?.value || '';
}

async function generatePlanFromWizard() {
  const err = document.getElementById('cp-wizard-error');
  if (err) err.textContent = '';

  if (!_context?.municipalityId) {
    if (err) err.textContent = 'Your account is not linked to a municipality profile.';
    return;
  }

  const category = document.getElementById('cp-category')?.value || '';
  const planTypeCode = selectedPlanTypeCode();
  if (!category || !planTypeCode) {
    if (err) err.textContent = 'Please select a category and plan type.';
    return;
  }

  const planType = await getPlanTypeByCode(planTypeCode);
  if (!planType) {
    if (err) err.textContent = 'Invalid plan type selected.';
    return;
  }

  try {
    const includeSeed = !!document.getElementById('cp-opt-seed')?.checked;
    const includeAnnex = !!document.getElementById('cp-opt-annex')?.checked;
    const includeHvc = !!document.getElementById('cp-opt-hvc')?.checked;

    const title = `${planType.name} (${_context.municipalityName})`;
    const meta = `Template:${planType.templateCode}; SeedGroup:${planType.seedGroup || 'none'}; Org:${_context.organisationId || 'N/A'}`;

    let plan;
    if (includeSeed && planType.seedGroup) {
      const seed = loadSeed(planType.seedGroup);
      plan = generateFromSeed({ category, type: planType.code, title, description: meta }, seed);
    } else {
      plan = createPlan(
        { category, type: planType.code, title, description: meta },
        {
          municipality_id: _context.municipalityId,
          municipality_name: _context.municipalityName,
          owner_user_id: _context.userId
        }
      );
    }

    if (includeAnnex) {
      ['contacts', 'shelters', 'ward_priorities', 'operational_assets'].forEach(key => {
        try {
          const annex = createAnnexureFromTemplate(key);
          attachAnnexureToPlan(plan.id, annex);
        } catch {}
      });
    }

    ensurePlanHasSections(plan.id, planType);

    if (includeHvc) {
      let fresh = getPlan(plan.id);
      if (fresh && !fresh.sections.some(s => s.key === 'hvc_placeholders')) {
        fresh = addSection(fresh, {
          key: 'hvc_placeholders',
          title: 'HVC Placeholders',
          order: (fresh.sections?.length || 0) + 1,
          editable: true,
          content_blocks: []
        });
      }
      if (fresh) {
        const hvcBlocks = await fetchHvcPlacementBlocks();
        updateSection(
          plan.id,
          'hvc_placeholders',
          hvcBlocks.length
            ? hvcBlocks
            : [
                {
                  id: 'hvc_placeholder_1',
                  type: 'text',
                  content: 'No HVC records found for this municipality yet. Complete HVC assessment to auto-populate this section.'
                }
              ]
        );
      }
    }

    _activePlanId = plan.id;
    await persistPlan(plan.id);
    renderPlanList();
    renderPlanDetail();
  } catch (e) {
    if (err) err.textContent = `Could not generate plan: ${e.message}`;
  }
}

function renderBlockedState(page) {
  page.innerHTML = `
    <div class="page-body" style="padding:16px">
      <div class="card" style="padding:18px">
        <div class="h3">Contingency Plans</div>
        <div class="cp-blocker">Your account is not linked to a municipality profile.</div>
      </div>
    </div>
  `;
}

export async function initContingencyPage(user) {
  const page = document.getElementById('page-contingency');
  if (!page) return;

  _context = getCurrentPlanningContext(user);
  if (!_context.municipalityId) {
    renderBlockedState(page);
    return;
  }

  page.innerHTML = `
    <div class="page-body cp-layout" id="cp-layout" style="padding:16px;display:grid;gap:12px;grid-template-columns:360px 1fr;align-items:start">
      <div class="card" id="cp-sidebar" style="padding:12px;display:grid;gap:10px">
        <div class="cp-actions" style="justify-content:space-between">
          <button class="btn" id="cp-toggle-menu">Collapse generate</button>
          <button class="btn" id="cp-toggle-split">Split view</button>
        </div>
        <div class="h3">New Contingency Plan</div>
        <div id="cp-generate-panel">
        <div class="cp-context">
          <div><strong>Municipality:</strong> ${esc(_context.municipalityName)}</div>
          <div><strong>Organisation:</strong> ${esc(_context.organisationName || _context.organisationId || 'Disaster Management Unit')}</div>
        </div>

        <div class="fl">
          <span class="fl-label">Category</span>
          <select class="fl-select" id="cp-category">
            <option value="">Select category</option>
            <option value="seasonal">Seasonal</option>
            <option value="hazard_specific">Hazard specific</option>
            <option value="functional">Functional</option>
            <option value="event">Event</option>
          </select>
        </div>

        <div class="fl">
          <span class="fl-label">Plan type</span>
          <select class="fl-select" id="cp-plan-type" disabled>
            <option value="">Select category first</option>
          </select>
          <div id="cp-plan-type-desc" class="cp-hint"></div>
          <div id="cp-type-status" class="cp-hint"></div>
        </div>

        <div class="cp-options">
          <label><input type="checkbox" id="cp-opt-seed" checked /> Include seed content</label>
          <label><input type="checkbox" id="cp-opt-annex" checked /> Include default annexures</label>
          <label><input type="checkbox" id="cp-opt-hvc" /> Include HVC placeholders</label>
        </div>

        <div id="cp-wizard-error" class="cp-error"></div>
        <button class="btn btn-primary" id="cp-generate">Generate plan</button>
        </div>

        <hr style="border:none;border-top:1px solid var(--line);margin:2px 0"/>
        <div class="h3" style="font-size:13px">Plans</div>
        <div id="cp-plan-list"></div>
      </div>
      <div class="card" id="cp-plan-detail" style="padding:12px"></div>
    </div>
  `;
  purgeLegacySuggestionNodes(page);
  applyLayoutState();

  try {
    await getAllPlanTypes();
  } catch (e) {
    const status = document.getElementById('cp-type-status');
    if (status) status.textContent = `Plan type registry unavailable: ${e.message || e}`;
  }

  await hydratePlansFromBackend();
  renderPlanList();
  renderPlanDetail();

  document.getElementById('cp-category')?.addEventListener('change', e => loadTypesForCategory(e.target.value));
  document.getElementById('cp-plan-type')?.addEventListener('change', updateSelectedTypeDescription);
  document.getElementById('cp-generate')?.addEventListener('click', generatePlanFromWizard);
  document.getElementById('cp-toggle-menu')?.addEventListener('click', () => {
    _menuCollapsed = !_menuCollapsed;
    applyLayoutState();
  });
  document.getElementById('cp-toggle-split')?.addEventListener('click', () => {
    _splitView = !_splitView;
    applyLayoutState();
  });
}
