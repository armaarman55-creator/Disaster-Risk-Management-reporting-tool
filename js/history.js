import { supabase } from './supabase.js';

export async function initHistory(user) {
  const page = document.getElementById('page-history');
  if (!page) return;

  page.innerHTML = `
    <div class="page-body" style="padding:16px">
      <div class="card" style="padding:14px">
        <div class="h3">Assessment History</div>
        <div id="history-meta" style="font-size:11px;color:var(--text3);margin-top:4px">Loading assessments…</div>
      </div>
      <div class="card" style="padding:0;margin-top:12px;overflow:hidden">
        <div id="history-list"></div>
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
  meta.textContent = `${rows.length} assessment${rows.length === 1 ? '' : 's'} found`;

  if (!rows.length) {
    list.innerHTML = `<div style="padding:16px;font-size:12px;color:var(--text3)">No saved HVC assessments yet.</div>`;
    return;
  }

  list.innerHTML = rows.map((row, idx) => `
    <div style="padding:12px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:10px;align-items:center">
      <div style="min-width:0">
        <div style="font-size:12px;font-weight:700;color:var(--text)">#${idx + 1} · ${escapeHtml(row.label || 'Untitled assessment')}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">
          ${escapeHtml(row.season || '—')} ${escapeHtml(String(row.year || ''))} · ${escapeHtml(row.lead_assessor || 'Unknown assessor')}
        </div>
      </div>
      <div style="font-size:10px;color:var(--text3);white-space:nowrap">${new Date(row.created_at).toLocaleDateString()}</div>
    </div>
  `).join('');
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
