import { supabase } from './supabase.js';

export async function initReports(user) {
  const page = document.getElementById('page-reports');
  if (!page) return;

  page.innerHTML = `
    <div class="page-body" style="padding:16px">
      <div class="card" style="padding:14px">
        <div class="h3">Reports Hub</div>
        <div id="reports-meta" style="font-size:11px;color:var(--text3);margin-top:4px">Loading report totals…</div>
      </div>
      <div class="card" style="padding:14px;margin-top:12px">
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn btn-sm" data-nav="sitrep">Open SitReps</button>
          <button class="btn btn-sm" data-nav="mopup">Open Mop-up</button>
          <button class="btn btn-sm" data-nav="hvc">Open HVC</button>
          <button class="btn btn-sm" data-nav="idp">Open IDP</button>
          <button class="btn btn-sm" data-nav="contingency">Open Contingency</button>
        </div>
      </div>
      <div class="card" style="padding:0;margin-top:12px;overflow:hidden">
        <div id="reports-list"></div>
      </div>
    </div>
  `;

  page.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => window._drmsaNavigate?.(btn.getAttribute('data-nav')));
  });

  const muniId = user?.municipality_id;
  const meta = document.getElementById('reports-meta');
  const list = document.getElementById('reports-list');
  if (!muniId || !meta || !list) return;

  const [hvcRes, sitrepRes, mopupRes, contingencyRes] = await Promise.all([
    supabase.from('hvc_assessments').select('id', { count: 'exact', head: true }).eq('municipality_id', muniId),
    supabase.from('sitreps').select('id', { count: 'exact', head: true }).eq('municipality_id', muniId),
    supabase.from('mopup_reports').select('id', { count: 'exact', head: true }).eq('municipality_id', muniId),
    supabase.from('contingency_plans').select('id', { count: 'exact', head: true }).eq('municipality_id', muniId)
  ]);

  const rows = [
    ['HVC Assessments', hvcRes.count ?? 0],
    ['Situation Reports', sitrepRes.count ?? 0],
    ['Mop-up Reports', mopupRes.count ?? 0],
    ['Contingency Plans', contingencyRes.count ?? 0]
  ];

  const hasError = [hvcRes, sitrepRes, mopupRes, contingencyRes].some(r => r.error);
  meta.textContent = hasError ? 'Some totals could not be loaded.' : 'Current municipality report totals';

  list.innerHTML = rows.map(([label, count]) => `
    <div style="padding:12px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:12px">
      <div style="font-size:12px;color:var(--text)">${label}</div>
      <div style="font-size:12px;font-weight:700;color:var(--text)">${count}</div>
    </div>
  `).join('');
}
