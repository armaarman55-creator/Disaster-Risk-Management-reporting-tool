import { supabase } from './supabase.js';

function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
}

function stableUuidFromText(input) {
  const src = String(input || 'contingency-plan');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < src.length; i += 1) {
    const c = src.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  const hex = `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}${h1
    .toString(16)
    .padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
  const base = hex.slice(0, 32).split('');
  base[12] = '4';
  base[16] = ((parseInt(base[16], 16) & 0x3) | 0x8).toString(16);
  return `${base.slice(0, 8).join('')}-${base.slice(8, 12).join('')}-${base.slice(12, 16).join('')}-${base.slice(16, 20).join('')}-${base.slice(20, 32).join('')}`;
}

function normaliseUuid(v) {
  if (!v) return null;
  return isUuid(v) ? v : stableUuidFromText(v);
}

export async function savePlanToBackend(plan, context) {
  const stablePlanId = normaliseUuid(plan?.id);
  const payload = {
    id: stablePlanId,
    municipality_id: normaliseUuid(context?.municipalityId),
    organisation_id: context?.organisationId || null,
    title: plan?.metadata?.title || 'Contingency Plan',
    category: plan?.metadata?.plan_category || null,
    plan_type_code: plan?.metadata?.plan_type || null,
    status: plan?.status || 'draft',
    plan_json: plan,
    updated_by: normaliseUuid(context?.userId)
  };

  const { error } = await supabase.from('contingency_plans').upsert(payload, { onConflict: 'id' });
  if (error) throw error;
}

export async function fetchPlansFromBackend(municipalityId) {
  const munId = normaliseUuid(municipalityId);
  if (!munId) return [];
  const { data, error } = await supabase
    .from('contingency_plans')
    .select('plan_json')
    .eq('municipality_id', munId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(r => r.plan_json).filter(Boolean);
}
