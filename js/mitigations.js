import { supabase } from './supabase.js';

export async function initMitigations(user) {
  const page = document.getElementById('page-mitigations');
  if (!page) return;

  page.innerHTML = `
    <div class="page-body" style="padding:16px">
      <div class="card" style="padding:14px">
        <div class="h3">Mitigation Library</div>
        <div id="mitigations-meta" style="font-size:11px;color:var(--text3);margin-top:4px">Loading mitigation register…</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <input class="fl-input" id="mitigations-search" placeholder="Search intervention, hazard, KPA…" style="max-width:280px"/>
          <select class="fl-sel" id="mitigations-source-filter" style="max-width:180px">
            <option value="">All sources</option>
            <option value="municipal">Municipal</option>
            <option value="library">Library</option>
          </select>
        </div>
        <div style="margin-top:10px">
          <button class="btn btn-sm" id="mitigations-open-idp">Open IDP register</button>
        </div>
      </div>
      <div class="card" style="padding:0;margin-top:12px;overflow:hidden">
        <div id="mitigations-list"></div>
      </div>
    </div>
  `;

  document.getElementById('mitigations-open-idp')?.addEventListener('click', () => window._drmsaNavigate?.('idp'));

  const muniId = user?.municipality_id;
  const meta = document.getElementById('mitigations-meta');
  const list = document.getElementById('mitigations-list');
  if (!muniId || !meta || !list) return;

  const { data, error } = await supabase
    .from('mitigations')
    .select('id,hazard,intervention,kpa,status,is_library,updated_at')
    .eq('municipality_id', muniId)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) {
    meta.textContent = 'Could not load mitigation register.';
    list.innerHTML = `<div style="padding:14px;font-size:12px;color:var(--red)">⚠ ${error.message}</div>`;
    return;
  }

  const rows = data || [];
  const searchEl = document.getElementById('mitigations-search');
  const sourceEl = document.getElementById('mitigations-source-filter');

  function filteredRows() {
    const q = String(searchEl?.value || '').trim().toLowerCase();
    const source = sourceEl?.value || '';
    return rows.filter(row => {
      const hay = `${row.intervention || ''} ${row.hazard || ''} ${row.kpa || ''} ${row.status || ''}`.toLowerCase();
      const matchSearch = !q || hay.includes(q);
      const matchSource = !source || (source === 'library' ? !!row.is_library : !row.is_library);
      return matchSearch && matchSource;
    });
  }

  function renderList() {
    const filtered = filteredRows();
    const localRows = filtered.filter(r => !r.is_library);
    const libraryRows = filtered.filter(r => !!r.is_library);
    meta.textContent = `${localRows.length} municipal mitigations · ${libraryRows.length} library items`;

    if (!filtered.length) {
      list.innerHTML = `<div style="padding:16px;font-size:12px;color:var(--text3)">No mitigations match your filters.</div>`;
      return;
    }

    list.innerHTML = filtered.map((row) => `
      <div style="padding:12px 14px;border-bottom:1px solid var(--border);display:grid;gap:3px">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
          <div style="font-size:12px;font-weight:700;color:var(--text);min-width:0">${escapeHtml(row.intervention || 'Untitled mitigation')}</div>
          <span class="chip ${row.is_library ? 'chip-muted' : ''}" style="font-size:10px">${row.is_library ? 'Library' : 'Municipal'}</span>
        </div>
        <div style="font-size:11px;color:var(--text3)">Hazard: ${escapeHtml(row.hazard || '—')} · KPA: ${escapeHtml(row.kpa || '—')} · Status: ${escapeHtml(row.status || 'draft')}</div>
      </div>
    `).join('');
  }

  searchEl?.addEventListener('input', renderList);
  sourceEl?.addEventListener('change', renderList);
  renderList();
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
