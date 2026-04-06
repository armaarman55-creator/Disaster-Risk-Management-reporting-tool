// js/download.js — Universal download helper
// Provides PDF (print), Excel (.csv), and native Word (.docx) exports

/**
 * Show a download dropdown menu anchored to a button.
 * @param {HTMLElement} btn - The button that was clicked
 * @param {object} options
 *   title        {string}  - Document title
 *   getPDF       {fn}      - Calls window.print() on a generated HTML page
 *   getXLSXBlob  {fn}      - Returns Blob for native .xlsx download
 *   getCSVRows   {fn}      - Returns array of arrays for CSV
 *   getDocHTML   {fn}      - Returns HTML string used to generate native .docx
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
  if (options.getDocHTML) items.push({ label: '↓ Word (.docx)', icon: '#58a6ff', fn: () => downloadDocx(options.getDocHTML(), options.filename) });

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

let _docxLibPromise = null;

function loadDocxLibrary() {
  if (!_docxLibPromise) {
    _docxLibPromise = import('https://cdn.jsdelivr.net/npm/docx@9.5.1/+esm');
  }
  return _docxLibPromise;
}

function nodeText(node) {
  return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function tableFromHtml(tableEl, docx) {
  const { Table, TableRow, TableCell, Paragraph, WidthType } = docx;
  const rows = [...tableEl.querySelectorAll('tr')];
  const tableRows = rows.map(tr => {
    const cells = [...tr.querySelectorAll('th,td')];
    const rowCells = cells.map(cell =>
      new TableCell({
        children: [new Paragraph({ text: nodeText(cell) || ' ' })]
      })
    );
    return new TableRow({ children: rowCells });
  });

  return new Table({
    rows: tableRows,
    width: {
      size: 100,
      type: WidthType.PERCENTAGE
    }
  });
}

function htmlToDocxChildren(html, docx) {
  const { Paragraph, HeadingLevel, TextRun } = docx;
  const parser = new DOMParser();
  const dom = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  const children = [];
  const blocks = [...(dom.body?.children || [])];

  blocks.forEach(el => {
    const tag = el.tagName.toLowerCase();
    const text = nodeText(el);
    if (!text && tag !== 'table') return;

    if (tag === 'h1') {
      children.push(new Paragraph({ text, heading: HeadingLevel.HEADING_1 }));
      return;
    }
    if (tag === 'h2') {
      children.push(new Paragraph({ text, heading: HeadingLevel.HEADING_2 }));
      return;
    }
    if (tag === 'h3') {
      children.push(new Paragraph({ text, heading: HeadingLevel.HEADING_3 }));
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      [...el.querySelectorAll('li')].forEach(li => {
        const itemText = nodeText(li);
        if (itemText) {
          children.push(new Paragraph({
            children: [new TextRun(`• ${itemText}`)]
          }));
        }
      });
      return;
    }
    if (tag === 'table') {
      children.push(tableFromHtml(el, docx));
      return;
    }

    children.push(new Paragraph({ text }));
  });

  return children.length ? children : [new Paragraph({ text: nodeText(dom.body) || ' ' })];
}

async function downloadDocx(html, filename) {
  try {
    const docx = await loadDocxLibrary();
    const { Document, Packer } = docx;
    const doc = new Document({
      sections: [{ children: htmlToDocxChildren(html, docx) }]
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url,
      download: `${filename}-${new Date().toISOString().slice(0,10)}.docx`
    }).click();
    URL.revokeObjectURL(url);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('DOCX download failed', err);
    alert('Failed to generate DOCX file. Please try PDF export.');
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
