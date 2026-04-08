// contingency-assistant-panel.ts
// Lives in root alongside your other .ts source files.
// Builds to contingency-dist/contingency-assistant-panel.js
//
// Calls the Supabase Edge Function: contingency-assistant
// The edge function URL is: https://<your-project>.supabase.co/functions/v1/contingency-assistant
// Set SUPABASE_EDGE_URL in your environment or replace the constant below.
import { supabase } from './supabase.js';
// ─── Config ───────────────────────────────────────────────────────────────────
const EDGE_FUNCTION_URL = 'https://olibqhpguquktrznchjm.supabase.co/functions/v1/contingency-assistant';
// ─── Module state ─────────────────────────────────────────────────────────────
let _panelBuilt = false;
let _currentTab = 'legislation';
let _lastContextKey = '';
let _lastData = null;
let _debounceTimer = null;
const _listeners = [];
// ─── Escape helper ────────────────────────────────────────────────────────────
function esc(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
// ─── Styles ───────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('ca-styles'))
        return;
    const style = document.createElement('style');
    style.id = 'ca-styles';
    style.textContent = `
    #ca-panel {
      position: fixed;
      top: 0; right: 0;
      width: 380px;
      height: 100vh;
      background: var(--bg2, #f8f9fb);
      border-left: 1px solid var(--line, #e2e6ed);
      box-shadow: -4px 0 24px rgba(0,0,0,0.10);
      display: flex;
      flex-direction: column;
      z-index: 9999;
      font-size: 13px;
      transform: translateX(100%);
      transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #ca-panel.ca-open { transform: translateX(0); }

    #ca-toggle {
      position: fixed;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      background: var(--accent, #1d4ed8);
      color: #fff;
      border: none;
      border-radius: 8px 0 0 8px;
      padding: 12px 7px;
      cursor: pointer;
      z-index: 10000;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.05em;
      writing-mode: vertical-rl;
      line-height: 1;
      transition: background 0.15s, right 0.28s cubic-bezier(0.4,0,0.2,1);
      box-shadow: -2px 0 10px rgba(29,78,216,0.25);
    }
    #ca-toggle:hover { background: #1e40af; }
    body.ca-open #ca-toggle { right: 380px; }

    #ca-header {
      padding: 14px 16px 0;
      border-bottom: 1px solid var(--line, #e2e6ed);
      background: var(--bg, #fff);
      flex-shrink: 0;
    }
    .ca-header-top {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 10px;
    }
    .ca-title {
      font-size: 13px; font-weight: 700; color: var(--text, #111);
      display: flex; align-items: center; gap: 7px;
    }
    .ca-title-icon {
      width: 22px; height: 22px;
      background: var(--accent, #1d4ed8);
      border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 12px;
    }
    .ca-close {
      background: none; border: none; cursor: pointer;
      color: var(--text2, #666); font-size: 18px; padding: 0 2px; line-height: 1;
    }
    .ca-close:hover { color: var(--text, #111); }

    #ca-context-badge {
      font-size: 11px; color: var(--text2, #666);
      padding: 6px 0 10px; min-height: 22px;
    }
    .ca-badge {
      display: inline-flex; align-items: center; gap: 5px;
      background: var(--bg3, #eff3fb);
      border: 1px solid var(--line, #e2e6ed);
      border-radius: 4px; padding: 2px 8px;
      font-size: 11px; color: var(--accent, #1d4ed8);
      font-weight: 600; margin-right: 4px;
    }

    .ca-tabs { display: flex; }
    .ca-tab {
      flex: 1; padding: 8px 4px; border: none; background: none;
      cursor: pointer; font-size: 11.5px; font-weight: 500;
      color: var(--text2, #888); border-bottom: 2px solid transparent;
      transition: all 0.15s; text-align: center;
    }
    .ca-tab:hover { color: var(--text, #111); }
    .ca-tab.ca-tab-active {
      color: var(--accent, #1d4ed8);
      border-bottom-color: var(--accent, #1d4ed8);
      font-weight: 700;
    }

    #ca-body { flex: 1; overflow-y: auto; padding: 14px 16px; }
    #ca-body::-webkit-scrollbar { width: 5px; }
    #ca-body::-webkit-scrollbar-thumb { background: var(--line, #ddd); border-radius: 3px; }

    .ca-loading {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 12px; padding: 40px 16px;
      color: var(--text2, #888);
    }
    .ca-spinner {
      width: 24px; height: 24px;
      border: 2px solid var(--line, #e2e6ed);
      border-top-color: var(--accent, #1d4ed8);
      border-radius: 50%;
      animation: ca-spin 0.7s linear infinite;
    }
    @keyframes ca-spin { to { transform: rotate(360deg); } }

    .ca-idle {
      padding: 32px 12px; text-align: center;
      color: var(--text2, #888); line-height: 1.6;
    }
    .ca-idle-icon { font-size: 32px; margin-bottom: 10px; }

    .ca-section-desc {
      background: var(--bg3, #eff3fb);
      border-left: 3px solid var(--accent, #1d4ed8);
      border-radius: 0 6px 6px 0;
      padding: 10px 12px; font-size: 12px; line-height: 1.55;
      color: var(--text, #1a2436); margin-bottom: 14px;
    }

    .ca-card {
      background: var(--bg, #fff);
      border: 1px solid var(--line, #e2e6ed);
      border-radius: 8px; margin-bottom: 10px; overflow: hidden;
    }
    .ca-card-head {
      padding: 9px 12px;
      display: flex; align-items: flex-start;
      justify-content: space-between; gap: 8px;
      border-bottom: 1px solid var(--line, #f0f2f5);
    }
    .ca-card-title {
      font-size: 11.5px; font-weight: 700;
      color: var(--text, #111); line-height: 1.35;
    }
    .ca-card-type {
      font-size: 10px; font-weight: 600;
      padding: 2px 7px; border-radius: 999px; white-space: nowrap; flex-shrink: 0;
    }
    .ca-type-act       { background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; }
    .ca-type-standard  { background:#fffbeb; color:#92400e; border:1px solid #fde68a; }
    .ca-type-framework { background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; }
    .ca-type-policy    { background:#f5f3ff; color:#5b21b6; border:1px solid #ddd6fe; }
    .ca-type-guideline { background:#ecfeff; color:#0e7490; border:1px solid #a5f3fc; }
    .ca-type-regulation{ background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; }

    .ca-card-body { padding: 10px 12px; }
    .ca-citation {
      font-size: 11px; color: var(--text2, #666);
      font-style: italic; margin-bottom: 6px;
    }
    .ca-summary {
      font-size: 12px; color: var(--text, #2a3441);
      line-height: 1.55; margin-bottom: 8px;
    }
    .ca-clauses { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
    .ca-clause {
      background: var(--bg3, #eff3fb); border: 1px solid #c7d7f8;
      border-radius: 4px; padding: 2px 8px;
      font-size: 10.5px; color: #1e3a8a; font-weight: 500;
    }
    .ca-source-link {
      font-size: 10.5px; color: var(--accent, #1d4ed8);
      text-decoration: none; display: inline-flex; align-items: center; gap: 3px;
    }
    .ca-source-link:hover { text-decoration: underline; }
    .ca-primary-flag {
      display: inline-block; font-size: 9.5px; font-weight: 700;
      color: #b45309; background: #fffbeb; border: 1px solid #fde68a;
      border-radius: 3px; padding: 1px 6px; margin-left: 5px; vertical-align: middle;
    }

    .ca-guide-label {
      font-size: 11px; font-weight: 700; color: var(--text2, #666);
      text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px;
    }
    .ca-guide-desc {
      font-size: 12px; color: var(--text, #2a3441); line-height: 1.55;
      margin-bottom: 12px; padding: 10px 12px;
      background: #fffbeb; border-left: 3px solid #f59e0b;
      border-radius: 0 6px 6px 0;
    }

    .ca-table-preview {
      background: var(--bg, #fff); border: 1px solid var(--line, #e2e6ed);
      border-radius: 8px; overflow: hidden; margin-bottom: 10px;
    }
    .ca-table-preview-head {
      font-size: 11.5px; font-weight: 700; color: var(--text, #111);
      padding: 9px 12px; background: var(--bg3, #f3f6fb);
      border-bottom: 1px solid var(--line, #e2e6ed);
    }
    .ca-col-guide {
      padding: 8px 12px; border-bottom: 1px solid var(--line, #f0f2f5);
    }
    .ca-col-guide:last-child { border-bottom: none; }
    .ca-col-name { font-size: 11.5px; font-weight: 600; color: var(--accent, #1d4ed8); margin-bottom: 2px; }
    .ca-col-hint { font-size: 11px; color: var(--text2, #666); margin-bottom: 3px; }
    .ca-col-example {
      font-size: 11px; color: #166534; background: #f0fdf4;
      border: 1px solid #bbf7d0; border-radius: 3px; padding: 2px 8px; display: inline-block;
    }

    .ca-example-row-wrap {
      padding: 10px 12px; background: var(--bg, #fff);
      border: 1px solid var(--line, #e2e6ed); border-radius: 8px; margin-bottom: 10px;
    }
    .ca-example-row-label {
      font-size: 11px; font-weight: 700; color: var(--text2, #666);
      text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .ca-example-rows-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .ca-example-rows-table th {
      text-align: left; color: var(--text2, #888); font-weight: 600;
      padding: 4px 6px; border-bottom: 1px solid var(--line, #e2e6ed);
      white-space: nowrap; font-size: 10.5px;
    }
    .ca-example-rows-table td {
      padding: 5px 6px; color: var(--text, #2a3441);
      border-bottom: 1px solid var(--line, #f5f5f5); vertical-align: top;
    }
    .ca-example-rows-table tr:last-child td { border-bottom: none; }

    .ca-suggestion {
      background: var(--bg, #fff); border: 1px solid var(--line, #e2e6ed);
      border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;
    }
    .ca-suggestion-text { font-size: 12px; color: var(--text, #2a3441); line-height: 1.6; margin-bottom: 8px; }
    .ca-suggestion-item {
      font-size: 11.5px; color: var(--text, #2a3441);
      padding: 3px 0; border-bottom: 1px solid var(--line, #f5f5f5);
    }
    .ca-suggestion-item:last-of-type { border-bottom: none; }

    .ca-copy-btn {
      display: inline-flex; align-items: center; gap: 5px;
      background: var(--bg3, #eff3fb); border: 1px solid #c7d7f8;
      border-radius: 5px; padding: 4px 10px; font-size: 11px; font-weight: 600;
      color: var(--accent, #1d4ed8); cursor: pointer; transition: background 0.12s;
    }
    .ca-copy-btn:hover { background: #dbeafe; }
    .ca-copy-btn.ca-copied { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }

    .ca-live-card {
      background: var(--bg, #fff); border: 1px solid var(--line, #e2e6ed);
      border-radius: 8px; margin-bottom: 10px; overflow: hidden;
    }
    .ca-live-head {
      display: flex; align-items: center; gap: 7px; padding: 9px 12px;
      background: var(--bg3, #f3f6fb); border-bottom: 1px solid var(--line, #e2e6ed);
    }
    .ca-live-dot {
      width: 7px; height: 7px; border-radius: 50%; background: #22c55e; flex-shrink: 0;
      animation: ca-pulse 1.8s ease-in-out infinite;
    }
    @keyframes ca-pulse {
      0%,100% { opacity:1; transform:scale(1); }
      50%      { opacity:0.5; transform:scale(0.85); }
    }
    .ca-live-label { font-size: 11.5px; font-weight: 700; color: var(--text, #111); flex: 1; }
    .ca-live-snippet {
      padding: 10px 12px; font-size: 11px; color: var(--text2, #555);
      line-height: 1.55; max-height: 80px; overflow: hidden; position: relative;
    }
    .ca-live-snippet::after {
      content:''; position:absolute; bottom:0; left:0; right:0; height:24px;
      background: linear-gradient(transparent, var(--bg, #fff));
    }
    .ca-live-link {
      display: block; padding: 6px 12px; font-size: 11px;
      color: var(--accent, #1d4ed8); text-decoration: none;
      border-top: 1px solid var(--line, #f0f2f5);
    }
    .ca-live-link:hover { background: var(--bg3, #eff3fb); }

    .ca-url-list { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
    .ca-url-item {
      display: flex; align-items: center; gap: 8px; padding: 7px 10px;
      background: var(--bg, #fff); border: 1px solid var(--line, #e2e6ed);
      border-radius: 6px; text-decoration: none; transition: background 0.12s;
    }
    .ca-url-item:hover { background: var(--bg3, #eff3fb); }
    .ca-url-label { font-size: 11.5px; color: var(--accent, #1d4ed8); font-weight: 500; flex: 1; }
    .ca-url-arrow { color: var(--text2, #aaa); font-size: 12px; }

    .ca-empty { text-align: center; color: var(--text2, #aaa); font-size: 12px; padding: 24px 12px; }
    .ca-divider { height: 1px; background: var(--line, #e2e6ed); margin: 14px 0; }

    @media (min-width: 900px) {
      body.ca-open #cp-layout {
        padding-right: 396px;
        transition: padding-right 0.28s cubic-bezier(0.4,0,0.2,1);
      }
    }
  `;
    document.head.appendChild(style);
}
// ─── Build panel DOM (once) ───────────────────────────────────────────────────
function buildPanel() {
    if (_panelBuilt)
        return;
    _panelBuilt = true;
    const toggle = document.createElement('button');
    toggle.id = 'ca-toggle';
    toggle.textContent = '✦ Assistant';
    toggle.title = 'Open Plan Assistant';
    document.body.appendChild(toggle);
    const panel = document.createElement('div');
    panel.id = 'ca-panel';
    panel.innerHTML = `
    <div id="ca-header">
      <div class="ca-header-top">
        <div class="ca-title">
          <div class="ca-title-icon">✦</div>
          Plan Assistant
        </div>
        <button class="ca-close" id="ca-close" title="Close">✕</button>
      </div>
      <div id="ca-context-badge">Click any text, list, or table block to get suggestions.</div>
      <div class="ca-tabs">
        <button class="ca-tab ca-tab-active" data-ca-tab="legislation">Legislation</button>
        <button class="ca-tab" data-ca-tab="preview">Guide</button>
        <button class="ca-tab" data-ca-tab="suggestions">Suggestions</button>
        <button class="ca-tab" data-ca-tab="live">Live Info</button>
        <button class="ca-tab" data-ca-tab="layout">Plan Layout</button>
      </div>
    </div>
    <div id="ca-body">
      <div class="ca-idle">
        <div class="ca-idle-icon">📋</div>
        <strong>Click any block to get started.</strong><br/>
        Relevant legislation, fill guides, and SA reference information will appear here.
      </div>
    </div>
  `;
    document.body.appendChild(panel);
    const openClose = (open) => {
        panel.classList.toggle('ca-open', open);
        document.body.classList.toggle('ca-open', open);
        toggle.textContent = open ? '✕ Close' : '✦ Assistant';
    };
    toggle.addEventListener('click', () => openClose(!panel.classList.contains('ca-open')));
    document.getElementById('ca-close').addEventListener('click', () => openClose(false));
    panel.querySelectorAll('.ca-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            panel.querySelectorAll('.ca-tab').forEach(t => t.classList.remove('ca-tab-active'));
            tab.classList.add('ca-tab-active');
            _currentTab = tab.getAttribute('data-ca-tab') || 'legislation';
            if (_lastData)
                renderTabContent(_lastData);
        });
    });
}
// ─── Public: init — call at end of renderPlanDetail() ────────────────────────
export function initAssistantPanel() {
    injectStyles();
    buildPanel();
    attachBlockListeners();
}
// ─── Public: destroy — call at TOP of renderPlanDetail() before re-render ────
export function destroyAssistantPanel() {
    // Remove all tracked event listeners so stale DOM nodes don't fire.
    _listeners.forEach(({ el, type, fn }) => el.removeEventListener(type, fn));
    _listeners.length = 0;
}
// ─── Attach focus/click listeners to every data-assistant-trigger element ────
function attachBlockListeners() {
    document.querySelectorAll('[data-assistant-trigger]').forEach(el => {
        const fn = (e) => onBlockActivated(e.currentTarget);
        el.addEventListener('focus', fn, { capture: true });
        el.addEventListener('click', fn, { capture: true });
        _listeners.push({ el, type: 'focus', fn: fn });
        _listeners.push({ el, type: 'click', fn: fn });
    });
}
function onBlockActivated(el) {
    const sectionKey = el.getAttribute('data-sec-key') || '';
    const planType = el.getAttribute('data-plan-type') || '';
    const planCat = el.getAttribute('data-plan-cat') || '';
    const blockType = el.getAttribute('data-block-type') || 'text';
    const blockContent = el.value || el.textContent || '';
    if (!sectionKey)
        return;
    const ctxKey = `${sectionKey}|${planType}|${planCat}|${blockType}`;
    if (ctxKey === _lastContextKey)
        return; // same block, skip
    if (_debounceTimer)
        clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => fetchSuggestions(sectionKey, planType, planCat, blockType, blockContent, ctxKey), 280);
}
// ─── Fetch from edge function ─────────────────────────────────────────────────
async function fetchSuggestions(sectionKey, planType, planCat, blockType, blockContent, ctxKey) {
    const panel = document.getElementById('ca-panel');
    if (!panel)
        return;
    // Auto-open the panel when a block is focused.
    panel.classList.add('ca-open');
    document.body.classList.add('ca-open');
    const toggleBtn = document.getElementById('ca-toggle');
    if (toggleBtn)
        toggleBtn.textContent = '✕ Close';
    updateContextBadge(sectionKey, planType, planCat);
    showLoading();
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({
                sectionKey,
                planTypeCode: planType,
                planCategory: planCat,
                blockType,
                blockContent: blockContent.substring(0, 500),
            }),
        });
        if (!res.ok)
            throw new Error(`Edge function returned ${res.status}`);
        const data = await res.json();
        _lastContextKey = ctxKey;
        _lastData = data;
        renderTabContent(data);
    }
    catch (err) {
        const body = document.getElementById('ca-body');
        if (body) {
            body.innerHTML = `<div class="ca-empty" style="color:#c44">
        ⚠ Could not load suggestions.<br/>
        <small style="font-size:10px;margin-top:4px;display:block">${esc(err?.message || String(err))}</small>
      </div>`;
        }
    }
}
// ─── Context badge ────────────────────────────────────────────────────────────
function updateContextBadge(sectionKey, planType, planCat) {
    const badge = document.getElementById('ca-context-badge');
    if (!badge)
        return;
    const label = sectionKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    badge.innerHTML = `
    <span class="ca-badge">${esc(label)}</span>
    ${planType ? `<span class="ca-badge">${esc(planType.replace(/_/g, ' '))}</span>` : ''}
    ${planCat ? `<span class="ca-badge">${esc(planCat.replace(/_/g, ' '))}</span>` : ''}
  `;
}
// ─── Loading ──────────────────────────────────────────────────────────────────
function showLoading() {
    const body = document.getElementById('ca-body');
    if (body)
        body.innerHTML = `<div class="ca-loading"><div class="ca-spinner"></div><span>Loading references…</span></div>`;
}
// ─── Tab router ───────────────────────────────────────────────────────────────────────────────────
function renderTabContent(data) {
    const body = document.getElementById('ca-body');
    if (!body)
        return;
    // Build html string first, assign once to avoid querying a partially-rendered DOM.
    let html = '';
    if (_currentTab === 'legislation')
        html = renderLegislation(data);
    else if (_currentTab === 'preview')
        html = renderGuide(data);
    else if (_currentTab === 'suggestions')
        html = renderSuggestions(data);
    else if (_currentTab === 'live')
        html = renderLive(data);
    else if (_currentTab === 'layout')
        html = renderMockLayout(data);
    else
        html = renderLegislation(data);
    body.innerHTML = html;
    // Array.from converts NodeList → real Array so .forEach always works,
    // regardless of build target or TypeScript transpilation output.
    Array.from(body.querySelectorAll('.ca-copy-btn')).forEach(function (node) {
        var btn = node;
        btn.addEventListener('click', function () {
            var text = btn.getAttribute('data-copy') || '';
            if (!text)
                return;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text)
                    .then(function () { flashCopied(btn); })
                    .catch(function () { fallbackCopy(text, btn); });
            }
            else {
                fallbackCopy(text, btn);
            }
        });
    });
}
function flashCopied(btn) {
    var orig = btn.textContent || '';
    btn.textContent = '\u2713 Copied';
    btn.classList.add('ca-copied');
    setTimeout(function () { btn.textContent = orig; btn.classList.remove('ca-copied'); }, 1800);
}
function fallbackCopy(text, btn) {
    try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        flashCopied(btn);
    }
    catch (e) { /* silent — user can copy manually */ }
}
// ─── Tab: Legislation ─────────────────────────────────────────────────────────
function renderLegislation(data) {
    const items = data.legislation || [];
    let html = data.sectionDescription
        ? `<div class="ca-section-desc">${esc(data.sectionDescription)}</div>`
        : '';
    if (!items.length)
        return html + '<div class="ca-empty">No legislation references found for this section.</div>';
    const primary = items.filter(i => i.priority === 'primary');
    const secondary = items.filter(i => i.priority !== 'primary');
    if (primary.length) {
        html += `<div class="ca-guide-label">Primary — Must Cite</div>`;
        primary.forEach(i => { html += legCard(i); });
    }
    if (secondary.length) {
        html += `<div class="ca-divider"></div><div class="ca-guide-label">Supplementary</div>`;
        secondary.forEach(i => { html += legCard(i); });
    }
    return html;
}
function legCard(item) {
    const clauses = Array.isArray(item.key_clauses) ? item.key_clauses : [];
    const copyText = `${item.citation}\n\n${item.plain_summary}${clauses.length ? '\n\nKey clauses:\n' + clauses.join('\n') : ''}`;
    return `
    <div class="ca-card">
      <div class="ca-card-head">
        <div class="ca-card-title">
          ${esc(item.reference_title)}
          ${item.priority === 'primary' ? '<span class="ca-primary-flag">PRIMARY</span>' : ''}
        </div>
        <span class="ca-card-type ca-type-${esc(item.reference_type || 'act')}">${esc(item.reference_type || 'act')}</span>
      </div>
      <div class="ca-card-body">
        <div class="ca-citation">${esc(item.citation)}</div>
        <div class="ca-summary">${esc(item.plain_summary)}</div>
        ${clauses.length ? `<div class="ca-clauses">${clauses.map(c => `<span class="ca-clause">${esc(c)}</span>`).join('')}</div>` : ''}
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-top:6px">
          ${item.source_url ? `<a class="ca-source-link" href="${esc(item.source_url)}" target="_blank" rel="noopener">↗ Official source</a>` : '<span></span>'}
          <button class="ca-copy-btn" data-copy="${esc(copyText)}">⎘ Copy reference</button>
        </div>
      </div>
    </div>`;
}
// ─── Tab: Guide ───────────────────────────────────────────────────────────────
function renderGuide(data) {
    const guide = data.preview;
    if (!guide)
        return `<div class="ca-idle"><div class="ca-idle-icon">📐</div>No fill guide for this section yet.<br/><small style="margin-top:6px;display:block">Check the Legislation tab.</small></div>`;
    let html = guide.description ? `<div class="ca-guide-desc">${esc(guide.description)}</div>` : '';
    (guide.tables || []).forEach(tbl => {
        html += `<div class="ca-guide-label">${esc(tbl.title)}</div>`;
        html += `<div class="ca-table-preview"><div class="ca-table-preview-head">Column guidance</div>`;
        tbl.columns.forEach(col => {
            html += `<div class="ca-col-guide">
        <div class="ca-col-name">${esc(col.name)}</div>
        <div class="ca-col-hint">${esc(col.hint)}</div>
        <span class="ca-col-example">${esc(col.example)}</span>
      </div>`;
        });
        html += '</div>';
        const allRows = [...(tbl.example_row ? [tbl.example_row] : []), ...(tbl.more_examples || [])];
        if (allRows.length) {
            const headers = tbl.columns.map(c => c.name);
            html += `<div class="ca-example-row-wrap">
        <div class="ca-example-row-label">
          <span>Example rows</span>
          <button class="ca-copy-btn" data-copy="${esc(headers.join('\t') + '\n' + allRows.map(r => r.join('\t')).join('\n'))}">⎘ Copy all</button>
        </div>
        <div style="overflow-x:auto">
          <table class="ca-example-rows-table">
            <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
            <tbody>
              ${allRows.map(row => `<tr>
                ${row.map(cell => `<td>${esc(cell)}</td>`).join('')}
                <td style="width:28px"><button class="ca-copy-btn" style="padding:2px 7px;font-size:10px" data-copy="${esc(row.join(' | '))}" title="Copy row">⎘</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
        }
    });
    (guide.lists || []).forEach(lst => {
        html += `<div class="ca-guide-label">${esc(lst.title)}</div>
      <div class="ca-suggestion">
        ${lst.items.map(item => `<div class="ca-suggestion-item">• ${esc(item)}</div>`).join('')}
        <div style="margin-top:8px">
          <button class="ca-copy-btn" data-copy="${esc(lst.items.join('\n'))}">⎘ Copy all items</button>
        </div>
      </div>`;
    });
    return html || '<div class="ca-empty">No guide content for this section.</div>';
}
// ─── Tab: Suggestions ────────────────────────────────────────────────────────
function renderSuggestions(data) {
    const textS = data.suggestions?.text || [];
    const listS = data.suggestions?.list || [];
    if (!textS.length && !listS.length) {
        return `<div class="ca-idle"><div class="ca-idle-icon">✍️</div>No draft suggestions for this block type.<br/><small style="margin-top:6px;display:block">Try the Guide tab for table examples.</small></div>`;
    }
    let html = '';
    if (textS.length) {
        html += `<div class="ca-guide-label">Draft text — click to copy</div>`;
        textS.forEach(txt => {
            html += `<div class="ca-suggestion"><div class="ca-suggestion-text">${esc(txt)}</div><button class="ca-copy-btn" data-copy="${esc(txt)}">⎘ Copy text</button></div>`;
        });
    }
    if (listS.length) {
        html += `<div class="ca-divider"></div><div class="ca-guide-label">Suggested list items</div>
      <div class="ca-suggestion">
        ${listS.map(item => `<div class="ca-suggestion-item">• ${esc(item)}</div>`).join('')}
        <div style="margin-top:8px"><button class="ca-copy-btn" data-copy="${esc(listS.join('\n'))}">⎘ Copy all items</button></div>
      </div>`;
    }
    return html;
}
// ─── Tab: Live Info ───────────────────────────────────────────────────────────
function renderLive(data) {
    const live = data.liveInfo || [];
    const urls = data.allUrls || [];
    if (!live.length && !urls.length) {
        return `<div class="ca-idle"><div class="ca-idle-icon">🌐</div>No live sources available for this section.</div>`;
    }
    let html = '';
    if (live.length) {
        html += `<div class="ca-guide-label">Live fetched content</div>`;
        live.forEach(item => {
            html += `<div class="ca-live-card">
        <div class="ca-live-head"><div class="ca-live-dot"></div><div class="ca-live-label">${esc(item.label)}</div></div>
        <div class="ca-live-snippet">${esc(item.snippet)}</div>
        <a class="ca-live-link" href="${esc(item.url)}" target="_blank" rel="noopener">↗ Open full source</a>
      </div>`;
        });
        if (urls.length)
            html += `<div class="ca-divider"></div>`;
    }
    if (urls.length) {
        html += `<div class="ca-guide-label">Reference sources</div><div class="ca-url-list">`;
        urls.forEach(u => {
            html += `<a class="ca-url-item" href="${esc(u.url)}" target="_blank" rel="noopener">
        <span class="ca-url-label">${esc(u.label)}</span><span class="ca-url-arrow">↗</span>
      </a>`;
        });
        html += '</div>';
    }
    return html;
}
// ─── Tab: Plan Layout ─────────────────────────────────────────────────────────
function renderMockLayout(data) {
    const layout = data.mockLayout;
    if (!layout) {
        return `<div class="ca-idle">
      <div class="ca-idle-icon">📄</div>
      <strong>Select a plan type to see the layout.</strong><br/>
      <small style="margin-top:6px;display:block">The Plan Layout tab shows a visual document preview of what a completed plan of this type looks like — sections in order, block types, and realistic placeholder content.</small>
    </div>`;
    }
    const bs = (color) => `display:inline-block;font-size:9.5px;font-weight:700;padding:1px 7px;border-radius:999px;color:#fff;background:${esc(color)};margin-left:6px;vertical-align:middle`;
    let html = `
    <div style="margin-bottom:14px;padding:12px;background:var(--bg,#fff);border:1px solid var(--line,#e2e6ed);border-radius:8px">
      <div style="font-size:14px;font-weight:800;color:var(--text,#111);margin-bottom:4px">${esc(layout.planLabel)}</div>
      <div style="font-size:11px;color:var(--text2,#666);margin-bottom:6px">
        <span style="${bs('#0369a1')}">${esc(layout.categoryLabel)}</span>
      </div>
      <div style="font-size:11.5px;color:var(--text,#2a3441);line-height:1.55">${esc(layout.purpose)}</div>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--text2,#666);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">
      Sections — ${layout.sections.length} total
    </div>
  `;
    layout.sections.forEach((section, i) => {
        const isActive = section.key === data.sectionKey;
        const bi = { text: '¶', table: '⊞', list: '≡' };
        const blockColors = {
            text: { bg: '#eff3fb', color: '#1e3a8a', border: '#c7d7f8' },
            list: { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
            table: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
        };
        html += `<div style="
        background:${isActive ? 'var(--bg3,#eff3fb)' : 'var(--bg,#fff)'};
        border:1px solid ${isActive ? 'var(--accent,#1d4ed8)' : 'var(--line,#e2e6ed)'};
        border-radius:8px;margin-bottom:8px;overflow:hidden;
        ${isActive ? 'box-shadow:0 0 0 2px rgba(29,78,216,0.12)' : ''}">
      <div style="padding:9px 12px;display:flex;align-items:flex-start;gap:8px">
        <div style="width:20px;height:20px;border-radius:50%;background:var(--line,#e8eaf0);
          display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;
          color:var(--text2,#666);flex-shrink:0;margin-top:1px">${i + 1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700;color:var(--text,#111);line-height:1.35;margin-bottom:3px">
            ${esc(section.title)}
            <span style="${bs(section.badgeColor)}">${esc(section.badge)}</span>
            ${isActive ? '<span style="font-size:9.5px;font-weight:700;color:var(--accent,#1d4ed8);margin-left:6px">← you are here</span>' : ''}
          </div>
          <div style="font-size:11px;color:var(--text2,#666);line-height:1.5;margin-bottom:6px">
            ${esc(section.placeholder)}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${section.blocks.map(b => {
            const c = blockColors[b.type] || blockColors.text;
            return `<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;
                background:${c.bg};color:${c.color};border:1px solid ${c.border}">
                ${bi[b.type] || '•'} ${esc(b.label)}</span>`;
        }).join('')}
          </div>
        </div>
      </div>
    </div>`;
    });
    html += `
    <div style="margin-top:12px;padding:10px 12px;background:var(--bg,#fff);
      border:1px solid var(--line,#e2e6ed);border-radius:8px">
      <div style="font-size:10.5px;font-weight:700;color:var(--text2,#666);
        margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em">Section types</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:10.5px;margin-bottom:8px">
        <span><span style="${bs('#1d4ed8')}">core</span> <span style="color:var(--text2,#666)">Applies to all plan types</span></span>
        <span><span style="${bs('#0369a1')}">category</span> <span style="color:var(--text2,#666)">This category only</span></span>
        <span><span style="${bs('#166534')}">type-specific</span> <span style="color:var(--text2,#666)">This plan type only</span></span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:10.5px">
        <span style="background:#eff3fb;color:#1e3a8a;border:1px solid #c7d7f8;padding:2px 7px;border-radius:3px;font-weight:600">¶ Text block</span>
        <span style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;padding:2px 7px;border-radius:3px;font-weight:600">≡ List block</span>
        <span style="background:#fffbeb;color:#92400e;border:1px solid #fde68a;padding:2px 7px;border-radius:3px;font-weight:600">⊞ Table block</span>
      </div>
    </div>
  `;
    return html;
}
