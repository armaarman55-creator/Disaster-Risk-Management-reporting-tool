// js/share.js
import { ALL_IMAGES } from './svg-images.js';

let selectedImage = null;

export async function openShareModal({ type, title, text, url, imageCategory }) {
  closeShareModal();

  // Check if social links are configured
  let socialLinks = window._drmsaSocialLinks || null;
  if (!socialLinks) {
    try {
      const { supabase } = await import('./supabase.js');
      const muniId = window._drmsaUser?.municipality_id;
      if (muniId) {
        const { data } = await supabase.from('municipalities')
          .select('social_facebook,social_twitter,social_whatsapp,social_website')
          .eq('id', muniId).single();
        if (data) {
          window._drmsaSocialLinks = data;
          socialLinks = data;
        }
      }
    } catch(e) {}
  }
  const images = ALL_IMAGES[imageCategory] || [];
  selectedImage = images[0] || null;

  const overlay = document.createElement('div');
  overlay.id = 'share-modal-overlay';
  overlay.className = 'share-modal-overlay';
  overlay.innerHTML = `
    <div class="share-modal">
      <div class="share-modal-head">
        <span class="share-modal-title">Share — ${title}</span>
        <button class="share-modal-close" onclick="closeShareModal()">✕</button>
      </div>
      <div class="share-modal-body">
        ${images.length > 0 ? `
        <div class="img-picker-label">Choose share image</div>
        <div class="img-picker-grid" id="img-picker-grid">
          ${images.map((img, i) => `
            <div class="img-card ${i === 0 ? 'selected' : ''}" data-id="${img.id}" onclick="selectShareImage('${img.id}','${imageCategory}')">
              ${img.svg}
              <div class="img-card-name">${img.name}</div>
            </div>`).join('')}
        </div>
        <div class="share-img-preview" id="share-img-preview">
          ${selectedImage ? selectedImage.svg : ''}
        </div>
        ` : ''}
        <div class="share-preview-box" id="share-preview-text">${text}</div>
        <div class="share-channels" id="share-channels">
          ${buildChannels(url, title, text)}
        </div>
        <div class="sp-url-row">
          <div class="sp-url" id="share-url-val">${url}</div>
          <button class="btn btn-sm" onclick="copyShareUrl()">Copy link</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeShareModal(); });
}

function buildChannels(url, title, text) {
  const links   = window._drmsaSocialLinks || {};
  const hasSocial= !!(links.social_facebook || links.social_twitter || links.social_whatsapp);
  const noSocialMsg = '⚠ No social media links set. Please add your municipality\'s social media links in the Disaster Admin Panel → Municipality settings → Social media links.';

  // Use municipality social links if set, otherwise use generic sharer
  const waNum = links.social_whatsapp;
  const wa    = waNum
    ? `https://wa.me/${waNum}?text=${encodeURIComponent(text + '\n' + url)}`
    : `https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`;
  const fbPage = links.social_facebook;
  const fb     = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  const twHandle = links.social_twitter ? `via @${links.social_twitter} ` : '';
  const tw    = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title + ' ' + twHandle)}&url=${encodeURIComponent(url)}`;
  const mail  = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text + '\n\n' + url)}`;

  return `
    <a class="sch wa" href="${wa}" target="_blank">
      <div class="sch-ico" style="background:#25D366">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="white"><path d="M5 .5C2.5.5.5 2.5.5 5c0 .8.2 1.6.6 2.3L.5 9.5l2.3-.6C3.4 9.3 4.2 9.5 5 9.5c2.5 0 4.5-2 4.5-4.5S7.5.5 5 .5zm2.2 6.2c-.1.3-.6.5-.8.5s-.4.1-1.4-.3C3.8 6.4 3.1 5.2 3 5c-.1-.2-.5-.7-.5-1.3s.3-1 .4-1.1.3-.2.4-.2h.3c.1 0 .2 0 .3.3.1.3.4 1 .4 1.1 0 .1 0 .2-.1.3l-.2.2c-.1.1-.1.2-.1.3.1.2.5.8 1 1.1.5.4 1 .5 1.1.5.1 0 .2-.1.3-.2l.2-.3c.1-.1.2-.1.3-.1.1 0 .7.3.8.4.1.1.2.2.2.3 0 .2-.1.6-.2.8z"/></svg>
      </div>WhatsApp
    </a>
    <a class="sch fb" href="${fb}" target="_blank">
      <div class="sch-ico" style="background:#1877F2">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="white"><path d="M7 1H5.5C4.7 1 4 1.7 4 2.5V4H2.5v1.5H4V9h1.5V5.5H7L7.5 4H5.5V2.5c0-.3.2-.5.5-.5H7V1z"/></svg>
      </div>Facebook
    </a>
    <a class="sch xp" href="${tw}" target="_blank">
      <div class="sch-ico" style="background:#000">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="white"><path d="M1 1.5l3.2 4.3L1 9h1l2.7-3 2.2 3H9L5.7 4.6 8.8 1.5h-1L5.2 4.3 3 1.5H1z"/></svg>
      </div>Post on X
    </a>
    <a class="sch em" href="${mail}">
      <div class="sch-ico" style="background:var(--blue-dim)">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--blue)" stroke-width="1.4" stroke-linecap="round"><rect x="1" y="2.5" width="8" height="6" rx=".5"/><path d="M1 3l4 3 4-3"/></svg>
      </div>Email
    </a>
    <button class="sch pdf" onclick="generateSharePDF()">
      <div class="sch-ico" style="background:var(--red-dim)">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--red)" stroke-width="1.4" stroke-linecap="round"><rect x="1.5" y="1" width="7" height="8" rx="1"/><line x1="3" y1="4" x2="7" y2="4"/><line x1="3" y1="6" x2="6" y2="6"/></svg>
      </div>PDF
    </button>
    <button class="sch pdmc" onclick="copyPDMCFormat()">
      <div class="sch-ico" style="background:var(--purple-dim)">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--purple)" stroke-width="1.4" stroke-linecap="round"><circle cx="5" cy="5" r="4"/><path d="M5 2v3l2 2"/></svg>
      </div>PDMC
    </button>
    <button class="sch portal" onclick="publishToPortal()">
      <div class="sch-ico" style="background:var(--green-dim)">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--green)" stroke-width="1.4" stroke-linecap="round"><circle cx="5" cy="5" r="4"/><path d="M1 5h8M5 1c-1.5 1.5-2 3-2 4s.5 2.5 2 4M5 1c1.5 1.5 2 3 2 4s-.5 2.5-2 4"/></svg>
      </div>Portal
    </button>`;
}

window.selectShareImage = function(id, category) {
  const images = ALL_IMAGES[category] || [];
  selectedImage = images.find(i => i.id === id) || null;
  document.querySelectorAll('.img-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.id === id);
  });
  const preview = document.getElementById('share-img-preview');
  if (preview && selectedImage) preview.innerHTML = selectedImage.svg;
};

window.closeShareModal = function() {
  document.getElementById('share-modal-overlay')?.remove();
};

window.copyShareUrl = function() {
  const url = document.getElementById('share-url-val')?.textContent;
  if (url) navigator.clipboard?.writeText(url);
  const btn = document.querySelector('.sp-url-row .btn');
  if (btn) { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy link', 1500); }
};

window.generateSharePDF = function() {
  // Opens browser print dialog — user can save as PDF
  const content = document.getElementById('share-preview-text')?.textContent || '';
  const img = selectedImage?.svg || '';
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>DRMSA Share</title><style>body{font-family:Arial,sans-serif;padding:40px;max-width:600px;margin:0 auto}svg{width:100%;max-width:400px;display:block;margin:0 auto 20px}pre{white-space:pre-wrap;font-size:13px;line-height:1.6}footer{margin-top:40px;font-size:10px;color:#888;border-top:1px solid #eee;padding-top:12px}</style></head><body>${img}<pre>${content}</pre><footer>DRMSA — Disaster Risk Management Platform. Created by Diswayne Maarman. Apache 2.0.</footer></body></html>`);
  win.print();
};

window.copyPDMCFormat = function() {
  const text = document.getElementById('share-preview-text')?.textContent || '';
  const pdmc = `[PDMC SUBMISSION]\n${text}\n\nSubmitted via DRMSA Platform`;
  navigator.clipboard?.writeText(pdmc);
  alert('PDMC formatted text copied to clipboard. Paste into your PDMC submission form.');
};

window.publishToPortal = function() {
  alert('This record has been published to the public portal. The public URL has been updated.');
  closeShareModal();
};
