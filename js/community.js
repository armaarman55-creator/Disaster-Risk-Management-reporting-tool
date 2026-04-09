// js/community.js
import { supabase } from './supabase.js';

let _muniId    = null;
let _activeTab = 'shelters';
let _muniLogos = { main: null, dm: null, mode: 'main' };
const PNG_TEMPLATES = [
  { key: 'official', label: 'Official notice', desc: 'Formal municipal document', preview: 'linear-gradient(135deg,#f8fafc,#e2e8f0)' },
  { key: 'compact', label: 'Compact bulletin', desc: 'Dense bulletin style', preview: 'linear-gradient(135deg,#f5f3ff,#ddd6fe)' },
  { key: 'social', label: 'Social square', desc: 'Social media poster', preview: 'linear-gradient(135deg,#0f172a,#1d4ed8)' },
  { key: 'alert-card', label: 'Alert card', desc: 'High-contrast emergency card', preview: 'linear-gradient(135deg,#7f1d1d,#dc2626)' },
  { key: 'clean-light', label: 'Clean light', desc: 'Minimal clean handout', preview: 'linear-gradient(135deg,#ffffff,#d1fae5)' }
];

export async function initCommunity(user) {
  _muniId = user?.municipality_id;
  await fetchMuniLogos();
  bindCommunityTabs();
  await loadTab('shelters');
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
  }
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

// Shared document-style canvas layout
// Returns { ctx, W, H, SPLIT, bodyTop, bodyH, FTR_H, RX, accentColor }
function buildNoticeCanvas(logoImgs, accentColor, muniName, date, W, H, layout = {}) {
  const SPLIT  = Math.round(W * (layout.splitRatio || 0.63));
  const HDR_H  = 76;
  const FTR_H  = 32;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background (light grey)
  ctx.fillStyle = layout.baseBg || '#f0eeea'; ctx.fillRect(0, 0, W, H);

  // Top accent bar
  ctx.fillStyle = accentColor; ctx.fillRect(0, 0, W, 6);

  // Header row (white)
  ctx.fillStyle = layout.headerBg || '#ffffff'; ctx.fillRect(0, 6, W, HDR_H);
  ctx.strokeStyle = '#d0ccc4'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 6 + HDR_H); ctx.lineTo(W, 6 + HDR_H); ctx.stroke();

  // Logos in header
  let logoX = 16;
  for (const img of logoImgs) {
    if (!img) continue;
    const drawH = 48;
    const drawW = Math.min(drawH * (img.naturalWidth / img.naturalHeight), 90);
    ctx.drawImage(img, logoX, 6 + (HDR_H - drawH) / 2, drawW, drawH);
    logoX += drawW + 10;
  }

  // Municipality name + subtitle
  const hTextX = logoX + 6;
  ctx.fillStyle = '#333333'; ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText(muniName, hTextX, 6 + 28);
  ctx.fillStyle = '#888888'; ctx.font = '11px Arial, sans-serif';
  ctx.fillText('Disaster Management Centre', hTextX, 6 + 46);

  // Date top-right
  ctx.fillStyle = '#aaaaaa'; ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Issued: ' + date, W - 16, 6 + 26);
  ctx.fillText('FOR OFFICIAL USE', W - 16, 6 + 42);
  ctx.textAlign = 'left';

  const bodyTop = 6 + HDR_H;
  const bodyH   = H - bodyTop - FTR_H;
  const RX      = SPLIT + 16;

  // Left column background
  ctx.fillStyle = layout.leftBg || '#fafaf8'; ctx.fillRect(0, bodyTop, SPLIT, bodyH);

  // Column divider
  ctx.strokeStyle = '#d0ccc4'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(SPLIT, bodyTop); ctx.lineTo(SPLIT, H - FTR_H); ctx.stroke();

  // Footer bar
  ctx.fillStyle = accentColor; ctx.fillRect(0, H - FTR_H, W, FTR_H);
  ctx.fillStyle = layout.footerText || '#ddeeff'; ctx.font = '10px Arial, sans-serif';
  ctx.fillText(muniName + ' Disaster Management Centre', 16, H - FTR_H + 20);
  ctx.textAlign = 'right';
  ctx.fillText('Generated: ' + date, W - 16, H - FTR_H + 20);
  ctx.textAlign = 'left';

  return { ctx, canvas, W, H, SPLIT, bodyTop, bodyH, FTR_H, RX, accentColor };
}

// Draw right-column detail fields
function drawRightFields(ctx, RX, startY, W, fieldDefs) {
  let ry = startY;
  fieldDefs.forEach(f => {
    ctx.fillStyle = '#888888'; ctx.font = 'bold 9px Arial, sans-serif';
    ctx.fillText(f.label.toUpperCase(), RX, ry); ry += 14;
    if (f.badge) {
      ctx.fillStyle = f.badgeBg;
      const bw = ctx.measureText(f.badgeText).width + 16;
      roundRect(ctx, RX, ry - 11, bw, 18, 3); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 10px Arial, sans-serif';
      ctx.fillText(f.badgeText, RX + 8, ry + 3); ry += 22;
    } else {
      ctx.fillStyle = '#1a1a1a'; ctx.font = '12px Arial, sans-serif';
      const lines = wrapText(ctx, String(f.value), W - RX - 16);
      lines.slice(0, 2).forEach(line => { ctx.fillText(line, RX, ry); ry += 16; });
      ry += 4;
    }
    ry += 8;
  });
  return ry;
}

// Draw "Issued by" block at bottom of right column
function drawIssuedBy(ctx, RX, W, H, FTR_H, muniName) {
  const issuedY = H - FTR_H - 54;
  ctx.strokeStyle = '#c8c4bc'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(RX, issuedY); ctx.lineTo(W - 16, issuedY); ctx.stroke();
  ctx.fillStyle = '#888888'; ctx.font = 'bold 9px Arial, sans-serif';
  ctx.fillText('ISSUED BY', RX, issuedY + 14);
  ctx.fillStyle = '#333333'; ctx.font = '11px Arial, sans-serif';
  ctx.fillText(muniName, RX, issuedY + 28);
  ctx.fillStyle = '#666666'; ctx.font = '10px Arial, sans-serif';
  ctx.fillText('Disaster Management', RX, issuedY + 42);
}

function titleToneWord(tone) {
  return tone === 'advisory' ? 'Advisory' : tone === 'update' ? 'Update' : 'Notification';
}

function applyTitleTone(title, tone) {
  return String(title || '').replace(/\b(Notification|Notice|Bulletin|Update)\b/i, titleToneWord(tone));
}

function openPngTemplatePicker({ heading, templates, sectionDefs = [], onDownload }) {
  document.getElementById('png-template-picker')?.remove();
  const modal = document.createElement('div');
  modal.id = 'png-template-picker';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div style="width:min(760px,96vw);max-height:88vh;overflow:auto;background:var(--bg2);border:1px solid var(--border2);border-radius:12px;box-shadow:0 10px 36px rgba(0,0,0,.45);padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0;font-size:16px">${heading}</h3>
        <button type="button" data-close style="border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:6px;padding:4px 8px;cursor:pointer">✕</button>
      </div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:10px">Select template and content before downloading.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-bottom:12px">
        ${templates.map((tpl, idx) => `
          <label style="display:block;border:1px solid var(--border);border-radius:8px;padding:9px;background:var(--bg3);cursor:pointer">
            <input type="radio" name="tpl" value="${tpl.key}" ${idx === 0 ? 'checked' : ''} />
            <div style="height:64px;border-radius:6px;margin:6px 0;background:${tpl.preview || 'linear-gradient(135deg,#1e293b,#64748b)'};position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.22)">
              <div style="position:absolute;left:8px;top:8px;right:8px;height:8px;border-radius:4px;background:rgba(255,255,255,.6)"></div>
              <div style="position:absolute;left:8px;top:24px;width:56%;height:28px;border-radius:5px;background:rgba(255,255,255,.25)"></div>
              <div style="position:absolute;right:8px;top:24px;width:28%;height:28px;border-radius:5px;background:rgba(255,255,255,.45)"></div>
            </div>
            <div style="font-weight:700;font-size:12px;margin-top:4px">${tpl.label}</div>
            <div style="font-size:11px;color:var(--text3)">${tpl.desc || tpl.key}</div>
          </label>
        `).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="font-size:12px">Notice wording
          <select id="png-tone" style="width:100%;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:7px;color:var(--text)">
            <option value="notification">Notification</option>
            <option value="advisory">Advisory</option>
            <option value="update">Update</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:19px">
          <input id="png-readable" type="checkbox" checked />
          Readable text (recommended)
        </label>
      </div>
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
        <div style="font-size:12px;font-weight:700;margin-bottom:6px">Include sections</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px">
          ${sectionDefs.map(sec => `<label style="font-size:12px;display:flex;align-items:center;gap:6px"><input type="checkbox" data-sec="${sec.key}" ${sec.default ? 'checked' : ''}/> ${sec.label}</label>`).join('')}
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
        <button type="button" data-close style="border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:6px;padding:7px 10px;cursor:pointer">Cancel</button>
        <button type="button" id="png-download-now" style="border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:6px;padding:7px 12px;cursor:pointer">Download PNG</button>
      </div>
    </div>
  `;
  modal.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#png-download-now')?.addEventListener('click', async () => {
    const template = modal.querySelector('input[name="tpl"]:checked')?.value || templates[0]?.key || 'official';
    const tone = modal.querySelector('#png-tone')?.value || 'notification';
    const readable = !!modal.querySelector('#png-readable')?.checked;
    const sections = {};
    sectionDefs.forEach(sec => { sections[sec.key] = !!modal.querySelector(`[data-sec="${sec.key}"]`)?.checked; });
    modal.remove();
    await onDownload({ template, tone, readable, sections });
  });
  document.body.appendChild(modal);
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

  requestAnimationFrame(() => {
    const btn = document.getElementById('add-shelter-btn');
    if (btn) btn.onclick = () => showShelterForm(null);
    bindShelterEvents(shelters || []);
  });
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
        <div class="fl"><span class="fl-label">Capacity</span><input class="fl-input" type="number" id="sh-cap" value="${s.capacity||''}"/></div>
      </div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Contact name</span><input class="fl-input" id="sh-cname" value="${s.contact_name||''}"/></div>
        <div class="fl"><span class="fl-label">Contact number</span><input class="fl-input" id="sh-cnum" value="${s.contact_number||''}"/></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text2);margin:8px 0 12px">
        <input type="checkbox" id="sh-wc" ${s.wheelchair_accessible?'checked':''} style="width:14px;height:14px"/> Wheelchair accessible
      </label>
      <div style="display:flex;gap:8px">
        <button class="btn btn-red btn-sm" id="save-shelter-btn" data-id="${s.id||''}">Save shelter</button>
        <button class="btn btn-sm" onclick="document.getElementById('shelter-form-area').innerHTML=''">Cancel</button>
      </div>
    </div>`;

  document.getElementById('save-shelter-btn')?.addEventListener('click', async () => {
    const id   = document.getElementById('save-shelter-btn').dataset.id;
    const name = document.getElementById('sh-name')?.value.trim();
    if (!name) { alert('Shelter name required.'); return; }
    const payload = {
      municipality_id:      _muniId,
      name,
      facility_type:        document.getElementById('sh-type')?.value,
      address:              document.getElementById('sh-address')?.value,
      ward_number:          parseInt(document.getElementById('sh-ward')?.value)||null,
      capacity:             parseInt(document.getElementById('sh-cap')?.value)||0,
      contact_name:         document.getElementById('sh-cname')?.value,
      contact_number:       document.getElementById('sh-cnum')?.value,
      wheelchair_accessible:document.getElementById('sh-wc')?.checked,
      status:               'open', current_occupancy: 0
    };
    const { error } = id
      ? await supabase.from('shelters').update(payload).eq('id', id)
      : await supabase.from('shelters').insert(payload);
    if (error) { showToast(error.message, true); return; }
    showToast('✓ Shelter saved successfully!');
    document.getElementById('shelter-form-area').innerHTML = '';
    await renderShelters(document.getElementById('community-body'));
  });
}

function renderShelterCard(s) {
  const pct         = s.capacity ? Math.round((s.current_occupancy||0) / s.capacity * 100) : 0;
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
        <button class="btn btn-sm shelter-dl-toggle" data-id="${s.id}">↓ Save ▾</button>
        <button class="btn btn-sm btn-red shelter-delete" data-id="${s.id}" style="margin-left:auto">Delete</button>
      </div>
    </div>`;
}

async function downloadShelterPNG(s, template = 'official', opts = {}) {
  const tone = opts.tone || 'notification';
  const readable = opts.readable !== false;
  const sections = {
    occupancy: true, facility: true, address: true, ward: true, contact: true, accessibility: true,
    ...(opts.sections || {})
  };
  const muniName    = window._drmsaUser?.municipalities?.name || 'Municipality';
  const date        = new Date().toLocaleString('en-ZA');
  const pct         = s.capacity ? Math.round((s.current_occupancy||0) / s.capacity * 100) : 0;
  const accentColor = { open:'#1a6b3a', 'at-capacity':'#8b1a1a', partial:'#7a5200', closed:'#444444' }[s.status] || '#1a3a6b';
  const statusBg    = { open:'#1a6b3a', 'at-capacity':'#c0392b', partial:'#d4860a', closed:'#555555' }[s.status] || '#555';
  const statusLabel = (s.status || 'UNKNOWN').replace(/-/g, ' ').toUpperCase();
  const cfgBase = {
    official: { W: 900, H: 500, title: 'Shelter Notification', titleSize: 26, bodySize: 13, showOccupancy: true, layout: { splitRatio: 0.63, baseBg: '#f0eeea', leftBg: '#fafaf8' } },
    compact: { W: 900, H: 420, title: 'Shelter Update Bulletin', titleSize: 23, bodySize: 12, showOccupancy: false, layout: { splitRatio: 0.58, baseBg: '#f6f5ff', leftBg: '#fbfaff' } },
    social: { W: 1080, H: 1080, title: 'Shelter Status Update', titleSize: 34, bodySize: 15, showOccupancy: true, layout: { splitRatio: 0.56, baseBg: '#e6eefc', leftBg: '#f8fbff' } },
    'alert-card': { W: 1000, H: 560, title: 'Shelter Alert Notice', titleSize: 29, bodySize: 14, showOccupancy: true, layout: { splitRatio: 0.60, baseBg: '#fff1f2', leftBg: '#fff7f7', headerBg: '#fff5f5', footerText: '#fee2e2' } },
    'clean-light': { W: 980, H: 540, title: 'Shelter Advisory', titleSize: 27, bodySize: 14, showOccupancy: true, layout: { splitRatio: 0.65, baseBg: '#ecfdf5', leftBg: '#f7fffb', headerBg: '#ffffff', footerText: '#d1fae5' } }
  }[template] || { W: 900, H: 500, title: 'Shelter Notification', titleSize: 26, bodySize: 13, showOccupancy: true };
  const cfg = {
    ...cfgBase,
    title: applyTitleTone(cfgBase.title, tone),
    titleSize: cfgBase.titleSize + (readable ? 1 : 0),
    bodySize: cfgBase.bodySize + (readable ? 2 : 0)
  };

  const logoImgs = await loadLogoImages();
  const { W, H } = cfg;
  const { ctx, canvas, SPLIT, bodyTop, FTR_H, RX } = buildNoticeCanvas(logoImgs, accentColor, muniName, date, W, H, cfg.layout);

  // ── LEFT: Title
  ctx.fillStyle = accentColor; ctx.font = `bold ${cfg.titleSize}px Arial, sans-serif`;
  ctx.fillText(cfg.title, 20, bodyTop + (template === 'social' ? 48 : 38));

  // ── LEFT: Body paragraph
  const para = [
    { text: s.name, bold: true },
    { text: ' is currently ', bold: false },
    { text: s.status || 'open', bold: true },
    { text: ' and available for displaced residents.', bold: false }
  ];
  const para2 = [
    { text: 'The ', bold: false },
    { text: muniName + ' Disaster Management Centre', bold: true },
    { text: ' confirms that ', bold: false },
    { text: s.name, bold: true },
    { text: ', Ward ' + (s.ward_number || '—') + ', is operational as an emergency shelter.', bold: false },
    { text: ' Capacity: ', bold: false },
    { text: (s.capacity || 0) + ' persons', bold: true },
    { text: '. Current occupancy: ', bold: false },
    { text: `${s.current_occupancy || 0} / ${s.capacity || 0} (${pct}%)`, bold: true },
    { text: '.', bold: false }
  ];

  let ty = bodyTop + 60;
  wrapRichText(ctx, para, SPLIT - 40, cfg.bodySize).forEach(line => { drawRichLine(ctx, line, 20, ty, cfg.bodySize, '#1a1a1a'); ty += (cfg.bodySize + 7); });
  ty += 6;
  wrapRichText(ctx, para2, SPLIT - 40, cfg.bodySize).forEach(line => { drawRichLine(ctx, line, 20, ty, cfg.bodySize, '#1a1a1a'); ty += (cfg.bodySize + 7); });

  // ── LEFT: Occupancy bar
  if (cfg.showOccupancy && sections.occupancy) {
    ty += 14;
    ctx.fillStyle = '#888888'; ctx.font = 'bold 9px Arial, sans-serif';
    ctx.fillText('OCCUPANCY', 20, ty); ty += 12;
    const barW = SPLIT - 40, barH = 10;
    ctx.fillStyle = '#d0ccc4'; roundRect(ctx, 20, ty, barW, barH, 4); ctx.fill();
    const fillW = Math.min(pct / 100 * barW, barW);
    ctx.fillStyle = accentColor; roundRect(ctx, 20, ty, Math.max(fillW, 4), barH, 4); ctx.fill();
    ctx.fillStyle = '#555555'; ctx.font = '11px Arial, sans-serif';
    ctx.fillText(`${s.current_occupancy || 0} / ${s.capacity || 0} persons`, 20, ty + 24);
  }

  // ── RIGHT: Fields
  const shelterFields = [{ label: 'Status', badge: true, badgeText: statusLabel, badgeBg: statusBg }];
  if (sections.facility) shelterFields.push({ label: 'Facility type', value: s.facility_type || '—' });
  if (sections.address) shelterFields.push({ label: 'Address', value: s.address || '—' });
  if (sections.ward) shelterFields.push({ label: 'Ward', value: String(s.ward_number || '—') });
  if (sections.contact) shelterFields.push({ label: 'Contact', value: `${s.contact_name || '—'} · ${s.contact_number || '—'}` });
  if (sections.accessibility) shelterFields.push({ label: 'Wheelchair access', value: s.wheelchair_accessible ? 'Yes' : 'No' });
  drawRightFields(ctx, RX, bodyTop + 16, W, template === 'compact' ? shelterFields.slice(0, 4) : shelterFields);
  drawIssuedBy(ctx, RX, W, H, FTR_H, muniName);

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), {
      href: url, download: `shelter-notice-${template}-${(s.name||'shelter').replace(/\s+/g,'-')}.png`
    });
    a.click(); URL.revokeObjectURL(url);
  }, 'image/png');
}

function bindShelterEvents(shelters) {
  document.querySelectorAll('.shelter-update').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const { error } = await supabase.from('shelters').update({
        current_occupancy: parseInt(document.getElementById(`occ-${id}`)?.value)||0,
        status:            document.getElementById(`status-${id}`)?.value,
        updated_at:        new Date().toISOString()
      }).eq('id', id);
      if (!error) showToast('✓ Shelter updated successfully!');
      else showToast(error.message, true);
    });
  });

  document.querySelectorAll('.shelter-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const shelter = shelters.find(s => s.id === btn.dataset.id);
      if (shelter) showShelterForm(shelter);
    });
  });

  document.querySelectorAll('.shelter-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this shelter?')) return;
      await supabase.from('shelters').delete().eq('id', btn.dataset.id);
      showToast('Shelter deleted');
      await renderShelters(document.getElementById('community-body'));
    });
  });

  // Download dropdown — fixed position, escapes card overflow
  document.querySelectorAll('.shelter-dl-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const existing = document.getElementById('shared-dl-drop');
      if (existing && existing.dataset.forId === id) { existing.remove(); return; }
      if (existing) existing.remove();

      const rect = btn.getBoundingClientRect();
      const drop = document.createElement('div');
      drop.id = 'shared-dl-drop';
      drop.dataset.forId = id;
      drop.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;z-index:9999;background:var(--bg2);border:1px solid var(--border);border-radius:6px;min-width:170px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.35)`;
      drop.innerHTML = `
        <button data-sh-txt="${id}" style="display:block;width:100%;text-align:left;background:transparent;border:none;border-bottom:1px solid var(--border);padding:9px 14px;font-size:12px;color:var(--text);cursor:pointer;font-family:monospace">📄 Text file (.txt)</button>
        <button data-sh-png="${id}" style="display:block;width:100%;text-align:left;background:transparent;border:none;padding:9px 14px;font-size:12px;color:var(--text);cursor:pointer;font-family:monospace">🖼 Image (.png) · Choose template…</button>`;

      drop.querySelector('[data-sh-txt]').addEventListener('click', () => {
        const s = shelters.find(x => x.id === id); drop.remove(); if (!s) return;
        const text = `SHELTER NOTIFICATION\n${'='.repeat(40)}\n` +
          `Name: ${s.name}\nStatus: ${(s.status||'').toUpperCase()}\n` +
          `Type: ${s.facility_type||'—'}\nAddress: ${s.address||'—'}\n` +
          `Ward: ${s.ward_number||'—'}\nCapacity: ${s.capacity||0}\n` +
          `Current occupancy: ${s.current_occupancy||0}\n` +
          `Contact: ${s.contact_name||'—'} · ${s.contact_number||'—'}\n` +
          `Wheelchair accessible: ${s.wheelchair_accessible?'Yes':'No'}`;
        const blob = new Blob([text], {type:'text/plain'});
        const url  = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), {href:url, download:`shelter-${s.name.replace(/\s+/g,'-')}.txt`}).click();
        URL.revokeObjectURL(url);
      });

      drop.querySelector('[data-sh-png]')?.addEventListener('click', () => {
        const s = shelters.find(x => x.id === id); drop.remove(); if (!s) return;
        openPngTemplatePicker({
          heading: 'Shelter image template',
          templates: PNG_TEMPLATES,
          sectionDefs: [
            { key: 'occupancy', label: 'Occupancy bar', default: true },
            { key: 'facility', label: 'Facility type', default: true },
            { key: 'address', label: 'Address', default: true },
            { key: 'ward', label: 'Ward', default: true },
            { key: 'contact', label: 'Contact', default: true },
            { key: 'accessibility', label: 'Wheelchair access', default: true }
          ],
          onDownload: ({ template, tone, readable, sections }) => downloadShelterPNG(s, template, { tone, readable, sections })
        });
      });

      document.body.appendChild(drop);
    });
  });

  document.addEventListener('click', () => document.getElementById('shared-dl-drop')?.remove());

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

  requestAnimationFrame(() => {
    const btn = document.getElementById('add-relief-btn');
    if (btn) btn.onclick = () => showReliefForm(null);
    bindReliefEvents(ops || []);
  });
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
      municipality_id:    _muniId, name,
      status:             document.getElementById('ro-status')?.value,
      hazard_name:        document.getElementById('ro-hazard')?.value,
      ward_number:        parseInt(document.getElementById('ro-ward')?.value)||null,
      distribution_point: document.getElementById('ro-location')?.value,
      schedule:           document.getElementById('ro-schedule')?.value,
      responsible_org:    document.getElementById('ro-org')?.value,
      public_contact:     document.getElementById('ro-contact')?.value,
      end_date:           document.getElementById('ro-end')?.value||null,
      is_published:       false
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
    <div class="rec-card" style="margin-bottom:12px" id="ro-${op.id}">
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
        <button class="btn btn-sm relief-dl-toggle" data-id="${op.id}">↓ Save ▾</button>
        <button class="btn btn-sm btn-red relief-delete" data-id="${op.id}" style="margin-left:auto">Delete</button>
      </div>
    </div>`;
}

async function downloadReliefPNG(op, template = 'official', opts = {}) {
  const tone = opts.tone || 'notification';
  const readable = opts.readable !== false;
  const sections = {
    hazard: true, ward: true, distribution: true, schedule: true, contact: true, ends: true,
    ...(opts.sections || {})
  };
  const muniName    = window._drmsaUser?.municipalities?.name || 'Municipality';
  const date        = new Date().toLocaleString('en-ZA');
  const accentColor = { active:'#5a3a1a', upcoming:'#1a3a6b', ended:'#444444' }[op.status] || '#5a3a1a';
  const statusBg    = { active:'#5a3a1a', upcoming:'#1a3a6b', ended:'#555555' }[op.status] || '#5a3a1a';
  const statusLabel = (op.status || 'UNKNOWN').toUpperCase();
  const cfgBase = {
    official: { W: 900, H: 500, title: 'Relief Operation Notification', titleSize: 26, bodySize: 13, layout: { splitRatio: 0.63, baseBg: '#f0eeea', leftBg: '#fafaf8' } },
    compact: { W: 900, H: 420, title: 'Relief Operation Bulletin', titleSize: 23, bodySize: 12, layout: { splitRatio: 0.58, baseBg: '#f7f5ff', leftBg: '#fcfbff' } },
    social: { W: 1080, H: 1080, title: 'Relief Operation Update', titleSize: 34, bodySize: 15, layout: { splitRatio: 0.56, baseBg: '#e6eefc', leftBg: '#f7fbff' } },
    'alert-card': { W: 1000, H: 560, title: 'Relief Operation Alert', titleSize: 29, bodySize: 14, layout: { splitRatio: 0.60, baseBg: '#fff7ed', leftBg: '#fffaf5', headerBg: '#fff3e6', footerText: '#fed7aa' } },
    'clean-light': { W: 980, H: 540, title: 'Relief Operation Advisory', titleSize: 27, bodySize: 14, layout: { splitRatio: 0.65, baseBg: '#ecfeff', leftBg: '#f4fdff', headerBg: '#ffffff', footerText: '#a5f3fc' } }
  }[template] || { W: 900, H: 500, title: 'Relief Operation Notification', titleSize: 26, bodySize: 13 };
  const cfg = {
    ...cfgBase,
    title: applyTitleTone(cfgBase.title, tone),
    titleSize: cfgBase.titleSize + (readable ? 1 : 0),
    bodySize: cfgBase.bodySize + (readable ? 2 : 0)
  };

  const logoImgs = await loadLogoImages();
  const { W, H } = cfg;
  const { ctx, canvas, SPLIT, bodyTop, FTR_H, RX } = buildNoticeCanvas(logoImgs, accentColor, muniName, date, W, H, cfg.layout);

  // ── LEFT: Title
  ctx.fillStyle = accentColor; ctx.font = `bold ${cfg.titleSize}px Arial, sans-serif`;
  ctx.fillText(cfg.title, 20, bodyTop + (template === 'social' ? 48 : 38));

  // ── LEFT: Body paragraph
  const para = [
    { text: op.name, bold: true },
    { text: ' is currently ', bold: false },
    { text: op.status || 'active', bold: true },
    { text: '.', bold: false }
  ];
  const para2 = [
    { text: 'The ', bold: false },
    { text: muniName + ' Disaster Management Centre', bold: true },
    { text: ' confirms that ', bold: false },
    { text: op.responsible_org || 'the responsible organisation', bold: true },
    { text: ' is managing relief distribution at ', bold: false },
    { text: op.distribution_point || 'TBC', bold: true },
    { text: '.', bold: false },
    ...(op.schedule ? [{ text: ' Distribution schedule: ', bold: false }, { text: op.schedule, bold: true }, { text: '.', bold: false }] : [])
  ];

  let ty = bodyTop + 60;
  wrapRichText(ctx, para, SPLIT - 40, cfg.bodySize).forEach(line => { drawRichLine(ctx, line, 20, ty, cfg.bodySize, '#1a1a1a'); ty += (cfg.bodySize + 7); });
  ty += 6;
  wrapRichText(ctx, para2, SPLIT - 40, cfg.bodySize).forEach(line => { drawRichLine(ctx, line, 20, ty, cfg.bodySize, '#1a1a1a'); ty += (cfg.bodySize + 7); });

  // ── RIGHT: Fields
  const reliefFields = [{ label: 'Status', badge: true, badgeText: statusLabel, badgeBg: statusBg }];
  if (sections.hazard) reliefFields.push({ label: 'Hazard', value: op.hazard_name || '—' });
  if (sections.ward) reliefFields.push({ label: 'Ward', value: String(op.ward_number || '—') });
  if (sections.distribution) reliefFields.push({ label: 'Distribution point', value: op.distribution_point || '—' });
  if (sections.schedule) reliefFields.push({ label: 'Schedule', value: op.schedule || '—' });
  if (sections.contact) reliefFields.push({ label: 'Public contact', value: op.public_contact || '—' });
  if (sections.ends) reliefFields.push({ label: 'Ends', value: op.end_date ? new Date(op.end_date).toLocaleDateString('en-ZA') : '—' });
  drawRightFields(ctx, RX, bodyTop + 16, W, template === 'compact' ? reliefFields.slice(0, 5) : reliefFields);
  drawIssuedBy(ctx, RX, W, H, FTR_H, muniName);

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), {
      href: url, download: `relief-op-notice-${template}-${(op.name||'op').replace(/\s+/g,'-')}.png`
    });
    a.click(); URL.revokeObjectURL(url);
  }, 'image/png');
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

  // Download dropdown — fixed position, escapes card overflow
  document.querySelectorAll('.relief-dl-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const existing = document.getElementById('shared-dl-drop');
      if (existing && existing.dataset.forId === id) { existing.remove(); return; }
      if (existing) existing.remove();

      const rect = btn.getBoundingClientRect();
      const drop = document.createElement('div');
      drop.id = 'shared-dl-drop';
      drop.dataset.forId = id;
      drop.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;z-index:9999;background:var(--bg2);border:1px solid var(--border);border-radius:6px;min-width:170px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.35)`;
      drop.innerHTML = `
        <button data-ro-txt="${id}" style="display:block;width:100%;text-align:left;background:transparent;border:none;border-bottom:1px solid var(--border);padding:9px 14px;font-size:12px;color:var(--text);cursor:pointer;font-family:monospace">📄 Text file (.txt)</button>
        <button data-ro-png="${id}" style="display:block;width:100%;text-align:left;background:transparent;border:none;padding:9px 14px;font-size:12px;color:var(--text);cursor:pointer;font-family:monospace">🖼 Image (.png) · Choose template…</button>`;

      drop.querySelector('[data-ro-txt]').addEventListener('click', () => {
        const op = ops.find(o => o.id === id); drop.remove(); if (!op) return;
        const text = `RELIEF OPERATION NOTIFICATION\n${'='.repeat(40)}\n` +
          `Operation: ${op.name}\nStatus: ${(op.status||'').toUpperCase()}\n` +
          `Hazard: ${op.hazard_name||'—'}\nWard: ${op.ward_number||'—'}\n` +
          `Distribution point: ${op.distribution_point||'—'}\nSchedule: ${op.schedule||'—'}\n` +
          `Responsible org: ${op.responsible_org||'—'}\nPublic contact: ${op.public_contact||'—'}\n` +
          `End date: ${op.end_date ? new Date(op.end_date).toLocaleDateString('en-ZA') : '—'}`;
        const blob = new Blob([text], {type:'text/plain'});
        const url  = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), {href:url, download:`relief-op-${op.name.replace(/\s+/g,'-')}.txt`}).click();
        URL.revokeObjectURL(url);
      });

      drop.querySelector('[data-ro-png]')?.addEventListener('click', () => {
        const op = ops.find(o => o.id === id); drop.remove(); if (!op) return;
        openPngTemplatePicker({
          heading: 'Relief operation image template',
          templates: PNG_TEMPLATES,
          sectionDefs: [
            { key: 'hazard', label: 'Hazard', default: true },
            { key: 'ward', label: 'Ward', default: true },
            { key: 'distribution', label: 'Distribution point', default: true },
            { key: 'schedule', label: 'Schedule', default: true },
            { key: 'contact', label: 'Public contact', default: true },
            { key: 'ends', label: 'End date', default: true }
          ],
          onDownload: ({ template, tone, readable, sections }) => downloadReliefPNG(op, template, { tone, readable, sections })
        });
      });

      document.body.appendChild(drop);
    });
  });

  document.addEventListener('click', () => document.getElementById('shared-dl-drop')?.remove());
}

function emptyState(msg) {
  return `<div style="text-align:center;padding:48px 20px;color:var(--text3);font-size:12px">${msg}</div>`;
}

function showToast(msg, isError=false) {
  document.querySelectorAll('.drmsa-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'drmsa-toast';
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:${isError?'var(--bg2)':'var(--bg2)'};border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:12px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,.3);transition:opacity .3s;max-width:320px`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(() => t.remove(), 300); }, 3000);
}
