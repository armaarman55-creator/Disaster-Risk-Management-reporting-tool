// js/community.js
import { supabase } from './supabase.js';
import { openShareModal } from './share.js';

let _muniId = null;
let _activeTab = 'shelters';

export async function initCommunity(user) {
  _muniId = user?.municipality_id;
  renderCommunityTabs();
  await loadTab('shelters');
}

function renderCommunityTabs() {
  const tabs = document.querySelector('#page-community .page-tabs');
  if (!tabs) return;
  tabs.querySelectorAll('.ptab').forEach(tab => {
    tab.addEventListener('click', async () => {
      tabs.querySelectorAll('.ptab').forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      _activeTab = tab.dataset.tab;
      await loadTab(_activeTab);
    });
  });
}

async function loadTab(tab) {
  const body = document.getElementById('community-body');
  if (!body) return;
  body.innerHTML = '<div style="padding:20px;color:var(--text3);font-size:12px">Loading…</div>';

  switch (tab) {
    case 'shelters':    await renderShelters(body); break;
    case 'relief-ops':  await renderReliefOps(body); break;
    case 'saws':        await renderSAWS(body); break;
  }
}

async function renderShelters(body) {
  const { data: shelters, error } = await supabase
    .from('shelters')
    .select('*')
    .eq('municipality_id', _muniId)
    .order('ward_number');

  body.innerHTML = `
    <div class="sec-hdr">
      <div>
        <div class="sec-hdr-title">Registered shelters</div>
        <div class="sec-hdr-sub">${shelters?.length || 0} registered</div>
      </div>
      <button class="btn btn-red" onclick="openAddShelterModal()">+ Add shelter</button>
    </div>
    ${shelters?.length ? shelters.map(s => renderShelterCard(s)).join('') : emptyState('No shelters registered yet. Add your first shelter to get started.')}`;

  // Wire up events
  body.querySelectorAll('.shelter-save').forEach(btn => {
    btn.addEventListener('click', () => saveShelter(btn.dataset.id, body));
  });
  body.querySelectorAll('.shelter-share').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const shelter = shelters?.find(s => s.id === id);
      if (!shelter) return;
      openShareModal({
        type: 'shelter', title: shelter.name, imageCategory: 'shelter',
        url: `${window.location.origin}/public/shelters/${id}`,
        text: `SHELTER — ${shelter.name}\nWard ${shelter.ward_number} · ${shelter.address}\nStatus: ${shelter.status?.toUpperCase()}\nCapacity: ${shelter.current_occupancy || 0} / ${shelter.capacity}\nContact: ${shelter.contact_number || 'N/A'}`
      });
    });
  });
  body.querySelectorAll('.pub-tog').forEach(tog => {
    tog.addEventListener('click', () => togglePublish(tog));
  });
}

function renderShelterCard(s) {
  const statusBadge = { open: 'b-green', 'at-capacity': 'b-red', closed: 'b-gray', partial: 'b-amber' };
  const statusLabel = { open: 'OPEN', 'at-capacity': 'AT CAPACITY', closed: 'CLOSED', partial: 'PARTIAL' };
  const pct = s.capacity ? Math.round(((s.current_occupancy || 0) / s.capacity) * 100) : 0;

  return `
    <div class="rec-card">
      <div class="rec-head">
        <div class="rec-icon" style="background:var(--green-dim)">
          <svg viewBox="0 0 15 15" style="stroke:var(--green)"><path d="M2 6l5.5-4 5.5 4v7H2z"/><rect x="5" y="9" width="3" height="4"/></svg>
        </div>
        <div>
          <div class="rec-name">${s.name}</div>
          <div class="rec-meta">Ward ${s.ward_number} · ${s.address || 'No address'} · Cap. ${s.capacity || '?'}</div>
        </div>
        <div class="rec-badges">
          <span class="badge ${statusBadge[s.status] || 'b-gray'}">${statusLabel[s.status] || s.status?.toUpperCase() || 'UNKNOWN'}</span>
          <div class="pub-tog" data-id="${s.id}" data-published="${s.is_published}">
            <div class="tog-track ${s.is_published ? 'on' : ''}"><div class="tog-knob"></div></div>
            <span style="font-size:10px;font-weight:700;font-family:var(--font-mono);color:${s.is_published ? 'var(--green)' : 'var(--text3)'}">${s.is_published ? 'LIVE' : 'DRAFT'}</span>
          </div>
        </div>
      </div>
      <div class="rec-body">
        <div class="rf"><span class="rf-key">Current occupancy</span>
          <div style="display:flex;align-items:center;gap:8px">
            <input class="fl-input" style="width:64px" value="${s.current_occupancy || 0}" id="occ-${s.id}"/>
            <span style="font-size:11px;color:var(--text3)">/ ${s.capacity || '?'}</span>
            <div style="flex:1;height:4px;background:var(--bg4);border-radius:2px;overflow:hidden"><div style="width:${pct}%;height:4px;background:${pct >= 100 ? 'var(--red)' : pct > 80 ? 'var(--amber)' : 'var(--green)'}"></div></div>
          </div>
        </div>
        <div class="rf"><span class="rf-key">Status</span>
          <select class="fl-sel" id="status-${s.id}">
            <option value="open" ${s.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="partial" ${s.status === 'partial' ? 'selected' : ''}>Partial</option>
            <option value="at-capacity" ${s.status === 'at-capacity' ? 'selected' : ''}>At capacity</option>
            <option value="closed" ${s.status === 'closed' ? 'selected' : ''}>Closed</option>
          </select>
        </div>
        <div class="rf"><span class="rf-key">Facility type</span><span class="rf-val">${s.facility_type || '—'}</span></div>
        <div class="rf"><span class="rf-key">Wheelchair access</span><span class="rf-val">${s.wheelchair_accessible ? 'Yes' : 'No'}</span></div>
        <div class="rf"><span class="rf-key">Contact</span><span class="rf-val">${s.contact_name || '—'} · ${s.contact_number || '—'}</span></div>
        <div class="rf"><span class="rf-key">Last updated</span><span class="rf-val mono" style="font-size:11px">${s.updated_at ? new Date(s.updated_at).toLocaleString('en-ZA') : '—'}</span></div>
      </div>
      <div class="ri-lbl" style="padding:10px 16px 0;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);font-family:var(--font-mono)">Relief items available</div>
      <div class="relief-grid">
        ${renderReliefItems(s.relief_stock || {}, s.id)}
      </div>
      <div class="rec-foot">
        <button class="btn btn-green btn-sm shelter-save" data-id="${s.id}">Save changes</button>
        <button class="btn btn-sm shelter-share" data-id="${s.id}">Share</button>
        <button class="btn btn-red btn-sm" style="margin-left:auto" onclick="deactivateShelter('${s.id}')">Deactivate</button>
      </div>
    </div>`;
}

function renderReliefItems(stock, shelterId) {
  const items = ['Food parcels', 'Water (5L)', 'Blankets', 'Hygiene kits', 'Baby packs', 'Clothing bags'];
  const keys =  ['food_parcels', 'water_units', 'blankets', 'hygiene_kits', 'baby_packs', 'clothing_bags'];
  return items.map((name, i) => `
    <div class="ri-item">
      <div class="ri-name">${name}</div>
      <div class="ri-qty">
        <input value="${stock[keys[i]] || 0}" data-key="${keys[i]}" data-shelter="${shelterId}" class="ri-stock-input"/>
        <span class="ri-unit">units</span>
      </div>
    </div>`).join('');
}

async function saveShelter(id, body) {
  const occ = parseInt(document.getElementById(`occ-${id}`)?.value) || 0;
  const status = document.getElementById(`status-${id}`)?.value;
  const stock = {};
  body.querySelectorAll(`.ri-stock-input[data-shelter="${id}"]`).forEach(inp => {
    stock[inp.dataset.key] = parseInt(inp.value) || 0;
  });

  const { error } = await supabase.from('shelters').update({
    current_occupancy: occ, status, relief_stock: stock, updated_at: new Date().toISOString()
  }).eq('id', id);

  if (!error) showToast('Shelter updated');
  else showToast('Error saving: ' + error.message, true);
}

async function renderReliefOps(body) {
  const { data: ops } = await supabase.from('relief_operations').select('*').eq('municipality_id', _muniId);
  body.innerHTML = `
    <div class="sec-hdr">
      <div><div class="sec-hdr-title">Relief operations</div><div class="sec-hdr-sub">${ops?.length || 0} operations</div></div>
      <button class="btn btn-red" onclick="openAddReliefModal()">+ Add operation</button>
    </div>
    ${ops?.length ? ops.map(op => renderReliefOpCard(op)).join('') : emptyState('No relief operations yet.')}`;
}

function renderReliefOpCard(op) {
  return `
    <div class="rec-card">
      <div class="rec-head">
        <div class="rec-icon" style="background:var(--blue-dim)"><svg viewBox="0 0 15 15" style="stroke:var(--blue)"><path d="M7.5 2v11M2 7.5h11" stroke-width="1.8"/></svg></div>
        <div>
          <div class="rec-name">${op.name}</div>
          <div class="rec-meta">Ward ${op.ward_number} · ${op.distribution_point || 'TBC'} · ${op.schedule || 'TBC'}</div>
        </div>
        <div class="rec-badges">
          <span class="badge ${op.status === 'active' ? 'b-green' : op.status === 'upcoming' ? 'b-blue' : 'b-gray'}">${(op.status || 'unknown').toUpperCase()}</span>
          <div class="pub-tog" data-id="${op.id}" data-published="${op.is_published}">
            <div class="tog-track ${op.is_published ? 'on' : ''}"><div class="tog-knob"></div></div>
            <span style="font-size:10px;font-weight:700;font-family:var(--font-mono);color:${op.is_published ? 'var(--green)' : 'var(--text3)'}">${op.is_published ? 'LIVE' : 'DRAFT'}</span>
          </div>
        </div>
      </div>
      <div class="rec-body">
        <div class="rf"><span class="rf-key">Hazard linked</span><span class="rf-val">${op.hazard_name || '—'}</span></div>
        <div class="rf"><span class="rf-key">Responsible org</span><span class="rf-val">${op.responsible_org || '—'}</span></div>
        <div class="rf"><span class="rf-key">Public contact</span><span class="rf-val">${op.public_contact || '—'}</span></div>
        <div class="rf"><span class="rf-key">Ends</span><span class="rf-val mono" style="font-size:11px">${op.end_date ? new Date(op.end_date).toLocaleDateString('en-ZA') : '—'}</span></div>
      </div>
      <div class="rec-foot">
        <button class="btn btn-sm btn-green">Save</button>
        <button class="btn btn-sm" onclick="openShareModal({type:'relief',title:'${op.name.replace(/'/g, "\\'")}',imageCategory:'relief',url:'${window.location.origin}/public/relief/${op.id}',text:'RELIEF DISTRIBUTION — ${op.name.replace(/'/g, "\\'")}\\n${op.distribution_point || ''}\\n${op.schedule || ''}\\nContact: ${op.public_contact || 'N/A'}'})">Share</button>
      </div>
    </div>`;
}

async function renderSAWS(body) {
  const { data: warnings } = await supabase.from('saws_warnings').select('*').eq('municipality_id', _muniId).order('created_at', { ascending: false });
  body.innerHTML = `
    <div class="sec-hdr">
      <div><div class="sec-hdr-title">SAWS weather warnings</div><div class="sec-hdr-sub">Auto-fetched · ${warnings?.filter(w => w.is_active).length || 0} active</div></div>
      <button class="btn btn-red" id="add-saws-btn">+ Manual alert</button>
    </div>
    <div id="saws-form-area"></div>
    ${warnings?.length ? warnings.map(w => renderSAWSCard(w)).join('') : emptyState('No active warnings. Warnings will appear here when fetched from SAWS or added manually.')}`;

  // Bind AFTER innerHTML is set
  document.getElementById('add-saws-btn')?.addEventListener('click', () => showSAWSForm(body, _muniId));
}

function renderSAWSCard(w) {
  return `
    <div class="rec-card" style="${w.is_active ? 'border-color:rgba(248,81,73,.3)' : ''}">
      <div class="rec-head">
        ${w.is_active ? '<div class="pulse-dot" style="width:8px;height:8px;margin-right:4px"></div>' : ''}
        <div>
          <div class="rec-name" style="color:${w.is_active ? 'var(--red)' : 'var(--text)'}">${w.title}</div>
          <div class="rec-meta">Valid ${w.valid_from ? new Date(w.valid_from).toLocaleString('en-ZA') : '—'} — ${w.valid_to ? new Date(w.valid_to).toLocaleString('en-ZA') : '—'}</div>
        </div>
        <div class="rec-badges"><span class="badge ${w.is_active ? 'b-red' : 'b-gray'}">${w.is_active ? 'ACTIVE' : 'EXPIRED'}</span></div>
      </div>
      <div style="padding:10px 16px;font-size:12px;color:var(--text2);line-height:1.6">${w.description || ''}</div>
      <div class="rec-foot">
        <button class="btn btn-sm" onclick="openShareModal({type:'warning',title:'${w.title.replace(/'/g, "\\'")}',imageCategory:'closure',url:'${window.location.origin}/public/warnings/${w.id}',text:'WEATHER WARNING — SAWS\\n${w.title.replace(/'/g, "\\'")}\\n${w.description?.replace(/'/g, "\\'")?.slice(0, 120) || ''}'})">Share warning</button>
      </div>
    </div>`;
}

function togglePublish(tog) {
  const track = tog.querySelector('.tog-track');
  const lbl = tog.querySelector('span');
  if (!track) return;
  track.classList.toggle('on');
  const isOn = track.classList.contains('on');
  if (lbl) { lbl.textContent = isOn ? 'LIVE' : 'DRAFT'; lbl.style.color = isOn ? 'var(--green)' : 'var(--text3)'; }
  const id = tog.dataset.id;
  supabase.from('shelters').update({ is_published: isOn }).eq('id', id);
}

function showSAWSForm(body, muniId) {
  const area = document.getElementById('saws-form-area');
  if (!area) return;
  if (area.innerHTML) { area.innerHTML = ''; return; }

  area.innerHTML = `
    <div style="background:var(--bg3);border:1px solid var(--red-mid);border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">Add manual weather warning</div>
      <div class="fl"><span class="fl-label">Warning title</span><input class="fl-input" id="sw-title" placeholder="e.g. Severe thunderstorm warning"/></div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Warning type</span>
          <select class="fl-sel" id="sw-type">
            <option>Thunderstorm</option><option>Flash Flood</option><option>Strong Wind</option>
            <option>Fire Danger</option><option>Heatwave</option><option>Cold Front</option>
            <option>Drought</option><option>Hailstorm</option>
          </select>
        </div>
        <div class="fl"><span class="fl-label">Severity</span>
          <select class="fl-sel" id="sw-severity">
            <option value="advisory">Advisory</option>
            <option value="warning">Warning</option>
            <option value="severe">Severe</option>
          </select>
        </div>
      </div>
      <div class="fl"><span class="fl-label">Description</span><textarea class="fl-textarea" id="sw-desc" rows="3" placeholder="Describe the warning, affected areas and precautions..."></textarea></div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Valid from</span><input class="fl-input" type="datetime-local" id="sw-from"/></div>
        <div class="fl"><span class="fl-label">Valid to</span><input class="fl-input" type="datetime-local" id="sw-to"/></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-red btn-sm" id="save-saws-btn">Save warning</button>
        <button class="btn btn-sm" onclick="document.getElementById('saws-form-area').innerHTML=''">Cancel</button>
      </div>
    </div>`;

  document.getElementById('save-saws-btn')?.addEventListener('click', async () => {
    const title = document.getElementById('sw-title')?.value.trim();
    if (!title) { alert('Please enter a warning title.'); return; }

    const { error } = await supabase.from('saws_warnings').insert({
      municipality_id: muniId,
      title,
      warning_type: document.getElementById('sw-type')?.value,
      severity:     document.getElementById('sw-severity')?.value,
      description:  document.getElementById('sw-desc')?.value,
      valid_from:   document.getElementById('sw-from')?.value || null,
      valid_to:     document.getElementById('sw-to')?.value   || null,
      is_active:    true,
      is_manual:    true,
      source:       'Manual entry'
    });

    if (!error) { area.innerHTML = ''; showToast('Warning saved'); await renderSAWS(body); }
    else showToast(error.message, true);
  });
}

function emptyState(msg) {
  return `<div style="text-align:center;padding:48px 20px;color:var(--text3);font-size:12px;font-family:monospace">${msg}</div>`;
}

function showToast(msg, isError = false) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:${isError ? 'var(--red-dim)' : 'var(--green-dim)'};border:1px solid ${isError ? 'var(--red)' : 'var(--green)'};color:${isError ? 'var(--red)' : 'var(--green)'};padding:10px 16px;border-radius:6px;font-size:12px;font-family:var(--font-mono);font-weight:700;z-index:500;transition:opacity .3s`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2500);
}
