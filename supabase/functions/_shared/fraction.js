// Exact rational arithmetic + answer values used by the question engine.
// Value types:
//   {t:'n', v}            whole number
//   {t:'f', n, d}         fraction
//   {t:'m', w, n, d}      mixed number
//   {t:'r', q, r}         quotient with remainder
//   {t:'s', v, label?}    symbol / labelled choice ('<', '>', '=', or a text key)
//   {t:'o', v:[...]}      an ordering (indices)

export const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; };
export const lcm = (a, b) => (a / gcd(a, b)) * b;

export const num = (v) => ({ t: 'n', v });
export const fr = (n, d) => ({ t: 'f', n, d });
export const mx = (w, n, d) => ({ t: 'm', w, n, d });
export const qr = (q, r) => ({ t: 'r', q, r });
export const sym = (v, label) => (label ? { t: 's', v, label } : { t: 's', v });
export const ord = (v) => ({ t: 'o', v });

// Rational {n, d} with d > 0, reduced.
export function rat(n, d = 1) {
  if (d === 0) throw new Error('division by zero');
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}
export const radd = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const rsub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const rmul = (a, b) => rat(a.n * b.n, a.d * b.d);
export const rdiv = (a, b) => rat(a.n * b.d, a.d * b.n);
export const rcmp = (a, b) => Math.sign(a.n * b.d - b.n * a.d);

// Value of an answer object as a rational (null when not numeric).
export function valueOf(v) {
  if (!v) return null;
  switch (v.t) {
    case 'n': return rat(v.v, 1);
    case 'f': return v.d ? rat(v.n, v.d) : null;
    case 'm': return v.d ? rat(v.w * v.d + v.n, v.d) : null;
    default: return null;
  }
}

export function key(v) {
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
export function fmt(v, lang = 'en') {
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

export function isSimplest(v) {
  if (v.t === 'f') return gcd(v.n, v.d) === 1 && v.d > 0;
  if (v.t === 'm') return v.n < v.d && (v.n === 0 || gcd(v.n, v.d) === 1);
  return true;
}

// Safe rational expression evaluator used to independently verify answers.
// Supports integers, + - * / ÷ × and parentheses.
export function evalExpr(src) {
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
