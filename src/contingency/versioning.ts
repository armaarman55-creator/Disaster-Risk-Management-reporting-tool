import { getPlan, setPlan } from './plan-engine.js';
import type { ApprovalEvent, Plan, PlanStatus, VersionSnapshot } from './types.js';

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const VALID_TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  draft: ['in_review', 'archived'],
  in_review: ['draft', 'approved', 'archived'],
  approved: ['superseded', 'archived'],
  superseded: ['archived'],
  archived: []
};

function canTransition(from: PlanStatus, to: PlanStatus): boolean {
  return from === to || VALID_TRANSITIONS[from].includes(to);
}

function nextVersionLabel(currentHistory: VersionSnapshot[]): string {
  const last = currentHistory.length ? currentHistory[currentHistory.length - 1].version_label : undefined;
  if (!last) return 'v1.0';

  const match = /^v(\d+)\.(\d+)$/.exec(last);
  if (!match) return 'v1.0';

  const major = Number(match[1]);
  const minor = Number(match[2]) + 1;
  return `v${major}.${minor}`;
}

function buildSnapshot(plan: Plan, actorUserId?: string): VersionSnapshot {
  return {
    id: uid('vsn'),
    plan_id: plan.id,
    version_label: nextVersionLabel(plan.version_history),
    status: plan.status,
    snapshot: deepClone(plan),
    created_at: nowIso(),
    created_by: actorUserId
  };
}

export function saveVersionSnapshot(plan: Plan, actorUserId?: string): VersionSnapshot {
  const planCopy = deepClone(plan);
  const snapshot = buildSnapshot(planCopy, actorUserId);
  planCopy.version_history.push(snapshot);
  planCopy.metadata.updated_at = nowIso();
  setPlan(planCopy);
  return snapshot;
}

function addApprovalEvent(
  plan: Plan,
  fromStatus: PlanStatus,
  toStatus: PlanStatus,
  actorUserId: string,
  note?: string
): ApprovalEvent {
  const event: ApprovalEvent = {
    id: uid('apr'),
    plan_id: plan.id,
    from_status: fromStatus,
    to_status: toStatus,
    actor_user_id: actorUserId,
    note,
    at: nowIso()
  };

  plan.approval_events.push(event);
  return event;
}

export function updatePlanStatus(planId: string, status: PlanStatus, actorUserId: string, note?: string): Plan {
  const plan = getPlan(planId);
  if (!plan) throw new Error(`Plan not found: ${planId}`);

  if (!canTransition(plan.status, status)) {
    throw new Error(`Invalid status transition from '${plan.status}' to '${status}'.`);
  }

  const from = plan.status;
  plan.status = status;
  addApprovalEvent(plan, from, status, actorUserId, note);

  const snapshot = buildSnapshot(plan, actorUserId);
  plan.version_history.push(snapshot);
  plan.metadata.updated_at = nowIso();

  return setPlan(plan);
}

export function submitForReview(planId: string, actorUserId: string, note?: string): Plan {
  return updatePlanStatus(planId, 'in_review', actorUserId, note ?? 'Submitted for review');
}

export function approvePlan(planId: string, actorUserId: string, note?: string): Plan {
  return updatePlanStatus(planId, 'approved', actorUserId, note ?? 'Plan approved');
}
