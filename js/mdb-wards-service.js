const MDB_WARDS_BASE = 'https://services7.arcgis.com/oeoyTUJC8HEeYsRB/arcgis/rest/services/MDB_Wards_2020/FeatureServer/0/query';

export async function fetchMdbWardsByMunicipality({ muniCode, muniName }) {
  if (!muniCode && !muniName) return { features: null, wardNumField: 'WARD_NO' };

  const probeRes = await fetch(`${MDB_WARDS_BASE}?where=1%3D1&outFields=*&f=json&resultRecordCount=1`);
  const probeData = await probeRes.json();
  const fields = (probeData.fields || []).map(f => f.name);
  const wardNumField = fields.find(f => /ward.?n(o|um)/i.test(f)) || 'WARD_NO';
  const codeFields = fields.filter(f => /cat_b|lb_|muni.*c/i.test(f));
  const nameFields = fields.filter(f => /muni.*name|municname/i.test(f));

  const attempts = [];
  codeFields.forEach(f => { if (muniCode) attempts.push(`${f}='${muniCode}'`); });
  nameFields.forEach(f => { if (muniName) attempts.push(`${f} LIKE '%${muniName}%'`); });

  for (const where of attempts) {
    const url = `${MDB_WARDS_BASE}?where=${encodeURIComponent(where)}&outFields=*&outSR=4326&f=geojson&resultRecordCount=200&returnGeometry=true`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await res.json();
    if (data?.features?.length) {
      return { features: data.features, wardNumField };
    }
  }

  return { features: null, wardNumField };
}
