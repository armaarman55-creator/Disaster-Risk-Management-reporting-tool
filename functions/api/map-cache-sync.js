// Cloudflare Pages Function — served at /api/map-cache-sync
// Syncs municipal ward GeoJSON (ArcGIS) + place labels (Overpass/OSM) into Supabase cache tables.

const ARC_BASE = 'https://services7.arcgis.com/oeoyTUJC8HEeYsRB/arcgis/rest/services/MDB_Wards_2020/FeatureServer/0/query';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function readEnvValue(v) {
  return String(v || '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

function cleanMuniName(raw = '') {
  return String(raw || '')
    .replace(' LM', '')
    .replace(' DM', '')
    .replace(' Metropolitan Municipality', '')
    .trim();
}

function getWardNumber(props = {}) {
  const candidates = [
    props.WARD_NO,
    props.WARD_NUM,
    props.WardNo,
    props.ward_no,
    props.ward_num
  ];
  for (const c of candidates) {
    const n = parseInt(c, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function flattenCoords(geometry) {
  const out = [];
  const walk = (node) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      out.push([node[0], node[1]]);
      return;
    }
    node.forEach(walk);
  };
  walk(geometry?.coordinates);
  return out;
}

function boundsFromFeatures(features = []) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  features.forEach(f => {
    flattenCoords(f.geometry).forEach(([x, y]) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
  });
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { minX, minY, maxX, maxY };
}

async function supabaseFetch(env, path, options = {}) {
  const rawUrl =
    readEnvValue(env.SUPABASE_URL) ||
    readEnvValue(env.PUBLIC_SUPABASE_URL) ||
    readEnvValue(env.VITE_SUPABASE_URL) ||
    '';

  const serviceKey =
    readEnvValue(env.SUPABASE_SERVICE_ROLE_KEY) ||
    readEnvValue(env.SUPABASE_SERVICE_KEY) ||
    readEnvValue(env.SUPABASE_KEY) ||
    '';

  const supabaseUrl = rawUrl.replace(/\/+$/, '');

  if (!supabaseUrl || !serviceKey) {
    const envPresence = {
      SUPABASE_URL: Boolean(readEnvValue(env.SUPABASE_URL)),
      PUBLIC_SUPABASE_URL: Boolean(readEnvValue(env.PUBLIC_SUPABASE_URL)),
      VITE_SUPABASE_URL: Boolean(readEnvValue(env.VITE_SUPABASE_URL)),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(readEnvValue(env.SUPABASE_SERVICE_ROLE_KEY)),
      SUPABASE_SERVICE_KEY: Boolean(readEnvValue(env.SUPABASE_SERVICE_KEY)),
      SUPABASE_KEY: Boolean(readEnvValue(env.SUPABASE_KEY))
    };
    throw new Error(
      `Missing Supabase env vars. Set SUPABASE_URL (or PUBLIC_SUPABASE_URL/VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY/SUPABASE_KEY). Presence: ${JSON.stringify(envPresence)}`
    );
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Supabase REST ${res.status}: ${t}`);
  }

  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

async function findMunicipality(env, body) {
  const { municipality_id, municipality_code, municipality_name } = body || {};

  if (municipality_id) {
    const rows = await supabaseFetch(
      env,
      `municipalities?id=eq.${encodeURIComponent(municipality_id)}&select=id,code,name&limit=1`
    );
    if (rows?.[0]) return rows[0];
  }

  if (municipality_code) {
    const rows = await supabaseFetch(
      env,
      `municipalities?code=eq.${encodeURIComponent(municipality_code)}&select=id,code,name&limit=1`
    );
    if (rows?.[0]) return rows[0];
  }

  if (municipality_name) {
    const nm = cleanMuniName(municipality_name);
    const rows = await supabaseFetch(
      env,
      `municipalities?name=ilike.*${encodeURIComponent(nm)}*&select=id,code,name&limit=1`
    );
    if (rows?.[0]) return rows[0];
  }

  return null;
}

async function fetchWardFeatures(muniCode, muniName) {
  const probeRes = await fetch(`${ARC_BASE}?where=1%3D1&outFields=*&f=json&resultRecordCount=1`);
  const probe = await probeRes.json();
  const fields = (probe.fields || []).map(f => f.name);
  const codeFields = fields.filter(f => /cat_b|lb_|muni.*c/i.test(f));
  const nameFields = fields.filter(f => /muni.*name|municname/i.test(f));

  const attempts = [];
  codeFields.forEach(f => muniCode && attempts.push(`${f}='${muniCode}'`));
  nameFields.forEach(f => muniName && attempts.push(`${f} LIKE '%${muniName}%'`));

  for (const where of attempts) {
    const url = `${ARC_BASE}?where=${encodeURIComponent(where)}&outFields=*&outSR=4326&f=geojson&resultRecordCount=400&returnGeometry=true`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await res.json();
    if (data?.features?.length) return data.features;
  }

  return [];
}

async function fetchPlaceLabelsFromOverpass(bounds) {
  if (!bounds) return [];
  const { minY, minX, maxY, maxX } = bounds;
  const q = `[out:json][timeout:30];(node["place"](${minY},${minX},${maxY},${maxX}););out body;`;
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: `data=${encodeURIComponent(q)}`
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.elements || []).map(e => ({
    label: e.tags?.name,
    place_class: e.tags?.place,
    importance: null,
    lon: e.lon,
    lat: e.lat,
    tags: e.tags || {}
  })).filter(r => r.label && Number.isFinite(r.lon) && Number.isFinite(r.lat));
}

export async function onRequest(context) {
  try {
    const { request, env } = context;

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed. Use POST.' }, 405);
    }

    if (env.MAP_CACHE_SYNC_TOKEN) {
      const auth = request.headers.get('authorization') || '';
      const token = auth.replace(/^Bearer\s+/i, '').trim();
      if (token !== env.MAP_CACHE_SYNC_TOKEN) {
        return json({ error: 'Unauthorized' }, 401);
      }
    }

    const body = await request.json().catch(() => ({}));
    const municipality = await findMunicipality(env, body);
    if (!municipality) {
      return json({ error: 'Municipality not found. Provide municipality_id, municipality_code, or municipality_name.' }, 400);
    }

    const muniId = municipality.id;
    const muniCode = municipality.code || body.municipality_code || '';
    const muniName = cleanMuniName(municipality.name || body.municipality_name || '');

    const features = await fetchWardFeatures(muniCode, muniName);
    const wardRows = features.map(f => ({
      municipality_id: muniId,
      municipality_code: muniCode,
      source: 'arcgis',
      source_layer: 'MDB_Wards_2020',
      ward_number: getWardNumber(f.properties),
      properties: f.properties || {},
      geometry: f.geometry || null,
      synced_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    })).filter(r => Number.isFinite(r.ward_number) && r.geometry);

    if (wardRows.length) {
      await supabaseFetch(
        env,
        'municipal_ward_geojson_cache?on_conflict=municipality_id,source,ward_number',
        {
          method: 'POST',
          headers: {
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(wardRows)
        }
      );
    }

    const bounds = boundsFromFeatures(features);
    const places = await fetchPlaceLabelsFromOverpass(bounds);
    const placeRows = places.map(p => ({
      municipality_id: muniId,
      municipality_code: muniCode,
      source: 'osm',
      label: p.label,
      place_class: p.place_class,
      importance: p.importance,
      lon: p.lon,
      lat: p.lat,
      tags: p.tags,
      synced_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    }));

    if (placeRows.length) {
      await supabaseFetch(
        env,
        'municipal_place_labels_cache?on_conflict=municipality_id,source,label,lon,lat',
        {
          method: 'POST',
          headers: {
            Prefer: 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(placeRows)
        }
      );
    }

    return json({
      ok: true,
      municipality: municipality,
      wards_synced: wardRows.length,
      places_synced: placeRows.length,
      bounds
    });
  } catch (error) {
    return json({ ok: false, error: error.message || String(error) }, 500);
  }
}
