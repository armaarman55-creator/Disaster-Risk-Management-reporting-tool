import { getPlan, setPlan } from './plan-engine.js';
import type { Annexure, Plan } from './types.js';

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type AnnexureTemplateType = 'contacts' | 'shelters' | 'ward_priorities' | 'operational_assets';

const ANNEXURE_TEMPLATES: Record<AnnexureTemplateType, Omit<Annexure, 'id'>> = {
  contacts: {
    key: 'contacts',
    title: 'Emergency Contact List',
    order: 1,
    schema_type: 'json_table',
    columns: ['name', 'organization', 'role', 'phone', 'email'],
    rows: []
  },
  shelters: {
    key: 'shelters',
    title: 'Shelter List',
    order: 2,
    schema_type: 'json_table',
    columns: ['shelter_name', 'ward', 'capacity', 'status', 'contact_person'],
    rows: []
  },
  ward_priorities: {
    key: 'ward_priorities',
    title: 'Ward Priority Table',
    order: 3,
    schema_type: 'json_table',
    columns: ['ward', 'priority_level', 'notes'],
    rows: []
  },
  operational_assets: {
    key: 'operational_assets',
    title: 'Operational Assets',
    order: 4,
    schema_type: 'json_table',
    columns: ['asset_type', 'asset_name', 'quantity', 'location', 'availability'],
    rows: []
  }
};

export function createAnnexure(annexure: Omit<Annexure, 'id'> & { id?: string }): Annexure {
  if (!annexure.key?.trim()) throw new Error('Annexure key is required');
  if (!annexure.title?.trim()) throw new Error('Annexure title is required');
  if (!Number.isFinite(annexure.order)) throw new Error('Annexure order must be numeric');

  return {
    ...deepClone(annexure),
    id: annexure.id ?? uid('ann')
  };
}

export function createAnnexureFromTemplate(templateType: AnnexureTemplateType): Annexure {
  return createAnnexure(ANNEXURE_TEMPLATES[templateType]);
}

export function attachAnnexureToPlan(planId: string, annexure: Annexure): Plan {
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Plan not found: ${planId}`);

  if (plan.annexures.some(a => a.id === annexure.id || a.key === annexure.key)) {
    throw new Error(`Annexure '${annexure.key}' already exists on plan.`);
  }

  plan.annexures.push(deepClone(annexure));
  plan.annexures.sort((a, b) => a.order - b.order);
  plan.metadata.updated_at = nowIso();
  return setPlan(plan);
}

export function updateAnnexure(planId: string, annexureId: string, patch: Partial<Annexure>): Plan {
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Plan not found: ${planId}`);

  const annexure = plan.annexures.find(a => a.id === annexureId);
  if (!annexure) throw new Error(`Annexure not found: ${annexureId}`);

  Object.assign(annexure, deepClone(patch));
  plan.annexures.sort((a, b) => a.order - b.order);
  plan.metadata.updated_at = nowIso();
  return setPlan(plan);
}
