// js/onboarding.js
import { supabase } from './supabase.js';

const STEPS = [
  { title: 'Welcome to DRMSA', sub: 'Let\'s set up your municipality in a few quick steps. This only happens once.' },
  { title: 'Municipality details', sub: 'Confirm your municipality information and ward count.' },
  { title: 'Hazard library loaded', sub: 'We\'ve pre-loaded 38 hazard types and mitigation suggestions for your assessment.' },
  { title: 'Add your first contact', sub: 'Add at least one emergency contact to your stakeholder directory to get started.' },
  { title: 'You\'re ready', sub: 'DRMSA is set up and ready. You can complete your HVC assessment and add more details at any time.' }
];

export async function initOnboarding(user) {
  // Skip onboarding if no municipality linked — dashboard handles this state
  const muniId = user?.municipality_id;
  if (!muniId) return false;

  const { data } = await supabase.from('municipalities').select('onboarding_complete').eq('id', muniId).single();
  if (data?.onboarding_complete) return false;

  showOnboarding(user, muniId);
  return true;
}

function showOnboarding(user, muniId) {
  let step = 0;
  const overlay = document.createElement('div');
  overlay.id = 'ob-overlay';
  overlay.className = 'ob-overlay';
  render(overlay, step, user, muniId);
  document.body.appendChild(overlay);
}

function render(overlay, step, user, muniId) {
  const s = STEPS[step];
  const dots = STEPS.map((_, i) => `<div class="ob-dot ${i < step ? 'done' : i === step ? 'on' : ''}"></div>`).join('');

  overlay.innerHTML = `
    <div class="ob-card">
      <div class="ob-head">
        <div class="ob-step-dots">${dots}</div>
        <div class="ob-step-title">${s.title}</div>
        <div class="ob-step-sub">${s.sub}</div>
      </div>
      <div class="ob-body" id="ob-body">
        ${renderStepBody(step, user)}
      </div>
      <div class="ob-foot">
        <span class="ob-progress">Step ${step + 1} of ${STEPS.length}</span>
        <div class="ob-nav">
          ${step > 0 ? `<button class="btn btn-sm" id="ob-back">Back</button>` : ''}
          <button class="btn btn-sm ${step === STEPS.length - 1 ? 'btn-green' : 'btn-primary'}" id="ob-next">
            ${step === STEPS.length - 1 ? 'Go to dashboard' : 'Next'}
          </button>
        </div>
      </div>
    </div>`;

  document.getElementById('ob-next')?.addEventListener('click', async () => {
    if (step === STEPS.length - 1) {
      await supabase.from('municipalities').update({ onboarding_complete: true }).eq('id', muniId);
      overlay.remove();
      const { initApp } = await import('./app.js');
      const { navigateTo } = await import('./app.js');
      navigateTo('dashboard');
      const { initDashboard } = await import('./dashboard.js');
      initDashboard(user);
    } else {
      step++;
      render(overlay, step, user, muniId);
    }
  });

  document.getElementById('ob-back')?.addEventListener('click', () => {
    step--;
    render(overlay, step, user, muniId);
  });
}

function renderStepBody(step, user) {
  switch (step) {
    case 0:
      return `
        <div class="ob-notice">You are setting up <strong>${user?.municipalities?.name || 'your municipality'}</strong> on DRMSA for the first time.</div>
        <div style="font-size:12px;color:var(--text2);line-height:1.8">
          DRMSA will help you:<br>
          <span style="color:var(--green)">✓</span> Conduct HVC (Hazard, Vulnerability & Capacity) assessments<br>
          <span style="color:var(--green)">✓</span> Manage shelters, relief operations and road closures<br>
          <span style="color:var(--green)">✓</span> Issue and share Situation Reports (SitReps)<br>
          <span style="color:var(--green)">✓</span> Link mitigations to your IDP<br>
          <span style="color:var(--green)">✓</span> Maintain your stakeholder and hazard owner directory
        </div>`;
    case 1:
      return `
        <div class="fl"><span class="fl-label">Municipality name</span><input class="fl-input" value="${user?.municipalities?.name || ''}" id="ob-muni-name"/></div>
        <div class="frow">
          <div class="fl"><span class="fl-label">Municipality code</span><input class="fl-input" value="${user?.municipalities?.code || ''}" id="ob-muni-code"/></div>
          <div class="fl"><span class="fl-label">Ward count</span><input class="fl-input" type="number" value="${user?.municipalities?.ward_count || ''}" id="ob-ward-count" placeholder="e.g. 13"/></div>
        </div>
        <div class="fl"><span class="fl-label">District</span><input class="fl-input" value="${user?.municipalities?.district || ''}" id="ob-district"/></div>`;
    case 2:
      return `
        <div class="ob-notice">The following hazard categories have been pre-loaded with scoring guidance and mitigation suggestions:</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;color:var(--text2)">
          ${['Hydro-meteorological (10)','Geological (4)','Biological (5)','Fire (5)','Technological (11)','Socio-economic (6)'].map(h => `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:4px;padding:6px 8px">${h}</div>`).join('')}
        </div>
        <div style="margin-top:10px;font-size:11px;color:var(--text3)">You can customise, add or remove hazards after setup. All 38 hazards include pre-built mitigation library suggestions.</div>`;
    case 3:
      return `
        <div class="frow">
          <div class="fl"><span class="fl-label">First name</span><input class="fl-input" id="ob-contact-first" placeholder="First name"/></div>
          <div class="fl"><span class="fl-label">Last name</span><input class="fl-input" id="ob-contact-last" placeholder="Last name"/></div>
        </div>
        <div class="fl"><span class="fl-label">Organisation</span><input class="fl-input" id="ob-contact-org" placeholder="e.g. Municipal Disaster Office"/></div>
        <div class="frow">
          <div class="fl"><span class="fl-label">Cell number</span><input class="fl-input" id="ob-contact-cell" placeholder="082 000 0000"/></div>
          <div class="fl"><span class="fl-label">Email</span><input class="fl-input" id="ob-contact-email" placeholder="name@example.com"/></div>
        </div>`;
    case 4:
      return `
        <div style="text-align:center;padding:10px 0">
          <div style="font-size:40px;margin-bottom:12px">✓</div>
          <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:var(--green);margin-bottom:8px">Setup complete</div>
          <div style="font-size:12px;color:var(--text3);line-height:1.7">
            Your DRMSA instance is ready.<br>
            Start with the <strong style="color:var(--text)">HVC Assessment Tool</strong> to assess your municipality's hazard risk profile,<br>
            or go straight to <strong style="color:var(--text)">Dashboard</strong> to explore the platform.
          </div>
        </div>`;
    default: return '';
  }
}
