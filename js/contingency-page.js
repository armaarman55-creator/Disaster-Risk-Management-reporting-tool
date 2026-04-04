import { generateFromSeed, getPlan, listPlans, updateSection } from './contingency-dist/plan-engine.js';
import { loadSeed } from './contingency-dist/seed-loader.js';
import { exportPlan } from './contingency-dist/export-engine.js';
import { saveVersionSnapshot, submitForReview, approvePlan } from './contingency-dist/versioning.js';

let _activePlanId = null;

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function planTypeLabel(type) {
  const map = {
    flood: 'Flood',
    winter: 'Winter',
    evacuation: 'Evacuation',
    electricity_disruption: 'Electricity disruption',
    hazmat: 'Hazmat',
    shelter: 'Shelter'
  };
  return map[type] || type;
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
    host.innerHTML = '<div class="cp-empty">No contingency plans yet. Use quick create to start.</div>';
    return;
  }

  host.innerHTML = plans
    .map(
      p => `<button class="cp-plan-item ${p.id === _activePlanId ? 'active' : ''}" data-plan-id="${esc(p.id)}">
        <div><strong>${esc(p.metadata.title)}</strong></div>
        <div class="cp-plan-meta">${esc(planTypeLabel(p.metadata.plan_type))} · ${esc(p.status)}</div>
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
        <button id="cp-submit-review" class="btn">Submit for review</button>
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
    saveVersionSnapshot(plan, 'local-user');
    renderPlanDetail();
  });

  document.getElementById('cp-submit-review')?.addEventListener('click', () => {
    submitForReview(plan.id, 'local-user', 'Submitted from Contingency page');
    renderPlanList();
    renderPlanDetail();
  });

  document.getElementById('cp-approve')?.addEventListener('click', () => {
    approvePlan(plan.id, 'local-user', 'Approved from Contingency page');
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
        const parsed = JSON.parse(textarea.value);
        updateSection(plan.id, key, parsed);
        renderPlanDetail();
      } catch (e) {
        alert(`Invalid JSON for section ${key}: ${e.message}`);
      }
    });
  });
}

function createSeededPlan(type, user) {
  const seed = loadSeed(type);
  const plan = generateFromSeed(
    {
      category: type === 'winter' ? 'seasonal' : 'hazard_specific',
      type,
      title: `${planTypeLabel(type)} Contingency Plan`
    },
    seed
  );

  _activePlanId = plan.id;
  renderPlanList();
  renderPlanDetail();
}

export function initContingencyPage(user) {
  const page = document.getElementById('page-contingency');
  if (!page) return;

  page.innerHTML = `
    <div class="page-body" style="padding:16px;display:grid;gap:12px;grid-template-columns:320px 1fr;align-items:start">
      <div class="card" style="padding:12px">
        <div class="h3" style="margin-bottom:8px">Contingency Plans</div>
        <div class="cp-quick-actions" style="display:grid;gap:8px;margin-bottom:10px">
          <button class="btn" id="cp-new-flood">+ New Flood Plan</button>
          <button class="btn" id="cp-new-winter">+ New Winter Plan</button>
          <button class="btn" id="cp-new-evac">+ New Evacuation Plan</button>
        </div>
        <div id="cp-plan-list"></div>
      </div>
      <div class="card" id="cp-plan-detail" style="padding:12px"></div>
    </div>
  `;

  document.getElementById('cp-new-flood')?.addEventListener('click', () => createSeededPlan('flood', user));
  document.getElementById('cp-new-winter')?.addEventListener('click', () => createSeededPlan('winter', user));
  document.getElementById('cp-new-evac')?.addEventListener('click', () => createSeededPlan('evacuation', user));

  renderPlanList();
  renderPlanDetail();
}
