import { createPlan, generateFromSeed, getPlan, listPlans, updateSection } from './contingency-dist/plan-engine.js';
import { loadSeed } from './contingency-dist/seed-loader.js';
import { exportPlan } from './contingency-dist/export-engine.js';
import { saveVersionSnapshot, submitForReview, approvePlan } from './contingency-dist/versioning.js';
import { createAnnexureFromTemplate, attachAnnexureToPlan } from './contingency-dist/annexure-engine.js';
import {
  getAllPlanTypes,
  getPlanTypeByCode,
  getPlanTypesByCategory
} from './contingency-plan-type-registry.js';

let _activePlanId = null;
let _activeCategory = '';
let _filteredPlanTypes = [];
let _context = null;

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getCurrentPlanningContext(user) {
  const profile = user?.profile || user?.profiles || {};
  const metadata = user?.user_metadata || user?.raw_user_meta_data || {};

  const municipalityId =
    user?.municipality_id || profile?.municipality_id || metadata?.municipality_id || null;
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
        <button id="cp-export" class="btn btn-primary">Export JSON</button>
      </div>
    </div>
    <div class="cp-sections">
      ${plan.sections
        .map(
          s => `<div class="cp-section-card">
              <div class="cp-section-head">${esc(s.title)}</div>
              <textarea data-section-key="${esc(s.key)}" class="cp-textarea">${esc(
                JSON.stringify(s.content_blocks, null, 2)
              )}</textarea>
              <div class="cp-row-end">
                <button class="btn" data-save-section="${esc(s.key)}">Save section JSON</button>
              </div>
            </div>`
        )
        .join('')}
    </div>
  `;

  document.getElementById('cp-save-version')?.addEventListener('click', () => {
    saveVersionSnapshot(plan, _context?.userId || 'local-user');
    renderPlanDetail();
  });

  document.getElementById('cp-submit-review')?.addEventListener('click', () => {
    submitForReview(plan.id, _context?.userId || 'local-user', 'Submitted from contingency page');
    renderPlanList();
    renderPlanDetail();
  });

  document.getElementById('cp-approve')?.addEventListener('click', () => {
    approvePlan(plan.id, _context?.userId || 'local-user', 'Approved from contingency page');
    renderPlanList();
    renderPlanDetail();
  });

  document.getElementById('cp-export')?.addEventListener('click', () => {
    const fresh = getPlan(plan.id);
    if (!fresh) return;
    downloadJson(`contingency-plan-${fresh.id}.json`, exportPlan(fresh));
  });

  host.querySelectorAll('[data-save-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-save-section');
      const textarea = host.querySelector(`textarea[data-section-key="${key}"]`);
      if (!key || !textarea) return;
      try {
        updateSection(plan.id, key, JSON.parse(textarea.value));
        renderPlanDetail();
      } catch (e) {
        alert(`Invalid section JSON (${key}): ${e.message}`);
      }
    });
  });
}

function renderTypeOptions() {
  const list = document.getElementById('cp-plan-type-list');
  if (!list) return;

  if (!_activeCategory) {
    list.innerHTML = '<div class="cp-empty">Select a category to load plan types.</div>';
    return;
  }

  if (!_filteredPlanTypes.length) {
    list.innerHTML = '<div class="cp-empty">No plan types available for this category.</div>';
    return;
  }

  list.innerHTML = _filteredPlanTypes
    .map(
      p => `<label class="cp-type-item">
        <input type="radio" name="cp-plan-type" value="${esc(p.code)}" />
        <div>
          <div class="cp-type-name">${esc(p.name)}</div>
          <div class="cp-type-desc">${esc(p.description || p.code)}</div>
        </div>
      </label>`
    )
    .join('');
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

function filterTypesBySearch() {
  const query = (document.getElementById('cp-plan-type-search')?.value || '').trim().toLowerCase();
  if (!query) {
    loadTypesForCategory(_activeCategory);
    return;
  }

  const filtered = _filteredPlanTypes.filter(p => {
    const name = (p.name || '').toLowerCase();
    const desc = (p.description || '').toLowerCase();
    const code = (p.code || '').toLowerCase();
    return name.includes(query) || desc.includes(query) || code.includes(query);
  });

  const list = document.getElementById('cp-plan-type-list');
  if (!list) return;

  list.innerHTML = filtered.length
    ? filtered
        .map(
          p => `<label class="cp-type-item">
          <input type="radio" name="cp-plan-type" value="${esc(p.code)}" />
          <div>
            <div class="cp-type-name">${esc(p.name)}</div>
            <div class="cp-type-desc">${esc(p.description || p.code)}</div>
          </div>
        </label>`
        )
        .join('')
    : '<div class="cp-empty">No plan types match your search.</div>';
}

function selectedPlanTypeCode() {
  return document.querySelector('input[name="cp-plan-type"]:checked')?.value || '';
}

async function generatePlanFromWizard() {
  const err = document.getElementById('cp-wizard-error');
  if (err) err.textContent = '';

  if (!_context?.municipalityId || !_context?.organisationId) {
    if (err) err.textContent = 'Your account is not linked to a municipality/organisation profile.';
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
    const meta = `Template:${planType.templateCode}; SeedGroup:${planType.seedGroup || 'none'}; Org:${_context.organisationId}`;

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

    if (includeHvc) {
      const fresh = getPlan(plan.id);
      if (fresh) {
        updateSection(plan.id, 'hvc_placeholders', [
          {
            id: 'hvc_placeholder_1',
            type: 'text',
            content: 'HVC placeholders enabled. Integrate ward priorities and hazard drivers from HVC module.'
          }
        ]);
      }
    }

    _activePlanId = plan.id;
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
        <div class="cp-blocker">Your account is not linked to a municipality/organisation profile.</div>
      </div>
    </div>
  `;
}

export async function initContingencyPage(user) {
  const page = document.getElementById('page-contingency');
  if (!page) return;

  _context = getCurrentPlanningContext(user);
  if (!_context.municipalityId || !_context.organisationId) {
    renderBlockedState(page);
    return;
  }

  page.innerHTML = `
    <div class="page-body" style="padding:16px;display:grid;gap:12px;grid-template-columns:360px 1fr;align-items:start">
      <div class="card" style="padding:12px;display:grid;gap:10px">
        <div class="h3">New Contingency Plan</div>
        <div class="cp-context">
          <div><strong>Municipality:</strong> ${esc(_context.municipalityName)}</div>
          <div><strong>Organisation:</strong> ${esc(_context.organisationName || _context.organisationId)}</div>
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
          <input id="cp-plan-type-search" class="fl-input" placeholder="Search plan types" />
          <div id="cp-plan-type-list" class="cp-type-list"></div>
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

  await getAllPlanTypes();
  renderPlanList();
  renderPlanDetail();

  document.getElementById('cp-category')?.addEventListener('change', e => loadTypesForCategory(e.target.value));
  document.getElementById('cp-plan-type-search')?.addEventListener('input', filterTypesBySearch);
  document.getElementById('cp-generate')?.addEventListener('click', generatePlanFromWizard);
}
