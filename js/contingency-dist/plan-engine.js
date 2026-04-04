import { applyPlaceholders } from './placeholder-engine.js';
const planStore = new Map();
function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
function nowIso() {
    return new Date().toISOString();
}
function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}
function seedSectionsToPlanSections(seedSections) {
    return seedSections.map((s, idx) => ({
        key: s.section_key,
        title: s.section_title,
        order: idx + 1,
        editable: true,
        seed_source: 'seed-loader',
        content_blocks: s.blocks.map((b, bIdx) => ({
            id: uid(`${s.section_key}_blk_${bIdx + 1}`),
            type: b.type,
            content: b.content
        }))
    }));
}
export function createPlan(template, municipalityData) {
    const ts = nowIso();
    const planId = uid('plan');
    const initialVersion = {
        id: uid('vsn'),
        plan_id: planId,
        version_label: 'v0.1',
        status: 'draft',
        snapshot: {},
        created_at: ts,
        created_by: municipalityData.owner_user_id
    };
    const plan = {
        id: planId,
        metadata: {
            municipality_id: municipalityData.municipality_id,
            municipality_name: municipalityData.municipality_name,
            plan_category: template.category,
            plan_type: template.type,
            title: template.title,
            description: template.description,
            owner_user_id: municipalityData.owner_user_id,
            created_at: ts,
            updated_at: ts
        },
        status: 'draft',
        sections: [],
        trigger_levels: [],
        annexures: [],
        version_history: [],
        approval_events: []
    };
    initialVersion.snapshot = deepClone(plan);
    plan.version_history.push(initialVersion);
    planStore.set(plan.id, plan);
    return deepClone(plan);
}
export function generateFromSeed(template, seedContent) {
    const plan = createPlan(template, {
        municipality_id: 'UNSET_MUNICIPALITY',
        municipality_name: 'Unset Municipality'
    });
    const seededSections = seedSectionsToPlanSections(seedContent.sections).map(section => ({
        ...section,
        content_blocks: section.content_blocks.map(block => ({
            ...block,
            content: typeof block.content === 'string'
                ? applyPlaceholders(block.content, {
                    municipality_name: plan.metadata.municipality_name,
                    plan_type: plan.metadata.plan_type,
                    priority_wards: 'To be confirmed'
                })
                : block.content
        }))
    }));
    const stored = planStore.get(plan.id);
    if (!stored)
        return plan;
    stored.sections = seededSections;
    stored.metadata.updated_at = nowIso();
    planStore.set(stored.id, stored);
    return deepClone(stored);
}
export function addSection(plan, section) {
    const stored = planStore.get(plan.id) ?? deepClone(plan);
    const exists = stored.sections.find(s => s.key === section.key);
    if (exists) {
        throw new Error(`Section with key '${section.key}' already exists.`);
    }
    stored.sections.push(section);
    stored.sections.sort((a, b) => a.order - b.order);
    stored.metadata.updated_at = nowIso();
    planStore.set(stored.id, stored);
    return deepClone(stored);
}
export function updateSection(planId, sectionKey, content) {
    const stored = planStore.get(planId);
    if (!stored)
        throw new Error(`Plan not found: ${planId}`);
    const section = stored.sections.find(s => s.key === sectionKey);
    if (!section)
        throw new Error(`Section not found: ${sectionKey}`);
    section.content_blocks = content;
    stored.metadata.updated_at = nowIso();
    planStore.set(stored.id, stored);
    return deepClone(stored);
}
export function getPlan(planId) {
    const plan = planStore.get(planId);
    return plan ? deepClone(plan) : undefined;
}
export function setPlan(plan) {
    planStore.set(plan.id, deepClone(plan));
    return deepClone(plan);
}
export function listPlans() {
    return [...planStore.values()].map(deepClone);
}
