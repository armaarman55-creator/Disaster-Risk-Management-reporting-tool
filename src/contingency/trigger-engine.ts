import { getPlan, setPlan } from './plan-engine.js';
import type { Plan, TriggerLevel } from './types.js';

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createTriggerLevel(level: Omit<TriggerLevel, 'id'> & { id?: string }): TriggerLevel {
  if (!level.level_code?.trim()) throw new Error('Trigger level_code is required');
  if (!level.level_name?.trim()) throw new Error('Trigger level_name is required');
  if (!Number.isFinite(level.severity_rank)) throw new Error('Trigger severity_rank must be numeric');

  return {
    id: level.id ?? uid('trg'),
    level_code: level.level_code,
    level_name: level.level_name,
    severity_rank: level.severity_rank,
    activation_summary: level.activation_summary,
    monitoring_indicators: [...level.monitoring_indicators],
    activation_conditions: [...level.activation_conditions],
    primary_actions: [...level.primary_actions],
    communication_actions: [...level.communication_actions],
    stand_down_criteria: [...level.stand_down_criteria]
  };
}

export function attachTriggerToPlan(planId: string, trigger: TriggerLevel): Plan {
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Plan not found: ${planId}`);

  if (plan.trigger_levels.some(t => t.level_code === trigger.level_code)) {
    throw new Error(`Trigger level '${trigger.level_code}' already exists on plan.`);
  }

  plan.trigger_levels.push(deepClone(trigger));
  plan.trigger_levels.sort((a, b) => a.severity_rank - b.severity_rank);
  plan.metadata.updated_at = new Date().toISOString();
  return setPlan(plan);
}
