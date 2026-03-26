// js/dashboard-projects.js
import { parseMarkerCoordsList } from './dashboard-map.js';

export function buildProjectFeatures(mitigations = []) {
  return (mitigations || []).flatMap((m, idx) => {
    const ward = Array.isArray(m.affected_wards) && m.affected_wards.length ? parseInt(m.affected_wards[0], 10) : null;
    const coordsList = parseMarkerCoordsList(m.specific_location);
    if (!coordsList.length) return [];
    return coordsList.map((coordsFromLocation, markerIdx) => {
      const baseName = m.hazard_name || 'IDP project';
      const markerName = coordsList.length > 1 ? `${baseName} #${markerIdx + 1}` : baseName;
      return {
        type: 'Feature',
        id: `idp-${m.id || idx}-${markerIdx + 1}`,
        properties: {
          mitigation_id: m.id,
          name: markerName,
          base_name: baseName,
          marker_index: markerIdx + 1,
          description: m.description || '',
          ward_number: ward || '',
          project_type: 'IDP-linked',
          status: m.idp_status || 'proposed',
          owner: m.responsible_owner || '',
          timeframe: m.timeframe || '',
          cost_estimate: m.cost_estimate || '',
          linked_idp: true
        },
        geometry: { type: 'Point', coordinates: coordsFromLocation }
      };
    });
  });
}

export function projectOptionLabel(project) {
  const markerCount = parseMarkerCoordsList(project?.specific_location).length;
  return `${project?.hazard_name || 'IDP project'}${markerCount ? ` (${markerCount} marker${markerCount > 1 ? 's' : ''})` : ''}`;
}
