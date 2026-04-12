// js/community.js
import { supabase } from './supabase.js';
import { confirmDialog } from './confirm-dialog.js';

let _muniId    = null;
let _activeTab = 'shelters';
let _muniLogos = { main: null, dm: null, mode: 'main' };
const SHELTER_PNG_TEMPLATES = [
  { key: 'community-board', label: 'Community board',  desc: 'Warm two-column notice board' },
  { key: 'status-panel',    label: 'Status panel',     desc: 'Capacity & occupancy dashboard' },
  { key: 'social-post',     label: 'Social post',      desc: 'Bold square for social sharing' },
  { key: 'field-handout',   label: 'Field handout',    desc: 'A5-style printable handout' },
  { key: 'emergency-strip', label: 'Emergency strip',  desc: 'High-contrast wide banner' },
];
const RELIEF_PNG_TEMPLATES = [
  { key: 'ops-brief',        label: 'Ops brief',         desc: 'Operational logistics card' },
  { key: 'community-notice', label: 'Community notice',  desc: 'Formal two-column notice' },
  { key: 'social-update',    label: 'Social update',     desc: 'Social media status square' },
  { key: 'info-flyer',       label: 'Info flyer',        desc: 'Distribution point flyer' },
  { key: 'timeline-card',    label: 'Timeline card',     desc: 'Schedule-focused timeline layout' },
];

export async function initCommunity(user) {
  _muniId = user?.municipality_id;
  await fetchMuniLogos();
  bindCommunityTabs();
  await loadTab('shelters');
}

async function fetchMuniLogos() {
  const { data } = await supabase
    .from('municipalities')
    .select('logo_main_url, logo_dm_url, logo_display_mode')
    .eq('id', _muniId)
    .single();
  _muniLogos = {
    main: data?.logo_main_url || null,
    dm:   data?.logo_dm_url   || null,
    mode: data?.logo_display_mode || 'main'
  };
}

function bindCommunityTabs() {
  const tabs = document.querySelector('#page-community .page-tabs');
  if (!tabs) return;
  tabs.querySelectorAll('.ptab').forEach(tab => {
    tab.addEventListener('click', async () => {
      tabs.querySelectorAll('.ptab').forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      _activeTab = tab.dataset.tab;
      await loadTab(_activeTab);
    });
  });
}

async function loadTab(tab) {
  const body = document.getElementById('community-body');
  if (!body) return;
  body.innerHTML = '<div style="padding:20px;color:var(--text3);font-size:12px">Loading…</div>';
  switch (tab) {
    case 'shelters':   await renderShelters(body);   break;
    case 'relief-ops': await renderReliefOps(body);  break;
  }
}

// ── CANVAS HELPERS ────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
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

function wrapText(ctx, text, maxWidth) {
  const words = (text || '').split(' ');
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

function wrapRichText(ctx, segments, maxWidth, fontSize) {
  const words = [];
  segments.forEach(seg => {
    seg.text.split(' ').forEach(w => { if (w) words.push({ text: w, bold: seg.bold }); });
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
    if (lineW(test) > maxWidth && current.length) { lines.push(current); current = [word]; }
    else current = test;
  });
  if (current.length) lines.push(current);
  return lines;
}

function drawRichLine(ctx, segments, x, y, fontSize, color) {
  let cx = x; let first = true;
  segments.forEach(seg => {
    ctx.font = (seg.bold ? 'bold ' : '') + fontSize + 'px Arial, sans-serif';
    ctx.fillStyle = color;
    const txt = (first ? '' : ' ') + seg.text;
    ctx.fillText(txt, cx, y);
    cx += ctx.measureText(txt).width;
    first = false;
  });
}

async function loadLogoImages() {
  const { main, dm, mode } = _muniLogos;
  const srcs = [];
  if (mode === 'both') { if (main) srcs.push(main); if (dm) srcs.push(dm); }
  else if (mode === 'dm') { if (dm) srcs.push(dm); }
  else { if (main) srcs.push(main); }
  return Promise.all(srcs.map(src => new Promise(res => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => res(img); img.onerror = () => res(null); img.src = src;
  })));
}

// Shared document-style canvas layout
// Returns { ctx, W, H, SPLIT, bodyTop, bodyH, FTR_H, RX, accentColor }
function buildNoticeCanvas(logoImgs, accentColor, muniName, date, W, H, layout = {}) {
  const SPLIT  = Math.round(W * (layout.splitRatio || 0.63));
  const HDR_H  = 76;
  const FTR_H  = 32;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background (light grey)
  ctx.fillStyle = layout.baseBg || '#f0eeea'; ctx.fillRect(0, 0, W, H);

  // Top accent bar
  ctx.fillStyle = accentColor; ctx.fillRect(0, 0, W, 6);

  // Header row (white)
  ctx.fillStyle = layout.headerBg || '#ffffff'; ctx.fillRect(0, 6, W, HDR_H);
  ctx.strokeStyle = '#d0ccc4'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, 6 + HDR_H); ctx.lineTo(W, 6 + HDR_H); ctx.stroke();

  // Logos in header
  let logoX = 16;
  for (const img of logoImgs) {
    if (!img) continue;
    const drawH = 48;
    const drawW = Math.min(drawH * (img.naturalWidth / img.naturalHeight), 90);
    ctx.drawImage(img, logoX, 6 + (HDR_H - drawH) / 2, drawW, drawH);
    logoX += drawW + 10;
  }

  // Municipality name + subtitle
  const hTextX = logoX + 6;
  ctx.fillStyle = '#333333'; ctx.font = 'bold 13px Arial, sans-serif';
  ctx.fillText(muniName, hTextX, 6 + 28);
  ctx.fillStyle = '#888888'; ctx.font = '11px Arial, sans-serif';
  ctx.fillText('Disaster Management Centre', hTextX, 6 + 46);

  // Date top-right
  ctx.fillStyle = '#aaaaaa'; ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Issued: ' + date, W - 16, 6 + 26);
  ctx.fillText('FOR OFFICIAL USE', W - 16, 6 + 42);
  ctx.textAlign = 'left';

  const bodyTop = 6 + HDR_H;
  const bodyH   = H - bodyTop - FTR_H;
  const RX      = SPLIT + 16;

  // Left column background
  ctx.fillStyle = layout.leftBg || '#fafaf8'; ctx.fillRect(0, bodyTop, SPLIT, bodyH);

  // Column divider
  ctx.strokeStyle = '#d0ccc4'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(SPLIT, bodyTop); ctx.lineTo(SPLIT, H - FTR_H); ctx.stroke();

  // Footer bar
  ctx.fillStyle = accentColor; ctx.fillRect(0, H - FTR_H, W, FTR_H);
  ctx.fillStyle = layout.footerText || '#ddeeff'; ctx.font = '10px Arial, sans-serif';
  ctx.fillText(muniName + ' Disaster Management Centre', 16, H - FTR_H + 20);
  ctx.textAlign = 'right';
  ctx.fillText('Generated: ' + date, W - 16, H - FTR_H + 20);
  ctx.textAlign = 'left';

  return { ctx, canvas, W, H, SPLIT, bodyTop, bodyH, FTR_H, RX, accentColor };
}

// Draw right-column detail fields
function drawRightFields(ctx, RX, startY, W, fieldDefs, variant = 'default') {
  let ry = startY;
  fieldDefs.forEach(f => {
    const labelColor = variant === 'alert-card' ? '#7f1d1d' : '#888888';
    const valueFont = variant === 'clean-light' ? '13px Arial, sans-serif' : '12px Arial, sans-serif';
    const labelFont = variant === 'clean-light' ? 'bold 10px Arial, sans-serif' : 'bold 9px Arial, sans-serif';
    ctx.fillStyle = labelColor; ctx.font = labelFont;
    ctx.fillText(f.label.toUpperCase(), RX, ry); ry += 14;
    if (f.badge) {
      ctx.fillStyle = f.badgeBg;
      const bw = ctx.measureText(f.badgeText).width + 16;
      roundRect(ctx, RX, ry - 11, bw, 18, variant === 'clean-light' ? 8 : 3); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 10px Arial, sans-serif';
      ctx.fillText(f.badgeText, RX + 8, ry + 3); ry += 22;
    } else {
      ctx.fillStyle = '#1a1a1a'; ctx.font = valueFont;
      const lines = wrapText(ctx, String(f.value), W - RX - 16);
      lines.slice(0, 2).forEach(line => { ctx.fillText(line, RX, ry); ry += 16; });
      ry += 4;
    }
    ry += 8;
  });
  return ry;
}

// Draw "Issued by" block at bottom of right column
function drawIssuedBy(ctx, RX, W, H, FTR_H, muniName) {
  const issuedY = H - FTR_H - 54;
  ctx.strokeStyle = '#c8c4bc'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(RX, issuedY); ctx.lineTo(W - 16, issuedY); ctx.stroke();
  ctx.fillStyle = '#888888'; ctx.font = 'bold 9px Arial, sans-serif';
  ctx.fillText('ISSUED BY', RX, issuedY + 14);
  ctx.fillStyle = '#333333'; ctx.font = '11px Arial, sans-serif';
  ctx.fillText(muniName, RX, issuedY + 28);
  ctx.fillStyle = '#666666'; ctx.font = '10px Arial, sans-serif';
  ctx.fillText('Disaster Management', RX, issuedY + 42);
}

function titleToneWord(tone) {
  return tone === 'advisory' ? 'Advisory' : tone === 'update' ? 'Update' : 'Notification';
}

function applyTitleTone(title, tone) {
  return String(title || '').replace(/\b(Notification|Notice|Bulletin|Update)\b/i, titleToneWord(tone));
}

// Compatibility helper for older template markup that referenced swatchHtml().
function swatchHtml(color = '#1d4ed8') {
  return `<span aria-hidden="true" style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${color};border:1px solid rgba(255,255,255,.35)"></span>`;
}

function templatePreviewDataUri(templateKey) {
  const c = document.createElement('canvas');
  c.width = 180; c.height = 96;
  const x = c.getContext('2d');
  const drawBlocks = (left = '#ffffff66', right = '#ffffff99') => {
    x.fillStyle = left; x.fillRect(10, 30, 96, 48);
    x.fillStyle = right; x.fillRect(112, 30, 58, 48);
  };
  if (templateKey === 'alert-card') {
    x.fillStyle = '#7f1d1d'; x.fillRect(0, 0, 180, 96);
    x.fillStyle = '#ef4444'; x.fillRect(0, 0, 180, 12);
    drawBlocks('#fff1', '#fff3');
  } else if (templateKey === 'clean-light') {
    x.fillStyle = '#ecfdf5'; x.fillRect(0, 0, 180, 96);
    x.fillStyle = '#ffffff'; x.fillRect(8, 8, 164, 80);
    x.strokeStyle = '#a7f3d0'; x.strokeRect(8, 8, 164, 80);
    drawBlocks('#10b98122', '#10b98133');
  } else if (templateKey === 'social') {
    const g = x.createLinearGradient(0, 0, 180, 96);
    g.addColorStop(0, '#0f172a'); g.addColorStop(1, '#1d4ed8');
    x.fillStyle = g; x.fillRect(0, 0, 180, 96);
    x.fillStyle = '#fff'; x.fillRect(12, 16, 156, 8);
    drawBlocks('#ffffff1a', '#ffffff44');
  } else if (templateKey === 'compact') {
    x.fillStyle = '#f5f3ff'; x.fillRect(0, 0, 180, 96);
    x.fillStyle = '#8b5cf6'; x.fillRect(0, 0, 180, 8);
    drawBlocks('#7c3aed22', '#7c3aed33');
  } else {
    x.fillStyle = '#f8fafc'; x.fillRect(0, 0, 180, 96);
    x.fillStyle = '#1d4ed8'; x.fillRect(0, 0, 180, 8);
    drawBlocks('#1d4ed822', '#1d4ed833');
  }
}

function _drawLivePreview(ctx, layout, W, H, color, secs, entityType, muniName, date) {
  const accent = color;
  const lb = _hexToRgba(accent,0.08), mb = _hexToRgba(accent,0.18);
  const fi = (x,y,w,h,c) => { ctx.fillStyle=c; ctx.fillRect(x,y,w,h); };
  const tx = (s,x,y,font,c,align='left') => { ctx.font=font; ctx.fillStyle=c; ctx.textAlign=align; ctx.fillText(s,x,y); ctx.textAlign='left'; };
  const ln = (x1,y1,x2,y2,c,lw=0.5) => { ctx.strokeStyle=c; ctx.lineWidth=lw; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); };
  const pill = (label,x,y,bg,tc) => { ctx.font='bold 9px Arial'; const tw=ctx.measureText(label).width; ctx.fillStyle=bg; ctx.beginPath(); ctx.roundRect(x,y-10,tw+12,14,4); ctx.fill(); ctx.fillStyle=tc; ctx.fillText(label,x+6,y); };
  const dataRow = (label,val,x,y,maxW) => {
    tx(label,x,y,'bold 8px Arial','#999');
    const lines = _wrapCanvasText(ctx, val, maxW);
    lines.slice(0,2).forEach((l,i) => tx(l,x,y+11+i*11,'9px Arial','#222'));
    return y + 14 + Math.min(lines.length,2)*11;
  };
  const entityLabel = entityType === 'shelter' ? 'Khanya Community Hall' : entityType === 'relief' ? 'Ward 14 Relief Operation' : 'Main Street';
  const statusLabel = entityType === 'shelter' ? 'OPEN' : entityType === 'relief' ? 'ACTIVE' : 'CLOSED';

  if (layout === 'community-board' || layout === 'ops-brief') {
    fi(0,0,W,H,'#f9f8f5'); fi(0,0,W,5,accent); fi(0,5,W,42,'#fff'); ln(0,47,W,47,'#e5e3df');
    tx(muniName,12,22,'bold 11px Arial',accent); tx('Disaster Management Centre',12,36,'9px Arial','#888');
    tx(date,W-10,22,'9px Arial','#aaa','right'); tx('FOR OFFICIAL USE',W-10,36,'8px Arial','#bbb','right');
    fi(0,47,W,H-47-28,'#fff'); tx(entityLabel,14,70,'bold 14px Arial','#1a1a1a');
    if (secs.status||secs.status_badge) pill(statusLabel,14,90,accent,'#fff');
    let y=100, sp=Math.floor(W*0.62);
    if (secs.address||secs.reason)      y=dataRow(entityType==='shelter'?'ADDRESS':'REASON',entityType==='shelter'?'123 Example St, Ward 7':'Emergency water main repairs',14,y,sp-28);
    if (secs.ward)                      y=dataRow('WARD','7',14,y,sp-28);
    if (secs.capacity||secs.distribution) y=dataRow(entityType==='shelter'?'CAPACITY':'DISTRIBUTION PT',entityType==='shelter'?'350 persons':'Town Hall Parking',14,y,sp-28);
    if (secs.contact)                   y=dataRow('CONTACT','Jane Smith · 083 000 0000',14,y,sp-28);
    ln(sp,47,sp,H-28,'#e5e3df'); let ry=58;
    if (secs.facility||secs.hazard||secs.authority)     ry=dataRow(entityType==='shelter'?'FACILITY':entityType==='relief'?'HAZARD':'AUTHORITY',entityType==='shelter'?'Community Hall':entityType==='relief'?'Flooding':'City Works Dept',sp+10,ry,W-sp-20);
    if (secs.accessibility||secs.schedule||secs.closed_since) ry=dataRow(entityType==='shelter'?'WHEELCHAIR':entityType==='relief'?'SCHEDULE':'CLOSED SINCE',entityType==='shelter'?'Yes – full access':entityType==='relief'?'Mon–Sat 08:00–17:00':'1 Jan 2026',sp+10,ry,W-sp-20);
    if (secs.occupancy||secs.end_date||secs.reopen)     ry=dataRow(entityType==='shelter'?'OCCUPANCY':'END / REOPEN',entityType==='shelter'?'238 / 350 (68%)':'31 Jan 2026',sp+10,ry,W-sp-20);
    fi(0,H-28,W,28,accent); tx(muniName+' Disaster Management Centre',12,H-10,'9px Arial',_hexToRgba('#fff',0.75)); tx('Generated: '+date,W-10,H-10,'9px Arial',_hexToRgba('#fff',0.6),'right');

  } else if (layout === 'status-panel') {
    fi(0,0,W,H,'#fff'); fi(0,0,W,10,accent);
    tx(muniName,12,26,'bold 11px Arial',accent); tx('Disaster Management Centre · Shelter Status',12,40,'9px Arial','#888'); tx(date,W-10,26,'9px Arial','#aaa','right');
    const cw=Math.floor((W-30)/3);
    [{l:'Capacity',v:'350'},{l:'Occupancy',v:'238'},{l:'Available',v:'112'}].forEach((cd,i)=>{
      const cx=10+i*(cw+5); fi(cx,52,cw,40,lb); ctx.strokeStyle=_hexToRgba(accent,0.25); ctx.lineWidth=0.5; ctx.strokeRect(cx,52,cw,40);
      tx(cd.l,cx+8,65,'bold 8px Arial','#888'); tx(cd.v,cx+8,82,'bold 16px Arial',accent);
    });
    fi(10,100,W-20,8,'#e5e7eb'); fi(10,100,Math.round((W-20)*0.68),8,accent);
    tx('68% occupied',10,118,'9px Arial','#555');
    let y=128;
    if (secs.address)      y=dataRow('ADDRESS','123 Example Street, Ward 7',10,y,W/2-15);
    if (secs.contact)      y=dataRow('CONTACT','Jane Smith · 083 000 0000',10,y,W/2-15);
    if (secs.accessibility) dataRow('WHEELCHAIR ACCESS','Yes — full ramp access',W/2+5,128,W/2-15);
    fi(0,H-22,W,22,'#f3f4f6'); tx('Generated: '+date,W-10,H-8,'8px Arial','#aaa','right');

  } else if (layout === 'social-post' || layout === 'social-update') {
    fi(0,0,W,H,_darkenHex(accent,40)); fi(0,0,W,H,'rgba(0,0,0,0.1)');
    fi(0,0,W,H*0.22,'rgba(255,255,255,0.12)');
    tx(muniName,W/2,H*0.12,'bold 11px Arial','rgba(255,255,255,0.85)','center');
    tx('Disaster Management Centre',W/2,H*0.18,'9px Arial','rgba(255,255,255,0.55)','center');
    fi(W*0.1,H*0.25,W*0.8,H*0.48,'rgba(255,255,255,0.13)');
    if (secs.status||secs.status_badge) pill(statusLabel,W*0.1+12,H*0.32,'rgba(255,255,255,0.25)','rgba(255,255,255,0.9)');
    tx(entityLabel,W/2,H*0.43,'bold 14px Arial','#fff','center');
    const sub = entityType==='shelter'?'Capacity: 350 · Ward 7':entityType==='relief'?'Distribution: Town Hall Parking':'Closed: Reopen 15 Jan';
    tx(sub,W/2,H*0.52,'10px Arial','rgba(255,255,255,0.75)','center');
    if (secs.contact||secs.alt_route||secs.distribution)
      tx(entityType==='relief'?'Contact: 083 000 0000':entityType==='routes'?'Alt: Oak Ave via River Rd':'Contact: 083 000 0000',W/2,H*0.62,'9px Arial','rgba(255,255,255,0.6)','center');
    tx(date,W/2,H*0.88,'9px Arial','rgba(255,255,255,0.4)','center');

  } else if (layout === 'field-handout' || layout === 'info-flyer') {
    fi(0,0,W,H,'#fff'); ctx.strokeStyle=_hexToRgba(accent,0.5); ctx.lineWidth=2; ctx.strokeRect(4,4,W-8,H-8);
    fi(4,4,W-8,22,lb); fi(4,4,W-8,3,accent);
    tx(muniName,W/2,18,'bold 9px Arial',accent,'center'); ln(4,26,W-4,26,_hexToRgba(accent,0.3));
    const noticeTitle = entityType==='shelter'?'SHELTER NOTICE':entityType==='relief'?'RELIEF OPERATION NOTICE':'ROAD CLOSURE NOTICE';
    tx(noticeTitle,W/2,42,'bold 13px Arial','#1a1a1a','center');
    tx(entityLabel,W/2,57,'11px Arial',accent,'center');
    let y=70;
    if (secs.status||secs.status_badge) { pill(statusLabel,W/2-20,y,accent,'#fff'); y+=20; }
    if (secs.address||secs.reason)      y=dataRow(entityType==='shelter'?'ADDRESS':'REASON','123 Example Street',10,y,W-20);
    if (secs.ward)                      y=dataRow('WARD','Ward 7',10,y,W-20);
    if (secs.capacity||secs.schedule||secs.distribution) y=dataRow(entityType==='shelter'?'CAPACITY':entityType==='relief'?'SCHEDULE':'DISTRIBUTION PT',entityType==='shelter'?'350 persons':'Mon–Sat 08:00–17:00',10,y,W-20);
    if (secs.contact)                   y=dataRow('CONTACT','Jane Smith · 083 000 0000',10,y,W-20);
    fi(4,H-22,W-8,18,lb); tx('Generated: '+date,W/2,H-10,'8px Arial','#888','center');

  } else if (layout === 'emergency-strip' || layout === 'community-notice') {
    fi(0,0,W,H,accent); fi(0,0,W,H,'rgba(0,0,0,0.22)');
    fi(0,0,W,14,'rgba(255,255,255,0.12)');
    tx(muniName,12,10,'bold 9px Arial','rgba(255,255,255,0.7)'); tx(date,W-10,10,'8px Arial','rgba(255,255,255,0.5)','right');
    const sp=Math.floor(W*0.58);
    tx(entityType==='shelter'?'SHELTER NOTICE':entityType==='relief'?'RELIEF OPERATION':'ROAD CLOSURE ALERT',14,34,'bold 13px Arial','#fff');
    tx(entityLabel,14,50,'11px Arial','rgba(255,255,255,0.85)');
    if (secs.address||secs.reason)       tx(entityType==='shelter'?'123 Example Street · Ward 7':'Reason: Emergency repairs',14,64,'9px Arial','rgba(255,255,255,0.65)');
    if (secs.contact||secs.alt_route)    tx(entityType==='routes'?'Alt: Oak Avenue via River Rd':'Contact: 083 000 0000',14,78,'9px Arial','rgba(255,255,255,0.55)');
    fi(sp,14,W-sp,H-14,'rgba(255,255,255,0.12)');
    let ry=28;
    ry=dataRow('STATUS',statusLabel,sp+8,ry,W-sp-16);
    if (secs.ward)                        ry=dataRow('WARD','7',sp+8,ry,W-sp-16);
    if (secs.capacity||secs.schedule||secs.distribution) ry=dataRow(entityType==='shelter'?'CAPACITY':entityType==='relief'?'SCHEDULE':'ALT ROUTE',entityType==='shelter'?'350 persons':'08:00–17:00 Daily',sp+8,ry,W-sp-16);
    fi(0,H-16,W,16,_hexToRgba(accent,0.5)); tx(muniName+' DMC',14,H-4,'bold 8px Arial','rgba(255,255,255,0.8)');

  } else if (layout === 'timeline-card') {
    fi(0,0,W,H,'#fff'); fi(0,0,W,6,accent);
    tx(muniName,14,22,'bold 11px Arial',accent); tx('Relief Operation Timeline',14,36,'9px Arial','#888'); tx(date,W-14,22,'8px Arial','#aaa','right'); ln(0,44,W,44,'#e5e7eb');
    const milestones=[{l:'Operation opened',d:'1 Jan 2026',done:true},{l:'Distribution active',d:'2 Jan 2026',done:true},{l:'Mid-point review',d:'15 Jan 2026',done:false},{l:'Operation closes',d:'31 Jan 2026',done:false}];
    const lx=32; ctx.strokeStyle='#e5e7eb'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(lx,52); ctx.lineTo(lx,H-20); ctx.stroke();
    milestones.forEach((m,i)=>{ const my=58+i*Math.floor((H-78)/milestones.length); fi(0,0,0,0,''); ctx.fillStyle=m.done?accent:'#e5e7eb'; ctx.beginPath(); ctx.arc(lx,my,5,0,Math.PI*2); ctx.fill(); tx(m.l,lx+12,my+2,'bold 9px Arial',m.done?'#1a1a1a':'#aaa'); tx(m.d,lx+12,my+13,'8px Arial','#888'); });
    if (secs.distribution) dataRow('DISTRIBUTION POINT','Town Hall Parking',Math.floor(W*0.55),52,W-Math.floor(W*0.55)-14);
    if (secs.contact)       dataRow('CONTACT','083 000 0000',Math.floor(W*0.55),82,W-Math.floor(W*0.55)-14);
    if (secs.hazard)        dataRow('HAZARD','Flooding',Math.floor(W*0.55),112,W-Math.floor(W*0.55)-14);
    fi(0,H-20,W,20,lb); tx('Generated: '+date,W-10,H-7,'8px Arial','#aaa','right');
  }
}

function openPngTemplatePicker({ heading, templates, sectionDefs = [], defaultColors = [], onDownload }) {
  document.getElementById('png-template-picker')?.remove();
  // Compatibility alias for older modal templates that referenced `sectionGroups`.
  const sectionGroups = Array.isArray(sectionDefs) ? sectionDefs : [];
  const modal = document.createElement('div');
  modal.id = 'png-template-picker';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.55);display:flex;align-items:flex-start;justify-content:center;padding:16px 16px 24px;overflow:auto';
  modal.innerHTML = `
    <div style="width:min(760px,96vw);max-height:min(88vh,calc(100dvh - 32px));overflow:auto;background:var(--bg2);border:1px solid var(--border2);border-radius:12px;box-shadow:0 10px 36px rgba(0,0,0,.45);padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0;font-size:16px">${heading}</h3>
        <div style="display:flex;align-items:center;gap:6px">
          <button type="button" id="png-download-top" style="border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px">Download PNG</button>
          <button type="button" data-close style="border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:6px;padding:4px 8px;cursor:pointer">✕</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:10px">Select template and content before downloading.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin-bottom:12px">
        ${templates.map((tpl, idx) => `
          <label style="display:block;border:1px solid var(--border);border-radius:8px;padding:9px;background:var(--bg3);cursor:pointer">
            <input type="radio" name="tpl" value="${tpl.key}" ${idx === 0 ? 'checked' : ''} />
            <img alt="${tpl.label} preview" src="${templatePreviewDataUri(tpl.key)}" style="display:block;width:100%;height:64px;object-fit:cover;border-radius:6px;margin:6px 0;border:1px solid rgba(255,255,255,.22)" />
            <div style="font-weight:700;font-size:12px;margin-top:4px">${tpl.label}</div>
            <div style="font-size:11px;color:var(--text3)">${tpl.desc || tpl.key}</div>
          </label>
        `).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="font-size:12px">Notice wording
          <select id="png-tone" style="width:100%;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:7px;color:var(--text)">
            <option value="notification">Notification</option>
            <option value="advisory">Advisory</option>
            <option value="update">Update</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:19px">
          <input id="png-readable" type="checkbox" checked />
          Readable text (recommended)
        </label>
      </div>
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
        <div style="font-size:12px;font-weight:700;margin-bottom:6px">Include sections</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px">
          ${sectionGroups.map(sec => `<label style="font-size:12px;display:flex;align-items:center;gap:6px"><input type="checkbox" data-sec="${sec.key}" ${sec.default ? 'checked' : ''}/> ${sec.label}</label>`).join('')}
        </div>
      </div>
      <div style="position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:8px;margin-top:14px;padding:10px 0 4px;background:linear-gradient(180deg, rgba(0,0,0,0), var(--bg2) 45%)">
        <button type="button" data-close style="border:1px solid var(--border);background:var(--bg3);color:var(--text);border-radius:6px;padding:7px 10px;cursor:pointer">Cancel</button>
        <button type="button" id="png-download-now" style="border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:6px;padding:7px 12px;cursor:pointer">Download PNG</button>
      </div>
    </div>
  `;
  modal.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  const doDownload = async () => {
    const template = modal.querySelector('input[name="tpl"]:checked')?.value || templates[0]?.key || 'official';
    const tone = modal.querySelector('#png-tone')?.value || 'notification';
    const readable = !!modal.querySelector('#png-readable')?.checked;
    const sections = {};
    sectionGroups.forEach(sec => { sections[sec.key] = !!modal.querySelector(`[data-sec="${sec.key}"]`)?.checked; });
    modal.remove();
    await onDownload({ template, tone, readable, sections });
  };
  modal.querySelector('#png-download-now')?.addEventListener('click', doDownload);
  modal.querySelector('#png-download-top')?.addEventListener('click', doDownload);
  document.body.appendChild(modal);
  buildThumbnails();
  requestAnimationFrame(() => { updatePreview(); });
}

// ── SHELTERS ─────────────────────────────────────────────
async function renderShelters(body) {
  const { data: shelters } = await supabase
    .from('shelters').select('*')
    .eq('municipality_id', _muniId).order('ward_number');

  body.innerHTML = `
    <div class="sec-hdr">
      <div><div class="sec-hdr-title">Registered shelters</div><div class="sec-hdr-sub">${shelters?.length || 0} registered</div></div>
      <button class="btn btn-red btn-sm" id="add-shelter-btn">+ Add shelter</button>
    </div>
    <div id="shelter-form-area"></div>
    <div id="shelters-list">
      ${shelters?.length ? shelters.map(s => renderShelterCard(s)).join('') : emptyState('No shelters registered yet.')}
    </div>`;

  requestAnimationFrame(() => {
    const btn = document.getElementById('add-shelter-btn');
    if (btn) btn.onclick = () => showShelterForm(null);
    bindShelterEvents(shelters || []);
  });
}

function showShelterForm(existing) {
  const area = document.getElementById('shelter-form-area');
  if (!area) return;
  if (area.innerHTML && !existing) { area.innerHTML = ''; return; }

  const s = existing || {};
  area.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--red-mid);border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">${existing ? 'Edit shelter' : 'Add new shelter'}</div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Shelter name</span><input class="fl-input" id="sh-name" value="${s.name||''}"/></div>
        <div class="fl"><span class="fl-label">Facility type</span>
          <select class="fl-sel" id="sh-type">
            ${['Community hall','School','Church','Sports centre','Civic centre','Other'].map(t=>`<option ${s.facility_type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="fl"><span class="fl-label">Address</span><input class="fl-input" id="sh-address" value="${s.address||''}"/></div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Ward number</span><input class="fl-input" type="number" id="sh-ward" value="${s.ward_number||''}"/></div>
        <div class="fl"><span class="fl-label">Capacity</span><input class="fl-input" type="number" id="sh-cap" value="${s.capacity||''}"/></div>
      </div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Contact name</span><input class="fl-input" id="sh-cname" value="${s.contact_name||''}"/></div>
        <div class="fl"><span class="fl-label">Contact number</span><input class="fl-input" id="sh-cnum" value="${s.contact_number||''}"/></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text2);margin:8px 0 12px">
        <input type="checkbox" id="sh-wc" ${s.wheelchair_accessible?'checked':''} style="width:14px;height:14px"/> Wheelchair accessible
      </label>
      <div style="display:flex;gap:8px">
        <button class="btn btn-red btn-sm" id="save-shelter-btn" data-id="${s.id||''}">Save shelter</button>
        <button class="btn btn-sm" onclick="document.getElementById('shelter-form-area').innerHTML=''">Cancel</button>
      </div>
    </div>`;

  document.getElementById('save-shelter-btn')?.addEventListener('click', async () => {
    const id   = document.getElementById('save-shelter-btn').dataset.id;
    const name = document.getElementById('sh-name')?.value.trim();
    if (!name) { alert('Shelter name required.'); return; }
    const payload = {
      municipality_id:      _muniId,
      name,
      facility_type:        document.getElementById('sh-type')?.value,
      address:              document.getElementById('sh-address')?.value,
      ward_number:          parseInt(document.getElementById('sh-ward')?.value)||null,
      capacity:             parseInt(document.getElementById('sh-cap')?.value)||0,
      contact_name:         document.getElementById('sh-cname')?.value,
      contact_number:       document.getElementById('sh-cnum')?.value,
      wheelchair_accessible:document.getElementById('sh-wc')?.checked,
      status:               'open', current_occupancy: 0
    };
    const { error } = id
      ? await supabase.from('shelters').update(payload).eq('id', id)
      : await supabase.from('shelters').insert(payload);
    if (error) { showToast(error.message, true); return; }
    showToast('✓ Shelter saved successfully!');
    document.getElementById('shelter-form-area').innerHTML = '';
    await renderShelters(document.getElementById('community-body'));
  });
}

function renderShelterCard(s) {
  const pct         = s.capacity ? Math.round((s.current_occupancy||0) / s.capacity * 100) : 0;
  const statusBadge = { open:'b-green','at-capacity':'b-red',closed:'b-gray',partial:'b-amber' };

  return `
    <div class="rec-card" style="margin-bottom:12px" id="sc-${s.id}">
      <div class="rec-head">
        <div class="rec-icon" style="background:var(--green-dim)">
          <svg viewBox="0 0 15 15" fill="none" stroke="var(--green)" stroke-width="1.5" stroke-linecap="round"><path d="M2 6l5.5-4 5.5 4v7H2z"/><rect x="5" y="9" width="3" height="4"/></svg>
        </div>
        <div style="flex:1">
          <div class="rec-name">${s.name}</div>
          <div class="rec-meta">Ward ${s.ward_number||'?'} · ${s.address||'No address'} · Cap. ${s.capacity||0}</div>
        </div>
        <div class="rec-badges">
          <span class="badge ${statusBadge[s.status]||'b-gray'}">${(s.status||'unknown').toUpperCase()}</span>
          <div class="pub-tog" data-id="${s.id}" data-table="shelters">
            <div class="tog-track ${s.is_published?'on':''}"><div class="tog-knob"></div></div>
            <span style="font-size:10px;font-weight:700;color:${s.is_published?'var(--green)':'var(--text3)'}">${s.is_published?'LIVE':'DRAFT'}</span>
          </div>
        </div>
      </div>
      <div class="rec-body">
        <div class="rf"><span class="rf-key">Occupancy</span>
          <div style="display:flex;align-items:center;gap:8px">
            <input class="fl-input" style="width:64px" value="${s.current_occupancy||0}" id="occ-${s.id}" type="number"/>
            <span style="font-size:11px;color:var(--text3)">/ ${s.capacity||0}</span>
            <div style="flex:1;height:4px;background:var(--bg4);border-radius:2px;overflow:hidden">
              <div style="width:${pct}%;height:4px;background:${pct>=100?'var(--red)':pct>80?'var(--amber)':'var(--green)'}"></div>
            </div>
          </div>
        </div>
        <div class="rf"><span class="rf-key">Status</span>
          <select class="fl-sel" id="status-${s.id}">
            <option value="open" ${s.status==='open'?'selected':''}>Open</option>
            <option value="partial" ${s.status==='partial'?'selected':''}>Partial</option>
            <option value="at-capacity" ${s.status==='at-capacity'?'selected':''}>At capacity</option>
            <option value="closed" ${s.status==='closed'?'selected':''}>Closed</option>
          </select>
        </div>
        <div class="rf"><span class="rf-key">Contact</span><span class="rf-val">${s.contact_name||'—'} · ${s.contact_number||'—'}</span></div>
        <div class="rf"><span class="rf-key">Wheelchair</span><span class="rf-val">${s.wheelchair_accessible?'Yes':'No'}</span></div>
      </div>
      <div class="rec-foot">
        <button class="btn btn-green btn-sm shelter-update" data-id="${s.id}">Update</button>
        <button class="btn btn-sm shelter-edit" data-id="${s.id}">Edit details</button>
        <button class="btn btn-sm shelter-dl-toggle" data-id="${s.id}">↓ Save ▾</button>
        <button class="btn btn-sm btn-red shelter-delete" data-id="${s.id}" style="margin-left:auto">Delete</button>
      </div>
    </div>`;
}

async function downloadShelterPNG(s, template = 'community-board', opts = {}) {
  const tone     = opts.tone || 'notification';
  const readable = opts.readable !== false;
  const accent   = opts.color || '#16a34a';
  const sections = { occupancy:true, facility:true, address:true, ward:true, contact:true, accessibility:true, status:true, generated_date:true, ...(opts.sections||{}) };
  const muniName  = window._drmsaUser?.municipalities?.name || 'Municipality';
  const date      = new Date().toLocaleString('en-ZA');
  const pct       = s.capacity ? Math.round((s.current_occupancy||0) / s.capacity * 100) : 0;
  const statusLabel = (s.status||'UNKNOWN').replace(/-/g,' ').toUpperCase();
  const toneWord  = tone==='advisory'?'Advisory':tone==='update'?'Update':'Notification';
  const bsz       = (readable ? 14 : 12);
  const logoImgs  = await loadLogoImages();

  // ── Canvas dimensions per template
  const dims = { 'community-board':{W:900,H:520}, 'status-panel':{W:960,H:480}, 'social-post':{W:1080,H:1080}, 'field-handout':{W:620,H:877}, 'emergency-strip':{W:1200,H:420} }[template] || {W:900,H:520};
  const { W, H } = dims;
  const canvas = document.createElement('canvas'); canvas.width=W; canvas.height=H;
  const ctx = canvas.getContext('2d');
  const lb = _hexToRgba(accent,0.08), mb = _hexToRgba(accent,0.18);

  const fi = (x,y,w,h,c) => { ctx.fillStyle=c; ctx.fillRect(x,y,w,h); };
  const tx = (str,x,y,font,c,align='left') => { ctx.font=font; ctx.fillStyle=c; ctx.textAlign=align; ctx.fillText(str,x,y); ctx.textAlign='left'; };
  const ln = (x1,y1,x2,y2,c,lw=1) => { ctx.strokeStyle=c; ctx.lineWidth=lw; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); };
  const pill = (label,x,y,bg,tc) => { ctx.font='bold 11px Arial,sans-serif'; const tw=ctx.measureText(label).width; ctx.fillStyle=bg; roundRect(ctx,x,y-13,tw+16,18,4); ctx.fill(); ctx.fillStyle=tc; ctx.fillText(label,x+8,y+1); };
  const field = (label,val,x,y,maxW) => { tx(label.toUpperCase(),x,y,'bold 9px Arial,sans-serif','#888'); const lines=wrapText(ctx,val,maxW); lines.slice(0,3).forEach((l,i)=>tx(l,x,y+13+i*14,'12px Arial,sans-serif','#1a1a1a')); return y+14+Math.min(lines.length,3)*14; };

  const drawHeader = (bgCol) => {
    fi(0,0,W,H,bgCol||'#f9f8f5'); fi(0,0,W,6,accent);
    fi(0,6,W,54,'#fff'); ln(0,60,W,60,'#ddd');
    let lx=14;
    for (const img of logoImgs) { if(!img) continue; const dh=40,dw=Math.min(dh*(img.naturalWidth/img.naturalHeight),80); ctx.drawImage(img,lx,6+(54-dh)/2,dw,dh); lx+=dw+10; }
    tx(muniName,lx+4,30,'bold 12px Arial,sans-serif','#333');
    tx('Disaster Management Centre',lx+4,46,'10px Arial,sans-serif','#888');
    if (sections.generated_date) { tx('Issued: '+date,W-14,30,'10px Arial,sans-serif','#aaa','right'); tx('FOR OFFICIAL USE',W-14,46,'9px Arial,sans-serif','#bbb','right'); }
    return 60;
  };
  const drawFooter = () => { fi(0,H-30,W,30,accent); tx(muniName+' Disaster Management Centre',14,H-10,'10px Arial,sans-serif',_hexToRgba('#fff',0.75)); tx('Generated: '+date,W-14,H-10,'9px Arial,sans-serif',_hexToRgba('#fff',0.6),'right'); };

  if (template === 'community-board') {
    const bodyTop = drawHeader(); const SP=Math.round(W*0.62); const RX=SP+14;
    fi(0,bodyTop,SP,H-bodyTop-30,'#fafaf8'); fi(SP,bodyTop,W-SP,H-bodyTop-30,lb); ln(SP,bodyTop,SP,H-30,'#ddd');
    tx(`Shelter ${toneWord}`,20,bodyTop+36,`bold ${readable?16:14}px Arial,sans-serif`,accent);
    tx(s.name,20,bodyTop+56,`bold ${readable?22:19}px Arial,sans-serif`,'#1a1a1a');
    if (sections.status) pill(statusLabel,20,bodyTop+80,accent,'#fff');
    const para=[{text:s.name,bold:true},{text:' is currently ',bold:false},{text:s.status||'open',bold:true},{text:' and operational as an emergency shelter.',bold:false}];
    let ty=bodyTop+100;
    wrapRichText(ctx,para,SP-40,bsz).forEach(l=>{drawRichLine(ctx,l,20,ty,bsz,'#333');ty+=bsz+6;});
    ty+=8;
    const para2=[{text:'The ',bold:false},{text:muniName+' DMC',bold:true},{text:' confirms Ward '+(s.ward_number||'—')+' capacity: ',bold:false},{text:(s.capacity||0)+' persons',bold:true},{text:'. Occupancy: ',bold:false},{text:(s.current_occupancy||0)+'/'+(s.capacity||0)+' ('+pct+'%)',bold:true}];
    wrapRichText(ctx,para2,SP-40,bsz).forEach(l=>{drawRichLine(ctx,l,20,ty,bsz,'#555');ty+=bsz+6;});
    if (sections.occupancy&&s.capacity) { ty+=10; tx('OCCUPANCY',20,ty,'bold 9px Arial,sans-serif','#888'); ty+=12; fi(20,ty,SP-40,10,'#ddd'); roundRect(ctx,20,ty,Math.max(4,Math.min(pct/100*(SP-40),SP-40)),10,4); ctx.fillStyle=accent; ctx.fill(); tx(`${s.current_occupancy||0} / ${s.capacity} persons (${pct}%)`,20,ty+22,'11px Arial,sans-serif','#555'); }
    let ry=bodyTop+16;
    if (sections.facility)      ry=field('Facility type',s.facility_type||'—',RX,ry,W-RX-14);
    if (sections.address)       ry=field('Address',s.address||'—',RX,ry,W-RX-14);
    if (sections.ward)          ry=field('Ward',String(s.ward_number||'—'),RX,ry,W-RX-14);
    if (sections.contact)       ry=field('Contact',`${s.contact_name||'—'} · ${s.contact_number||'—'}`,RX,ry,W-RX-14);
    if (sections.accessibility) ry=field('Wheelchair access',s.wheelchair_accessible?'Yes — full access':'No',RX,ry,W-RX-14);
    const isy=H-30-60; ln(RX,isy,W-14,isy,'#ccc'); tx('ISSUED BY',RX,isy+14,'bold 9px Arial,sans-serif','#888'); tx(muniName,RX,isy+28,'11px Arial,sans-serif','#333'); tx('Disaster Management',RX,isy+42,'10px Arial,sans-serif','#666');
    drawFooter();

  } else if (template === 'status-panel') {
    const bodyTop = drawHeader(); const cw=Math.floor((W-30)/3);
    fi(0,bodyTop,W,H-bodyTop-30,'#fff');
    tx(`${s.name} — Shelter ${toneWord}`,14,bodyTop+24,`bold ${readable?16:14}px Arial,sans-serif`,accent);
    if (sections.status) pill(statusLabel,14,bodyTop+48,accent,'#fff');
    [{l:'Capacity',v:String(s.capacity||0)},{l:'Occupancy',v:String(s.current_occupancy||0)},{l:'Available',v:String(Math.max(0,(s.capacity||0)-(s.current_occupancy||0)))}].forEach((cd,i)=>{
      const cx=10+i*(cw+5); fi(cx,bodyTop+62,cw,50,lb); ctx.strokeStyle=_hexToRgba(accent,0.25); ctx.lineWidth=0.5; ctx.strokeRect(cx,bodyTop+62,cw,50);
      tx(cd.l,cx+10,bodyTop+76,'bold 9px Arial,sans-serif','#888'); tx(cd.v,cx+10,bodyTop+100,`bold ${readable?20:18}px Arial,sans-serif`,accent);
    });
    if (s.capacity) { const bY=bodyTop+124; fi(10,bY,W-20,10,'#e5e7eb'); fi(10,bY,Math.round((W-20)*pct/100),10,accent); tx(`${pct}% occupied`,10,bY+24,'11px Arial,sans-serif','#555'); }
    const cols=[[sections.address&&s.address,field.bind(null,ctx,'Address',s.address||'—',14,bodyTop+150,W/2-18)],[sections.facility&&s.facility_type,field.bind(null,ctx,'Facility type',s.facility_type||'—',W/2+8,bodyTop+150,W/2-18)],[sections.contact&&s.contact_name,field.bind(null,ctx,'Contact',`${s.contact_name||'—'} · ${s.contact_number||'—'}`,14,bodyTop+190,W/2-18)],[sections.accessibility,field.bind(null,ctx,'Wheelchair',s.wheelchair_accessible?'Yes':'No',W/2+8,bodyTop+190,W/2-18)]];
    let leftY=bodyTop+150, rightY=bodyTop+150;
    if(sections.address)       leftY=field('Address',s.address||'—',14,leftY,W/2-18);
    if(sections.facility)      rightY=field('Facility type',s.facility_type||'—',W/2+8,rightY,W/2-18);
    if(sections.contact)       leftY=field('Contact',`${s.contact_name||'—'} · ${s.contact_number||'—'}`,14,leftY,W/2-18);
    if(sections.accessibility) rightY=field('Wheelchair',s.wheelchair_accessible?'Yes':'No',W/2+8,rightY,W/2-18);
    if(sections.ward)          field('Ward',String(s.ward_number||'—'),14,leftY,W/2-18);
    drawFooter();

  } else if (template === 'social-post') {
    fi(0,0,W,H,_darkenHex(accent,40)); fi(0,0,W,H,'rgba(0,0,0,0.12)');
    fi(0,0,W,H*0.18,'rgba(255,255,255,0.12)');
    tx(muniName,W/2,H*0.09,`bold ${readable?14:12}px Arial,sans-serif`,'rgba(255,255,255,0.9)','center');
    tx('Disaster Management Centre',W/2,H*0.14,'11px Arial,sans-serif','rgba(255,255,255,0.6)','center');
    const bx=W*0.07,bw=W*0.86; fi(bx,H*0.22,bw,H*0.6,'rgba(255,255,255,0.12)');
    if (sections.status) { const pl=pill.toString(); ctx.font='bold 11px Arial,sans-serif'; const tw=ctx.measureText(statusLabel).width; fi(bx+20,H*0.27,tw+20,22,accent); tx(statusLabel,bx+30,H*0.27+15,'bold 11px Arial,sans-serif','#fff'); }
    tx(s.name,W/2,H*0.38,`bold ${readable?28:24}px Arial,sans-serif`,'#fff','center');
    tx(`${s.facility_type||'Shelter'} · Ward ${s.ward_number||'—'}`,W/2,H*0.45,`${readable?14:12}px Arial,sans-serif`,'rgba(255,255,255,0.8)','center');
    if (s.capacity&&sections.occupancy) { const bY=H*0.5,bX=bx+20,bWid=bw-40; fi(bX,bY,bWid,10,_hexToRgba('#fff',0.2)); fi(bX,bY,Math.round(bWid*pct/100),10,accent); tx(`${s.current_occupancy||0} / ${s.capacity} persons (${pct}%)`,W/2,bY+26,'12px Arial,sans-serif','rgba(255,255,255,0.75)','center'); }
    if (sections.address&&s.address)    tx(s.address,W/2,H*0.62,'12px Arial,sans-serif','rgba(255,255,255,0.7)','center');
    if (sections.contact&&s.contact_number) tx(s.contact_number,W/2,H*0.68,'12px Arial,sans-serif','rgba(255,255,255,0.65)','center');
    if (sections.generated_date) tx(date,W/2,H*0.85,'10px Arial,sans-serif','rgba(255,255,255,0.4)','center');

  } else if (template === 'field-handout') {
    fi(0,0,W,H,'#fff'); ctx.strokeStyle=_hexToRgba(accent,0.6); ctx.lineWidth=2; ctx.strokeRect(5,5,W-10,H-10);
    fi(5,5,W-10,28,lb); fi(5,5,W-10,4,accent);
    tx(muniName,W/2,22,'bold 11px Arial,sans-serif',accent,'center'); ln(5,33,W-5,33,_hexToRgba(accent,0.35));
    tx(`SHELTER ${toneWord.toUpperCase()}`,W/2,56,`bold ${readable?18:16}px Arial,sans-serif`,'#1a1a1a','center');
    tx(s.name,W/2,80,`bold ${readable?14:12}px Arial,sans-serif`,accent,'center');
    if (sections.status) { ctx.font='bold 11px Arial,sans-serif'; const tw=ctx.measureText(statusLabel).width; const px=(W-tw-16)/2; fi(px,92,tw+16,20,accent); tx(statusLabel,px+8,106,'bold 11px Arial,sans-serif','#fff'); }
    ln(5,120,W-5,120,_hexToRgba(accent,0.2));
    let y=136;
    if (sections.address)       y=field('Address',s.address||'—',18,y,W-36);
    if (sections.ward)          y=field('Ward number',String(s.ward_number||'—'),18,y,W-36);
    if (sections.facility)      y=field('Facility type',s.facility_type||'—',18,y,W-36);
    if (sections.capacity??sections.occupancy) y=field('Capacity / Occupancy',`${s.capacity||0} persons · ${s.current_occupancy||0} currently (${pct}%)`,18,y,W-36);
    if (sections.contact)       y=field('Contact',`${s.contact_name||'—'} · ${s.contact_number||'—'}`,18,y,W-36);
    if (sections.accessibility) y=field('Wheelchair access',s.wheelchair_accessible?'Yes — full access':'No',18,y,W-36);
    fi(5,H-36,W-10,31,lb); tx('Generated: '+date,W/2,H-16,'9px Arial,sans-serif','#888','center');

  } else if (template === 'emergency-strip') {
    fi(0,0,W,H,accent); fi(0,0,W,H,'rgba(0,0,0,0.25)');
    fi(0,0,W,18,'rgba(255,255,255,0.12)');
    tx(muniName,14,13,'bold 10px Arial,sans-serif','rgba(255,255,255,0.75)');
    if (sections.generated_date) tx(date,W-14,13,'9px Arial,sans-serif','rgba(255,255,255,0.55)','right');
    const SP=Math.round(W*0.6); fi(SP,18,W-SP,H-18,'rgba(255,255,255,0.12)'); ln(SP,18,SP,H,'rgba(255,255,255,0.2)');
    tx(`SHELTER ${toneWord.toUpperCase()}`,18,46,`bold ${readable?20:17}px Arial,sans-serif`,'#fff');
    tx(s.name,18,72,`bold ${readable?28:24}px Arial,sans-serif`,'#fff');
    if (sections.status) { ctx.font='bold 11px Arial,sans-serif'; const tw=ctx.measureText(statusLabel).width; fi(18,84,tw+16,20,'rgba(255,255,255,0.25)'); tx(statusLabel,26,98,'bold 11px Arial,sans-serif','#fff'); }
    if (sections.address&&s.address)     tx(s.address,18,116,'12px Arial,sans-serif','rgba(255,255,255,0.8)');
    if (sections.contact&&s.contact_number) tx(`Contact: ${s.contact_number}`,18,134,'12px Arial,sans-serif','rgba(255,255,255,0.7)');
    let ry=28;
    if (sections.ward)          ry=field('Ward',String(s.ward_number||'—'),SP+16,ry,W-SP-30);
    if (sections.occupancy)     ry=field('Occupancy',`${s.current_occupancy||0} / ${s.capacity||0} (${pct}%)`,SP+16,ry,W-SP-30);
    if (sections.facility)      ry=field('Facility type',s.facility_type||'—',SP+16,ry,W-SP-30);
    if (sections.accessibility) ry=field('Wheelchair',s.wheelchair_accessible?'Yes':'No',SP+16,ry,W-SP-30);
    tx(muniName+' Disaster Management Centre',14,H-10,'bold 9px Arial,sans-serif','rgba(255,255,255,0.7)');
  }

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'),{href:url,download:`shelter-${template}-${(s.name||'shelter').replace(/\s+/g,'-')}.png`}).click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function bindShelterEvents(shelters) {
  document.querySelectorAll('.shelter-update').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const { error } = await supabase.from('shelters').update({
        current_occupancy: parseInt(document.getElementById(`occ-${id}`)?.value)||0,
        status:            document.getElementById(`status-${id}`)?.value,
        updated_at:        new Date().toISOString()
      }).eq('id', id);
      if (!error) showToast('✓ Shelter updated successfully!');
      else showToast(error.message, true);
    });
  });

  document.querySelectorAll('.shelter-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const shelter = shelters.find(s => s.id === btn.dataset.id);
      if (shelter) showShelterForm(shelter);
    });
  });

  document.querySelectorAll('.shelter-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Delete shelter?',
        message: 'This action cannot be undone.',
        confirmText: 'Delete shelter'
      });
      if (!ok) return;
      await supabase.from('shelters').delete().eq('id', btn.dataset.id);
      showToast('Shelter deleted');
      await renderShelters(document.getElementById('community-body'));
    });
  });

  // Download dropdown — fixed position, escapes card overflow
  document.querySelectorAll('.shelter-dl-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const existing = document.getElementById('shared-dl-drop');
      if (existing && existing.dataset.forId === id) { existing.remove(); return; }
      if (existing) existing.remove();

      const rect = btn.getBoundingClientRect();
      const drop = document.createElement('div');
      drop.id = 'shared-dl-drop';
      drop.dataset.forId = id;
      drop.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;z-index:9999;background:var(--bg2);border:1px solid var(--border);border-radius:6px;min-width:170px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.35)`;
      drop.innerHTML = `
        <button data-sh-txt="${id}" style="display:block;width:100%;text-align:left;background:transparent;border:none;border-bottom:1px solid var(--border);padding:9px 14px;font-size:12px;color:var(--text);cursor:pointer;font-family:monospace">📄 Text file (.txt)</button>
        <button data-sh-png="${id}" style="display:block;width:100%;text-align:left;background:transparent;border:none;padding:9px 14px;font-size:12px;color:var(--text);cursor:pointer;font-family:monospace">🖼 Image (.png) · Choose template…</button>`;

      drop.querySelector('[data-sh-txt]').addEventListener('click', () => {
        const s = shelters.find(x => x.id === id); drop.remove(); if (!s) return;
        const text = `SHELTER NOTIFICATION\n${'='.repeat(40)}\n` +
          `Name: ${s.name}\nStatus: ${(s.status||'').toUpperCase()}\n` +
          `Type: ${s.facility_type||'—'}\nAddress: ${s.address||'—'}\n` +
          `Ward: ${s.ward_number||'—'}\nCapacity: ${s.capacity||0}\n` +
          `Current occupancy: ${s.current_occupancy||0}\n` +
          `Contact: ${s.contact_name||'—'} · ${s.contact_number||'—'}\n` +
          `Wheelchair accessible: ${s.wheelchair_accessible?'Yes':'No'}`;
        const blob = new Blob([text], {type:'text/plain'});
        const url  = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), {href:url, download:`shelter-${s.name.replace(/\s+/g,'-')}.txt`}).click();
        URL.revokeObjectURL(url);
      });

      drop.querySelector('[data-sh-png]')?.addEventListener('click', () => {
        const s = shelters.find(x => x.id === id); drop.remove(); if (!s) return;
        openPngTemplatePicker({
          heading: 'Shelter image template',
          templates: SHELTER_PNG_TEMPLATES,
          defaultColors: ['#16a34a','#0ea5e9','#f59e0b','#ef4444','#8b5cf6','#0f766e','#1d4ed8'],
          sectionDefs: [
            { key: 'occupancy',    label: 'Occupancy bar',            default: true },
            { key: 'facility',     label: 'Facility type',            default: true },
            { key: 'address',      label: 'Address',                  default: true },
            { key: 'ward',         label: 'Ward number',              default: true },
            { key: 'contact',      label: 'Contact person & number',  default: true },
            { key: 'accessibility',label: 'Wheelchair access',        default: true },
            { key: 'status',       label: 'Status badge',             default: true },
            { key: 'generated_date',label:'Generated date',           default: true },
          ],
          onDownload: ({ template, tone, readable, sections, color }) => downloadShelterPNG(s, template, { tone, readable, sections, color })
        });
      });

      document.body.appendChild(drop);
    });
  });

  document.addEventListener('click', () => document.getElementById('shared-dl-drop')?.remove());

  document.querySelectorAll('.pub-tog').forEach(tog => {
    tog.addEventListener('click', async () => {
      const track = tog.querySelector('.tog-track');
      const lbl   = tog.querySelector('span');
      track?.classList.toggle('on');
      const isOn = track?.classList.contains('on');
      if (lbl) { lbl.textContent=isOn?'LIVE':'DRAFT'; lbl.style.color=isOn?'var(--green)':'var(--text3)'; }
      await supabase.from(tog.dataset.table||'shelters').update({ is_published:isOn }).eq('id',tog.dataset.id);
    });
  });
}

// ── RELIEF OPERATIONS ─────────────────────────────────────
async function renderReliefOps(body) {
  const { data: ops } = await supabase
    .from('relief_operations').select('*')
    .eq('municipality_id', _muniId).order('created_at', { ascending: false });

  body.innerHTML = `
    <div class="sec-hdr">
      <div><div class="sec-hdr-title">Relief operations</div><div class="sec-hdr-sub">${ops?.length||0} operations</div></div>
      <button class="btn btn-red btn-sm" id="add-relief-btn">+ Add operation</button>
    </div>
    <div id="relief-form-area"></div>
    <div id="relief-list">
      ${ops?.length ? ops.map(op => renderReliefCard(op)).join('') : emptyState('No relief operations yet.')}
    </div>`;

  requestAnimationFrame(() => {
    const btn = document.getElementById('add-relief-btn');
    if (btn) btn.onclick = () => showReliefForm(null);
    bindReliefEvents(ops || []);
  });
}

function showReliefForm(existing) {
  const area = document.getElementById('relief-form-area');
  if (!area) return;
  if (area.innerHTML && !existing) { area.innerHTML = ''; return; }

  const op = existing || {};
  area.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--red-mid);border-radius:8px;padding:16px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">${existing ? 'Edit relief operation' : 'Add relief operation'}</div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Operation name</span><input class="fl-input" id="ro-name" value="${op.name||''}"/></div>
        <div class="fl"><span class="fl-label">Status</span>
          <select class="fl-sel" id="ro-status">
            <option value="upcoming" ${op.status==='upcoming'?'selected':''}>Upcoming</option>
            <option value="active"   ${op.status==='active'  ?'selected':''}>Active</option>
            <option value="ended"    ${op.status==='ended'   ?'selected':''}>Ended</option>
          </select>
        </div>
      </div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Hazard linked</span><input class="fl-input" id="ro-hazard" value="${op.hazard_name||''}"/></div>
        <div class="fl"><span class="fl-label">Ward number</span><input class="fl-input" type="number" id="ro-ward" value="${op.ward_number||''}"/></div>
      </div>
      <div class="fl"><span class="fl-label">Distribution point / location</span><input class="fl-input" id="ro-location" value="${op.distribution_point||''}"/></div>
      <div class="fl"><span class="fl-label">Schedule</span><input class="fl-input" id="ro-schedule" value="${op.schedule||''}" placeholder="e.g. Daily 08:00–12:00"/></div>
      <div class="frow">
        <div class="fl"><span class="fl-label">Responsible organisation</span><input class="fl-input" id="ro-org" value="${op.responsible_org||''}"/></div>
        <div class="fl"><span class="fl-label">Public contact number</span><input class="fl-input" id="ro-contact" value="${op.public_contact||''}"/></div>
      </div>
      <div class="fl"><span class="fl-label">End date</span><input class="fl-input" type="date" id="ro-end" value="${op.end_date||''}"/></div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn btn-green btn-sm" id="save-relief-btn" data-id="${op.id||''}">Save operation</button>
        <button class="btn btn-sm" onclick="document.getElementById('relief-form-area').innerHTML=''">Cancel</button>
      </div>
    </div>`;

  document.getElementById('save-relief-btn')?.addEventListener('click', async () => {
    const id   = document.getElementById('save-relief-btn').dataset.id;
    const name = document.getElementById('ro-name')?.value.trim();
    if (!name) { alert('Operation name is required.'); return; }

    const payload = {
      municipality_id:    _muniId, name,
      status:             document.getElementById('ro-status')?.value,
      hazard_name:        document.getElementById('ro-hazard')?.value,
      ward_number:        parseInt(document.getElementById('ro-ward')?.value)||null,
      distribution_point: document.getElementById('ro-location')?.value,
      schedule:           document.getElementById('ro-schedule')?.value,
      responsible_org:    document.getElementById('ro-org')?.value,
      public_contact:     document.getElementById('ro-contact')?.value,
      end_date:           document.getElementById('ro-end')?.value||null,
      is_published:       false
    };

    const { error } = id
      ? await supabase.from('relief_operations').update(payload).eq('id', id)
      : await supabase.from('relief_operations').insert(payload);

    if (error) { showToast(error.message, true); return; }
    showToast('✓ Relief operation saved successfully!');
    document.getElementById('relief-form-area').innerHTML = '';
    await renderReliefOps(document.getElementById('community-body'));
  });
}

function renderReliefCard(op) {
  return `
    <div class="rec-card" style="margin-bottom:12px" id="ro-${op.id}">
      <div class="rec-head">
        <div class="rec-icon" style="background:var(--blue-dim)">
          <svg viewBox="0 0 15 15" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-linecap="round"><path d="M7.5 2v11M2 7.5h11"/></svg>
        </div>
        <div style="flex:1">
          <div class="rec-name">${op.name}</div>
          <div class="rec-meta">Ward ${op.ward_number||'?'} · ${op.distribution_point||'TBC'} · ${op.schedule||'TBC'}</div>
        </div>
        <div class="rec-badges">
          <span class="badge ${op.status==='active'?'b-green':op.status==='upcoming'?'b-blue':'b-gray'}">${(op.status||'unknown').toUpperCase()}</span>
        </div>
      </div>
      <div class="rec-body">
        <div class="rf"><span class="rf-key">Hazard</span><span class="rf-val">${op.hazard_name||'—'}</span></div>
        <div class="rf"><span class="rf-key">Responsible org</span><span class="rf-val">${op.responsible_org||'—'}</span></div>
        <div class="rf"><span class="rf-key">Public contact</span><span class="rf-val">${op.public_contact||'—'}</span></div>
        <div class="rf"><span class="rf-key">Ends</span><span class="rf-val">${op.end_date?new Date(op.end_date).toLocaleDateString('en-ZA'):'—'}</span></div>
      </div>
      <div class="rec-foot">
        <button class="btn btn-sm btn-green relief-edit" data-id="${op.id}">Edit</button>
        <button class="btn btn-sm relief-dl-toggle" data-id="${op.id}">↓ Save ▾</button>
        <button class="btn btn-sm btn-red relief-delete" data-id="${op.id}" style="margin-left:auto">Delete</button>
      </div>
    </div>`;
}

async function downloadReliefPNG(op, template = 'ops-brief', opts = {}) {
  const tone     = opts.tone || 'notification';
  const readable = opts.readable !== false;
  const accent   = opts.color || { active:'#5a3a1a', upcoming:'#1a3a6b', ended:'#444444' }[op.status] || '#5a3a1a';
  const sections = { hazard:true, ward:true, distribution:true, schedule:true, contact:true, ends:true, responsible_org:true, status_badge:true, generated_date:true, ...(opts.sections||{}) };
  const muniName  = window._drmsaUser?.municipalities?.name || 'Municipality';
  const date      = new Date().toLocaleString('en-ZA');
  const statusLabel = (op.status||'UNKNOWN').toUpperCase();
  const toneWord  = tone==='advisory'?'Advisory':tone==='update'?'Update':'Notification';
  const bsz       = readable ? 14 : 12;
  const logoImgs  = await loadLogoImages();

  const dims = { 'ops-brief':{W:960,H:500}, 'community-notice':{W:900,H:520}, 'social-update':{W:1080,H:1080}, 'info-flyer':{W:700,H:980}, 'timeline-card':{W:900,H:520} }[template] || {W:960,H:500};
  const { W, H } = dims;
  const canvas = document.createElement('canvas'); canvas.width=W; canvas.height=H;
  const ctx = canvas.getContext('2d');
  const lb = _hexToRgba(accent,0.08), mb = _hexToRgba(accent,0.18);

  const fi = (x,y,w,h,c) => { ctx.fillStyle=c; ctx.fillRect(x,y,w,h); };
  const tx = (str,x,y,font,c,align='left') => { ctx.font=font; ctx.fillStyle=c; ctx.textAlign=align; ctx.fillText(str,x,y); ctx.textAlign='left'; };
  const ln = (x1,y1,x2,y2,c,lw=1) => { ctx.strokeStyle=c; ctx.lineWidth=lw; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); };
  const pill = (label,x,y,bg,tc) => { ctx.font='bold 11px Arial,sans-serif'; const tw=ctx.measureText(label).width; ctx.fillStyle=bg; roundRect(ctx,x,y-13,tw+16,18,4); ctx.fill(); ctx.fillStyle=tc; ctx.fillText(label,x+8,y+1); };
  const field = (label,val,x,y,maxW) => { tx(label.toUpperCase(),x,y,'bold 9px Arial,sans-serif','#888'); const lines=wrapText(ctx,val,maxW); lines.slice(0,3).forEach((l,i)=>tx(l,x,y+13+i*14,'12px Arial,sans-serif','#1a1a1a')); return y+14+Math.min(lines.length,3)*14; };

  const drawHeader = (bgCol) => {
    fi(0,0,W,H,bgCol||'#f9f8f5'); fi(0,0,W,6,accent);
    fi(0,6,W,54,'#fff'); ln(0,60,W,60,'#ddd');
    let lx=14;
    for (const img of logoImgs) { if(!img) continue; const dh=40,dw=Math.min(dh*(img.naturalWidth/img.naturalHeight),80); ctx.drawImage(img,lx,6+(54-dh)/2,dw,dh); lx+=dw+10; }
    tx(muniName,lx+4,30,'bold 12px Arial,sans-serif','#333');
    tx('Disaster Management Centre',lx+4,46,'10px Arial,sans-serif','#888');
    if (sections.generated_date) { tx('Issued: '+date,W-14,30,'10px Arial,sans-serif','#aaa','right'); tx('FOR OFFICIAL USE',W-14,46,'9px Arial,sans-serif','#bbb','right'); }
    return 60;
  };
  const drawFooter = () => { fi(0,H-30,W,30,accent); tx(muniName+' Disaster Management Centre',14,H-10,'10px Arial,sans-serif',_hexToRgba('#fff',0.75)); tx('Generated: '+date,W-14,H-10,'9px Arial,sans-serif',_hexToRgba('#fff',0.6),'right'); };

  if (template === 'ops-brief') {
    const bodyTop = drawHeader(); const SP=Math.round(W*0.52); const RX=SP+14;
    fi(0,bodyTop,6,H-bodyTop-30,accent); fi(6,bodyTop,SP-6,H-bodyTop-30,'#fff'); fi(SP,bodyTop,W-SP,H-bodyTop-30,lb);
    ln(SP,bodyTop,SP,H-30,'#ddd');
    tx(`Relief Operation ${toneWord}`,20,bodyTop+28,`bold ${readable?15:13}px Arial,sans-serif`,accent);
    tx(op.name,20,bodyTop+52,`bold ${readable?22:19}px Arial,sans-serif`,'#1a1a1a');
    if (sections.status_badge) pill(statusLabel,20,bodyTop+76,accent,'#fff');
    const para=[{text:'The ',bold:false},{text:muniName+' DMC',bold:true},{text:' confirms that ',bold:false},{text:op.responsible_org||'the responsible organisation',bold:true},{text:' is managing distribution at ',bold:false},{text:op.distribution_point||'TBC',bold:true},{text:'.',bold:false}];
    let ty=bodyTop+96;
    wrapRichText(ctx,para,SP-36,bsz).forEach(l=>{drawRichLine(ctx,l,20,ty,bsz,'#333');ty+=bsz+6;});
    if (op.schedule&&sections.schedule) { ty+=8; const para2=[{text:'Schedule: ',bold:true},{text:op.schedule,bold:false}]; wrapRichText(ctx,para2,SP-36,bsz).forEach(l=>{drawRichLine(ctx,l,20,ty,bsz,'#555');ty+=bsz+6;}); }
    let ry=bodyTop+16;
    if (sections.hazard&&op.hazard_name)         ry=field('Hazard',op.hazard_name,RX,ry,W-RX-14);
    if (sections.ward)                           ry=field('Ward',String(op.ward_number||'—'),RX,ry,W-RX-14);
    if (sections.distribution&&op.distribution_point) ry=field('Distribution point',op.distribution_point,RX,ry,W-RX-14);
    if (sections.contact&&op.public_contact)     ry=field('Public contact',op.public_contact,RX,ry,W-RX-14);
    if (sections.ends&&op.end_date)              ry=field('Ends',new Date(op.end_date).toLocaleDateString('en-ZA'),RX,ry,W-RX-14);
    const isy=H-30-60; ln(RX,isy,W-14,isy,'#ccc'); tx('ISSUED BY',RX,isy+14,'bold 9px Arial,sans-serif','#888'); tx(muniName,RX,isy+28,'11px Arial,sans-serif','#333');
    drawFooter();

  } else if (template === 'community-notice') {
    const bodyTop = drawHeader(); const SP=Math.round(W*0.62); const RX=SP+14;
    fi(0,bodyTop,SP,H-bodyTop-30,'#fafaf8'); fi(SP,bodyTop,W-SP,H-bodyTop-30,lb); ln(SP,bodyTop,SP,H-30,'#ddd');
    tx(`Relief Operation ${toneWord}`,20,bodyTop+36,`bold ${readable?16:14}px Arial,sans-serif`,accent);
    tx(op.name,20,bodyTop+58,`bold ${readable?22:19}px Arial,sans-serif`,'#1a1a1a');
    if (sections.status_badge) pill(statusLabel,20,bodyTop+82,accent,'#fff');
    const para=[{text:op.name,bold:true},{text:' is currently ',bold:false},{text:op.status||'active',bold:true},{text:'.',bold:false}];
    const para2=[{text:'The ',bold:false},{text:muniName+' DMC',bold:true},{text:' confirms that ',bold:false},{text:op.responsible_org||'the responsible organisation',bold:true},{text:' is coordinating relief distribution',bold:false},...(op.distribution_point?[{text:' at ',bold:false},{text:op.distribution_point,bold:true}]:[]),{text:'.',bold:false}];
    let ty=bodyTop+102;
    wrapRichText(ctx,para,SP-40,bsz).forEach(l=>{drawRichLine(ctx,l,20,ty,bsz,'#1a1a1a');ty+=bsz+6;});
    ty+=6;
    wrapRichText(ctx,para2,SP-40,bsz).forEach(l=>{drawRichLine(ctx,l,20,ty,bsz,'#555');ty+=bsz+6;});
    let ry=bodyTop+16;
    if (sections.hazard&&op.hazard_name)         ry=field('Hazard',op.hazard_name,RX,ry,W-RX-14);
    if (sections.ward)                           ry=field('Ward',String(op.ward_number||'—'),RX,ry,W-RX-14);
    if (sections.distribution&&op.distribution_point) ry=field('Distribution point',op.distribution_point,RX,ry,W-RX-14);
    if (sections.schedule&&op.schedule)          ry=field('Schedule',op.schedule,RX,ry,W-RX-14);
    if (sections.contact&&op.public_contact)     ry=field('Public contact',op.public_contact,RX,ry,W-RX-14);
    if (sections.ends&&op.end_date)              ry=field('Ends',new Date(op.end_date).toLocaleDateString('en-ZA'),RX,ry,W-RX-14);
    const isy=H-30-60; ln(RX,isy,W-14,isy,'#ccc'); tx('ISSUED BY',RX,isy+14,'bold 9px Arial,sans-serif','#888'); tx(muniName,RX,isy+28,'11px Arial,sans-serif','#333');
    drawFooter();

  } else if (template === 'social-update') {
    fi(0,0,W,H,_darkenHex(accent,40)); fi(0,0,W,H,'rgba(0,0,0,0.12)');
    fi(0,0,W,H*0.18,'rgba(255,255,255,0.12)');
    tx(muniName,W/2,H*0.09,`bold ${readable?14:12}px Arial,sans-serif`,'rgba(255,255,255,0.9)','center');
    tx('Relief Operation Update',W/2,H*0.14,'11px Arial,sans-serif','rgba(255,255,255,0.6)','center');
    fi(W*0.07,H*0.22,W*0.86,H*0.6,'rgba(255,255,255,0.12)');
    if (sections.status_badge) { ctx.font='bold 11px Arial,sans-serif'; const tw=ctx.measureText(statusLabel).width; fi(W*0.07+20,H*0.26,tw+16,22,accent); tx(statusLabel,W*0.07+28,H*0.26+15,'bold 11px Arial,sans-serif','#fff'); }
    tx(op.name,W/2,H*0.38,`bold ${readable?28:24}px Arial,sans-serif`,'#fff','center');
    if (sections.distribution&&op.distribution_point) tx(op.distribution_point,W/2,H*0.45,`${readable?14:12}px Arial,sans-serif`,'rgba(255,255,255,0.8)','center');
    if (sections.schedule&&op.schedule)     tx(op.schedule,W/2,H*0.52,`${readable?13:11}px Arial,sans-serif`,'rgba(255,255,255,0.7)','center');
    if (sections.contact&&op.public_contact) tx(`Contact: ${op.public_contact}`,W/2,H*0.6,'12px Arial,sans-serif','rgba(255,255,255,0.65)','center');
    if (sections.hazard&&op.hazard_name)    tx(`Hazard: ${op.hazard_name}`,W/2,H*0.67,'11px Arial,sans-serif','rgba(255,255,255,0.55)','center');
    if (sections.generated_date) tx(date,W/2,H*0.85,'10px Arial,sans-serif','rgba(255,255,255,0.4)','center');

  } else if (template === 'info-flyer') {
    fi(0,0,W,H,'#fff');
    fi(0,0,W,H*0.32,accent); fi(0,0,W,H*0.32,'rgba(0,0,0,0.2)');
    let lx=16; for (const img of logoImgs) { if(!img) continue; const dh=36,dw=Math.min(dh*(img.naturalWidth/img.naturalHeight),72); ctx.drawImage(img,lx,14,dw,dh); lx+=dw+10; }
    tx(muniName,lx+4,26,'bold 11px Arial,sans-serif','rgba(255,255,255,0.9)');
    tx('Disaster Management Centre',lx+4,40,'9px Arial,sans-serif','rgba(255,255,255,0.65)');
    if (sections.status_badge) { ctx.font='bold 11px Arial,sans-serif'; const tw=ctx.measureText(statusLabel).width; fi(W/2-(tw+16)/2,H*0.14,tw+16,22,_hexToRgba('#fff',0.25)); tx(statusLabel,W/2-(tw)/2,H*0.14+15,'bold 11px Arial,sans-serif','#fff'); }
    tx(op.name,W/2,H*0.24,`bold ${readable?24:20}px Arial,sans-serif`,'#fff','center');
    tx(`Relief ${toneWord}`,W/2,H*0.30,'11px Arial,sans-serif','rgba(255,255,255,0.7)','center');
    fi(0,H*0.32,W,H-H*0.32,lb);
    tx('Distribution & Relief Information',W/2,H*0.36,`bold ${readable?14:12}px Arial,sans-serif`,accent,'center');
    ln(W*0.1,H*0.38,W*0.9,H*0.38,_hexToRgba(accent,0.3));
    let y=H*0.40;
    if (sections.distribution&&op.distribution_point) y=field('Distribution point',op.distribution_point,20,y,W-40);
    if (sections.schedule&&op.schedule)               y=field('Schedule',op.schedule,20,y,W-40);
    if (sections.hazard&&op.hazard_name)              y=field('Hazard',op.hazard_name,20,y,W-40);
    if (sections.ward)                                y=field('Ward',String(op.ward_number||'—'),20,y,W-40);
    if (sections.responsible_org&&op.responsible_org) y=field('Responsible organisation',op.responsible_org,20,y,W-40);
    if (sections.contact&&op.public_contact)          y=field('Public contact',op.public_contact,20,y,W-40);
    if (sections.ends&&op.end_date)                   y=field('Operation ends',new Date(op.end_date).toLocaleDateString('en-ZA'),20,y,W-40);
    fi(0,H-36,W,36,lb); tx('Generated: '+date,W/2,H-14,'9px Arial,sans-serif','#888','center');

  } else if (template === 'timeline-card') {
    const bodyTop = drawHeader();
    fi(0,bodyTop,W,H-bodyTop-30,'#fff');
    tx(`${op.name} — Relief ${toneWord}`,14,bodyTop+26,`bold ${readable?15:13}px Arial,sans-serif`,accent);
    if (sections.status_badge) pill(statusLabel,14,bodyTop+50,accent,'#fff');
    const lx=40, lineX=lx; const milY=bodyTop+70, milEnd=H-50;
    ctx.strokeStyle='#e5e7eb'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(lineX,milY); ctx.lineTo(lineX,milEnd); ctx.stroke();
    const milestones=[{l:'Operation opened',d:new Date(op.created_at||Date.now()).toLocaleDateString('en-ZA'),done:true},{l:'Distribution point active',d:op.distribution_point||'TBC',done:op.status==='active'||op.status==='ended'},{l:'Operation closes',d:op.end_date?new Date(op.end_date).toLocaleDateString('en-ZA'):'TBC',done:op.status==='ended'}];
    const step=Math.floor((milEnd-milY)/milestones.length);
    milestones.forEach((m,i)=>{ const my=milY+20+i*step; ctx.fillStyle=m.done?accent:'#e5e7eb'; ctx.beginPath(); ctx.arc(lineX,my,7,0,Math.PI*2); ctx.fill(); if(m.done){tx('✓',lineX,my+4,'bold 9px Arial,sans-serif','#fff','center');} tx(m.l,lineX+18,my+2,`bold ${bsz}px Arial,sans-serif`,m.done?'#1a1a1a':'#aaa'); tx(m.d,lineX+18,my+16,'10px Arial,sans-serif','#888'); });
    const RX=Math.floor(W*0.55); ln(RX,bodyTop+66,RX,H-30,'#e5e7eb');
    let ry=bodyTop+70;
    if (sections.hazard&&op.hazard_name)         ry=field('Hazard',op.hazard_name,RX+14,ry,W-RX-28);
    if (sections.distribution&&op.distribution_point) ry=field('Distribution point',op.distribution_point,RX+14,ry,W-RX-28);
    if (sections.schedule&&op.schedule)          ry=field('Schedule',op.schedule,RX+14,ry,W-RX-28);
    if (sections.responsible_org&&op.responsible_org) ry=field('Organisation',op.responsible_org,RX+14,ry,W-RX-28);
    if (sections.contact&&op.public_contact)     ry=field('Public contact',op.public_contact,RX+14,ry,W-RX-28);
    drawFooter();
  }

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'),{href:url,download:`relief-op-${template}-${(op.name||'op').replace(/\s+/g,'-')}.png`}).click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function bindReliefEvents(ops) {
  document.querySelectorAll('.relief-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = ops.find(o => o.id === btn.dataset.id);
      if (op) showReliefForm(op);
    });
  });

  document.querySelectorAll('.relief-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Delete operation?',
        message: 'This action cannot be undone.',
        confirmText: 'Delete operation'
      });
      if (!ok) return;
      await supabase.from('relief_operations').delete().eq('id', btn.dataset.id);
      showToast('Operation deleted');
      await renderReliefOps(document.getElementById('community-body'));
    });
  });

  // Download dropdown — fixed position, escapes card overflow
  document.querySelectorAll('.relief-dl-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const existing = document.getElementById('shared-dl-drop');
      if (existing && existing.dataset.forId === id) { existing.remove(); return; }
      if (existing) existing.remove();

      const rect = btn.getBoundingClientRect();
      const drop = document.createElement('div');
      drop.id = 'shared-dl-drop';
      drop.dataset.forId = id;
      drop.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${rect.left}px;z-index:9999;background:var(--bg2);border:1px solid var(--border);border-radius:6px;min-width:170px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.35)`;
      drop.innerHTML = `
        <button data-ro-txt="${id}" style="display:block;width:100%;text-align:left;background:transparent;border:none;border-bottom:1px solid var(--border);padding:9px 14px;font-size:12px;color:var(--text);cursor:pointer;font-family:monospace">📄 Text file (.txt)</button>
        <button data-ro-png="${id}" style="display:block;width:100%;text-align:left;background:transparent;border:none;padding:9px 14px;font-size:12px;color:var(--text);cursor:pointer;font-family:monospace">🖼 Image (.png) · Choose template…</button>`;

      drop.querySelector('[data-ro-txt]').addEventListener('click', () => {
        const op = ops.find(o => o.id === id); drop.remove(); if (!op) return;
        const text = `RELIEF OPERATION NOTIFICATION\n${'='.repeat(40)}\n` +
          `Operation: ${op.name}\nStatus: ${(op.status||'').toUpperCase()}\n` +
          `Hazard: ${op.hazard_name||'—'}\nWard: ${op.ward_number||'—'}\n` +
          `Distribution point: ${op.distribution_point||'—'}\nSchedule: ${op.schedule||'—'}\n` +
          `Responsible org: ${op.responsible_org||'—'}\nPublic contact: ${op.public_contact||'—'}\n` +
          `End date: ${op.end_date ? new Date(op.end_date).toLocaleDateString('en-ZA') : '—'}`;
        const blob = new Blob([text], {type:'text/plain'});
        const url  = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), {href:url, download:`relief-op-${op.name.replace(/\s+/g,'-')}.txt`}).click();
        URL.revokeObjectURL(url);
      });

      drop.querySelector('[data-ro-png]')?.addEventListener('click', () => {
        const op = ops.find(o => o.id === id); drop.remove(); if (!op) return;
        openPngTemplatePicker({
          heading: 'Relief operation image template',
          templates: RELIEF_PNG_TEMPLATES,
          defaultColors: ['#b45309','#1d4ed8','#15803d','#dc2626','#7c3aed','#0f766e','#374151'],
          sectionDefs: [
            { key: 'hazard',          label: 'Hazard type',               default: true },
            { key: 'ward',            label: 'Ward number',               default: true },
            { key: 'distribution',    label: 'Distribution point',        default: true },
            { key: 'schedule',        label: 'Schedule & hours',          default: true },
            { key: 'contact',         label: 'Public contact',            default: true },
            { key: 'responsible_org', label: 'Responsible organisation',  default: true },
            { key: 'ends',            label: 'Operation end date',        default: true },
            { key: 'status_badge',    label: 'Status badge',              default: true },
            { key: 'generated_date',  label: 'Generated date',            default: true },
          ],
          onDownload: ({ template, tone, readable, sections, color }) => downloadReliefPNG(op, template, { tone, readable, sections, color })
        });
      });

      document.body.appendChild(drop);
    });
  });

  document.addEventListener('click', () => document.getElementById('shared-dl-drop')?.remove());
}

function emptyState(msg) {
  return `<div style="text-align:center;padding:48px 20px;color:var(--text3);font-size:12px">${msg}</div>`;
}

function showToast(msg, isError=false) {
  document.querySelectorAll('.drmsa-toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'drmsa-toast';
  t.style.cssText = `position:fixed;bottom:80px;right:24px;background:${isError?'var(--bg2)':'var(--bg2)'};border:1px solid ${isError?'var(--red)':'var(--green)'};color:${isError?'var(--red)':'var(--green)'};padding:12px 18px;border-radius:8px;font-size:13px;font-weight:600;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,.3);transition:opacity .3s;max-width:320px`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(() => t.remove(), 300); }, 3000);
}
