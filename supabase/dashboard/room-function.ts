// @ts-nocheck
// GENERATED FILE — do not edit. Paste this whole file into the Supabase dashboard:
// Edge Functions → Deploy a new function → Via Editor → name it "room".
// Regenerate with: node scripts/bundle-function.mjs
// Supabase Edge Function "room": the authoritative multiplayer server.
// Validates every answer, computes rewards, and broadcasts public room state.
// Deploy: supabase functions deploy room
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

// ---- game logic (generated from /shared by scripts/bundle-function.mjs) ----
// ===== rng.js =====
// Seeded random number generator (mulberry32) shared by the game, the
// local dev server and the Supabase edge function.

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function makeRng(seed) {
  let a = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    // integer in [lo, hi] inclusive
    int(lo, hi) { lo = Math.ceil(lo); hi = Math.floor(hi); if (hi < lo) hi = lo; return lo + Math.floor(next() * (hi - lo + 1)); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    chance(p) { return next() < p; },
    shuffle(arr) {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; }
      return a2;
    },
    weighted(items, weightFn) {
      const ws = items.map(weightFn);
      const total = ws.reduce((s, w) => s + Math.max(0, w), 0);
      if (total <= 0) return items[Math.floor(next() * items.length)];
      let r = next() * total;
      for (let i = 0; i < items.length; i++) { r -= Math.max(0, ws[i]); if (r <= 0) return items[i]; }
      return items[items.length - 1];
    },
  };
  return rng;
}

function randomSeed() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 4294967296);
}

// ===== fraction.js =====
// Exact rational arithmetic + answer values used by the question engine.
// Value types:
//   {t:'n', v}            whole number
//   {t:'f', n, d}         fraction
//   {t:'m', w, n, d}      mixed number
//   {t:'r', q, r}         quotient with remainder
//   {t:'s', v, label?}    symbol / labelled choice ('<', '>', '=', or a text key)
//   {t:'o', v:[...]}      an ordering (indices)

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; };
const lcm = (a, b) => (a / gcd(a, b)) * b;

const num = (v) => ({ t: 'n', v });
const fr = (n, d) => ({ t: 'f', n, d });
const mx = (w, n, d) => ({ t: 'm', w, n, d });
const qr = (q, r) => ({ t: 'r', q, r });
const sym = (v, label) => (label ? { t: 's', v, label } : { t: 's', v });
const ord = (v) => ({ t: 'o', v });

// Rational {n, d} with d > 0, reduced.
function rat(n, d = 1) {
  if (d === 0) throw new Error('division by zero');
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}
const radd = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
const rsub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
const rmul = (a, b) => rat(a.n * b.n, a.d * b.d);
const rdiv = (a, b) => rat(a.n * b.d, a.d * b.n);
const rcmp = (a, b) => Math.sign(a.n * b.d - b.n * a.d);

// Value of an answer object as a rational (null when not numeric).
function valueOf(v) {
  if (!v) return null;
  switch (v.t) {
    case 'n': return rat(v.v, 1);
    case 'f': return v.d ? rat(v.n, v.d) : null;
    case 'm': return v.d ? rat(v.w * v.d + v.n, v.d) : null;
    default: return null;
  }
}

function key(v) {
  if (!v) return 'null';
  switch (v.t) {
    case 'n': return `n:${v.v}`;
    case 'f': return `f:${v.n}/${v.d}`;
    case 'm': return `m:${v.w} ${v.n}/${v.d}`;
    case 'r': return `r:${v.q}R${v.r}`;
    case 's': return `s:${v.v}`;
    case 'o': return `o:${v.v.join(',')}`;
    default: return JSON.stringify(v);
  }
}

// Text with fraction markup ([3/4], [1 3/4]) for the renderer.
function fmt(v, lang = 'en') {
  if (!v) return '';
  switch (v.t) {
    case 'n': return String(v.v);
    case 'f': return `[${v.n}/${v.d}]`;
    case 'm': return v.n === 0 ? String(v.w) : `[${v.w} ${v.n}/${v.d}]`;
    case 'r': return v.r === 0 ? String(v.q) : (lang === 'zh' ? `${v.q} 餘 ${v.r}` : `${v.q} R ${v.r}`);
    case 's': return v.label ? v.label[lang] || v.label.en : v.v;
    case 'o': return v.v.join(', ');
    default: return '';
  }
}

function isSimplest(v) {
  if (v.t === 'f') return gcd(v.n, v.d) === 1 && v.d > 0;
  if (v.t === 'm') return v.n < v.d && (v.n === 0 || gcd(v.n, v.d) === 1);
  return true;
}

// Safe rational expression evaluator used to independently verify answers.
// Supports integers, + - * / ÷ × and parentheses.
function evalExpr(src) {
  const toks = String(src).replace(/÷/g, '/').replace(/×/g, '*').match(/\d+|[-+*/()]/g);
  if (!toks || toks.join('') !== String(src).replace(/÷/g, '/').replace(/×/g, '*').replace(/\s+/g, '')) {
    throw new Error('bad expression: ' + src);
  }
  let i = 0;
  const peek = () => toks[i];
  const take = () => toks[i++];
  function factor() {
    const t = take();
    if (t === '(') { const v = expr(); if (take() !== ')') throw new Error('missing )'); return v; }
    if (t === '-') return rsub(rat(0), factor());
    if (/^\d+$/.test(t)) return rat(parseInt(t, 10));
    throw new Error('unexpected ' + t);
  }
  function term() {
    let v = factor();
    while (peek() === '*' || peek() === '/') { const op = take(); const r = factor(); v = op === '*' ? rmul(v, r) : rdiv(v, r); }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') { const op = take(); const r = term(); v = op === '+' ? radd(v, r) : rsub(v, r); }
    return v;
  }
  const v = expr();
  if (i !== toks.length) throw new Error('trailing tokens in ' + src);
  return v;
}

// ===== mathgen.js =====
// MATH QUEST question engine.
// Every generator returns a question whose answer is independently re-checked
// by validateQuestion() (see tests/mathgen.test.mjs, which runs thousands of
// random questions per concept).


const T = (en, zh) => ({ en, zh });

// ---------- shared word-problem vocabulary (gender-neutral characters) ----------
const ITEMS = [
  { k: 'cookie', en: 'cookies', en1: 'cookie', zh: '餅乾', mw: '片' },
  { k: 'apple', en: 'apples', en1: 'apple', zh: '蘋果', mw: '顆' },
  { k: 'gem', en: 'gems', en1: 'gem', zh: '寶石', mw: '顆' },
  { k: 'star', en: 'star stickers', en1: 'star sticker', zh: '星星貼紙', mw: '張' },
  { k: 'berry', en: 'strawberries', en1: 'strawberry', zh: '草莓', mw: '顆' },
  { k: 'coin', en: 'gold coins', en1: 'gold coin', zh: '金幣', mw: '枚' },
  { k: 'dumpling', en: 'dumplings', en1: 'dumpling', zh: '水餃', mw: '顆' },
  { k: 'shell', en: 'seashells', en1: 'seashell', zh: '貝殼', mw: '個' },
];
const HOLDERS = [
  { en: 'plates', en1: 'plate', zh: '盤子' },
  { en: 'baskets', en1: 'basket', zh: '籃子' },
  { en: 'boxes', en1: 'box', zh: '盒子' },
  { en: 'bags', en1: 'bag', zh: '袋子' },
];
const GROUPS = [
  { en: 'friends', en1: 'friend', zh: '朋友', mw: '個' },
  { en: 'forest animals', en1: 'animal', zh: '森林動物', mw: '隻' },
  { en: 'little dragons', en1: 'little dragon', zh: '小龍', mw: '隻' },
  { en: 'explorers', en1: 'explorer', zh: '探險家', mw: '位' },
];
const NPCS = [
  T('Professor Hoot the owl', '貓頭鷹博士胡胡'),
  T('Chef Mochi the panda', '熊貓主廚麻糬'),
  T('Captain Pebble the turtle', '烏龜船長小石'),
  T('Sprout the bunny', '兔子小芽'),
  T('Ember the baby dragon', '小火龍阿焰'),
];

// ---------- helpers ----------
function finishMC(q, rng, distractors, count = 4) {
  const seen = new Set([key(q.answer)]);
  const ansVal = valueOf(q.answer);
  const out = [q.answer];
  const tryAdd = (d) => {
    if (!d || out.length >= count) return;
    if (d.t === 'n' && (d.v < 0 || !Number.isInteger(d.v) || (d.v === 0 && q.answer.t === 'n' && q.answer.v > 0))) return;
    if (d.t === 'f' && (d.d <= 0 || d.n < 0 || !Number.isInteger(d.n) || !Number.isInteger(d.d))) return;
    if (d.t === 'r' && (d.q < 0 || d.r < 0)) return;
    const k = key(d);
    if (seen.has(k)) return;
    const dv = valueOf(d);
    if (ansVal && dv && rcmp(ansVal, dv) === 0) return; // never an equal-valued distractor
    seen.add(k); out.push(d);
  };
  distractors.forEach(tryAdd);
  if (q.answer.t === 'n') {
    for (let k = 1; out.length < count && k < 40; k++) { tryAdd(num(q.answer.v + k)); tryAdd(num(q.answer.v - k)); }
  }
  q.choices = rng.shuffle(out);
  q.input = 'mc';
  return q;
}

function numDistractors(ans, extra = []) {
  return [...extra, ans + 1, ans - 1, ans + 2, ans * 2, ans - 2, ans + 10].map(num);
}

function pickDistinct(rng, lo, hi, n) {
  const s = new Set();
  let guard = 0;
  while (s.size < n && guard++ < 200) s.add(rng.int(lo, hi));
  return [...s];
}

// Long division in steps (used for explanations + the long-division visual)
function longDivision(a, b) {
  const digits = String(a).split('').map(Number);
  let rem = 0; let started = false; let qs = '';
  const steps = [];
  for (let i = 0; i < digits.length; i++) {
    const cur = rem * 10 + digits[i];
    const qd = Math.floor(cur / b);
    const prod = qd * b;
    if (qd > 0 || started) {
      started = true; qs += qd;
      steps.push({ cur, qd, prod, rem: cur - prod, next: digits[i + 1] });
    }
    rem = cur - prod;
  }
  return { q: parseInt(qs || '0', 10), r: rem, steps };
}

function longDivSteps(a, b) {
  const L = longDivision(a, b);
  const steps = [];
  L.steps.forEach((s, i) => {
    steps.push(T(
      `${i === 0 ? 'Start with' : 'Now'} ${s.cur}: ${s.cur} ÷ ${b} → ${s.qd}. ${s.qd} × ${b} = ${s.prod}. ${s.cur} − ${s.prod} = ${s.rem}.`,
      `${i === 0 ? '先看' : '再看'} ${s.cur}：${s.cur} ÷ ${b} 商 ${s.qd}。${s.qd} × ${b} = ${s.prod}。${s.cur} − ${s.prod} = ${s.rem}。`,
    ));
    if (s.next !== undefined) steps.push(T(`Bring down the next digit ${s.next}.`, `把下一位數字 ${s.next} 移下來。`));
  });
  steps.push(L.r
    ? T(`So ${a} ÷ ${b} = ${L.q} R ${L.r}.`, `所以 ${a} ÷ ${b} = ${L.q} 餘 ${L.r}。`)
    : T(`So ${a} ÷ ${b} = ${L.q}. Check: ${L.q} × ${b} = ${a} ✓`, `所以 ${a} ÷ ${b} = ${L.q}。驗算：${L.q} × ${b} = ${a} ✓`));
  return steps;
}

function simplestFrac(rng, dlo, dhi) {
  for (let i = 0; i < 100; i++) {
    const d = rng.int(dlo, dhi); const n = rng.int(1, d - 1);
    if (gcd(n, d) === 1) return [n, d];
  }
  return [1, 2];
}

// ================== DIVISION ==================
const G = {};

G.div_share = (rng, t) => {
  const g = t < 0.5 ? rng.int(2, 3) : rng.int(2, 5);
  const q = rng.int(t < 0.3 ? 1 : 2, Math.min(Math.floor(20 / g), t < 0.5 ? 4 : 6));
  const total = g * q; const item = rng.pick(ITEMS); const h = rng.pick(HOLDERS);
  const base = {
    id: `${total}/${g}${item.k}`, answer: num(q), accept: 'exact', data: { expr: `${total}/${g}` },
    hints: [
      T(`Give one ${item.en1} to each ${h.en1}, then again, until none are left.`, `一次放一${item.mw}${item.zh}到每個${h.zh}，輪流放，直到放完。`),
      T(`Think: ${g} × ? = ${total}`, `想一想：${g} × ? = ${total}`),
    ],
    steps: [T(`${total} ÷ ${g} = ${q}`, `${total} ÷ ${g} = ${q}`), T(`Check: ${g} × ${q} = ${total} ✓`, `驗算：${g} × ${q} = ${total} ✓`)],
    visual: { type: 'items', item: item.k, count: total, groups: g },
    tip: 'share',
  };
  if (rng.chance(0.65)) {
    return {
      ...base, input: 'share', item: item.k, groups: g, total,
      prompt: T(`Share ${total} ${item.en} equally into ${g} ${h.en}. Drag them in!`, `把 ${total} ${item.mw}${item.zh}平分到 ${g} 個${h.zh}裡。拖拖看！`),
      after: T(`Each ${h.en1} gets ${q}.`, `每個${h.zh}有 ${q} ${item.mw}。`),
    };
  }
  return finishMC({
    ...base,
    prompt: T(`${total} ${item.en} are shared equally into ${g} ${h.en}. How many in each ${h.en1}?`, `${total} ${item.mw}${item.zh}平分到 ${g} 個${h.zh}，每個${h.zh}有幾${item.mw}？`),
  }, rng, numDistractors(q, [g, total - g]));
};

G.div_facts20 = (rng, t) => {
  const b = t < 0.4 ? rng.int(2, 3) : rng.int(2, t < 0.7 ? 5 : 9);
  const q = rng.int(1, Math.floor(20 / b)); const a = b * q;
  const missing = t > 0.5 && rng.chance(0.3);
  return finishMC({
    id: `${a}/${b}${missing ? 'm' : ''}`, answer: num(q), accept: 'exact', data: { expr: `${a}/${b}` },
    prompt: missing ? T(`? × ${b} = ${a}`, `? × ${b} = ${a}`) : T(`${a} ÷ ${b} = ?`, `${a} ÷ ${b} = ?`),
    visual: { type: 'dots', count: a, groups: b },
    hints: [
      T(`Split ${a} dots into ${b} equal groups. How many in each group?`, `把 ${a} 個點分成 ${b} 組，每組一樣多，每組有幾個？`),
      T(`Count by ${b}s until you reach ${a}. How many jumps?`, `${b} 個 ${b} 個數，數到 ${a} 要跳幾次？`),
    ],
    steps: [T(`${b} × ${q} = ${a}, so ${a} ÷ ${b} = ${q}.`, `因為 ${b} × ${q} = ${a}，所以 ${a} ÷ ${b} = ${q}。`)],
    tip: 'facts',
  }, rng, numDistractors(q, [b, a - b, a]));
};

G.div_group = (rng, t) => {
  const b = rng.int(2, t < 0.5 ? 4 : 6);
  const q = rng.int(2, Math.floor((t < 0.5 ? 20 : 30) / b)); const a = b * q;
  const item = rng.pick(ITEMS); const h = rng.pick(HOLDERS);
  return finishMC({
    id: `${a}/${b}`, answer: num(q), accept: 'exact', data: { expr: `${a}/${b}` },
    prompt: T(`There are ${a} ${item.en}. Put ${b} in each ${h.en1}. How many ${h.en} do you need?`, `有 ${a} ${item.mw}${item.zh}，每個${h.zh}放 ${b} ${item.mw}，需要幾個${h.zh}？`),
    visual: { type: 'items', item: item.k, count: a, groupOf: b },
    hints: [
      T(`Circle groups of ${b}. Count the groups.`, `每 ${b} ${item.mw}圈成一組，數數看有幾組。`),
      T(`${a} ÷ ${b} = ?`, `${a} ÷ ${b} = ?`),
    ],
    steps: [T(`${a} ÷ ${b} = ${q} groups of ${b}.`, `${a} ÷ ${b} = ${q}，可以分成 ${q} 組。`)],
    tip: 'group',
  }, rng, numDistractors(q, [b, a - b]));
};

G.div_facts100 = (rng, t) => {
  const b = t < 0.5 ? rng.int(2, 6) : rng.int(3, 10);
  const q = rng.int(t < 0.5 ? 2 : 4, Math.min(Math.floor(100 / b), t < 0.5 ? 9 : 12));
  const a = b * q;
  const v = t > 0.4 ? rng.pick(['plain', 'plain', 'dividend', 'divisor']) : 'plain';
  const base = {
    id: `${a}/${b}${v[0]}`, input: 'pad', accept: 'exact',
    hints: [T(`Use a times-table fact with ${b}.`, `想想 ${b} 的乘法表。`), T(`${b} × ? = ${a}`, `${b} × ? = ${a}`)],
    steps: [T(`${b} × ${q} = ${a}, so ${a} ÷ ${b} = ${q}.`, `因為 ${b} × ${q} = ${a}，所以 ${a} ÷ ${b} = ${q}。`)],
    tip: 'facts',
  };
  if (v === 'dividend') return { ...base, answer: num(a), data: { expr: `${q}*${b}` }, prompt: T(`? ÷ ${b} = ${q}`, `? ÷ ${b} = ${q}`), hints: [T(`Division undoes multiplication. Try ${q} × ${b}.`, `除法和乘法是一對好朋友，試試 ${q} × ${b}。`)] };
  if (v === 'divisor') return { ...base, answer: num(b), data: { expr: `${a}/${q}` }, prompt: T(`${a} ÷ ? = ${q}`, `${a} ÷ ? = ${q}`), hints: [T(`${q} × ? = ${a}`, `${q} × ? = ${a}`)] };
  return { ...base, answer: num(q), data: { expr: `${a}/${b}` }, prompt: T(`${a} ÷ ${b} = ?`, `${a} ÷ ${b} = ?`) };
};

G.div_remainder = (rng, t) => {
  const b = rng.int(2, t < 0.5 ? 5 : 9);
  const r = rng.int(1, b - 1);
  const q = rng.int(1, Math.min(t < 0.5 ? 6 : 11, Math.floor((100 - r) / b)));
  const a = b * q + r;
  return {
    id: `${a}/${b}`, input: 'rempad', answer: qr(q, r), accept: 'exact', data: { op: 'divr', a, b },
    prompt: T(`${a} ÷ ${b} = ? R ?`, `${a} ÷ ${b} = ? 餘 ?`),
    visual: a <= 40 ? { type: 'dots', count: a, groupOf: b } : null,
    hints: [
      T(`What is the biggest multiple of ${b} that is not more than ${a}?`, `${b} 的倍數裡，不超過 ${a} 的最大是多少？`),
      T(`${b} × ${q} = ${b * q}. What is left from ${a}?`, `${b} × ${q} = ${b * q}，${a} 還剩下多少？`),
    ],
    steps: [
      T(`${b} × ${q} = ${b * q} fits into ${a}.`, `${b} × ${q} = ${b * q}，不超過 ${a}。`),
      T(`${a} − ${b * q} = ${r} left over.`, `${a} − ${b * q} = ${r}，剩下 ${r}。`),
      T(`The remainder ${r} is less than ${b} ✓  Answer: ${q} R ${r}`, `餘數 ${r} 比 ${b} 小 ✓  答案：${q} 餘 ${r}`),
    ],
    tip: 'remainder',
  };
};

G.div_word = (rng, t) => {
  const item = rng.pick(ITEMS); const who = rng.pick(NPCS); const grp = rng.pick(GROUPS); const h = rng.pick(HOLDERS);
  const kind = rng.pick(t < 0.4 ? ['share', 'group'] : ['share', 'group', 'ceil', 'left']);
  const b = rng.int(2, 9);
  if (kind === 'share' || kind === 'group') {
    const q = rng.int(2, Math.min(12, Math.floor(100 / b))); const a = b * q;
    const prompt = kind === 'share'
      ? T(`${who.en} has ${a} ${item.en} and shares them equally among ${b} ${grp.en}. How many does each ${grp.en1} get?`,
        `${who.zh}有 ${a} ${item.mw}${item.zh}，平分給 ${b} ${grp.mw}${grp.zh}，每${grp.mw}分到幾${item.mw}？`)
      : T(`${who.en} packs ${a} ${item.en}, ${b} in each ${h.en1}. How many ${h.en} are filled?`,
        `${who.zh}把 ${a} ${item.mw}${item.zh}裝進${h.zh}，每個${h.zh}裝 ${b} ${item.mw}，可以裝滿幾個${h.zh}？`);
    const wq = {
      id: `${kind}${a}/${b}`, input: 'pad', answer: num(q), accept: 'exact', data: { expr: `${a}/${b}` }, prompt,
      hints: [T(`Which operation? We split ${a} into equal groups → division.`, `要用什麼算法？把 ${a} 分成一樣多 → 用除法。`), T(`${a} ÷ ${b} = ?`, `${a} ÷ ${b} = ?`)],
      steps: [T(`${a} ÷ ${b} = ${q}`, `${a} ÷ ${b} = ${q}`)], tip: 'share',
    };
    return rng.chance(0.5) ? wq : finishMC(wq, rng, numDistractors(q, [b, a - b, a + b]));
  }
  const q = rng.int(2, Math.min(11, Math.floor(99 / b))); const r = rng.int(1, b - 1); const a = b * q + r;
  if (kind === 'ceil') {
    return {
      id: `ceil${a}/${b}`, input: 'pad', answer: num(q + 1), accept: 'exact', data: { op: 'ceil', a, b },
      prompt: T(`${a} explorers are crossing a river. Each boat holds ${b}. How many boats are needed so everyone can cross?`,
        `有 ${a} 位探險家要過河，每艘船最多坐 ${b} 位。最少需要幾艘船，大家才能全部過河？`),
      hints: [T(`${a} ÷ ${b} = ${q} R ${r}. What about the ${r} explorers left over?`, `${a} ÷ ${b} = ${q} 餘 ${r}。剩下的 ${r} 位怎麼辦？`)],
      steps: [T(`${a} ÷ ${b} = ${q} R ${r}`, `${a} ÷ ${b} = ${q} 餘 ${r}`), T(`The ${r} left over need one more boat: ${q} + 1 = ${q + 1}.`, `剩下的 ${r} 位還需要一艘船：${q} + 1 = ${q + 1}。`)],
      tip: 'remainder',
    };
  }
  return {
    id: `left${a}/${b}`, input: 'pad', answer: num(r), accept: 'exact', data: { op: 'mod', a, b },
    prompt: T(`${who.en} puts ${a} ${item.en} into ${h.en}, ${b} in each. How many ${item.en} are left over?`,
      `${who.zh}把 ${a} ${item.mw}${item.zh}放進${h.zh}，每個放 ${b} ${item.mw}，還剩下幾${item.mw}？`),
    hints: [T(`Find ${a} ÷ ${b}. The leftover is the remainder.`, `算算 ${a} ÷ ${b}，剩下的就是餘數。`)],
    steps: [T(`${a} ÷ ${b} = ${q} R ${r}, so ${r} are left over.`, `${a} ÷ ${b} = ${q} 餘 ${r}，所以剩下 ${r} ${item.mw}。`)],
    tip: 'remainder',
  };
};

function longPair(rng, t, allowRem) {
  for (let i = 0; i < 200; i++) {
    let a; let b;
    const f = t < 0.3 ? 0 : t < 0.55 ? rng.pick([0, 1, 1]) : rng.pick([1, 2, 3]);
    if (f === 0) { b = rng.int(2, 8); const q = rng.int(11, Math.floor(99 / b)); a = b * q; }
    else if (f === 1) { b = rng.int(2, 9); const q = rng.int(Math.max(12, Math.ceil(100 / b)), Math.floor(999 / b)); a = b * q; }
    else if (f === 2) { b = rng.int(3, 9); const q = rng.int(Math.ceil(1000 / b), Math.floor(9999 / b)); a = b * q; }
    else { b = rng.int(11, 25); const q = rng.int(Math.max(5, Math.ceil(100 / b)), Math.floor(999 / b)); a = b * q; }
    if (allowRem) a += rng.int(1, b - 1);
    if (a >= 10 && a <= 9999 && Math.floor(a / b) >= 5) return [a, b];
  }
  return [96, 4];
}

G.div_long = (rng, t) => {
  const [a, b] = longPair(rng, t, false); const q = a / b;
  return {
    id: `${a}/${b}`, input: 'pad', answer: num(q), accept: 'exact', data: { expr: `${a}/${b}` },
    prompt: T(`${a} ÷ ${b} = ?`, `${a} ÷ ${b} = ?`),
    visual: { type: 'longdiv', a, b },
    hints: [
      T(`Long division: divide, multiply, subtract, bring down. Start from the left.`, `直式除法：除、乘、減、移下來，從左邊開始。`),
      T(`Estimate first: ${b} × ${Math.round(q / 10) * 10 || 1} is about ${b * (Math.round(q / 10) * 10 || 1)}.`, `先估一估：${b} × ${Math.round(q / 10) * 10 || 1} 大約是 ${b * (Math.round(q / 10) * 10 || 1)}。`),
    ],
    steps: longDivSteps(a, b), tip: 'long',
  };
};

G.div_longrem = (rng, t) => {
  const [a, b] = longPair(rng, t, true); const L = longDivision(a, b);
  return {
    id: `${a}/${b}`, input: 'rempad', answer: qr(L.q, L.r), accept: 'exact', data: { op: 'divr', a, b },
    prompt: T(`${a} ÷ ${b} = ? R ?`, `${a} ÷ ${b} = ? 餘 ?`),
    visual: { type: 'longdiv', a, b },
    hints: [T(`Divide, multiply, subtract, bring down. What is left at the end is the remainder.`, `除、乘、減、移下來。最後剩下的就是餘數。`)],
    steps: longDivSteps(a, b), tip: 'long',
  };
};

G.div_multistep = (rng, t) => {
  const kind = rng.pick(['trays', 'spend', 'giveaway', 'rate']);
  const who = rng.pick(NPCS);
  for (let guard = 0; guard < 300; guard++) {
    if (kind === 'trays') {
      const z = rng.int(2, 9); const ans = rng.int(2, 12); const total = z * ans;
      const ys = []; for (let y = 3; y <= 12; y++) if (total % y === 0 && total / y >= 2 && total / y <= 12) ys.push(y);
      if (!ys.length) continue;
      const y = rng.pick(ys); const x = total / y;
      return {
        id: `trays${x}x${y}/${z}`, input: 'pad', answer: num(ans), accept: 'exact', data: { expr: `${x}*${y}/${z}` },
        prompt: T(`${who.en} baked ${x} trays with ${y} cookies on each tray. The cookies are shared equally into ${z} boxes. How many cookies go in each box?`,
          `${who.zh}烤了 ${x} 盤餅乾，每盤 ${y} 片。把餅乾平分裝進 ${z} 個盒子，每盒有幾片？`),
        hints: [T(`Step 1: how many cookies in all? ${x} × ${y}`, `第一步：一共有幾片？${x} × ${y}`), T(`Step 2: share ${total} into ${z} boxes.`, `第二步：把 ${total} 片平分到 ${z} 盒。`)],
        steps: [T(`${x} × ${y} = ${total} cookies`, `${x} × ${y} = ${total} 片`), T(`${total} ÷ ${z} = ${ans}`, `${total} ÷ ${z} = ${ans}`)], tip: 'multistep',
      };
    }
    if (kind === 'spend') {
      const k = rng.int(2, 8); const ans = rng.int(3, 15); const rest = k * ans; const s = rng.int(5, 60); const n = rest + s;
      return {
        id: `spend${n}-${s}/${k}`, input: 'pad', answer: num(ans), accept: 'exact', data: { expr: `(${n}-${s})/${k}` },
        prompt: T(`${who.en} had ${n} gold coins, spent ${s} at the market, then shared the rest equally among ${k} friends. How many coins did each friend get?`,
          `${who.zh}有 ${n} 枚金幣，在市場花了 ${s} 枚，剩下的平分給 ${k} 個朋友。每個朋友分到幾枚？`),
        hints: [T(`Step 1: how many are left? ${n} − ${s}`, `第一步：還剩幾枚？${n} − ${s}`), T(`Step 2: ${rest} ÷ ${k}`, `第二步：${rest} ÷ ${k}`)],
        steps: [T(`${n} − ${s} = ${rest}`, `${n} − ${s} = ${rest}`), T(`${rest} ÷ ${k} = ${ans}`, `${rest} ÷ ${k} = ${ans}`)], tip: 'multistep',
      };
    }
    if (kind === 'giveaway') {
      const k = rng.int(2, 9); const each = rng.int(4, 15); const g = rng.int(1, each - 1); const n = k * each;
      return {
        id: `give${n}/${k}-${g}`, input: 'pad', answer: num(each - g), accept: 'exact', data: { expr: `${n}/${k}-${g}` },
        prompt: T(`${k} explorers share ${n} gems equally. Then each explorer gives ${g} gems to a little dragon. How many gems does each explorer have now?`,
          `${k} 位探險家平分 ${n} 顆寶石，然後每人送 ${g} 顆給小龍。現在每位探險家還有幾顆？`),
        hints: [T(`Step 1: ${n} ÷ ${k}`, `第一步：${n} ÷ ${k}`), T(`Step 2: take away ${g}.`, `第二步：再減去 ${g}。`)],
        steps: [T(`${n} ÷ ${k} = ${each}`, `${n} ÷ ${k} = ${each}`), T(`${each} − ${g} = ${each - g}`, `${each} − ${g} = ${each - g}`)], tip: 'multistep',
      };
    }
    // rate
    const d = rng.int(2, 6); const per = rng.int(8, 45); const total = d * per; const m = rng.int(2, 9);
    if (m === d) continue;
    return {
      id: `rate${total}/${d}x${m}`, input: 'pad', answer: num(per * m), accept: 'exact', data: { expr: `${total}/${d}*${m}` },
      prompt: T(`Captain Pebble sails ${total} km in ${d} days, the same distance each day. How far does the ship sail in ${m} days?`,
        `烏龜船長小石 ${d} 天航行 ${total} 公里，每天航行一樣遠。${m} 天可以航行幾公里？`),
      hints: [T(`Step 1: distance in one day: ${total} ÷ ${d}`, `第一步：一天航行多遠？${total} ÷ ${d}`), T(`Step 2: multiply by ${m}.`, `第二步：再乘以 ${m}。`)],
      steps: [T(`${total} ÷ ${d} = ${per} km per day`, `${total} ÷ ${d} = ${per}（每天公里數）`), T(`${per} × ${m} = ${per * m}`, `${per} × ${m} = ${per * m}`)], tip: 'multistep',
    };
  }
  return G.div_facts100(rng, t);
};

// ================== FRACTIONS ==================
const SHAPES = ['pie', 'bar', 'rect'];

G.frac_identify = (rng, t) => {
  const d = t < 0.5 ? rng.pick([2, 3, 4]) : rng.pick([2, 3, 4, 5, 6, 8]);
  const n = rng.int(1, d - 1); const shape = rng.pick(SHAPES);
  return finishMC({
    id: `${n}/${d}${shape[0]}`, answer: fr(n, d), accept: 'exact', data: { expr: `${n}/${d}` },
    prompt: T('What fraction is colored?', '塗色的部分是幾分之幾？'),
    visual: { type: shape, n, d },
    hints: [
      T(`Count ALL the equal parts. That is the bottom number (denominator).`, `先數一數全部有幾等份，那是下面的數（分母）。`),
      T(`Now count the colored parts. That is the top number (numerator).`, `再數塗色的有幾份，那是上面的數（分子）。`),
    ],
    steps: [T(`${d} equal parts, ${n} colored → [${n}/${d}]`, `全部 ${d} 等份，塗色 ${n} 份 → [${n}/${d}]`)], tip: 'fraction',
  }, rng, [fr(d - n, d), fr(n, d - n || 1), fr(n, d + 1), fr(n + 1, d), fr(d, n)]);
};

G.frac_shade = (rng, t) => {
  const d = t < 0.5 ? rng.pick([2, 3, 4]) : rng.pick([3, 4, 5, 6, 8]);
  const n = rng.int(1, d - 1); const shape = rng.pick(SHAPES);
  const food = shape === 'pie' ? T('pizza', '披薩') : shape === 'bar' ? T('chocolate bar', '巧克力') : T('garden', '花園');
  return {
    id: `${n}/${d}${shape[0]}`, input: 'shade', shape, d, answer: num(n), accept: 'exact', data: { expr: `${n}` },
    prompt: T(`Tap to color [${n}/${d}] of the ${food.en}.`, `點一點，把${food.zh}的 [${n}/${d}] 塗上顏色。`),
    hints: [T(`The ${food.en} has ${d} equal parts. Color ${n} of them.`, `${food.zh}有 ${d} 等份，要塗 ${n} 份。`)],
    steps: [T(`[${n}/${d}] means ${n} out of ${d} equal parts.`, `[${n}/${d}] 就是把全部平分成 ${d} 份，取其中 ${n} 份。`)], tip: 'fraction',
  };
};

const LABEL = {
  total: T('How many equal parts the whole is cut into', '全部平分成幾等份'),
  chosen: T('How many of the parts we are counting', '我們取了幾份'),
  size: T('How big the whole thing is', '整個東西有多大'),
  left: T('How many parts are left over', '還剩下幾份'),
};

G.frac_parts = (rng, t) => {
  const d = rng.int(2, t < 0.5 ? 6 : 10); const n = rng.int(1, d - 1);
  const v = rng.pick(['den', 'num', 'cake', 'meaning']);
  if (v === 'den' || v === 'num') {
    const isDen = v === 'den';
    return finishMC({
      id: `${v}${n}/${d}`, answer: num(isDen ? d : n), accept: 'exact', data: { expr: `${isDen ? d : n}` },
      prompt: isDen ? T(`In [${n}/${d}], what is the denominator?`, `在 [${n}/${d}] 裡，分母是多少？`) : T(`In [${n}/${d}], what is the numerator?`, `在 [${n}/${d}] 裡，分子是多少？`),
      hints: [T('Numerator on top, denominator down below. (Think: "D" for Down!)', '分子在上面，分母在下面。（分母像媽媽，在下面抱著分子！）')],
      steps: [T(`[${n}/${d}]: numerator ${n}, denominator ${d}.`, `[${n}/${d}]：分子是 ${n}，分母是 ${d}。`)], tip: 'fraction',
    }, rng, [num(isDen ? n : d), num(n + d), num(d - n), num(1)]);
  }
  if (v === 'cake') {
    return finishMC({
      id: `cake${n}/${d}`, answer: fr(n, d), accept: 'exact', data: { expr: `${n}/${d}` },
      prompt: T(`A cake is cut into ${d} equal pieces. ${n} of them have sprinkles. What fraction has sprinkles?`, `一個蛋糕平分成 ${d} 塊，其中 ${n} 塊有彩色糖粒。有糖粒的是幾分之幾？`),
      visual: { type: 'pie', n, d },
      hints: [T(`Denominator = all pieces (${d}). Numerator = pieces with sprinkles.`, `分母 = 全部的塊數（${d}），分子 = 有糖粒的塊數。`)],
      steps: [T(`[${n}/${d}]`, `[${n}/${d}]`)], tip: 'fraction',
    }, rng, [fr(d - n, d), fr(d, n), fr(n, d + n)]);
  }
  const askDen = rng.chance(0.5);
  const ans = askDen ? sym('total', LABEL.total) : sym('chosen', LABEL.chosen);
  const other = askDen ? sym('chosen', LABEL.chosen) : sym('total', LABEL.total);
  return finishMC({
    id: `meaning${askDen ? 'd' : 'n'}`, answer: ans, accept: 'exact', data: { op: 'pick' },
    prompt: askDen ? T(`What does the denominator (bottom number) of [${n}/${d}] tell us?`, `[${n}/${d}] 的分母（下面的數）告訴我們什麼？`)
      : T(`What does the numerator (top number) of [${n}/${d}] tell us?`, `[${n}/${d}] 的分子（上面的數）告訴我們什麼？`),
    visual: { type: 'pie', n, d },
    hints: [T(`Look at the picture: ${d} parts in all, ${n} colored.`, `看圖：全部 ${d} 份，塗色 ${n} 份。`)],
    steps: [T('Denominator = number of equal parts in the whole. Numerator = number of parts we take.', '分母＝全部平分成幾份；分子＝取了幾份。')], tip: 'fraction',
  }, rng, [other, sym('size', LABEL.size), sym('left', LABEL.left)]);
};

G.frac_equiv = (rng, t) => {
  const [n0, d0] = simplestFrac(rng, 2, t < 0.5 ? 5 : 8);
  const k = rng.int(2, t < 0.5 ? 3 : 5); const N = n0 * k; const D = d0 * k;
  const v = rng.pick(['num', 'den', 'mc']);
  const steps = [T(`[${n0}/${d0}] = [${n0}×${k}/${d0}×${k}] = [${N}/${D}]`, `[${n0}/${d0}] = [${n0}×${k}/${d0}×${k}] = [${N}/${D}]`), T('Multiply the top and the bottom by the same number.', '分子和分母同時乘以同一個數。')];
  if (v === 'mc') {
    return finishMC({
      id: `mc${n0}/${d0}x${k}`, answer: fr(N, D), accept: 'exact', data: { expr: `${N}/${D}` },
      prompt: T(`Which fraction is equal to [${n0}/${d0}]?`, `哪一個分數和 [${n0}/${d0}] 一樣大？`),
      visual: { type: 'bar', n: n0, d: d0 },
      hints: [T('Equal fractions: multiply top AND bottom by the same number.', '等值分數：分子和分母要乘以同一個數。')], steps, tip: 'equiv',
    }, rng, [fr(n0 + k, d0 + k), fr(N, d0 + k), fr(n0, D), fr(N + 1, D), fr(N, D + 1)]);
  }
  const isNum = v === 'num';
  return {
    id: `${v}${n0}/${d0}x${k}`, input: 'pad', answer: num(isNum ? N : D), accept: 'exact',
    data: { expr: isNum ? `${n0}*${D}/${d0}` : `${d0}*${N}/${n0}` },
    prompt: isNum ? T(`[${n0}/${d0}] = [?/${D}]`, `[${n0}/${d0}] = [?/${D}]`) : T(`[${n0}/${d0}] = [${N}/?]`, `[${n0}/${d0}] = [${N}/?]`),
    visual: { type: 'bars', items: [{ n: n0, d: d0 }, { n: N, d: D }] },
    hints: [
      isNum ? T(`${d0} × ? = ${D}`, `${d0} × ? = ${D}`) : T(`${n0} × ? = ${N}`, `${n0} × ? = ${N}`),
      T(`Do the same to the other number: multiply by ${k}.`, `另一個數也要乘以 ${k}。`),
    ],
    steps, tip: 'equiv',
  };
};

G.frac_compare = (rng, t) => {
  let a; let b; let c; let d; let kind;
  const kinds = t < 0.4 ? ['den', 'den', 'num'] : ['den', 'num', 'eq', 'half'];
  kind = rng.pick(kinds);
  if (kind === 'den') { d = b = rng.int(3, t < 0.5 ? 8 : 12); [a, c] = pickDistinct(rng, 1, b - 1, 2); if (c === undefined) c = a === 1 ? 2 : 1; }
  else if (kind === 'num') { a = c = rng.int(1, 4); [b, d] = pickDistinct(rng, a + 1, 12, 2); if (d === undefined) d = b + 1; }
  else if (kind === 'eq') { const [n0, d0] = simplestFrac(rng, 2, 6); const k = rng.int(2, 3); [a, b, c, d] = rng.chance(0.5) ? [n0, d0, n0 * k, d0 * k] : [n0 * k, d0 * k, n0, d0]; }
  else {
    // one below a half, one above
    const b1 = rng.int(4, 12); const a1 = rng.int(1, Math.ceil(b1 / 2) - 1);
    const d1 = rng.int(3, 12); const c1 = rng.int(Math.floor(d1 / 2) + 1, d1 - 1);
    [a, b, c, d] = rng.chance(0.5) ? [a1, b1, c1, d1] : [c1, d1, a1, b1];
  }
  const cmp = rcmp(rat(a, b), rat(c, d));
  const s = cmp < 0 ? '<' : cmp > 0 ? '>' : '=';
  const hint = {
    den: T('Same denominator: the bigger numerator means more pieces.', '分母一樣：分子越大，分數越大。'),
    num: T('Same numerator: the bigger denominator means SMALLER pieces.', '分子一樣：分母越大，每一份越小！'),
    eq: T('Try simplifying both fractions first.', '先把兩個分數約分看看。'),
    half: T('Is each fraction more or less than one half?', '每個分數比 [1/2] 大還是小？'),
  }[kind];
  return finishMC({
    id: `${a}/${b}?${c}/${d}`, answer: sym(s), accept: 'exact', data: { op: 'cmp', x: `${a}/${b}`, y: `${c}/${d}` },
    prompt: T(`Choose the sign: [${a}/${b}] ◯ [${c}/${d}]`, `選出正確的符號：[${a}/${b}] ◯ [${c}/${d}]`),
    visual: { type: 'bars', items: [{ n: a, d: b }, { n: c, d }] },
    hints: [hint],
    steps: [T(`[${a}/${b}] ${s} [${c}/${d}]`, `[${a}/${b}] ${s} [${c}/${d}]`), hint], tip: 'compare',
  }, rng, ['<', '>', '='].filter((x) => x !== s).map((x) => sym(x)), 3);
};

function addSubSame(rng, t, isAdd) {
  const d = rng.int(3, t < 0.5 ? 8 : 12);
  let n1; let n2;
  if (isAdd) {
    const maxSum = t < 0.6 ? d : 2 * d - 1;
    n1 = rng.int(1, Math.min(d - 1, maxSum - 1)); n2 = rng.int(1, Math.min(d - 1, maxSum - n1));
  } else { n1 = rng.int(2, d - 1); n2 = rng.int(1, n1 - 1); }
  const r = isAdd ? n1 + n2 : n1 - n2;
  const op = isAdd ? '+' : '−';
  return {
    id: `${n1}/${d}${isAdd ? '+' : '-'}${n2}/${d}`, input: 'fracpad', allowWhole: r >= d, answer: fr(r, d), accept: 'equiv',
    data: { expr: `${n1}/${d}${isAdd ? '+' : '-'}${n2}/${d}` },
    prompt: T(`[${n1}/${d}] ${op} [${n2}/${d}] = ?`, `[${n1}/${d}] ${op} [${n2}/${d}] = ?`),
    visual: { type: 'bars', items: [{ n: n1, d }, { n: n2, d }] },
    hints: [T(`Same-size pieces! ${isAdd ? 'Add' : 'Subtract'} the numerators. The denominator stays ${d}.`, `每一份一樣大！分子${isAdd ? '相加' : '相減'}，分母 ${d} 不變。`)],
    steps: [T(`${n1} ${op} ${n2} = ${r}, so the answer is [${r}/${d}].`, `${n1} ${op} ${n2} = ${r}，答案是 [${r}/${d}]。`)],
    misconceptions: isAdd ? [{ ans: fr(r, 2 * d), msg: 'addDen' }] : [{ ans: fr(r, 0), msg: 'addDen' }],
    tip: 'addfrac',
  };
}
G.frac_addsame = (rng, t) => addSubSame(rng, t, true);
G.frac_subsame = (rng, t) => addSubSame(rng, t, false);

G.frac_line = (rng, t) => {
  const d = t < 0.5 ? rng.pick([2, 3, 4]) : rng.pick([3, 4, 5, 6, 8]);
  const max = t > 0.6 && rng.chance(0.35) ? 2 : 1;
  let k; do { k = rng.int(1, d * max - 1); } while (k % d === 0);
  if (rng.chance(0.6)) {
    return {
      id: `tap${k}/${d}m${max}`, input: 'line', d, max, answer: num(k), accept: 'exact', data: { expr: `${k}` },
      prompt: T(`Tap where [${k}/${d}] goes on the number line.`, `[${k}/${d}] 在數線上的哪裡？點點看。`),
      hints: [T(`Each jump between 0 and 1 is [1/${d}]. Count ${k} jumps from 0.`, `0 到 1 之間每一小格是 [1/${d}]，從 0 開始數 ${k} 格。`)],
      steps: [T(`From 0, count ${k} jumps of [1/${d}].`, `從 0 開始，數 ${k} 個 [1/${d}]。`)], tip: 'line',
    };
  }
  return finishMC({
    id: `read${k}/${d}m${max}`, answer: fr(k, d), accept: 'exact', data: { expr: `${k}/${d}` },
    prompt: T('What fraction is at the star?', '星星在哪個分數上？'),
    visual: { type: 'line', d, max, mark: k },
    hints: [T(`How many equal jumps between 0 and 1? That is the denominator.`, `0 到 1 之間平分成幾格？那就是分母。`)],
    steps: [T(`Each jump is [1/${d}]. The star is ${k} jumps from 0 → [${k}/${d}].`, `每格是 [1/${d}]，星星在第 ${k} 格 → [${k}/${d}]。`)], tip: 'line',
  }, rng, [fr(k + 1, d), fr(k - 1, d), fr(k, d * max + 1), fr(k, d + 1), fr(d, k)]);
};

G.frac_simplify = (rng, t) => {
  const [n0, d0] = simplestFrac(rng, 2, t < 0.5 ? 6 : 12);
  const k = rng.int(2, t < 0.5 ? 4 : 8); const N = n0 * k; const D = d0 * k; const g = gcd(N, D);
  return {
    id: `${N}/${D}`, input: 'fracpad', answer: fr(n0, d0), accept: 'simplest', data: { expr: `${N}/${D}` },
    prompt: T(`Simplify [${N}/${D}] to its simplest form.`, `把 [${N}/${D}] 約分成最簡分數。`),
    hints: [T(`Find a number that divides both ${N} and ${D}.`, `找一個可以同時整除 ${N} 和 ${D} 的數。`), T(`Try dividing both by ${g}.`, `試試看兩個都除以 ${g}。`)],
    steps: [T(`The biggest number that divides both is ${g}.`, `${N} 和 ${D} 的最大公因數是 ${g}。`), T(`${N} ÷ ${g} = ${n0}, ${D} ÷ ${g} = ${d0} → [${n0}/${d0}]`, `${N} ÷ ${g} = ${n0}，${D} ÷ ${g} = ${d0} → [${n0}/${d0}]`)],
    tip: 'simplify',
  };
};

G.frac_mixed = (rng, t) => {
  const [n, d] = simplestFrac(rng, 2, 9); const w = rng.int(1, t < 0.5 ? 3 : 6); const N = w * d + n;
  if (rng.chance(0.5)) {
    return {
      id: `tomix${N}/${d}`, input: 'fracpad', allowWhole: true, requireWhole: true, answer: mx(w, n, d), accept: 'mixed', data: { expr: `${N}/${d}` },
      prompt: T(`Write [${N}/${d}] as a mixed number.`, `把假分數 [${N}/${d}] 化成帶分數。`),
      visual: { type: 'pies', w, n, d },
      hints: [T(`How many whole ${d}s fit in ${N}? ${N} ÷ ${d} = ?`, `${N} 裡有幾個完整的 ${d}？${N} ÷ ${d} = ?`), T('The remainder becomes the new numerator.', '餘數就是新的分子。')],
      steps: [T(`${N} ÷ ${d} = ${w} R ${n}`, `${N} ÷ ${d} = ${w} 餘 ${n}`), T(`So [${N}/${d}] = [${w} ${n}/${d}]`, `所以 [${N}/${d}] = [${w} ${n}/${d}]`)], tip: 'mixed',
    };
  }
  return {
    id: `toimp${w}_${n}/${d}`, input: 'fracpad', answer: fr(N, d), accept: 'improper', data: { expr: `${w}+${n}/${d}` },
    prompt: T(`Write [${w} ${n}/${d}] as an improper fraction.`, `把帶分數 [${w} ${n}/${d}] 化成假分數。`),
    visual: { type: 'pies', w, n, d },
    hints: [T(`Each whole is [${d}/${d}]. ${w} wholes = ${w} × ${d} pieces.`, `每一個 1 是 [${d}/${d}]，${w} 個 1 有 ${w} × ${d} 份。`)],
    steps: [T(`${w} × ${d} + ${n} = ${N}`, `${w} × ${d} + ${n} = ${N}`), T(`So [${w} ${n}/${d}] = [${N}/${d}]`, `所以 [${w} ${n}/${d}] = [${N}/${d}]`)], tip: 'mixed',
  };
};

function addSubDiff(rng, t, isAdd) {
  for (let g = 0; g < 200; g++) {
    let d1; let d2;
    if (t < 0.4) { d1 = rng.int(2, 4); d2 = d1 * rng.int(2, 3); if (rng.chance(0.5)) [d1, d2] = [d2, d1]; }
    else { d1 = rng.int(2, 10); d2 = rng.int(2, 10); }
    if (d1 === d2 || lcm(d1, d2) > (t < 0.7 ? 24 : 40)) continue;
    const n1 = rng.int(1, d1 - 1); const n2 = rng.int(1, d2 - 1);
    const x = rat(n1, d1); const y = rat(n2, d2);
    if (!isAdd && rcmp(x, y) <= 0) continue;
    const L = lcm(d1, d2); const a1 = n1 * (L / d1); const a2 = n2 * (L / d2);
    const rN = isAdd ? a1 + a2 : a1 - a2; const op = isAdd ? '+' : '−';
    const s = rat(rN, L);
    return {
      id: `${n1}/${d1}${isAdd ? '+' : '-'}${n2}/${d2}`, input: 'fracpad', allowWhole: rN >= L, answer: fr(rN, L), accept: 'equiv',
      data: { expr: `${n1}/${d1}${isAdd ? '+' : '-'}${n2}/${d2}` },
      prompt: T(`[${n1}/${d1}] ${op} [${n2}/${d2}] = ?`, `[${n1}/${d1}] ${op} [${n2}/${d2}] = ?`),
      visual: { type: 'bars', items: [{ n: n1, d: d1 }, { n: n2, d: d2 }] },
      hints: [
        T(`The pieces are different sizes. Find a common denominator: ${L}.`, `每一份大小不一樣，先通分。公分母可以用 ${L}。`),
        T(`[${n1}/${d1}] = [${a1}/${L}] and [${n2}/${d2}] = [${a2}/${L}]`, `[${n1}/${d1}] = [${a1}/${L}]，[${n2}/${d2}] = [${a2}/${L}]`),
      ],
      steps: [
        T(`Common denominator ${L}: [${a1}/${L}] ${op} [${a2}/${L}]`, `通分成 ${L}：[${a1}/${L}] ${op} [${a2}/${L}]`),
        T(`= [${rN}/${L}]${s.d !== L ? ` = [${s.n}/${s.d}]` : ''}`, `= [${rN}/${L}]${s.d !== L ? ` = [${s.n}/${s.d}]` : ''}`),
      ],
      misconceptions: isAdd ? [{ ans: fr(n1 + n2, d1 + d2), msg: 'addDen' }] : [],
      tip: 'addfrac',
    };
  }
  return addSubSame(rng, t, isAdd);
}
G.frac_adddiff = (rng, t) => addSubDiff(rng, t, true);
G.frac_subdiff = (rng, t) => addSubDiff(rng, t, false);

G.frac_order = (rng, t) => {
  const count = t > 0.6 ? 4 : 3;
  for (let g = 0; g < 200; g++) {
    const items = [];
    for (let i = 0; i < count; i++) { const d = rng.int(2, 12); items.push([rng.int(1, d - 1), d]); }
    const vals = items.map(([n, d]) => rat(n, d));
    let distinct = true;
    for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) if (rcmp(vals[i], vals[j]) === 0) distinct = false;
    if (!distinct) continue;
    const order = items.map((_, i) => i).sort((i, j) => rcmp(vals[i], vals[j]));
    return {
      id: items.map(([n, d]) => `${n}/${d}`).join(','), input: 'order', cards: items.map(([n, d]) => fr(n, d)), answer: ord(order), accept: 'exact',
      data: { op: 'order', items: items.map(([n, d]) => `${n}/${d}`) },
      prompt: T('Tap the fractions from SMALLEST to LARGEST.', '從最小到最大，依序點選分數。'),
      hints: [T('Compare each fraction with [1/2]. Which are less than one half?', '先和 [1/2] 比一比，哪些比一半小？'), T('You can also change them to the same denominator.', '也可以通分成一樣的分母再比較。')],
      steps: [T(`Smallest to largest: ${order.map((i) => `[${items[i][0]}/${items[i][1]}]`).join(' < ')}`, `由小到大：${order.map((i) => `[${items[i][0]}/${items[i][1]}]`).join(' < ')}`)],
      tip: 'compare',
    };
  }
  return G.frac_compare(rng, t);
};

// Drag puzzle: share with leftovers (remainders you can touch)
G.div_sharerem = (rng, t) => {
  const g = rng.int(2, t < 0.5 ? 4 : 5);
  const q = rng.int(2, t < 0.5 ? 4 : 5);
  const r = rng.int(1, g - 1);
  const total = g * q + r; const item = rng.pick(ITEMS); const h = rng.pick(HOLDERS);
  return {
    id: `${total}/${g}${item.k}`, input: 'share', item: item.k, groups: g, total, leftover: true,
    answer: qr(q, r), accept: 'exact', data: { op: 'divr', a: total, b: g },
    prompt: T(`Share ${total} ${item.en} equally into ${g} ${h.en}. Put any that can't be shared fairly in the leftover spot!`,
      `把 ${total} ${item.mw}${item.zh}平分到 ${g} 個${h.zh}。不能平分的放到「剩下」的地方！`),
    after: T(`Each ${h.en1} gets ${q}, and ${r} left over: ${total} ÷ ${g} = ${q} R ${r}`, `每個${h.zh} ${q} ${item.mw}，剩下 ${r} ${item.mw}：${total} ÷ ${g} = ${q} 餘 ${r}`),
    hints: [T(`Deal them out one at a time. Stop when there are not enough for every ${h.en1}.`, `一個一個輪流放，不夠每個${h.zh}都放一個時就停下來。`)],
    steps: [T(`${g} × ${q} = ${g * q}`, `${g} × ${q} = ${g * q}`), T(`${total} − ${g * q} = ${r} left over`, `${total} − ${g * q} = ${r}（剩下）`), T(`${total} ÷ ${g} = ${q} R ${r}`, `${total} ÷ ${g} = ${q} 餘 ${r}`)],
    tip: 'remainder',
  };
};

// Tap puzzle: shade an equivalent fraction on a shape with more parts
G.frac_equivshade = (rng, t) => {
  const [n0, d0] = simplestFrac(rng, 2, t < 0.5 ? 4 : 6);
  const k = rng.int(2, t < 0.5 ? 2 : 3); const D = d0 * k; const N = n0 * k;
  const shape = rng.pick(['bar', 'rect', 'pie']);
  return {
    id: `${n0}/${d0}in${D}${shape[0]}`, input: 'shade', shape, d: D, answer: num(N), accept: 'exact', data: { expr: `${n0}*${D}/${d0}` },
    prompt: T(`This shape has ${D} equal parts. Color exactly [${n0}/${d0}] of it.`, `這個圖形有 ${D} 等份，請塗滿剛好 [${n0}/${d0}]。`),
    hints: [T(`Split the ${D} parts into ${d0} equal groups. Each group has ${k} parts.`, `把 ${D} 份分成 ${d0} 組，每組有 ${k} 份。`), T(`Color ${n0} group${n0 > 1 ? 's' : ''}.`, `塗 ${n0} 組。`)],
    steps: [T(`[${n0}/${d0}] = [${N}/${D}], so color ${N} parts.`, `[${n0}/${d0}] = [${N}/${D}]，所以要塗 ${N} 份。`)], tip: 'equiv',
  };
};

// ================== COMBINED (Math Kingdom) ==================
G.mix_fracof = (rng, t, lvl = 2) => {
  const item = rng.pick(ITEMS); const who = rng.pick(NPCS);
  let n; let d; let N;
  if (lvl <= 1) { d = rng.int(2, 4); n = 1; N = d * rng.int(1, Math.floor(20 / d)); }
  else if (lvl === 2) { d = rng.int(2, 8); n = rng.int(1, d - 1); N = d * rng.int(2, Math.floor(60 / d)); }
  else { d = rng.int(3, 12); n = rng.int(1, d - 1); N = d * rng.int(3, Math.floor(240 / d)); }
  const ans = (N / d) * n;
  const q = {
    id: `${n}/${d}of${N}`, input: lvl <= 1 ? 'mc' : 'pad', answer: num(ans), accept: 'exact', data: { expr: `${N}*${n}/${d}` },
    prompt: T(`${who.en} found ${N} ${item.en}. [${n}/${d}] of them are sparkly. How many are sparkly?`, `${who.zh}找到 ${N} ${item.mw}${item.zh}，其中 [${n}/${d}] 會閃閃發亮。會發亮的有幾${item.mw}？`),
    visual: N <= 24 ? { type: 'items', item: item.k, count: N, groups: d } : null,
    hints: [T(`Split ${N} into ${d} equal groups: ${N} ÷ ${d} = ${N / d}.`, `把 ${N} 平分成 ${d} 組：${N} ÷ ${d} = ${N / d}。`), T(`Take ${n} of those groups.`, `取其中 ${n} 組。`)],
    steps: [T(`${N} ÷ ${d} = ${N / d}`, `${N} ÷ ${d} = ${N / d}`), T(`${N / d} × ${n} = ${ans}`, `${N / d} × ${n} = ${ans}`)], tip: 'fracof',
  };
  return q.input === 'mc' ? finishMC(q, rng, numDistractors(ans, [N / d + 1, N - ans, d, N])) : q;
};

G.mix_sharefrac = (rng, t, lvl = 2) => {
  let a; let b;
  for (let g = 0; g < 100; g++) {
    b = rng.int(2, 8); a = lvl >= 3 ? rng.int(b + 1, 3 * b) : rng.int(1, b - 1);
    if (a % b !== 0) break;
  }
  const s = rat(a, b);
  return {
    id: `${a}pz/${b}`, input: 'fracpad', allowWhole: a > b, answer: fr(a, b), accept: 'equiv', data: { expr: `${a}/${b}` },
    prompt: T(`${a} pizza${a > 1 ? 's are' : ' is'} shared equally by ${b} friends. How much pizza does each friend get?`, `${a} 個披薩平分給 ${b} 個朋友，每人分到多少個披薩？`),
    visual: { type: 'pizzas', count: a, people: b },
    hints: [T(`Cut each pizza into ${b} slices. Each friend gets one slice from every pizza.`, `每個披薩切成 ${b} 片，每個朋友從每個披薩各拿一片。`), T(`${a} ÷ ${b} = [${a}/${b}]`, `${a} ÷ ${b} = [${a}/${b}]`)],
    steps: [T(`Sharing is dividing: ${a} ÷ ${b} = [${a}/${b}]${a > b ? ` = [${Math.floor(a / b)} ${a % b}/${b}]` : ''}`, `平分就是除法：${a} ÷ ${b} = [${a}/${b}]${a > b ? ` = [${Math.floor(a / b)} ${a % b}/${b}]` : ''}`), ...(s.d !== b ? [T(`Simplified: [${s.n}/${s.d}]`, `約分後：[${s.n}/${s.d}]`)] : [])],
    tip: 'pizza',
  };
};

G.mix_divmixed = (rng, t) => {
  const b = rng.int(2, 9); const q = rng.int(1, t < 0.5 ? 5 : 12); let r = rng.int(1, b - 1);
  while (gcd(r, b) !== 1) r = rng.int(1, b - 1);
  const a = b * q + r;
  return {
    id: `${a}/${b}`, input: 'fracpad', allowWhole: true, requireWhole: true, answer: mx(q, r, b), accept: 'mixed', data: { expr: `${a}/${b}` },
    prompt: T(`Write ${a} ÷ ${b} as a mixed number.`, `把 ${a} ÷ ${b} 寫成帶分數。`),
    hints: [T(`${a} ÷ ${b} = ? R ?`, `${a} ÷ ${b} = ? 餘 ?`), T(`The remainder goes on top, the divisor ${b} on the bottom.`, `餘數當分子，除數 ${b} 當分母。`)],
    steps: [T(`${a} ÷ ${b} = ${q} R ${r}`, `${a} ÷ ${b} = ${q} 餘 ${r}`), T(`= [${q} ${r}/${b}]`, `= [${q} ${r}/${b}]`)], tip: 'mixed',
  };
};

// ================== LEGENDARY ==================
G.legend_multi = (rng, t) => {
  const kind = rng.pick(['dragon', 'potion', 'cake', 'rate']);
  if (kind === 'dragon') {
    const k = rng.int(2, 5); const c = rng.int(2, 6); const j = rng.int(1, Math.max(1, Math.floor(240 / (k * c))));
    const N = k * c * j; const give = N / k; const each = (N - give) / c;
    return {
      id: `dragon${N}/${k}/${c}`, input: 'pad', answer: num(each), accept: 'exact', data: { expr: `(${N}-${N}/${k})/${c}` },
      prompt: T(`The Legendary Dragon guards ${N} gems. It gives [1/${k}] of them to the village, then shares the rest equally among ${c} caves. How many gems go in each cave?`,
        `傳說巨龍守護著 ${N} 顆寶石。牠把其中的 [1/${k}] 送給村莊，剩下的平分到 ${c} 個山洞。每個山洞有幾顆？`),
      hints: [T(`Step 1: [1/${k}] of ${N} = ${N} ÷ ${k}`, `第一步：${N} 的 [1/${k}] = ${N} ÷ ${k}`), T(`Step 2: how many are left? Step 3: share them into ${c} caves.`, `第二步：還剩幾顆？第三步：平分到 ${c} 個山洞。`)],
      steps: [T(`${N} ÷ ${k} = ${give} given away`, `${N} ÷ ${k} = ${give}（送出）`), T(`${N} − ${give} = ${N - give}`, `${N} − ${give} = ${N - give}`), T(`${N - give} ÷ ${c} = ${each}`, `${N - give} ÷ ${c} = ${each}`)], tip: 'multistep',
    };
  }
  if (kind === 'potion') {
    const [n, d] = simplestFrac(rng, 2, 6); const m = d * rng.int(2, 6); const ans = (m / d) * n;
    return {
      id: `potion${n}/${d}x${m}`, input: 'pad', answer: num(ans), accept: 'exact', data: { expr: `${n}/${d}*${m}` },
      prompt: T(`One potion needs [${n}/${d}] cup of moon water. A wizard makes ${m} potions. How many cups of moon water are needed?`,
        `一瓶藥水需要 [${n}/${d}] 杯月光水。魔法師要做 ${m} 瓶，一共需要幾杯月光水？`),
      hints: [T(`${m} groups of [${n}/${d}]. First find ${m} ÷ ${d}.`, `${m} 個 [${n}/${d}]。先算 ${m} ÷ ${d}。`), T(`Then multiply by ${n}.`, `再乘以 ${n}。`)],
      steps: [T(`${m} × [${n}/${d}] = ${m} ÷ ${d} × ${n}`, `${m} × [${n}/${d}] = ${m} ÷ ${d} × ${n}`), T(`= ${m / d} × ${n} = ${ans}`, `= ${m / d} × ${n} = ${ans}`)], tip: 'fracof',
    };
  }
  if (kind === 'cake') {
    const [a, b] = simplestFrac(rng, 2, 6); const c = rng.int(2, 4);
    return {
      id: `cake${a}/${b}/${c}`, input: 'fracpad', answer: fr(a, b * c), accept: 'equiv', data: { expr: `${a}/${b}/${c}` },
      prompt: T(`Chef Mochi has [${a}/${b}] of a cake left and cuts it into ${c} equal slices. What fraction of the WHOLE cake is each slice?`,
        `熊貓主廚麻糬還剩 [${a}/${b}] 個蛋糕，把它平分成 ${c} 片。每一片是整個蛋糕的幾分之幾？`),
      visual: { type: 'pie', n: a, d: b },
      hints: [T(`Cut each of the ${b} parts into ${c}. Now the whole cake has ${b * c} pieces.`, `把每一份再切成 ${c} 片，整個蛋糕就有 ${b * c} 片。`)],
      steps: [T(`[${a}/${b}] ÷ ${c} = [${a}/${b * c}]`, `[${a}/${b}] ÷ ${c} = [${a}/${b * c}]`)], tip: 'pizza',
    };
  }
  return G.div_multistep(rng, t);
};

// ================== registry ==================
const CONCEPTS = {
  div_share: { domain: 'div', level: 1, name: T('Equal sharing', '平分') },
  div_facts20: { domain: 'div', level: 1, name: T('Division facts to 20', '20 以內的除法') },
  div_group: { domain: 'div', level: 1, name: T('Making groups', '分組') },
  div_facts100: { domain: 'div', level: 2, name: T('Division facts to 100', '100 以內的除法') },
  div_remainder: { domain: 'div', level: 2, name: T('Remainders', '餘數') },
  div_word: { domain: 'div', level: 2, name: T('Division word problems', '除法應用題') },
  div_long: { domain: 'div', level: 3, name: T('Long division', '直式除法') },
  div_longrem: { domain: 'div', level: 3, name: T('Long division with remainders', '有餘數的直式除法') },
  div_multistep: { domain: 'div', level: 3, name: T('Multi-step problems', '多步驟應用題') },
  div_sharerem: { domain: 'div', level: 2, name: T('Sharing with leftovers', '平分與剩餘') },
  frac_identify: { domain: 'frac', level: 1, name: T('Naming fractions', '認識分數') },
  frac_shade: { domain: 'frac', level: 1, name: T('Building fractions', '畫出分數') },
  frac_parts: { domain: 'frac', level: 1, name: T('Numerator & denominator', '分子與分母') },
  frac_equiv: { domain: 'frac', level: 2, name: T('Equivalent fractions', '等值分數') },
  frac_compare: { domain: 'frac', level: 2, name: T('Comparing fractions', '比較分數') },
  frac_addsame: { domain: 'frac', level: 2, name: T('Adding (same denominator)', '同分母加法') },
  frac_subsame: { domain: 'frac', level: 2, name: T('Subtracting (same denominator)', '同分母減法') },
  frac_line: { domain: 'frac', level: 2, name: T('Number lines', '數線上的分數') },
  frac_equivshade: { domain: 'frac', level: 2, name: T('Coloring equal fractions', '塗出等值分數') },
  frac_simplify: { domain: 'frac', level: 3, name: T('Simplifying fractions', '約分') },
  frac_mixed: { domain: 'frac', level: 3, name: T('Mixed numbers', '帶分數與假分數') },
  frac_adddiff: { domain: 'frac', level: 3, name: T('Adding (different denominators)', '異分母加法') },
  frac_subdiff: { domain: 'frac', level: 3, name: T('Subtracting (different denominators)', '異分母減法') },
  frac_order: { domain: 'frac', level: 3, name: T('Ordering fractions', '分數排序') },
  mix_fracof: { domain: 'mix', level: [1, 2, 3], name: T('Fraction of a number', '求一個數的幾分之幾') },
  mix_sharefrac: { domain: 'mix', level: [2, 3], name: T('Division as a fraction', '除法與分數') },
  mix_divmixed: { domain: 'mix', level: [3], name: T('Division to mixed numbers', '除法化成帶分數') },
  legend_multi: { domain: 'mix', level: [3], name: T('Legendary multi-step', '傳說多步驟挑戰') },
};

// Which concept counts toward which tracked skill (division and fractions are tracked separately).
function skillOf(concept) {
  if (concept.startsWith('div_')) return 'div';
  if (concept.startsWith('frac_')) return 'frac';
  if (concept === 'mix_divmixed' || concept === 'mix_sharefrac') return 'div';
  return 'frac';
}

function conceptLevels(concept) {
  const L = CONCEPTS[concept].level;
  return Array.isArray(L) ? L : [L];
}

function generate(concept, { seed, rng, tier = 0.5, level } = {}) {
  const r = rng || makeRng(seed ?? Math.floor(Math.random() * 2 ** 32));
  const gen = G[concept];
  if (!gen) throw new Error('unknown concept ' + concept);
  const lv = level ?? Math.max(...conceptLevels(concept));
  const q = gen(r, Math.max(0, Math.min(1, tier)), lv);
  q.concept = q.concept || concept;
  // generators that fall back to another concept keep their own concept name
  if (!q.id.includes(':')) q.id = `${concept}:${q.id}`;
  q.domain = CONCEPTS[concept].domain;
  q.level = lv;
  q.input = q.input || 'mc';
  return q;
}

// ---------- answer checking ----------
function checkAnswer(q, given) {
  if (given == null) return { ok: false };
  const a = q.answer;
  if (q.accept === 'exact' || a.t === 'r' || a.t === 's' || a.t === 'o' || a.t === 'n') {
    if (a.t === 'n' && given.t !== 'n') {
      // allow e.g. a fraction pad answer of 6/1 for a whole number
      const gv = valueOf(given);
      return { ok: !!gv && gv.d === 1 && gv.n === a.v && q.accept !== 'exact' };
    }
    return { ok: key(a) === key(given) };
  }
  const av = valueOf(a); const gv = valueOf(given);
  if (!av || !gv) return { ok: false };
  const same = rcmp(av, gv) === 0;
  if (!same) {
    const mis = (q.misconceptions || []).find((m) => m.ans.d && valueOf(m.ans) && given.t === 'f' && given.n === m.ans.n && given.d === m.ans.d);
    return { ok: false, misconception: mis ? mis.msg : null };
  }
  if (q.accept === 'equiv') return { ok: true, notSimplest: !isSimplest(given) };
  if (q.accept === 'simplest') {
    if (given.t === 'f' && isSimplest(given)) return { ok: true };
    if (given.t === 'm' && isSimplest(given) && given.w > 0 && a.n < a.d) return { ok: false, almost: 'simplify' };
    return { ok: false, almost: 'simplify' };
  }
  if (q.accept === 'mixed') {
    if (given.t === 'm' && given.n < given.d && given.w > 0) return { ok: true, notSimplest: !isSimplest(given) };
    return { ok: false, almost: 'mixed' };
  }
  if (q.accept === 'improper') {
    if (given.t === 'f' && given.n >= given.d) return { ok: true };
    return { ok: false, almost: 'improper' };
  }
  return { ok: same };
}

// Independent verification of a question (used by the test suite and the server).
function solve(q) {
  const d = q.data || {};
  if (d.expr) return evalExpr(d.expr);
  return null;
}

function validateQuestion(q) {
  const errors = [];
  const d = q.data || {};
  const a = q.answer;
  if (!a) errors.push('no answer');
  if (!q.prompt || !q.prompt.en || !q.prompt.zh) errors.push('missing prompt translation');
  for (const h of q.hints || []) if (!h.en || !h.zh) errors.push('missing hint translation');
  for (const s of q.steps || []) if (!s.en || !s.zh) errors.push('missing step translation');
  if (/[^\x00-\x7F]/.test(q.prompt.en.replace(/[÷×−◯✓→<>=≥≤]/g, ''))) errors.push('non-ascii in English prompt');
  if (d.expr) {
    const v = evalExpr(d.expr);
    if (a.t === 'n') { if (v.d !== 1 || v.n !== a.v) errors.push(`answer ${a.v} != ${v.n}/${v.d}`); if (a.v < 0) errors.push('negative'); }
    else { const av = valueOf(a); if (!av || rcmp(av, v) !== 0) errors.push(`answer value mismatch ${key(a)} vs ${v.n}/${v.d}`); }
  } else if (d.op === 'divr') {
    if (!(a.q * d.b + a.r === d.a && a.r >= 0 && a.r < d.b)) errors.push('bad remainder answer');
  } else if (d.op === 'ceil') {
    if (a.v !== Math.ceil(d.a / d.b)) errors.push('bad ceil');
  } else if (d.op === 'mod') {
    if (a.v !== d.a % d.b) errors.push('bad mod');
  } else if (d.op === 'cmp') {
    const c = rcmp(evalExpr(d.x), evalExpr(d.y));
    if (a.v !== (c < 0 ? '<' : c > 0 ? '>' : '=')) errors.push('bad compare');
  } else if (d.op === 'order') {
    const vals = d.items.map(evalExpr);
    for (let i = 1; i < a.v.length; i++) if (rcmp(vals[a.v[i - 1]], vals[a.v[i]]) >= 0) errors.push('bad order');
    if (new Set(a.v).size !== d.items.length) errors.push('order not permutation');
  } else if (d.op !== 'pick') errors.push('no verification data');
  if (q.accept === 'simplest' && !isSimplest(a)) errors.push('answer not simplest');
  if (!checkAnswer(q, a).ok) errors.push('answer does not pass its own check');
  if (q.input === 'mc') {
    if (!q.choices || q.choices.length < 2) errors.push('too few choices');
    else {
      const keys = q.choices.map(key);
      if (new Set(keys).size !== keys.length) errors.push('duplicate choices');
      const correct = q.choices.filter((c) => checkAnswer(q, c).ok).length;
      if (correct !== 1) errors.push(`${correct} correct choices`);
      for (const c of q.choices) {
        if (c.t === 'n' && c.v < 0) errors.push('negative choice');
        if (c.t === 'f' && (c.d <= 0 || c.n < 0)) errors.push('bad fraction choice');
      }
    }
  }
  if (q.input === 'share' && !(a.t === 'n' ? q.total === q.groups * a.v : (q.total === q.groups * a.q + a.r && a.r < q.groups))) errors.push('share mismatch');
  if (q.input === 'shade' && !(a.v > 0 && a.v < q.d)) errors.push('shade out of range');
  if (q.input === 'line' && !(a.v > 0 && a.v < q.d * q.max)) errors.push('line out of range');
  return errors;
}

// Turn a keypad question into multiple choice (used by treasure hunts) with
// plausible, never-equal distractors.
function asMultipleChoice(q, rng) {
  const a = q.answer; const out = { ...q };
  let ds = [];
  if (a.t === 'n') ds = numDistractors(a.v, [a.v + 3, a.v + 5]);
  else if (a.t === 'r') ds = [qr(a.q, a.r + 1), qr(a.q + 1, a.r), qr(a.q - 1, a.r), qr(a.q, Math.max(0, a.r - 1)), qr(a.q + 1, 0), qr(a.r, a.q)];
  else if (a.t === 'f') ds = [fr(a.n + 1, a.d), fr(Math.max(1, a.n - 1), a.d), fr(a.n, a.d + 1), fr(a.d, a.n), fr(a.n + 1, a.d + 1)];
  else if (a.t === 'm') ds = [mx(a.w + 1, a.n, a.d), mx(Math.max(1, a.w - 1), a.n, a.d), mx(a.w, Math.max(1, a.n - 1), a.d), mx(a.w, a.n + 1 < a.d ? a.n + 1 : 1, a.d)];
  else return q;
  if (q.accept !== 'exact') out.accept = q.accept;
  delete out.allowWhole; delete out.requireWhole;
  finishMC(out, rng, ds);
  return out.choices.length >= 3 ? out : q;
}

// Strip the answer + solution before sending a question to a multiplayer client.
function publicQuestion(q) {
  const { answer, data, steps, misconceptions, ...rest } = q;
  return rest;
}

// ===== room-logic.js =====
// Server-authoritative cooperative room logic. Runs ONLY on the server
// (local dev server or Supabase Edge Function). Clients never see answers
// before they submit, and every reward is computed here.


const CODE_ALPHABET = '0123456789'; // 4-digit number: easy for kids to type
const CODE_LENGTH = 4;
const MODES = ['boss', 'treasure', 'relay', 'build'];
const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;
const OFFLINE_AFTER_MS = 15000;
const ROOM_TTL_MS = 6 * 3600 * 1000;

function newCode(rnd = Math.random) {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
  return s;
}
const validCode = (c) => typeof c === 'string' && c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch));

function randHex(bytes = 16) {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- input sanitizing (never trust the client) ----------
const HAIRS = ['spiky', 'ponytail', 'short', 'curly', 'bun', 'long'];
const isColor = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
function cleanProfile(p = {}) {
  const a = p.avatar || {};
  const lv = (x) => (x === 1 || x === 2 || x === 3 ? x : 1);
  return {
    name: String(p.name || 'Hero').replace(/[<>&"']/g, '').slice(0, 20) || 'Hero',
    avatar: {
      hair: HAIRS.includes(a.hair) ? a.hair : 'short',
      hairColor: isColor(a.hairColor) ? a.hairColor : '#1b1b1f',
      skin: isColor(a.skin) ? a.skin : '#f6c9a0',
      outfit: isColor(a.outfit) ? a.outfit : '#1c7ed6',
      badge: isColor(a.badge) ? a.badge : '#7048e8',
      hat: typeof a.hat === 'string' ? a.hat.slice(0, 12) : null,
      cape: typeof a.cape === 'string' ? a.cape.slice(0, 12) : null,
      held: typeof a.held === 'string' ? a.held.slice(0, 12) : null,
      number: Number.isInteger(a.number) && a.number >= 0 && a.number <= 99 ? a.number : '',
    },
    pet: typeof p.pet === 'string' ? p.pet.slice(0, 16) : 'divi',
    petStage: [0, 1, 2].includes(p.petStage) ? p.petStage : 0,
    levels: { div: lv(p.levels && p.levels.div), frac: lv(p.levels && p.levels.frac) },
  };
}

function cleanValue(v) {
  if (!v || typeof v !== 'object') return null;
  const int = (x) => (Number.isInteger(x) && Math.abs(x) < 1e7 ? x : null);
  switch (v.t) {
    case 'n': return int(v.v) == null ? null : { t: 'n', v: v.v };
    case 'f': return int(v.n) == null || int(v.d) == null ? null : { t: 'f', n: v.n, d: v.d };
    case 'm': return [v.w, v.n, v.d].some((x) => int(x) == null) ? null : { t: 'm', w: v.w, n: v.n, d: v.d };
    case 'r': return int(v.q) == null || int(v.r) == null ? null : { t: 'r', q: v.q, r: v.r };
    case 's': return typeof v.v === 'string' ? { t: 's', v: v.v.slice(0, 12) } : null;
    case 'o': return Array.isArray(v.v) && v.v.length <= 6 && v.v.every((x) => int(x) != null) ? { t: 'o', v: v.v.slice() } : null;
    default: return null;
  }
}

// ---------- questions ----------
function pickConcept(rng, levels, preferMix) {
  const pool = [];
  for (const c of Object.keys(CONCEPTS)) {
    const dom = CONCEPTS[c].domain; const lv = conceptLevels(c);
    if (dom === 'div' && lv.includes(levels.div)) pool.push({ c, level: levels.div });
    if (dom === 'frac' && lv.includes(levels.frac)) pool.push({ c, level: levels.frac });
    const m = Math.min(levels.div, levels.frac);
    if (preferMix && dom === 'mix' && lv.includes(m)) pool.push({ c, level: m }, { c, level: m });
  }
  return rng.pick(pool.length ? pool : [{ c: 'div_facts20', level: 1 }]);
}

function issueQuestion(state, secrets, pid, { easier = false } = {}) {
  const pl = state.players[pid];
  secrets.qn = (secrets.qn || 0) + 1;
  const rng = makeRng(`${secrets.seed}-${pid}-${secrets.qn}`);
  const pick = pickConcept(rng, pl.levels, true);
  const tier = easier ? 0.1 : 0.3 + rng.next() * 0.6;
  let q = generate(pick.c, { rng, tier, level: pick.level });
  // keep team play brisk: prefer tap/keypad questions over long drag puzzles
  for (let i = 0; i < 6 && ['share', 'order'].includes(q.input); i++) q = generate(pick.c, { rng, tier, level: pick.level });
  const qid = `${secrets.qn}`;
  secrets.answers[pid] = { qid, q, tries: 0 };
  pl.q = { ...publicQuestion(q), qid };
  pl.pendingPick = false;
}

// ---------- room lifecycle ----------
async function createRoom(profile, now, rnd = Math.random) {
  const pid = randHex(8); const token = randHex(16);
  const code = newCode(rnd);
  const p = cleanProfile(profile);
  const state = {
    code, status: 'lobby', mode: 'boss', hostId: pid, created: now, updated: now, round: 0,
    players: { [pid]: { ...p, joinedAt: now, lastSeen: now, connected: true, correct: 0, attempts: 0, damage: 0, picks: 0, q: null, pendingPick: false, last: null } },
    order: [pid], game: null, rewards: null, log: [],
  };
  const secrets = { tokens: { [pid]: await sha256(token) }, answers: {}, seed: randHex(8), qn: 0 };
  return { state, secrets, playerId: pid, token };
}

async function authed(secrets, pid, token) {
  if (!pid || !token || !secrets.tokens[pid]) return false;
  return secrets.tokens[pid] === await sha256(String(token));
}

function sweep(state, now) {
  for (const pid of state.order) {
    const pl = state.players[pid];
    pl.connected = now - pl.lastSeen < OFFLINE_AFTER_MS;
  }
  // host migrates if the host has been gone a long time in the lobby
  const host = state.players[state.hostId];
  if (host && !host.connected) {
    const next = state.order.find((id) => state.players[id].connected);
    if (next) state.hostId = next;
  }
}

function log(state, entry) { state.log.push(entry); if (state.log.length > 30) state.log.shift(); }

function startGame(state, secrets) {
  const n = state.order.length;
  const rng = makeRng(`${secrets.seed}-start`);
  state.status = 'playing'; state.round = 1;
  for (const pid of state.order) Object.assign(state.players[pid], { correct: 0, attempts: 0, damage: 0, picks: 0, last: null });
  if (state.mode === 'boss') {
    const names = [['Count Crumble', '碎碎伯爵'], ['The Pizza Hydra', '披薩九頭蛇'], ['Muddle the Mixed-up Golem', '糊塗石像巨人'], ['Chaos Infinity Dragon', '混沌無限龍']];
    const i = rng.int(0, 3);
    state.game = { hp: 6 * n, maxHp: 6 * n, boss: names[i], world: ['village', 'forest', 'kingdom', 'legend'][i] };
  } else if (state.mode === 'treasure') {
    const tiles = 16; const need = 4;
    secrets.treasure = rng.shuffle([...Array(tiles).keys()]).slice(0, need);
    state.game = { tiles: Array(tiles).fill(null), need, found: 0 };
  } else if (state.mode === 'relay') {
    state.game = { leg: 0, legs: 3 * n, turn: state.order[0] };
  } else {
    state.game = { blocks: Array(16).fill(null), need: Math.min(16, 5 * n), placed: 0 };
  }
  for (const pid of state.order) {
    if (state.mode === 'relay' && pid !== state.game.turn) { state.players[pid].q = null; continue; }
    issueQuestion(state, secrets, pid);
  }
}

function nextRelayTurn(state) {
  const ids = state.order;
  const cur = ids.indexOf(state.game.turn);
  for (let k = 1; k <= ids.length; k++) {
    const id = ids[(cur + k) % ids.length];
    if (state.players[id].connected) return id;
  }
  return state.game.turn;
}

function finishGame(state) {
  state.status = 'ended'; state.endedAt = state.updated;
  const ids = state.order;
  const everyone = ids.every((id) => state.players[id].correct >= 2);
  const rewards = {};
  for (const id of ids) {
    const pl = state.players[id];
    let xp = 25 + pl.correct * 8; let coins = 20 + pl.correct * 5; let gems = 1;
    if (everyone && ids.length >= 2) { coins = Math.round(coins * 1.5); gems += 1; }
    rewards[id] = { xp, coins, gems, teamBonus: everyone && ids.length >= 2, correct: pl.correct };
  }
  state.rewards = rewards;
  for (const id of ids) { state.players[id].q = null; state.players[id].pendingPick = false; }
}

function checkWin(state) {
  const g = state.game;
  if (state.mode === 'boss') return g.hp <= 0;
  if (state.mode === 'treasure') return g.found >= g.need;
  if (state.mode === 'relay') return g.leg >= g.legs;
  return g.placed >= g.need;
}

// ---------- the single entry point ----------
// db: { get(code) → {state, secrets, version}|null, insert(code, state, secrets) → bool, update(code, state, secrets, version) → bool }
async function handle(db, body, now = Date.now()) {
  const action = body && body.action;
  if (action === 'create') {
    for (let i = 0; i < 20; i++) { // retry on the rare clash with an open room
      const r = await createRoom(body.profile, now);
      if (await db.insert(r.state.code, r.state, r.secrets)) return { ok: true, state: r.state, playerId: r.playerId, token: r.token };
    }
    return { ok: false, error: 'busy' };
  }
  const code = String(body.code || '').toUpperCase();
  if (!validCode(code)) return { ok: false, error: 'notFound' };
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = await db.get(code);
    if (!row || now - row.state.updated > ROOM_TTL_MS) return { ok: false, error: 'notFound' };
    const state = structuredClone(row.state); const secrets = structuredClone(row.secrets);
    const res = await apply(state, secrets, body, now);
    if (res.readOnly) return res.out;
    state.updated = now;
    if (await db.update(code, state, secrets, row.version)) return { ...res.out, state };
    // version conflict: someone else wrote first → retry on fresh data
  }
  return { ok: false, error: 'busy' };
}

async function apply(state, secrets, body, now) {
  const { action, playerId: pid, token } = body;
  sweep(state, now);
  if (action === 'get') return { readOnly: true, out: { ok: true, state } };

  if (action === 'join') {
    if (state.order.length >= MAX_PLAYERS) return { readOnly: true, out: { ok: false, error: 'full' } };
    if (state.status !== 'lobby') return { readOnly: true, out: { ok: false, error: 'started' } };
    const id = randHex(8); const tk = randHex(16);
    state.players[id] = { ...cleanProfile(body.profile), joinedAt: now, lastSeen: now, connected: true, correct: 0, attempts: 0, damage: 0, picks: 0, q: null, pendingPick: false, last: null };
    state.order.push(id);
    secrets.tokens[id] = await sha256(tk);
    log(state, { t: now, type: 'join', who: id });
    return { out: { ok: true, playerId: id, token: tk } };
  }

  if (!(await authed(secrets, pid, token))) return { readOnly: true, out: { ok: false, error: 'auth' } };
  const me = state.players[pid];
  me.lastSeen = now; me.connected = true;
  // relay: if the runner holding the baton went offline, pass it on so the team is never stuck
  if (state.status === 'playing' && state.mode === 'relay' && !state.players[state.game.turn].connected) {
    const old = state.game.turn; const nt = nextRelayTurn(state);
    if (nt !== old) { state.players[old].q = null; delete secrets.answers[old]; state.game.turn = nt; issueQuestion(state, secrets, nt); }
  }

  switch (action) {
    case 'ping':
    case 'rejoin':
      if (state.status === 'playing' && !me.q && !me.pendingPick && (state.mode !== 'relay' || state.game.turn === pid)) issueQuestion(state, secrets, pid);
      return { out: { ok: true } };
    case 'away': // tab closed / app backgrounded: show as reconnecting right away, keep their spot
      me.lastSeen = 0; me.connected = false;
      if (state.status === 'playing' && state.mode === 'relay' && state.game.turn === pid) {
        const nt = nextRelayTurn(state);
        if (nt !== pid) { me.q = null; delete secrets.answers[pid]; state.game.turn = nt; issueQuestion(state, secrets, nt); }
      }
      return { out: { ok: true } };
    case 'leave':
      me.lastSeen = 0; me.connected = false;
      if (state.status === 'lobby') {
        state.order = state.order.filter((x) => x !== pid); delete state.players[pid]; delete secrets.tokens[pid];
        if (state.hostId === pid && state.order.length) state.hostId = state.order[0];
      } else if (state.mode === 'relay' && state.game && state.game.turn === pid) {
        state.game.turn = nextRelayTurn(state); if (state.game.turn !== pid) issueQuestion(state, secrets, state.game.turn);
      }
      return { out: { ok: true } };
    case 'setMode':
      if (pid !== state.hostId || state.status !== 'lobby' || !MODES.includes(body.mode)) return { readOnly: true, out: { ok: false, error: 'denied' } };
      state.mode = body.mode; return { out: { ok: true } };
    case 'start': {
      if (pid !== state.hostId || (state.status !== 'lobby' && state.status !== 'ended')) return { readOnly: true, out: { ok: false, error: 'denied' } };
      const online = state.order.filter((id) => state.players[id].connected);
      if (online.length < MIN_PLAYERS) return { readOnly: true, out: { ok: false, error: 'needPlayers' } };
      if (state.status === 'ended' && body.mode && MODES.includes(body.mode)) state.mode = body.mode;
      state.rewards = null;
      startGame(state, secrets);
      return { out: { ok: true } };
    }
    case 'answer': {
      if (state.status !== 'playing') return { readOnly: true, out: { ok: false, error: 'notPlaying' } };
      const slot = secrets.answers[pid];
      if (!slot || !me.q || String(body.qid) !== slot.qid) return { readOnly: true, out: { ok: false, error: 'stale' } };
      if (state.mode === 'relay' && state.game.turn !== pid) return { readOnly: true, out: { ok: false, error: 'notYourTurn' } };
      const value = cleanValue(body.value);
      const res = value ? checkAnswer(slot.q, value) : { ok: false };
      if (res.almost) return { out: { ok: true, correct: false, almost: res.almost } };
      me.attempts++;
      if (res.ok) {
        const firstTry = slot.tries === 0;
        me.correct++;
        me.last = { ok: true, firstTry, t: now };
        if (state.mode === 'boss') { const dmg = firstTry ? 2 : 1; state.game.hp = Math.max(0, state.game.hp - dmg); me.damage += dmg; log(state, { t: now, type: 'hit', who: pid, dmg }); }
        if (state.mode === 'relay') { state.game.leg++; log(state, { t: now, type: 'leg', who: pid }); }
        if (state.mode === 'treasure' || state.mode === 'build') { me.pendingPick = true; me.q = null; delete secrets.answers[pid]; }
        if (checkWin(state)) { finishGame(state); return { out: { ok: true, correct: true, firstTry } }; }
        if (state.mode === 'relay') { me.q = null; delete secrets.answers[pid]; state.game.turn = nextRelayTurn(state); issueQuestion(state, secrets, state.game.turn); }
        else if (state.mode === 'boss') issueQuestion(state, secrets, pid);
        return { out: { ok: true, correct: true, firstTry } };
      }
      slot.tries++;
      if (slot.tries < 2) { me.last = { ok: false, retry: true, t: now }; return { out: { ok: true, correct: false, retry: true, misconception: res.misconception || null } }; }
      // second miss: reveal, then an easier question (relay passes the baton, no penalty)
      const reveal = slot.q.answer; const steps = slot.q.steps;
      me.last = { ok: false, t: now };
      if (state.mode === 'relay') { me.q = null; delete secrets.answers[pid]; state.game.leg++; if (checkWin(state)) { finishGame(state); return { out: { ok: true, correct: false, reveal, steps } }; } state.game.turn = nextRelayTurn(state); issueQuestion(state, secrets, state.game.turn, { easier: state.game.turn === pid }); }
      else issueQuestion(state, secrets, pid, { easier: true });
      return { out: { ok: true, correct: false, reveal, steps } };
    }
    case 'pick': {
      if (state.status !== 'playing' || !me.pendingPick) return { readOnly: true, out: { ok: false, error: 'denied' } };
      const i = Number(body.index);
      if (state.mode === 'treasure') {
        const g = state.game;
        if (!Number.isInteger(i) || i < 0 || i >= g.tiles.length || g.tiles[i]) return { readOnly: true, out: { ok: false, error: 'bad' } };
        const hit = secrets.treasure.includes(i);
        g.tiles[i] = { by: pid, treasure: hit }; if (hit) g.found++;
        me.picks++; me.pendingPick = false;
        log(state, { t: now, type: hit ? 'found' : 'dig', who: pid });
        if (checkWin(state)) { finishGame(state); return { out: { ok: true, found: hit } }; }
        issueQuestion(state, secrets, pid);
        return { out: { ok: true, found: hit } };
      }
      if (state.mode === 'build') {
        const g = state.game;
        if (!Number.isInteger(i) || i < 0 || i >= g.blocks.length || g.blocks[i]) return { readOnly: true, out: { ok: false, error: 'bad' } };
        g.blocks[i] = { by: pid }; g.placed++; me.picks++; me.pendingPick = false;
        if (checkWin(state)) { finishGame(state); return { out: { ok: true } }; }
        issueQuestion(state, secrets, pid);
        return { out: { ok: true } };
      }
      return { readOnly: true, out: { ok: false, error: 'denied' } };
    }
    case 'backToLobby':
      if (pid !== state.hostId || state.status !== 'ended') return { readOnly: true, out: { ok: false, error: 'denied' } };
      state.status = 'lobby'; state.game = null; state.rewards = null;
      for (const id of state.order) Object.assign(state.players[id], { q: null, pendingPick: false });
      return { out: { ok: true } };
    default:
      return { readOnly: true, out: { ok: false, error: 'unknownAction' } };
  }
}

// In-memory store with optimistic versioning (used by the dev server and tests).
function memoryDb() {
  const rooms = new Map();
  return {
    rooms,
    async get(code) { const r = rooms.get(code); return r ? structuredClone(r) : null; },
    async insert(code, state, secrets) { if (rooms.has(code)) return false; rooms.set(code, { state: structuredClone(state), secrets: structuredClone(secrets), version: 1 }); return true; },
    async update(code, state, secrets, version) {
      const r = rooms.get(code); if (!r || r.version !== version) return false;
      rooms.set(code, { state: structuredClone(state), secrets: structuredClone(secrets), version: version + 1 }); return true;
    },
  };
}

// ---- server ----

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// Projects created with the newer API keys may expose the secret key under a different name.
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const db = {
  async get(code: string) {
    const { data, error } = await sb.from('rooms').select('state, version, room_secrets(secrets)').eq('code', code).maybeSingle();
    if (error || !data) return null;
    const sec = Array.isArray(data.room_secrets) ? data.room_secrets[0] : data.room_secrets;
    if (!sec) return null;
    return { state: data.state, version: data.version, secrets: sec.secrets };
  },
  async insert(code: string, state: unknown, secrets: unknown) {
    const { data, error } = await sb.rpc('room_insert', { p_code: code, p_state: state, p_secrets: secrets });
    return !error && data === true;
  },
  async update(code: string, state: unknown, secrets: unknown, version: number) {
    const { data, error } = await sb.rpc('room_save', { p_code: code, p_state: state, p_secrets: secrets, p_version: version });
    return !error && data === true;
  },
};

// Public state goes out over Realtime Broadcast on channel "room-CODE".
async function broadcast(state: { code: string }) {
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ messages: [{ topic: `room-${state.code}`, event: 'state', payload: { state } }] }),
    });
  } catch (_e) { /* clients also poll, so a missed broadcast is recovered */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false }, 405);
  const text = await req.text();
  if (text.length > 20000) return json({ ok: false }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ ok: false }, 400); }
  const out = await handle(db, body);
  if (out.state) await broadcast(out.state);
  return json(out);
});
