import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hexToRgba,
  darkenHex,
  triggerDataUrlDownload,
  reportPreviewError,
  roundRect,
  wrapText,
  wrapRichText,
  drawRichLine
} from '../js/png-utils.js';

test('hexToRgba supports 3-digit hex and alpha', () => {
  assert.equal(hexToRgba('#abc', 0.5), 'rgba(170, 187, 204, 0.5)');
});

test('hexToRgba clamps alpha bounds', () => {
  assert.equal(hexToRgba('#112233', 2), 'rgba(17, 34, 51, 1)');
  assert.equal(hexToRgba('#112233', -1), 'rgba(17, 34, 51, 0)');
});

test('hexToRgba falls back to black for invalid hex input', () => {
  assert.equal(hexToRgba('not-a-color', 0.5), 'rgba(0, 0, 0, 0.5)');
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

test('wrapText wraps long text by maxWidth', () => {
  const ctx = { measureText: (s) => ({ width: s.length * 6 }) };
  const lines = wrapText(ctx, ' alpha   beta gamma   delta epsilon ', 60);
  assert.equal(lines.length > 1, true);
});

test('wrapRichText preserves segments and wraps into multiple lines', () => {
  const ctx = { measureText: (s) => ({ width: s.length * 7 }), font: '' };
  const segments = [
    { text: 'A very long heading for testing', bold: true },
    { text: 'with additional detail text', bold: false }
  ];
  const lines = wrapRichText(ctx, segments, 90, 12);
  assert.equal(lines.length > 1, true);
  assert.equal(lines.flat().length > 0, true);
});

test('drawRichLine writes each segment to canvas context', () => {
  const calls = [];
  const ctx = {
    font: '',
    fillStyle: '',
    measureText: (s) => ({ width: s.length * 5 }),
    fillText: (text, x, y) => calls.push({ text, x, y })
  };
  drawRichLine(ctx, [{ text: 'Hello', bold: true }, { text: 'world', bold: false }], 10, 20, 12, '#fff');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].text, 'Hello');
  assert.equal(calls[1].text.startsWith(' '), true);
});

test('wrapRichText and drawRichLine handle missing segment text safely', () => {
  const ctx = {
    font: '',
    fillStyle: '',
    measureText: (s) => ({ width: s.length * 5 }),
    fillText: () => {}
  };
  const lines = wrapRichText(ctx, [{ text: null, bold: true }, { bold: false }], 100, 12);
  assert.deepEqual(lines, []);
  drawRichLine(ctx, [{ text: null, bold: true }], 0, 0, 10, '#000');
});

test('roundRect executes path operations without throwing', () => {
  const ops = [];
  const ctx = {
    beginPath: () => ops.push('beginPath'),
    moveTo: () => ops.push('moveTo'),
    lineTo: () => ops.push('lineTo'),
    quadraticCurveTo: () => ops.push('quadraticCurveTo'),
    closePath: () => ops.push('closePath')
  };
  roundRect(ctx, 0, 0, 10, 10, 2);
  assert.equal(ops.includes('beginPath'), true);
  assert.equal(ops.includes('closePath'), true);
});
