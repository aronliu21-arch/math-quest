// Small DOM helpers shared by all screens.
import { L, getLang, t } from './i18n.js';
import { sfx } from './audio.js';
import { sparkleBurst } from './art.js';
import { fmt } from '../shared/fraction.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Text with fraction markup → HTML. [3/4] → stacked fraction, [1 3/4] → mixed number, ? → answer box.
export function rich(text) {
  let s = esc(text);
  s = s.replace(/\[(?:(\d+) )?([\d?]+)\/([\d?]+)\]/g, (_, w, n, d) => {
    const part = (x) => (x === '?' ? '<span class="qbox">?</span>' : x);
    return `<span class="mixed">${w ? `<span class="whole">${w}</span>` : ''}<span class="fr"><span class="fn">${part(n)}</span><span class="fd">${part(d)}</span></span></span>`;
  });
  s = s.replace(/(^|[\s=÷×(])\?(?=$|[\s=÷×)])/g, '$1<span class="qbox">?</span>');
  return s;
}
export const richL = (o) => rich(L(o));
export const fmtRich = (v) => rich(fmt(v, getLang()));

export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

// Big touch-friendly tap handling (pointerup avoids 300ms delays and ghost clicks)
export function onTap(node, fn) {
  if (!node) return;
  node.addEventListener('click', (e) => { sfx('tap'); fn(e); });
}

export function bindActions(root, handlers) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !root.contains(b) || b.disabled) return;
    const fn = handlers[b.dataset.act];
    if (fn) { sfx('tap'); fn(b.dataset.arg, b, e); }
  });
}

export function toast(msg, kind = 'info', ms = 2200) {
  const n = el(`<div class="toast ${kind}" role="status">${rich(msg)}</div>`);
  document.body.appendChild(n);
  requestAnimationFrame(() => n.classList.add('show'));
  setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 400); }, ms);
}

export function modal(html, { onClose, cls = '' } = {}) {
  const wrap = el(`<div class="modal-wrap ${cls}"><div class="modal card pop">${html}</div></div>`);
  document.body.appendChild(wrap);
  const close = () => { wrap.remove(); onClose && onClose(); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap && !cls.includes('sticky')) close(); });
  return { node: wrap, box: wrap.firstElementChild, close };
}

export function burst(x, y, n = 16) {
  const b = el(`<div class="burst" style="left:${x}px;top:${y}px">${sparkleBurst(n)}</div>`);
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 1200);
}

export function confetti(n = 60) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = el('<div class="confetti" aria-hidden="true"></div>');
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = ['#ffd43b', '#ff6b6b', '#4dabf7', '#69db7c', '#b197fc', '#ffa94d'][i % 6];
    c.style.animationDelay = `${Math.random() * 0.6}s`;
    c.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    c.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
    box.appendChild(c);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3500);
}

export function centerOf(node) {
  const r = node.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }

export function progressBar(frac, cls = '') {
  return `<div class="pbar ${cls}"><div style="width:${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%"></div></div>`;
}

export function langToggleHTML() {
  return `<button class="chip lang-toggle" data-act="toggleLang" aria-label="Language">${getLang() === 'zh' ? 'EN' : '中文'}</button>`;
}

export function backBtn(act = 'back') { return `<button class="btn-icon back" data-act="${act}" aria-label="${t('back')}">←</button>`; }
