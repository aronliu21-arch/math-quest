// Answer inputs: multiple choice, on-screen number pads, and hands-on
// puzzles (drag-to-share, tap-to-shade, number line, ordering).
import { t, L } from './i18n.js';
import { el, rich, fmtRich, $, $$, toast } from './ui.js';
import { itemSVG, pieSVG, barSVG, rectSVG, lineSVG } from './art.js';
import { num, fr, mx, qr, ord } from '../shared/fraction.js';
import { sfx } from './audio.js';

// Each input: render(q, host, submit) → { disableChoice(value), reveal(), destroy() }
export function renderInput(q, host, submit, opts = {}) {
  switch (q.input) {
    case 'mc': return mcInput(q, host, submit, opts);
    case 'pad': case 'rempad': case 'fracpad': return padInput(q, host, submit);
    case 'share': return shareInput(q, host, submit);
    case 'shade': return shadeInput(q, host, submit);
    case 'line': return lineInput(q, host, submit);
    case 'order': return orderInput(q, host, submit);
    default: return mcInput(q, host, submit, opts);
  }
}

// ---------- multiple choice ----------
function mcInput(q, host, submit, { chestStyle = false } = {}) {
  const wide = q.choices.some((c) => c.t === 's' && c.label);
  const box = el(`<div class="choices ${wide ? 'wide' : ''} ${chestStyle ? 'chests' : ''}">${q.choices.map((c, i) =>
    `<button class="choice ${chestStyle ? 'chest-choice' : ''}" data-i="${i}">${chestStyle ? '<span class="chest-lid"></span>' : ''}<span class="cv">${fmtRich(c)}</span></button>`).join('')}</div>`);
  host.appendChild(box);
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.choice'); if (!b || b.disabled || box.classList.contains('locked')) return;
    submit(q.choices[+b.dataset.i], b);
  });
  return {
    wrong(btn) { if (btn) { btn.disabled = true; btn.classList.add('wrong', 'shake'); } },
    lock() { box.classList.add('locked'); },
    reveal() { $$('.choice', box).forEach((b, i) => { if (JSON.stringify(q.choices[i]) === JSON.stringify(q.answer)) b.classList.add('right'); }); box.classList.add('locked'); },
  };
}

// ---------- number pads ----------
function padInput(q, host, submit) {
  const fields = [];
  let html = '<div class="pad-display">';
  if (q.input === 'pad') { fields.push('v'); html += '<button class="field" data-f="v"></button>'; }
  if (q.input === 'rempad') {
    fields.push('q', 'r');
    html += `<label class="flabel">${t('quotient')}<button class="field" data-f="q"></button></label><span class="rem-r">${t('remainder')}</span><label class="flabel">${t('remainderLabel')}<button class="field" data-f="r"></button></label>`;
  }
  if (q.input === 'fracpad') {
    if (q.allowWhole) fields.push('w');
    fields.push('n', 'd');
    html += `${q.allowWhole ? `<label class="flabel">${t('whole')}<button class="field whole-f" data-f="w"></button></label>` : ''}
      <div class="frac-fields"><button class="field" data-f="n" aria-label="${t('numerator')}"></button><span class="frac-bar"></span><button class="field" data-f="d" aria-label="${t('denominator')}"></button></div>`;
  }
  html += '</div>';
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
  const node = el(`<div class="pad">${html}<div class="keys">${keys.map((k) => `<button class="key ${k === 'C' || k === '⌫' ? 'muted' : ''}" data-k="${k}">${k === 'C' ? t('clear') : k}</button>`).join('')}</div><button class="btn big check">${t('check')} ✓</button></div>`);
  host.appendChild(node);
  const val = Object.fromEntries(fields.map((f) => [f, '']));
  let focus = q.input === 'fracpad' && q.allowWhole && !q.requireWhole ? 'n' : fields[0];
  const draw = () => {
    $$('.field', node).forEach((b) => {
      const f = b.dataset.f; b.textContent = val[f] || (f === focus ? '' : ' ');
      b.classList.toggle('focus', f === focus); b.classList.toggle('empty', !val[f]);
    });
  };
  draw();
  node.addEventListener('click', (e) => {
    const fb = e.target.closest('.field'); if (fb) { focus = fb.dataset.f; draw(); return; }
    const kb = e.target.closest('.key');
    if (kb) {
      const k = kb.dataset.k;
      if (k === 'C') { for (const f of fields) val[f] = ''; focus = fields.includes('n') && !q.requireWhole ? (q.allowWhole ? 'n' : fields[0]) : fields[0]; }
      else if (k === '⌫') val[focus] = val[focus].slice(0, -1);
      else if (val[focus].length < 5) {
        val[focus] = (val[focus] === '0' ? '' : val[focus]) + k;
        // auto-advance: quotient → remainder is NOT automatic (kids may need 2 digits)
      }
      draw(); return;
    }
    if (e.target.closest('.check')) {
      const v = build(); if (v) submit(v);
    }
  });
  function build() {
    const n = (f) => (val[f] === '' ? null : parseInt(val[f], 10));
    if (q.input === 'pad') { if (n('v') == null) { toast(L({ en: 'Tap the number keys to answer', zh: '用數字鍵輸入答案' }), 'info', 1400); return null; } return num(n('v')); }
    if (q.input === 'rempad') {
      if (n('q') == null) { focus = 'q'; draw(); return null; }
      return qr(n('q'), n('r') ?? 0);
    }
    const w = q.allowWhole ? n('w') : null; const nn = n('n'); const d = n('d');
    if (nn == null && d == null && w != null) return mx(w, 0, 1);
    if (nn == null || d == null) { focus = nn == null ? 'n' : 'd'; draw(); return null; }
    if (d === 0) { toast(L({ en: 'The denominator cannot be 0!', zh: '分母不能是 0 喔！' }), 'info'); return null; }
    if (w) return mx(w, nn, d);
    return fr(nn, d);
  }
  return {
    wrong() { node.classList.add('shake'); setTimeout(() => node.classList.remove('shake'), 500); for (const f of fields) val[f] = ''; focus = fields.includes('n') && q.allowWhole && !q.requireWhole ? 'n' : fields[0]; draw(); },
    lock() { node.classList.add('locked'); },
    reveal() { node.classList.add('locked'); },
  };
}

// ---------- drag to share ----------
function shareInput(q, host, submit) {
  const g = q.groups; const total = q.total;
  const loc = Array(total).fill('pile'); // 'pile' | plate index | 'left'
  let selected = null;
  const node = el(`<div class="share">
    <div class="pile dropzone" data-z="pile"></div>
    <div class="plates">${Array.from({ length: g }, (_, i) => `<div class="plate dropzone" data-z="${i}">${q.plateArt ? `<div class="plate-art">${q.plateArt}</div>` : ''}<div class="plate-count"></div></div>`).join('')}
    ${q.leftover ? `<div class="plate leftover dropzone" data-z="left"><span class="lz">${L({ en: 'Leftover', zh: '剩下' })}</span><div class="plate-count"></div></div>` : ''}</div>
    <div class="row gap"><button class="btn ghost reset" aria-label="${t('resetPuzzle')}">${q.autoCheck ? '↺' : t('resetPuzzle')}</button>${q.autoCheck ? '' : `<button class="btn big check">${t('check')} ✓</button>`}</div>
  </div>`);
  host.appendChild(node);
  const zones = {};
  $$('.dropzone', node).forEach((z) => { zones[z.dataset.z] = z; });
  const tokens = Array.from({ length: total }, (_, i) => {
    const tk = el(`<div class="token" data-i="${i}" touch-action="none">${itemSVG(q.item, 40)}</div>`);
    return tk;
  });
  const draw = () => {
    tokens.forEach((tk, i) => { const z = zones[String(loc[i])]; if (tk.parentNode !== z) z.appendChild(tk); tk.classList.toggle('sel', selected === i); });
    $$('.plate', node).forEach((p) => { const c = loc.filter((x) => String(x) === p.dataset.z).length; $('.plate-count', p).textContent = c || ''; });
  };
  draw();
  const move = (i, z) => {
    loc[i] = z === 'pile' ? 'pile' : z === 'left' ? 'left' : +z; selected = null; sfx('drop'); draw();
    if (q.autoCheck && !loc.includes('pile')) setTimeout(doCheck, 350); // little ones: no Check button needed
  };
  function doCheck() {
    if (node.classList.contains('locked')) return;
    if (loc.includes('pile')) { toast(L({ en: 'Place all of them first!', zh: '先把全部放好喔！' }), 'info'); return; }
    const counts = Array.from({ length: g }, (_, p) => loc.filter((x) => x === p).length);
    const left = loc.filter((x) => x === 'left').length;
    const equal = counts.every((c) => c === counts[0]);
    if (equal && q.leftover && left >= g) { toast(L({ en: `There are enough leftovers to give every plate one more!`, zh: '剩下的還夠每一份再多放一個喔！' }), 'info', 2600); return; }
    if (!equal) { submit({ t: 'n', v: -1 }, null, { msg: { en: 'Some plates have more than others. Make them all equal!', zh: '有些盤子比較多，要讓每一份都一樣多！' } }); return; }
    submit(q.leftover ? qr(counts[0], left) : num(counts[0]));
  }

  // pointer drag
  let drag = null;
  node.addEventListener('pointerdown', (e) => {
    const tk = e.target.closest('.token'); if (!tk || node.classList.contains('locked')) return;
    e.preventDefault();
    drag = { i: +tk.dataset.i, x0: e.clientX, y0: e.clientY, ghost: null, moved: false, id: e.pointerId };
    try { tk.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  node.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0; const dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) > 8) {
      drag.moved = true;
      drag.ghost = el(`<div class="token ghost">${itemSVG(q.item, 48)}</div>`); document.body.appendChild(drag.ghost);
      tokens[drag.i].classList.add('dragging');
    }
    if (drag.ghost) { drag.ghost.style.left = `${e.clientX - 24}px`; drag.ghost.style.top = `${e.clientY - 24}px`; }
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    tokens[d.i].classList.remove('dragging');
    if (d.ghost) {
      d.ghost.remove();
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const z = under && under.closest('.dropzone');
      if (z && node.contains(z)) move(d.i, z.dataset.z);
    } else {
      // tap: a token on a plate goes back to the pile; a pile token gets selected
      if (loc[d.i] !== 'pile') move(d.i, 'pile');
      else { selected = selected === d.i ? null : d.i; draw(); }
    }
  };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', (e) => { if (drag && drag.ghost) drag.ghost.remove(); if (drag) tokens[drag.i].classList.remove('dragging'); drag = null; });
  // tap a plate: drop the selected token (or the next one from the pile)
  node.addEventListener('click', (e) => {
    if (e.target.closest('.token')) return;
    const z = e.target.closest('.dropzone');
    if (z && z.dataset.z !== 'pile' && !node.classList.contains('locked')) {
      const i = selected != null ? selected : loc.indexOf('pile');
      if (i >= 0) move(i, z.dataset.z);
    }
    if (e.target.closest('.reset')) { loc.fill('pile'); selected = null; draw(); }
    if (e.target.closest('.check')) doCheck();
  });
  return {
    wrong() { node.classList.add('shake'); setTimeout(() => node.classList.remove('shake'), 500); if (q.autoCheck) { loc.fill('pile'); draw(); } },
    lock() { node.classList.add('locked'); },
    reveal() {
      // show the correct sharing
      const a = q.answer; const each = a.t === 'r' ? a.q : a.v;
      let k = 0; for (let p = 0; p < g; p++) for (let j = 0; j < each; j++) loc[k++] = p;
      while (k < total) loc[k++] = 'left';
      draw(); node.classList.add('locked');
    },
  };
}

// ---------- tap to shade ----------
function shadeInput(q, host, submit) {
  const shaded = Array(q.d).fill(false);
  const node = el(`<div class="shade"><div class="shape-host"></div><div class="shade-count"></div><div class="row gap"><button class="btn ghost reset">${t('resetPuzzle')}</button><button class="btn big check">${t('check')} ✓</button></div></div>`);
  host.appendChild(node);
  const draw = () => {
    const opts = { shaded, interactive: true };
    $('.shape-host', node).innerHTML = q.shape === 'pie' ? pieSVG(0, q.d, { ...opts, size: 190 }) : q.shape === 'bar' ? barSVG(0, q.d, { ...opts, width: Math.min(340, window.innerWidth - 60), height: 70 }) : rectSVG(0, q.d, { ...opts, size: 220 });
    $('.shade-count', node).innerHTML = rich(`[${shaded.filter(Boolean).length}/${q.d}]`);
  };
  draw();
  node.addEventListener('click', (e) => {
    if (node.classList.contains('locked')) return;
    const s = e.target.closest('.slice');
    if (s) { const i = +s.dataset.i; shaded[i] = !shaded[i]; sfx('drop'); draw(); return; }
    if (e.target.closest('.reset')) { shaded.fill(false); draw(); }
    if (e.target.closest('.check')) submit(num(shaded.filter(Boolean).length));
  });
  return {
    wrong() { node.classList.add('shake'); setTimeout(() => node.classList.remove('shake'), 500); },
    lock() { node.classList.add('locked'); },
    reveal() { shaded.fill(false); for (let i = 0; i < q.answer.v; i++) shaded[i] = true; draw(); node.classList.add('locked'); },
  };
}

// ---------- number line ----------
function lineInput(q, host, submit) {
  let placed = null;
  const node = el(`<div class="nline"><div class="line-host"></div><button class="btn big check">${t('check')} ✓</button></div>`);
  host.appendChild(node);
  const w = Math.min(560, Math.max(300, window.innerWidth - 80));
  const draw = () => { $('.line-host', node).innerHTML = lineSVG(q.d, q.max, { width: w, ticksClickable: true, placed }); };
  draw();
  node.addEventListener('click', (e) => {
    if (node.classList.contains('locked')) return;
    const tk = e.target.closest('.tick-hit');
    if (tk) { placed = +tk.dataset.k; sfx('drop'); draw(); return; }
    if (e.target.closest('.check')) { if (placed == null) { toast(L({ en: 'Tap the line first!', zh: '先點數線喔！' }), 'info'); return; } submit(num(placed)); }
  });
  return {
    wrong() { node.classList.add('shake'); setTimeout(() => node.classList.remove('shake'), 500); placed = null; draw(); },
    lock() { node.classList.add('locked'); },
    reveal() { placed = q.answer.v; draw(); node.classList.add('locked'); },
  };
}

// ---------- ordering ----------
function orderInput(q, host, submit) {
  let seq = [];
  const node = el(`<div class="order"><div class="slots"></div><div class="cards"></div><div class="row gap"><button class="btn ghost reset">${t('resetPuzzle')}</button><button class="btn big check">${t('check')} ✓</button></div></div>`);
  host.appendChild(node);
  const draw = () => {
    $('.slots', node).innerHTML = q.cards.map((_, i) => `<div class="slot">${seq[i] != null ? `<button class="ocard placed" data-s="${i}">${fmtRich(q.cards[seq[i]])}</button>` : `<span class="slot-n">${i + 1}</span>`}</div>`).join('<span class="lt">&lt;</span>');
    $('.cards', node).innerHTML = q.cards.map((c, i) => (seq.includes(i) ? '<span class="ocard ghosted"></span>' : `<button class="ocard" data-c="${i}">${fmtRich(c)}</button>`)).join('');
  };
  draw();
  node.addEventListener('click', (e) => {
    if (node.classList.contains('locked')) return;
    const c = e.target.closest('[data-c]'); if (c) { seq.push(+c.dataset.c); sfx('drop'); draw(); return; }
    const s = e.target.closest('[data-s]'); if (s) { seq.splice(+s.dataset.s, 1); draw(); return; }
    if (e.target.closest('.reset')) { seq = []; draw(); }
    if (e.target.closest('.check')) { if (seq.length < q.cards.length) { toast(t('tapInOrder'), 'info'); return; } submit(ord(seq.slice())); }
  });
  return {
    wrong() { node.classList.add('shake'); setTimeout(() => node.classList.remove('shake'), 500); seq = []; draw(); },
    lock() { node.classList.add('locked'); },
    reveal() { seq = q.answer.v.slice(); draw(); node.classList.add('locked'); },
  };
}
