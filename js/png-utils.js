export function hexToRgba(hex, alpha = 1) {
  const v = String(hex || '').replace('#', '').trim();
  const full = v.length === 3 ? v.split('').map(ch => ch + ch).join('') : v.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function darkenHex(hex, amount = 24) {
  const v = String(hex || '').replace('#', '').trim();
  const full = v.length === 3 ? v.split('').map(ch => ch + ch).join('') : v.padEnd(6, '0').slice(0, 6);
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
