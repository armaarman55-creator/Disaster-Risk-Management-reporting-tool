export type PlanCategory = 'seasonal' | 'hazard_specific' | 'functional' | 'event';

export type PlanType =
  | 'flood'
  | 'winter'
  | 'evacuation'
  | 'electricity_disruption'
  | 'hazmat'
  | 'shelter';

export type PlanStatus = 'draft' | 'in_review' | 'approved' | 'superseded' | 'archived';

export interface PlanMetadata {
  municipality_id: string;
  municipality_name: string;
  plan_category: PlanCategory;
  plan_type: PlanType;
  title: string;
  description?: string;
  owner_user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface PlanSectionBlock {
  id: string;
  type: 'text' | 'table' | 'list';
  content: unknown;
}

export interface PlanSection {
  key: string;
  title: string;
  order: number;
  editable: boolean;
  content_blocks: PlanSectionBlock[];
  seed_source?: string;
  tags?: string[];
}

export interface TriggerLevel {
  id: string;
  level_code: string;
  level_name: string;
  severity_rank: number;
  activation_summary: string;
  monitoring_indicators: string[];
  activation_conditions: string[];
  primary_actions: string[];
  communication_actions: string[];
  stand_down_criteria: string[];
}

export interface Annexure {
  id: string;
  key: string;
  title: string;
  order: number;
  schema_type: 'json_table' | 'content_block';
  columns?: string[];
  rows?: Array<Record<string, unknown>>;
  content?: string;
}

export interface ApprovalEvent {
  id: string;
  plan_id: string;
  from_status: PlanStatus;
  to_status: PlanStatus;
  actor_user_id: string;
  note?: string;
  at: string;
}

export interface VersionSnapshot {
  id: string;
  plan_id: string;
  version_label: string;
  status: PlanStatus;
  snapshot: Plan;
  created_at: string;
  created_by?: string;
}

export interface Plan {
  id: string;
  metadata: PlanMetadata;
  status: PlanStatus;
  sections: PlanSection[];
  trigger_levels: TriggerLevel[];
  annexures: Annexure[];
  version_history: VersionSnapshot[];
  approval_events: ApprovalEvent[];
}

export interface PlanTemplate {
  category: PlanCategory;
  type: PlanType;
  title: string;
  description?: string;
}

export interface MunicipalityData {
  municipality_id: string;
  municipality_name: string;
  owner_user_id?: string;
}

export interface SeedBlock {
  type: 'text' | 'table' | 'list';
  content: unknown;
}

export interface SeedSection {
  section_key: string;
  section_title: string;
  blocks: SeedBlock[];
}

export interface SeedBundle {
  plan_type: Extract<PlanType, 'flood' | 'winter' | 'evacuation'>;
  sections: SeedSection[];
}

export interface PlanExportPayload {
  metadata: PlanMetadata;
  status: PlanStatus;
  ordered_sections: PlanSection[];
  trigger_levels: TriggerLevel[];
  annexures: Annexure[];
  version_history: Array<Pick<VersionSnapshot, 'id' | 'version_label' | 'status' | 'created_at'>>;
  approval_events: ApprovalEvent[];
  methodology: {
    note: string;
    exported_at: string;
  };
}
