// Little Explorer generator checks. Run: node tests/little.test.mjs
import { littleQuestion, validateLittle, LITTLE_KINDS } from '../shared/littlegen.js';
import { makeRng } from '../shared/rng.js';
let n = 0; let bad = 0;
for (const k of LITTLE_KINDS) for (const lvl of [1, 2]) for (let i = 0; i < 2000; i++) {
  const q = littleQuestion(k, makeRng(`${k}${lvl}${i}`), lvl); n++;
  const e = validateLittle(q); if (e.length) { bad++; if (bad < 10) console.log('FAIL', k, q.id, e); }
  if (lvl === 1 && ((q.kind === 'count' && q.n > 5) || (q.kind === 'add' && q.answer > 4) || (q.kind === 'share' && q.total > 4))) { bad++; console.log('TOO HARD', q.id); }
}
console.log(`${n - bad}/${n} little checks passed`);
process.exit(bad ? 1 : 0);
