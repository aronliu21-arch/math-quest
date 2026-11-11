// Mission runner: battles, boss fights, puzzles, treasure hunts and timed
// challenges all share one question loop with hints, two tries and reveal.
import { register, go } from './router.js';
import { S, save, grantRewards, checkAchievements, recordAnswerStats, rollChest, addPet, randomUnownedPet, skillLevel } from './state.js';
import { t, L, getLang } from './i18n.js';
import { el, rich, richL, fmtRich, $, $$, bindActions, toast, modal, burst, confetti, centerOf, sleep, progressBar, reducedMotion } from './ui.js';
import { heroSVG, petSVG, petName, monsterSVG, makeMonster, BOSSES, sceneSVG, itemSVG, pieSVG, barSVG, rectSVG, lineSVG, chestSVG, PETS } from './art.js';
import { sfx, speak, startMusic, stopMusic, stopSpeaking } from './audio.js';
import { nextQuestion, recordResult, conceptMastery } from './adaptive.js';
import { checkAnswer, generate, CONCEPTS, longDivision, asMultipleChoice } from '../shared/mathgen.js';
import { fmt } from '../shared/fraction.js';
import { makeRng, randomSeed } from '../shared/rng.js';
import { renderInput } from './inputs.js';
import { TIPS, COSTUMES, EQUIPMENT, DECOR_ITEMS } from './content.js';

const MODE_INFO = {
  battle: { hp: 5, maxQ: 8 },
  boss: { hp: 8, maxQ: 12 },
  puzzle: { count: 4 },
  treasure: { count: 4 },
  timed: { seconds: 60 },
};

// Puzzle missions use hands-on inputs.
const PUZZLES = {
  div: { 1: ['div_share'], 2: ['div_sharerem', 'div_share'], 3: ['div_sharerem'] },
  frac: { 1: ['frac_shade'], 2: ['frac_equivshade', 'frac_line', 'frac_shade'], 3: ['frac_order', 'frac_line', 'frac_equivshade'] },
};
function puzzleQuestion(p, world, rng, seen) {
  const skills = world === 'village' ? ['div'] : world === 'forest' ? ['frac'] : ['div', 'frac'];
  const skill = rng.pick(skills);
  const lv = world === 'legend' ? 3 : skillLevel(p, skill);
  const c = rng.pick(PUZZLES[skill][lv]);
  const tier = (p.learning.skill[skill].r % 100) / 100;
  let q;
  const hands = (x) => ['share', 'shade', 'line', 'order'].includes(x.input);
  for (let i = 0; i < 40; i++) { q = generate(c, { rng, tier: world === 'legend' ? 1 : tier }); if (hands(q) && !p.learning.seen[q.id] && !seen.has(q.id)) break; }
  for (let i = 0; i < 40 && !hands(q); i++) q = generate(c, { rng, tier: world === 'legend' ? 1 : tier });
  q.tier = tier;
  return q;
}

// ---------- visuals for questions ----------
export function visualHTML(v, { grouped = false } = {}) {
  if (!v) return '';
  switch (v.type) {
    case 'items': {
      const per = v.groups ? v.count / v.groups : v.groupOf;
      if (grouped && per) {
        const groups = []; for (let i = 0; i < v.count; i += per) groups.push(Math.min(per, v.count - i));
        return `<div class="vis items grouped">${groups.map((n) => `<div class="grp">${itemSVG(v.item, 26).repeat(n)}</div>`).join('')}</div>`;
      }
      return `<div class="vis items">${itemSVG(v.item, v.count > 24 ? 22 : 30).repeat(v.count)}</div>`;
    }
    case 'dots': {
      const per = v.groups ? v.count / v.groups : v.groupOf;
      if (grouped && per) {
        const groups = []; for (let i = 0; i < v.count; i += per) groups.push(Math.min(per, v.count - i));
        return `<div class="vis dots grouped">${groups.map((n, gi) => `<div class="grp">${'<i></i>'.repeat(n)}</div>`).join('')}</div>`;
      }
      return `<div class="vis dots">${'<i></i>'.repeat(v.count)}</div>`;
    }
    case 'pie': return `<div class="vis">${pieSVG(v.n, v.d, { size: 150 })}</div>`;
    case 'bar': return `<div class="vis">${barSVG(v.n, v.d, { width: 260 })}</div>`;
    case 'rect': return `<div class="vis">${rectSVG(v.n, v.d, { size: 170 })}</div>`;
    case 'bars': return `<div class="vis col">${v.items.map((b) => barSVG(b.n, b.d, { width: 260, height: 36, label: `${b.n}/${b.d}` })).join('')}</div>`;
    case 'line': return `<div class="vis">${lineSVG(v.d, v.max, { width: Math.min(460, window.innerWidth - 70), mark: v.mark })}</div>`;
    case 'pies': return `<div class="vis">${Array.from({ length: v.w }, () => pieSVG(v.d, v.d, { size: 84 })).join('')}${pieSVG(v.n, v.d, { size: 84 })}</div>`;
    case 'pizzas': return `<div class="vis">${Array.from({ length: Math.min(v.count, 8) }, () => pieSVG(1, 1, { size: 60 })).join('')}<span class="people">${'🙂'.repeat(0)}${Array.from({ length: v.people }, () => '<span class="person"></span>').join('')}</span></div>`;
    case 'longdiv': return `<div class="vis"><div class="longdiv"><span class="ld-q">?</span><span class="ld-b">${v.b}</span><span class="ld-a">${v.a}</span></div></div>`;
    default: return '';
  }
}

function longDivWorked(a, b) {
  const L2 = longDivision(a, b);
  return `<div class="ld-worked"><div class="ld-top">${L2.q}${L2.r ? ` R ${L2.r}` : ''}</div><div class="ld-row"><span class="ld-b">${b}</span><span class="ld-a">${a}</span></div>
  ${L2.steps.map((s) => `<div class="ld-step">${s.cur} − ${s.prod} = ${s.rem}</div>`).join('')}</div>`;
}

// ---------- the mission screen ----------
register('mission', async (cfg) => {
  const p = S.profile;
  const mode = cfg.mode;
  const info = MODE_INFO[mode] || MODE_INFO.battle;
  const rng = makeRng(cfg.seed ?? randomSeed());
  const world = cfg.world;
  const isBattle = mode === 'battle' || mode === 'boss';
  const monster = isBattle ? (mode === 'boss' ? { ...makeMonster(rng.int(1, 1e9), world, true), name: BOSSES[world].name, hue: BOSSES[world].hue } : makeMonster(rng.int(1, 1e9), world)) : null;
  let hp = mode === 'boss' ? info.hp + (world === 'legend' ? 2 : 0) : info.hp; const maxHp = hp;
  const total = info.count || info.maxQ || 0;

  const st = { qn: 0, results: [], followUp: null, seen: new Set(), timedCorrect: 0, ended: false, paused: false, startedAt: Date.now(), hintTotal: 0, events: [] };

  const node = el(`<div class="mission world-${world} mode-${mode}">
    <div class="scene-bg">${sceneSVG(world)}</div>
    <header class="mhead">
      <button class="btn-icon" data-act="pause" aria-label="${t('pause')}">❚❚</button>
      <div class="mprog"></div>
      <button class="btn-icon" data-act="read" aria-label="${t('readAloud')}">🔊</button>
    </header>
    <div class="mbody">
      <div class="stage"></div>
      <div class="qcard card"><div class="qinner"></div></div>
    </div>
  </div>`);
  const stage = $('.stage', node); const qinner = $('.qinner', node); const mprog = $('.mprog', node);
  let currentQ = null;

  // ----- stage per mode -----
  const heroHTML = `<div class="hero-wrap me">${heroSVG(p.avatar, { size: 104, glow: true })}<div class="name-badge">${p.name}</div></div>`;
  const petHTML = p.activePet ? `<div class="pet-wrap">${petSVG(p.activePet, p.pets[p.activePet].stage, { size: 78 })}</div>` : '';
  if (isBattle) {
    stage.innerHTML = `<div class="battle">
      <div class="side left">${heroHTML}${petHTML}</div>
      <div class="side right"><div class="mon-name">${L({ en: monster.name[0], zh: monster.name[1] })}</div><div class="hpbar"><div></div></div><div class="mon">${monsterSVG(monster, { size: mode === 'boss' ? 190 : 150 })}</div></div>
      <div class="fx"></div></div>`;
  } else if (mode === 'treasure') {
    stage.innerHTML = `<div class="treasure-stage"><div class="side left">${heroHTML}${petHTML}</div><div class="tchests">${Array.from({ length: total }, (_, i) => `<div class="tchest" data-i="${i}">${chestSVG(false, 70)}</div>`).join('')}</div></div>`;
  } else if (mode === 'timed') {
    stage.innerHTML = `<div class="timed-stage"><div class="side left">${heroHTML}</div><div class="clock"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="clock-bg"/><circle cx="50" cy="50" r="44" class="clock-fg" pathLength="100"/></svg><span class="clock-n">60</span></div><div class="tscore">⭐ <b>0</b></div></div>`;
  } else {
    stage.innerHTML = `<div class="puzzle-stage"><div class="side left">${heroHTML}${petHTML}</div><div class="workbench">🧩 ${t('puzzleIntro')}</div></div>`;
  }
  const drawProg = () => {
    if (isBattle) {
      const f = hp / maxHp; const bar = $('.hpbar > div', node); if (bar) { bar.style.width = `${f * 100}%`; bar.style.background = f > 0.5 ? '#40c057' : f > 0.25 ? '#fab005' : '#fa5252'; }
      mprog.innerHTML = `${'❤️'.repeat(0)}<span class="pill">${L({ en: 'Calm the monster!', zh: '讓怪獸平靜下來！' })}</span>`;
    } else if (mode === 'timed') mprog.innerHTML = `<span class="pill">${t('node_timed')}</span>`;
    else mprog.innerHTML = `<div class="dots-prog">${Array.from({ length: total }, (_, i) => `<i class="${i < st.qn ? 'done' : i === st.qn ? 'now' : ''}"></i>`).join('')}</div>`;
  };
  drawProg();

  // ----- pause -----
  const pause = () => {
    st.paused = true; stopSpeaking();
    const m = modal(`<h2>${t('paused')}</h2>
      <button class="btn big" data-x="resume">▶ ${t('resume')}</button>
      <label class="toggle"><input type="checkbox" data-x="sound" ${p.settings.sound ? 'checked' : ''}> ${t('sound')}</label>
      <label class="toggle"><input type="checkbox" data-x="narr" ${p.settings.narration ? 'checked' : ''}> ${t('narration')}</label>
      <button class="btn ghost" data-x="quit">${t('quitMission')}</button>`, { cls: 'sticky', onClose: () => { st.paused = false; } });
    m.box.addEventListener('change', (e) => {
      if (e.target.dataset.x === 'sound') p.settings.sound = e.target.checked;
      if (e.target.dataset.x === 'narr') p.settings.narration = e.target.checked;
      import('./state.js').then((s) => s.applySettings(p)); save(p);
    });
    m.box.addEventListener('click', (e) => {
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (x === 'resume') m.close();
      if (x === 'quit') { st.ended = true; m.close(); save(p); go(cfg.returnTo || 'world', cfg.returnParams || { world }); }
    });
  };
  bindActions(node, { pause, read: () => currentQ && speak(L(currentQ.prompt), getLang()) });

  // ----- ask one question -----
  function ask(q, { timed = false } = {}) {
    return new Promise((resolve) => {
      currentQ = q;
      const shownAt = performance.now();
      let tries = 0; let hints = 0; let done = false; let hintIdx = 0;
      const beginner = q.level === 1;
      const hintAuto = p.settings.hintMode === 'auto' || beginner;
      qinner.innerHTML = `
        <div class="prompt">${richL(q.prompt)}</div>
        <div class="visual">${q.input === 'share' ? '' : visualHTML(q.visual)}</div>
        <div class="answer-area"></div>
        <div class="feedback" aria-live="polite"></div>
        <div class="qtools">${timed ? '' : `<button class="chip" data-q="hint">💡 ${t('hint')}</button><button class="chip" data-q="show">🪜 ${t('showMe')}</button>`}</div>`;
      qinner.classList.remove('pop'); void qinner.offsetWidth; qinner.classList.add('pop');
      const fb = $('.feedback', qinner);
      if (p.settings.narration) speak(L(q.prompt), getLang());

      const showHint = () => {
        const h = (q.hints || [])[Math.min(hintIdx, (q.hints || []).length - 1)];
        if (!h) return;
        hints++; hintIdx++; st.hintTotal++;
        fb.innerHTML = `<div class="hint-box">💡 ${richL(h)}</div>`;
        if (q.input !== 'share' && q.visual && (q.visual.type === 'items' || q.visual.type === 'dots')) $('.visual', qinner).innerHTML = visualHTML(q.visual, { grouped: true });
        if (p.settings.narration) speak(L(h), getLang());
      };
      const showSteps = (fromReveal = false) => {
        const steps = q.steps || [];
        let i = 0;
        const box = el(`<div class="steps-box"><div class="steps"></div>${q.visual && q.visual.type === 'longdiv' ? longDivWorked(q.visual.a, q.visual.b) : ''}<button class="btn small next-step">${L({ en: 'Next step ▶', zh: '下一步 ▶' })}</button></div>`);
        const drawSteps = () => {
          $('.steps', box).innerHTML = steps.slice(0, i + 1).map((s, k) => `<div class="step ${k === i ? 'new' : ''}"><b>${k + 1}</b> ${richL(s)}</div>`).join('');
          $('.next-step', box).style.display = i < steps.length - 1 ? '' : 'none';
          if (p.settings.narration && steps[i]) speak(L(steps[i]), getLang());
        };
        $('.next-step', box).addEventListener('click', () => { i++; drawSteps(); });
        drawSteps();
        fb.appendChild(box);
        if (!fromReveal) { hints++; p.stats.showMe = (p.stats.showMe || 0) + 1; }
        if (q.input !== 'share' && q.visual && (q.visual.type === 'items' || q.visual.type === 'dots')) $('.visual', qinner).innerHTML = visualHTML(q.visual, { grouped: true });
      };
      $('.qtools', qinner).addEventListener('click', (e) => {
        const b = e.target.closest('[data-q]'); if (!b || done) return;
        sfx('tap');
        if (b.dataset.q === 'hint') showHint();
        if (b.dataset.q === 'show') { b.disabled = true; showSteps(); }
      });

      const finish = (ok, revealed = false) => {
        done = true; input.lock && input.lock();
        const ms = performance.now() - shownAt;
        const r = { ok, firstTry: ok && tries === 0, tries: tries + (ok ? 1 : 0), ms, hints, revealed };
        recordAnswerStats(p, r);
        const rr = recordResult(p.learning, q, { ...r, sessionId: S.sessionId });
        if (rr.event) st.events.push(rr);
        save(p);
        resolve(r);
      };

      const submit = (value, btn, extra) => {
        if (done || st.paused) return;
        const res = value && value.t === 'n' && value.v === -1 ? { ok: false } : checkAnswer(q, value);
        if (res.almost) {
          fb.innerHTML = `<div class="nudge">🤏 ${t(res.almost === 'simplify' ? 'almostSimplify' : res.almost === 'mixed' ? 'almostMixed' : 'almostImproper')}</div>`;
          input.wrong && input.wrong(btn);
          return; // not counted as a try
        }
        if (res.ok) {
          sfx('correct');
          const msg = t('correct');
          fb.innerHTML = `<div class="praise">🌟 ${msg}${res.notSimplest ? `<div class="small">${t('notSimplest')}</div>` : ''}${q.after ? `<div class="small">${richL(q.after)}</div>` : ''}</div>`;
          if (btn) btn.classList.add('right');
          const [x, y] = centerOf(btn || fb); burst(x, y);
          if (p.settings.narration) speak(msg, getLang());
          finish(true);
          return;
        }
        tries++;
        input.wrong && input.wrong(btn);
        if (timed) { sfx('gentle'); fb.innerHTML = `<div class="reveal-line">${t('answerWas', { a: fmtRich(q.answer) })}</div>`; finish(false, true); return; }
        if (tries === 1) {
          sfx('gentle');
          const mis = res.misconception ? `<div class="small">${t('misconception_' + res.misconception)}</div>` : '';
          const custom = extra && extra.msg ? `<div class="small">${L(extra.msg)}</div>` : '';
          fb.innerHTML = `<div class="encourage">💪 ${t('tryAgain')}${custom}${mis}</div>`;
          if (p.settings.narration) speak(fb.textContent, getLang());
          if (hintAuto) setTimeout(() => { if (!done) { const keep = fb.innerHTML; showHint(); fb.innerHTML = keep + fb.innerHTML; } }, 500);
          return;
        }
        // second miss → reveal with a one-line reason and the steps
        sfx('gentle');
        input.reveal && input.reveal();
        fb.innerHTML = `<div class="reveal-line">💡 ${t('reveal')} ${t('answerWas', { a: fmtRich(q.answer) })}</div>`;
        showSteps(true);
        const go2 = el(`<button class="btn big got-it">${L({ en: 'Got it! ▶', zh: '懂了！▶' })}</button>`);
        fb.appendChild(go2);
        done = true;
        go2.addEventListener('click', () => { sfx('tap'); done = false; finish(false, true); });
        if (p.settings.narration) speak(`${t('answerWas', { a: fmt(q.answer, getLang()) })}`, getLang());
      };
      const input = renderInput(q, $('.answer-area', qinner), submit, { chestStyle: mode === 'treasure' && q.input === 'mc' });
      // Expose for automated playtests. Harmless for players.
      if (window.__test) Object.assign(window.__test, { q, submit: (v) => submit(v), solve: () => submit(q.answer), wrong: () => submit({ t: 'n', v: -1 }), mission: () => ({ mode, qn: st.qn, hp, ended: st.ended }) });
    });
  }

  function makeQuestion(opts = {}) {
    let q;
    if (mode === 'puzzle') q = puzzleQuestion(p, world, rng, st.seen);
    else {
      const filter = mode === 'treasure' ? (x) => x.input === 'mc' : mode === 'timed' ? (x) => x.input === 'mc' || x.input === 'pad' : null;
      q = nextQuestion(p.learning, world, rng, { followUp: st.followUp, avoid: st.seen, inputFilter: filter });
      if (mode === 'treasure' && q.input !== 'mc') q = { ...asMultipleChoice(q, rng), tier: q.tier };
    }
    st.seen.add(q.id);
    return q;
  }

  // ----- animations -----
  async function attackAnim(crit) {
    const fx = $('.fx', node); const heroW = $('.hero-wrap', node); const mon = $('.mon', node);
    heroW.classList.add('lunge'); sfx('attack');
    const star = el(`<div class="projectile ${p.avatar.held === 'sword' ? 'big' : ''}">${crit ? '💥' : '⭐'}</div>`); fx.appendChild(star);
    await sleep(reducedMotion() ? 50 : 420);
    star.remove(); heroW.classList.remove('lunge');
    mon.innerHTML = monsterSVG(monster, { size: mode === 'boss' ? 190 : 150, hurt: true }); mon.classList.add('hit'); sfx('hit');
    const [x, y] = centerOf(mon); burst(x, y, crit ? 22 : 12);
    const dmg = el(`<div class="dmg">${crit ? L({ en: 'CRITICAL!', zh: '會心一擊！' }) : '+1'}</div>`); fx.appendChild(dmg);
    await sleep(reducedMotion() ? 50 : 550);
    dmg.remove(); mon.classList.remove('hit');
    mon.innerHTML = monsterSVG(monster, { size: mode === 'boss' ? 190 : 150 });
  }

  // ----- main loop -----
  async function run() {
    stopMusic();
    if (isBattle) {
      const banner = el(`<div class="banner ${mode === 'boss' ? 'boss' : ''}">${mode === 'boss' ? t('bossAppears', { m: L({ en: monster.name[0], zh: monster.name[1] }) }) : t('monsterAppears', { m: L({ en: monster.name[0], zh: monster.name[1] }) })}</div>`);
      node.appendChild(banner); if (p.settings.narration) speak(banner.textContent, getLang());
      await sleep(1400); banner.remove();
    }
    if (mode === 'treasure') { toast(t('treasureIntro'), 'info', 2600); }
    if (mode === 'timed') { await timedLoop(); return; }

    while (!st.ended) {
      if (isBattle && (hp <= 0 || st.qn >= info.maxQ)) break;
      if (!isBattle && st.qn >= total) break;
      const q = makeQuestion(); drawProg();
      const r = await ask(q);
      if (st.ended) return;
      st.results.push(r);
      st.followUp = r.ok ? null : { concept: q.concept, level: q.level, tier: q.tier ?? 0.5 };
      st.qn++;
      if (isBattle && r.ok) { hp--; await attackAnim(r.firstTry && !r.hints); drawProg(); }
      else if (mode === 'treasure') {
        const ch = $(`.tchest[data-i="${st.qn - 1}"]`, node);
        if (ch) { ch.innerHTML = chestSVG(true, 70, r.ok ? '#c2410c' : '#868e96'); if (r.ok) { sfx('coin'); const [x, y] = centerOf(ch); burst(x, y, 10); } }
        await sleep(600);
      } else await sleep(r.ok ? 700 : 200);
    }
    if (isBattle && hp > 0) {
      // the pet helps out: everyone is a winner, but rewards reflect effort
      const fx = $('.fx', node);
      fx.appendChild(el(`<div class="dmg friend">${L({ en: `${petName(p.activePet, p.pets[p.activePet].stage, 'en')} helps out!`, zh: `${petName(p.activePet, p.pets[p.activePet].stage, 'zh')}來幫忙了！` })}</div>`));
      await sleep(1200);
      hp = 0; drawProg();
    }
    if (isBattle) {
      const mon = $('.mon', node); mon.classList.add('calmed');
      toast(t('monsterDefeated', { m: L({ en: monster.name[0], zh: monster.name[1] }) }), 'good', 1800);
      await sleep(1300);
    }
    finishMission();
  }

  async function timedLoop() {
    const intro = modal(`<h2>⏱️ ${t('node_timed')}</h2><p>${t('timedIntro', { s: info.seconds })}</p>
      <button class="btn big" data-x="start">${t('startTimer')}</button><button class="btn ghost" data-x="untimed">${t('skipTimed')}</button>`, { cls: 'sticky' });
    const choice = await new Promise((res) => intro.box.addEventListener('click', (e) => { const x = e.target.closest('[data-x]')?.dataset.x; if (x) { intro.close(); res(x); } }));
    if (choice === 'untimed') { // play as a relaxed 5-question round
      $('.clock', node).style.display = 'none';
      for (let i = 0; i < 5 && !st.ended; i++) { const q = makeQuestion(); const r = await ask(q); st.results.push(r); st.followUp = r.ok ? null : { concept: q.concept, level: q.level, tier: q.tier ?? 0.5 }; if (r.ok) st.timedCorrect++; $('.tscore b', node).textContent = st.timedCorrect; await sleep(500); }
      if (!st.ended) finishMission();
      return;
    }
    const endAt = Date.now() + info.seconds * 1000;
    let pausedAt = 0; let pausedTotal = 0;
    const tick = setInterval(() => {
      if (st.paused) { if (!pausedAt) pausedAt = Date.now(); return; }
      if (pausedAt) { pausedTotal += Date.now() - pausedAt; pausedAt = 0; }
      const left = Math.max(0, Math.ceil((endAt + pausedTotal - Date.now()) / 1000));
      const n = $('.clock-n', node); if (n) n.textContent = left;
      const fg = $('.clock-fg', node); if (fg) fg.style.strokeDasharray = `${(left / info.seconds) * 100} 100`;
      if (left <= 5 && left > 0) sfx('tick');
      if (left <= 0) { clearInterval(tick); st.timeUp = true; if (currentResolve) currentResolve(); }
    }, 250);
    let currentResolve = null;
    while (!st.timeUp && !st.ended) {
      const q = makeQuestion();
      const r = await Promise.race([ask(q, { timed: true }), new Promise((res) => { currentResolve = () => res(null); })]);
      if (!r) break;
      st.results.push(r); if (r.ok) st.timedCorrect++;
      $('.tscore b', node).textContent = st.timedCorrect;
      await sleep(r.ok ? 350 : 900);
    }
    clearInterval(tick);
    if (!st.ended) finishMission();
  }

  async function finishMission() {
    if (st.ended) return; st.ended = true;
    const res = st.results;
    const ft = res.filter((r) => r.firstTry).length; const st2 = res.filter((r) => r.ok && !r.firstTry).length; const rev = res.filter((r) => !r.ok).length;
    const correct = ft + st2;
    let xp = ft * 12 + st2 * 8 + rev * 3; let coins = correct * 4; let gems = 0; let petXp = correct * 5 + 5;
    if (mode === 'boss') { xp += 30; coins += 25; gems += 2; p.stats.bosses++; p.stats.bossWorlds[world] = true; }
    if (mode === 'treasure') { coins += 15; }
    if (mode === 'puzzle') { xp += 10; }
    if (mode === 'timed') { xp += correct * 2; }
    if (cfg.source === 'secret') { gems += 3; p.stats.secrets++; }
    if (cfg.daily) { coins *= cfg.daily.twist === 'double_coins' ? 2 : 1; gems += cfg.daily.twist === 'gem_hunt' ? 2 : 1; petXp *= cfg.daily.twist === 'pet_party' ? 2 : 1; }
    const persistence = st2 >= 2;
    if (persistence) coins += 10;
    for (const e of st.events) if (e.event === 'levelUp') gems += 2;
    const granted = grantRewards(p, { xp, coins, gems, petXp });
    p.stats.missions++;
    p.stats.playMs += Date.now() - st.startedAt;
    p.missionsInRow = (p.missionsInRow || 0) + 1;

    // chest + pet discoveries
    let chest = null; let newPet = null;
    const chestChance = mode === 'boss' || mode === 'treasure' || cfg.source === 'secret' ? 1 : mode === 'battle' ? 0.25 : 0.2;
    if (rng.chance(chestChance)) chest = { quality: mode === 'boss' ? 2 : 1 };
    if (mode === 'boss') {
      const rar = world === 'legend' ? ['legendary', 'rare'] : ['rare', 'common'];
      if (rng.chance(world === 'legend' ? 0.6 : 0.35)) newPet = randomUnownedPet(p, rng, rar);
    } else if (cfg.source === 'secret' && rng.chance(0.5)) newPet = randomUnownedPet(p, rng, ['rare', 'legendary']);
    else if (mode === 'battle' && rng.chance(0.15)) newPet = randomUnownedPet(p, rng, ['common']);
    if (newPet) addPet(p, newPet);
    const ach = checkAchievements(p);
    await save(p);
    cfg.onComplete && cfg.onComplete({ correct, total: res.length });
    await save(p);
    showResults({ ft, st2, rev, granted, chest, newPet, ach, persistence });
  }

  function showResults({ ft, st2, rev, granted, chest, newPet, ach, persistence }) {
    const stars = ft * 2 + st2;
    const maxStars = Math.max(1, st.results.length * 2);
    const starCount = stars / maxStars > 0.8 ? 3 : stars / maxStars > 0.45 ? 2 : 1;
    const tipKey = st.results.length ? (currentQ && currentQ.tip) : null;
    const breakNow = p.settings.breakEvery > 0 && p.missionsInRow >= p.settings.breakEvery;
    const skillEvents = st.events.map((e) => `<div class="ev">${e.event === 'levelUp' ? '🚀 ' + t('levelUpSkill', { s: t(e.skill === 'div' ? 'division' : 'fractions') }) : '🌱 ' + t('levelDownSkill', { s: t(e.skill === 'div' ? 'division' : 'fractions') })}</div>`).join('');
    const evs = granted.events.map((e) => {
      if (e.type === 'heroLevel') return `<div class="ev big">🎉 ${t('heroLevelUp', { n: e.level })}</div>`;
      if (e.type === 'evolve') return `<div class="ev big evolve">${petSVG(e.species, e.stage, { size: 90 })} ✨ ${t('petEvolved', { p: petName(e.species, e.stage, getLang()) })}</div>`;
      if (e.type === 'petXp') return `<div class="ev">🐾 ${t('petXp', { p: petName(e.species, p.pets[e.species].stage, getLang()), n: e.amount })}</div>`;
      return '';
    }).join('');
    const nextLabel = cfg.next ? L(cfg.next.label) : null;
    const r = el(`<div class="results-wrap"><div class="results card pop">
      <h2>${t('missionComplete')}</h2>
      <div class="stars">${[1, 2, 3].map((i) => `<span class="star ${i <= starCount ? 'on' : ''}" style="animation-delay:${i * 0.2}s">★</span>`).join('')}</div>
      <div class="tally"><span>✅ ${t('firstTry')}: <b>${ft}</b></span>${st2 ? `<span>💪 ${L({ en: 'Second try', zh: '第二次答對' })}: <b>${st2}</b></span>` : ''}${rev ? `<span>📘 ${L({ en: 'Learned', zh: '學到' })}: <b>${rev}</b></span>` : ''}</div>
      <div class="reward-row"><span class="rw">⭐ +${granted.xp} ${t('xp')}</span><span class="rw">${itemSVG('coin', 26)} +${granted.coins}</span>${granted.gems ? `<span class="rw">${itemSVG('gemIcon', 26)} +${granted.gems}</span>` : ''}</div>
      ${persistence ? `<div class="ev">💪 ${t('persistence')} +10</div>` : ''}
      ${skillEvents}${evs}
      ${newPet ? `<div class="ev big">${petSVG(newPet, 0, { size: 90 })} 💖 ${t('newPet', { p: petName(newPet, 0, getLang()) })} <span class="tag ${PETS[newPet].rarity}">${t('rarity_' + PETS[newPet].rarity)}</span></div>` : ''}
      ${ach.map((a) => `<div class="ev ach">🏅 ${t('achievementUnlocked', { a: L(a.name) })}</div>`).join('')}
      ${chest ? `<div class="chest-box" data-act="openChest">${chestSVG(false, 110)}<div class="small">${t('tapChest')}</div></div>` : ''}
      ${tipKey && TIPS[tipKey] ? `<div class="tip"><b>🏡 ${t('realLife')}:</b> ${richL(TIPS[tipKey])}</div>` : ''}
      <div class="row gap wrap center">
        ${breakNow ? `<button class="btn big" data-act="break">${t('continue')}</button>` : `${nextLabel ? `<button class="btn big" data-act="next">${t('nextMission', { m: nextLabel })}</button>` : ''}<button class="btn ${nextLabel ? 'ghost' : 'big'}" data-act="map">${L(cfg.backLabel || { en: t('backToMap'), zh: t('backToMap') })}</button>`}
      </div>
    </div></div>`);
    node.appendChild(r);
    if (starCount === 3 || granted.events.some((e) => e.type === 'heroLevel')) confetti();
    sfx(granted.events.some((e) => e.type === 'heroLevel') ? 'levelup' : 'chest');
    let chestOpened = !chest;
    bindActions(r, {
      openChest: (_, b) => {
        if (chestOpened) return; chestOpened = true;
        const loot = rollChest(p, rng, chest.quality); save(p);
        b.innerHTML = `${chestSVG(true, 110)}<div class="loot">${lootHTML(loot)}</div>`;
        sfx('chest'); const [x, y] = centerOf(b); burst(x, y, 24);
      },
      next: () => { if (!chestOpened) autoOpen(); cfg.next.go(); },
      map: () => { if (!chestOpened) autoOpen(); go(cfg.returnTo || 'world', cfg.returnParams || { world }); },
      break: () => { if (!chestOpened) autoOpen(); go('break'); },
    });
    function autoOpen() { chestOpened = true; rollChest(p, rng, chest.quality); save(p); }
  }

  run().catch((e) => console.error(e));
  return { node, cleanup: () => { st.ended = true; stopSpeaking(); } };
});

export function lootHTML(loot) {
  const name = loot.kind === 'pet' ? petName(loot.id, 0, getLang())
    : loot.kind === 'costume' ? L(COSTUMES[loot.id].name)
      : loot.kind === 'equipment' ? L(EQUIPMENT[loot.id].name)
        : loot.kind === 'decor' ? L(DECOR_ITEMS[loot.id].name)
          : loot.kind === 'gems' ? `${loot.amount} ${t('gems')}` : `${loot.amount} ${t('coins')}`;
  return `🎁 ${t('youGot', { x: name })}`;
}

register('break', () => {
  const p = S.profile; p.missionsInRow = 0; save(p);
  const node = el(`<div class="center-screen break-screen"><div class="card pop">
    <div class="break-art">${petSVG(p.activePet, p.pets[p.activePet].stage, { size: 140 })}</div>
    <h2>${t('breakTitle')}</h2><p>${t('breakText')}</p>
    <button class="btn big" data-act="finish">${t('finishForNow')}</button></div></div>`);
  bindActions(node, { finish: () => go('title') });
  return node;
});
