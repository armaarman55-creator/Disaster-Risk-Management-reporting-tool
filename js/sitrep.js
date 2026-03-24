// js/sitrep.js
import { supabase } from './supabase.js';

let _muniId = null;
let _user = null;
let _currentSitrep = null;
let _activeTab = 'form';
let _sitrepLinkedData = { shelters: [], closures: [] };

// ── INIT SITREP PAGE ──
export async function initSitrep(user) {
  _user = user;
  _muniId = user?.municipality_id;
  await renderSitrepList();
}

// ── RENDER LIST ──
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

// ── CREATE NEW SITREP ──
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

// ── OPEN SITREP ──
async function openSitrep(id, allSitreps) {
  const { data: s } = await supabase.from('sitreps').select('*').eq('id', id).single();
  if (!s) return;
  _currentSitrep = s;

  const [sheltersRes, closuresRes] = await Promise.all([
    supabase.from('shelters').select('id,name,ward_number,current_occupancy,capacity,status').eq('municipality_id', _muniId),
    supabase.from('road_closures').select('id,road_name,status,reason').eq('municipality_id', _muniId)
  ]);

  _sitrepLinkedData = {
    shelters: sheltersRes.data || [],
    closures: closuresRes.data || []
  };

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
      </div>
      <div class="sr-tabs">
        <div class="srtab on" data-tab="form">Report form</div>
        <div class="srtab" data-tab="timeline">Timeline</div>
        <div class="srtab" data-tab="actions">Next actions</div>
        <div class="srtab" data-tab="public">Public summary</div>
      </div>
      <div class="sr-body" id="sr-body">
        ${renderSitrepForm(s, _sitrepLinkedData.shelters, _sitrepLinkedData.closures)}
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
        case 'form':     body.innerHTML = renderSitrepForm(s, _sitrepLinkedData.shelters, _sitrepLinkedData.closures); break;
        case 'timeline': body.innerHTML = renderTimeline(s); break;
        case 'actions':  body.innerHTML = renderActions(s); break;
        case 'public':   body.innerHTML = renderPublicSummary(s, _sitrepLinkedData.shelters, _sitrepLinkedData.closures); break;
      }
    });
  });
}

// ── HELPER FUNCTIONS ──
function renderSitrepForm(sitrep, shelters, closures) {
  return `
    <div style="padding:12px;color:var(--text1)">
      <p><strong>Incident:</strong> ${sitrep.incident_name || 'Unnamed'}</p>
      <p><strong>Status:</strong> ${sitrep.status || 'draft'}</p>
      <p>Linked shelters: ${shelters.length}</p>
      <p>Road closures: ${closures.length}</p>
      <textarea placeholder="Update the report...">${sitrep.report_text || ''}</textarea>
    </div>`;
}

function renderTimeline(sitrep) {
  return `<div style="padding:12px;color:var(--text3)">Timeline for SitRep-${sitrep.sitrep_number}</div>`;
}

function renderActions(sitrep) {
  return `<div style="padding:12px;color:var(--text3)">Next actions for SitRep-${sitrep.sitrep_number}</div>`;
}

function renderPublicSummary(sitrep, shelters, closures) {
  return `<div style="padding:12px;color:var(--text3)">Public summary for SitRep-${sitrep.sitrep_number}</div>`;
}
