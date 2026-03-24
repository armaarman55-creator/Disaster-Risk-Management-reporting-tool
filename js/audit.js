// js/audit.js — Shared audit trail writer used across all modules
// NOTE: supabase is lazy-imported inside the function to avoid top-level await
// resolution issues caused by supabase.js awaiting window.__cfgReady at module level.

/**
 * Write an audit trail entry.
 * Call this after any significant create/update/delete action.
 *
 * @param {string} action       - 'create' | 'update' | 'delete' | 'approve' | 'suspend' | 'role_change'
 * @param {string} targetType   - 'user' | 'shelter' | 'sitrep' | 'mitigation' | 'hvc_assessment' | 'road_closure' | 'relief_op' | 'stakeholder'
 * @param {string} targetId     - UUID of the record affected
 * @param {string} targetLabel  - Human-readable description e.g. "Shelter: NG Kerk Hall"
 * @param {object} [oldValue]   - Previous state object (for updates/deletes)
 * @param {object} [newValue]   - New state object (for creates/updates)
 */
export async function writeAudit(action, targetType, targetId, targetLabel, oldValue = null, newValue = null) {
  try {
    const user = window._drmsaUser;
    if (!user) return;

    const { supabase } = await import('./supabase.js');

    await supabase.from('audit_trail').insert({
      municipality_id: user.municipality_id,
      actor_id:        user.id,
      actor_name:      user.full_name || user.email || 'Unknown',
      actor_role:      user.role || 'viewer',
      action,
      target_type:     targetType,
      target_id:       targetId,
      target_label:    targetLabel,
      old_value:       oldValue  ? JSON.parse(JSON.stringify(oldValue))  : null,
      new_value:       newValue  ? JSON.parse(JSON.stringify(newValue))  : null,
    });
  } catch(e) {
    // Never block the main action if audit write fails
    console.warn('Audit write failed:', e.message);
  }
}
