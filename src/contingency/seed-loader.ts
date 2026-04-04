import type { PlanSection, SeedBundle } from './types.js';

const FLOOD_SEED: SeedBundle = {
  plan_type: 'flood',
  sections: [
    {
      section_key: 'purpose_scope',
      section_title: 'Purpose and Scope',
      blocks: [
        { type: 'text', content: 'This flood contingency plan guides {{municipality_name}} on readiness, response and recovery.' }
      ]
    },
    {
      section_key: 'risk_context',
      section_title: 'Risk Context',
      blocks: [
        { type: 'list', content: ['Riverine flooding risk', 'Flash flood risk', 'Priority wards: {{priority_wards}}'] }
      ]
    },
    {
      section_key: 'coordination',
      section_title: 'Coordination and Command',
      blocks: [
        { type: 'text', content: 'Incident command structure activated under {{plan_type}} scenario.' }
      ]
    }
  ]
};

const WINTER_SEED: SeedBundle = {
  plan_type: 'winter',
  sections: [
    {
      section_key: 'winter_overview',
      section_title: 'Seasonal Overview',
      blocks: [
        { type: 'text', content: 'Winter preparedness plan for {{municipality_name}} with focus on cold fronts and snow/ice impacts.' }
      ]
    },
    {
      section_key: 'priority_areas',
      section_title: 'Priority Areas and Population',
      blocks: [
        { type: 'table', content: { headers: ['Ward', 'Risk Group', 'Needs'], rows: [] } },
        { type: 'text', content: 'Priority wards: {{priority_wards}}' }
      ]
    }
  ]
};

const EVACUATION_SEED: SeedBundle = {
  plan_type: 'evacuation',
  sections: [
    {
      section_key: 'evac_policy',
      section_title: 'Evacuation Policy and Triggers',
      blocks: [
        { type: 'text', content: 'Defines evacuation governance, authority and trigger process for {{municipality_name}}.' }
      ]
    },
    {
      section_key: 'routes_shelters',
      section_title: 'Routes and Shelter Strategy',
      blocks: [
        { type: 'table', content: { headers: ['Area', 'Route', 'Shelter'], rows: [] } }
      ]
    }
  ]
};

export function loadSeed(planType: SeedBundle['plan_type']): SeedBundle {
  switch (planType) {
    case 'flood':
      return JSON.parse(JSON.stringify(FLOOD_SEED));
    case 'winter':
      return JSON.parse(JSON.stringify(WINTER_SEED));
    case 'evacuation':
      return JSON.parse(JSON.stringify(EVACUATION_SEED));
    default:
      throw new Error(`Seed not supported: ${planType}`);
  }
}

export function seedToSections(seed: SeedBundle): PlanSection[] {
  return seed.sections.map((s, idx) => ({
    key: s.section_key,
    title: s.section_title,
    order: idx + 1,
    editable: true,
    seed_source: `seed:${seed.plan_type}`,
    content_blocks: s.blocks.map((b, bIdx) => ({
      id: `${s.section_key}_seed_${bIdx + 1}`,
      type: b.type,
      content: b.content
    }))
  }));
}
