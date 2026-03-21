// js/idp.js — IDP Linkage & Mitigation Register with spatial specificity
import { supabase } from './supabase.js';

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

const DRR_STRATEGIES = ['Treat/Mitigate','Tolerate/Accept','Transfer/Share','Terminate/Prevent'];
const TIMEFRAMES      = ['Short term (< 1 year)','Medium term (1–3 years)','Long term (3–5 years)'];
const MIT_TYPES       = ['Structural','Non-structural','Policy/Plan','Awareness/Training'];
const STATUSES        = ['Proposed','Linked — awaiting funding','Linked — funded','Under review','In progress','Completed'];

export async function initIDP(user) {
  _user   = user;
  _muniId = user?.municipality_id;

  const [wardsRes, hazardsRes] = await Promise.all([
    supabase.from('wards').select('ward_number,area_name').eq('municipality_id', _muniId).order('ward_number'),
    supabase.from('hvc_hazard_scores').select('hazard_name,hazard_category,risk_band,risk_rating')
      .eq('municipality_id', _muniId).order('risk_rating', { ascending: false })
  ]);

  _wards   = wardsRes.data  || [];
  _hazards = hazardsRes.data || [];

  // Deduplicate hazards by name
  const seen = new Set();
  _hazards = _hazards.filter(h => { if (seen.has(h.hazard_name)) return false; seen.add(h.hazard_name); return true; });

  await renderIDP();
}

async function renderIDP() {
  const page = document.getElementById('page-idp');
  if (!page) return;

  const { data: mitigations } = await supabase
    .from('mitigations')
    .select('*')
    .eq('municipality_id', _muniId)
    .eq('is_library', false)
    .order('created_at', { ascending: false });

  // Stats
  const total    = mitigations?.length || 0;
  const funded   = mitigations?.filter(m => m.idp_status === 'linked-funded').length || 0;
  const awaiting = mitigations?.filter(m => m.idp_status === 'linked-awaiting').length || 0;
  const proposed = mitigations?.filter(m => m.idp_status === 'proposed').length || 0;

  page.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <div style="padding:12px 20px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--text)">IDP Linkage & Mitigation Register</div>
          <div style="font-size:11px;color:var(--text3);margin-top:1px">Spatial mitigations linked to IDP projects and budget votes</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" id="view-library-btn">Library suggestions</button>
          <button class="btn btn-red btn-sm" id="add-mit-btn">+ Add mitigation</button>
        </div>
      </div>

      <!-- Stats -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 20px;background:var(--bg);border-bottom:1px solid var(--border);flex-shrink:0">
        <div class="stat-box"><div class="stat-lbl">Total mitigations</div><div class="stat-num blue">${total}</div></div>
        <div class="stat-box"><div class="stat-lbl">Funded</div><div class="stat-num green">${funded}</div></div>
        <div class="stat-box"><div class="stat-lbl">Awaiting funding</div><div class="stat-num amber">${awaiting}</div></div>
        <div class="stat-box"><div class="stat-lbl">Proposed</div><div class="stat-num" style="color:var(--text3)">${proposed}</div></div>
      </div>

      <!-- Filters -->
      <div style="display:flex;gap:8px;padding:12px 20px;background:var(--bg);border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap">
        <select class="fl-sel" id="filter-hazard" style="font-size:12px;width:200px">
          <option value="">All hazards</option>
          ${_hazards.map(h=>`<option value="${h.hazard_name}">${h.hazard_name}</option>`).join('')}
        </select>
        <select class="fl-sel" id="filter-ward" style="font-size:12px;width:160px">
          <option value="">All wards</option>
          ${_wards.map(w=>`<option value="${w.ward_number}">Ward ${w.ward_number}${w.area_name?' — '+w.area_name:''}</option>`).join('')}
        </select>
        <select class="fl-sel" id="filter-status" style="font-size:12px;width:180px">
          <option value="">All statuses</option>
          ${STATUSES.map(s=>`<option>${s}</option>`).join('')}
        </select>
        <select class="fl-sel" id="filter-kpa" style="font-size:12px;width:120px">
          <option value="">All KPAs</option>
          ${IDP_KPAS.map((k,i)=>`<option value="KPA ${i+1}">KPA ${i+1}</option>`).join('')}
        </select>
        <button class="btn btn-sm" id="apply-filters-btn">Filter</button>
      </div>

      <!-- Add form area -->
      <div id="add-mit-area" style="flex-shrink:0"></div>

      <!-- Library suggestions area -->
      <div id="library-area" style="flex-shrink:0"></div>

      <!-- Register -->
      <div style="flex:1;overflow-y:auto;padding:16px 20px" id="mit-list">
        ${renderMitigationList(mitigations || [])}
      </div>
    </div>`;

  document.getElementById('add-mit-btn')?.addEventListener('click', () => showAddForm());
  document.getElementById('view-library-btn')?.addEventListener('click', () => showLibrarySuggestions());
  document.getElementById('apply-filters-btn')?.addEventListener('click', () => applyFilters(mitigations || []));
  bindMitEvents(mitigations || []);
}

// ── ADD MITIGATION FORM ───────────────────────────────────
function showAddForm(prefill = {}) {
  const area = document.getElementById('add-mit-area');
  if (!area) return;
  if (area.innerHTML && !prefill.hazard_name) { area.innerHTML = ''; return; }

  const wardOpts = _wards.length
    ? _wards.map(w => `<option value="${w.ward_number}" ${prefill.ward == w.ward_number ? 'selected' : ''}>Ward ${w.ward_number}${w.area_name ? ' — ' + w.area_name : ''}</option>`).join('')
    : Array.from({ length: _user?.municipalities?.ward_count || 0 }, (_, i) =>
        `<option value="${i+1}">Ward ${i+1}</option>`).join('');

  area.innerHTML = `
    <div style="background:var(--bg2);border-bottom:2px solid var(--red);padding:20px;border-top:1px solid var(--border)">
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:16px">
        ${prefill.hazard_name ? 'Add mitigation from library' : 'Add mitigation to register'}
      </div>

      <!-- Hazard & location -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="fl">
          <span class="fl-label">Hazard addressed</span>
          <select class="fl-sel" id="mit-hazard">
            <option value="">— Select hazard —</option>
            ${_hazards.map(h=>`<option value="${h.hazard_name}" ${prefill.hazard_name===h.hazard_name?'selected':''}>${h.hazard_name} (${h.risk_band||'?'})</option>`).join('')}
            <option value="__custom__">Custom / not in assessment</option>
          </select>
          <input class="fl-input" id="mit-hazard-custom" placeholder="Custom hazard name" style="display:none;margin-top:4px"/>
        </div>
        <div class="fl">
          <span class="fl-label">Ward(s) affected</span>
          <select class="fl-sel" id="mit-wards" multiple style="min-height:68px;font-size:12px">
            ${wardOpts || '<option value="">No wards — set ward count in admin</option>'}
          </select>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">Ctrl/Cmd to select multiple</div>
        </div>
        <div class="fl">
          <span class="fl-label">Mitigation type</span>
          <select class="fl-sel" id="mit-type">
            ${MIT_TYPES.map(t=>`<option ${prefill.mitigation_type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Specific location -->
      <div class="fl" style="margin-bottom:12px">
        <span class="fl-label">
          Specific location
          <span style="color:var(--text3);font-size:10px;font-weight:400">Be precise — street name, river, landmark, GPS, or area within the ward</span>
        </span>
        <input class="fl-input" id="mit-location" value="${prefill.location||''}"
          placeholder="e.g. Van Riebeeck Street bridge over Grobbelaarsrivier, Ward 4 — or — Northern boundary of Raubenheimer Dam, Ward 7 & 8"/>
      </div>

      <!-- Intervention -->
      <div class="fl" style="margin-bottom:12px">
        <span class="fl-label">
          Intervention description
          <span style="color:var(--text3);font-size:10px;font-weight:400">Enough detail for a project brief or IDP entry</span>
        </span>
        <textarea class="fl-textarea" id="mit-description" rows="3"
          placeholder="e.g. Raise bridge deck by 800mm and replace existing 600mm culverts with 1200mm steel culverts to accommodate 1:50 year flood event. Design to SANS 10160 loading standard."
          style="min-height:72px">${prefill.description||''}</textarea>
      </div>

      <!-- IDP linkage -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="fl">
          <span class="fl-label">IDP KPA</span>
          <select class="fl-sel" id="mit-kpa">
            <option value="">— Select KPA —</option>
            ${IDP_KPAS.map((k,i)=>`<option value="KPA ${i+1}" ${prefill.idp_kpa?.includes('KPA '+(i+1))?'selected':''}>${k}</option>`).join('')}
          </select>
        </div>
        <div class="fl">
          <span class="fl-label">IDP project / vote number</span>
          <input class="fl-input" id="mit-vote" value="${prefill.idp_vote_number||''}" placeholder="e.g. 3/4/5/2 or P2024-047"/>
        </div>
        <div class="fl">
          <span class="fl-label">Status</span>
          <select class="fl-sel" id="mit-status">
            ${STATUSES.map(s=>`<option value="${s.toLowerCase().replace(/\s|—/g,'-')}" ${prefill.idp_status===s.toLowerCase().replace(/\s|—/g,'-')?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div class="fl">
          <span class="fl-label">DRR strategy</span>
          <select class="fl-sel" id="mit-drr">
            ${DRR_STRATEGIES.map(s=>`<option ${prefill.drr_strategy===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="fl">
          <span class="fl-label">Timeframe</span>
          <select class="fl-sel" id="mit-timeframe">
            ${TIMEFRAMES.map(t=>`<option>${t}</option>`).join('')}
          </select>
        </div>
        <div class="fl">
          <span class="fl-label">Cost estimate</span>
          <input class="fl-input" id="mit-cost" value="${prefill.cost_estimate||''}" placeholder="e.g. R 2.4 million"/>
        </div>
        <div class="fl">
          <span class="fl-label">Responsible dept/org</span>
          <input class="fl-input" id="mit-owner" value="${prefill.responsible_owner||''}" placeholder="e.g. Public Works / SANRAL"/>
        </div>
      </div>

      <div class="fl" style="margin-bottom:12px">
        <span class="fl-label">Legislation / policy reference</span>
        <input class="fl-input" id="mit-legislation" value="${prefill.legislation_ref||''}" placeholder="e.g. National Water Act 36 of 1998 s.21; SPLUMA"/>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-green btn-sm" id="save-mit-btn">Save mitigation</button>
        <button class="btn btn-sm" onclick="document.getElementById('add-mit-area').innerHTML=''">Cancel</button>
      </div>
    </div>`;

  // Show custom hazard input
  document.getElementById('mit-hazard')?.addEventListener('change', function() {
    const custom = document.getElementById('mit-hazard-custom');
    if (custom) custom.style.display = this.value === '__custom__' ? 'block' : 'none';
  });

  document.getElementById('save-mit-btn')?.addEventListener('click', saveMitigation);
}

async function saveMitigation() {
  const hazardSel = document.getElementById('mit-hazard')?.value;
  const hazard    = hazardSel === '__custom__'
    ? (document.getElementById('mit-hazard-custom')?.value.trim() || '')
    : hazardSel;
  const desc      = document.getElementById('mit-description')?.value.trim();

  if (!hazard) { alert('Please select or enter a hazard.'); return; }
  if (!desc)   { alert('Please enter an intervention description.'); return; }

  const wardSel = document.getElementById('mit-wards');
  const wards   = wardSel ? [...wardSel.selectedOptions].map(o => parseInt(o.value)) : [];

  const location   = document.getElementById('mit-location')?.value.trim();
  const kpa        = document.getElementById('mit-kpa')?.value;
  const vote       = document.getElementById('mit-vote')?.value.trim();
  const statusVal  = document.getElementById('mit-status')?.value;
  const drr        = document.getElementById('mit-drr')?.value;
  const timeframe  = document.getElementById('mit-timeframe')?.value;
  const cost       = document.getElementById('mit-cost')?.value.trim();
  const owner      = document.getElementById('mit-owner')?.value.trim();
  const mitType    = document.getElementById('mit-type')?.value;
  const legislation= document.getElementById('mit-legislation')?.value.trim();

  const hazardData = _hazards.find(h => h.hazard_name === hazard);

  const btn = document.getElementById('save-mit-btn');
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  const { error } = await supabase.from('mitigations').insert({
    municipality_id:   _muniId,
    hazard_name:       hazard,
    hazard_category:   hazardData?.hazard_category || null,
    risk_band:         hazardData?.risk_band || null,
    mitigation_type:   mitType,
    description:       desc,
    specific_location: location,
    affected_wards:    wards,
    idp_kpa:           kpa,
    idp_vote_number:   vote,
    idp_status:        statusVal || 'proposed',
    drr_strategy:      drr,
    timeframe:         timeframe,
    cost_estimate:     cost,
    responsible_owner: owner,
    legislation_ref:   legislation,
    is_library:        false
  });

  if (error) {
    showToast('Error: ' + error.message, true);
    if (btn) { btn.textContent = 'Save mitigation'; btn.disabled = false; }
    return;
  }

  document.getElementById('add-mit-area').innerHTML = '';
  showToast('Mitigation saved');
  await renderIDP();
}

// ── MITIGATION LIST ───────────────────────────────────────
function renderMitigationList(mitigations) {
  if (!mitigations.length) {
    return `<div style="text-align:center;padding:48px 20px;color:var(--text3);font-size:13px">
      No mitigations registered yet.<br>
      Click <strong style="color:var(--text)">+ Add mitigation</strong> to start building your spatial mitigation register,<br>
      or use <strong style="color:var(--text)">Library suggestions</strong> to import pre-built mitigations for your hazards.
    </div>`;
  }

  return mitigations.map(m => {
    const wardLabels = Array.isArray(m.affected_wards) && m.affected_wards.length
      ? m.affected_wards.map(w => {
          const ward = _wards.find(wd => wd.ward_number == w);
          return `Ward ${w}${ward?.area_name ? ' (' + ward.area_name + ')' : ''}`;
        }).join(', ')
      : 'No wards specified';

    const statusColour = {
      'proposed':              'b-gray',
      'linked---awaiting-funding': 'b-amber',
      'linked---funded':       'b-green',
      'under-review':          'b-blue',
      'in-progress':           'b-blue',
      'completed':             'b-green'
    };
    const statusLabel = {
      'proposed':              'Proposed',
      'linked---awaiting-funding': 'Awaiting funding',
      'linked---funded':       'Funded',
      'under-review':          'Under review',
      'in-progress':           'In progress',
      'completed':             'Completed'
    };

    return `
      <div class="rec-card" style="margin-bottom:12px" id="mit-${m.id}">
        <div class="rec-head">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
              <span class="badge b-${m.risk_band==='Extremely High'?'red':m.risk_band==='High'?'amber':m.risk_band==='Tolerable'?'green':'gray'}" style="font-size:9px">${m.hazard_name||'Unknown hazard'}</span>
              <span class="badge ${statusColour[m.idp_status]||'b-gray'}" style="font-size:9px">${statusLabel[m.idp_status]||m.idp_status||'Proposed'}</span>
              ${m.idp_kpa ? `<span class="badge b-blue" style="font-size:9px">${m.idp_kpa}</span>` : ''}
              <span style="font-size:10px;color:var(--text3)">${m.mitigation_type||''}</span>
            </div>
            <div style="font-size:13px;font-weight:600;color:var(--text);line-height:1.4">${m.description}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-sm edit-mit-btn" data-id="${m.id}">Edit</button>
            <button class="btn btn-sm btn-red delete-mit-btn" data-id="${m.id}">Delete</button>
          </div>
        </div>

        <!-- Location + wards -->
        ${m.specific_location ? `
          <div style="padding:8px 16px;background:var(--bg3);border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:8px">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="var(--red)" stroke-width="1.5" stroke-linecap="round" style="margin-top:2px;flex-shrink:0"><circle cx="7" cy="6" r="3"/><path d="M7 14C7 14 2 9.5 2 6a5 5 0 0110 0c0 3.5-5 8-5 8z"/></svg>
            <div>
              <div style="font-size:12px;color:var(--text2)">${m.specific_location}</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">${wardLabels}</div>
            </div>
          </div>` : `
          <div style="padding:6px 16px;border-bottom:1px solid var(--border)">
            <div style="font-size:11px;color:var(--text3)">${wardLabels}</div>
          </div>`}

        <!-- Detail grid -->
        <div style="padding:10px 16px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px 16px">
          <div class="rf"><span class="rf-key">DRR strategy</span><span class="rf-val">${m.drr_strategy||'—'}</span></div>
          <div class="rf"><span class="rf-key">Timeframe</span><span class="rf-val">${m.timeframe||'—'}</span></div>
          <div class="rf"><span class="rf-key">Cost estimate</span><span class="rf-val">${m.cost_estimate||'—'}</span></div>
          <div class="rf"><span class="rf-key">Responsible</span><span class="rf-val">${m.responsible_owner||'—'}</span></div>
          ${m.idp_vote_number ? `<div class="rf"><span class="rf-key">Vote number</span><span class="rf-val" style="font-family:monospace">${m.idp_vote_number}</span></div>` : ''}
          ${m.legislation_ref ? `<div class="rf" style="grid-column:span 2"><span class="rf-key">Legislation</span><span class="rf-val">${m.legislation_ref}</span></div>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ── LIBRARY SUGGESTIONS ───────────────────────────────────
async function showLibrarySuggestions() {
  const area = document.getElementById('library-area');
  if (!area) return;
  if (area.innerHTML) { area.innerHTML = ''; return; }

  // Get library mitigations matching our assessed hazards
  const hazardNames = _hazards.map(h => h.hazard_name);
  let query = supabase.from('mitigations').select('*').eq('is_library', true);

  if (hazardNames.length) {
    query = query.in('hazard_name', hazardNames);
  }

  const { data: suggestions } = await query.order('hazard_name');

  area.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border2);border-left:3px solid var(--blue);padding:16px 20px;border-top:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:var(--text)">Library suggestions for your assessed hazards</div>
        <button class="btn btn-sm" onclick="document.getElementById('library-area').innerHTML=''">Close</button>
      </div>
      ${suggestions?.length ? suggestions.map(s => `
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;display:flex;align-items:flex-start;gap:12px">
          <div style="flex:1">
            <div style="display:flex;gap:6px;margin-bottom:4px;flex-wrap:wrap">
              <span class="badge b-blue" style="font-size:9px">${s.hazard_name}</span>
              <span class="badge b-gray" style="font-size:9px">${s.mitigation_type}</span>
              ${s.idp_kpa ? `<span class="badge b-purple" style="font-size:9px">${s.idp_kpa}</span>` : ''}
            </div>
            <div style="font-size:12px;color:var(--text2);line-height:1.5">${s.description}</div>
            ${s.legislation_ref ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">${s.legislation_ref}</div>` : ''}
            ${s.cost_estimate ? `<div style="font-size:11px;color:var(--text3)">${s.cost_estimate}</div>` : ''}
          </div>
          <button class="btn btn-sm btn-green" style="flex-shrink:0"
            onclick="importLibraryMit(${JSON.stringify(s).replace(/"/g,'&quot;')})">
            + Add to register
          </button>
        </div>`).join('')
      : '<div style="font-size:12px;color:var(--text3)">No library suggestions match your assessed hazards. Complete an HVC assessment first.</div>'}
    </div>`;
}

window.importLibraryMit = function(s) {
  document.getElementById('library-area').innerHTML = '';
  showAddForm({
    hazard_name:     s.hazard_name,
    description:     s.description,
    mitigation_type: s.mitigation_type,
    idp_kpa:         s.idp_kpa,
    legislation_ref: s.legislation_ref,
    drr_strategy:    s.drr_strategy,
    cost_estimate:   s.cost_estimate
  });
};

// ── FILTERS ───────────────────────────────────────────────
function applyFilters(all) {
  const hazard = document.getElementById('filter-hazard')?.value;
  const ward   = document.getElementById('filter-ward')?.value;
  const status = document.getElementById('filter-status')?.value;
  const kpa    = document.getElementById('filter-kpa')?.value;

  let filtered = all;
  if (hazard) filtered = filtered.filter(m => m.hazard_name === hazard);
  if (ward)   filtered = filtered.filter(m => Array.isArray(m.affected_wards) && m.affected_wards.includes(parseInt(ward)));
  if (status) filtered = filtered.filter(m => m.idp_status?.includes(status.toLowerCase().replace(/\s/g,'-')));
  if (kpa)    filtered = filtered.filter(m => m.idp_kpa?.includes(kpa));

  const list = document.getElementById('mit-list');
  if (list) list.innerHTML = renderMitigationList(filtered);
  bindMitEvents(filtered);
}

function bindMitEvents(mitigations) {
  document.querySelectorAll('.delete-mit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this mitigation?')) return;
      await supabase.from('mitigations').delete().eq('id', btn.dataset.id);
      showToast('Deleted');
      await renderIDP();
    });
  });

  document.querySelectorAll('.edit-mit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { data: m } = await supabase.from('mitigations').select('*').eq('id', btn.dataset.id).single();
      if (m) showAddForm(m);
    });
  });
}

function showToast(msg, isError=false) {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:${isError?'var(--red-dim)':'var(--green-dim)'};border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:10px 16px;border-radius:6px;font-size:12px;font-family:monospace;font-weight:700;z-index:500`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},2500);
}
