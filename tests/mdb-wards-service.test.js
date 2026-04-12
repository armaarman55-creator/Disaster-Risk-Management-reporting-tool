import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchMdbWardsByMunicipality } from '../js/mdb-wards-service.js';

test('fetchMdbWardsByMunicipality returns early when municipality identifiers are missing', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return { ok: true, json: async () => ({}) };
  };
  try {
    const result = await fetchMdbWardsByMunicipality({ muniCode: '', muniName: '' });
    assert.deepEqual(result, { features: null, wardNumField: 'WARD_NO' });
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchMdbWardsByMunicipality returns features and discovered ward field', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) {
      return {
        ok: true,
        json: async () => ({
          fields: [
            { name: 'WARD_NO' },
            { name: 'CAT_B' },
            { name: 'MUNICNAME' }
          ]
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        features: [{ type: 'Feature', properties: { id: 1 } }]
      })
    };
  };

  try {
    const result = await fetchMdbWardsByMunicipality({ muniCode: 'ABC123', muniName: 'Demo' });
    assert.equal(result.wardNumField, 'WARD_NO');
    assert.equal(Array.isArray(result.features), true);
    assert.equal(result.features.length, 1);
    assert.equal(calls.length >= 2, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchMdbWardsByMunicipality returns null features when all attempts fail', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return {
        ok: true,
        json: async () => ({
          fields: [
            { name: 'WARD_NUMBER' },
            { name: 'CAT_B' },
            { name: 'MUNICNAME' }
          ]
        })
      };
    }
    return {
      ok: true,
      json: async () => ({ features: [] })
    };
  };

  try {
    const result = await fetchMdbWardsByMunicipality({ muniCode: 'XYZ', muniName: 'NoMatch' });
    assert.equal(result.wardNumField, 'WARD_NUMBER');
    assert.equal(result.features, null);
    assert.equal(callCount >= 2, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
