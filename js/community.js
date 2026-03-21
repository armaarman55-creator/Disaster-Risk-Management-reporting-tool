// js/community.js
import { supabase } from './supabase.js';
import { openShareModal } from './share.js';

let _muniId = null;
let _activeTab = 'shelters';

export async function initCommunity(user) {
  _muniId = user?.municipality_id;
  bindCommunityTabs();
  await loadTab('shelters');
}

function bindCommunityTabs() {
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
    case 'shelters':   await renderShelters(body);   break;
    case 'relief-ops': await renderReliefOps(body);  break;
    case 'saws':       await renderSAWS(body);        break;
  }
}

// ── SHELTERS ─────────────────────────────────────────────
async function renderShelters(body) {
  const { data: shelters } = await supabase
    .from('shelters').select('*')
    .eq('municipality_id', _muniId).order('ward_number');

  body.innerHTML = `
    <div class="sec-hdr">
      <div><div class="sec-hdr-title">Registered shelters</div><div class="sec-hdr-sub">${shelters?.length || 0} registered</div></div>
      <button class="btn btn-red btn-sm" id="add-shelter-btn">+ Add shelter</button>
    </div>
    <div id="shelter-form-area"></div>
    <div id="shelters-list">
      ${shelters?.length ? shelters.map(s => renderShelterCard(s)).join('') : emptyState('No shelters registered yet.')}
    </div>`;

  // Bind AFTER innerHTML
  document.getElementById('add-shelter-btn')?.addEventListener('click', () => showShelterForm(null));
  bindShelterEvents(shelters || []);
}

function showShelterForm(existing) {
  const area = document.getElementById('shelter-form-area');
  if (!area) return;
  if (area.innerHTML && !existing) { area.innerHTML = ''; return; }

  const s = existing || {};
  area.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--red-mid);border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">${existing ? 'Edit shelter' : 'Add new shelter'}</div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Shelter name</span><input class="fl-input" id="sh-name" value="${s.name||''}"/></div>
        <div class="fl"><span class="fl-label">Facility type</span>
          <select class="fl-sel" id="sh-type">
            ${['Community hall','School','Church','Sports centre','Civic centre','Other'].map(t=>`<option ${s.facility_type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="fl"><span class="fl-label">Address</span><input class="fl-input" id="sh-address" value="${s.address||''}"/></div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Ward number</span><input class="fl-input" type="number" id="sh-ward" value="${s.ward_number||''}"/></div>
        <div class="fl"><span class="fl-label">Capacity</span><input class="fl-input" type="number" id="sh-capacity" value="${s.capacity||''}"/></div>
      </div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Contact name</span><input class="fl-input" id="sh-contact-name" value="${s.contact_name||''}"/></div>
        <div class="fl"><span class="fl-label">Contact number</span><input class="fl-input" id="sh-contact-num" value="${s.contact_number||''}"/></div>
      </div>
      <div class="frow">
        <div class="fl"><span class="fl-label">GPS Latitude</span><input class="fl-input" id="sh-lat" value="${s.gps_lat||''}" placeholder="-33.5869"/></div>
        <div class="fl"><span class="fl-label">GPS Longitude</span><input class="fl-input" id="sh-lng" value="${s.gps_lng||''}" placeholder="22.2065"/></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;cursor:pointer;font-size:13px;color:var(--text2)">
        <input type="checkbox" id="sh-wheelchair" ${s.wheelchair_accessible?'checked':''} style="width:15px;height:15px"/>
        Wheelchair accessible
      </label>
      <div style="display:flex;gap:8px">
        <button class="btn btn-green btn-sm" id="save-shelter-btn" data-id="${s.id||''}">Save shelter</button>
        <button class="btn btn-sm" onclick="document.getElementById('shelter-form-area').innerHTML=''">Cancel</button>
      </div>
    </div>`;

  document.getElementById('save-shelter-btn')?.addEventListener('click', async () => {
    const id   = document.getElementById('save-shelter-btn').dataset.id;
    const name = document.getElementById('sh-name')?.value.trim();
    if (!name) { alert('Shelter name is required.'); return; }

    const payload = {
      municipality_id:      _muniId,
      name,
      facility_type:        document.getElementById('sh-type')?.value,
      address:              document.getElementById('sh-address')?.value,
      ward_number:          parseInt(document.getElementById('sh-ward')?.value)||null,
      capacity:             parseInt(document.getElementById('sh-capacity')?.value)||0,
      contact_name:         document.getElementById('sh-contact-name')?.value,
      contact_number:       document.getElementById('sh-contact-num')?.value,
      gps_lat:              parseFloat(document.getElementById('sh-lat')?.value)||null,
      gps_lng:              parseFloat(document.getElementById('sh-lng')?.value)||null,
      wheelchair_accessible: document.getElementById('sh-wheelchair')?.checked,
      status:               'closed',
      current_occupancy:    0,
      is_published:         false
    };

    const { error } = id
      ? await supabase.from('shelters').update(payload).eq('id', id)
      : await supabase.from('shelters').insert(payload);

    if (error) { showToast(error.message, true); return; }
    showToast('✓ Shelter saved successfully!');
    area.innerHTML = '';
    await renderShelters(document.getElementById('community-body'));
  });
}

function renderShelterCard(s) {
  const pct = s.capacity ? Math.round(((s.current_occupancy||0)/s.capacity)*100) : 0;
  const statusBadge = { open:'b-green','at-capacity':'b-red',closed:'b-gray',partial:'b-amber' };

  return `
    <div class="rec-card" style="margin-bottom:12px" id="sc-${s.id}">
      <div class="rec-head">
        <div class="rec-icon" style="background:var(--green-dim)">
          <svg viewBox="0 0 15 15" fill="none" stroke="var(--green)" stroke-width="1.5" stroke-linecap="round"><path d="M2 6l5.5-4 5.5 4v7H2z"/><rect x="5" y="9" width="3" height="4"/></svg>
        </div>
        <div style="flex:1">
          <div class="rec-name">${s.name}</div>
          <div class="rec-meta">Ward ${s.ward_number||'?'} · ${s.address||'No address'} · Cap. ${s.capacity||0}</div>
        </div>
        <div class="rec-badges">
          <span class="badge ${statusBadge[s.status]||'b-gray'}">${(s.status||'unknown').toUpperCase()}</span>
          <div class="pub-tog" data-id="${s.id}" data-table="shelters">
            <div class="tog-track ${s.is_published?'on':''}"><div class="tog-knob"></div></div>
            <span style="font-size:10px;font-weight:700;color:${s.is_published?'var(--green)':'var(--text3)'}">${s.is_published?'LIVE':'DRAFT'}</span>
          </div>
        </div>
      </div>
      <div class="rec-body">
        <div class="rf"><span class="rf-key">Occupancy</span>
          <div style="display:flex;align-items:center;gap:8px">
            <input class="fl-input" style="width:64px" value="${s.current_occupancy||0}" id="occ-${s.id}" type="number"/>
            <span style="font-size:11px;color:var(--text3)">/ ${s.capacity||0}</span>
            <div style="flex:1;height:4px;background:var(--bg4);border-radius:2px;overflow:hidden">
              <div style="width:${pct}%;height:4px;background:${pct>=100?'var(--red)':pct>80?'var(--amber)':'var(--green)'}"></div>
            </div>
          </div>
        </div>
        <div class="rf"><span class="rf-key">Status</span>
          <select class="fl-sel" id="status-${s.id}">
            <option value="open" ${s.status==='open'?'selected':''}>Open</option>
            <option value="partial" ${s.status==='partial'?'selected':''}>Partial</option>
            <option value="at-capacity" ${s.status==='at-capacity'?'selected':''}>At capacity</option>
            <option value="closed" ${s.status==='closed'?'selected':''}>Closed</option>
          </select>
        </div>
        <div class="rf"><span class="rf-key">Contact</span><span class="rf-val">${s.contact_name||'—'} · ${s.contact_number||'—'}</span></div>
        <div class="rf"><span class="rf-key">Wheelchair</span><span class="rf-val">${s.wheelchair_accessible?'Yes':'No'}</span></div>
      </div>
      <div class="rec-foot">
        <button class="btn btn-green btn-sm shelter-update" data-id="${s.id}">Update</button>
        <button class="btn btn-sm shelter-edit" data-id="${s.id}">Edit details</button>
        <button class="btn btn-sm shelter-share" data-id="${s.id}">Share</button>
        <button class="btn btn-sm shelter-dl" data-id="${s.id}" data-name="${s.name}">↓ Save</button>
        <button class="btn btn-sm btn-red shelter-delete" data-id="${s.id}" style="margin-left:auto">Delete</button>
      </div>
    </div>`;
}

function bindShelterEvents(shelters) {
  // Update occupancy/status
  document.querySelectorAll('.shelter-update').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id  = btn.dataset.id;
      const { error } = await supabase.from('shelters').update({
        current_occupancy: parseInt(document.getElementById(`occ-${id}`)?.value)||0,
        status:            document.getElementById(`status-${id}`)?.value,
        updated_at:        new Date().toISOString()
      }).eq('id', id);
      if (!error) showToast('✓ Shelter updated successfully!');
      else showToast(error.message, true);
    });
  });

  // Edit full details
  document.querySelectorAll('.shelter-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const shelter = shelters.find(s => s.id === btn.dataset.id);
      if (shelter) showShelterForm(shelter);
    });
  });

  // Delete
  document.querySelectorAll('.shelter-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this shelter?')) return;
      await supabase.from('shelters').delete().eq('id', btn.dataset.id);
      showToast('Shelter deleted');
      await renderShelters(document.getElementById('community-body'));
    });
  });

  // Share
  document.querySelectorAll('.shelter-share').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = shelters.find(x => x.id === btn.dataset.id);
      if (!s) return;
      openShareModal({
        type:'shelter', title:s.name, imageCategory:'shelter',
        url:`${window.location.origin}/public/shelters/${s.id}`,
        text:`SHELTER — ${s.name}\nWard ${s.ward_number} · ${s.address||''}\nStatus: ${(s.status||'').toUpperCase()}\nCapacity: ${s.current_occupancy||0} / ${s.capacity}`
      });
    });
  });

  // Download
  document.querySelectorAll('.shelter-dl').forEach(btn => {
    btn.addEventListener('click', () => {
      const el   = document.getElementById(`sc-${btn.dataset.id}`);
      const text = el ? el.innerText : btn.dataset.name;
      const blob = new Blob([text], {type:'text/plain'});
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), {href:url, download:`DRMSA-shelter-${btn.dataset.name}.txt`});
      a.click(); URL.revokeObjectURL(url);
    });
  });

  // Publish toggles
  document.querySelectorAll('.pub-tog').forEach(tog => {
    tog.addEventListener('click', async () => {
      const track = tog.querySelector('.tog-track');
      const lbl   = tog.querySelector('span');
      track?.classList.toggle('on');
      const isOn = track?.classList.contains('on');
      if (lbl) { lbl.textContent=isOn?'LIVE':'DRAFT'; lbl.style.color=isOn?'var(--green)':'var(--text3)'; }
      await supabase.from(tog.dataset.table||'shelters').update({ is_published:isOn }).eq('id',tog.dataset.id);
    });
  });
}

// ── RELIEF OPERATIONS ─────────────────────────────────────
async function renderReliefOps(body) {
  const { data: ops } = await supabase
    .from('relief_operations').select('*')
    .eq('municipality_id', _muniId).order('created_at', { ascending: false });

  body.innerHTML = `
    <div class="sec-hdr">
      <div><div class="sec-hdr-title">Relief operations</div><div class="sec-hdr-sub">${ops?.length||0} operations</div></div>
      <button class="btn btn-red btn-sm" id="add-relief-btn">+ Add operation</button>
    </div>
    <div id="relief-form-area"></div>
    <div id="relief-list">
      ${ops?.length ? ops.map(op => renderReliefCard(op)).join('') : emptyState('No relief operations yet.')}
    </div>`;

  // Bind AFTER innerHTML
  document.getElementById('add-relief-btn')?.addEventListener('click', () => showReliefForm(null));
  bindReliefEvents(ops || []);
}

function showReliefForm(existing) {
  const area = document.getElementById('relief-form-area');
  if (!area) return;
  if (area.innerHTML && !existing) { area.innerHTML = ''; return; }

  const op = existing || {};
  area.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--red-mid);border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">${existing ? 'Edit relief operation' : 'Add relief operation'}</div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Operation name</span><input class="fl-input" id="ro-name" value="${op.name||''}"/></div>
        <div class="fl"><span class="fl-label">Status</span>
          <select class="fl-sel" id="ro-status">
            <option value="upcoming" ${op.status==='upcoming'?'selected':''}>Upcoming</option>
            <option value="active"   ${op.status==='active'  ?'selected':''}>Active</option>
            <option value="ended"    ${op.status==='ended'   ?'selected':''}>Ended</option>
          </select>
        </div>
      </div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Hazard linked</span><input class="fl-input" id="ro-hazard" value="${op.hazard_name||''}"/></div>
        <div class="fl"><span class="fl-label">Ward number</span><input class="fl-input" type="number" id="ro-ward" value="${op.ward_number||''}"/></div>
      </div>
      <div class="fl"><span class="fl-label">Distribution point / location</span><input class="fl-input" id="ro-location" value="${op.distribution_point||''}"/></div>
      <div class="fl"><span class="fl-label">Schedule</span><input class="fl-input" id="ro-schedule" value="${op.schedule||''}" placeholder="e.g. Daily 08:00–12:00"/></div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Responsible organisation</span><input class="fl-input" id="ro-org" value="${op.responsible_org||''}"/></div>
        <div class="fl"><span class="fl-label">Public contact number</span><input class="fl-input" id="ro-contact" value="${op.public_contact||''}"/></div>
      </div>
      <div class="fl"><span class="fl-label">End date</span><input class="fl-input" type="date" id="ro-end" value="${op.end_date||''}"/></div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn btn-green btn-sm" id="save-relief-btn" data-id="${op.id||''}">Save operation</button>
        <button class="btn btn-sm" onclick="document.getElementById('relief-form-area').innerHTML=''">Cancel</button>
      </div>
    </div>`;

  document.getElementById('save-relief-btn')?.addEventListener('click', async () => {
    const id   = document.getElementById('save-relief-btn').dataset.id;
    const name = document.getElementById('ro-name')?.value.trim();
    if (!name) { alert('Operation name is required.'); return; }

    const payload = {
      municipality_id:  _muniId,
      name,
      status:           document.getElementById('ro-status')?.value,
      hazard_name:      document.getElementById('ro-hazard')?.value,
      ward_number:      parseInt(document.getElementById('ro-ward')?.value)||null,
      distribution_point: document.getElementById('ro-location')?.value,
      schedule:         document.getElementById('ro-schedule')?.value,
      responsible_org:  document.getElementById('ro-org')?.value,
      public_contact:   document.getElementById('ro-contact')?.value,
      end_date:         document.getElementById('ro-end')?.value||null,
      is_published:     false
    };

    const { error } = id
      ? await supabase.from('relief_operations').update(payload).eq('id', id)
      : await supabase.from('relief_operations').insert(payload);

    if (error) { showToast(error.message, true); return; }
    showToast('✓ Relief operation saved successfully!');
    document.getElementById('relief-form-area').innerHTML = '';
    await renderReliefOps(document.getElementById('community-body'));
  });
}

function renderReliefCard(op) {
  return `
    <div class="rec-card" style="margin-bottom:12px">
      <div class="rec-head">
        <div class="rec-icon" style="background:var(--blue-dim)">
          <svg viewBox="0 0 15 15" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-linecap="round"><path d="M7.5 2v11M2 7.5h11"/></svg>
        </div>
        <div style="flex:1">
          <div class="rec-name">${op.name}</div>
          <div class="rec-meta">Ward ${op.ward_number||'?'} · ${op.distribution_point||'TBC'} · ${op.schedule||'TBC'}</div>
        </div>
        <div class="rec-badges">
          <span class="badge ${op.status==='active'?'b-green':op.status==='upcoming'?'b-blue':'b-gray'}">${(op.status||'unknown').toUpperCase()}</span>
        </div>
      </div>
      <div class="rec-body">
        <div class="rf"><span class="rf-key">Hazard</span><span class="rf-val">${op.hazard_name||'—'}</span></div>
        <div class="rf"><span class="rf-key">Responsible org</span><span class="rf-val">${op.responsible_org||'—'}</span></div>
        <div class="rf"><span class="rf-key">Public contact</span><span class="rf-val">${op.public_contact||'—'}</span></div>
        <div class="rf"><span class="rf-key">Ends</span><span class="rf-val">${op.end_date?new Date(op.end_date).toLocaleDateString('en-ZA'):'—'}</span></div>
      </div>
      <div class="rec-foot">
        <button class="btn btn-sm btn-green relief-edit" data-id="${op.id}">Edit</button>
        <button class="btn btn-sm relief-share" data-id="${op.id}">Share</button>
        <button class="btn btn-sm relief-dl" data-id="${op.id}" data-name="${op.name}">↓ Save</button>
        <button class="btn btn-sm btn-red relief-delete" data-id="${op.id}" style="margin-left:auto">Delete</button>
      </div>
    </div>`;
}

function bindReliefEvents(ops) {
  document.querySelectorAll('.relief-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = ops.find(o => o.id === btn.dataset.id);
      if (op) showReliefForm(op);
    });
  });
  document.querySelectorAll('.relief-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this operation?')) return;
      await supabase.from('relief_operations').delete().eq('id', btn.dataset.id);
      showToast('Operation deleted');
      await renderReliefOps(document.getElementById('community-body'));
    });
  });
  // Download
  document.querySelectorAll('.relief-dl').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = `RELIEF OPERATION\n${btn.dataset.name}`;
      const blob = new Blob([text], {type:'text/plain'});
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), {href:url, download:`DRMSA-relief-${btn.dataset.name}.txt`});
      a.click(); URL.revokeObjectURL(url);
    });
  });

  document.querySelectorAll('.relief-share').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = ops.find(o => o.id === btn.dataset.id);
      if (!op) return;
      openShareModal({
        type:'relief', title:op.name, imageCategory:'relief',
        url:`${window.location.origin}/public/relief/${op.id}`,
        text:`RELIEF DISTRIBUTION — ${op.name}\n${op.distribution_point||''}\n${op.schedule||''}\nContact: ${op.public_contact||'N/A'}`
      });
    });
  });
}

// ── SAWS ─────────────────────────────────────────────────
async function renderSAWS(body) {
  const { data: warnings } = await supabase
    .from('saws_warnings').select('*')
    .eq('municipality_id', _muniId).order('created_at', { ascending: false });

  body.innerHTML = `
    <div class="sec-hdr">
      <div><div class="sec-hdr-title">SAWS weather warnings</div><div class="sec-hdr-sub">${warnings?.filter(w=>w.is_active).length||0} active</div></div>
      <button class="btn btn-red btn-sm" id="add-saws-btn">+ Manual alert</button>
    </div>
    <div id="saws-form-area"></div>
    ${warnings?.length ? warnings.map(w => renderSAWSCard(w)).join('') : emptyState('No active warnings.')}`;

  document.getElementById('add-saws-btn')?.addEventListener('click', () => showSAWSForm(body, _muniId));
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
      <div class="fl"><span class="fl-label">Description</span><textarea class="fl-textarea" id="sw-desc" rows="3"></textarea></div>
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
      municipality_id: muniId, title,
      warning_type:    document.getElementById('sw-type')?.value,
      severity:        document.getElementById('sw-severity')?.value,
      description:     document.getElementById('sw-desc')?.value,
      valid_from:      document.getElementById('sw-from')?.value||null,
      valid_to:        document.getElementById('sw-to')?.value||null,
      is_active:true, is_manual:true, source:'Manual entry'
    });
    if (!error) { area.innerHTML=''; showToast('✓ Warning saved successfully!'); await renderSAWS(body); }
    else showToast(error.message, true);
  });
}

function renderSAWSCard(w) {
  return `
    <div class="rec-card" style="margin-bottom:12px${w.is_active?';border-color:rgba(248,81,73,.3)':''}">
      <div class="rec-head">
        ${w.is_active?'<div class="pulse-dot" style="width:8px;height:8px;margin-right:4px"></div>':''}
        <div style="flex:1">
          <div class="rec-name" style="color:${w.is_active?'var(--red)':'var(--text)'}">${w.title}</div>
          <div class="rec-meta">${w.warning_type||''} · ${w.valid_from?new Date(w.valid_from).toLocaleString('en-ZA'):'—'} — ${w.valid_to?new Date(w.valid_to).toLocaleString('en-ZA'):'—'}</div>
        </div>
        <span class="badge ${w.is_active?'b-red':'b-gray'}">${w.is_active?'ACTIVE':'EXPIRED'}</span>
      </div>
      ${w.description?`<div style="padding:10px 16px;font-size:12px;color:var(--text2);line-height:1.6">${w.description}</div>`:''}
      <div class="rec-foot">
        <button class="btn btn-sm saws-share" data-id="${w.id}" data-title="${w.title.replace(/"/g,'&quot;')}" data-desc="${(w.description||'').replace(/"/g,'&quot;')}">Share warning</button>
        <button class="btn btn-sm btn-red" onclick="deactivateSAWS('${w.id}')">Deactivate</button>
      </div>
    </div>`;
}

window.deactivateSAWS = async function(id) {
  await supabase.from('saws_warnings').update({ is_active: false }).eq('id', id);
  showToast('Warning deactivated');
  await renderSAWS(document.getElementById('community-body'));
};

// ── DOWNLOAD RECORD ───────────────────────────────────────
window._downloadRecord = function(type, id, name) {
  const el = document.getElementById(`sc-${id}`) || document.querySelector(`[id$="${id}"]`);
  const text = el ? el.innerText : `${type.toUpperCase()}: ${name}`;
  const blob = new Blob([text], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `DRMSA-${type}-${name.replace(/\s/g,'-')}.txt`;
  a.click(); URL.revokeObjectURL(url);
};

function emptyState(msg) {
  return `<div style="text-align:center;padding:48px 20px;color:var(--text3);font-size:12px">${msg}</div>`;
}

function showToast(msg, isError=false) {
  // Remove existing toasts
  document.querySelectorAll('.drmsa-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'drmsa-toast';
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:${isError?'var(--bg2)':'var(--bg2)'};border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:12px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,.3);transition:opacity .3s;max-width:320px`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(() => t.remove(), 300); }, 3000);
}
