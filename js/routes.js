// js/routes.js
import { supabase } from './supabase.js';

let _muniId   = null;
let _closures = [];
let _muniLogos = { main: null, dm: null, mode: 'main' };

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
        <div style="position:relative;display:inline-block">
          <button class="btn btn-sm closure-dl-toggle" data-id="${c.id}" data-name="${c.road_name}">↓ Save ▾</button>
          <div class="dl-dropdown" id="dl-drop-${c.id}" style="display:none;position:absolute;top:100%;left:0;z-index:200;background:var(--bg2);border:1px solid var(--border);border-radius:6px;min-width:160px;box-shadow:0 4px 16px rgba(0,0,0,.3);margin-top:4px">
            <button class="btn btn-sm" style="width:100%;text-align:left;border-radius:4px 4px 0 0;border:none;background:transparent;padding:8px 12px;font-size:12px;color:var(--text)" data-dl-text="${c.id}">📄 Text file (.txt)</button>
            <button class="btn btn-sm" style="width:100%;text-align:left;border-radius:0 0 4px 4px;border:none;background:transparent;padding:8px 12px;font-size:12px;color:var(--text)" data-dl-png="${c.id}">🖼 Image (.png)</button>
          </div>
        </div>
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
async function downloadClosurePNG(c) {
  const alt       = c.alternative_routes?.[0];
  const muniName  = window._drmsaUser?.municipalities?.name || 'Municipality';
  const date      = new Date().toLocaleString('en-ZA');
  const statusLabel = { closed:'FULLY CLOSED', partial:'PARTIAL CLOSURE', open:'REOPENED' }[c.status] || c.status?.toUpperCase();
  const statusColor = { closed:'#f85149', partial:'#d29922', open:'#3fb950' }[c.status] || '#888';

  // Resolve logo data URLs for canvas embedding (handles CORS by drawing via Image)
  const { main, dm, mode } = _muniLogos;
  const logosToShow = [];
  if (mode === 'both')        { if (main) logosToShow.push(main); if (dm) logosToShow.push(dm); }
  else if (mode === 'dm')     { if (dm) logosToShow.push(dm); }
  else                        { if (main) logosToShow.push(main); }

  const loadImg = src => new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => res(img); img.onerror = () => res(null);
    img.src = src;
  });
  const logoImgs = await Promise.all(logosToShow.map(loadImg));

  const W = 900, H = 520;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);

  // Header band
  ctx.fillStyle = '#161b22';
  ctx.fillRect(0, 0, W, 90);

  // Left accent bar
  ctx.fillStyle = statusColor;
  ctx.fillRect(0, 0, 5, H);

  // Draw logos top-left
  let logoX = 20;
  const logoH = 56, logoY = 17;
  for (const img of logoImgs) {
    if (!img) continue;
    const aspect = img.naturalWidth / img.naturalHeight;
    const drawW  = Math.min(logoH * aspect, 100);
    ctx.drawImage(img, logoX, logoY, drawW, logoH);
    logoX += drawW + 10;
  }

  // Notification title next to logos
  const titleX = logoX + 6;
  ctx.fillStyle = '#e6edf3';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText('ROUTE CLOSURE NOTIFICATION', titleX, 38);
  ctx.fillStyle = '#8b949e';
  ctx.font = '11px Arial, sans-serif';
  ctx.fillText(muniName + ' Disaster Management', titleX, 56);
  ctx.fillText('Generated: ' + date, titleX, 72);

  // Status badge
  const badgeW = 220, badgeH = 36, badgeX = W - badgeW - 20, badgeY = 27;
  ctx.fillStyle = statusColor + '33';
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
  ctx.fill();
  ctx.strokeStyle = statusColor;
  ctx.lineWidth = 1.5;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
  ctx.stroke();
  ctx.fillStyle = statusColor;
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(statusLabel, badgeX + badgeW / 2, badgeY + 23);
  ctx.textAlign = 'left';

  // Divider
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, 98); ctx.lineTo(W - 20, 98); ctx.stroke();

  // Road name
  ctx.fillStyle = '#e6edf3';
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.fillText(c.road_name, 24, 138);

  // Fields
  const fields = [
    ['Reason',            c.reason || 'N/A'],
    ['Authority',         c.authority || 'N/A'],
    ['Closed since',      c.closed_since ? new Date(c.closed_since).toLocaleString('en-ZA') : 'N/A'],
    ['Expected reopening',c.expected_reopen || 'Unknown'],
    ['Wards affected',    Array.isArray(c.affected_wards) ? c.affected_wards.join(', ') : c.affected_wards || 'N/A']
  ];

  let fy = 170;
  fields.forEach(([key, val]) => {
    ctx.fillStyle = '#8b949e';
    ctx.font = '11px Arial, sans-serif';
    ctx.fillText(key.toUpperCase(), 24, fy);
    ctx.fillStyle = '#c9d1d9';
    ctx.font = '13px Arial, sans-serif';
    ctx.fillText(String(val).slice(0, 90), 24, fy + 16);
    fy += 44;
  });

  // Alternative route box
  if (alt) {
    const boxY = H - 130;
    ctx.fillStyle = '#1f2937';
    roundRect(ctx, 20, boxY, W - 40, 100, 8);
    ctx.fill();
    ctx.strokeStyle = '#3fb95066';
    ctx.lineWidth = 1;
    roundRect(ctx, 20, boxY, W - 40, 100, 8);
    ctx.stroke();

    ctx.fillStyle = '#3fb950';
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.fillText('ALTERNATIVE ROUTE', 34, boxY + 22);

    ctx.fillStyle = '#c9d1d9';
    ctx.font = '12px Arial, sans-serif';
    const descLines = wrapText(ctx, alt.description, W - 80, 12);
    descLines.slice(0, 3).forEach((line, i) => ctx.fillText(line, 34, boxY + 42 + i * 18));

    if (alt.extra_distance) {
      ctx.fillStyle = '#8b949e';
      ctx.font = '11px Arial, sans-serif';
      ctx.fillText(`+${alt.extra_distance} km · ${alt.vehicle_suitability || 'All vehicles'}`, 34, boxY + 86);
    }
  }

  // Footer line
  ctx.strokeStyle = '#21262d';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, H - 28); ctx.lineTo(W - 20, H - 28); ctx.stroke();
  ctx.fillStyle = '#484f58';
  ctx.font = '10px Arial, sans-serif';
  ctx.fillText('FOR OFFICIAL DISTRIBUTION — ' + muniName, 24, H - 12);

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), {
      href: url,
      download: `route-closure-${(c.road_name||'route').replace(/\s+/g,'-')}.png`
    });
    a.click(); URL.revokeObjectURL(url);
  }, 'image/png');
}

// Helpers
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth, fontSize) {
  const words = (text || '').split(' ');
  const lines = [];
  let current = '';
  words.forEach(word => {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current); current = word;
    } else { current = test; }
  });
  if (current) lines.push(current);
  return lines;
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

  // Download dropdown toggle
  document.querySelectorAll('.closure-dl-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id  = btn.dataset.id;
      const drop = document.getElementById(`dl-drop-${id}`);
      if (!drop) return;
      // Close all others
      document.querySelectorAll('.dl-dropdown').forEach(d => { if (d.id !== `dl-drop-${id}`) d.style.display = 'none'; });
      drop.style.display = drop.style.display === 'none' ? 'block' : 'none';
    });
  });

  // Close dropdowns on outside click
  document.addEventListener('click', () => {
    document.querySelectorAll('.dl-dropdown').forEach(d => d.style.display = 'none');
  });

  // Text download
  document.querySelectorAll('[data-dl-text]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = _closures.find(x => x.id === btn.dataset.dlText);
      if (!c) return;
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
      const a    = Object.assign(document.createElement('a'), {
        href: url,
        download: `route-closure-${(c.road_name||'route').replace(/\s+/g,'-')}.txt`
      });
      a.click(); URL.revokeObjectURL(url);
      document.getElementById(`dl-drop-${c.id}`).style.display = 'none';
    });
  });

  // PNG download
  document.querySelectorAll('[data-dl-png]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = _closures.find(x => x.id === btn.dataset.dlPng);
      if (!c) return;
      document.getElementById(`dl-drop-${c.id}`).style.display = 'none';
      downloadClosurePNG(c);
    });
  });

  document.querySelectorAll('.closure-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const closure = _closures.find(x => x.id === btn.dataset.id);
      if (closure) showEditClosureForm(closure);
    });
  });

  document.querySelectorAll('.closure-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this road closure and all its alternative routes?')) return;
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
