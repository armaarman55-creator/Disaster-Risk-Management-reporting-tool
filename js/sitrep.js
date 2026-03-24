// js/sitrep.js
import { supabase } from './supabase.js';
import { showDownloadMenu, docHeader } from './download.js';

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

  // ── FIX: initialize linked data BEFORE rendering form
  const [sheltersRes, closuresRes] = await Promise.all([
    supabase.from('shelters').select('id,name,ward_number,current_occupancy,capacity,status').eq('municipality_id', _muniId),
    supabase.from('road_closures').select('id,road_name,status,reason').eq('municipality_id', _muniId)
  ]);
  const shelters = sheltersRes.data || [];
  const closures = closuresRes.data || [];
  window._sitrepLinkedData = { shelters, closures };

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
          <span style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);font-family:var(--font-mono)">SITREP-${num}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="tog-track ${s.is_published ? 'on' : ''}" id="sr-pub-tog"><div class="tog-knob"></div></div>
            <span style="font-size:11px;font-weight:700;font-family:var(--font-mono);color:${s.is_published ? 'var(--green)' : 'var(--text3)'}" id="sr-pub-lbl">${s.is_published ? 'PUBLISHED' : 'DRAFT'}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-sm" id="sr-download-btn">↓ Download</button>
          <button class="btn btn-sm" id="sr-email-btn">✉ Email report</button>
          <button class="btn btn-sm" id="sr-portal-btn">🌐 Public portal</button>
        </div>
        <div class="sp-url-row" style="margin-top:8px">
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
        case 'public':   body.innerHTML = renderPublicSummary(s, shelters, closures); bindPublicSummaryEvents(s, shelters, closures); break;
      }
    });
  });

  bindFormEvents(s);

  document.getElementById('sr-download-btn')?.addEventListener('click', function() {
    const num = String(s.sitrep_number).padStart(2,'0');
    const muniName = _user?.municipalities?.name || 'Municipality';
    showDownloadMenu(this, {
      filename: `SITREP-${num}-${muniName.replace(/\s+/g,'-')}`,
      getPDF: () => generateSitrepPDF(),
      getCSVRows: () => getSitrepCSVRows(s, shelters, closures),
      getDocHTML: () => getSitrepDocHTML(s, shelters, closures, muniName)
    });
  });

  document.getElementById('sr-email-btn')?.addEventListener('click', () => {
    const num = String(s.sitrep_number).padStart(2,'0');
    const muniName = _user?.municipalities?.name || 'Municipality';
    const text = getSitrepText(s, shelters, closures, muniName);
    const subject = encodeURIComponent(`SITREP-${num} — ${s.incident_name||''} — ${muniName}`);
    const body = encodeURIComponent(text);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  });

  document.getElementById('sr-portal-btn')?.addEventListener('click', () => {
    alert('This SitRep has been published to the public portal.');
  });

  document.getElementById('sr-pub-tog')?.addEventListener('click', async function() {
    this.classList.toggle('on');
    const isOn = this.classList.contains('on');
    const lbl = document.getElementById('sr-pub-lbl');
    if (lbl) { lbl.textContent = isOn ? 'PUBLISHED' : 'DRAFT'; lbl.style.color = isOn ? 'var(--green)' : 'var(--text3)'; }
    await supabase.from('sitreps').update({ is_published: isOn }).eq('id', s.id);
  });
}

// ── THE REST OF THE FILE BELOW REMAINS UNCHANGED ──
// renderSitrepForm(), renderTimeline(), renderActions(), getSitrepText(),
// getSitrepCSVRows(), getSitrepDocHTML(), renderPublicSummary(),
// bindPublicSummaryEvents(), window.srUpdateLinkedCounts, bindFormEvents(),
// bindTimelineEvents(), bindActionEvents(), window.toggleAction, window.generateSitrepPDF, showToast
