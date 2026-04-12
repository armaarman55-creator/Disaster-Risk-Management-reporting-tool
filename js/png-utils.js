function normalizeHex(hex) {
  const cleaned = String(hex || '').replace('#', '').trim().replace(/[^a-f0-9]/gi, '');
  if (!cleaned) return '000000';
  if (cleaned.length === 3) return cleaned.split('').map(ch => ch + ch).join('');
  if (cleaned.length < 6) return '000000';
  return cleaned.slice(0, 6);
}

export function hexToRgba(hex, alpha = 1) {
  const full = normalizeHex(hex);
  const num = Number.parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function darkenHex(hex, amount = 24) {
  const full = normalizeHex(hex);
  const num = Number.parseInt(full, 16);
  const clamp = n => Math.max(0, Math.min(255, n));
  const r = clamp(((num >> 16) & 255) - amount);
  const g = clamp(((num >> 8) & 255) - amount);
  const b = clamp((num & 255) - amount);
  return `rgb(${r}, ${g}, ${b})`;
}

export function triggerDataUrlDownload(dataUrl, filename) {
  Object.assign(document.createElement('a'), {
    href: dataUrl,
    download: filename,
  }).click();
}

export function reportPreviewError(scope, error, context = {}) {
  const msg = error?.message || String(error || 'Unknown preview error');
  console.error(`[${scope}] ${msg}`, { context, error });
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = []; let current = '';
  words.forEach(word => {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current); current = word;
    } else current = test;
  });
  if (current) lines.push(current);
  return lines;
}

export function wrapRichText(ctx, segments, maxWidth, fontSize) {
  const words = [];
  (segments || []).forEach(seg => {
    String(seg?.text || '').split(/\s+/).forEach(w => {
      if (w) words.push({ text: w, bold: !!seg?.bold });
    });
  });
  const lines = []; let current = [];
  const lineW = segs => {
    let w = 0, first = true;
    segs.forEach(seg => {
      ctx.font = (seg.bold ? 'bold ' : '') + fontSize + 'px Arial, sans-serif';
      w += ctx.measureText((first ? '' : ' ') + seg.text).width;
      first = false;
    });
    return w;
  };
  words.forEach(word => {
    const test = [...current, word];
    if (lineW(test) > maxWidth && current.length) {
      lines.push(current); current = [word];
    } else current = test;
  });
  if (current.length) lines.push(current);
  return lines;
}

export function drawRichLine(ctx, segments, x, y, fontSize, color) {
  let cx = x;
  (segments || []).forEach((seg, i) => {
    ctx.font = (seg.bold ? 'bold ' : '') + fontSize + 'px Arial, sans-serif';
    ctx.fillStyle = color;
    const text = (i === 0 ? '' : ' ') + String(seg.text || '');
    ctx.fillText(text, cx, y);
    cx += ctx.measureText(text).width;
  });
}
