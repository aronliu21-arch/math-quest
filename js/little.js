// Little Explorer: a voice-first dinosaur mode for a 3–4 year old.
// Giant picture buttons, everything read aloud, almost no reading needed.
import { register, go } from './router.js';
import { S, save, grantRewards } from './state.js';
import { L, getLang } from './i18n.js';
import { el, $, $$, bindActions, burst, confetti, centerOf, sleep, esc } from './ui.js';
import { heroSVG, dinoSVG, eggSVG, splitSVG, sceneSVG, itemSVG, DINO_STICKERS } from './art.js';
import { sfx, speak, startMusic, stopMusic } from './audio.js';
import { littleQuestion, LITTLE_KINDS, LITTLE_NAMES } from '../shared/littlegen.js';
import { makeRng, randomSeed } from '../shared/rng.js';
import { renderInput } from './inputs.js';
import { num } from '../shared/fraction.js';
import { today } from './adaptive.js';

const T = (en, zh) => ({ en, zh });
const say = (o) => { if (S.profile.settings.narration !== false) speak(L(o), getLang()); };
const ROUND = 5;
const ICON = { count: '🦕', add: '➕', share: '🍪', half: '🍕', more: '🥚' };

export function ensureLittle(p) {
  if (!p.little) p.little = { lvl: {}, stats: {}, stickers: [], stars: 0 };
  return p.little;
}

// ---------------- home ----------------
register('little', () => {
  const p = S.profile; const lt = ensureLittle(p);
  startMusic('menu');
  const node = el(`<div class="little-home">
    <div class="scene-bg">${sceneSVG('forest')}</div>
    <header class="topbar"><button class="btn-icon" data-act="switch" aria-label="switch">👥</button><span class="lt-stars">⭐ ${lt.stars}</span><button class="btn-icon" data-act="hello" aria-label="speak">🔊</button></header>
    <div class="lt-hero"><div class="hero-wrap me">${heroSVG(p.avatar, { size: 130, glow: true })}<span class="name-badge">${esc(p.name)}</span></div>${dinoSVG(lt.stickers.length ? lt.stickers[lt.stickers.length - 1] : 0, 110)}</div>
    <div class="lt-grid">
      <button class="lt-tile big" data-act="play" data-arg="mix"><span>▶</span></button>
      ${LITTLE_KINDS.map((k) => `<button class="lt-tile" data-act="play" data-arg="${k}" aria-label="${L(LITTLE_NAMES[k])}"><span>${ICON[k]}</span><small>${L(LITTLE_NAMES[k])}</small></button>`).join('')}
      <button class="lt-tile" data-act="book" aria-label="stickers"><span>📒</span><small>${L(T('My dinos', '我的恐龍'))} ${lt.stickers.length}</small></button>
    </div>
  </div>`);
  const hello = () => say(T(`Hi ${p.name}! Tap the big green button to play!`, `${p.name}你好！點大大的綠色按鈕開始玩！`));
  bindActions(node, {
    switch: () => go('profiles'),
    hello,
    play: (k) => go('littleplay', { kind: k }),
    book: () => go('littlebook'),
  });
  setTimeout(hello, 400);
  return node;
});

// ---------------- sticker book ----------------
register('littlebook', () => {
  const p = S.profile; const lt = ensureLittle(p);
  const node = el(`<div class="little-home"><div class="scene-bg">${sceneSVG('forest')}</div>
    <header class="topbar"><button class="btn-icon" data-act="back">←</button><h1>📒</h1></header>
    <div class="lt-book">${DINO_STICKERS.map((d, i) => `<button class="lt-sticker card ${lt.stickers.includes(i) ? '' : 'locked'}" data-act="tap" data-arg="${i}">${dinoSVG(i, 90, { happy: lt.stickers.includes(i) })}<small>${lt.stickers.includes(i) ? L({ en: d.name[0], zh: d.name[1] }) : '?'}</small></button>`).join('')}</div></div>`);
  bindActions(node, {
    back: () => go('little'),
    tap: (i) => { i = +i; if (lt.stickers.includes(i)) { sfx('roar'); say({ en: DINO_STICKERS[i].name[0], zh: DINO_STICKERS[i].name[1] }); } else say(T('Play more to find this dinosaur!', '多玩幾次就能找到這隻恐龍！')); },
  });
  say(T('Your dinosaur friends!', '你的恐龍朋友！'));
  return node;
});

// ---------------- play a round ----------------
register('littleplay', ({ kind }) => {
  const p = S.profile; const lt = ensureLittle(p);
  stopMusic();
  const rng = makeRng(randomSeed());
  const st = { n: 0, ft: 0, ended: false, start: Date.now() };
  const node = el(`<div class="little-play"><div class="scene-bg">${sceneSVG('forest')}</div>
    <header class="topbar"><button class="btn-icon" data-act="home" aria-label="home">🏠</button><div class="lt-prog"></div><button class="btn-icon big-say" data-act="say" aria-label="speak">🔊</button></header>
    <div class="lt-card card"></div></div>`);
  const card = $('.lt-card', node); let cur = null;
  const prog = () => { $('.lt-prog', node).innerHTML = Array.from({ length: ROUND }, (_, i) => `<span class="${i < st.n ? 'hatched' : ''}">${i < st.n ? '🐣' : eggSVG(30, i)}</span>`).join(''); };
  prog();
  bindActions(node, { home: () => { st.ended = true; go('little'); }, say: () => cur && say(cur.prompt) });

  function record(q, ok, firstTry, ms) {
    const s = (lt.stats[q.kind] ||= { a: 0, ft: 0, recent: [] });
    s.a++; if (ok && firstTry) s.ft++;
    s.recent.push(ok && firstTry ? 1 : 0); if (s.recent.length > 8) s.recent.shift();
    const last5 = s.recent.slice(-5);
    if ((lt.lvl[q.kind] || 1) < 2 && last5.length === 5 && last5.reduce((x, y) => x + y, 0) >= 4) lt.lvl[q.kind] = 2;
    const day = (p.learning.days[today()] ||= { ms: 0, q: 0, ok: 0, ft: 0 });
    day.q++; day.ms += Math.min(ms, 60000); if (ok) day.ok++; if (ok && firstTry) day.ft++;
    p.stats.answered++;
    save(p);
  }

  function ask(q) {
    return new Promise((resolve) => {
      cur = q; let tries = 0; let done = false; const t0 = performance.now();
      let body = ''; let choices = '';
      const numBtn = (v) => `<button class="lt-choice num" data-v="${v}"><b>${v}</b><span class="dots">${'●'.repeat(v)}</span></button>`;
      if (q.kind === 'count') {
        body = `<div class="lt-row dinos">${Array.from({ length: q.n }, (_, i) => `<button class="lt-dino" data-i="${i}">${dinoSVG(i + rng.int(0, 11), 76)}<i class="cnt"></i></button>`).join('')}</div>`;
        choices = q.choices.map(numBtn).join('');
      } else if (q.kind === 'add') {
        const c = rng.int(0, 11);
        body = `<div class="lt-row add"><div class="grp">${Array.from({ length: q.a }, (_, i) => `<span class="lt-dino">${dinoSVG(c, 64)}<i class="cnt"></i></span>`).join('')}</div><b class="plus">+</b><div class="grp arriving">${Array.from({ length: q.b }, () => `<span class="lt-dino">${dinoSVG(c + 3, 64)}<i class="cnt"></i></span>`).join('')}</div></div>`;
        choices = q.choices.map(numBtn).join('');
      } else if (q.kind === 'half') {
        const pics = [0, 1].map((i) => (i === q.correct ? splitSVG(q.shape, 0.5) : splitSVG(q.shape, q.off)));
        choices = pics.map((svg, i) => `<button class="lt-choice pic" data-v="${i}">${svg}</button>`).join('');
      } else if (q.kind === 'more') {
        choices = q.counts.map((n, i) => `<button class="lt-choice pic nest" data-v="${i}"><div class="eggs">${Array.from({ length: n }, (_, k) => eggSVG(30, k)).join('')}</div></button>`).join('');
      }
      card.innerHTML = `<div class="lt-q">${body}</div><div class="lt-choices ${q.kind}">${choices}</div><div class="lt-fb"></div>`;
      card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
      say(q.prompt);

      // tap a dinosaur to count it out loud
      let counted = 0;
      card.addEventListener('click', (e) => {
        const d = e.target.closest('.lt-dino'); if (!d || done || d.dataset.c) return;
        counted++; d.dataset.c = counted; $('.cnt', d).textContent = counted; sfx('tap'); speak(String(counted), getLang());
      });
      const numberAll = () => { $$('.lt-dino', card).forEach((d, i) => { d.dataset.c = i + 1; $('.cnt', d).textContent = i + 1; }); };

      const finish = (ok) => {
        done = true; record(q, ok, tries === 0, performance.now() - t0);
        setTimeout(() => resolve({ ok, firstTry: ok && tries === 0 }), ok ? 1300 : 2600);
      };
      const right = (btn) => {
        sfx('roar'); setTimeout(() => sfx('correct'), 300);
        if (btn) { btn.classList.add('right'); const [x, y] = centerOf(btn); burst(x, y, 20); }
        $('.lt-fb', card).innerHTML = '⭐';
        say(rng.pick([T('Yay! You did it!', '耶！你做到了！'), T('Great job!', '好棒喔！'), T('Roar! So smart!', '吼～好聰明！'), T('You are getting so good!', '你越來越厲害了！')]));
        finish(true);
      };
      const wrong = (btn) => {
        tries++; sfx('gentle');
        if (btn) { btn.classList.add('shake'); setTimeout(() => btn.classList.remove('shake'), 500); }
        if (tries === 1) {
          say(q.hint);
          if (q.kind === 'count' || q.kind === 'add') numberAll();
          if (btn) btn.disabled = true;
          return;
        }
        // second miss: show the answer kindly and move on
        const correctBtn = $$('.lt-choice', card).find((b) => +b.dataset.v === q.answer);
        if (correctBtn) correctBtn.classList.add('right', 'glow');
        if (inputApi && inputApi.reveal) inputApi.reveal();
        say(q.kind === 'count' || q.kind === 'add' ? T(`It's ${q.answer}! Let's try another one.`, `答案是${q.answer}！我們再玩下一題。`) : T("Here it is! Let's try another one.", '在這裡！我們再玩下一題。'));
        finish(false);
      };
      $('.lt-choices', card).addEventListener('click', (e) => {
        const b = e.target.closest('.lt-choice'); if (!b || done || b.disabled) return;
        if (+b.dataset.v === q.answer) right(b); else wrong(b);
      });
      let inputApi = null;
      if (q.kind === 'share') {
        const sq = { input: 'share', item: 'cookie', groups: q.groups, total: q.total, answer: num(q.answer), autoCheck: true, plateArt: dinoSVG(rng.int(0, 11), 70) };
        inputApi = renderInput(sq, $('.lt-q', card), (v) => { if (done) return; if (v && v.t === 'n' && v.v === q.answer) right(null); else { wrong(null); if (!done && inputApi) inputApi.wrong(); } });
      }
      // Expose for automated playtests. Harmless for players.
      if (window.__test) Object.assign(window.__test, { little: q, littleSolve: () => { if (q.kind === 'share') { right(null); return; } $$('.lt-choice', card).find((b) => +b.dataset.v === q.answer)?.click(); }, littleWrong: () => { const b = $$('.lt-choice', card).find((x) => +x.dataset.v !== q.answer && !x.disabled); if (b) b.click(); else wrong(null); } });
    });
  }

  async function run() {
    while (st.n < ROUND && !st.ended) {
      const k = kind === 'mix' ? rng.pick(LITTLE_KINDS) : kind;
      const q = littleQuestion(k, rng, lt.lvl[k] || 1);
      const r = await ask(q);
      if (st.ended) return;
      st.n++; if (r.firstTry) st.ft++; prog();
    }
    if (st.ended) return;
    // round done: everyone gets a dinosaur sticker for finishing
    lt.stars += st.ft;
    const missing = DINO_STICKERS.map((_, i) => i).filter((i) => !lt.stickers.includes(i));
    const sticker = missing.length ? missing[0] : rng.int(0, DINO_STICKERS.length - 1);
    if (missing.length) lt.stickers.push(sticker);
    grantRewards(p, { xp: 10 + st.ft * 4, coins: 5 + st.ft * 2, petXp: 10 });
    p.stats.missions++; p.stats.playMs += Date.now() - st.start;
    await save(p);
    stopMusic(); confetti(70); sfx('roar'); setTimeout(() => sfx('levelup'), 500);
    card.innerHTML = `<div class="lt-done">${dinoSVG(sticker, 200)}<div class="lt-stars-row">${'⭐'.repeat(Math.max(1, st.ft))}</div>
      <div class="row gap center"><button class="lt-choice go" data-act2="again">▶</button><button class="lt-choice go" data-act2="home">🏠</button></div></div>`;
    say(missing.length ? T(`You found a new dinosaur friend: ${DINO_STICKERS[sticker].name[0]}!`, `你找到新的恐龍朋友：${DINO_STICKERS[sticker].name[1]}！`) : T('You did it! Great playing!', '你做到了！玩得真好！'));
    card.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act2]')?.dataset.act2;
      if (a === 'again') go('littleplay', { kind }, { replace: true });
      if (a === 'home') go('little');
    });
  }
  run();
  return { node, cleanup: () => { st.ended = true; } };
});
