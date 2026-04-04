import { supabase } from './supabase.js';

let _cache = null;

function normalizePlanType(row) {
  return {
    code: row.code,
    name: row.name || row.code,
    description: row.description || '',
    category: row.category,
    templateCode: row.template_code || row.templateCode || row.code,
    seedGroup: row.seed_group || row.seedGroup || null,
    active: row.active !== false
  };
}

function getRuntimeRegistry() {
  const runtime = window.__drmsaPlanTypeRegistry;
  if (Array.isArray(runtime)) return runtime;

  try {
    const raw = localStorage.getItem('drmsa_plan_type_registry');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchRegistryRows() {
  const runtimeRows = getRuntimeRegistry();
  if (runtimeRows) return runtimeRows;

  const { data, error } = await supabase
    .from('contingency_plan_types')
    .select('code,name,description,category,template_code,seed_group,active')
    .order('name');

  if (error) {
    console.warn('[ContingencyRegistry] plan type source unavailable:', error.message || error);
    return [];
  }
  return data || [];
}

export async function getAllPlanTypes(force = false) {
  if (!force && Array.isArray(_cache)) return _cache;
  const rows = await fetchRegistryRows();
  _cache = rows.map(normalizePlanType);
  return _cache;
}

export async function getActivePlanTypes() {
  const all = await getAllPlanTypes();
  return all.filter(p => p.active);
}

export async function getPlanTypesByCategory(category) {
  const active = await getActivePlanTypes();
  return active.filter(p => p.category === category);
}

export async function getPlanTypeByCode(code) {
  const active = await getActivePlanTypes();
  return active.find(p => p.code === code) || null;
}
