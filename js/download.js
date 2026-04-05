// js/download.js — Universal download helper
// Provides PDF (print), Excel (.csv), and Word exports (.doc/.docx)

/**
 * Show a download dropdown menu anchored to a button.
 * @param {HTMLElement} btn - The button that was clicked
 * @param {object} options
 *   title        {string}  - Document title
 *   getPDF       {fn}      - Calls window.print() on a generated HTML page
 *   getXLSXBlob  {fn}      - Returns Blob for native .xlsx download
 *   getCSVRows   {fn}      - Returns array of arrays for CSV
 *   getDocHTML   {fn}      - Returns HTML string for Word-compatible .doc
 *   getDocxHTML  {fn}      - Returns HTML string that will be converted to true .docx
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
   if (options.getPDF) items.push({ label: '↓ PDF', icon: '#f85149', fn: options.getPDF });
  if (options.getXLSXBlob) {
    items.push({
      label: '↓ Excel (.xlsx)',
      icon: '#3fb950',
      fn: () => downloadXLSX(options.getXLSXBlob(), options.filename)
    });
  } else if (options.getCSVRows) {
    items.push({
      label: '↓ Excel / CSV',
      icon: '#3fb950',
      fn: () => downloadCSV(options.getCSVRows(), options.filename)
    });
  }
  if (options.getDocxHTML) items.push({ label: '↓ Word (.docx)', icon: '#58a6ff', fn: () => downloadDocx(options.getDocxHTML(), options.filename) });
  else if (options.getDocHTML) items.push({ label: '↓ Word (.doc)', icon: '#58a6ff', fn: () => downloadDoc(options.getDocHTML(), options.filename) });

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

  // Position the menu — above the button when dropup:true, below otherwise
  const rect  = btn.getBoundingClientRect();
  const menuW = 180;
  let left = rect.left;
  if (left + menuW > window.innerWidth) left = rect.right - menuW;
  menu.style.left = left + 'px';

  if (options.dropup) {
    const menuH = menu.offsetHeight;
    menu.style.top = (rect.top - menuH - 6) + 'px';
  } else {
    menu.style.top = (rect.bottom + 6) + 'px';
  }

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
  // Word-compatible HTML payload
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

function escapeXml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function htmlToDocxParagraphs(html) {
  const box = document.createElement('div');
  box.innerHTML = String(html || '');
  const raw = (box.innerText || box.textContent || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  if (!raw.length) raw.push(' ');
  return raw.map(line => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`).join('');
}

function crc32(bytes) {
  let crc = 0 ^ -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function u16(n) {
  const out = new Uint8Array(2);
  out[0] = n & 0xff;
  out[1] = (n >>> 8) & 0xff;
  return out;
}

function u32(n) {
  const out = new Uint8Array(4);
  out[0] = n & 0xff;
  out[1] = (n >>> 8) & 0xff;
  out[2] = (n >>> 16) & 0xff;
  out[3] = (n >>> 24) & 0xff;
  return out;
}

function concatBytes(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  parts.forEach(p => {
    out.set(p, offset);
    offset += p.length;
  });
  return out;
}

function buildZipStore(entries) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let cursor = 0;

  entries.forEach(entry => {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    const crc = crc32(dataBytes);

    const localHeader = concatBytes(
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0), // store (no compression)
      u16(0),
      u16(0),
      u32(crc),
      u32(dataBytes.length),
      u32(dataBytes.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes
    );
    locals.push(localHeader, dataBytes);

    const centralHeader = concatBytes(
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(dataBytes.length),
      u32(dataBytes.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(cursor),
      nameBytes
    );
    centrals.push(centralHeader);

    cursor += localHeader.length + dataBytes.length;
  });

  const centralBytes = concatBytes(...centrals);
  const localBytes = concatBytes(...locals);
  const end = concatBytes(
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralBytes.length),
    u32(localBytes.length),
    u16(0)
  );
  return concatBytes(localBytes, centralBytes, end);
}

function buildDocxBlobFromHtml(html) {
  const paragraphs = htmlToDocxParagraphs(html);
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:w10="urn:schemas-microsoft-com:office:word"
 xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
 xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
 xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
 xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
 xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
 mc:Ignorable="w14 wp14">
<w:body>
${paragraphs}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const zipBytes = buildZipStore([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'word/document.xml', data: documentXml }
  ]);

  return new Blob([zipBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function downloadDocx(html, filename) {
  try {
    const blob = buildDocxBlobFromHtml(html);
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url,
      download: `${filename}-${new Date().toISOString().slice(0,10)}.docx`
    }).click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('DOCX download failed', err);
    alert('Failed to generate DOCX file. Please try Word (.doc) export.');
  }
}

function downloadXLSX(blobOrPromise, filename) {
  Promise.resolve(blobOrPromise).then(blob => {
    const xlsxBlob = blob instanceof Blob
      ? blob
      : new Blob([blob], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
    const url = URL.createObjectURL(xlsxBlob);
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `${filename}-${new Date().toISOString().slice(0,10)}.xlsx`
    });
    a.click();
    URL.revokeObjectURL(url);
  }).catch(err => {
    // eslint-disable-next-line no-console
    console.error('XLSX download failed', err);
    alert('Failed to generate Excel file. Please try CSV export.');
  });
}

/**
 * Render a standard DRMSA document header for Word/PDF exports
 */
export function docHeader(title, muniName, subtitle = '') {
  return `<h1>${title}</h1>
  <div class="meta">${muniName}${subtitle ? ' · ' + subtitle : ''} · Generated ${new Date().toLocaleString('en-ZA')} · Disaster Management Centre</div>
  <hr style="border:none;border-top:2pt solid #1a3a6b;margin:10pt 0"/>`;
}
