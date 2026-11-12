// Little Explorer (age 3–4): counting, adding with pictures, fair sharing,
// halves and "which has more". Everything is spoken aloud; answers are
// pictures or big numbers, so no reading is needed.
const T = (en, zh) => ({ en, zh });

export const LITTLE_KINDS = ['count', 'add', 'share', 'half', 'more'];

export const LITTLE_NAMES = {
  count: T('Count the dinos', '數恐龍'),
  add: T('Dino adding', '恐龍加法'),
  share: T('Share fairly', '公平分一分'),
  half: T('Find the halves', '找一半'),
  more: T('Which has more?', '哪個比較多？'),
};

function distinctChoices(rng, answer, lo, hi, n = 3) {
  const s = new Set([answer]);
  let guard = 0;
  while (s.size < n && guard++ < 100) {
    const d = answer + rng.pick([-2, -1, 1, 2]);
    if (d >= lo && d <= hi) s.add(d);
  }
  for (let v = lo; s.size < n && v <= hi; v++) s.add(v);
  return rng.shuffle([...s]);
}

// lvl 1 (start) or 2 (after showing they know it)
export function littleQuestion(kind, rng, lvl = 1) {
  switch (kind) {
    case 'count': {
      const n = rng.int(1, lvl >= 2 ? 8 : 5);
      return {
        kind, id: `count${n}`, n, answer: n, choices: distinctChoices(rng, n, 1, 10),
        prompt: T('How many dinosaurs? Tap the number!', '有幾隻恐龍？點一點數字！'),
        hint: T("Let's count together! Touch each dinosaur.", '我們一起數！一隻一隻點點看。'),
      };
    }
    case 'add': {
      const max = lvl >= 2 ? 5 : 4;
      const a = rng.int(1, max - 1); const b = rng.int(1, max - a);
      return {
        kind, id: `add${a}+${b}`, a, b, answer: a + b, choices: distinctChoices(rng, a + b, 1, 6),
        prompt: T(`${a} dinosaur${a > 1 ? 's' : ''}, and ${b} more come. How many now?`, `${a}隻恐龍，又來了${b}隻。現在有幾隻？`),
        hint: T('Count them all together!', '全部一起數一數！'),
      };
    }
    case 'share': {
      const g = lvl >= 2 ? rng.pick([2, 3]) : 2; const q = rng.int(1, lvl >= 2 ? 3 : 2);
      return {
        kind, id: `share${g * q}/${g}`, groups: g, total: g * q, answer: q,
        prompt: T(`Give the cookies to the ${g} baby dinosaurs. Everyone gets the same!`, `把餅乾分給${g}隻恐龍寶寶，每隻都一樣多！`),
        hint: T('One for you, one for you… take turns!', '你一個、你一個……輪流分！'),
      };
    }
    case 'half': {
      const shape = rng.pick(['bar', 'pie', 'sandwich']);
      const correct = rng.int(0, 1);
      const off = rng.pick([0.25, 0.3, 0.7, 0.75]);
      return {
        kind, id: `half${shape}${correct}${off}`, shape, correct, off, answer: correct,
        prompt: T('Which one is cut into two halves the same size? Tap it!', '哪一個切成一樣大的兩半？點一下！'),
        hint: T('Halves are fair: both pieces are the same size.', '一半要公平：兩塊一樣大。'),
      };
    }
    case 'more':
    default: {
      let a; let b;
      do { a = rng.int(1, lvl >= 2 ? 7 : 5); b = rng.int(1, lvl >= 2 ? 7 : 5); } while (a === b || (lvl < 2 && Math.abs(a - b) < 2));
      return {
        kind: 'more', id: `more${a}v${b}`, counts: [a, b], answer: a > b ? 0 : 1,
        prompt: T('Which nest has MORE eggs? Tap it!', '哪個巢的蛋比較多？點一下！'),
        hint: T('Count the eggs in each nest.', '數一數每個巢有幾顆蛋。'),
      };
    }
  }
}

export function validateLittle(q) {
  const e = [];
  if (!q.prompt.en || !q.prompt.zh || !q.hint.en || !q.hint.zh) e.push('missing translation');
  if (q.kind === 'count' && (q.answer !== q.n || !q.choices.includes(q.n))) e.push('count');
  if (q.kind === 'add' && (q.answer !== q.a + q.b || !q.choices.includes(q.answer))) e.push('add');
  if (q.choices && (new Set(q.choices).size !== q.choices.length || q.choices.some((c) => c < 0))) e.push('choices');
  if (q.kind === 'share' && q.total !== q.groups * q.answer) e.push('share');
  if (q.kind === 'more' && (q.counts[q.answer] <= q.counts[1 - q.answer])) e.push('more');
  if (q.kind === 'half' && (q.answer !== q.correct || q.off === 0.5)) e.push('half');
  return e;
}
