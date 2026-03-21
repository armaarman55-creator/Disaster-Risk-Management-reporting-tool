// js/idp.js — IDP Linkage & Spatial Mitigation Register
import { supabase } from './supabase.js';
import { showToast } from './toast.js';

let _muniId = null;
let _user   = null;
let _wards  = [];
let _hazards = [];

const IDP_KPAS = [
  'KPA 1 — Municipal transformation and institutional development',
  'KPA 2 — Basic service delivery and infrastructure development',
  'KPA 3 — Local economic development',
  'KPA 4 — Municipal financial viability and management',
  'KPA 5 — Good governance and public participation'
];
const DRR      = ['Treat/Mitigate','Tolerate/Accept','Transfer/Share','Terminate/Prevent'];
const TIMEFRAMES= ['Short term (< 1 year)','Medium term (1–3 years)','Long term (3–5 years)'];
const MIT_TYPES = ['Structural','Non-structural','Policy/Plan','Awareness/Training'];
const STATUSES  = ['Proposed','Linked — awaiting funding','Linked — funded','Under review','In progress','Completed'];

export async function initIDP(user) {
  _user   = user;
  _muniId = user?.municipality_id;

  if (!_muniId) {
    const page = document.getElementById('page-idp');
    if (page) page.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">No municipality linked. Go to My Profile to set your municipality.</div>';
    return;
  }

  const [wr, hr] = await Promise.all([
    supabase.from('wards').select('ward_number,area_name').eq('municipality_id',_muniId).order('ward_number'),
    supabase.from('hvc_hazard_scores').select('hazard_name,hazard_category,risk_band,risk_rating').eq('municipality_id',_muniId).order('risk_rating',{ascending:false})
  ]);

  _wards   = wr.data || [];
  const seen = new Set();
  _hazards = (hr.data||[]).filter(h => { if(seen.has(h.hazard_name)) return false; seen.add(h.hazard_name); return true; });

  // Fallback ward generation
  if (!_wards.length && user?.municipalities?.ward_count > 0) {
    _wards = Array.from({length:user.municipalities.ward_count},(_,i)=>({ward_number:i+1,area_name:null}));
  }

  await renderIDP();
}

async function renderIDP() {
  const page = document.getElementById('page-idp');
  if (!page) return;

  const { data: mits } = await supabase
    .from('mitigations').select('*')
    .eq('municipality_id', _muniId).eq('is_library', false)
    .order('created_at', { ascending: false });

  const total    = mits?.length||0;
  const funded   = mits?.filter(m=>m.idp_status==='linked-funded').length||0;
  const awaiting = mits?.filter(m=>m.idp_status==='linked-awaiting').length||0;
  const proposed = mits?.filter(m=>m.idp_status==='proposed').length||0;

  page.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div style="padding:12px 20px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--text)">IDP Linkage & Mitigation Register</div>
          <div style="font-size:11px;color:var(--text3);margin-top:1px">Spatial mitigations linked to IDP projects and budget votes</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-sm" id="idp-library-btn">Library suggestions</button>
          <button class="btn btn-sm" id="idp-email-btn">Email report</button>
          <button class="btn btn-red btn-sm" id="idp-add-btn">+ Add mitigation</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px 20px;background:var(--bg);border-bottom:1px solid var(--border);flex-shrink:0">
        <div class="stat-box"><div class="stat-lbl">Total</div><div class="stat-num blue">${total}</div></div>
        <div class="stat-box"><div class="stat-lbl">Funded</div><div class="stat-num green">${funded}</div></div>
        <div class="stat-box"><div class="stat-lbl">Awaiting funding</div><div class="stat-num amber">${awaiting}</div></div>
        <div class="stat-box"><div class="stat-lbl">Proposed</div><div class="stat-num" style="color:var(--text3)">${proposed}</div></div>
      </div>

      <div style="display:flex;gap:8px;padding:10px 20px;background:var(--bg);border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap">
        <select class="fl-sel" id="idp-filter-hazard" style="font-size:12px;max-width:180px">
          <option value="">All hazards</option>
          ${_hazards.map(h=>`<option value="${h.hazard_name}">${h.hazard_name}</option>`).join('')}
        </select>
        <select class="fl-sel" id="idp-filter-ward" style="font-size:12px;max-width:140px">
          <option value="">All wards</option>
          ${_wards.map(w=>`<option value="${w.ward_number}">Ward ${w.ward_number}${w.area_name?' — '+w.area_name:''}</option>`).join('')}
        </select>
        <select class="fl-sel" id="idp-filter-status" style="font-size:12px;max-width:170px">
          <option value="">All statuses</option>
          ${STATUSES.map(s=>`<option>${s}</option>`).join('')}
        </select>
        <button class="btn btn-sm" id="idp-filter-btn">Filter</button>
        <button class="btn btn-sm" id="idp-clear-btn">Clear</button>
      </div>

      <div id="idp-form-area" style="flex-shrink:0"></div>
      <div id="idp-library-area" style="flex-shrink:0"></div>
      <div style="flex:1;overflow-y:auto;padding:16px 20px" id="idp-mit-list">
        ${renderMitList(mits||[])}
      </div>
    </div>`;

  document.getElementById('idp-add-btn')?.addEventListener('click', () => showMitForm(null));
  document.getElementById('idp-library-btn')?.addEventListener('click', () => showLibrary(mits||[]));
  document.getElementById('idp-email-btn')?.addEventListener('click', () => emailReport(mits||[]));
  document.getElementById('idp-filter-btn')?.addEventListener('click', () => applyFilters(mits||[]));
  document.getElementById('idp-clear-btn')?.addEventListener('click', async () => { await renderIDP(); });
  bindMitEvents(mits||[]);
}

function renderMitList(mits) {
  if (!mits.length) return `<div style="text-align:center;padding:48px;color:var(--text3);font-size:13px">
    No mitigations yet. Click <strong style="color:var(--text)">+ Add mitigation</strong> or use <strong style="color:var(--text)">Library suggestions</strong>.</div>`;

  const statusCls = {
    'proposed':'b-gray','linked-awaiting':'b-amber','linked-funded':'b-green',
    'under-review':'b-blue','in-progress':'b-blue','completed':'b-green'
  };
  const statusLabel = {
    'proposed':'Proposed','linked-awaiting':'Awaiting funding','linked-funded':'Funded',
    'under-review':'Under review','in-progress':'In progress','completed':'Completed'
  };

  return mits.map(m => {
    const wardLabels = (Array.isArray(m.affected_wards) && m.affected_wards.length)
      ? m.affected_wards.map(w => { const wd=_wards.find(x=>x.ward_number==w); return `Ward ${w}${wd?.area_name?' ('+wd.area_name+')':''}`; }).join(', ')
      : 'No wards specified';
    const riskCls = m.risk_band==='Extremely High'?'b-red':m.risk_band==='High'?'b-amber':m.risk_band==='Tolerable'?'b-green':'b-gray';

    return `
      <div class="rec-card" style="margin-bottom:12px" id="mit-card-${m.id}">
        <div class="rec-head" style="flex-wrap:wrap;gap:8px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;gap:6px;margin-bottom:5px;flex-wrap:wrap">
              <span class="badge ${riskCls}" style="font-size:9px">${m.hazard_name||'—'}</span>
              <span class="badge ${statusCls[m.idp_status]||'b-gray'}" style="font-size:9px">${statusLabel[m.idp_status]||m.idp_status||'Proposed'}</span>
              ${m.idp_kpa?`<span class="badge b-blue" style="font-size:9px">${m.idp_kpa.split(' — ')[0]}</span>`:''}
              <span style="font-size:10px;color:var(--text3)">${m.mitigation_type||''}</span>
            </div>
            <div style="font-size:13px;font-weight:600;color:var(--text);line-height:1.4">${m.description}</div>
          </div>
          <div style="display:flex;gap:5px;flex-shrink:0;flex-wrap:wrap">
            <button class="btn btn-sm mit-edit" data-id="${m.id}">Edit</button>
            <button class="btn btn-sm" onclick="window._downloadMit('${m.id}')">↓</button>
            <button class="btn btn-sm btn-red mit-delete" data-id="${m.id}">✕</button>
          </div>
        </div>
        ${m.specific_location?`
          <div style="padding:8px 16px;background:var(--bg3);border-top:1px solid var(--border);display:flex;gap:8px;align-items:flex-start">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="var(--red)" stroke-width="1.5" stroke-linecap="round" style="margin-top:2px;flex-shrink:0"><circle cx="7" cy="6" r="2.5"/><path d="M7 14C7 14 2 9 2 6a5 5 0 0110 0c0 3-5 8-5 8z"/></svg>
            <div>
              <div style="font-size:12px;color:var(--text2)">${m.specific_location}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">${wardLabels}</div>
            </div>
          </div>` : `<div style="padding:5px 16px;border-top:1px solid var(--border);font-size:11px;color:var(--text3)">${wardLabels}</div>`}
        <div style="padding:10px 16px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px 14px">
          <div class="rf"><span class="rf-key">DRR strategy</span><span class="rf-val">${m.drr_strategy||'—'}</span></div>
          <div class="rf"><span class="rf-key">Timeframe</span><span class="rf-val">${m.timeframe||'—'}</span></div>
          <div class="rf"><span class="rf-key">Cost estimate</span><span class="rf-val">${m.cost_estimate||'—'}</span></div>
          <div class="rf"><span class="rf-key">Responsible</span><span class="rf-val">${m.responsible_owner||'—'}</span></div>
          ${m.idp_vote_number?`<div class="rf"><span class="rf-key">Vote number</span><span class="rf-val" style="font-family:monospace">${m.idp_vote_number}</span></div>`:''}
          ${m.legislation_ref?`<div class="rf" style="grid-column:span 2"><span class="rf-key">Legislation</span><span class="rf-val">${m.legislation_ref}</span></div>`:''}
        </div>
      </div>`;
  }).join('');
}

function showMitForm(existing) {
  const area = document.getElementById('idp-form-area');
  if (!area) return;
  if (area.innerHTML && !existing) { area.innerHTML=''; return; }

  const m = existing || {};
  const wardOpts = _wards.map(w =>
    `<option value="${w.ward_number}" ${(m.affected_wards||[]).includes(w.ward_number)?'selected':''}>Ward ${w.ward_number}${w.area_name?' — '+w.area_name:''}</option>`
  ).join('');

  area.innerHTML = `
    <div style="background:var(--bg2);border-bottom:2px solid var(--red);padding:20px;border-top:1px solid var(--border)">
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:16px">${existing?'Edit mitigation':'Add mitigation'}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="fl">
          <span class="fl-label">Hazard</span>
          <select class="fl-sel" id="mf-hazard">
            <option value="">— Select —</option>
            ${_hazards.map(h=>`<option value="${h.hazard_name}" ${m.hazard_name===h.hazard_name?'selected':''}>${h.hazard_name} (${h.risk_band||'?'})</option>`).join('')}
            <option value="__custom__" ${m.hazard_name&&!_hazards.find(h=>h.hazard_name===m.hazard_name)?'selected':''}>Custom</option>
          </select>
          <input class="fl-input" id="mf-hazard-custom" placeholder="Custom hazard name"
            value="${m.hazard_name&&!_hazards.find(h=>h.hazard_name===m.hazard_name)?m.hazard_name:''}"
            style="display:${m.hazard_name&&!_hazards.find(h=>h.hazard_name===m.hazard_name)?'block':'none'};margin-top:4px"/>
        </div>
        <div class="fl">
          <span class="fl-label">Ward(s) affected</span>
          <select class="fl-sel" id="mf-wards" multiple style="min-height:72px;font-size:12px">${wardOpts}</select>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">Ctrl/Cmd to select multiple</div>
        </div>
        <div class="fl">
          <span class="fl-label">Mitigation type</span>
          <select class="fl-sel" id="mf-type">${MIT_TYPES.map(t=>`<option ${m.mitigation_type===t?'selected':''}>${t}</option>`).join('')}</select>
        </div>
      </div>
      <div class="fl" style="margin-bottom:12px">
        <span class="fl-label">Specific location <span style="color:var(--text3);font-size:10px;font-weight:400">Street, river, bridge, landmark, GPS</span></span>
        <input class="fl-input" id="mf-location" value="${m.specific_location||''}"
          placeholder="e.g. Van Riebeeck Street bridge over Grobbelaarsrivier, Ward 4"/>
      </div>
      <div class="fl" style="margin-bottom:12px">
        <span class="fl-label">Intervention description <span style="color:var(--text3);font-size:10px;font-weight:400">Detail for project brief or IDP entry</span></span>
        <textarea class="fl-textarea" id="mf-desc" rows="3" style="min-height:72px">${m.description||''}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="fl"><span class="fl-label">IDP KPA</span>
          <select class="fl-sel" id="mf-kpa">
            <option value="">— Select —</option>
            ${IDP_KPAS.map((k,i)=>`<option value="${k}" ${m.idp_kpa===k?'selected':''}>${k}</option>`).join('')}
          </select>
        </div>
        <div class="fl"><span class="fl-label">Vote / project number</span><input class="fl-input" id="mf-vote" value="${m.idp_vote_number||''}" placeholder="e.g. 3/4/5/2"/></div>
        <div class="fl"><span class="fl-label">Status</span>
          <select class="fl-sel" id="mf-status">
            ${STATUSES.map(s=>{const v=s.toLowerCase().replace(/\s|—/g,'-').replace(/--+/g,'-');return `<option value="${v}" ${m.idp_status===v?'selected':''}>${s}</option>`}).join('')}
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="fl"><span class="fl-label">DRR strategy</span><select class="fl-sel" id="mf-drr">${DRR.map(s=>`<option ${m.drr_strategy===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="fl"><span class="fl-label">Timeframe</span><select class="fl-sel" id="mf-tf">${TIMEFRAMES.map(t=>`<option ${m.timeframe===t?'selected':''}>${t}</option>`).join('')}</select></div>
        <div class="fl"><span class="fl-label">Cost estimate</span><input class="fl-input" id="mf-cost" value="${m.cost_estimate||''}" placeholder="e.g. R 2.4 million"/></div>
        <div class="fl"><span class="fl-label">Responsible</span><input class="fl-input" id="mf-owner" value="${m.responsible_owner||''}" placeholder="Dept / Organisation"/></div>
      </div>
      <div class="fl" style="margin-bottom:12px">
        <span class="fl-label">Legislation / policy reference</span>
        <input class="fl-input" id="mf-legislation" value="${m.legislation_ref||''}" placeholder="e.g. National Water Act 36 of 1998"/>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-green btn-sm" id="mf-save-btn" data-id="${m.id||''}">Save mitigation</button>
        <button class="btn btn-sm" onclick="document.getElementById('idp-form-area').innerHTML=''">Cancel</button>
      </div>
    </div>`;

  document.getElementById('mf-hazard')?.addEventListener('change', function() {
    const custom = document.getElementById('mf-hazard-custom');
    if (custom) custom.style.display = this.value==='__custom__'?'block':'none';
  });
  document.getElementById('mf-save-btn')?.addEventListener('click', saveMit);
}

async function saveMit() {
  const hSel   = document.getElementById('mf-hazard')?.value;
  const hazard = hSel==='__custom__'
    ? (document.getElementById('mf-hazard-custom')?.value.trim()||'')
    : hSel;
  const desc   = document.getElementById('mf-desc')?.value.trim();
  const id     = document.getElementById('mf-save-btn')?.dataset.id;

  if (!hazard) { alert('Please select a hazard.'); return; }
  if (!desc)   { alert('Please enter a description.'); return; }

  const wardSel = document.getElementById('mf-wards');
  const wards   = wardSel ? [...wardSel.selectedOptions].map(o=>parseInt(o.value)) : [];
  const hData   = _hazards.find(h=>h.hazard_name===hazard);

  const btn = document.getElementById('mf-save-btn');
  if (btn) { btn.textContent='Saving…'; btn.disabled=true; }

  const payload = {
    municipality_id:   _muniId,
    hazard_name:       hazard,
    hazard_category:   hData?.hazard_category||null,
    risk_band:         hData?.risk_band||null,
    mitigation_type:   document.getElementById('mf-type')?.value,
    description:       desc,
    specific_location: document.getElementById('mf-location')?.value.trim(),
    affected_wards:    wards,
    idp_kpa:           document.getElementById('mf-kpa')?.value,
    idp_vote_number:   document.getElementById('mf-vote')?.value.trim(),
    idp_status:        document.getElementById('mf-status')?.value||'proposed',
    drr_strategy:      document.getElementById('mf-drr')?.value,
    timeframe:         document.getElementById('mf-tf')?.value,
    cost_estimate:     document.getElementById('mf-cost')?.value.trim(),
    responsible_owner: document.getElementById('mf-owner')?.value.trim(),
    legislation_ref:   document.getElementById('mf-legislation')?.value.trim(),
    is_library:        false
  };

  const { error } = id
    ? await supabase.from('mitigations').update(payload).eq('id',id)
    : await supabase.from('mitigations').insert(payload);

  if (error) { showToast(error.message, true); if(btn){btn.textContent='Save mitigation';btn.disabled=false;} return; }

  showToast('✓ Mitigation saved successfully!');
  document.getElementById('idp-form-area').innerHTML = '';
  await renderIDP();
}

async function showLibrary() {
  const area = document.getElementById('idp-library-area');
  if (!area) return;
  if (area.innerHTML) { area.innerHTML=''; return; }

  const names = _hazards.map(h=>h.hazard_name);
  const { data: suggestions } = await supabase
    .from('mitigations').select('*').eq('is_library',true)
    .in('hazard_name', names.length ? names : ['__none__']);

  area.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-left:3px solid var(--blue);padding:16px 20px;border-top:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:var(--text)">Library suggestions for your assessed hazards</div>
        <button class="btn btn-sm" onclick="document.getElementById('idp-library-area').innerHTML=''">Close</button>
      </div>
      ${suggestions?.length ? suggestions.map(s=>`
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;display:flex;align-items:flex-start;gap:12px">
          <div style="flex:1">
            <div style="display:flex;gap:6px;margin-bottom:4px;flex-wrap:wrap">
              <span class="badge b-blue" style="font-size:9px">${s.hazard_name}</span>
              <span class="badge b-gray" style="font-size:9px">${s.mitigation_type}</span>
              ${s.idp_kpa?`<span class="badge b-purple" style="font-size:9px">${s.idp_kpa.split(' — ')[0]}</span>`:''}
            </div>
            <div style="font-size:12px;color:var(--text2);line-height:1.5">${s.description}</div>
            ${s.legislation_ref?`<div style="font-size:11px;color:var(--text3);margin-top:3px">${s.legislation_ref}</div>`:''}
            ${s.cost_estimate?`<div style="font-size:11px;color:var(--text3)">${s.cost_estimate}</div>`:''}
          </div>
          <button class="btn btn-sm btn-green" style="flex-shrink:0" data-lib='${JSON.stringify({
            hazard_name:s.hazard_name,description:s.description,
            mitigation_type:s.mitigation_type,idp_kpa:s.idp_kpa,
            legislation_ref:s.legislation_ref,drr_strategy:s.drr_strategy,
            cost_estimate:s.cost_estimate
          }).replace(/'/g,"&#39;")}'>+ Add</button>
        </div>`).join('')
      : '<div style="font-size:12px;color:var(--text3)">No library suggestions for your assessed hazards. Complete an HVC assessment first.</div>'}
    </div>`;

  area.querySelectorAll('[data-lib]').forEach(btn => {
    btn.addEventListener('click', () => {
      const data = JSON.parse(btn.dataset.lib);
      area.innerHTML = '';
      showMitForm(data);
    });
  });
}

function emailReport(mits) {
  const muniName = _user?.municipalities?.name || 'Municipality';
  const lines = [`IDP MITIGATION REGISTER — ${muniName}`, `Generated: ${new Date().toLocaleString('en-ZA')}`, ''];
  mits.forEach((m,i) => {
    lines.push(`${i+1}. ${m.hazard_name} — ${m.description}`);
    if (m.specific_location) lines.push(`   Location: ${m.specific_location}`);
    if (m.affected_wards?.length) lines.push(`   Wards: ${m.affected_wards.join(', ')}`);
    if (m.idp_kpa) lines.push(`   ${m.idp_kpa}`);
    if (m.idp_vote_number) lines.push(`   Vote: ${m.idp_vote_number}`);
    if (m.cost_estimate) lines.push(`   Cost: ${m.cost_estimate}`);
    if (m.responsible_owner) lines.push(`   Responsible: ${m.responsible_owner}`);
    lines.push('');
  });
  const subject = encodeURIComponent(`IDP Mitigation Register — ${muniName}`);
  const body    = encodeURIComponent(lines.join('\n'));
  window.open(`mailto:?subject=${subject}&body=${body}`);
}

function applyFilters(all) {
  const hazard = document.getElementById('idp-filter-hazard')?.value;
  const ward   = document.getElementById('idp-filter-ward')?.value;
  const status = document.getElementById('idp-filter-status')?.value;
  let f = all;
  if (hazard) f=f.filter(m=>m.hazard_name===hazard);
  if (ward)   f=f.filter(m=>Array.isArray(m.affected_wards)&&m.affected_wards.includes(parseInt(ward)));
  if (status) f=f.filter(m=>m.idp_status?.toLowerCase().includes(status.toLowerCase().split(' ')[0]));
  document.getElementById('idp-mit-list').innerHTML = renderMitList(f);
  bindMitEvents(f);
}

function bindMitEvents(mits) {
  document.querySelectorAll('.mit-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this mitigation?')) return;
      await supabase.from('mitigations').delete().eq('id',btn.dataset.id);
      showToast('Deleted');
      await renderIDP();
    });
  });
  document.querySelectorAll('.mit-edit').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { data:m } = await supabase.from('mitigations').select('*').eq('id',btn.dataset.id).single();
      if (m) showMitForm(m);
    });
  });
}

window._downloadMit = function(id) {
  const el = document.getElementById(`mit-card-${id}`);
  const text = el ? el.innerText : 'Mitigation record';
  const blob = new Blob([text], { type:'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href:url, download:`DRMSA-mitigation-${id}.txt` });
  a.click(); URL.revokeObjectURL(url);
};
