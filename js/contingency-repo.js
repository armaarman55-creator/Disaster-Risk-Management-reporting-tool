import { supabase } from './supabase.js';

export async function savePlanToBackend(plan, context) {
  const payload = {
    id: plan.id,
    municipality_id: context?.municipalityId || null,
    organisation_id: context?.organisationId || null,
    title: plan?.metadata?.title || 'Contingency Plan',
    category: plan?.metadata?.plan_category || null,
    plan_type_code: plan?.metadata?.plan_type || null,
    status: plan?.status || 'draft',
    plan_json: plan,
    updated_by: context?.userId || null
  };

  const { error } = await supabase.from('contingency_plans').upsert(payload, { onConflict: 'id' });
  if (error) throw error;
}

export async function fetchPlansFromBackend(municipalityId) {
  if (!municipalityId) return [];
  const { data, error } = await supabase
    .from('contingency_plans')
    .select('plan_json')
    .eq('municipality_id', municipalityId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(r => r.plan_json).filter(Boolean);
}
