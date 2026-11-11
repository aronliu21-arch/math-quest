// World map: generated expeditions with branching paths, random events,
// hidden secret levels and Easter eggs.
import { register, go } from './router.js';
import { S, save, grantRewards, addPet, randomUnownedPet, checkAchievements } from './state.js';
import { t, L, getLang } from './i18n.js';
import { el, $, $$, bindActions, toast, modal, burst, confetti, centerOf, sleep, reducedMotion } from './ui.js';
import { sceneSVG, heroSVG, petSVG, petName, PETS } from './art.js';
import { sfx, startMusic } from './audio.js';
import { makeRng, randomSeed } from '../shared/rng.js';

const ICON = { battle: '⚔️', puzzle: '🧩', treasure: '💰', timed: '⏱️', boss: '👑', event: '❓', secret: '✨' };

export function makeExpedition(world, seed, timedOn = true) {
  const r = makeRng(seed);
  const pick = (a) => r.pick(a);
  const timedOr = (alt) => (timedOn ? 'timed' : alt);
  const nodes = [
    { id: 'n0', type: 'battle', x: 10, y: 72, req: [] },
    { id: 'n1', type: pick(['puzzle', 'treasure']), x: 24, y: 48, req: ['n0'] },
    { id: 'n2', type: pick(['battle', 'puzzle']), x: 38, y: 66, req: ['n1'] },
    { id: 'a3', type: pick([timedOr('puzzle'), 'puzzle', 'treasure']), x: 52, y: 38, req: ['n2'], branch: 'b3' },
    { id: 'b3', type: pick(['battle', 'treasure']), x: 52, y: 80, req: ['n2'], branch: 'a3' },
    { id: 'n4', type: 'event', x: 66, y: 58, req: ['a3', 'b3'], any: true },
    { id: 'n5', type: pick(['battle', 'puzzle', 'treasure']), x: 78, y: 36, req: ['n4'] },
    { id: 'n6', type: 'boss', x: 90, y: 62, req: ['n5'] },
  ];
  // the secret sparkle hides somewhere off the path
  const secret = { id: 's', type: 'secret', x: r.pick([30, 46, 72]), y: r.pick([22, 88]), req: ['n1'] };
  return { seed, nodes, secret, done: [], skipped: [], secretFound: false, eggTaps: 0, n: 1 };
}

function getExp(p, world) {
  if (!p.expeditions[world]) p.expeditions[world] = makeExpedition(world, randomSeed(), p.settings.timed);
  return p.expeditions[world];
}

function available(exp, node) {
  if (exp.done.includes(node.id) || exp.skipped.includes(node.id)) return false;
  if (!node.req.length) return true;
  return node.any ? node.req.some((r) => exp.done.includes(r)) : node.req.every((r) => exp.done.includes(r));
}

function nodeLabel(type) { return { en: t('node_' + type) }; }

register('world', ({ world }) => {
  const p = S.profile;
  startMusic('calm');
  const exp = getExp(p, world);
  const allNodes = [...exp.nodes, ...(exp.secretFound ? [exp.secret] : [])];
  const current = [...exp.done].reverse().find((id) => allNodes.some((n) => n.id === id && n.id !== 's')) || null;
  const curNode = allNodes.find((n) => n.id === current) || { x: 3, y: 86 };
  const complete = exp.done.includes('n6');

  const path = exp.nodes.flatMap((n) => n.req.map((rid) => { const a = exp.nodes.find((x) => x.id === rid); return `<line x1="${a.x}" y1="${a.y}" x2="${n.x}" y2="${n.y}" class="${exp.skipped.includes(n.id) || exp.skipped.includes(a.id) ? 'skip' : exp.done.includes(n.id) ? 'walked' : ''}"/>`; })).join('');

  const node = el(`<div class="worldmap world-${world}">
    <div class="scene-bg">${sceneSVG(world)}</div>
    <button class="sun-egg" data-act="egg" aria-label="sun"></button>
    <header class="topbar"><button class="btn-icon" data-act="hub" aria-label="${t('back')}">←</button><h1>${t(world)}</h1><span class="pill">${t('expedition')} ${exp.n}</span></header>
    <div class="map">
      <svg class="map-path" viewBox="0 0 100 100" preserveAspectRatio="none">${path}</svg>
      ${!exp.secretFound ? `<button class="sparkle-spot" data-act="sparkle" style="left:${exp.secret.x}%;top:${exp.secret.y}%" aria-label="sparkle">✨</button>` : ''}
      ${allNodes.map((n) => {
    const done = exp.done.includes(n.id); const av = available(exp, n); const skip = exp.skipped.includes(n.id);
    return `<button class="mnode t-${n.type} ${done ? 'done' : ''} ${av ? 'avail' : ''} ${skip ? 'skip' : ''}" data-act="node" data-arg="${n.id}" style="left:${n.x}%;top:${n.y}%" ${av ? '' : 'disabled'} aria-label="${t('node_' + n.type)}">
        <span class="ni">${done ? '✔' : ICON[n.type]}</span><span class="nl">${t('node_' + n.type)}</span></button>`;
  }).join('')}
      <div class="map-hero" style="left:${curNode.x}%;top:${curNode.y}%">${heroSVG(p.avatar, { size: 54 })}</div>
    </div>
    <div class="map-foot">${complete ? `<div class="card pop"><b>🏆 ${t('expeditionDone')}</b> <button class="btn" data-act="newExp">${t('newExpedition')} ▶</button></div>` : `<div class="hint-bubble">${exp.done.includes('n2') && !exp.done.includes('a3') && !exp.done.includes('b3') ? t('branchPick') : t('chooseNode')}</div>`}</div>
  </div>`);

  const startNode = async (id) => {
    const n = allNodes.find((x) => x.id === id); if (!n || !available(exp, n)) return;
    const hero = $('.map-hero', node);
    hero.style.left = `${n.x}%`; hero.style.top = `${n.y}%`; sfx('whoosh');
    await sleep(reducedMotion() ? 50 : 650);
    if (n.type === 'event') { runEvent(world, exp, n); return; }
    const mode = n.type === 'secret' ? 'battle' : n.type;
    launchNode(world, exp, n, mode);
  };

  let sparkTaps = 0;
  bindActions(node, {
    hub: () => go('hub'),
    node: (id) => startNode(id),
    newExp: () => { const n2 = exp.n + 1; p.expeditions[world] = { ...makeExpedition(world, randomSeed(), p.settings.timed), n: n2 }; save(p); go('world', { world }, { replace: true }); },
    sparkle: (_, b) => {
      sparkTaps++; sfx('coin'); b.classList.add('wiggle'); setTimeout(() => b.classList.remove('wiggle'), 400);
      if (sparkTaps === 1) toast(t('sparkle'), 'info');
      if (sparkTaps >= 3) { exp.secretFound = true; save(p); const [x, y] = centerOf(b); burst(x, y, 24); toast(`✨ ${t('node_secret')}`, 'good'); setTimeout(() => go('world', { world }, { replace: true }), 700); }
    },
    egg: (_, b) => {
      exp.eggTaps = (exp.eggTaps || 0) + 1; sfx('tick');
      if (exp.eggTaps === 7) {
        const first = !p.stats.eggs; p.stats.eggs = (p.stats.eggs || 0) + 1; if (first) p.gems += 1;
        checkAchievements(p); save(p); confetti(80);
        toast(L({ en: 'You found a hidden Easter egg! 🥚 The sun says hi!', zh: '你發現了隱藏彩蛋！🥚 太陽跟你打招呼！' }) + (first ? ` +1 ${t('gems')}` : ''), 'good', 3000);
      }
    },
  });
  return node;
});

function nextNodeFor(exp, afterId) {
  const tmp = { ...exp, done: [...exp.done, afterId] };
  const cands = exp.nodes.filter((n) => available(tmp, n) && n.type !== 'event');
  return cands.length === 1 ? cands[0] : null;
}

export function launchNode(world, exp, n, mode) {
  const p = S.profile;
  const after = nextNodeFor(exp, n.id);
  go('mission', {
    world, mode, seed: randomSeed(), source: n.type === 'secret' ? 'secret' : 'expedition',
    returnTo: 'world', returnParams: { world },
    onComplete: () => {
      if (!exp.done.includes(n.id)) exp.done.push(n.id);
      if (n.branch && !exp.skipped.includes(n.branch)) exp.skipped.push(n.branch);
    },
    next: after ? { label: { en: t('node_' + after.type), zh: t('node_' + after.type) }, go: () => { const mode2 = after.type; launchNode(world, exp, after, mode2); } } : null,
  });
}

function runEvent(world, exp, n) {
  const p = S.profile;
  const r = makeRng(`${exp.seed}-event-${exp.n}`);
  const kind = r.pick(['fountain', 'lostpet', 'door', 'merchant']);
  const finishEvent = () => { if (!exp.done.includes(n.id)) exp.done.push(n.id); save(p); };
  if (kind === 'fountain') {
    const g = grantRewards(p, { coins: 20, gems: 1, petXp: 15 }); finishEvent();
    const m = modal(`<h2>⛲ ${L({ en: 'A magic fountain!', zh: '魔法噴泉！' })}</h2><p>${L({ en: 'You and your pet drink the sparkly water.', zh: '你和寵物喝了閃亮亮的泉水。' })}</p><p>+${g.coins} ${t('coins')} · +1 ${t('gems')} · 🐾 +${g.petXp}</p><button class="btn big">${t('continue')}</button>`, { onClose: () => go('world', { world }, { replace: true }) });
    sfx('chest'); $('button', m.box).addEventListener('click', m.close);
    return;
  }
  if (kind === 'lostpet') {
    const sp = randomUnownedPet(p, r, ['common', 'rare']);
    const m = modal(`<h2>🐾 ${L({ en: 'A lost creature!', zh: '迷路的小生物！' })}</h2>${sp ? petSVG(sp, 0, { size: 120, mood: 'sad' }) : ''}<p>${L({ en: 'It looks lost. Solve a puzzle to help it home — maybe it will join you!', zh: '牠好像迷路了。解開謎題帶牠回家，說不定牠會加入你！' })}</p><button class="btn big">${t('play')}</button>`);
    $('button', m.box).addEventListener('click', () => {
      m.close();
      go('mission', {
        world, mode: 'puzzle', seed: randomSeed(), source: 'event', returnTo: 'world', returnParams: { world },
        onComplete: () => { finishEvent(); if (sp) { addPet(p, sp); toast(t('newPet', { p: petName(sp, 0, getLang()) }), 'good', 3000); } },
      });
    });
    return;
  }
  if (kind === 'door') {
    const m = modal(`<h2>🚪 ${L({ en: 'A mysterious door', zh: '神秘的門' })}</h2><p>${L({ en: 'It whispers: "Defeat my guardian and I will show you a secret path."', zh: '門輕聲說：「打敗我的守衛，我就告訴你秘密小路。」' })}</p><button class="btn big">${t('attack')}</button>`);
    $('button', m.box).addEventListener('click', () => {
      m.close();
      go('mission', {
        world, mode: 'battle', seed: randomSeed(), source: 'event', returnTo: 'world', returnParams: { world },
        onComplete: () => { finishEvent(); exp.secretFound = true; },
      });
    });
    return;
  }
  // merchant: trade coins for a treasure hunt with a guaranteed chest
  const m = modal(`<h2>🦉 ${L({ en: 'Professor Hoot the traveling merchant', zh: '旅行商人貓頭鷹博士' })}</h2><p>${L({ en: '"I have a treasure map! Solve my riddles and the treasure is yours."', zh: '「我有一張藏寶圖！解開我的謎題，寶藏就是你的。」' })}</p><button class="btn big">${t('node_treasure')} ▶</button>`);
  $('button', m.box).addEventListener('click', () => {
    m.close();
    go('mission', { world, mode: 'treasure', seed: randomSeed(), source: 'event', returnTo: 'world', returnParams: { world }, onComplete: finishEvent });
  });
}
