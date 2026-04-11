// js/mopup.js
import { supabase } from './supabase.js';
import { showDownloadMenu, docHeader } from './download.js';

let _muniId = null;
let _user = null;
let _currentMopup = null;
let _mopupAutoSaveTimer = null;
let _mopupAutoSaveBusy = false;
let _mopupAutoSaveQueued = false;

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
    item.addEventListener('click', (e) => {
      if (e.target.closest('.mu-delete-btn')) return;
      openMopup(item.dataset.id);
    });
  });

  page.querySelectorAll('.mu-delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id  = btn.dataset.id;
      const num = btn.dataset.num;
      if (!confirm(`Delete MOPUP-${num}? This cannot be undone.`)) return;
      const { error } = await supabase.from('mopup_reports').delete().eq('id', id);
      if (error) { alert('Delete failed: ' + error.message); return; }
      await renderMopupList();
    });
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
        <button class="btn btn-sm btn-red mu-delete-btn" data-id="${r.id}" data-num="${String(r.report_number).padStart(2,'0')}" style="margin-left:6px;flex-shrink:0" title="Delete report">✕</button>
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
  _currentMopup = r;

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
          <span style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);font-family:var(--font-mono)">MOPUP-${num}</span>
          <div style="display:flex;align-items:center;gap:8px">
            ${r.is_authorised ? `
              <div class="tog-track ${r.is_published ? 'on' : ''}" id="mu-pub-tog"><div class="tog-knob"></div></div>
              <span style="font-size:11px;font-weight:700;font-family:var(--font-mono);color:${r.is_published ? 'var(--green)' : 'var(--text3)'}" id="mu-pub-lbl">${r.is_published ? 'PUBLISHED' : 'DRAFT'}</span>
            ` : `<span style="font-size:11px;color:var(--amber);font-family:var(--font-mono);font-weight:700">⚠ Requires municipal manager sign-off to publish</span>`}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm" id="mu-download-btn">↓ Download</button>
          <button class="btn btn-sm" id="mu-email-btn">✉ Email report</button>
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

  document.getElementById('mu-download-btn')?.addEventListener('click', function() {
    const muniName = _user?.municipalities?.name || 'Municipality';
    const num = String(r.report_number).padStart(2,'0');
    showDownloadMenu(this, {
      filename: `MOPUP-${num}-${muniName.replace(/\s+/g,'-')}`,
      getPDF: () => generateMopupPDF(),
      getCSVRows: () => getMopupCSVRows(r),
      getDocHTML: () => getMopupDocHTML(r, muniName),
      dropup: true
    });
  });

  document.getElementById('mu-email-btn')?.addEventListener('click', () => {
    const muniName = _user?.municipalities?.name || 'Municipality';
    const num = String(r.report_number).padStart(2,'0');
    const lines = [
      `MOP-UP REPORT — MOPUP-${num}`,
      `${muniName} · ${new Date().toLocaleString('en-ZA')}`,
      '',
      `Incident: ${r.incident_name||'—'}`,
      `Hazard: ${r.hazard_type||'—'}`,
      `Duration: ${r.duration_days||'—'} days`,
      `Total affected: ${r.total_affected||0}`,
      `Fatalities: ${r.fatalities||0}`,
      `Injuries: ${r.injuries||0}`,
      '',
      r.narrative||'',
      '',
      `Compiled by: ${r.compiled_by||'—'}`,
      `Issued by: ${muniName} Disaster Management Centre`
    ];
    const subject = encodeURIComponent(`Mop-up Report — ${r.incident_name||num} — ${muniName}`);
    window.open(`mailto:?subject=${subject}&body=${encodeURIComponent(lines.join('\n'))}`);
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
  const triggerAutoSave = () => scheduleMopupSummaryAutoSave(r.id);
  document.querySelectorAll('#mu-body input, #mu-body textarea, #mu-body select').forEach(el => {
    el.addEventListener('input', triggerAutoSave);
    el.addEventListener('change', triggerAutoSave);
  });

  document.getElementById('mu-save-btn')?.addEventListener('click', async () => {
    const ok = await persistMopupSummary(r.id);
    if (ok) showToast('Mop-up report saved');
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

function readMopupSummaryPayload() {
  const fin = {
    relief: parseFloat(document.getElementById('fin-relief')?.value) || 0,
    repairs: parseFloat(document.getElementById('fin-repairs')?.value) || 0,
    personnel: parseFloat(document.getElementById('fin-personnel')?.value) || 0,
    equipment: parseFloat(document.getElementById('fin-equipment')?.value) || 0
  };
  return {
    incident_name: document.getElementById('mu-name')?.value,
    hazard_type: document.getElementById('mu-hazard')?.value,
    duration_days: parseInt(document.getElementById('mu-duration')?.value) || null,
    activation_date: document.getElementById('mu-activation')?.value || null,
    standdown_date: document.getElementById('mu-standdown')?.value || null,
    sitreps_issued: parseInt(document.getElementById('mu-sitreps')?.value) || null,
    narrative: document.getElementById('mu-narrative')?.value,
    total_affected: parseInt(document.getElementById('mu-affected')?.value) || 0,
    fatalities: parseInt(document.getElementById('mu-fatalities')?.value) || 0,
    injuries: parseInt(document.getElementById('mu-injuries')?.value) || 0,
    properties_damaged: parseInt(document.getElementById('mu-properties')?.value) || 0,
    structures_destroyed: parseInt(document.getElementById('mu-destroyed')?.value) || 0,
    financial_summary: fin,
    compiled_by: document.getElementById('mu-compiled-by')?.value,
    authorised_by: document.getElementById('mu-authorised-by')?.value,
    updated_at: new Date().toISOString()
  };
}

async function persistMopupSummary(id) {
  if (!id) return false;
  const { error } = await supabase.from('mopup_reports').update(readMopupSummaryPayload()).eq('id', id);
  if (error) {
    showToast('Auto-save failed: ' + error.message, true);
    return false;
  }
  return true;
}

function scheduleMopupSummaryAutoSave(id) {
  if (!id) return;
  clearTimeout(_mopupAutoSaveTimer);
  _mopupAutoSaveTimer = setTimeout(() => runMopupSummaryAutoSave(id), 1200);
}

async function runMopupSummaryAutoSave(id) {
  if (_mopupAutoSaveBusy) {
    _mopupAutoSaveQueued = true;
    return;
  }
  _mopupAutoSaveBusy = true;
  const ok = await persistMopupSummary(id);
  if (ok) {
    const title = document.querySelector('.mu-title');
    if (title && !title.textContent.includes('Saved')) {
      const prev = title.textContent;
      title.textContent = `${prev} • Saved`;
      setTimeout(() => {
        if (title.textContent.includes('• Saved')) title.textContent = prev;
      }, 1000);
    }
  }
  _mopupAutoSaveBusy = false;
  if (_mopupAutoSaveQueued) {
    _mopupAutoSaveQueued = false;
    scheduleMopupSummaryAutoSave(id);
  }
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

function getMopupCSVRows(r) {
  const fin = r.financial_summary || {};
  return [
    ['Field','Value'],
    ['Report', `MOPUP-${String(r.report_number).padStart(2,'0')}`],
    ['Incident', r.incident_name||''],
    ['Hazard', r.hazard_type||''],
    ['Duration (days)', r.duration_days||''],
    ['Activation date', r.activation_date||''],
    ['Stand-down date', r.standdown_date||''],
    ['Total affected', r.total_affected||0],
    ['Fatalities', r.fatalities||0],
    ['Injuries', r.injuries||0],
    ['Properties damaged', r.properties_damaged||0],
    ['Structures destroyed', r.structures_destroyed||0],
    ['Relief (R)', fin.relief||0],
    ['Repairs (R)', fin.repairs||0],
    ['Personnel (R)', fin.personnel||0],
    ['Equipment (R)', fin.equipment||0],
    ['Compiled by', r.compiled_by||''],
    ['Authorised by', r.authorised_by||''],
  ];
}

function getMopupDocHTML(r, muniName) {
  const num = String(r.report_number).padStart(2,'0');
  const fin = r.financial_summary || {};
  const total = Object.values(fin).reduce((a,b)=>a+(parseFloat(b)||0),0);
  return `${docHeader(`Mop-up Report — MOPUP-${num}`, muniName, r.incident_name||'')}
  <h2>Incident Details</h2>
  <table><tr><th>Field</th><th>Value</th></tr>
  <tr><td>Hazard type</td><td>${r.hazard_type||'—'}</td></tr>
  <tr><td>Duration</td><td>${r.duration_days||'—'} days</td></tr>
  <tr><td>Activation</td><td>${r.activation_date||'—'}</td></tr>
  <tr><td>Stand-down</td><td>${r.standdown_date||'—'}</td></tr>
  </table>
  <h2>Final Impact</h2>
  <table><tr><th>Category</th><th>Count</th></tr>
  <tr><td>Total affected</td><td>${r.total_affected||0}</td></tr>
  <tr><td>Fatalities</td><td>${r.fatalities||0}</td></tr>
  <tr><td>Injuries</td><td>${r.injuries||0}</td></tr>
  <tr><td>Properties damaged</td><td>${r.properties_damaged||0}</td></tr>
  </table>
  <h2>Financial Summary</h2>
  <table><tr><th>Category</th><th>Amount (R)</th></tr>
  <tr><td>Relief distribution</td><td>${fin.relief||0}</td></tr>
  <tr><td>Emergency repairs</td><td>${fin.repairs||0}</td></tr>
  <tr><td>Personnel overtime</td><td>${fin.personnel||0}</td></tr>
  <tr><td>Equipment &amp; logistics</td><td>${fin.equipment||0}</td></tr>
  <tr><td><strong>Total</strong></td><td><strong>R ${total.toLocaleString('en-ZA',{minimumFractionDigits:2})}</strong></td></tr>
  </table>
  <h2>Narrative</h2><p>${r.narrative||'—'}</p>
  <p><strong>Compiled by:</strong> ${r.compiled_by||'—'} &nbsp;|&nbsp; <strong>Authorised by:</strong> ${r.authorised_by||'—'}</p>
  <p>Issued by: ${muniName} Disaster Management Centre</p>`;
}

window.generateMopupPDF = function() {
  const r = _currentMopup;
  if (!r) return;
  const muniName = _user?.municipalities?.name || 'Municipality';
  const num      = String(r.report_number).padStart(2,'0');
  const fin      = r.financial_summary || {};
  const total    = Object.values(fin).reduce((a,b) => a + (parseFloat(b)||0), 0);
  const orgs     = r.organisations_deployed || [];
  const worked   = r.lessons_worked_well || [];
  const improve  = r.lessons_to_improve || [];
  const recs     = r.recommendations || [];
  const relief   = r.relief_totals || {};

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-ZA', {day:'numeric',month:'long',year:'numeric'}) : '—';
  const cur = (v) => `R ${(parseFloat(v)||0).toLocaleString('en-ZA', {minimumFractionDigits:2})}`;

  const statusColour = { draft:'#d29922', complete:'#3fb950', authorised:'#58a6ff' };
  const statusCol = statusColour[r.status] || '#6e7681';
  const authBadge = r.is_authorised
    ? `<span style="background:#3fb95020;border:1px solid #3fb950;color:#3fb950;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:.06em">AUTHORISED</span>`
    : `<span style="background:#d2992220;border:1px solid #d29922;color:#d29922;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:.06em">DRAFT</span>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>MOPUP-${num} — ${r.incident_name||'Mop-up Report'}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#1a1a2e;background:#fff;padding:0}
  @media screen{body{max-width:800px;margin:0 auto;padding:30px 20px}}
  @media print{body{padding:0}@page{margin:18mm 15mm}}

  /* Header */
  .doc-header{background:#1a3a6b;color:#fff;padding:22px 28px 18px;display:flex;justify-content:space-between;align-items:flex-start}
  .doc-header-left h1{font-size:18pt;font-weight:700;letter-spacing:-.01em;margin-bottom:4px}
  .doc-header-left .sub{font-size:10pt;opacity:.8;margin-bottom:2px}
  .doc-header-right{text-align:right;font-size:9pt;opacity:.85;line-height:1.7}
  .doc-num{font-size:22pt;font-weight:800;letter-spacing:.04em;color:#fff;opacity:.25;margin-top:4px}

  /* Status bar */
  .status-bar{background:#f0f4f8;border-bottom:3px solid #1a3a6b;padding:10px 28px;display:flex;align-items:center;gap:14px;font-size:10pt}
  .status-bar .lbl{color:#666;font-size:9pt}
  .status-pill{padding:3px 10px;border-radius:4px;font-size:10pt;font-weight:700;letter-spacing:.04em}
  .pill-active{background:#f8515920;border:1px solid #f85149;color:#f85149}
  .pill-contained{background:#d2992220;border:1px solid #d29922;color:#d29922}
  .pill-resolved{background:#3fb95020;border:1px solid #3fb950;color:#3fb950}

  /* Body */
  .doc-body{padding:22px 28px}

  /* Section */
  .sec{margin-bottom:22px;page-break-inside:avoid}
  .sec-title{font-size:9pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#1a3a6b;border-bottom:1.5px solid #1a3a6b;padding-bottom:4px;margin-bottom:12px}

  /* Stat grid */
  .stat-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:12px}
  .stat-box{border:1px solid #e0e6ed;border-radius:6px;padding:10px 8px;text-align:center}
  .stat-box .val{font-size:18pt;font-weight:800;color:#1a3a6b;line-height:1}
  .stat-box .val.red{color:#c0392b}
  .stat-box .val.amber{color:#e67e22}
  .stat-box .val.blue{color:#2980b9}
  .stat-box .lbl{font-size:8pt;color:#888;margin-top:3px;text-transform:uppercase;letter-spacing:.04em}

  /* Table */
  table{width:100%;border-collapse:collapse;font-size:10pt;margin-bottom:8px}
  th{background:#1a3a6b;color:#fff;padding:6px 10px;text-align:left;font-size:9pt;font-weight:600}
  td{padding:5px 10px;border-bottom:1px solid #eef0f3}
  tr:nth-child(even) td{background:#f7f9fc}
  td.right,th.right{text-align:right}
  .total-row td{font-weight:700;background:#eef0f3;border-top:1.5px solid #1a3a6b}

  /* Field rows */
  .field-row{display:flex;gap:0;border-bottom:1px solid #eef0f3;padding:5px 0}
  .field-key{width:38%;font-size:9.5pt;color:#666;font-weight:600}
  .field-val{flex:1;font-size:9.5pt;color:#1a1a2e}

  /* Narrative box */
  .narrative{background:#f7f9fc;border-left:3px solid #1a3a6b;padding:10px 14px;font-size:10pt;line-height:1.7;border-radius:0 4px 4px 0}

  /* Lesson items */
  .lesson{display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #eef0f3;font-size:10pt}
  .lesson-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:4px}

  /* Footer */
  .doc-footer{background:#f0f4f8;border-top:2px solid #1a3a6b;padding:10px 28px;font-size:8pt;color:#888;display:flex;justify-content:space-between}

  /* Print button — screen only */
  @media screen{
    .print-btn{display:block;margin:20px auto;padding:12px 32px;background:#1a3a6b;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:.04em}
    .print-btn:hover{background:#16305a}
  }
  @media print{.print-btn{display:none}}
</style>
</head>
<body>

<button class="print-btn" onclick="window.print()">⬇ Save as PDF / Print</button>

<div class="doc-header">
  <div class="doc-header-left">
    <h1>Mop-up Report</h1>
    <div class="sub">${muniName} · Disaster Management Centre</div>
    <div class="sub">${r.incident_name || 'Incident report'}</div>
  </div>
  <div class="doc-header-right">
    <div class="doc-num">MOPUP-${num}</div>
    <div>Compiled: ${fmt(r.created_at)}</div>
    <div>Updated: ${fmt(r.updated_at)}</div>
    <div style="margin-top:6px">${authBadge}</div>
  </div>
</div>

<div class="status-bar">
  <span class="lbl">Hazard type:</span>
  <strong>${r.hazard_type || '—'}</strong>
  <span style="margin-left:auto;color:#666;font-size:9pt">
    Activation: <strong>${fmt(r.activation_date)}</strong>
    &nbsp;→&nbsp; Stand-down: <strong>${fmt(r.standdown_date)}</strong>
    &nbsp;·&nbsp; Duration: <strong>${r.duration_days || '—'} days</strong>
    &nbsp;·&nbsp; SitReps issued: <strong>${r.sitreps_issued || '—'}</strong>
  </span>
</div>

<div class="doc-body">

  <!-- Final Impact -->
  <div class="sec">
    <div class="sec-title">Final Impact Figures</div>
    <div class="stat-grid">
      <div class="stat-box"><div class="val amber">${r.total_affected||0}</div><div class="lbl">Total Affected</div></div>
      <div class="stat-box"><div class="val red">${r.fatalities||0}</div><div class="lbl">Fatalities</div></div>
      <div class="stat-box"><div class="val amber">${r.injuries||0}</div><div class="lbl">Injuries</div></div>
      <div class="stat-box"><div class="val amber">${r.properties_damaged||0}</div><div class="lbl">Properties Damaged</div></div>
      <div class="stat-box"><div class="val red">${r.structures_destroyed||0}</div><div class="lbl">Structures Destroyed</div></div>
    </div>
  </div>

  <!-- Incident Narrative -->
  ${r.narrative ? `
  <div class="sec">
    <div class="sec-title">Incident Narrative</div>
    <div class="narrative">${r.narrative}</div>
  </div>` : ''}

  <!-- Financial Summary -->
  <div class="sec">
    <div class="sec-title">Financial Summary</div>
    <table>
      <tr><th>Category</th><th class="right">Amount</th></tr>
      <tr><td>Relief distribution</td><td class="right">${cur(fin.relief)}</td></tr>
      <tr><td>Emergency repairs</td><td class="right">${cur(fin.repairs)}</td></tr>
      <tr><td>Personnel overtime</td><td class="right">${cur(fin.personnel)}</td></tr>
      <tr><td>Equipment &amp; logistics</td><td class="right">${cur(fin.equipment)}</td></tr>
      <tr class="total-row"><td>Total expenditure</td><td class="right">${cur(total)}</td></tr>
    </table>
  </div>

  <!-- Organisations Deployed -->
  ${orgs.length ? `
  <div class="sec">
    <div class="sec-title">Organisations Deployed</div>
    <table>
      <tr><th>Organisation</th><th>Role in response</th></tr>
      ${orgs.map(o=>`<tr><td>${o.name||'—'}</td><td>${o.role||'—'}</td></tr>`).join('')}
    </table>
  </div>` : ''}

  <!-- Relief Distributed -->
  ${Object.keys(relief).length ? `
  <div class="sec">
    <div class="sec-title">Relief Distributed</div>
    <table>
      <tr><th>Item</th><th class="right">Quantity</th></tr>
      ${[['Food parcels','food_parcels'],['Water (5L units)','water_units'],['Blankets','blankets'],['Hygiene kits','hygiene_kits'],['Baby packs','baby_packs'],['SASSA vouchers','sassa_vouchers']]
        .filter(([,k])=>relief[k])
        .map(([label,k])=>`<tr><td>${label}</td><td class="right">${relief[k]}</td></tr>`).join('')}
    </table>
  </div>` : ''}

  <!-- Lessons Learned -->
  ${(worked.length || improve.length) ? `
  <div class="sec">
    <div class="sec-title">Lessons Learned</div>
    ${worked.length ? `
      <div style="font-size:9pt;font-weight:700;color:#3fb950;margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">What worked well</div>
      ${worked.map(l=>`<div class="lesson"><div class="lesson-dot" style="background:#3fb950"></div><div><strong>${l.title||''}</strong>${l.description?` — ${l.description}`:''}</div></div>`).join('')}
    ` : ''}
    ${improve.length ? `
      <div style="font-size:9pt;font-weight:700;color:#e74c3c;margin:10px 0 6px;text-transform:uppercase;letter-spacing:.06em">What needs improvement</div>
      ${improve.map(l=>`<div class="lesson"><div class="lesson-dot" style="background:#e74c3c"></div><div><strong>${l.title||''}</strong>${l.description?` — ${l.description}`:''}</div></div>`).join('')}
    ` : ''}
  </div>` : ''}

  <!-- Recommendations -->
  ${recs.length ? `
  <div class="sec">
    <div class="sec-title">Recommendations</div>
    <table>
      <tr><th>#</th><th>Recommendation</th><th>IDP KPA</th></tr>
      ${recs.map((rec,i)=>`<tr><td>${i+1}</td><td>${rec.text||'—'}</td><td>${rec.idp_kpa||'—'}</td></tr>`).join('')}
    </table>
  </div>` : ''}

  <!-- Authorisation -->
  <div class="sec">
    <div class="sec-title">Authorisation</div>
    <div class="field-row"><span class="field-key">Compiled by</span><span class="field-val">${r.compiled_by||'—'}</span></div>
    <div class="field-row"><span class="field-key">Authorised by (Municipal Manager)</span><span class="field-val">${r.authorised_by||'—'}</span></div>
    <div class="field-row"><span class="field-key">Authorised on</span><span class="field-val">${fmt(r.authorised_at)}</span></div>
    <div class="field-row"><span class="field-key">Published</span><span class="field-val">${r.is_published?'Yes':'No'}</span></div>
  </div>

</div>

<div class="doc-footer">
  <span>MOPUP-${num} · ${muniName} Disaster Management Centre · DRMSA Platform</span>
  <span>Generated ${new Date().toLocaleString('en-ZA')}</span>
</div>

</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
};

function showToast(msg, isError = false) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:${isError?'var(--red-dim)':'var(--green-dim)'};border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:10px 16px;border-radius:6px;font-size:12px;font-family:var(--font-mono);font-weight:700;z-index:500`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},2500);
}
