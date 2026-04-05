import { addSection, createPlan, generateFromSeed, getPlan, listPlans, setPlan, updateSection } from './contingency-dist/plan-engine.js';
import { loadSeed } from './contingency-dist/seed-loader.js';
import { exportPlan } from './contingency-dist/export-engine.js';
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

let _activePlanId = null;
let _activeCategory = '';
let _filteredPlanTypes = [];
let _context = null;
let _autoSaveTimer = null;

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
  const secHtml = (plan.sections || [])
    .sort((a, b) => a.order - b.order)
    .map(s => {
      const blockHtml = (s.content_blocks || [])
        .map(b => {
          if (b.type === 'table') {
            const headers = Array.isArray(b.content?.headers) ? b.content.headers : [];
            const rows = Array.isArray(b.content?.rows) ? b.content.rows : [];
            return `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
              rows.map(r => `<tr>${(Array.isArray(r) ? r : []).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')
            }</tbody></table>`;
          }
          if (b.type === 'list') {
            const items = Array.isArray(b.content) ? b.content : [];
            return `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
          }
          return `<div>${richBlockHtml(b.content)}</div>`;
        })
        .join('');
      return `<h2>${esc(s.title)}</h2>${blockHtml}`;
    })
    .join('');

  return `${docHeader(`Contingency Plan — ${meta.title || 'Plan'}`, meta.municipality_name || 'Municipality')}
    <div class="meta">Category: ${esc(meta.plan_category || '—')} · Type: ${esc(meta.plan_type || '—')} · Status: ${esc(plan.status || 'draft')}</div>
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

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function renderPlanList() {
  const host = document.getElementById('cp-plan-list');
  if (!host) return;
  const plans = listPlans();

  if (!plans.length) {
    host.innerHTML = '<div class="cp-empty">No contingency plans yet. Use the wizard to create one.</div>';
    return;
  }

  host.innerHTML = plans
    .map(
      p => `<button class="cp-plan-item ${p.id === _activePlanId ? 'active' : ''}" data-plan-id="${esc(p.id)}">
        <div><strong>${esc(p.metadata.title)}</strong></div>
        <div class="cp-plan-meta">${esc(p.metadata.plan_type)} · ${esc(p.status)}</div>
      </button>`
    )
    .join('');

  host.querySelectorAll('[data-plan-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      _activePlanId = btn.getAttribute('data-plan-id');
      renderPlanList();
      renderPlanDetail();
    });
  });
}


function blockEditor(sectionKey, block, idx) {
  const base = `data-sec="${esc(sectionKey)}" data-idx="${idx}"`;
  if (block.type === 'text') {
    const editorId = `cp_rich_${esc(sectionKey)}_${idx}`;
    return `<div class="cp-field"><div style="font-size:12px;margin-bottom:6px">Text block</div>
      <div class="cp-rich-tools" style="display:flex;gap:6px;margin-bottom:6px">
        <button type="button" class="btn btn-sm" data-rich-cmd="bold" data-rich-target="${editorId}"><b>B</b></button>
        <button type="button" class="btn btn-sm" data-rich-cmd="italic" data-rich-target="${editorId}"><i>I</i></button>
        <button type="button" class="btn btn-sm" data-rich-cmd="insertUnorderedList" data-rich-target="${editorId}">• List</button>
      </div>
      <div class="cp-textarea" ${base} data-kind="rich-text" id="${editorId}" contenteditable="true" style="min-height:96px">${richBlockHtml(block.content)}</div>
    </div>`;
  }
  if (block.type === 'list') {
    const value = Array.isArray(block.content) ? block.content.join('\n') : '';
    return `<label class="cp-field">List block (one item per line)
      <textarea class="cp-textarea" ${base} data-kind="list">${esc(value)}</textarea>
    </label>`;
  }
  if (block.type === 'table') {
    const headers = Array.isArray(block.content?.headers) ? block.content.headers.join(', ') : '';
    const rows = Array.isArray(block.content?.rows) ? block.content.rows.map(r => (Array.isArray(r) ? r.join(' | ') : '')).join('\n') : '';
    return `<div class="cp-field"><div>Table block</div>
      <input class="fl-input" ${base} data-kind="table-headers" value="${esc(headers)}" placeholder="Headers (comma separated)" />
      <textarea class="cp-textarea" ${base} data-kind="table-rows" placeholder="Rows (one row per line, columns separated by |)">${esc(rows)}</textarea>
    </div>`;
  }
  return `<label class="cp-field">Block (${esc(block.type)})
    <textarea class="cp-textarea" ${base} data-kind="text">${esc(String(block.content ?? ''))}</textarea>
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
      const headers = (q('table-headers')?.value || '').split(',').map(v => v.trim()).filter(Boolean);
      const rows = (q('table-rows')?.value || '').split('\n').map(r => r.trim()).filter(Boolean).map(r => r.split('|').map(c => c.trim()));
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
      if (p?.id) setPlan(p);
    });
  } catch (e) {
    console.warn('[Contingency] backend load failed:', e.message || e);
  }
}

function renderPlanDetail() {
  const host = document.getElementById('cp-plan-detail');
  if (!host) return;

  const plan = _activePlanId ? getPlan(_activePlanId) : null;
  if (!plan) {
    host.innerHTML = '<div class="cp-empty">Select a plan from the list to view details.</div>';
    return;
  }

  host.innerHTML = `
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
        <button id="cp-export-json" class="btn">Export JSON</button>
      </div>
    </div>
    <div class="cp-sections">
      ${!plan.sections.length ? '<div class="cp-empty">No sections found for this plan. Starter sections will be added on generate.</div>' : ''}
      ${plan.sections
        .map(
          s => `<div class="cp-section-card">
              <div class="cp-section-head">${esc(s.title)}</div>
              <div class="cp-blocks">${(s.content_blocks || []).map((b, idx) => blockEditor(s.key, b, idx)).join('')}</div>
              <div class="cp-row-end">
                <button class="btn" data-save-section="${esc(s.key)}">Save section</button>
              </div>
            </div>`
        )
        .join('')}
    </div>
  `;

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
  document.getElementById('cp-export-json')?.addEventListener('click', () => {
    const fresh = getPlan(plan.id);
    if (!fresh) return;
    downloadJson(`contingency-plan-${fresh.id}.json`, exportPlan(fresh));
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

  host.querySelectorAll('textarea,input,[contenteditable="true"]').forEach(el => {
    el.addEventListener('input', () => scheduleAutoSave(plan.id));
  });


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
    <div class="page-body" style="padding:16px;display:grid;gap:12px;grid-template-columns:360px 1fr;align-items:start">
      <div class="card" style="padding:12px;display:grid;gap:10px">
        <div class="h3">New Contingency Plan</div>
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

        <hr style="border:none;border-top:1px solid var(--line);margin:2px 0"/>
        <div class="h3" style="font-size:13px">Plans</div>
        <div id="cp-plan-list"></div>
      </div>
      <div class="card" id="cp-plan-detail" style="padding:12px"></div>
    </div>
  `;

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
}
