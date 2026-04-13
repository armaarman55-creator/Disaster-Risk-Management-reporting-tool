import { supabase } from './supabase.js';

export async function initHistory(user) {
  const page = document.getElementById('page-history');
  if (!page) return;

  page.innerHTML = `
    <div class="page-body" style="padding:16px">
      <div class="card" style="padding:14px">
        <div class="h3">Assessment History</div>
        <div id="history-meta" style="font-size:11px;color:var(--text3);margin-top:4px">Loading assessments…</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <input class="fl-input" id="history-search" placeholder="Search label or lead assessor…" style="max-width:280px"/>
          <select class="fl-sel" id="history-season-filter" style="max-width:180px">
            <option value="">All seasons</option>
            <option value="Summer">Summer</option>
            <option value="Autumn">Autumn</option>
            <option value="Winter">Winter</option>
            <option value="Spring">Spring</option>
            <option value="Annual">Annual</option>
          </select>
        </div>
      </div>
      <div class="card" style="padding:0;margin-top:12px;overflow:hidden">
        <div id="history-list"></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
        <button class="btn btn-sm" id="history-prev">Previous</button>
        <button class="btn btn-sm" id="history-next">Next</button>
      </div>
    </div>
  `;

  const muniId = user?.municipality_id;
  const meta = document.getElementById('history-meta');
  const list = document.getElementById('history-list');
  if (!muniId || !list || !meta) return;

  const { data, error } = await supabase
    .from('hvc_assessments')
    .select('id,label,season,year,lead_assessor,created_at')
    .eq('municipality_id', muniId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    meta.textContent = 'Could not load assessment history.';
    list.innerHTML = `<div style="padding:14px;font-size:12px;color:var(--red)">⚠ ${error.message}</div>`;
    return;
  }

  const rows = data || [];
  const pageSize = 20;
  let pageIndex = 0;

  const searchEl = document.getElementById('history-search');
  const seasonEl = document.getElementById('history-season-filter');
  const prevBtn = document.getElementById('history-prev');
  const nextBtn = document.getElementById('history-next');

  function filteredRows() {
    const q = String(searchEl?.value || '').trim().toLowerCase();
    const season = seasonEl?.value || '';
    return rows.filter(row => {
      const hay = `${row.label || ''} ${row.lead_assessor || ''}`.toLowerCase();
      const matchSearch = !q || hay.includes(q);
      const matchSeason = !season || row.season === season;
      return matchSearch && matchSeason;
    });
  }

  function renderList() {
    const filtered = filteredRows();
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (pageIndex > totalPages - 1) pageIndex = totalPages - 1;
    const start = pageIndex * pageSize;
    const pageRows = filtered.slice(start, start + pageSize);
    meta.textContent = `${filtered.length} assessment${filtered.length === 1 ? '' : 's'} found`;

    if (!filtered.length) {
      list.innerHTML = `<div style="padding:16px;font-size:12px;color:var(--text3)">No assessments match your filters.</div>`;
    } else {
      list.innerHTML = pageRows.map((row, idx) => `
        <div style="padding:12px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div style="min-width:0">
            <div style="font-size:12px;font-weight:700;color:var(--text)">#${start + idx + 1} · ${escapeHtml(row.label || 'Untitled assessment')}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:2px">
              ${escapeHtml(row.season || '—')} ${escapeHtml(String(row.year || ''))} · ${escapeHtml(row.lead_assessor || 'Unknown assessor')}
            </div>
          </div>
          <div style="font-size:10px;color:var(--text3);white-space:nowrap">${new Date(row.created_at).toLocaleDateString()}</div>
        </div>
      `).join('');
    }

    if (prevBtn) prevBtn.disabled = pageIndex === 0;
    if (nextBtn) nextBtn.disabled = pageIndex >= totalPages - 1;
  }

  searchEl?.addEventListener('input', () => { pageIndex = 0; renderList(); });
  seasonEl?.addEventListener('change', () => { pageIndex = 0; renderList(); });
  prevBtn?.addEventListener('click', () => { pageIndex = Math.max(0, pageIndex - 1); renderList(); });
  nextBtn?.addEventListener('click', () => { pageIndex += 1; renderList(); });

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
