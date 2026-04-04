function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}
export function exportPlan(plan) {
    const orderedSections = [...plan.sections].sort((a, b) => a.order - b.order);
    const orderedTriggers = [...plan.trigger_levels].sort((a, b) => a.severity_rank - b.severity_rank);
    const orderedAnnexures = [...plan.annexures].sort((a, b) => a.order - b.order);
    return {
        metadata: deepClone(plan.metadata),
        status: plan.status,
        ordered_sections: deepClone(orderedSections),
        trigger_levels: deepClone(orderedTriggers),
        annexures: deepClone(orderedAnnexures),
        version_history: plan.version_history.map(v => ({
            id: v.id,
            version_label: v.version_label,
            status: v.status,
            created_at: v.created_at
        })),
        approval_events: deepClone(plan.approval_events),
        methodology: {
            note: 'Structured contingency plan export payload for DOCX rendering pipeline.',
            exported_at: new Date().toISOString()
        }
    };
}
