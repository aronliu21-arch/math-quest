// Adaptive learning: tracks division and fractions separately, per concept,
// and decides what to ask next.
import { CONCEPTS, generate, skillOf, conceptLevels } from '../shared/mathgen.js';

export const LEVEL_NAMES = { 1: 'beginner', 2: 'intermediate', 3: 'advanced' };
const EXPECTED_MS = { mc: 9000, pad: 14000, rempad: 18000, fracpad: 18000, share: 30000, shade: 15000, line: 12000, order: 16000 };

export function newLearning(startDiv = 1, startFrac = 1) {
  return {
    skill: {
      div: { r: (startDiv - 1) * 100 + 10, sessionsAtLevel: [] },
      frac: { r: (startFrac - 1) * 100 + 10, sessionsAtLevel: [] },
    },
    concepts: {},
    seen: {},
    days: {},
    totalMs: 0,
    log: [],
  };
}

export const levelOf = (skill) => Math.min(3, 1 + Math.floor(Math.max(0, skill.r) / 100));
export const tierOf = (skill) => (Math.max(0, skill.r) % 100) / 100;

function conceptStats(L, c) {
  if (!L.concepts[c]) L.concepts[c] = { a: 0, ok: 0, ft: 0, hints: 0, ms: 0, recent: [] };
  return L.concepts[c];
}

export function conceptMastery(L, c) {
  const s = L.concepts[c];
  if (!s || !s.a) return { attempts: 0, acc: 0, mastery: 0, status: 'new' };
  const rec = s.recent.slice(-10);
  const acc = rec.filter((x) => x.ft).length / rec.length;
  const mastery = acc * Math.min(1, s.a / 8);
  let status = 'learning';
  if (s.a >= 8 && acc >= 0.85) status = 'mastered';
  else if (s.a >= 5 && acc < 0.6) status = 'practice';
  return { attempts: s.a, acc, mastery, status, avgMs: s.ms / s.a };
}

export function skillMastery(L, skill) {
  const cs = Object.keys(CONCEPTS).filter((c) => skillOf(c) === skill && !c.startsWith('mix_') && !c.startsWith('legend'));
  const lv = levelOf(L.skill[skill]);
  const relevant = cs.filter((c) => conceptLevels(c)[0] <= lv);
  if (!relevant.length) return 0;
  return relevant.reduce((s, c) => s + conceptMastery(L, c).mastery, 0) / relevant.length;
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Record an answered question and move the skill rating.
// result: {ok, firstTry, tries, ms, hints, sessionId}
export function recordResult(L, q, result) {
  const s = conceptStats(L, q.concept);
  s.a++; if (result.ok) s.ok++; if (result.ok && result.firstTry) s.ft++;
  s.hints += result.hints || 0; s.ms += Math.min(result.ms, 120000);
  s.recent.push({ ft: !!(result.ok && result.firstTry), ok: !!result.ok, ms: Math.round(result.ms), lv: q.level, d: today() });
  if (s.recent.length > 20) s.recent.shift();
  L.seen[q.id] = (L.seen[q.id] || 0) + 1;
  const seenKeys = Object.keys(L.seen);
  if (seenKeys.length > 6000) for (const k of seenKeys.slice(0, 1000)) delete L.seen[k];

  const day = (L.days[today()] ||= { ms: 0, q: 0, ok: 0, ft: 0 });
  day.q++; if (result.ok) day.ok++; if (result.ok && result.firstTry) day.ft++;
  day.ms += Math.min(result.ms, 120000);
  L.log.push({ t: Date.now(), c: q.concept, ok: !!result.ok, ft: !!result.firstTry, ms: Math.round(result.ms), lv: q.level });
  if (L.log.length > 400) L.log.shift();

  // ---- rating ----
  const skillName = skillOf(q.concept);
  const sk = L.skill[skillName];
  const lv = levelOf(sk);
  const expected = (EXPECTED_MS[q.input] || 12000) * (q.level === 3 ? 1.6 : 1);
  let delta;
  if (result.ok && result.firstTry && !result.hints) delta = result.ms < expected ? 7 : 4;
  else if (result.ok && result.firstTry) delta = 2;
  else if (result.ok) delta = 0;
  else delta = -6;
  if (q.level < lv) delta = delta > 0 ? Math.ceil(delta / 3) : delta;
  if (q.level > lv && delta > 0) delta *= 2;

  const before = sk.r;
  let after = Math.max(0, Math.min(299, before + delta));
  const sid = result.sessionId;
  if (sid && !sk.sessionsAtLevel.includes(sid)) { sk.sessionsAtLevel.push(sid); if (sk.sessionsAtLevel.length > 10) sk.sessionsAtLevel.shift(); }

  const atLevel = L.log.filter((e) => skillOf(e.c) === skillName && e.lv === lv).slice(-10);
  const accAtLevel = atLevel.length ? atLevel.filter((e) => e.ft).length / atLevel.length : 0;
  let event = null;
  // Promotion gate: crossing into the next level needs mastery shown over 2+ sessions.
  const ceiling = lv * 100;
  if (after >= ceiling && lv < 3) {
    if (atLevel.length >= 10 && accAtLevel >= 0.8 && sk.sessionsAtLevel.length >= 2) { event = 'levelUp'; sk.sessionsAtLevel = sid ? [sid] : []; }
    else after = ceiling - 1;
  }
  // Demotion only after sustained difficulty, never after a single mistake.
  const floor = (lv - 1) * 100;
  if (after < floor) {
    const last8 = atLevel.slice(-8);
    if (last8.length >= 8 && last8.filter((e) => e.ft).length / 8 < 0.5) { event = 'levelDown'; after = floor - 30; sk.sessionsAtLevel = sid ? [sid] : []; }
    else after = floor;
  }
  sk.r = after;
  return { skill: skillName, before, after, event, newLevel: levelOf(sk) };
}

const WORLD_POOLS = {
  village: ['div'],
  forest: ['frac'],
  kingdom: ['mix', 'div', 'frac'],
  legend: ['legend'],
};

// Choose the next concept for a world.
export function pickConcept(L, world, rng, opts = {}) {
  const dLv = levelOf(L.skill.div); const fLv = levelOf(L.skill.frac);
  const lvFor = (skill) => (skill === 'div' ? dLv : fLv);
  const need = (c) => {
    const m = conceptMastery(L, c);
    const recentMiss = (L.concepts[c]?.recent || []).slice(-3).filter((x) => !x.ft).length;
    return 1 + (1 - m.mastery) * 2 + recentMiss * 0.7 + (m.attempts === 0 ? 0.8 : 0);
  };
  const pool = [];
  const addSkill = (skill, boost = 1) => {
    const lv = lvFor(skill);
    for (const c of Object.keys(CONCEPTS)) {
      if (CONCEPTS[c].domain !== skill) continue;
      const cl = conceptLevels(c)[0];
      // first-fractions learners: very few definition questions
      const defW = opts.gentle && c === 'frac_parts' ? 0.25 : 1;
      if (cl === lv) pool.push({ c, level: lv, tier: tierOf(L.skill[skill]), w: need(c) * boost * defW });
      else if (cl === lv - 1 || (cl < lv && rng.chance(0.3))) pool.push({ c, level: cl, tier: 0.8, w: 0.35 * boost });
    }
  };
  const kinds = opts.domainOverride ? [opts.domainOverride] : WORLD_POOLS[world] || ['div'];
  for (const k of kinds) {
    if (k === 'div' || k === 'frac') addSkill(k, world === 'kingdom' ? 0.5 : 1);
    if (k === 'mix') {
      const lv = Math.min(dLv, fLv);
      for (const c of ['mix_fracof', 'mix_sharefrac', 'mix_divmixed']) {
        const lvls = conceptLevels(c);
        const use = lvls.filter((l) => l <= Math.max(lv, 1));
        if (use.length) pool.push({ c, level: Math.max(...use), tier: (tierOf(L.skill.div) + tierOf(L.skill.frac)) / 2, w: need(c) * 1.4 });
      }
    }
    if (k === 'legend') {
      for (const c of Object.keys(CONCEPTS)) {
        if (conceptLevels(c).includes(3)) pool.push({ c, level: 3, tier: 0.6 + 0.4 * rng.next(), w: c === 'legend_multi' ? 3 : need(c) });
      }
    }
  }
  if (!pool.length) pool.push({ c: 'div_facts20', level: 1, tier: 0.3, w: 1 });
  return rng.weighted(pool, (p) => p.w);
}

// Make the next question, avoiding ones this player has already seen.
export function nextQuestion(L, world, rng, opts = {}) {
  let pick;
  if (opts.followUp) {
    // Easier follow-up after a mistake: same concept, gentler numbers.
    pick = { c: opts.followUp.concept, level: opts.followUp.level, tier: Math.max(0, opts.followUp.tier - 0.4) };
  } else pick = pickConcept(L, world, rng, opts);
  let q;
  for (let i = 0; i < 30; i++) {
    q = generate(pick.c, { rng, tier: pick.tier, level: pick.level, gentle: opts.gentle });
    q.tier = pick.tier;
    if (!L.seen[q.id] && !(opts.avoid && opts.avoid.has(q.id))) break;
  }
  if (opts.inputFilter && !opts.inputFilter(q)) {
    for (let i = 0; i < 20 && !opts.inputFilter(q); i++) { q = generate(pick.c, { rng, tier: pick.tier, level: pick.level, gentle: opts.gentle }); q.tier = pick.tier; }
  }
  return q;
}

export function suggestions(L) {
  const out = [];
  for (const c of Object.keys(CONCEPTS)) {
    const m = conceptMastery(L, c);
    if (m.status === 'practice') out.push({ c, kind: 'practice', m });
  }
  for (const skill of ['div', 'frac']) {
    const lv = levelOf(L.skill[skill]);
    const next = Object.keys(CONCEPTS).filter((c) => CONCEPTS[c].domain === skill && conceptLevels(c)[0] === lv && conceptMastery(L, c).status !== 'mastered');
    if (next.length) out.push({ c: next[0], kind: 'next', m: conceptMastery(L, next[0]) });
  }
  return out;
}

// "First fractions" mode: on for kids who haven't learned fractions yet.
export const isGentle = (p) => (p.settings.fracGentle ?? (p.style === 'younger'));
