// js/mopup.js
import { supabase } from './supabase.js';

let _muniId = null;
let _user = null;

export async function initMopup(user) {
  _user = user;
  _muniId = user?.municipality_id;
  await renderMopupList();
}

async function renderMopupList() {
  const page = document.getElementById('page-mopup');
  if (!page) return;

  const { data: reports } = await supabase
    .from('mopup_reports')
    .select('*')
    .eq('municipality_id', _muniId)
    .order('created_at', { ascending: false });

  page.innerHTML = `
    <div class="mu-full">
      <div class="mu-head">
        <div>
          <div class="mu-title">Mop-up Reports</div>
          <div class="mu-sub">${_user?.municipalities?.name || ''} · ${reports?.length || 0} reports</div>
        </div>
        <button class="btn btn-green" id="new-mopup-btn">+ New mop-up report</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:22px">
        ${reports?.length ? reports.map(r => renderMopupListItem(r)).join('') : `
          <div style="text-align:center;padding:48px 20px;color:var(--text3);font-size:12px;font-family:var(--font-mono)">
            No mop-up reports yet.<br>Create a mop-up report after an incident has been resolved.
          </div>`}
      </div>
    </div>`;

  document.getElementById('new-mopup-btn')?.addEventListener('click', () => createMopup());
  page.querySelectorAll('.mopup-list-item').forEach(item => {
    item.addEventListener('click', () => openMopup(item.dataset.id));
  });
}

function renderMopupListItem(r) {
  return `
    <div class="rec-card mopup-list-item" data-id="${r.id}" style="cursor:pointer">
      <div class="rec-head">
        <div class="rec-icon" style="background:var(--green-dim)">
          <svg viewBox="0 0 15 15" fill="none" style="stroke:var(--green)"><polyline points="2,8 5,11 12,4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div>
          <div class="rec-name">${r.incident_name || 'Unnamed incident'}</div>
          <div class="rec-meta">MOPUP-${String(r.report_number).padStart(2,'0')} · ${r.hazard_type || '—'} · ${r.activation_date ? new Date(r.activation_date).toLocaleDateString('en-ZA') : '—'} – ${r.standdown_date ? new Date(r.standdown_date).toLocaleDateString('en-ZA') : '—'}</div>
        </div>
        <div class="rec-badges">
          <span class="badge ${r.is_authorised ? 'b-green' : 'b-amber'}">${r.is_authorised ? 'AUTHORISED' : 'DRAFT'}</span>
          <span class="badge ${r.is_published ? 'b-green' : 'b-gray'}">${r.is_published ? 'PUBLISHED' : 'UNPUBLISHED'}</span>
        </div>
      </div>
    </div>`;
}

async function createMopup() {
  const { data: reports } = await supabase.from('mopup_reports').select('report_number').eq('municipality_id', _muniId);
  const nextNum = reports?.length ? Math.max(...reports.map(r => r.report_number || 0)) + 1 : 1;

  const { data, error } = await supabase.from('mopup_reports').insert({
    municipality_id: _muniId,
    report_number: nextNum,
    incident_name: '',
    status: 'draft',
    is_authorised: false,
    is_published: false,
    total_affected: 0, fatalities: 0, injuries: 0,
    properties_damaged: 0, structures_destroyed: 0,
    lessons_worked_well: [], lessons_to_improve: [],
    recommendations: [], financial_summary: {}
  }).select().single();

  if (!error && data) openMopup(data.id);
}

async function openMopup(id) {
  const { data: r } = await supabase.from('mopup_reports').select('*').eq('id', id).single();
  if (!r) return;

  const page = document.getElementById('page-mopup');
  if (!page) return;

  const num = String(r.report_number).padStart(2,'0');

  page.innerHTML = `
    <div class="mu-full">
      <div class="mu-head">
        <button class="btn btn-sm" id="mu-back" style="margin-right:8px">← List</button>
        <div style="flex:1">
          <div class="mu-title">Mop-up Report — MOPUP-${num}</div>
          <div class="mu-sub">${r.incident_name || 'New incident'} · ${_user?.municipalities?.name || ''}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="sr-num green">MOPUP-${num}</span>
          <span class="badge ${r.is_authorised ? 'b-green' : 'b-amber'}">${r.is_authorised ? 'AUTHORISED' : 'DRAFT'}</span>
        </div>
      </div>
      <div class="mu-tabs">
        <div class="mutab on" data-tab="summary">Summary</div>
        <div class="mutab" data-tab="response">Response</div>
        <div class="mutab" data-tab="lessons">Lessons learned</div>
        <div class="mutab" data-tab="recommendations">Recommendations</div>
      </div>
      <div class="mu-body" id="mu-body">
        ${renderMopupSummary(r)}
      </div>
      <div class="share-foot">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);font-family:var(--font-mono)">Share Mop-up Report</span>
          <div style="display:flex;align-items:center;gap:8px">
            ${r.is_authorised ? `
              <div class="tog-track ${r.is_published ? 'on' : ''}" id="mu-pub-tog"><div class="tog-knob"></div></div>
              <span style="font-size:11px;font-weight:700;font-family:var(--font-mono);color:${r.is_published ? 'var(--green)' : 'var(--text3)'}" id="mu-pub-lbl">${r.is_published ? 'PUBLISHED' : 'DRAFT'}</span>
            ` : `<span style="font-size:11px;color:var(--amber);font-family:var(--font-mono);font-weight:700">⚠ Requires municipal manager sign-off to publish</span>`}
          </div>
        </div>
        <div class="share-channels">
          <button class="sch pdf" onclick="generateMopupPDF()"><div class="sch-ico" style="background:var(--red-dim)"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--red)" stroke-width="1.4" stroke-linecap="round"><rect x="1.5" y="1" width="7" height="8" rx="1"/><line x1="3" y1="4" x2="7" y2="4"/><line x1="3" y1="6" x2="6" y2="6"/></svg></div>PDF report</button>
          <button class="sch em"><div class="sch-ico" style="background:var(--blue-dim)"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--blue)" stroke-width="1.4" stroke-linecap="round"><rect x="1" y="2.5" width="8" height="6" rx=".5"/><path d="M1 3l4 3 4-3"/></svg></div>Email distrib.</button>
          <button class="sch portal" ${!r.is_authorised ? 'disabled style="opacity:.4;cursor:not-allowed"' : ''}><div class="sch-ico" style="background:var(--green-dim)"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--green)" stroke-width="1.4" stroke-linecap="round"><circle cx="5" cy="5" r="4"/><path d="M1 5h8M5 1c-1.5 1.5-2 3-2 4s.5 2.5 2 4M5 1c1.5 1.5 2 3 2 4s-.5 2.5-2 4"/></svg></div>Public portal</button>
        </div>
        <div class="sp-url-row">
          <div class="sp-url">${window.location.origin}/incidents/${r.id}/mopup-${num}</div>
          <button class="btn btn-sm" onclick="navigator.clipboard?.writeText(this.previousElementSibling.textContent);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy link',1500)">Copy link</button>
        </div>
      </div>
    </div>`;

  document.getElementById('mu-back')?.addEventListener('click', renderMopupList);

  page.querySelectorAll('.mutab').forEach(tab => {
    tab.addEventListener('click', () => {
      page.querySelectorAll('.mutab').forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      const body = document.getElementById('mu-body');
      if (!body) return;
      switch (tab.dataset.tab) {
        case 'summary':        body.innerHTML = renderMopupSummary(r); bindMopupSummaryEvents(r); break;
        case 'response':       body.innerHTML = renderMopupResponse(r); bindMopupResponseEvents(r); break;
        case 'lessons':        body.innerHTML = renderMopupLessons(r); bindMopupLessonEvents(r); break;
        case 'recommendations': body.innerHTML = renderMopupRecommendations(r); bindMopupRecommendEvents(r); break;
      }
    });
  });

  bindMopupSummaryEvents(r);

  document.getElementById('mu-pub-tog')?.addEventListener('click', async function() {
    if (!r.is_authorised) return;
    this.classList.toggle('on');
    const isOn = this.classList.contains('on');
    const lbl = document.getElementById('mu-pub-lbl');
    if (lbl) { lbl.textContent = isOn ? 'PUBLISHED' : 'DRAFT'; lbl.style.color = isOn ? 'var(--green)' : 'var(--text3)'; }
    await supabase.from('mopup_reports').update({ is_published: isOn }).eq('id', r.id);
  });
}

function renderMopupSummary(r) {
  const fin = r.financial_summary || {};
  const total = Object.values(fin).reduce((a, b) => a + (parseFloat(b) || 0), 0);
  return `
    <div class="fsec">
      <div class="fsec-title">Incident details</div>
      <div class="fl"><span class="fl-label">Incident name</span><input class="fl-input" id="mu-name" value="${r.incident_name || ''}"/></div>
      <div class="frow">
        <div class="fl">
          <span class="fl-label">Hazard type</span>
          <select class="fl-sel" id="mu-hazard">
            <option value="">— Select hazard type —</option>
            ${[
              'Flooding','Flash flooding','Storm surge','Drought','Extreme heat','Extreme cold','High winds','Hailstorm','Lightning','Wildfire / Veld fire',
              'Earthquake','Landslide / Mudslide','Sinkhole','Tsunami',
              'Disease outbreak','Animal disease','Pest infestation','Algal bloom','Human epidemic / Pandemic',
              'Urban fire','Industrial fire','Informal settlement fire',
              'Hazardous materials spill','Chemical leak','Gas leak','Dam failure','Bridge failure','Building collapse','Power grid failure','Water supply failure','Sewage / Wastewater failure','Transport accident','Train accident','Aviation incident',
              'Civil unrest','Illegal land invasion','Food insecurity','Mass casualty event',
              'Other / Custom'
            ].map(h=>'<option value="'+h+'" '+(r.hazard_type===h?'selected':'')+'>'+h+'</option>').join('')}
          </select>
        </div>
        <div class="fl"><span class="fl-label">Duration (days)</span><input class="fl-input" type="number" id="mu-duration" value="${r.duration_days || ''}"/></div>
      </div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Activation date</span><input class="fl-input" type="date" id="mu-activation" value="${r.activation_date ? r.activation_date.slice(0,10) : ''}"/></div>
        <div class="fl"><span class="fl-label">Stand-down date</span><input class="fl-input" type="date" id="mu-standdown" value="${r.standdown_date ? r.standdown_date.slice(0,10) : ''}"/></div>
      </div>
      <div class="fl"><span class="fl-label">SitReps issued</span><input class="fl-input" type="number" id="mu-sitreps" value="${r.sitreps_issued || ''}"/></div>
      <div class="fl"><span class="fl-label">Incident narrative</span><textarea class="fl-textarea" id="mu-narrative" rows="4">${r.narrative || ''}</textarea></div>
    </div>
    <div class="fsec">
      <div class="fsec-title">Final impact figures</div>
      <div class="stat-grid-3">
        <div class="stat-box"><div class="stat-lbl">Total affected</div><input type="number" class="fl-input" id="mu-affected" value="${r.total_affected||0}" style="font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--amber);border:none;background:transparent;padding:0"/><div class="stat-sub">persons</div></div>
        <div class="stat-box"><div class="stat-lbl">Fatalities</div><input type="number" class="fl-input" id="mu-fatalities" value="${r.fatalities||0}" style="font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--red);border:none;background:transparent;padding:0"/><div class="stat-sub">confirmed</div></div>
        <div class="stat-box"><div class="stat-lbl">Injuries</div><input type="number" class="fl-input" id="mu-injuries" value="${r.injuries||0}" style="font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--amber);border:none;background:transparent;padding:0"/><div class="stat-sub">treated</div></div>
        <div class="stat-box"><div class="stat-lbl">Properties</div><input type="number" class="fl-input" id="mu-properties" value="${r.properties_damaged||0}" style="font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--amber);border:none;background:transparent;padding:0"/><div class="stat-sub">damaged</div></div>
        <div class="stat-box"><div class="stat-lbl">Destroyed</div><input type="number" class="fl-input" id="mu-destroyed" value="${r.structures_destroyed||0}" style="font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--red);border:none;background:transparent;padding:0"/><div class="stat-sub">structures</div></div>
        <div class="stat-box"><div class="stat-lbl">Duration</div><div class="stat-num blue">${r.duration_days||'—'}</div><div class="stat-sub">days active</div></div>
      </div>
    </div>
    <div class="fsec">
      <div class="fsec-title">Financial summary</div>
      ${['Relief distribution','Emergency repairs','Personnel overtime','Equipment & logistics'].map((cat,i)=>{
        const key = ['relief','repairs','personnel','equipment'][i];
        const val = fin[key]||0;
        const pct = total ? Math.round((val/total)*100) : 0;
        return `<div class="prog-item">
          <div class="pi-label"><span>${cat}</span><div style="display:flex;align-items:center;gap:8px"><input style="width:100px;font-size:11px;font-family:var(--font-mono);background:var(--bg3);border:1px solid var(--border);border-radius:3px;padding:2px 5px;color:var(--text);text-align:right" id="fin-${key}" value="${val}" placeholder="R 0.00"/></div></div>
          <div class="pi-bar-bg"><div class="pi-bar-fg" style="width:${pct}%;background:var(--blue)"></div></div>
        </div>`;
      }).join('')}
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-top:1px solid var(--border);font-size:12px">
        <span style="color:var(--text2);font-weight:600">Total expenditure</span>
        <span style="font-family:var(--font-mono);font-weight:700;color:var(--text)" id="fin-total">R ${total.toLocaleString('en-ZA', {minimumFractionDigits:2})}</span>
      </div>
    </div>
    <div class="fsec">
      <div class="fsec-title">Authorisation</div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Compiled by</span><input class="fl-input" id="mu-compiled-by" value="${r.compiled_by||_user?.full_name||''}"/></div>
        <div class="fl"><span class="fl-label">Municipal Manager sign-off</span><input class="fl-input" id="mu-authorised-by" value="${r.authorised_by||''}" placeholder="Name + date"/></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-green btn-sm" id="mu-save-btn">Save report</button>
        ${!r.is_authorised ? `<button class="btn btn-sm" id="mu-authorise-btn" style="border-color:var(--amber);color:var(--amber)">Mark as authorised</button>` : ''}
      </div>
    </div>`;
}

function renderMopupResponse(r) {
  const orgs = r.organisations_deployed || [];
  return `
    <div class="fsec">
      <div class="fsec-title">Organisations deployed</div>
      ${orgs.map(o=>`<div class="org-row"><div class="org-dot" style="background:var(--blue)"></div><span class="org-name">${o.name}</span><span class="org-role">${o.role}</span><span class="org-status" style="background:var(--green-dim);color:var(--green)">STOOD DOWN</span></div>`).join('')}
      <button class="btn btn-sm btn-green" style="margin-top:8px" id="add-org-btn">+ Add organisation</button>
    </div>
    <div class="fsec">
      <div class="fsec-title">Total relief distributed</div>
      ${['Food parcels','Water (5L)','Blankets','Hygiene kits','Baby packs','SASSA vouchers'].map((item,i)=>{
        const key = ['food_parcels','water_units','blankets','hygiene_kits','baby_packs','sassa_vouchers'][i];
        const val = (r.relief_totals||{})[key]||0;
        return `<div class="auto-row"><div class="ar-label">${item}</div><input class="fl-input" style="margin-top:3px" value="${val}" placeholder="0 units" id="rt-${key}"/></div>`;
      }).join('')}
      <button class="btn btn-sm btn-green" style="margin-top:8px" id="save-totals-btn">Save totals</button>
    </div>`;
}

function renderMopupLessons(r) {
  const worked = r.lessons_worked_well || [];
  const improve = r.lessons_to_improve || [];
  return `
    <div class="fsec">
      <div class="fsec-title">What worked well</div>
      ${worked.map(l=>`<div class="lesson-item"><div class="l-icon" style="background:var(--green-dim)"><svg viewBox="0 0 11 11" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,6 4.5,8.5 9,3"/></svg></div><div><div class="l-label" style="color:var(--green)">${l.title||''}</div><div class="l-desc">${l.description||''}</div></div></div>`).join('')}
      <div style="display:flex;gap:6px;margin-top:8px">
        <input class="fl-input" id="worked-title" placeholder="Title" style="width:140px"/>
        <input class="fl-input" id="worked-desc" placeholder="Description…" style="flex:1"/>
        <button class="btn btn-sm btn-green" id="add-worked-btn">+ Add</button>
      </div>
    </div>
    <div class="fsec">
      <div class="fsec-title">What needs improvement</div>
      ${improve.map(l=>`<div class="lesson-item"><div class="l-icon" style="background:var(--red-dim)"><svg viewBox="0 0 11 11" fill="none" stroke="var(--red)" stroke-width="2" stroke-linecap="round"><line x1="2.5" y1="2.5" x2="8.5" y2="8.5"/><line x1="8.5" y1="2.5" x2="2.5" y2="8.5"/></svg></div><div><div class="l-label" style="color:var(--red)">${l.title||''}</div><div class="l-desc">${l.description||''}</div></div></div>`).join('')}
      <div style="display:flex;gap:6px;margin-top:8px">
        <input class="fl-input" id="improve-title" placeholder="Title" style="width:140px"/>
        <input class="fl-input" id="improve-desc" placeholder="Description…" style="flex:1"/>
        <button class="btn btn-sm btn-red" id="add-improve-btn">+ Add</button>
      </div>
    </div>`;
}

function renderMopupRecommendations(r) {
  const recs = r.recommendations || [];
  return `
    <div class="fsec">
      <div class="fsec-title">Recommendations — link to IDP & mitigation library</div>
      ${recs.map((rec,i)=>`
        <div class="action-item">
          <div class="a-cb ${rec.done?'done':''}" onclick="toggleMuRec(${i})"></div>
          <div class="a-text ${rec.done?'done':''}">${rec.text||''}</div>
          <div class="a-who" style="color:var(--blue)">${rec.idp_kpa||''}</div>
        </div>`).join('')}
      <div style="display:flex;gap:6px;margin-top:10px">
        <input class="fl-input" id="rec-text" placeholder="Recommendation…" style="flex:1"/>
        <select class="fl-sel" id="rec-kpa" style="width:120px">
          <option value="">No KPA</option>
          <option value="IDP KPA 1">IDP KPA 1</option>
          <option value="IDP KPA 2">IDP KPA 2</option>
          <option value="IDP KPA 3">IDP KPA 3</option>
          <option value="HVC Tool">HVC Tool</option>
        </select>
        <button class="btn btn-sm btn-green" id="add-rec-btn">+ Add</button>
      </div>
    </div>`;
}

function bindMopupSummaryEvents(r) {
  document.getElementById('mu-save-btn')?.addEventListener('click', async () => {
    const fin = {
      relief: parseFloat(document.getElementById('fin-relief')?.value)||0,
      repairs: parseFloat(document.getElementById('fin-repairs')?.value)||0,
      personnel: parseFloat(document.getElementById('fin-personnel')?.value)||0,
      equipment: parseFloat(document.getElementById('fin-equipment')?.value)||0
    };
    const { error } = await supabase.from('mopup_reports').update({
      incident_name: document.getElementById('mu-name')?.value,
      hazard_type: document.getElementById('mu-hazard')?.value,
      duration_days: parseInt(document.getElementById('mu-duration')?.value)||null,
      activation_date: document.getElementById('mu-activation')?.value||null,
      standdown_date: document.getElementById('mu-standdown')?.value||null,
      sitreps_issued: parseInt(document.getElementById('mu-sitreps')?.value)||null,
      narrative: document.getElementById('mu-narrative')?.value,
      total_affected: parseInt(document.getElementById('mu-affected')?.value)||0,
      fatalities: parseInt(document.getElementById('mu-fatalities')?.value)||0,
      injuries: parseInt(document.getElementById('mu-injuries')?.value)||0,
      properties_damaged: parseInt(document.getElementById('mu-properties')?.value)||0,
      structures_destroyed: parseInt(document.getElementById('mu-destroyed')?.value)||0,
      financial_summary: fin,
      compiled_by: document.getElementById('mu-compiled-by')?.value,
      authorised_by: document.getElementById('mu-authorised-by')?.value,
      updated_at: new Date().toISOString()
    }).eq('id', r.id);
    if (!error) showToast('Mop-up report saved');
  });

  document.getElementById('mu-authorise-btn')?.addEventListener('click', async () => {
    const authorisedBy = document.getElementById('mu-authorised-by')?.value.trim();
    if (!authorisedBy) { alert('Please enter the municipal manager\'s name before authorising.'); return; }
    await supabase.from('mopup_reports').update({ is_authorised: true, authorised_by: authorisedBy, authorised_at: new Date().toISOString() }).eq('id', r.id);
    r.is_authorised = true;
    document.getElementById('mu-authorise-btn')?.remove();
    showToast('Report authorised');
  });
}

function bindMopupResponseEvents(r) {
  document.getElementById('add-org-btn')?.addEventListener('click', () => {
    const existing = document.getElementById('org-inline-form');
    if (existing) { existing.remove(); return; }
    const btn = document.getElementById('add-org-btn');
    const form = document.createElement('div');
    form.id = 'org-inline-form';
    form.style.cssText = 'background:var(--bg3);border:1px solid var(--border2);border-radius:8px;padding:12px;margin-top:8px;display:flex;flex-direction:column;gap:8px';
    form.innerHTML = `
      <div class="frow">
        <div class="fl"><span class="fl-label">Organisation name</span><input class="fl-input" id="org-inline-name" placeholder="e.g. SAPS Clanwilliam"/></div>
        <div class="fl"><span class="fl-label">Role in response</span><input class="fl-input" id="org-inline-role" placeholder="e.g. Search & rescue"/></div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-green btn-sm" id="save-org-inline-btn">Save</button>
        <button class="btn btn-sm" id="cancel-org-inline-btn">Cancel</button>
      </div>`;
    btn.after(form);

    document.getElementById('cancel-org-inline-btn')?.addEventListener('click', () => form.remove());
    document.getElementById('save-org-inline-btn')?.addEventListener('click', async () => {
      const name = document.getElementById('org-inline-name')?.value.trim();
      const role = document.getElementById('org-inline-role')?.value.trim();
      if (!name) { alert('Organisation name required.'); return; }
      const orgs = [...(r.organisations_deployed||[]), { name, role }];
      const { error } = await supabase.from('mopup_reports').update({ organisations_deployed: orgs }).eq('id', r.id);
      if (error) { showToast(error.message, true); return; }
      r.organisations_deployed = orgs;
      document.getElementById('mu-body').innerHTML = renderMopupResponse(r);
      bindMopupResponseEvents(r);
      showToast('✓ Organisation added');
    });
  });

  document.getElementById('save-totals-btn')?.addEventListener('click', async () => {
    const keys = ['food_parcels','water_units','blankets','hygiene_kits','baby_packs','sassa_vouchers'];
    const totals = {};
    keys.forEach(k => {
      const val = document.getElementById(`rt-${k}`)?.value;
      if (val) totals[k] = val;
    });
    const { error } = await supabase.from('mopup_reports').update({ relief_totals: totals }).eq('id', r.id);
    if (error) { showToast(error.message, true); return; }
    r.relief_totals = totals;
    showToast('✓ Relief totals saved');
  });
}

function bindMopupLessonEvents(r) {
  document.getElementById('add-worked-btn')?.addEventListener('click', async () => {
    const title = document.getElementById('worked-title')?.value.trim();
    const desc = document.getElementById('worked-desc')?.value.trim();
    if (!title) return;
    const arr = [...(r.lessons_worked_well||[]), { title, description: desc }];
    await supabase.from('mopup_reports').update({ lessons_worked_well: arr }).eq('id', r.id);
    r.lessons_worked_well = arr;
    document.getElementById('mu-body').innerHTML = renderMopupLessons(r);
    bindMopupLessonEvents(r);
  });

  document.getElementById('add-improve-btn')?.addEventListener('click', async () => {
    const title = document.getElementById('improve-title')?.value.trim();
    const desc = document.getElementById('improve-desc')?.value.trim();
    if (!title) return;
    const arr = [...(r.lessons_to_improve||[]), { title, description: desc }];
    await supabase.from('mopup_reports').update({ lessons_to_improve: arr }).eq('id', r.id);
    r.lessons_to_improve = arr;
    document.getElementById('mu-body').innerHTML = renderMopupLessons(r);
    bindMopupLessonEvents(r);
  });
}

function bindMopupRecommendEvents(r) {
  document.getElementById('add-rec-btn')?.addEventListener('click', async () => {
    const text = document.getElementById('rec-text')?.value.trim();
    if (!text) return;
    const arr = [...(r.recommendations||[]), { text, idp_kpa: document.getElementById('rec-kpa')?.value, done: false }];
    await supabase.from('mopup_reports').update({ recommendations: arr }).eq('id', r.id);
    r.recommendations = arr;
    document.getElementById('mu-body').innerHTML = renderMopupRecommendations(r);
    bindMopupRecommendEvents(r);
  });
}

window.toggleMuRec = async function(idx) {};

window.generateMopupPDF = function() {
  const body = document.getElementById('mu-body')?.innerText || '';
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Mop-up Report</title><style>body{font-family:Arial,sans-serif;padding:40px;max-width:700px;margin:0 auto;font-size:13px;line-height:1.6}footer{margin-top:40px;font-size:10px;color:#888;border-top:1px solid #eee;padding-top:12px}</style></head><body><h1>Mop-up Report</h1><pre style="white-space:pre-wrap">${body}</pre><footer>DRMSA Platform · Created by Diswayne Maarman · Apache 2.0</footer></body></html>`);
  win.print();
};

function showToast(msg, isError = false) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:${isError?'var(--red-dim)':'var(--green-dim)'};border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:10px 16px;border-radius:6px;font-size:12px;font-family:var(--font-mono);font-weight:700;z-index:500`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},2500);
}
