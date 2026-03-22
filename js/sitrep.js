// js/sitrep.js
import { supabase } from './supabase.js';
import { openShareModal } from './share.js';

let _muniId = null;
let _user = null;
let _currentSitrep = null;
let _activeTab = 'form';

export async function initSitrep(user) {
  _user = user;
  _muniId = user?.municipality_id;
  await renderSitrepList();
}

async function renderSitrepList() {
  const page = document.getElementById('page-sitrep');
  if (!page) return;

  const { data: sitreps } = await supabase
    .from('sitreps')
    .select('*')
    .eq('municipality_id', _muniId)
    .order('sitrep_number', { ascending: false });

  page.innerHTML = `
    <div class="sr-full">
      <div class="sr-col-head">
        <div>
          <div class="sr-col-title">Situation Reports</div>
          <div class="sr-col-sub">${_user?.municipalities?.name || ''} · ${sitreps?.length || 0} reports</div>
        </div>
        <button class="btn btn-red" id="new-sitrep-btn">+ New SitRep</button>
      </div>
      <div style="flex:1;overflow-y:auto">
        <div class="sr-list" id="sitrep-list">
          ${sitreps?.length ? sitreps.map(s => renderSitrepListItem(s)).join('') : `
            <div style="text-align:center;padding:48px 20px;color:var(--text3);font-size:12px;font-family:var(--font-mono)">
              No situation reports yet.<br>Create your first SitRep when an incident is active.
            </div>`}
        </div>
      </div>
    </div>`;

  document.getElementById('new-sitrep-btn')?.addEventListener('click', () => createNewSitrep(sitreps));

  page.querySelectorAll('.sr-list-item').forEach(item => {
    item.addEventListener('click', () => openSitrep(item.dataset.id, sitreps));
  });
}

function renderSitrepListItem(s) {
  const num = String(s.sitrep_number).padStart(2, '0');
  return `
    <div class="sr-list-item ${s.status === 'active' ? 'active' : ''}" data-id="${s.id}">
      <div class="sr-list-num">SITREP-${num}</div>
      <div class="sr-list-info">
        <div class="sr-list-name">${s.incident_name || 'Unnamed incident'}</div>
        <div class="sr-list-meta">${s.hazard_type || '—'} · Wards ${Array.isArray(s.affected_wards) ? s.affected_wards.join(', ') : (s.affected_wards || '?')} · ${s.issued_at ? new Date(s.issued_at).toLocaleString('en-ZA') : '—'}</div>
      </div>
      <span class="badge ${s.status === 'active' ? 'b-red' : s.status === 'resolved' ? 'b-green' : 'b-amber'}">${(s.status || 'draft').toUpperCase()}</span>
    </div>`;
}

async function createNewSitrep(existing) {
  const nextNum = (existing?.length ? Math.max(...existing.map(s => s.sitrep_number || 0)) + 1 : 1);
  const { data, error } = await supabase.from('sitreps').insert({
    municipality_id: _muniId,
    sitrep_number: nextNum,
    incident_name: '',
    status: 'active',
    issued_at: new Date().toISOString(),
    issued_by: _user?.full_name || 'Unknown',
    displaced_persons: 0, injuries: 0, fatalities: 0,
    properties_damaged: 0, is_published: false,
    timeline_events: [], next_actions: []
  }).select().single();

  if (!error && data) openSitrep(data.id, [...(existing || []), data]);
}

async function openSitrep(id, allSitreps) {
  const { data: s } = await supabase.from('sitreps').select('*').eq('id', id).single();
  if (!s) return;
  _currentSitrep = s;

  // Load records for opt-in linking — nothing pre-linked
  const [sheltersRes, closuresRes] = await Promise.all([
    supabase.from('shelters').select('id,name,ward_number,current_occupancy,capacity,status').eq('municipality_id', _muniId),
    supabase.from('road_closures').select('id,road_name,status,reason').eq('municipality_id', _muniId)
  ]);
  const shelters = sheltersRes.data || [];
  const closures = closuresRes.data || [];

  const num = String(s.sitrep_number).padStart(2, '0');
  const page = document.getElementById('page-sitrep');
  if (!page) return;

  page.innerHTML = `
    <div class="sr-full">
      <div class="sr-col-head">
        <button class="btn btn-sm" id="back-to-list" style="margin-right:8px">← List</button>
        <div style="flex:1">
          <div class="sr-col-title">SITREP-${num} — ${s.incident_name || 'New incident'}</div>
          <div class="sr-col-sub">${_user?.municipalities?.name || ''} · ${s.issued_at ? new Date(s.issued_at).toLocaleString('en-ZA') : '—'}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <span class="sr-num">SITREP-${num}</span>
          <span class="badge ${s.status === 'active' ? 'b-red' : s.status === 'resolved' ? 'b-green' : 'b-amber'}">${(s.status || 'draft').toUpperCase()}</span>
        </div>
      </div>
      <div class="sr-tabs">
        <div class="srtab on" data-tab="form">Report form</div>
        <div class="srtab" data-tab="timeline">Timeline</div>
        <div class="srtab" data-tab="actions">Next actions</div>
        <div class="srtab" data-tab="public">Public summary</div>
      </div>
      <div class="sr-body" id="sr-body">
        ${renderSitrepForm(s, shelters, closures)}
      </div>
      <div class="share-foot">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);font-family:var(--font-mono)">Share SITREP-${num}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="tog-track ${s.is_published ? 'on' : ''}" id="sr-pub-tog"><div class="tog-knob"></div></div>
            <span style="font-size:11px;font-weight:700;font-family:var(--font-mono);color:${s.is_published ? 'var(--green)' : 'var(--text3)'}" id="sr-pub-lbl">${s.is_published ? 'PUBLISHED' : 'DRAFT'}</span>
          </div>
        </div>
        <div class="share-channels">
          <button class="sch pdf" onclick="generateSitrepPDF()"><div class="sch-ico" style="background:var(--red-dim)"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--red)" stroke-width="1.4" stroke-linecap="round"><rect x="1.5" y="1" width="7" height="8" rx="1"/><line x1="3" y1="4" x2="7" y2="4"/><line x1="3" y1="6" x2="6" y2="6"/></svg></div>PDF report</button>
          <button class="sch pdmc" onclick="copySitrepPDMC()"><div class="sch-ico" style="background:var(--purple-dim)"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--purple)" stroke-width="1.4" stroke-linecap="round"><circle cx="5" cy="5" r="4"/><path d="M5 2v3l2 2"/></svg></div>PDMC submit</button>
          <button class="sch em" id="sr-email-btn"><div class="sch-ico" style="background:var(--blue-dim)"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--blue)" stroke-width="1.4" stroke-linecap="round"><rect x="1" y="2.5" width="8" height="6" rx=".5"/><path d="M1 3l4 3 4-3"/></svg></div>Email distrib.</button>
          <button class="sch portal" id="sr-portal-btn"><div class="sch-ico" style="background:var(--green-dim)"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--green)" stroke-width="1.4" stroke-linecap="round"><circle cx="5" cy="5" r="4"/><path d="M1 5h8M5 1c-1.5 1.5-2 3-2 4s.5 2.5 2 4M5 1c1.5 1.5 2 3 2 4s-.5 2.5-2 4"/></svg></div>Public portal</button>
        </div>
        <div class="sp-url-row">
          <div class="sp-url">${window.location.origin}/incidents/${s.id}/sitrep-${num}</div>
          <button class="btn btn-sm" onclick="navigator.clipboard?.writeText('${window.location.origin}/incidents/${s.id}/sitrep-${num}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy link',1500)">Copy link</button>
        </div>
      </div>
    </div>`;

  document.getElementById('back-to-list')?.addEventListener('click', renderSitrepList);

  page.querySelectorAll('.srtab').forEach(tab => {
    tab.addEventListener('click', () => {
      page.querySelectorAll('.srtab').forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      _activeTab = tab.dataset.tab;
      const body = document.getElementById('sr-body');
      if (!body) return;
      switch (_activeTab) {
        case 'form':     body.innerHTML = renderSitrepForm(s, shelters, closures); bindFormEvents(s); break;
        case 'timeline': body.innerHTML = renderTimeline(s); bindTimelineEvents(s); break;
        case 'actions':  body.innerHTML = renderActions(s); bindActionEvents(s); break;
        case 'public':   body.innerHTML = renderPublicSummary(s, shelters.data || [], closures.data || []); break;
      }
    });
  });

  bindFormEvents(s);

  document.getElementById('sr-pub-tog')?.addEventListener('click', async function() {
    this.classList.toggle('on');
    const isOn = this.classList.contains('on');
    const lbl = document.getElementById('sr-pub-lbl');
    if (lbl) { lbl.textContent = isOn ? 'PUBLISHED' : 'DRAFT'; lbl.style.color = isOn ? 'var(--green)' : 'var(--text3)'; }
    await supabase.from('sitreps').update({ is_published: isOn }).eq('id', s.id);
  });
}

function renderSitrepForm(s, shelters, closures) {
  return `
    <div class="fsec">
      <div class="fsec-title">Incident identification</div>
      <div class="frow">
        <div class="fl"><span class="fl-label">SitRep number <span class="auto-tag">AUTO</span></span><div class="fl-ro">SITREP-${String(s.sitrep_number).padStart(2,'0')}</div></div>
        <div class="fl"><span class="fl-label">Issued</span><div class="fl-ro">${s.issued_at ? new Date(s.issued_at).toLocaleString('en-ZA') : '—'}</div></div>
      </div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Incident name</span><input class="fl-input" id="sr-name" value="${s.incident_name || ''}"/></div>
        <div class="fl"><span class="fl-label">Hazard type</span><input class="fl-input" id="sr-hazard" value="${s.hazard_type || ''}"/></div>
      </div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Wards affected</span><input class="fl-input" id="sr-wards" value="${Array.isArray(s.affected_wards) ? s.affected_wards.join(', ') : (s.affected_wards || '')}"/></div>
        <div class="fl"><span class="fl-label">Status</span>
          <select class="fl-sel" id="sr-status">
            <option value="active" ${s.status==='active'?'selected':''}>Active — ongoing response</option>
            <option value="contained" ${s.status==='contained'?'selected':''}>Contained — monitoring</option>
            <option value="resolved" ${s.status==='resolved'?'selected':''}>Resolved — stand-down</option>
          </select>
        </div>
      </div>
    </div>
    <div class="fsec">
      <div class="fsec-title">Current situation <span class="live-tag"><span class="pulse-dot"></span>LIVE DATA</span></div>
      <div class="stat-grid-3">
        <div class="stat-box"><div class="stat-lbl">Displaced</div><input type="number" class="fl-input" id="sr-displaced" value="${s.displaced_persons || 0}" style="font-family:var(--font-display);font-size:22px;font-weight:800;letter-spacing:-.03em;border:none;background:transparent;padding:0;color:var(--amber)"/><div class="stat-sub">persons</div></div>
        <div class="stat-box"><div class="stat-lbl">Injuries</div><input type="number" class="fl-input" id="sr-injuries" value="${s.injuries || 0}" style="font-family:var(--font-display);font-size:22px;font-weight:800;letter-spacing:-.03em;border:none;background:transparent;padding:0;color:var(--red)"/><div class="stat-sub">reported</div></div>
        <div class="stat-box"><div class="stat-lbl">Fatalities</div><input type="number" class="fl-input" id="sr-fatalities" value="${s.fatalities || 0}" style="font-family:var(--font-display);font-size:22px;font-weight:800;letter-spacing:-.03em;border:none;background:transparent;padding:0;color:var(--red)"/><div class="stat-sub">confirmed</div></div>
        <div class="stat-box"><div class="stat-lbl">Properties</div><input type="number" class="fl-input" id="sr-properties" value="${s.properties_damaged || 0}" style="font-family:var(--font-display);font-size:22px;font-weight:800;letter-spacing:-.03em;border:none;background:transparent;padding:0;color:var(--amber)"/><div class="stat-sub">damaged</div></div>
        <div class="stat-box"><div class="stat-lbl">Sheltered</div><input type="number" class="fl-input" id="sr-sheltered" value="${s.persons_sheltered||0}" style="font-size:22px;font-weight:800;color:var(--blue);border:none;background:transparent;padding:0"/><div class="stat-sub">persons (from linked shelters)</div></div>
        <div class="stat-box"><div class="stat-lbl">Roads closed</div><input type="number" class="fl-input" id="sr-roads" value="${s.roads_closed||0}" style="font-size:22px;font-weight:800;color:var(--amber);border:none;background:transparent;padding:0"/><div class="stat-sub">from linked closures</div></div>
      </div>
      <div class="fl"><span class="fl-label">Situation narrative</span><textarea class="fl-textarea" id="sr-narrative" rows="4">${s.narrative || ''}</textarea></div>
    </div>
    <div class="fsec">
      <div class="fsec-title">
        Linked records
        <span style="font-size:10px;color:var(--text3);font-weight:400;letter-spacing:0;text-transform:none">Select which records are part of this incident</span>
      </div>
      <div style="font-size:12px;color:var(--text2);line-height:1.7;margin-bottom:12px;background:var(--blue-dim);border:1px solid rgba(88,166,255,.2);border-radius:6px;padding:10px 12px">
        Not every shelter or road closure is related to a declared incident.
        Tick only the records that are directly part of this SitRep.
        Linked records will auto-update the sheltered persons and roads closed counts above.
      </div>
      ${shelters.length ? `
        <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Active shelters</div>
        ${shelters.map(sh=>`
          <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;cursor:pointer;transition:border-color .15s"
            onmouseenter="this.style.borderColor='var(--border2)'" onmouseleave="this.style.borderColor='var(--border)'">
            <input type="checkbox" class="sr-link-shelter"
              value="${sh.id}"
              data-occupancy="${sh.current_occupancy||0}"
              style="width:15px;height:15px;cursor:pointer;accent-color:var(--green);flex-shrink:0"
              onchange="srUpdateLinkedCounts()"/>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:var(--text)">${sh.name}</div>
              <div style="font-size:11px;color:var(--text3)">Ward ${sh.ward_number} · ${sh.current_occupancy||0}/${sh.capacity} persons · <span class="badge ${sh.status==='open'?'b-green':sh.status==='at-capacity'?'b-red':'b-amber'}">${(sh.status||'').toUpperCase()}</span></div>
            </div>
          </label>`).join('')}` : '<div style="font-size:12px;color:var(--text3);padding:6px 0">No active shelters found. Add shelters from the Shelters section first.</div>'}
      ${closures.length ? `
        <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.06em;text-transform:uppercase;margin:14px 0 8px">Active road closures</div>
        ${closures.map(rc=>`
          <label style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;cursor:pointer;transition:border-color .15s"
            onmouseenter="this.style.borderColor='var(--border2)'" onmouseleave="this.style.borderColor='var(--border)'">
            <input type="checkbox" class="sr-link-closure"
              value="${rc.id}"
              style="width:15px;height:15px;cursor:pointer;accent-color:var(--red);flex-shrink:0"
              onchange="srUpdateLinkedCounts()"/>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:var(--text)">${rc.road_name}</div>
              <div style="font-size:11px;color:var(--text3)">${rc.reason||'No reason specified'} · <span class="badge b-red">CLOSED</span></div>
            </div>
          </label>`).join('')}` : '<div style="font-size:12px;color:var(--text3);padding:6px 0">No active road closures found.</div>'}
    </div>
    <div class="fsec">
      <div class="fsec-title">Authorisation</div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Authorised by</span><input class="fl-input" id="sr-authorised-by" value="${s.issued_by || ''}"/></div>
        <div class="fl"><span class="fl-label">Next SitRep due</span><input class="fl-input" type="datetime-local" id="sr-next-due" value="${s.next_due || ''}"/></div>
      </div>
      <div class="auth-row-sm">
        <div class="auth-av-sm">${(_user?.full_name||'??').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}</div>
        <div><div style="font-size:12px;color:var(--text);font-weight:600;font-family:var(--font-display)">${_user?.full_name||'—'}</div><div style="font-size:10px;color:var(--text3);font-family:var(--font-mono)">${_user?.municipalities?.name||''}</div></div>
        <div style="margin-left:auto;font-size:10px;font-family:var(--font-mono);color:var(--text3)">${new Date().toLocaleString('en-ZA')}</div>
      </div>
    </div>
    <button class="btn btn-green" id="sr-save-btn" style="margin-bottom:16px">Save SitRep</button>`;
}

function renderTimeline(s) {
  const events = s.timeline_events || [];
  return `
    <div class="fsec">
      <div class="fsec-title">Incident timeline</div>
      <div class="tl" id="tl-events">
        ${events.length ? events.map(e=>`
          <div class="tl-item">
            <div class="tl-dot ${e.severity||''}"></div>
            <div class="tl-time">${e.time||'—'}</div>
            <div class="tl-event">${e.event||''}</div>
            ${e.detail?`<div class="tl-sub">${e.detail}</div>`:''}
          </div>`).join('') : '<div style="font-size:12px;color:var(--text3);padding:8px">No timeline entries yet.</div>'}
      </div>
      <div class="fl" style="margin-top:12px"><span class="fl-label">Add timeline entry</span>
        <div style="display:flex;gap:6px">
          <input class="fl-input" id="tl-new-event" placeholder="Describe event…" style="flex:1"/>
          <select class="fl-sel" id="tl-new-sev" style="width:100px"><option value="">Normal</option><option value="red">Critical</option><option value="amber">Warning</option><option value="green">Positive</option></select>
          <button class="btn btn-sm btn-green" id="tl-add-btn">+ Add</button>
        </div>
      </div>
    </div>`;
}

function renderActions(s) {
  const actions = s.next_actions || [];
  return `
    <div class="fsec">
      <div class="fsec-title">Next actions</div>
      ${actions.map((a,i)=>`
        <div class="action-item">
          <div class="a-cb ${a.done?'done':''}" onclick="toggleAction(${i})"></div>
          <div class="a-text ${a.done?'done':''}">${a.text||''}</div>
          <div class="a-who">${a.who||''}</div>
        </div>`).join('')}
      <div style="display:flex;gap:6px;margin-top:10px">
        <input class="fl-input" id="new-action-text" placeholder="Add next action…" style="flex:1"/>
        <input class="fl-input" id="new-action-who" placeholder="Assigned to" style="width:120px"/>
        <button class="btn btn-sm btn-green" id="add-action-btn">+ Add</button>
      </div>
    </div>`;
}

function renderPublicSummary(s, shelters, closures) {
  const num = String(s.sitrep_number).padStart(2,'0');
  // Only include records that were ticked as linked to this SitRep
  const linkedShelterIds = [...document.querySelectorAll('.sr-link-shelter:checked')].map(cb => cb.value);
  const linkedClosureIds = [...document.querySelectorAll('.sr-link-closure:checked')].map(cb => cb.value);
  const linkedShelters   = shelters.filter(sh => linkedShelterIds.includes(sh.id));
  const linkedClosures   = closures.filter(rc => linkedClosureIds.includes(rc.id));
  const shelterText = linkedShelters.map(sh=>`${sh.name}: ${sh.current_occupancy||0}/${sh.capacity} (${(sh.status||'').toUpperCase()})`).join('\n');
  const closureText = linkedClosures.map(c=>`${c.road_name}: ${(c.status||'').toUpperCase()}`).join('\n');
  const text = `SITUATION UPDATE — SITREP-${num}
${_user?.municipalities?.name||''} · ${new Date().toLocaleString('en-ZA')}

Incident: ${s.incident_name||'—'}
Status: ${(s.status||'').toUpperCase()}

Persons displaced: ${s.displaced_persons||0}
Injuries: ${s.injuries||0}
Fatalities: ${s.fatalities||0}
Properties damaged: ${s.properties_damaged||0}

${shelterText ? 'SHELTERS:\n'+shelterText : ''}
${closureText ? '\nROAD CLOSURES:\n'+closureText : ''}

${s.narrative||''}

Next SitRep due: ${s.next_due ? new Date(s.next_due).toLocaleString('en-ZA') : 'TBC'}`;

  return `
    <div class="fsec">
      <div class="fsec-title">Public summary — auto-generated</div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r-md);padding:12px;font-size:11px;color:var(--text2);font-family:var(--font-mono);line-height:1.6;white-space:pre-wrap">${text}</div>
      <div style="margin-top:10px;display:flex;gap:6px">
        <button class="btn btn-sm" onclick="navigator.clipboard?.writeText(document.querySelector('.sr-body pre, .sr-body div[style*=pre-wrap]')?.textContent||'')">Copy text</button>
      </div>
    </div>`;
}

window.srUpdateLinkedCounts = function() {
  // Sum occupancy from ticked shelters
  const shelterTotal = [...document.querySelectorAll('.sr-link-shelter:checked')]
    .reduce((sum, cb) => sum + parseInt(cb.dataset.occupancy || 0), 0);
  const closureTotal = document.querySelectorAll('.sr-link-closure:checked').length;

  const shelteredEl = document.getElementById('sr-sheltered');
  const roadsEl     = document.getElementById('sr-roads');
  if (shelteredEl) shelteredEl.value = shelterTotal;
  if (roadsEl)     roadsEl.value     = closureTotal;
};

function bindFormEvents(s) {
  // Update linked record counts when checkboxes change
  function updateLinkedCounts() {
    const shelterCount  = document.querySelectorAll('.sr-link-shelter:checked').length;
    const closureCount  = document.querySelectorAll('.sr-link-closure:checked').length;
    const sc = document.getElementById('sr-shelters-count');
    const cc = document.getElementById('sr-closures-count');
    if (sc) sc.textContent = shelterCount;
    if (cc) cc.textContent = closureCount;
  }
  document.querySelectorAll('.sr-link-shelter, .sr-link-closure').forEach(cb => {
    cb.addEventListener('change', updateLinkedCounts);
  });

  document.getElementById('sr-save-btn')?.addEventListener('click', async () => {
    const { error } = await supabase.from('sitreps').update({
      incident_name: document.getElementById('sr-name')?.value,
      hazard_type: document.getElementById('sr-hazard')?.value,
      affected_wards: document.getElementById('sr-wards')?.value.split(',').map(w=>w.trim()),
      status: document.getElementById('sr-status')?.value,
      displaced_persons: parseInt(document.getElementById('sr-displaced')?.value)||0,
      injuries: parseInt(document.getElementById('sr-injuries')?.value)||0,
      fatalities: parseInt(document.getElementById('sr-fatalities')?.value)||0,
      properties_damaged: parseInt(document.getElementById('sr-properties')?.value)||0,
      narrative:       document.getElementById('sr-narrative')?.value,
      issued_by:       document.getElementById('sr-authorised-by')?.value,
      next_due:        document.getElementById('sr-next-due')?.value,
      persons_sheltered: parseInt(document.getElementById('sr-sheltered')?.value)||0,
      roads_closed:    parseInt(document.getElementById('sr-roads')?.value)||0,
      linked_shelters: [...document.querySelectorAll('.sr-link-shelter:checked')].map(cb=>cb.value),
      linked_closures: [...document.querySelectorAll('.sr-link-closure:checked')].map(cb=>cb.value),
      updated_at:      new Date().toISOString()
    }).eq('id', s.id);
    if (!error) {
      showToast('✓ SitRep saved successfully!');
      // Collapse form back to list after short delay
      setTimeout(async () => {
        await initSitrep({ municipality_id: _muniId });
      }, 1200);
    } else {
      showToast('Error saving SitRep: ' + error.message, true);
    }
  });
}

function bindTimelineEvents(s) {
  document.getElementById('tl-add-btn')?.addEventListener('click', async () => {
    const text = document.getElementById('tl-new-event')?.value.trim();
    if (!text) return;
    const events = [...(s.timeline_events||[]), {
      time: new Date().toLocaleString('en-ZA'),
      event: text,
      severity: document.getElementById('tl-new-sev')?.value
    }];
    await supabase.from('sitreps').update({ timeline_events: events }).eq('id', s.id);
    s.timeline_events = events;
    document.getElementById('sr-body').innerHTML = renderTimeline(s);
    bindTimelineEvents(s);
  });
}

function bindActionEvents(s) {
  document.getElementById('add-action-btn')?.addEventListener('click', async () => {
    const text = document.getElementById('new-action-text')?.value.trim();
    if (!text) return;
    const actions = [...(s.next_actions||[]), {
      text, who: document.getElementById('new-action-who')?.value, done: false
    }];
    await supabase.from('sitreps').update({ next_actions: actions }).eq('id', s.id);
    s.next_actions = actions;
    document.getElementById('sr-body').innerHTML = renderActions(s);
    bindActionEvents(s);
  });
}

window.toggleAction = async function(idx) {
  if (!_currentSitrep) return;
  _currentSitrep.next_actions[idx].done = !_currentSitrep.next_actions[idx].done;
  await supabase.from('sitreps').update({ next_actions: _currentSitrep.next_actions }).eq('id', _currentSitrep.id);
  const cb = document.querySelectorAll('.a-cb')[idx];
  const txt = document.querySelectorAll('.a-text')[idx];
  cb?.classList.toggle('done'); txt?.classList.toggle('done');
};

window.generateSitrepPDF = function() {
  const body = document.getElementById('sr-body')?.innerText || '';
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>SitRep</title><style>body{font-family:Arial,sans-serif;padding:40px;max-width:700px;margin:0 auto;font-size:13px;line-height:1.6}h1{font-size:18px}footer{margin-top:40px;font-size:10px;color:#888;border-top:1px solid #eee;padding-top:12px}</style></head><body><h1>Situation Report</h1><pre style="white-space:pre-wrap">${body}</pre><footer>DRMSA Platform · Created by Diswayne Maarman · Apache 2.0</footer></body></html>`);
  win.print();
};

window.copySitrepPDMC = function() {
  const body = document.getElementById('sr-body')?.innerText || '';
  navigator.clipboard?.writeText('[PDMC SUBMISSION]\n' + body);
  alert('PDMC formatted text copied to clipboard.');
};

function showToast(msg, isError = false) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:${isError?'var(--red-dim)':'var(--green-dim)'};border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:10px 16px;border-radius:6px;font-size:12px;font-family:var(--font-mono);font-weight:700;z-index:500`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},2500);
}
