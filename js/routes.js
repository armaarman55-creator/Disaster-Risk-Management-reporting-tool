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
async function downloadClosurePNG(c) {
  const alt         = c.alternative_routes?.[0];
  const muniName    = window._drmsaUser?.municipalities?.name || 'Municipality';
  const date        = new Date().toLocaleString('en-ZA');
  const statusLabel = { closed:'FULLY CLOSED', partial:'PARTIAL CLOSURE', open:'REOPENED' }[c.status] || (c.status||'').toUpperCase();
  const accentColor = { closed:'#1a3a6b', partial:'#7a5200', open:'#1a6b3a' }[c.status] || '#1a3a6b';
  const statusBg    = { closed:'#c0392b', partial:'#d4860a', open:'#1a6b3a' }[c.status] || '#555';

  const logoImgs = await loadLogoImages();

  // Canvas dimensions: 900 wide, height depends on alt route
  const W = 900;
  const HAS_ALT = !!alt;
  const H = HAS_ALT ? 580 : 480;
  const SPLIT = Math.round(W * 0.63); // left column width
  const HDR_H = 76;  // header row height
  const FTR_H = 32;  // footer bar height

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ── Background
  ctx.fillStyle = '#f0eeea';
  ctx.fillRect(0, 0, W, H);

  // ── Top accent bar
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, W, 6);

  // ── Header row (white)
  ctx.fillStyle = '#ffffff';
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
  ctx.fillStyle = '#fafaf8';
  ctx.fillRect(0, bodyTop, SPLIT, bodyH);

  // ── Right column background (already #f0eeea from base)

  // ── Divider between columns
  ctx.strokeStyle = '#d0ccc4';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(SPLIT, bodyTop); ctx.lineTo(SPLIT, H - FTR_H); ctx.stroke();

  // ── LEFT: Title
  ctx.fillStyle = accentColor;
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillText('Road Closure Notice', 20, bodyTop + 38);

  // ── LEFT: Body paragraph
  const bodyLines = wrapRichText(ctx, [
    { text: c.road_name, bold: true },
    { text: ' is closed to all traffic.', bold: false }
  ], SPLIT - 40, 13);

  const para2 = [
    { text: 'The ', bold: false },
    { text: muniName + ' Disaster Management Centre', bold: true },
    { text: ' notifies road users of the closure of ', bold: false },
    { text: c.road_name, bold: true },
    { text: c.reason ? ' due to ' : '.', bold: false },
    ...(c.reason ? [{ text: c.reason, bold: true }, { text: '.', bold: false }] : [])
  ];

  let ty = bodyTop + 62;
  bodyLines.forEach(line => { drawRichLine(ctx, line, 20, ty, 13, '#1a1a1a'); ty += 20; });
  ty += 4;
  const para2Lines = wrapRichText(ctx, para2, SPLIT - 40, 13);
  para2Lines.forEach(line => { drawRichLine(ctx, line, 20, ty, 13, '#1a1a1a'); ty += 20; });

  // ── LEFT: Alternative route box
  if (alt) {
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
  const fieldDefs = [
    { label: 'Status',            value: null, badge: true, badgeText: statusLabel, badgeBg: statusBg },
    { label: 'Authority',         value: c.authority || '—' },
    { label: 'Closed since',      value: c.closed_since ? new Date(c.closed_since).toLocaleString('en-ZA') : '—' },
    { label: 'Expected reopening',value: c.expected_reopen || 'Unknown' }
  ];

  let ry = bodyTop + 18;
  fieldDefs.forEach(f => {
    ctx.fillStyle = '#888888';
    ctx.font = 'bold 9px Arial, sans-serif';
    ctx.fillText(f.label.toUpperCase(), RX, ry);
    ry += 14;
    if (f.badge) {
      ctx.fillStyle = f.badgeBg;
      const bw = ctx.measureText(f.badgeText).width + 16;
      roundRect(ctx, RX, ry - 11, bw, 18, 3);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Arial, sans-serif';
      ctx.fillText(f.badgeText, RX + 8, ry + 3);
      ry += 22;
    } else {
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '12px Arial, sans-serif';
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
      download: `road-closure-notice-${(c.road_name||'route').replace(/\s+/g,'-')}.png`
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
      drop.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;z-index:9999;background:var(--bg2);border:1px solid var(--border);border-radius:6px;min-width:170px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.35)`;
      drop.addEventListener('click', e => e.stopPropagation());
      drop.innerHTML = `
        <button data-dl-text="${id}" style="display:block;width:100%;text-align:left;background:transparent;border:none;border-bottom:1px solid var(--border);padding:9px 14px;font-size:12px;color:var(--text);cursor:pointer;font-family:monospace">📄 Text file (.txt)</button>
        <button data-dl-png="${id}"  style="display:block;width:100%;text-align:left;background:transparent;border:none;padding:9px 14px;font-size:12px;color:var(--text);cursor:pointer;font-family:monospace">🖼 Image (.png)</button>`;

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

      drop.querySelector('[data-dl-png]').addEventListener('click', () => {
        const c = _closures.find(x => x.id === id); drop.remove(); if (!c) return;
        downloadClosurePNG(c);
      });

      document.body.appendChild(drop);
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
