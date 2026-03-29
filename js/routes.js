// js/routes.js
import { supabase } from './supabase.js';

let _muniId = null;
let _closures = [];

export async function initRoutes(user) {
  _muniId = user?.municipality_id;
  await renderRoutes();
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
  const alt = c.alternative_routes?.[0];
  const statusColour = { closed:'var(--red)', partial:'var(--amber)', open:'var(--green)' };

  return `
    <div class="rec-card" id="closure-${c.id}" style="margin-bottom:12px;border-left:3px solid ${statusColour[c.status]||'var(--border)'};overflow:visible;position:relative;z-index:2">
      <div class="rec-head">
        <div>
          <div class="rec-name">${c.road_name}</div>
          <div class="rec-meta">${c.reason || 'No reason'} · ${formatWardsLabel(c.affected_wards)}</div>
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
        <button class="btn btn-sm closure-dl" data-id="${c.id}" data-name="${c.road_name}">↓ Save</button>
        <button class="btn btn-sm closure-edit" data-id="${c.id}" style="margin-left:auto">Edit</button>
        <button class="btn btn-sm btn-red closure-delete" data-id="${c.id}">Delete</button>
      </div>
    </div>`;
}

function showAddAltRouteForm(closureId, containerId) {
  const area = document.getElementById(containerId || `alt-area-${closureId}`);
  if (!area) return;

  area.innerHTML = `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:14px">
      <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:10px;font-family:Inter,system-ui,sans-serif">Alternative route details</div>
      <div class="fl"><span class="fl-label">Route description</span>
        <textarea class="fl-textarea" id="alt-desc-${closureId}" rows="2" placeholder="e.g. Turn left at Main St, continue via Oak Ave to rejoin R62..."></textarea>
      </div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Extra distance (km)</span><input class="fl-input" type="number" id="alt-dist-${closureId}" placeholder="e.g. 4"/></div>
        <div class="fl"><span class="fl-label">Vehicle suitability</span>
          <select class="fl-sel" id="alt-veh-${closureId}">
            <option>All vehicles</option>
            <option>Light vehicles only</option>
            <option>4x4 only</option>
            <option>No heavy vehicles</option>
          </select>
        </div>
      </div>
      <div class="fl"><span class="fl-label">Road condition</span>
        <select class="fl-sel" id="alt-cond-${closureId}">
          <option>Good</option><option>Fair</option><option>Poor</option><option>Gravel</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-green btn-sm" id="save-alt-${closureId}">Save route</button>
        <button class="btn btn-sm" onclick="document.getElementById('alt-area-${closureId}').innerHTML='<button class=\\'btn btn-sm btn-green add-alt-btn\\' data-closure=\\'${closureId}\\'>+ Add alternative route</button>'">Cancel</button>
      </div>
    </div>`;

  // Bind save button immediately after rendering
  document.getElementById(`save-alt-${closureId}`)?.addEventListener('click', async () => {
    const desc = document.getElementById(`alt-desc-${closureId}`)?.value.trim();
    if (!desc) { alert('Please enter a route description.'); return; }

    const { error } = await supabase.from('alternative_routes').insert({
      closure_id:          closureId,
      municipality_id:     _muniId,
      description:         desc,
      extra_distance:      parseInt(document.getElementById(`alt-dist-${closureId}`)?.value) || null,
      vehicle_suitability: document.getElementById(`alt-veh-${closureId}`)?.value,
      road_condition:      document.getElementById(`alt-cond-${closureId}`)?.value,
      is_published:        false
    });

    if (!error) { showToast('✓ Alternative route saved successfully!'); await renderRoutes(); }
    else showToast('Error: ' + error.message, true);
  });

  // Re-bind add-alt buttons after any DOM change
  document.querySelectorAll('.add-alt-btn').forEach(btn => {
    btn.addEventListener('click', () => showAddAltRouteForm(btn.dataset.closure));
  });
}

function showAddClosureForm() {
  const area = document.getElementById('add-closure-area');
  if (!area) return;
  if (area.innerHTML) { area.innerHTML = ''; return; }

  area.innerHTML = `
    <div class="rec-card" style="margin-bottom:16px;border:1px solid var(--red)">
      <div class="rec-head"><div class="rec-name">New road closure</div></div>
      <div style="padding:16px">
        <div class="frow">
          <div class="fl"><span class="fl-label">Road name / number</span><input class="fl-input" id="new-road-name" placeholder="e.g. R62 Main Road, Schoemanshoek"/></div>
          <div class="fl"><span class="fl-label">Status</span>
            <select class="fl-sel" id="new-road-status">
              <option value="closed">Fully closed</option>
              <option value="partial">Partial / Caution</option>
            </select>
          </div>
        </div>
        <div class="fl"><span class="fl-label">Reason for closure</span><input class="fl-input" id="new-road-reason" placeholder="e.g. Flash flood damage to road surface"/></div>
        <div class="frow">
          <div class="fl"><span class="fl-label">Affected wards (comma separated)</span><input class="fl-input" id="new-road-wards" placeholder="e.g. 1, 4, 7"/></div>
          <div class="fl"><span class="fl-label">Authority</span>
            <select class="fl-sel" id="new-road-auth">
              <option>SANRAL</option><option>DRPW</option><option>Municipal</option><option>SAPS</option><option>Traffic</option>
            </select>
          </div>
        </div>
        <div class="fl"><span class="fl-label">Expected reopening</span><input class="fl-input" id="new-road-reopen" placeholder="e.g. 25 March 2025 or Unknown"/></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-green btn-sm" id="save-new-closure-btn">Save closure</button>
          <button class="btn btn-sm" onclick="document.getElementById('add-closure-area').innerHTML=''">Cancel</button>
        </div>
      </div>
    </div>`;

  document.getElementById('save-new-closure-btn')?.addEventListener('click', async () => {
    const roadName = document.getElementById('new-road-name')?.value.trim();
    if (!roadName) { alert('Road name is required.'); return; }

    const wardsRaw = document.getElementById('new-road-wards')?.value;
    const wards = wardsRaw ? wardsRaw.split(',').map(w=>w.trim()).filter(Boolean) : [];

    const { error } = await supabase.from('road_closures').insert({
      municipality_id: _muniId,
      road_name:       roadName,
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
      if (!error) {
        document.getElementById('add-closure-area').innerHTML = '';
        showToast('✓ Closure updated successfully!');
        await renderRoutes();
      } else {
        showToast('Error: ' + error.message, true);
      }
    });
  });
}

function bindClosureEvents() {
  // Add alt route buttons
  document.querySelectorAll('.add-alt-btn').forEach(btn => {
    btn.addEventListener('click', () => showAddAltRouteForm(btn.dataset.closure));
  });

  // Save closure
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

  // Email closure
  document.querySelectorAll('.closure-email').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = _closures.find(x => x.id === btn.dataset.id);
      if (!c) return;
      const alt = c.alternative_routes?.[0];
      const subject = encodeURIComponent(`ROAD CLOSED — ${c.road_name}`);
      const body = encodeURIComponent(
        `ROAD CLOSED — ${c.road_name}\n` +
        `Reason: ${c.reason||'N/A'}\n` +
        `Status: ${(c.status||'').toUpperCase()}\n` +
        `Closed since: ${c.closed_since ? new Date(c.closed_since).toLocaleString('en-ZA') : 'N/A'}\n` +
        `Expected reopening: ${c.expected_reopen||'Unknown'}\n` +
        `Authority: ${c.authority||'N/A'}\n` +
        `Wards affected: ${Array.isArray(c.affected_wards) ? c.affected_wards.join(', ') : c.affected_wards||'N/A'}` +
        (alt ? `\n\nALTERNATIVE ROUTE:\n${alt.description}\nExtra distance: ${alt.extra_distance||'?'} km · ${alt.vehicle_suitability||'All vehicles'}` : '')
      );
      window.open(`mailto:?subject=${subject}&body=${body}`);
    });
  });

  // Download / save closure as text
  document.querySelectorAll('.closure-dl').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = _closures.find(x => x.id === btn.dataset.id);
      if (!c) return;
      const alt = c.alternative_routes?.[0];
      const text = `ROAD CLOSED — ${c.road_name}\n` +
        `Reason: ${c.reason||'N/A'}\n` +
        `Status: ${(c.status||'').toUpperCase()}\n` +
        `Closed since: ${c.closed_since ? new Date(c.closed_since).toLocaleString('en-ZA') : 'N/A'}\n` +
        `Expected reopening: ${c.expected_reopen||'Unknown'}\n` +
        `Authority: ${c.authority||'N/A'}\n` +
        `Wards affected: ${Array.isArray(c.affected_wards) ? c.affected_wards.join(', ') : c.affected_wards||'N/A'}` +
        (alt ? `\n\nALTERNATIVE ROUTE:\n${alt.description}\nExtra distance: ${alt.extra_distance||'?'} km · ${alt.vehicle_suitability||'All vehicles'}` : '');
      showRecordSaveMenu(btn, [
        {
          label: '↓ PNG',
          icon: '#1a6dff',
          fn: () => downloadNoticePNG({
            filename: `DRMSA-closure-${safeFilename(c.road_name || 'route')}.png`,
            title: (c.status === 'open' ? 'Road Reopen Notice' : 'Road Closure Notice'),
            subtitle: c.road_name || 'Road Update',
            bullets: [
              `Reason: ${c.reason || 'N/A'}`,
              `Status: ${(c.status || 'unknown').toUpperCase()}`,
              `Expected reopening: ${c.expected_reopen || 'Unknown'}`,
              `Authority: ${c.authority || 'N/A'}`,
              `Wards affected: ${Array.isArray(c.affected_wards) ? c.affected_wards.join(', ') : c.affected_wards || 'N/A'}`
            ]
          })
        },
        {
          label: '↓ Text (.txt)',
          icon: '#3fb950',
          fn: () => {
            downloadTextFile(text, `DRMSA-closure-${safeFilename(c.road_name || 'route')}.txt`);
          }
        }
      ]);
    });
  });

  // Edit closure
  document.querySelectorAll('.closure-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const closure = _closures.find(x => x.id === btn.dataset.id);
      if (closure) showEditClosureForm(closure);
    });
  });

  // Delete closure
  document.querySelectorAll('.closure-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this road closure and all its alternative routes?')) return;
      await supabase.from('alternative_routes').delete().eq('closure_id', btn.dataset.id);
      await supabase.from('road_closures').delete().eq('id', btn.dataset.id);
      showToast('✓ Closure deleted');
      await renderRoutes();
    });
  });

  // Publish toggles
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

function showRecordSaveMenu(btn, items = []) {
  document.getElementById('drmsa-save-menu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'drmsa-save-menu';
  menu.style.cssText = 'position:fixed;background:var(--bg2);border:1px solid var(--border2);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);z-index:9999;min-width:180px;overflow:hidden;font-family:Inter,system-ui,sans-serif';
  menu.innerHTML = `<div style="padding:8px 12px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);border-bottom:1px solid var(--border)">Save as</div>` +
    items.map((item, i) => `<div data-idx="${i}" style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;font-size:13px;color:var(--text2)"><span style="width:8px;height:8px;border-radius:50%;background:${item.icon || '#58a6ff'};display:inline-block"></span>${item.label}</div>`).join('');
  document.body.appendChild(menu);
  const rect = btn.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 190));
  const top = (rect.bottom + 6 + 180 > window.innerHeight)
    ? Math.max(8, rect.top - 120)
    : (rect.bottom + 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.querySelectorAll('[data-idx]').forEach(el => {
    el.addEventListener('click', () => {
      const fn = items[parseInt(el.dataset.idx, 10)]?.fn;
      menu.remove();
      if (fn) fn();
    });
  });
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 50);
}

function downloadNoticePNG({ filename, title, subtitle, bullets = [] }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 700;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#f7f8fc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#003ea6';
  ctx.fillRect(0, 0, canvas.width, 70);
  ctx.fillRect(0, canvas.height - 56, canvas.width, 56);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 24px Arial';
  ctx.fillText('Western Cape Government', 28, 44);
  ctx.fillStyle = '#bf1e2e';
  ctx.font = '700 54px Arial';
  ctx.fillText(title, 40, 150);
  ctx.fillStyle = '#26344e';
  ctx.font = '700 36px Arial';
  ctx.fillText(subtitle, 40, 200);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(40, 230, 1120, 370);
  ctx.strokeStyle = '#d8dcea';
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 230, 1120, 370);
  ctx.fillStyle = '#2f3444';
  ctx.font = '500 30px Arial';
  bullets.forEach((line, i) => {
    const y = 285 + (i * 58);
    ctx.fillText('•', 70, y);
    const wrapped = wrapTextBlocks(ctx, line, 1040, 1);
    ctx.fillText(wrapped[0] || '', 100, y);
  });
  ctx.fillStyle = '#ffffff';
  ctx.font = '500 24px Arial';
  ctx.fillText('Issued by Disaster Management • Official Notice', 20, canvas.height - 20);
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

// Backward-compatible alias used by older cached bundles.
function downloadClosurePNG(options) {
  downloadNoticePNG(options);
}

function wrapTextBlocks(ctx, text, maxWidth, maxLines = 1) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const next = `${current} ${words[i]}`;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : '…';
  }
  return lines;
}

function formatWardsLabel(wards) {
  if (Array.isArray(wards) && wards.length) return `Wards ${wards.join(', ')}`;
  if (typeof wards === 'string' && wards.trim()) return `Wards ${wards.trim()}`;
  return 'Ward ?';
}

function safeFilename(value) {
  return String(value || 'record')
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'record';
}

function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
