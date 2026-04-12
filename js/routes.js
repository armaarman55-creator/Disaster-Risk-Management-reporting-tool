// js/routes.js
import { supabase } from './supabase.js';
import { confirmDialog } from './confirm-dialog.js';

let _muniId   = null;
let _closures = [];
let _muniLogos = { main: null, dm: null, mode: 'main' };
const ROUTE_PNG_TEMPLATES = [
  { key: 'road-sign',     label: 'Road sign',      desc: 'Dark traffic sign visual style' },
  { key: 'formal-notice', label: 'Formal notice',  desc: 'Official two-column document' },
  { key: 'social-alert',  label: 'Social alert',   desc: 'Urgent social media card' },
  { key: 'info-strip',    label: 'Info strip',     desc: 'Wide banner with alt route panel' },
  { key: 'map-card',      label: 'Map card',       desc: 'Route card with map area' },
];

function titleToneWord(tone) {
  return tone === 'advisory' ? 'Advisory' : tone === 'update' ? 'Update' : 'Notification';
}

function applyTitleTone(title, tone) {
  return String(title || '').replace(/\b(Notification|Notice|Bulletin|Update)\b/i, titleToneWord(tone));
}

// Compatibility helper for older template markup that referenced swatchHtml().
function swatchHtml(color = '#1d4ed8') {
  return `<span aria-hidden="true" style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${color};border:1px solid rgba(255,255,255,.35)"></span>`;
}

function _rHexToRgba(hex, alpha = 1) {
  const v = String(hex || '').replace('#', '').trim();
  const full = v.length === 3 ? v.split('').map(ch => ch + ch).join('') : v.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
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

function buildThumbnails(root, templates = []) {
  const host = root || document;
  const items = host.querySelectorAll('[data-template-preview]');
  items.forEach(node => {
    const key = node.getAttribute('data-template-preview');
    if (!key) return;
    if (node.tagName === 'IMG') {
      node.src = routeTemplatePreviewDataUri(key);
      return;
    }
    if (node.tagName === 'CANVAS') {
      const ctx = node.getContext('2d');
      if (!ctx) return;
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, node.width, node.height);
      img.src = routeTemplatePreviewDataUri(key);
    }
  });
}

// Compatibility helper for older thumbnail pipelines that call _drawRouteThumbnail(ctx, templateKey).
function _drawRouteThumbnail(ctx, templateKey) {
  if (!ctx || !ctx.canvas) return;
  const { width, height } = ctx.canvas;
  const dataUri = routeTemplatePreviewDataUri(templateKey);
  const img = new Image();
  img.onload = () => ctx.drawImage(img, 0, 0, width, height);
  img.src = dataUri;
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

  const pickerState = { template: templates[0]?.key || 'road-sign', color: '#dc2626' };
  const defaultColors = ['#dc2626', '#ea580c', '#1d4ed8', '#374151', '#7c3aed', '#b45309', '#0f766e'];
  const sectionDefs = [
    { key: 'reason', label: 'Closure reason', default: true },
    { key: 'authority', label: 'Authority', default: true },
    { key: 'closed_since', label: 'Closed since', default: true },
    { key: 'reopen', label: 'Expected reopening', default: true },
    { key: 'alt_route', label: 'Alternative route', default: true },
    { key: 'affected_wards', label: 'Affected wards', default: true },
    { key: 'status_badge', label: 'Status badge', default: true },
    { key: 'generated_date', label: 'Generated date', default: false },
  ];

  const presetSwatches = defaultColors.map(c => `<span data-swatch="${c}" style="display:inline-block;width:20px;height:20px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${c === pickerState.color ? '#fff' : 'transparent'};box-sizing:border-box;flex-shrink:0"></span>`).join('');
  const sectionGroups = { Content: sectionDefs.filter(s => !['status_badge', 'generated_date'].includes(s.key)), 'Design elements': sectionDefs.filter(s => ['status_badge', 'generated_date'].includes(s.key)) };

  const modal = document.createElement('div');
  modal.id = 'route-template-picker';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding:16px 16px 24px;overflow:auto';
  modal.innerHTML = `
    <div style="width:min(760px,96vw);max-height:min(88vh,calc(100dvh - 32px));overflow:auto;background:var(--bg2);border:1px solid var(--border2);border-radius:12px;box-shadow:0 10px 36px rgba(0,0,0,.45);padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0;font-size:16px">Route notice image template</h3>
        <div style="display:flex;align-items:center;gap:6px">
          <button type="button" id="route-download-top" style="border:1px solid rgba(0,0,0,.35);background:var(--accent);color:#fff;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;font-weight:700;box-shadow:0 0 0 1px rgba(255,255,255,.2) inset">Download PNG</button>
          <button type="button" data-close style="border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:6px;padding:4px 8px;cursor:pointer">✕</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:10px">Select template and content before downloading.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-bottom:12px">
        ${templates.map((tpl, idx) => `
          <label style="display:block;border:1px solid var(--border);border-radius:8px;padding:9px;background:var(--bg3);cursor:pointer">
            <input type="radio" name="tpl" value="${tpl.key}" ${idx === 0 ? 'checked' : ''} />
            <img alt="${tpl.label} preview" data-template-preview="${tpl.key}" src="${routeTemplatePreviewDataUri(tpl.key)}" style="display:block;width:100%;height:64px;object-fit:cover;border-radius:6px;margin:6px 0;border:1px solid rgba(255,255,255,.22)" />
            <div style="font-weight:700;font-size:12px;margin-top:4px">${tpl.label}</div>
            <div style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:6px">${swatchHtml((tpl.preview || '#1d4ed8').match(/#(?:[0-9a-fA-F]{3}){1,2}/)?.[0] || '#1d4ed8')} ${tpl.desc || tpl.key}</div>
          </label>
        `).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;flex:1;overflow:hidden;min-height:0">
        <div style="border-right:1px solid var(--border);padding:14px;overflow-y:auto;display:flex;flex-direction:column;gap:12px">
          <div>
            <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Accent colour</div>
            <div style="display:flex;gap:7px;flex-wrap:wrap" id="route-swatches">${presetSwatches}</div>
            <label style="display:block;font-size:11px;margin-top:8px;color:var(--text2)">Custom colour
              <input id="route-accent-color" type="color" value="${pickerState.color}" style="display:block;width:48px;height:30px;border:none;background:transparent;padding:0;margin-top:5px;cursor:pointer" />
            </label>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">Live preview</div>
            <div id="route-preview-wrap" style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;height:200px">
              <canvas id="route-preview-canvas"></canvas>
            </div>
            <div style="font-size:10px;color:var(--text3);margin-top:5px">Preview updates as you change options</div>
          </div>
        </div>
        <div style="padding:14px;overflow-y:auto;display:flex;flex-direction:column;gap:12px">
          <div>
            <div style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Sections to include</div>
            ${Object.entries(sectionGroups).map(([grp, secs]) => secs.length ? `
              <div style="border:1px solid var(--border);border-radius:7px;overflow:hidden;margin-bottom:8px">
                <div style="padding:7px 12px;background:var(--bg3);font-size:11px;font-weight:700;color:var(--text2);border-bottom:1px solid var(--border)">${grp}</div>
                <div style="padding:8px 12px;display:flex;flex-direction:column;gap:6px">
                  ${secs.map(s => `<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer"><input type="checkbox" data-sec="${s.key}" ${s.default ? 'checked' : ''} style="width:13px;height:13px;accent-color:var(--accent)"/> ${s.label}</label>`).join('')}
                </div>
              </div>` : '').join('')}
          </div>
          <div style="border:1px solid var(--border);border-radius:7px;overflow:hidden">
            <div style="padding:7px 12px;background:var(--bg3);font-size:11px;font-weight:700;color:var(--text2);border-bottom:1px solid var(--border)">Notice wording</div>
            <div style="padding:10px 12px;display:flex;flex-direction:column;gap:8px">
              <label style="font-size:12px">Tone
                <select id="route-tone" style="display:block;width:100%;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:6px;color:var(--text);font-size:12px">
                  <option value="notification">Notification</option>
                  <option value="advisory">Advisory</option>
                  <option value="update">Update</option>
                </select>
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer">
                <input id="route-readable" type="checkbox" checked style="width:13px;height:13px;accent-color:var(--accent)"/>
                Larger readable text (recommended)
              </label>
            </div>
          </div>
        </div>
      </div>
      <div style="position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:8px;margin-top:14px;padding:10px 0 4px;background:linear-gradient(180deg, rgba(0,0,0,0), var(--bg2) 45%)">
        <button type="button" data-close style="border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:6px;padding:7px 10px;cursor:pointer">Cancel</button>
        <button type="button" id="route-download-now" style="border:1px solid rgba(0,0,0,.35);background:var(--accent);color:#fff;border-radius:6px;padding:7px 12px;cursor:pointer;font-weight:700;box-shadow:0 0 0 1px rgba(255,255,255,.2) inset">Download PNG</button>
      </div>
    </div>
  `;

  const syncSwatches = (color) => {
    modal.querySelectorAll('#route-swatches [data-swatch]').forEach(el => {
      el.style.borderColor = (el.getAttribute('data-swatch') || '').toLowerCase() === String(color || '').toLowerCase() ? '#fff' : 'transparent';
    });
  };
  const updatePreview = () => {
    buildThumbnails(modal, templates);
    const canvas = modal.querySelector('#route-preview-canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const template = modal.querySelector('input[name="tpl"]:checked')?.value || templates[0]?.key || 'road-sign';
    const accent = modal.querySelector('#route-accent-color')?.value || pickerState.color;
    pickerState.template = template;
    pickerState.color = accent;
    syncSwatches(accent);
    const wrap = modal.querySelector('#route-preview-wrap');
    const w = Math.max(220, Math.min(420, wrap?.clientWidth || 360));
    const h = Math.round(w * 0.56);
    canvas.width = w;
    canvas.height = h;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.fillStyle = _rHexToRgba(accent, 0.2);
      ctx.fillRect(0, 0, w, 16);
      ctx.fillStyle = accent;
      ctx.fillRect(0, h - 7, w, 7);
      ctx.strokeStyle = _rHexToRgba(accent, 0.4);
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    };
    img.src = routeTemplatePreviewDataUri(template);
  };

  modal.querySelectorAll('#route-swatches [data-swatch]').forEach(el => {
    el.addEventListener('click', () => {
      const color = el.getAttribute('data-swatch');
      if (!color) return;
      const input = modal.querySelector('#route-accent-color');
      if (input) input.value = color;
      updatePreview();
    });
  });
  modal.querySelectorAll('input[name="tpl"], #route-accent-color, #route-tone, #route-readable, [data-sec]').forEach(el => {
    el?.addEventListener('change', updatePreview);
  });
  modal.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  const doDownload = async () => {
    const template = modal.querySelector('input[name="tpl"]:checked')?.value || templates[0]?.key || 'road-sign';
    const tone = modal.querySelector('#route-tone')?.value || 'notification';
    const readable = !!modal.querySelector('#route-readable')?.checked;
    const color = modal.querySelector('#route-accent-color')?.value || pickerState.color;
    const sections = {};
    sectionDefs.forEach(sec => { sections[sec.key] = !!modal.querySelector(`[data-sec="${sec.key}"]`)?.checked; });
    modal.remove();
    await onDownload({ template, tone, readable, color, sections });
  };
  modal.querySelector('#route-download-now')?.addEventListener('click', doDownload);
  modal.querySelector('#route-download-top')?.addEventListener('click', doDownload);
  document.body.appendChild(modal);
  buildThumbnails(modal, templates);
  requestAnimationFrame(() => { updatePreview(); });
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
async function downloadClosurePNG(c, template = 'road-sign', opts = {}) {
  const tone      = opts.tone || 'notification';
  const readable  = opts.readable !== false;
  const accent    = opts.color || { closed:'#1a3a6b', partial:'#7a5200', open:'#1a6b3a' }[c.status] || '#1a3a6b';
  const sections  = { reason:true, authority:true, closed_since:true, reopen:true, alt_route:true, affected_wards:true, status_badge:true, generated_date:false, ...(opts.sections||{}) };
  const alt       = c.alternative_routes?.[0];
  const muniName  = window._drmsaUser?.municipalities?.name || 'Municipality';
  const date      = new Date().toLocaleString('en-ZA');
  const statusLabel = { closed:'FULLY CLOSED', partial:'PARTIAL CLOSURE', open:'REOPENED' }[c.status] || (c.status||'').toUpperCase();
  const toneWord  = tone==='advisory'?'Advisory':tone==='update'?'Update':'Notification';
  const bsz       = readable ? 14 : 12;
  const logoImgs  = await loadLogoImages();

  const dims = { 'road-sign':{W:960,H:520}, 'formal-notice':{W:900,H:520}, 'social-alert':{W:1080,H:1080}, 'info-strip':{W:1200,H:420}, 'map-card':{W:960,H:560} }[template] || {W:960,H:520};
  const { W, H } = dims;
  const canvas = document.createElement('canvas'); canvas.width=W; canvas.height=H;
  const ctx = canvas.getContext('2d');

  const fi = (x,y,w,h,col)=>{ctx.fillStyle=col;ctx.fillRect(x,y,w,h);};
  const tx = (str,x,y,font,col,align='left')=>{ctx.font=font;ctx.fillStyle=col;ctx.textAlign=align;ctx.fillText(str,x,y);ctx.textAlign='left';};
  const ln = (x1,y1,x2,y2,col,lw=1)=>{ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();};
  const pill = (label,x,y,bg,tc)=>{ctx.font='bold 11px Arial,sans-serif';const tw=ctx.measureText(label).width;ctx.fillStyle=bg;roundRect(ctx,x,y-13,tw+16,18,4);ctx.fill();ctx.fillStyle=tc;ctx.fillText(label,x+8,y+1);};
  const field = (label,val,x,y,maxW,light=true)=>{tx(label.toUpperCase(),x,y,'bold 9px Arial,sans-serif',light?'#888':'rgba(255,255,255,0.55)');const lines=wrapText(ctx,val,maxW);lines.slice(0,3).forEach((l,i)=>tx(l,x,y+13+i*14,'12px Arial,sans-serif',light?'#1a1a1a':'rgba(255,255,255,0.9)'));return y+14+Math.min(lines.length,3)*14;};

  const drawHeader = () => {
    fi(0,0,W,H,'#f0eeea'); fi(0,0,W,6,accent); fi(0,6,W,54,'#fff'); ln(0,60,W,60,'#ddd');
    let lx=14;
    for (const img of logoImgs) { if(!img) continue; const dh=40,dw=Math.min(dh*(img.naturalWidth/img.naturalHeight),80); ctx.drawImage(img,lx,6+(54-dh)/2,dw,dh); lx+=dw+10; }
    tx(muniName,lx+4,30,'bold 12px Arial,sans-serif','#333'); tx('Disaster Management Centre',lx+4,46,'10px Arial,sans-serif','#888');
    if (sections.generated_date) { tx('Issued: '+date,W-14,30,'10px Arial,sans-serif','#aaa','right'); tx('FOR OFFICIAL USE',W-14,46,'9px Arial,sans-serif','#bbb','right'); }
    return 60;
  };
  const drawFooter = () => { fi(0,H-30,W,30,accent); tx(muniName+' Disaster Management Centre',14,H-10,'10px Arial,sans-serif',_rHexToRgba('#fff',0.75)); tx('Generated: '+date,W-14,H-10,'9px Arial,sans-serif',_rHexToRgba('#fff',0.6),'right'); };

  if (template === 'road-sign') {
    fi(0,0,W,H,'#1a1a2e'); fi(0,0,W,8,accent);
    ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1.5; ctx.strokeRect(10,16,W-20,H-26);
    fi(10,16,W-20,36,'rgba(255,255,255,0.06)');
    let lx=20; for (const img of logoImgs) { if(!img) continue; const dh=28,dw=Math.min(dh*(img.naturalWidth/img.naturalHeight),56); ctx.drawImage(img,lx,22,dw,dh); lx+=dw+8; }
    tx(muniName,lx+4,30,'bold 12px Arial,sans-serif','rgba(255,255,255,0.8)'); tx('Disaster Management Centre',lx+4,44,'10px Arial,sans-serif','rgba(255,255,255,0.45)');
    if (sections.generated_date) tx(date,W-20,30,'9px Arial,sans-serif','rgba(255,255,255,0.4)','right');
    ln(10,52,W-10,52,'rgba(255,255,255,0.12)');
    if (sections.status_badge) pill(statusLabel,20,76,accent,'#fff');
    tx(c.road_name,20,100,`bold ${readable?26:22}px Arial,sans-serif`,'#fff');
    if (sections.reason&&c.reason) tx(`Reason: ${c.reason}`,20,120,'12px Arial,sans-serif','rgba(255,255,255,0.75)');
    const para=[{text:'The ',bold:false},{text:muniName+' DMC',bold:true},{text:` notifies road users of the closure of `,bold:false},{text:c.road_name,bold:true},...(c.reason?[{text:` due to `,bold:false},{text:c.reason,bold:true}]:[]),{text:'.',bold:false}];
    let ty=140;
    wrapRichText(ctx,para,W*0.52-40,bsz).forEach(l=>{drawRichLine(ctx,l,20,ty,bsz,'rgba(255,255,255,0.65)');ty+=bsz+6;});
    if (alt&&sections.alt_route) { ty+=10; fi(20,ty,W*0.52-40,1,'rgba(255,255,255,0.15)'); ty+=14; tx('ALTERNATIVE ROUTE',20,ty,'bold 10px Arial,sans-serif',_rHexToRgba(accent,0.9)); ty+=14; const altL=wrapText(ctx,alt.description,W*0.52-40); altL.slice(0,2).forEach(l=>{tx(l,20,ty,'11px Arial,sans-serif','rgba(255,255,255,0.75)');ty+=14;}); if(alt.extra_distance) tx(`+${alt.extra_distance} km · ${alt.vehicle_suitability||'All vehicles'}`,20,ty,'10px Arial,sans-serif','rgba(255,255,255,0.55)'); }
    const RX=Math.round(W*0.56); ln(RX,56,RX,H-10,'rgba(255,255,255,0.1)');
    let ry=64;
    if (sections.authority&&c.authority)         ry=field('Authority',c.authority,RX+16,ry,W-RX-30,false);
    if (sections.closed_since&&c.closed_since)   ry=field('Closed since',new Date(c.closed_since).toLocaleString('en-ZA'),RX+16,ry,W-RX-30,false);
    if (sections.reopen&&c.expected_reopen)      ry=field('Expected reopening',c.expected_reopen,RX+16,ry,W-RX-30,false);
    if (sections.affected_wards&&c.affected_wards) { const wards=Array.isArray(c.affected_wards)?c.affected_wards.join(', '):c.affected_wards; ry=field('Affected wards',wards,RX+16,ry,W-RX-30,false); }
    fi(10,H-20,W-20,16,'rgba(255,255,255,0.06)'); tx(muniName+' Disaster Management',W/2,H-9,'bold 9px Arial,sans-serif','rgba(255,255,255,0.5)','center');

  } else if (template === 'formal-notice') {
    const bodyTop = drawHeader(); const SP=Math.round(W*0.62); const RX=SP+14;
    fi(0,bodyTop,SP,H-bodyTop-30,'#fafaf8'); fi(SP,bodyTop,W-SP,H-bodyTop-30,_rHexToRgba(accent,0.06)); ln(SP,bodyTop,SP,H-30,'#ddd');
    tx(`Road Closure ${toneWord}`,20,bodyTop+36,`bold ${readable?16:14}px Arial,sans-serif`,accent);
    tx(c.road_name,20,bodyTop+58,`bold ${readable?22:19}px Arial,sans-serif`,'#1a1a1a');
    if (sections.status_badge) pill(statusLabel,20,bodyTop+82,accent,'#fff');
    const para=[{text:c.road_name,bold:true},{text:' is closed to all traffic.',bold:false}];
    const para2=[{text:'The ',bold:false},{text:muniName+' DMC',bold:true},{text:' notifies road users of the closure of ',bold:false},{text:c.road_name,bold:true},...(c.reason?[{text:' due to ',bold:false},{text:c.reason,bold:true}]:[]),{text:'.',bold:false}];
    let ty=bodyTop+100;
    wrapRichText(ctx,para,SP-40,bsz).forEach(l=>{drawRichLine(ctx,l,20,ty,bsz,'#1a1a1a');ty+=bsz+6;});
    ty+=6;
    wrapRichText(ctx,para2,SP-40,bsz).forEach(l=>{drawRichLine(ctx,l,20,ty,bsz,'#555');ty+=bsz+6;});
    if (alt&&sections.alt_route) { ty+=12; fi(20,ty,SP-40,1,'#ddd'); ty+=14; tx('ALTERNATIVE ROUTE',20,ty,'bold 10px Arial,sans-serif','#3a7d44'); ty+=14; const al=wrapText(ctx,alt.description,SP-80); al.slice(0,2).forEach(l=>{tx(l,20,ty,'11px Arial,sans-serif','#1a1a1a');ty+=14;}); if(alt.extra_distance) tx(`+${alt.extra_distance} km · ${alt.vehicle_suitability||'All vehicles'}`,20,ty,'10px Arial,sans-serif','#555'); }
    let ry=bodyTop+16;
    if (sections.authority&&c.authority)         ry=field('Authority',c.authority,RX,ry,W-RX-14);
    if (sections.closed_since&&c.closed_since)   ry=field('Closed since',new Date(c.closed_since).toLocaleString('en-ZA'),RX,ry,W-RX-14);
    if (sections.reopen&&c.expected_reopen)      ry=field('Expected reopening',c.expected_reopen,RX,ry,W-RX-14);
    if (sections.affected_wards&&c.affected_wards) { const wards=Array.isArray(c.affected_wards)?c.affected_wards.join(', '):c.affected_wards; ry=field('Affected wards',wards,RX,ry,W-RX-14); }
    const isy=H-30-60; ln(RX,isy,W-14,isy,'#ccc'); tx('ISSUED BY',RX,isy+14,'bold 9px Arial,sans-serif','#888'); tx(muniName,RX,isy+28,'11px Arial,sans-serif','#333'); tx('Disaster Management',RX,isy+42,'10px Arial,sans-serif','#666');
    drawFooter();

  } else if (template === 'social-alert') {
    fi(0,0,W,H,_rDarkenHex(accent,40)); fi(0,0,W,H,'rgba(0,0,0,0.12)');
    fi(0,0,W,H*0.18,'rgba(255,255,255,0.12)');
    let lx=W*0.07+14; for(const img of logoImgs){if(!img)continue;const dh=32,dw=Math.min(dh*(img.naturalWidth/img.naturalHeight),64);ctx.drawImage(img,lx,H*0.05,dw,dh);lx+=dw+8;}
    tx(muniName,W/2,H*0.1,`bold ${readable?14:12}px Arial,sans-serif`,'rgba(255,255,255,0.9)','center');
    tx('Road Closure '+toneWord,W/2,H*0.15,'11px Arial,sans-serif','rgba(255,255,255,0.6)','center');
    fi(W*0.07,H*0.22,W*0.86,H*0.62,'rgba(255,255,255,0.12)');
    if (sections.status_badge) { ctx.font='bold 11px Arial,sans-serif'; const tw=ctx.measureText(statusLabel).width; fi(W*0.07+16,H*0.27,tw+16,22,accent); tx(statusLabel,W*0.07+24,H*0.27+15,'bold 11px Arial,sans-serif','#fff'); }
    tx(c.road_name,W/2,H*0.39,`bold ${readable?30:26}px Arial,sans-serif`,'#fff','center');
    if (sections.reason&&c.reason)     tx(c.reason,W/2,H*0.46,`${readable?14:12}px Arial,sans-serif`,'rgba(255,255,255,0.8)','center');
    if (sections.reopen&&c.expected_reopen) tx(`Expected reopening: ${c.expected_reopen}`,W/2,H*0.53,'12px Arial,sans-serif','rgba(255,255,255,0.7)','center');
    if (alt&&sections.alt_route)       tx(`Alt route: ${alt.description}`,W/2,H*0.6,'11px Arial,sans-serif','rgba(255,255,255,0.65)','center');
    if (sections.affected_wards&&c.affected_wards) { const wards=Array.isArray(c.affected_wards)?c.affected_wards.join(', '):c.affected_wards; tx(`Wards affected: ${wards}`,W/2,H*0.67,'11px Arial,sans-serif','rgba(255,255,255,0.55)','center'); }
    if (sections.generated_date) tx(date,W/2,H*0.86,'10px Arial,sans-serif','rgba(255,255,255,0.4)','center');

  } else if (template === 'info-strip') {
    fi(0,0,W,H,accent); fi(0,0,W,H,'rgba(0,0,0,0.22)');
    fi(0,0,W,18,'rgba(255,255,255,0.12)');
    tx(muniName,14,13,'bold 10px Arial,sans-serif','rgba(255,255,255,0.75)');
    if (sections.generated_date) tx(date,W-14,13,'9px Arial,sans-serif','rgba(255,255,255,0.55)','right');
    const SP=Math.round(W*0.55); fi(SP,18,W-SP,H-18,'rgba(255,255,255,0.12)'); ln(SP,18,SP,H,'rgba(255,255,255,0.2)');
    if (sections.status_badge) { ctx.font='bold 11px Arial,sans-serif'; const tw=ctx.measureText(statusLabel).width; fi(18,26,tw+16,20,'rgba(255,255,255,0.25)'); tx(statusLabel,26,40,'bold 11px Arial,sans-serif','#fff'); }
    tx(`Road Closure ${toneWord}`,18,56,`bold ${readable?17:15}px Arial,sans-serif`,'rgba(255,255,255,0.7)');
    tx(c.road_name,18,82,`bold ${readable?28:24}px Arial,sans-serif`,'#fff');
    if (sections.reason&&c.reason)     tx(c.reason,18,104,'12px Arial,sans-serif','rgba(255,255,255,0.8)');
    if (sections.affected_wards&&c.affected_wards) { const wards=Array.isArray(c.affected_wards)?c.affected_wards.join(', '):c.affected_wards; tx(`Wards: ${wards}`,18,122,'11px Arial,sans-serif','rgba(255,255,255,0.65)'); }
    if (alt&&sections.alt_route) { const aY=H-60; fi(18,aY,SP-36,50,'rgba(255,255,255,0.1)'); tx('ALTERNATIVE ROUTE',26,aY+16,'bold 9px Arial,sans-serif','rgba(255,255,255,0.65)'); tx(alt.description,26,aY+30,'11px Arial,sans-serif','rgba(255,255,255,0.85)'); if(alt.extra_distance) tx(`+${alt.extra_distance} km · ${alt.vehicle_suitability||'All vehicles'}`,26,aY+44,'10px Arial,sans-serif','rgba(255,255,255,0.6)'); }
    let ry=28;
    if (sections.authority&&c.authority)         ry=field('Authority',c.authority,SP+16,ry,W-SP-30,false);
    if (sections.closed_since&&c.closed_since)   ry=field('Closed since',new Date(c.closed_since).toLocaleString('en-ZA'),SP+16,ry,W-SP-30,false);
    if (sections.reopen&&c.expected_reopen)      ry=field('Expected reopening',c.expected_reopen,SP+16,ry,W-SP-30,false);
    tx(muniName+' Disaster Management Centre',14,H-10,'bold 9px Arial,sans-serif','rgba(255,255,255,0.7)');

  } else if (template === 'map-card') {
    const bodyTop = drawHeader();
    fi(0,bodyTop,W,H-bodyTop,'#e8f4f8'); fi(0,bodyTop,W,(H-bodyTop)*0.45,'#c8e0ea');
    // Road path (closed)
    ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=8; ctx.beginPath(); ctx.moveTo(0,bodyTop+(H-bodyTop)*0.35); ctx.bezierCurveTo(W*0.3,bodyTop+(H-bodyTop)*0.15,W*0.7,bodyTop+(H-bodyTop)*0.55,W,bodyTop+(H-bodyTop)*0.4); ctx.stroke();
    ctx.strokeStyle=accent; ctx.lineWidth=4; ctx.setLineDash([12,8]); ctx.beginPath(); ctx.moveTo(0,bodyTop+(H-bodyTop)*0.35); ctx.bezierCurveTo(W*0.3,bodyTop+(H-bodyTop)*0.15,W*0.7,bodyTop+(H-bodyTop)*0.55,W,bodyTop+(H-bodyTop)*0.4); ctx.stroke(); ctx.setLineDash([]);
    // Closure card
    const bx=W*0.03, by=bodyTop+(H-bodyTop)*0.48, bw=W*0.44, bh=H-by-10;
    fi(bx,by,bw,bh,'rgba(255,255,255,0.94)'); ctx.strokeStyle=_rHexToRgba(accent,0.4); ctx.lineWidth=0.5; ctx.strokeRect(bx,by,bw,bh);
    if(sections.status_badge) pill(statusLabel,bx+10,by+22,accent,'#fff');
    tx(c.road_name,bx+10,by+38,`bold ${readable?18:16}px Arial,sans-serif`,'#1a1a1a');
    let cy=by+50;
    if(sections.reason&&c.reason)            cy=field('Reason',c.reason,bx+10,cy,bw-20);
    if(sections.closed_since&&c.closed_since) cy=field('Closed since',new Date(c.closed_since).toLocaleDateString('en-ZA'),bx+10,cy,bw-20);
    if(sections.reopen&&c.expected_reopen)   cy=field('Reopen',c.expected_reopen,bx+10,cy,bw-20);
    // Alt route card
    if (alt&&sections.alt_route) {
      const ax=W*0.52, ay=bodyTop+(H-bodyTop)*0.48, aw=W*0.45, ah=H-ay-10;
      fi(ax,ay,aw,ah,_rHexToRgba(accent,0.08)); ctx.strokeStyle=_rHexToRgba(accent,0.35); ctx.lineWidth=0.5; ctx.strokeRect(ax,ay,aw,ah);
      tx('ALTERNATIVE ROUTE',ax+10,ay+18,'bold 10px Arial,sans-serif','#3a7d44');
      const al=wrapText(ctx,alt.description,aw-20); let altY=ay+34; al.slice(0,3).forEach(l=>{tx(l,ax+10,altY,'11px Arial,sans-serif','#1a1a1a');altY+=14;});
      if(alt.extra_distance) tx(`+${alt.extra_distance} km · ${alt.vehicle_suitability||'All vehicles'}`,ax+10,altY+4,'10px Arial,sans-serif','#555');
    }
    drawFooter();
  }

  // Update the picker call site in bindClosureEvents to pass color
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'),{href:url,download:`road-closure-${template}-${(c.road_name||'route').replace(/\s+/g,'-')}.png`}).click();
    URL.revokeObjectURL(url);
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
          onDownload: ({ template, tone, readable, sections, color }) => downloadClosurePNG(c, template, { tone, readable, sections, color })
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
