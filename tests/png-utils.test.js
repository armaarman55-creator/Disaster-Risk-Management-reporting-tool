import test from 'node:test';
import assert from 'node:assert/strict';

import { hexToRgba, darkenHex, triggerDataUrlDownload, reportPreviewError } from '../js/png-utils.js';

test('hexToRgba supports 3-digit hex and alpha', () => {
  assert.equal(hexToRgba('#abc', 0.5), 'rgba(170, 187, 204, 0.5)');
});

test('hexToRgba clamps alpha bounds', () => {
  assert.equal(hexToRgba('#112233', 2), 'rgba(17, 34, 51, 1)');
  assert.equal(hexToRgba('#112233', -1), 'rgba(17, 34, 51, 0)');
});

test('darkenHex returns darkened rgb value', () => {
  assert.equal(darkenHex('#336699', 20), 'rgb(31, 82, 133)');
});

test('triggerDataUrlDownload configures anchor and triggers click', () => {
  let clicked = false;
  const anchor = { href: '', download: '', click: () => { clicked = true; } };
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => anchor };
  try {
    triggerDataUrlDownload('data:image/png;base64,abc', 'x.png');
    assert.equal(anchor.href, 'data:image/png;base64,abc');
    assert.equal(anchor.download, 'x.png');
    assert.equal(clicked, true);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('reportPreviewError writes to console.error with context', () => {
  const originalError = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  try {
    reportPreviewError('scope-name', new Error('boom'), { template: 'x' });
    assert.equal(calls.length, 1);
    assert.match(calls[0][0], /\[scope-name\] boom/);
  } finally {
    console.error = originalError;
  }
});
