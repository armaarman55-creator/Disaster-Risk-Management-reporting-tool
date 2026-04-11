// js/routes.js
import { supabase } from './supabase.js';
import { confirmDialog } from './confirm-dialog.js';

let _muniId   = null;
let _closures = [];
let _muniLogos = { main: null, dm: null, mode: 'main' };
const ROUTE_PNG_TEMPLATES = [
  { key: 'official', label: 'Official notice', desc: 'Formal municipal document', preview: 'linear-gradient(135deg,#f8fafc,#e2e8f0)' },
  { key: 'compact', label: 'Compact bulletin', desc: 'Dense compact card', preview: 'linear-gradient(135deg,#f5f3ff,#ddd6fe)' },
  { key: 'social', label: 'Social square', desc: 'Social media poster', preview: 'linear-gradient(135deg,#0f172a,#1d4ed8)' },
  { key: 'alert-card', label: 'Alert card', desc: 'High-contrast emergency card', preview: 'linear-gradient(135deg,#7f1d1d,#dc2626)' },
  { key: 'clean-light', label: 'Clean light', desc: 'Minimal clean handout', preview: 'linear-gradient(135deg,#ffffff,#d1fae5)' }
];

function titleToneWord(tone) {
  return tone === 'advisory' ? 'Advisory' : tone === 'update' ? 'Update' : 'Notification';
}

function applyTitleTone(title, tone) {
  return String(title || '').replace(/\b(Notification|Notice|Bulletin|Update)\b/i, titleToneWord(tone));
}

function routeTemplatePreviewDataUri(templateKey) {
  const c = document.createElement('canvas');
  c.width = 180; c.height = 96;
  const x = c.getContext('2d');
  const drawCommon = (left = '#ffffff66', right = '#ffffff99') => {
    x.fillStyle = left; x.fillRect(8, 28, 104, 50);
    x.fillStyle = right; x.fillRect(118, 28, 54, 50);
    x.fillStyle = '#fff'; x.fillRect(8, 10, 134, 6);
  };
  if (templateKey === 'alert-card') {
    x.fillStyle = '#7f1d1d'; x.fillRect(0, 0, 180, 96);
    x.fillStyle = '#ef4444'; x.fillRect(0, 0, 180, 12);
    drawCommon('#fff1', '#fff3');
  } else if (templateKey === 'clean-light') {
    x.fillStyle = '#ecfdf5'; x.fillRect(0, 0, 180, 96);
    x.fillStyle = '#ffffff'; x.fillRect(8, 8, 164, 80);
    x.strokeStyle = '#a7f3d0'; x.strokeRect(8, 8, 164, 80);
    drawCommon('#10b98122', '#10b98133');
  } else if (templateKey === 'social') {
    const g = x.createLinearGradient(0, 0, 180, 96);
    g.addColorStop(0, '#0f172a'); g.addColorStop(1, '#1d4ed8');
    x.fillStyle = g; x.fillRect(0, 0, 180, 96);
    drawCommon('#ffffff1a', '#ffffff44');
  } else if (templateKey === 'compact') {
    x.fillStyle = '#f5f3ff'; x.fillRect(0, 0, 180, 96);
    x.fillStyle = '#8b5cf6'; x.fillRect(0, 0, 180, 8);
    drawCommon('#7c3aed22', '#7c3aed33');
  } else {
    x.fillStyle = '#f8fafc'; x.fillRect(0, 0, 180, 96);
    x.fillStyle = '#1d4ed8'; x.fillRect(0, 0, 180, 8);
    drawCommon('#1d4ed822', '#1d4ed833');
  }
  return c.toDataURL('image/png');
}

function applyRouteTemplateDecor(ctx, template, SPLIT, bodyTop, H, FTR_H) {
  if (template === 'alert-card') {
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(0, bodyTop, SPLIT, 28);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.fillText('TRAFFIC ALERT', 20, bodyTop + 18);
  } else if (template === 'clean-light') {
    ctx.strokeStyle = '#a7f3d0';
    ctx.lineWidth = 1;
    roundRect(ctx, 14, bodyTop + 10, SPLIT - 28, H - bodyTop - FTR_H - 20, 10);
    ctx.stroke();
  } else if (template === 'social') {
    const grad = ctx.createLinearGradient(0, bodyTop, SPLIT, H - FTR_H);
    grad.addColorStop(0, 'rgba(15,23,42,0.08)');
    grad.addColorStop(1, 'rgba(37,99,235,0.18)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, bodyTop, SPLIT, H - bodyTop - FTR_H);
  }
}

function openRouteTemplatePicker({ templates, onDownload }) {
  document.getElementById('route-template-picker')?.remove();
  const modal = document.createElement('div');
  modal.id = 'route-template-picker';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="width:min(760px,96vw);max-height:88vh;overflow:auto;background:var(--bg2);border:1px solid var(--border2);border-radius:12px;box-shadow:0 10px 36px rgba(0,0,0,.45);padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0;font-size:16px">Route notice image template</h3>
        <button type="button" data-close style="border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:6px;padding:4px 8px;cursor:pointer">✕</button>
      </div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:10px">Select template and content before downloading.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-bottom:12px">
        ${templates.map((tpl, idx) => `
          <label style="display:block;border:1px solid var(--border);border-radius:8px;padding:9px;background:var(--bg3);cursor:pointer">
            <input type="radio" name="tpl" value="${tpl.key}" ${idx === 0 ? 'checked' : ''} />
            <img alt="${tpl.label} preview" src="${routeTemplatePreviewDataUri(tpl.key)}" style="display:block;width:100%;height:64px;object-fit:cover;border-radius:6px;margin:6px 0;border:1px solid rgba(255,255,255,.22)" />
            <div style="font-weight:700;font-size:12px;margin-top:4px">${tpl.label}</div>
            <div style="font-size:11px;color:var(--text3)">${tpl.desc || tpl.key}</div>
          </label>
        `).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="font-size:12px">Notice wording
          <select id="route-tone" style="width:100%;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:7px;color:var(--text)">
            <option value="notification">Notification</option>
            <option value="advisory">Advisory</option>
            <option value="update">Update</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:19px">
          <input id="route-readable" type="checkbox" checked />
          Readable text (recommended)
        </label>
      </div>
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
        <div style="font-size:12px;font-weight:700;margin-bottom:6px">Include sections</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px">
          <label style="font-size:12px;display:flex;align-items:center;gap:6px"><input type="checkbox" data-sec="authority" checked/> Authority</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:6px"><input type="checkbox" data-sec="closed_since" checked/> Closed since</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:6px"><input type="checkbox" data-sec="reopen" checked/> Expected reopening</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:6px"><input type="checkbox" data-sec="alt_route" checked/> Alternative route box</label>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
        <button type="button" data-close style="border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:6px;padding:7px 10px;cursor:pointer">Cancel</button>
        <button type="button" id="route-download-now" style="border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:6px;padding:7px 12px;cursor:pointer">Download PNG</button>
      </div>
    </div>
  `;
  modal.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#route-download-now')?.addEventListener('click', async () => {
    const template = modal.querySelector('input[name="tpl"]:checked')?.value || templates[0]?.key || 'official';
    const tone = modal.querySelector('#route-tone')?.value || 'notification';
    const readable = !!modal.querySelector('#route-readable')?.checked;
    const sections = {
      authority: !!modal.querySelector('[data-sec="authority"]')?.checked,
      closed_since: !!modal.querySelector('[data-sec="closed_since"]')?.checked,
      reopen: !!modal.querySelector('[data-sec="reopen"]')?.checked,
      alt_route: !!modal.querySelector('[data-sec="alt_route"]')?.checked
    };
    modal.remove();
    await onDownload({ template, tone, readable, sections });
  });
  document.body.appendChild(modal);
}

export async function initRoutes(user) {
  _muniId = user?.municipality_id;
  await fetchMuniLogos();
  await renderRoutes();
}

async function fetchMuniLogos() {
  const { data } = await supabase
    .from('municipalities')
    .select('logo_main_url, logo_dm_url, logo_display_mode')
    .eq('id', _muniId)
    .single();
  _muniLogos = {
    main: data?.logo_main_url || null,
    dm:   data?.logo_dm_url   || null,
    mode: data?.logo_display_mode || 'main'
  };
}

async function renderRoutes() {
  const body = document.getElementById('routes-body');
  if (!body) return;

  const { data: closures } = await supabase
    .from('road_closures')
    .select('*, alternative_routes(*)')
    .eq('municipality_id', _muniId)
    .order('created_at', { ascending: false });

  _closures = closures || [];

  body.innerHTML = `
    <div class="sec-hdr">
      <div>
        <div class="sec-hdr-title">Road closures & alternative routes</div>
        <div class="sec-hdr-sub">${_closures.filter(c=>c.status==='closed').length} active closures</div>
      </div>
      <button class="btn btn-red" id="add-closure-btn">+ Add closure</button>
    </div>
    <div id="add-closure-area"></div>
    <div id="closures-list">
      ${_closures.length ? _closures.map(c => renderClosureCard(c)).join('') : emptyState('No road closures recorded.')}
    </div>`;

  requestAnimationFrame(() => {
    const btn = document.getElementById('add-closure-btn');
    if (btn) btn.onclick = () => showAddClosureForm();
    bindClosureEvents();
  });
}

function renderClosureCard(c) {
  const alt          = c.alternative_routes?.[0];
  const statusColour = { closed:'var(--red)', partial:'var(--amber)', open:'var(--green)' };

  return `
    <div class="rec-card" id="closure-${c.id}" style="margin-bottom:12px;border-left:3px solid ${statusColour[c.status]||'var(--border)'}">
      <div class="rec-head">
        <div>
          <div class="rec-name">${c.road_name}</div>
          <div class="rec-meta">${c.reason||'No reason'} · Ward${Array.isArray(c.affected_wards)?'s '+c.affected_wards.join(', '):' '+c.affected_wards||'?'}</div>
        </div>
        <div class="rec-badges">
          <span class="badge ${c.status==='closed'?'b-red':c.status==='partial'?'b-amber':'b-green'}">${(c.status||'unknown').toUpperCase()}</span>
          <div class="pub-tog" data-id="${c.id}" data-table="road_closures">
            <div class="tog-track ${c.is_published?'on':''}"><div class="tog-knob"></div></div>
            <span style="font-size:10px;font-weight:700;font-family:monospace;color:${c.is_published?'var(--green)':'var(--text3)'}">${c.is_published?'LIVE':'DRAFT'}</span>
          </div>
        </div>
      </div>
      <div class="rec-body">
        <div class="rf"><span class="rf-key">Closed since</span><span class="rf-val mono" style="font-size:11px">${c.closed_since?new Date(c.closed_since).toLocaleString('en-ZA'):'—'}</span></div>
        <div class="rf"><span class="rf-key">Expected reopening</span><input class="fl-input" value="${c.expected_reopen||''}" id="reopen-${c.id}" placeholder="e.g. 25 Mar 2025"/></div>
        <div class="rf"><span class="rf-key">Authority</span><span class="rf-val">${c.authority||'—'}</span></div>
        <div class="rf"><span class="rf-key">Status</span>
          <select class="fl-sel" id="cstatus-${c.id}">
            <option value="closed"   ${c.status==='closed'  ?'selected':''}>Fully closed</option>
            <option value="partial"  ${c.status==='partial' ?'selected':''}>Partial / Use caution</option>
            <option value="open"     ${c.status==='open'    ?'selected':''}>Reopened</option>
          </select>
        </div>
      </div>

      ${alt ? `
        <div class="alt-route-box">
          <div class="alt-label">Alternative route</div>
          <div style="font-size:12px;color:var(--text2);line-height:1.5">${alt.description}</div>
          ${alt.extra_distance?`<div style="font-size:11px;color:var(--text3);margin-top:3px">+${alt.extra_distance} km · ${alt.vehicle_suitability||'All vehicles'}</div>`:''}
          <button class="btn btn-sm" style="margin-top:8px" data-edit-alt="${alt.id}" data-closure="${c.id}">Edit route</button>
        </div>` : `
        <div style="padding:10px 16px" id="alt-area-${c.id}">
          <button class="btn btn-sm btn-green add-alt-btn" data-closure="${c.id}">+ Add alternative route</button>
        </div>`}

      <div class="rec-foot">
        <button class="btn btn-sm btn-green closure-save" data-id="${c.id}">Save changes</button>
        <button class="btn btn-sm closure-email" data-id="${c.id}">✉ Email</button>
        <button class="btn btn-sm closure-dl-toggle" data-id="${c.id}">↓ Save ▾</button>
        <button class="btn btn-sm closure-edit" data-id="${c.id}" style="margin-left:auto">Edit</button>
        <button class="btn btn-sm btn-red closure-delete" data-id="${c.id}">Delete</button>
      </div>
    </div>`;
}

// ── ADD ALT ROUTE FORM ────────────────────────────────────
function showAddAltRouteForm(closureId, containerId) {
  const area = document.getElementById(containerId || `alt-area-${closureId}`);
  if (!area) return;
  area.innerHTML = `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:12px;margin-top:8px">
      <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:10px">Add alternative route</div>
      <div class="fl"><span class="fl-label">Route description</span><textarea class="fl-textarea" id="alt-desc-${closureId}" rows="3" placeholder="Describe the alternative route…"></textarea></div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Extra distance (km)</span><input class="fl-input" type="number" id="alt-dist-${closureId}" placeholder="e.g. 4.5"/></div>
        <div class="fl"><span class="fl-label">Vehicle suitability</span>
          <select class="fl-sel" id="alt-suit-${closureId}">
            <option>All vehicles</option><option>Passenger vehicles only</option><option>Light delivery only</option><option>No heavy vehicles</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-green btn-sm" id="save-alt-${closureId}" data-closure="${closureId}">Save route</button>
        <button class="btn btn-sm" onclick="document.getElementById('alt-area-${closureId}').innerHTML='<button class=\\'btn btn-sm btn-green add-alt-btn\\' data-closure=\\'${closureId}\\'>+ Add alternative route</button>'">Cancel</button>
      </div>
    </div>`;

  document.getElementById(`save-alt-${closureId}`)?.addEventListener('click', async () => {
    const desc = document.getElementById(`alt-desc-${closureId}`)?.value.trim();
    if (!desc) { alert('Please enter a route description.'); return; }
    const { error } = await supabase.from('alternative_routes').insert({
      closure_id:         closureId,
      municipality_id:    _muniId,
      description:        desc,
      extra_distance:     parseFloat(document.getElementById(`alt-dist-${closureId}`)?.value)||null,
      vehicle_suitability: document.getElementById(`alt-suit-${closureId}`)?.value
    });
    if (!error) { showToast('✓ Alternative route saved!'); await renderRoutes(); }
    else showToast('Error: ' + error.message, true);
  });
}

function showAddClosureForm() {
  const area = document.getElementById('add-closure-area');
  if (!area) return;
  if (area.innerHTML) { area.innerHTML = ''; return; }

  area.innerHTML = `
    <div class="rec-card" style="margin-bottom:16px;border:1px solid var(--red-mid)">
      <div class="rec-head"><div class="rec-name">Add new road closure</div></div>
      <div style="padding:16px">
        <div class="frow">
          <div class="fl"><span class="fl-label">Road / street name</span><input class="fl-input" id="new-road-name" placeholder="e.g. Main Road, Knysna"/></div>
          <div class="fl"><span class="fl-label">Status</span>
            <select class="fl-sel" id="new-road-status">
              <option value="closed">Fully closed</option>
              <option value="partial">Partial / Caution</option>
              <option value="open">Reopened</option>
            </select>
          </div>
        </div>
        <div class="fl"><span class="fl-label">Reason for closure</span><input class="fl-input" id="new-road-reason" placeholder="e.g. Flood damage, sinkholes"/></div>
        <div class="frow">
          <div class="fl"><span class="fl-label">Authority</span>
            <select class="fl-sel" id="new-road-auth">
              <option>SANRAL</option><option>DRPW</option><option>Municipal</option><option>SAPS</option><option>Traffic</option>
            </select>
          </div>
          <div class="fl"><span class="fl-label">Expected reopening</span><input class="fl-input" id="new-road-reopen" placeholder="e.g. 25 Mar 2025"/></div>
        </div>
        <div class="fl"><span class="fl-label">Wards affected (comma-separated)</span><input class="fl-input" id="new-road-wards" placeholder="e.g. 3, 7, 12"/></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-red btn-sm" id="save-new-closure-btn">Save closure</button>
          <button class="btn btn-sm" onclick="document.getElementById('add-closure-area').innerHTML=''">Cancel</button>
        </div>
      </div>
    </div>`;

  document.getElementById('save-new-closure-btn')?.addEventListener('click', async () => {
    const name = document.getElementById('new-road-name')?.value.trim();
    if (!name) { alert('Road name is required.'); return; }
    const wardsRaw = document.getElementById('new-road-wards')?.value || '';
    const wards    = wardsRaw.split(',').map(w => w.trim()).filter(Boolean);
    const { error } = await supabase.from('road_closures').insert({
      municipality_id: _muniId,
      road_name:       name,
      status:          document.getElementById('new-road-status')?.value,
      reason:          document.getElementById('new-road-reason')?.value,
      affected_wards:  wards,
      authority:       document.getElementById('new-road-auth')?.value,
      expected_reopen: document.getElementById('new-road-reopen')?.value,
      closed_since:    new Date().toISOString(),
      is_published:    false
    });
    if (!error) { area.innerHTML = ''; showToast('✓ Road closure saved successfully!'); await renderRoutes(); }
    else showToast('Error saving closure: ' + error.message, true);
  });
}

function showEditClosureForm(closure) {
  const area = document.getElementById('add-closure-area');
  if (!area) return;
  area.innerHTML = `
    <div class="rec-card" style="margin-bottom:16px;border:1px solid var(--amber)">
      <div class="rec-head"><div class="rec-name">Edit closure — ${closure.road_name}</div></div>
      <div style="padding:16px">
        <div class="frow">
          <div class="fl"><span class="fl-label">Road name</span><input class="fl-input" id="edit-road-name" value="${closure.road_name||''}"/></div>
          <div class="fl"><span class="fl-label">Status</span>
            <select class="fl-sel" id="edit-road-status">
              <option value="closed"   ${closure.status==='closed'  ?'selected':''}>Fully closed</option>
              <option value="partial"  ${closure.status==='partial' ?'selected':''}>Partial / Caution</option>
              <option value="open"     ${closure.status==='open'    ?'selected':''}>Reopened</option>
            </select>
          </div>
        </div>
        <div class="fl"><span class="fl-label">Reason</span><input class="fl-input" id="edit-road-reason" value="${closure.reason||''}"/></div>
        <div class="frow">
          <div class="fl"><span class="fl-label">Authority</span>
            <select class="fl-sel" id="edit-road-auth">
              <option ${closure.authority==='SANRAL'   ?'selected':''}>SANRAL</option>
              <option ${closure.authority==='DRPW'     ?'selected':''}>DRPW</option>
              <option ${closure.authority==='Municipal'?'selected':''}>Municipal</option>
              <option ${closure.authority==='SAPS'     ?'selected':''}>SAPS</option>
              <option ${closure.authority==='Traffic'  ?'selected':''}>Traffic</option>
            </select>
          </div>
          <div class="fl"><span class="fl-label">Expected reopening</span><input class="fl-input" id="edit-road-reopen" value="${closure.expected_reopen||''}"/></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-green btn-sm" id="save-edit-closure-btn" data-id="${closure.id}">Save changes</button>
          <button class="btn btn-sm" onclick="document.getElementById('add-closure-area').innerHTML=''">Cancel</button>
        </div>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    document.getElementById('save-edit-closure-btn')?.addEventListener('click', async () => {
      const id = document.getElementById('save-edit-closure-btn').dataset.id;
      const { error } = await supabase.from('road_closures').update({
        road_name:       document.getElementById('edit-road-name')?.value,
        status:          document.getElementById('edit-road-status')?.value,
        reason:          document.getElementById('edit-road-reason')?.value,
        authority:       document.getElementById('edit-road-auth')?.value,
        expected_reopen: document.getElementById('edit-road-reopen')?.value,
        updated_at:      new Date().toISOString()
      }).eq('id', id);
      if (!error) { document.getElementById('add-closure-area').innerHTML = ''; showToast('✓ Closure updated successfully!'); await renderRoutes(); }
      else showToast('Error: ' + error.message, true);
    });
  });
}

// ── PNG IMAGE DOWNLOAD ────────────────────────────────────
async function downloadClosurePNG(c, template = 'official', opts = {}) {
  const tone = opts.tone || 'notification';
  const readable = opts.readable !== false;
  const sections = { authority: true, closed_since: true, reopen: true, alt_route: true, ...(opts.sections || {}) };
  const alt         = c.alternative_routes?.[0];
  const muniName    = window._drmsaUser?.municipalities?.name || 'Municipality';
  const date        = new Date().toLocaleString('en-ZA');
  const statusLabel = { closed:'FULLY CLOSED', partial:'PARTIAL CLOSURE', open:'REOPENED' }[c.status] || (c.status||'').toUpperCase();
  const accentColor = { closed:'#1a3a6b', partial:'#7a5200', open:'#1a6b3a' }[c.status] || '#1a3a6b';
  const statusBg    = { closed:'#c0392b', partial:'#d4860a', open:'#1a6b3a' }[c.status] || '#555';
  const cfgBase = {
    official: { W: 900, baseH: 480, altH: 580, title: 'Road Closure Notice', titleSize: 26, bodySize: 13, splitRatio: 0.63, baseBg: '#f0eeea', leftBg: '#fafaf8', headerBg: '#ffffff' },
    compact: { W: 900, baseH: 420, altH: 500, title: 'Road Closure Bulletin', titleSize: 23, bodySize: 12, splitRatio: 0.58, baseBg: '#f7f5ff', leftBg: '#fcfbff', headerBg: '#ffffff' },
    social: { W: 1080, baseH: 860, altH: 980, title: 'Road Closure Update', titleSize: 34, bodySize: 15, splitRatio: 0.56, baseBg: '#e6eefc', leftBg: '#f8fbff', headerBg: '#f8fbff' },
    'alert-card': { W: 1000, baseH: 560, altH: 650, title: 'Road Closure Alert', titleSize: 30, bodySize: 14, splitRatio: 0.60, baseBg: '#fff1f2', leftBg: '#fff7f7', headerBg: '#fff5f5' },
    'clean-light': { W: 980, baseH: 540, altH: 630, title: 'Road Closure Advisory', titleSize: 28, bodySize: 14, splitRatio: 0.65, baseBg: '#ecfdf5', leftBg: '#f7fffb', headerBg: '#ffffff' }
  }[template] || { W: 900, baseH: 480, altH: 580, title: 'Road Closure Notice', titleSize: 26, bodySize: 13 };
  const cfg = {
    ...cfgBase,
    title: applyTitleTone(cfgBase.title, tone),
    titleSize: cfgBase.titleSize + (readable ? 1 : 0),
    bodySize: cfgBase.bodySize + (readable ? 2 : 0)
  };

  const logoImgs = await loadLogoImages();

  // Canvas dimensions depend on selected template
  const W = cfg.W;
  const HAS_ALT = !!alt;
  const H = HAS_ALT ? cfg.altH : cfg.baseH;
  const SPLIT = Math.round(W * (cfg.splitRatio || 0.63)); // left column width
  const HDR_H = 76;  // header row height
  const FTR_H = 32;  // footer bar height

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── Background
  ctx.fillStyle = cfg.baseBg || '#f0eeea';
  ctx.fillRect(0, 0, W, H);

  // ── Top accent bar
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, W, 6);

  // ── Header row (white)
  ctx.fillStyle = cfg.headerBg || '#ffffff';
  ctx.fillRect(0, 6, W, HDR_H);
  ctx.strokeStyle = '#d0ccc4';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 6 + HDR_H); ctx.lineTo(W, 6 + HDR_H); ctx.stroke();

  // Logos in header
  let logoX = 16;
  for (const img of logoImgs) {
    if (!img) continue;
    const aspect = img.naturalWidth / img.naturalHeight;
    const drawH  = 48;
    const drawW  = Math.min(drawH * aspect, 90);
    ctx.drawImage(img, logoX, 6 + (HDR_H - drawH) / 2, drawW, drawH);
    logoX += drawW + 10;
  }

  // Municipality name + subtitle in header
  const hTextX = logoX + 6;
  ctx.fillStyle = '#333333';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText(muniName, hTextX, 6 + 28);
  ctx.fillStyle = '#888888';
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText('Disaster Management Centre', hTextX, 6 + 46);

  // Issue date top-right
  ctx.fillStyle = '#aaaaaa';
  ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Issued: ' + date, W - 16, 6 + 26);
  ctx.fillText('FOR OFFICIAL USE', W - 16, 6 + 42);
  ctx.textAlign = 'left';

  const bodyTop = 6 + HDR_H;
  const bodyH   = H - bodyTop - FTR_H;

  // ── Left column background
  ctx.fillStyle = cfg.leftBg || '#fafaf8';
  ctx.fillRect(0, bodyTop, SPLIT, bodyH);

  // ── Right column background (already #f0eeea from base)

  // ── Divider between columns
  ctx.strokeStyle = '#d0ccc4';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(SPLIT, bodyTop); ctx.lineTo(SPLIT, H - FTR_H); ctx.stroke();
  applyRouteTemplateDecor(ctx, template, SPLIT, bodyTop, H, FTR_H);

  // ── LEFT: Title
  const titleY = bodyTop + (template === 'social' ? 56 : template === 'alert-card' ? 50 : 40);
  ctx.fillStyle = accentColor;
  ctx.font = `bold ${cfg.titleSize}px Arial, sans-serif`;
  ctx.fillText(cfg.title, 20, titleY);

  // ── LEFT: Body paragraph
  const bodyLines = wrapRichText(ctx, [
    { text: c.road_name, bold: true },
    { text: ' is closed to all traffic.', bold: false }
  ], SPLIT - 40, cfg.bodySize);

  const para2 = [
    { text: 'The ', bold: false },
    { text: muniName + ' Disaster Management Centre', bold: true },
    { text: ' notifies road users of the closure of ', bold: false },
    { text: c.road_name, bold: true },
    { text: c.reason ? ' due to ' : '.', bold: false },
    ...(c.reason ? [{ text: c.reason, bold: true }, { text: '.', bold: false }] : [])
  ];

  let ty = titleY + Math.max(26, cfg.bodySize + 10);
  bodyLines.forEach(line => { drawRichLine(ctx, line, 20, ty, cfg.bodySize, '#1a1a1a'); ty += (cfg.bodySize + 7); });
  ty += 4;
  const para2Lines = wrapRichText(ctx, para2, SPLIT - 40, cfg.bodySize);
  para2Lines.forEach(line => { drawRichLine(ctx, line, 20, ty, cfg.bodySize, '#1a1a1a'); ty += (cfg.bodySize + 7); });

  // ── LEFT: Alternative route box
  if (alt && sections.alt_route) {
    const altY = ty + 14;
    const altH = 72 + (alt.extra_distance ? 20 : 0);
    ctx.fillStyle = '#e8f0e4';
    ctx.fillRect(20, altY, SPLIT - 40, altH);
    ctx.fillStyle = '#3a7d44';
    ctx.fillRect(20, altY, 4, altH);
    ctx.strokeStyle = '#b8d4b8';
    ctx.lineWidth = 1;
    ctx.strokeRect(20, altY, SPLIT - 40, altH);

    ctx.fillStyle = '#3a7d44';
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.fillText('ALTERNATIVE ROUTE', 32, altY + 18);

    ctx.fillStyle = '#1a1a1a';
    ctx.font = '12px Arial, sans-serif';
    const altLines = wrapText(ctx, alt.description, SPLIT - 80);
    altLines.slice(0, 2).forEach((line, i) => ctx.fillText(line, 32, altY + 36 + i * 18));

    if (alt.extra_distance) {
      ctx.fillStyle = '#555555';
      ctx.font = '11px Arial, sans-serif';
      ctx.fillText(`+${alt.extra_distance} km · ${alt.vehicle_suitability || 'All vehicles'}`, 32, altY + altH - 10);
    }
  }

  // ── RIGHT: Detail fields
  const RX = SPLIT + 16;
  const fieldDefs = [{ label: 'Status', value: null, badge: true, badgeText: statusLabel, badgeBg: statusBg }];
  if (sections.authority) fieldDefs.push({ label: 'Authority', value: c.authority || '—' });
  if (sections.closed_since) fieldDefs.push({ label: 'Closed since', value: c.closed_since ? new Date(c.closed_since).toLocaleString('en-ZA') : '—' });
  if (sections.reopen) fieldDefs.push({ label: 'Expected reopening', value: c.expected_reopen || 'Unknown' });
  const routeFields = template === 'compact' ? fieldDefs.slice(0, 3) : fieldDefs;

  let ry = bodyTop + 18;
  routeFields.forEach(f => {
    ctx.fillStyle = template === 'alert-card' ? '#7f1d1d' : '#888888';
    ctx.font = template === 'clean-light' ? 'bold 10px Arial, sans-serif' : 'bold 9px Arial, sans-serif';
    ctx.fillText(f.label.toUpperCase(), RX, ry);
    ry += 14;
    if (f.badge) {
      ctx.fillStyle = f.badgeBg;
      const bw = ctx.measureText(f.badgeText).width + 16;
      roundRect(ctx, RX, ry - 11, bw, 18, template === 'clean-light' ? 8 : 3);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Arial, sans-serif';
      ctx.fillText(f.badgeText, RX + 8, ry + 3);
      ry += 22;
    } else {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = template === 'clean-light' ? '13px Arial, sans-serif' : '12px Arial, sans-serif';
      const valLines = wrapText(ctx, String(f.value), W - SPLIT - 32);
      valLines.slice(0, 2).forEach(line => { ctx.fillText(line, RX, ry); ry += 16; });
      ry += 4;
    }
    ry += 8;
  });

  // Issued by (bottom of right col)
  const issuedY = H - FTR_H - 52;
  ctx.strokeStyle = '#c8c4bc';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(RX, issuedY); ctx.lineTo(W - 16, issuedY); ctx.stroke();
  ctx.fillStyle = '#888888';
  ctx.font = 'bold 9px Arial, sans-serif';
  ctx.fillText('ISSUED BY', RX, issuedY + 14);
  ctx.fillStyle = '#333333';
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText(muniName, RX, issuedY + 28);
  ctx.fillStyle = '#666666';
  ctx.font = '10px Arial, sans-serif';
  ctx.fillText('Disaster Management', RX, issuedY + 42);

  // ── Footer bar
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, H - FTR_H, W, FTR_H);
  ctx.fillStyle = '#aac4f0';
  ctx.font = '10px Arial, sans-serif';
  ctx.fillText(muniName + ' Disaster Management Centre', 16, H - FTR_H + 20);
  ctx.textAlign = 'right';
  ctx.fillText('Generated: ' + date, W - 16, H - FTR_H + 20);
  ctx.textAlign = 'left';

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), {
      href: url,
      download: `road-closure-notice-${template}-${(c.road_name||'route').replace(/\s+/g,'-')}.png`
    });
    a.click(); URL.revokeObjectURL(url);
  }, 'image/png');
}

// ── CANVAS HELPERS ────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = (text || '').split(' ');
  const lines = []; let current = '';
  words.forEach(word => {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current); current = word;
    } else current = test;
  });
  if (current) lines.push(current);
  return lines;
}

function wrapRichText(ctx, segments, maxWidth, fontSize) {
  const words = [];
  segments.forEach(seg => {
    seg.text.split(' ').forEach(w => { if (w) words.push({ text: w, bold: seg.bold }); });
  });
  const lines = []; let current = [];
  const lineW = segs => {
    let w = 0, first = true;
    segs.forEach(seg => {
      ctx.font = (seg.bold ? 'bold ' : '') + fontSize + 'px Arial, sans-serif';
      w += ctx.measureText((first ? '' : ' ') + seg.text).width;
      first = false;
    });
    return w;
  };
  words.forEach(word => {
    const test = [...current, word];
    if (lineW(test) > maxWidth && current.length) { lines.push(current); current = [word]; }
    else current = test;
  });
  if (current.length) lines.push(current);
  return lines;
}

function drawRichLine(ctx, segments, x, y, fontSize, color) {
  let cx = x; let first = true;
  segments.forEach(seg => {
    ctx.font = (seg.bold ? 'bold ' : '') + fontSize + 'px Arial, sans-serif';
    ctx.fillStyle = color;
    const txt = (first ? '' : ' ') + seg.text;
    ctx.fillText(txt, cx, y);
    cx += ctx.measureText(txt).width;
    first = false;
  });
}

async function loadLogoImages() {
  const { main, dm, mode } = _muniLogos;
  const srcs = [];
  if (mode === 'both') { if (main) srcs.push(main); if (dm) srcs.push(dm); }
  else if (mode === 'dm') { if (dm) srcs.push(dm); }
  else { if (main) srcs.push(main); }
  return Promise.all(srcs.map(src => new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => res(img); img.onerror = () => res(null); img.src = src;
  })));
}

// ── BIND EVENTS ───────────────────────────────────────────
function bindClosureEvents() {
  document.querySelectorAll('.add-alt-btn').forEach(btn => {
    btn.addEventListener('click', () => showAddAltRouteForm(btn.dataset.closure));
  });

  document.querySelectorAll('.closure-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const { error } = await supabase.from('road_closures').update({
        status:          document.getElementById(`cstatus-${id}`)?.value,
        expected_reopen: document.getElementById(`reopen-${id}`)?.value,
        updated_at:      new Date().toISOString()
      }).eq('id', id);
      if (!error) showToast('✓ Closure updated successfully!');
      else showToast('Error: ' + error.message, true);
    });
  });

  document.querySelectorAll('.closure-email').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = _closures.find(x => x.id === btn.dataset.id);
      if (!c) return;
      const alt     = c.alternative_routes?.[0];
      const subject = encodeURIComponent(`ROAD CLOSED — ${c.road_name}`);
      const body    = encodeURIComponent(
        `ROAD CLOSED — ${c.road_name}\n` +
        `Reason: ${c.reason||'N/A'}\nStatus: ${(c.status||'').toUpperCase()}\n` +
        `Closed since: ${c.closed_since ? new Date(c.closed_since).toLocaleString('en-ZA') : 'N/A'}\n` +
        `Expected reopening: ${c.expected_reopen||'Unknown'}\nAuthority: ${c.authority||'N/A'}\n` +
        `Wards affected: ${Array.isArray(c.affected_wards) ? c.affected_wards.join(', ') : c.affected_wards||'N/A'}` +
        (alt ? `\n\nALTERNATIVE ROUTE:\n${alt.description}\nExtra distance: ${alt.extra_distance||'?'} km · ${alt.vehicle_suitability||'All vehicles'}` : '')
      );
      window.open(`mailto:?subject=${subject}&body=${body}`);
    });
  });

  // Download dropdown toggle — fixed-position so it escapes card overflow
  document.querySelectorAll('.closure-dl-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id   = btn.dataset.id;
      const existing = document.getElementById('shared-dl-drop');
      if (existing && existing.dataset.forId === id) {
        existing.remove(); return;
      }
      if (existing) existing.remove();

      const rect = btn.getBoundingClientRect();
      const drop = document.createElement('div');
      drop.id = 'shared-dl-drop';
      drop.dataset.forId = id;
      drop.style.cssText = `position:fixed;left:${rect.left}px;z-index:9999;background:var(--bg2);border:1px solid var(--border);border-radius:6px;min-width:170px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.35);visibility:hidden`;
      drop.addEventListener('click', e => e.stopPropagation());
      drop.innerHTML = `
        <button data-dl-text="${id}" style="display:block;width:100%;text-align:left;background:transparent;border:none;border-bottom:1px solid var(--border);padding:9px 14px;font-size:12px;color:var(--text);cursor:pointer;font-family:monospace">📄 Text file (.txt)</button>
        <button data-dl-png="${id}" style="display:block;width:100%;text-align:left;background:transparent;border:none;padding:9px 14px;font-size:12px;color:var(--text);cursor:pointer;font-family:monospace">🖼 Image (.png) · Choose template…</button>`;

      drop.querySelector('[data-dl-text]').addEventListener('click', () => {
        const c = _closures.find(x => x.id === id); drop.remove(); if (!c) return;
        const alt  = c.alternative_routes?.[0];
        const text = `ROUTE CLOSURE NOTIFICATION\n${'='.repeat(40)}\n` +
          `Road: ${c.road_name}\nStatus: ${(c.status||'').toUpperCase()}\n` +
          `Reason: ${c.reason||'N/A'}\nAuthority: ${c.authority||'N/A'}\n` +
          `Closed since: ${c.closed_since ? new Date(c.closed_since).toLocaleString('en-ZA') : 'N/A'}\n` +
          `Expected reopening: ${c.expected_reopen||'Unknown'}\n` +
          `Wards affected: ${Array.isArray(c.affected_wards) ? c.affected_wards.join(', ') : c.affected_wards||'N/A'}` +
          (alt ? `\n\nALTERNATIVE ROUTE:\n${alt.description}\nExtra distance: ${alt.extra_distance||'?'} km · ${alt.vehicle_suitability||'All vehicles'}` : '');
        const blob = new Blob([text], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: `route-closure-${(c.road_name||'route').replace(/\s+/g,'-')}.txt` });
        a.click(); URL.revokeObjectURL(url);
      });

      drop.querySelector('[data-dl-png]')?.addEventListener('click', () => {
        const c = _closures.find(x => x.id === id); drop.remove(); if (!c) return;
        openRouteTemplatePicker({
          templates: ROUTE_PNG_TEMPLATES,
          onDownload: ({ template, tone, readable, sections }) => downloadClosurePNG(c, template, { tone, readable, sections })
        });
      });

      document.body.appendChild(drop);

      // Route downloads should open upward by default.
      const menuTop = rect.top - drop.offsetHeight - 4;
      drop.style.top = `${Math.max(8, menuTop)}px`;
      drop.style.visibility = 'visible';
    });
  });

  // Close shared dropdown on outside click
  document.addEventListener('click', () => {
    document.getElementById('shared-dl-drop')?.remove();
  });

  document.querySelectorAll('.closure-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const closure = _closures.find(x => x.id === btn.dataset.id);
      if (closure) showEditClosureForm(closure);
    });
  });

  document.querySelectorAll('.closure-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Delete road closure?',
        message: 'This will delete the road closure and all linked alternative routes.\n\nThis action cannot be undone.',
        confirmText: 'Delete closure'
      });
      if (!ok) return;
      await supabase.from('alternative_routes').delete().eq('closure_id', btn.dataset.id);
      await supabase.from('road_closures').delete().eq('id', btn.dataset.id);
      showToast('✓ Closure deleted');
      await renderRoutes();
    });
  });

  document.querySelectorAll('.pub-tog').forEach(tog => {
    tog.addEventListener('click', async () => {
      const track = tog.querySelector('.tog-track');
      const lbl   = tog.querySelector('span');
      track?.classList.toggle('on');
      const isOn = track?.classList.contains('on');
      if (lbl) { lbl.textContent = isOn?'LIVE':'DRAFT'; lbl.style.color = isOn?'var(--green)':'var(--text3)'; }
      await supabase.from(tog.dataset.table||'road_closures').update({ is_published: isOn }).eq('id', tog.dataset.id);
    });
  });
}

function emptyState(msg) {
  return `<div style="text-align:center;padding:48px 20px;color:var(--text3);font-size:12px;font-family:monospace">${msg}</div>`;
}

function showToast(msg, isError=false) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:${isError?'var(--red-dim)':'var(--green-dim)'};border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:10px 16px;border-radius:6px;font-size:12px;font-family:monospace;font-weight:700;z-index:500`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},2500);
}
