// js/download.js — Universal download helper
// Provides PDF (print), Excel (.csv), and Word-compatible HTML (.doc) exports

/**
 * Show a download dropdown menu anchored to a button.
 * @param {HTMLElement} btn - The button that was clicked
 * @param {object} options
 *   title        {string}  - Document title
 *   getPDF       {fn}      - Calls window.print() on a generated HTML page
 *   getCSVRows   {fn}      - Returns array of arrays for CSV
 *   getDocHTML   {fn}      - Returns HTML string for Word-compatible .doc
 *   filename     {string}  - Base filename without extension
 */
export function showDownloadMenu(btn, options) {
  // Remove any existing menu
  document.getElementById('drmsa-dl-menu')?.remove();

  const menu = document.createElement('div');
  menu.id = 'drmsa-dl-menu';
  menu.style.cssText = [
    'position:fixed',
    'background:var(--bg2)',
    'border:1px solid var(--border2)',
    'border-radius:8px',
    'box-shadow:0 8px 32px rgba(0,0,0,.4)',
    'z-index:9999',
    'min-width:160px',
    'overflow:hidden',
    'font-family:Inter,system-ui,sans-serif'
  ].join(';');

  const items = [];
  if (options.getPDF)     items.push({ label: '↓ PDF',               icon: '#f85149', fn: options.getPDF });
  if (options.getCSVRows) items.push({ label: '↓ Excel / CSV',        icon: '#3fb950', fn: () => downloadCSV(options.getCSVRows(), options.filename) });
  if (options.getDocHTML) items.push({ label: '↓ Word (.doc)',         icon: '#58a6ff', fn: () => downloadDoc(options.getDocHTML(), options.filename) });

  menu.innerHTML = `
    <div style="padding:8px 12px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);border-bottom:1px solid var(--border)">
      Download as
    </div>
    ${items.map((item, i) => `
      <div class="drmsa-dl-item" data-idx="${i}"
        style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;font-size:13px;color:var(--text2);transition:background .12s"
        onmouseenter="this.style.background='var(--bg3)'"
        onmouseleave="this.style.background=''">
        <span style="width:8px;height:8px;border-radius:50%;background:${item.icon};flex-shrink:0;display:inline-block"></span>
        ${item.label}
      </div>`).join('')}`;

  document.body.appendChild(menu);

  // Position below the button
  const rect = btn.getBoundingClientRect();
  const menuW = 180;
  let left = rect.left;
  if (left + menuW > window.innerWidth) left = rect.right - menuW;
  menu.style.left = left + 'px';
  menu.style.top  = (rect.bottom + 6) + 'px';

  // Bind item clicks
  menu.querySelectorAll('.drmsa-dl-item').forEach(el => {
    el.addEventListener('click', () => {
      const fn = items[parseInt(el.dataset.idx)]?.fn;
      menu.remove();
      if (fn) fn();
    });
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 50);
}

function downloadCSV(rows, filename) {
  const csv  = rows.map(r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), {
    href: url,
    download: `${filename}-${new Date().toISOString().slice(0,10)}.csv`
  }).click();
  URL.revokeObjectURL(url);
}

function downloadDoc(html, filename) {
  // Word-compatible HTML — opens in Word/LibreOffice
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
    xmlns:w="urn:schemas-microsoft-com:office:word"
    xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8"/>
    <title>${filename}</title>
    <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
    <style>
      body{font-family:Arial,sans-serif;font-size:11pt;color:#111;margin:2cm}
      h1{font-size:18pt;color:#1a3a6b;margin-bottom:4pt}
      h2{font-size:13pt;color:#1a3a6b;border-bottom:1pt solid #ccc;padding-bottom:4pt;margin-top:16pt}
      table{width:100%;border-collapse:collapse;margin-bottom:12pt}
      th{background:#1a3a6b;color:#fff;padding:5pt 8pt;text-align:left;font-size:9pt}
      td{padding:4pt 8pt;border-bottom:1pt solid #eee;font-size:10pt}
      tr:nth-child(even) td{background:#f5f5f5}
      .meta{font-size:9pt;color:#666}
    </style>
  </head>
  <body>${html}</body>
  </html>`;

  const blob = new Blob([doc], { type: 'application/msword' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), {
    href: url,
    download: `${filename}-${new Date().toISOString().slice(0,10)}.doc`
  }).click();
  URL.revokeObjectURL(url);
}

/**
 * Render a standard DRMSA document header for Word/PDF exports
 */
export function docHeader(title, muniName, subtitle = '') {
  return `<h1>${title}</h1>
  <div class="meta">${muniName}${subtitle ? ' · ' + subtitle : ''} · Generated ${new Date().toLocaleString('en-ZA')} · Disaster Management Centre</div>
  <hr style="border:none;border-top:2pt solid #1a3a6b;margin:10pt 0"/>`;
}
