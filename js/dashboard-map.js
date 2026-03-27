// js/dashboard-map.js

export function parseMarkerCoordsList(locationText) {
  if (!locationText || typeof locationText !== 'string') return [];
  const matches = [...locationText.matchAll(/@map:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/ig)];
  if (!matches.length) return [];
  return matches
    .map(m => {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return [lng, lat];
    })
    .filter(Boolean);
}

export function parseMarkerCoords(locationText) {
  const all = parseMarkerCoordsList(locationText);
  return all.length ? all[0] : null;
}

export function getWardAtLngLat(map, lngLat, wardFeatures = []) {
  if (!map || !lngLat) return null;

  // Preferred: rendered feature lookup when layer is interactable
  const projectedPoint = map.project(lngLat);
  const rendered = map.queryRenderedFeatures(projectedPoint, { layers: ['ward-fill'] }) || [];
  for (const f of rendered) {
    const wardNum = parseInt(f.properties?.ward_number, 10);
    if (Number.isFinite(wardNum)) return wardNum;
  }

  // Fallback: geometry lookup from cached ward features (works even if fill is hidden)
  const point = [lngLat.lng, lngLat.lat];
  for (const f of wardFeatures) {
    if (!f?.geometry) continue;
    if (geometryContainsPoint(f.geometry, point)) {
      const wardNum = parseInt(f.properties?.ward_number, 10);
      if (Number.isFinite(wardNum)) return wardNum;
    }
  }
  return null;
}

export function flattenCoords(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates.flat();
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2);
  return [];
}

export function boundsFromCoords(coords = []) {
  if (!Array.isArray(coords) || !coords.length) return null;
  const lons = coords.map(c => c[0]).filter(Number.isFinite);
  const lats = coords.map(c => c[1]).filter(Number.isFinite);
  if (!lons.length || !lats.length) return null;
  return {
    minX: Math.min(...lons),
    minY: Math.min(...lats),
    maxX: Math.max(...lons),
    maxY: Math.max(...lats)
  };
}

export function extendBounds(a, b) {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  };
}

export function zoomToWardOnMap(map, wardNum, wardFeatureIndex = {}, wardFeatures = [], opts = {}) {
  const target = parseInt(wardNum, 10);
  if (!map || !Number.isFinite(target)) return false;

  const padding = Number.isFinite(opts.padding) ? opts.padding : 70;
  const maxZoom = Number.isFinite(opts.maxZoom) ? opts.maxZoom : 13;

  const entry = wardFeatureIndex?.[target];
  if (entry?.bbox) {
    map.fitBounds([[entry.bbox.minX, entry.bbox.minY], [entry.bbox.maxX, entry.bbox.maxY]], { padding, maxZoom });
    return true;
  }

  const feature = (wardFeatures || []).find(f => parseInt(f?.properties?.ward_number, 10) === target);
  if (!feature?.geometry) return false;
  const coords = flattenCoords(feature.geometry);
  const bbox = boundsFromCoords(coords);
  if (!bbox) return false;
  map.fitBounds([[bbox.minX, bbox.minY], [bbox.maxX, bbox.maxY]], { padding, maxZoom });
  return true;
}

function geometryContainsPoint(geometry, point) {
  if (!geometry || !point) return false;
  if (geometry.type === 'Polygon') return polygonContainsPoint(geometry.coordinates, point);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some(poly => polygonContainsPoint(poly, point));
  return false;
}

function polygonContainsPoint(rings, point) {
  if (!Array.isArray(rings) || !rings.length) return false;
  const [x, y] = point;
  const inOuter = ringContainsPoint(rings[0], x, y);
  if (!inOuter) return false;
  for (let i = 1; i < rings.length; i++) {
    if (ringContainsPoint(rings[i], x, y)) return false;
  }
  return true;
}

function ringContainsPoint(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
