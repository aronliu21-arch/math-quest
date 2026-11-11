// Validates every question generator: thousands of random questions per
// concept and tier, each checked against an independent rational evaluator.
// Run: node tests/mathgen.test.mjs
import { CONCEPTS, generate, validateQuestion, conceptLevels, checkAnswer, asMultipleChoice } from '../shared/mathgen.js';
import { makeRng } from '../shared/rng.js';
import { fr, mx, num } from '../shared/fraction.js';

let failures = 0; let total = 0;
const variety = {};
for (const concept of Object.keys(CONCEPTS)) {
  const ids = new Set();
  for (const level of conceptLevels(concept)) {
    for (let i = 0; i < 1500; i++) {
      const tier = (i % 11) / 10;
      const q = generate(concept, { rng: makeRng(`${concept}-${level}-${i}`), tier, level });
      total++;
      const errs = validateQuestion(q);
      ids.add(q.id);
      if (['pad', 'rempad', 'fracpad'].includes(q.input)) {
        const mc = asMultipleChoice(q, makeRng(`mc-${i}`));
        total++;
        const e2 = mc.input === 'mc' ? validateQuestion(mc) : [];
        if (e2.length) { failures++; if (failures < 25) console.log('FAIL asMC', concept, q.id, e2, JSON.stringify(mc.choices)); }
      }
      if (errs.length) {
        failures++;
        if (failures < 25) console.log('FAIL', concept, q.id, errs, JSON.stringify(q.answer), JSON.stringify(q.choices || ''));
      }
    }
  }
  variety[concept] = ids.size;
}

// Spot checks on answer acceptance rules
const assert = (cond, msg) => { total++; if (!cond) { failures++; console.log('FAIL', msg); } };
const add = generate('frac_addsame', { seed: 1 });
assert(checkAnswer(add, add.answer).ok, 'addsame accepts its answer');
const simp = { answer: fr(2, 3), accept: 'simplest' };
assert(checkAnswer(simp, fr(2, 3)).ok, 'simplest accepts 2/3');
assert(!checkAnswer(simp, fr(4, 6)).ok && checkAnswer(simp, fr(4, 6)).almost === 'simplify', 'simplest rejects 4/6 with a nudge');
const eq = { answer: fr(5, 4), accept: 'equiv' };
assert(checkAnswer(eq, mx(1, 1, 4)).ok, 'equiv accepts mixed form of 5/4');
assert(checkAnswer(eq, fr(10, 8)).ok && checkAnswer(eq, fr(10, 8)).notSimplest, 'equiv accepts 10/8 but flags not simplest');
const mixed = { answer: mx(2, 1, 3), accept: 'mixed' };
assert(!checkAnswer(mixed, fr(7, 3)).ok, 'mixed requires mixed form');
assert(checkAnswer({ answer: num(6), accept: 'exact' }, num(6)).ok, 'number exact');

const low = Object.entries(variety).filter(([, n]) => n < 25);
console.log('Distinct questions per concept:', variety);
if (low.length) { console.log('LOW VARIETY:', low); failures++; }
console.log(`${total - failures}/${total} checks passed`);
process.exit(failures ? 1 : 0);
