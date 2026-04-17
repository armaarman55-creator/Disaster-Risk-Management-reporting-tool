const DEFAULT_MDB_WARDS_BASE = 'https://services7.arcgis.com/oeoyTUJC8HEeYsRB/arcgis/rest/services/MDB_Wards_2020/FeatureServer/0/query';

function resolveMdbWardsBase() {
  const globalOverride = typeof globalThis !== 'undefined' ? globalThis?.DRMSA_MDB_WARDS_QUERY_URL : null;
  const localOverride = (() => {
    try {
      return typeof globalThis !== 'undefined' && globalThis?.localStorage
        ? globalThis.localStorage.getItem('drmsa.mdbWardsQueryUrl')
        : null;
    } catch (_) {
      return null;
    }
  })();

  const candidate = (globalOverride || localOverride || '').trim();
  if (candidate && /\/FeatureServer\/\d+\/query/i.test(candidate)) return candidate;
  return DEFAULT_MDB_WARDS_BASE;
}

function escapeWhereValue(value) {
  return String(value || '').trim().replace(/'/g, "''");
}

export async function fetchMdbWardsByMunicipality({ muniCode, muniName }) {
  const safeMuniCode = escapeWhereValue(muniCode);
  const safeMuniName = escapeWhereValue(muniName);
  if (!safeMuniCode && !safeMuniName) return { features: null, wardNumField: 'WARD_NO' };

  let fields = [];
  try {
    const probeRes = await fetch(`${resolveMdbWardsBase()}?where=1%3D1&outFields=*&f=json&resultRecordCount=1`);
    if (probeRes.ok) {
      const probeData = await probeRes.json();
      fields = (probeData.fields || []).map(f => f.name);
    }
  } catch (_) {}

  const wardNumField = fields.find(f => /ward.?n(o|um)/i.test(f)) || 'WARD_NO';
  const codeFields = fields.filter(f => /cat_b|lb_|muni.*c/i.test(f));
  const nameFields = fields.filter(f => /muni.*name|municname/i.test(f));
  if (!codeFields.length) codeFields.push('CAT_B', 'LB_CODE', 'MUNI_CODE');
  if (!nameFields.length) nameFields.push('MUNICNAME', 'MUNI_NAME');

  const attempts = [];
  codeFields.forEach(f => { if (safeMuniCode) attempts.push(`${f}='${safeMuniCode}'`); });
  nameFields.forEach(f => {
    if (!safeMuniName) return;
    attempts.push(`${f}='${safeMuniName}'`);
    attempts.push(`${f} LIKE '%${safeMuniName}%'`);
  });

  for (const where of new Set(attempts)) {
    const url = `${resolveMdbWardsBase()}?where=${encodeURIComponent(where)}&outFields=*&outSR=4326&f=geojson&resultRecordCount=200&returnGeometry=true`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.features?.length) {
        return { features: data.features, wardNumField };
      }
    } catch (_) {
      continue;
    }
  }

  return { features: null, wardNumField };
}
