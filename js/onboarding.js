// js/onboarding.js
import { supabase } from './supabase.js';

const STEPS = [
  { title: 'Welcome to DRMSA',         sub: 'Let\'s set up your municipality in a few quick steps. This only happens once.' },
  { title: 'Municipality details',      sub: 'Confirm your municipality information and ward count.' },
  { title: 'Hazard library loaded',     sub: 'We\'ve pre-loaded 38 hazard types and mitigation suggestions for your assessment.' },
  { title: 'Add your first contact',    sub: 'Add at least one emergency contact to your stakeholder directory.' },
  { title: 'You\'re ready',             sub: 'DRMSA is set up. You can complete your HVC assessment and add more details at any time.' }
];

export async function initOnboarding(user) {
  const muniId = user?.municipality_id;
  if (!muniId) return false;

  const { data } = await supabase
    .from('municipalities')
    .select('onboarding_complete')
    .eq('id', muniId)
    .single();

  if (data?.onboarding_complete) return false;

  showOnboarding(user, muniId);
  return true;
}

function showOnboarding(user, muniId) {
  // Remove any existing overlay
  document.getElementById('ob-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ob-overlay';
  overlay.className = 'ob-overlay';
  document.body.appendChild(overlay);

  let step = 0;

  function render() {
    const s = STEPS[step];
    const dots = STEPS.map((_, i) =>
      `<div class="ob-dot ${i < step ? 'done' : i === step ? 'on' : ''}"></div>`
    ).join('');

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
            ${step > 0 ? `<button class="btn btn-sm" id="ob-back-btn">Back</button>` : ''}
            <button class="btn btn-sm ${step === STEPS.length - 1 ? 'btn-green' : 'btn-primary'}" id="ob-next-btn">
              ${step === STEPS.length - 1 ? 'Go to dashboard' : 'Next →'}
            </button>
          </div>
        </div>
      </div>`;

    // Bind AFTER innerHTML is set — fresh elements every render
    document.getElementById('ob-next-btn')?.addEventListener('click', async () => {
      if (step === STEPS.length - 1) {
        // Save first contact if filled in
        await saveContact(user, muniId);
        // Mark onboarding complete
        await supabase
          .from('municipalities')
          .update({ onboarding_complete: true })
          .eq('id', muniId);
        overlay.remove();
        // Navigate to dashboard
        const { navigateTo } = await import('./app.js');
        navigateTo('dashboard');
      } else {
        // Save step 1 municipality details if on that step
        if (step === 1) await saveMuniDetails(muniId);
        step++;
        render();
      }
    });

    document.getElementById('ob-back-btn')?.addEventListener('click', () => {
      step--;
      render();
    });
  }

  render();
}

function renderStepBody(step, user) {
  switch (step) {
    case 0:
      return `
        <div class="ob-notice">
          You are setting up <strong>${user?.municipalities?.name || 'your municipality'}</strong> on DRMSA for the first time.
        </div>
        <div style="font-size:13px;color:var(--text2);line-height:2;font-family:Inter,system-ui,sans-serif">
          DRMSA will help you:<br>
          <span style="color:var(--green)">✓</span> Conduct HVC (Hazard, Vulnerability &amp; Capacity) assessments<br>
          <span style="color:var(--green)">✓</span> Manage shelters, relief operations and road closures<br>
          <span style="color:var(--green)">✓</span> Issue and share Situation Reports (SitReps)<br>
          <span style="color:var(--green)">✓</span> Link mitigations to your IDP<br>
          <span style="color:var(--green)">✓</span> Maintain your stakeholder and hazard owner directory
        </div>`;

    case 1:
      return `
        <div class="fl">
          <span class="fl-label">Municipality name</span>
          <input class="fl-input" id="ob-muni-name" value="${user?.municipalities?.name || ''}"/>
        </div>
        <div class="frow">
          <div class="fl">
            <span class="fl-label">Municipality code</span>
            <input class="fl-input" id="ob-muni-code" value="${user?.municipalities?.code || ''}"/>
          </div>
          <div class="fl">
            <span class="fl-label">Ward count</span>
            <input class="fl-input" type="number" id="ob-ward-count" value="${user?.municipalities?.ward_count || ''}" placeholder="e.g. 13"/>
          </div>
        </div>
        <div class="fl">
          <span class="fl-label">District</span>
          <input class="fl-input" id="ob-district" value="${user?.municipalities?.district || ''}"/>
        </div>`;

    case 2:
      return `
        <div class="ob-notice">The following hazard categories have been pre-loaded with scoring guidance and mitigation suggestions:</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          ${['Hydro-meteorological (10)','Geological (4)','Biological (5)','Fire (5)','Technological (11)','Socio-economic (6)'].map(h =>
            `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text2)">${h}</div>`
          ).join('')}
        </div>
        <div style="margin-top:10px;font-size:12px;color:var(--text3);line-height:1.6">
          You can customise, add or remove hazards after setup. All 38 hazards include pre-built mitigation library suggestions.
        </div>`;

    case 3:
      return `
        <div class="frow">
          <div class="fl"><span class="fl-label">First name</span><input class="fl-input" id="ob-c-first" placeholder="First name"/></div>
          <div class="fl"><span class="fl-label">Last name</span><input class="fl-input" id="ob-c-last" placeholder="Last name"/></div>
        </div>
        <div class="fl"><span class="fl-label">Organisation</span><input class="fl-input" id="ob-c-org" placeholder="e.g. Municipal Disaster Office"/></div>
        <div class="frow">
          <div class="fl"><span class="fl-label">Cell number</span><input class="fl-input" id="ob-c-cell" placeholder="082 000 0000"/></div>
          <div class="fl"><span class="fl-label">Email</span><input class="fl-input" id="ob-c-email" placeholder="name@example.com"/></div>
        </div>
        <div style="font-size:12px;color:var(--text3);margin-top:4px">Optional — you can skip this and add contacts later.</div>`;

    case 4:
      return `
        <div style="text-align:center;padding:10px 0">
          <div style="width:56px;height:56px;background:var(--green-dim);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style="font-family:Inter,system-ui,sans-serif;font-size:17px;font-weight:700;color:var(--text);margin-bottom:8px">Setup complete</div>
          <div style="font-size:13px;color:var(--text3);line-height:1.7">
            Your DRMSA instance is ready.<br>
            Start with the <strong style="color:var(--text)">HVC Assessment Tool</strong> to assess your municipality's hazard risk profile.
          </div>
        </div>`;

    default:
      return '';
  }
}

async function saveMuniDetails(muniId) {
  const name      = document.getElementById('ob-muni-name')?.value.trim();
  const code      = document.getElementById('ob-muni-code')?.value.trim();
  const wardCount = parseInt(document.getElementById('ob-ward-count')?.value) || 0;
  const district  = document.getElementById('ob-district')?.value.trim();

  if (!name) return;

  await supabase.from('municipalities').update({
    name, code, ward_count: wardCount, district
  }).eq('id', muniId);
}

async function saveContact(user, muniId) {
  const first = document.getElementById('ob-c-first')?.value.trim();
  const last  = document.getElementById('ob-c-last')?.value.trim();
  if (!first || !last) return; // optional step

  // Find or create a default org
  let orgId = null;
  const orgName = document.getElementById('ob-c-org')?.value.trim() || 'Municipal Disaster Office';

  const { data: existingOrg } = await supabase
    .from('stakeholder_orgs')
    .select('id')
    .eq('municipality_id', muniId)
    .eq('name', orgName)
    .single();

  if (existingOrg) {
    orgId = existingOrg.id;
  } else {
    const { data: newOrg } = await supabase
      .from('stakeholder_orgs')
      .insert({ municipality_id: muniId, name: orgName, sector: 'Government', is_active: true })
      .select('id')
      .single();
    orgId = newOrg?.id;
  }

  if (!orgId) return;

  await supabase.from('stakeholder_contacts').insert({
    org_id:          orgId,
    municipality_id: muniId,
    full_name:       `${first} ${last}`,
    cell:            document.getElementById('ob-c-cell')?.value.trim(),
    email:           document.getElementById('ob-c-email')?.value.trim(),
    is_active:       true,
    is_primary:      true
  });
}
