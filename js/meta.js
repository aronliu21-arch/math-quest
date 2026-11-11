// Pets, collection, shop, home building and daily mystery missions.
import { register, go, refresh } from './router.js';
import { S, save, addPet, randomUnownedPet, checkAchievements, rollChest, ensureDaily, grantRewards, skillLevel } from './state.js';
import { t, L, getLang } from './i18n.js';
import { el, $, $$, bindActions, toast, modal, burst, confetti, centerOf, progressBar, esc, rich } from './ui.js';
import { heroSVG, petSVG, petName, PETS, sceneSVG, itemSVG, decorSVG, chestSVG, pieSVG } from './art.js';
import { sfx } from './audio.js';
import { COSTUMES, EQUIPMENT, DECOR_ITEMS, ACHIEVEMENTS, PET_XP_FOR_LEVEL, EVOLVE_AT } from './content.js';
import { makeRng, randomSeed } from '../shared/rng.js';
import { gcd } from '../shared/fraction.js';
import { lootHTML } from './mission.js';
import { today } from './adaptive.js';

const header = (title) => `<header class="topbar"><button class="btn-icon" data-act="back" aria-label="${t('back')}">←</button><h1>${title}</h1>
  <span class="cur">${itemSVG('coin', 22)} ${S.profile.coins} ${itemSVG('gemIcon', 22)} ${S.profile.gems}</span></header>`;

// ---------------- pets ----------------
register('pets', () => {
  const p = S.profile;
  const node = el(`<div class="meta-screen pets-screen"><div class="scene-bg">${sceneSVG('forest')}</div>${header(t('pets'))}
    <div class="pet-grid">${Object.keys(PETS).map((k) => {
    const own = p.pets[k];
    return `<button class="pet-card card ${own ? '' : 'unknown'} ${p.activePet === k ? 'active' : ''}" data-act="pet" data-arg="${k}">
        ${petSVG(k, own ? own.stage : 0, { size: 96, silhouette: !own })}
        <b>${own ? petName(k, own.stage, getLang()) : t('notFound')}</b>
        <span class="tag ${PETS[k].rarity}">${t('rarity_' + PETS[k].rarity)}</span>
        ${own ? `<span class="small">${t('level')} ${own.lv}</span>${progressBar(own.xp / PET_XP_FOR_LEVEL(own.lv))}` : ''}
        ${p.activePet === k ? `<span class="active-tag">⭐ ${t('activePet')}</span>` : ''}</button>`;
  }).join('')}</div></div>`);
  bindActions(node, {
    back: () => go('hub'),
    pet: (k) => {
      const own = p.pets[k]; if (!own) { sfx('gentle'); toast(L({ en: 'Keep exploring to find this pet!', zh: '繼續冒險就能找到這隻寵物！' }), 'info'); return; }
      const next = own.stage < 2 ? t('evolvesAt', { n: EVOLVE_AT[own.stage] }) : '✨ MAX';
      const m = modal(`<div class="pet-detail">${[0, 1, 2].map((s) => `<div class="evo ${s <= own.stage ? '' : 'dim'}">${petSVG(k, s, { size: s === own.stage ? 130 : 70, silhouette: s > own.stage })}<span>${s <= own.stage ? petName(k, s, getLang()) : '?'}</span></div>`).join('<span class="arrow">➜</span>')}</div>
        <p>${t('level')} ${own.lv} · ${next}</p>
        ${p.activePet === k ? `<p>⭐ ${t('activePet')}</p>` : `<button class="btn big" data-x="active">${t('setActive')}</button>`}`);
      m.box.addEventListener('click', (e) => { if (e.target.closest('[data-x="active"]')) { p.activePet = k; save(p); sfx('join'); m.close(); refresh(); } });
    },
  });
  return node;
});

// ---------------- collection ----------------
register('collection', ({ tab = 'costumes' } = {}) => {
  const p = S.profile;
  const tabs = ['costumes', 'equipment', 'achievements'];
  let body = '';
  if (tab === 'costumes') {
    const owned = Object.keys(p.owned.costumes);
    body = owned.length ? `<div class="item-grid">${owned.map((k) => {
      const c = COSTUMES[k]; const on = (c.kind === 'hat' ? p.avatar.hat : p.avatar.cape) === k;
      return `<button class="item-card card ${on ? 'on' : ''}" data-act="wear" data-arg="${k}">${heroSVG({ ...p.avatar, [c.kind]: k }, { size: 70 })}<b>${L(c.name)}</b><span class="small">${on ? t('equipped') : t('equip')}</span></button>`;
    }).join('')}</div>` : `<p class="empty">${L({ en: 'Win treasure chests or visit the shop to get costumes!', zh: '打開寶箱或去商店就能得到服裝！' })}</p>`;
  } else if (tab === 'equipment') {
    const owned = Object.keys(p.owned.equipment);
    body = owned.length ? `<div class="item-grid">${owned.map((k) => {
      const c = EQUIPMENT[k]; const on = p.avatar.held === k;
      return `<button class="item-card card ${on ? 'on' : ''}" data-act="hold" data-arg="${k}">${heroSVG({ ...p.avatar, held: k }, { size: 70 })}<b>${L(c.name)}</b><span class="small">${L(c.perk)}</span><span class="small">${on ? t('equipped') : t('equip')}</span></button>`;
    }).join('')}</div>` : `<p class="empty">${L({ en: 'Find equipment in chests or the shop!', zh: '在寶箱或商店可以找到裝備！' })}</p>`;
  } else {
    body = `<div class="ach-list">${ACHIEVEMENTS.map((a) => `<div class="ach card ${p.achievements[a.id] ? 'got' : ''}"><span class="medal">${p.achievements[a.id] ? '🏅' : '🔒'}</span><div><b>${L(a.name)}</b><div class="small">${L(a.desc)}</div></div></div>`).join('')}</div>`;
  }
  const node = el(`<div class="meta-screen"><div class="scene-bg">${sceneSVG('kingdom')}</div>${header(t('collection'))}
    <div class="collection-top card">${heroSVG(p.avatar, { size: 120, glow: true })}<div class="name-badge">${esc(p.name)}</div></div>
    <div class="tabs">${tabs.map((x) => `<button class="tab ${x === tab ? 'on' : ''}" data-act="tab" data-arg="${x}">${t(x)}</button>`).join('')}</div>
    ${body}</div>`);
  bindActions(node, {
    back: () => go('hub'),
    tab: (x) => go('collection', { tab: x }, { replace: true }),
    wear: (k) => { const kind = COSTUMES[k].kind; p.avatar[kind] = p.avatar[kind] === k ? null : k; save(p); refresh(); },
    hold: (k) => { p.avatar.held = p.avatar.held === k ? null : k; save(p); refresh(); },
  });
  return node;
});

// ---------------- shop ----------------
const priceHTML = (pr) => (pr.gems ? `${itemSVG('gemIcon', 20)} ${pr.gems}` : `${itemSVG('coin', 20)} ${pr.coins}`);
function canAfford(p, pr) { return pr.gems ? p.gems >= pr.gems : p.coins >= pr.coins; }
function pay(p, pr) { if (pr.gems) p.gems -= pr.gems; else p.coins -= pr.coins; }

register('shop', ({ tab = 'costumes' } = {}) => {
  const p = S.profile;
  const tabs = ['costumes', 'equipment', 'decorations', 'pets'];
  let items = [];
  if (tab === 'costumes') items = Object.entries(COSTUMES).map(([k, c]) => ({ k, name: c.name, price: c.price, owned: !!p.owned.costumes[k], art: heroSVG({ ...p.avatar, [c.kind]: k }, { size: 64 }) }));
  if (tab === 'equipment') items = Object.entries(EQUIPMENT).map(([k, c]) => ({ k, name: c.name, price: c.price, owned: !!p.owned.equipment[k], art: heroSVG({ ...p.avatar, held: k }, { size: 64 }), perk: c.perk }));
  if (tab === 'decorations') items = Object.entries(DECOR_ITEMS).map(([k, c]) => ({ k, name: c.name, price: c.price, owned: false, count: p.owned.decor[k] || 0, art: decorSVG(k, 56) }));
  if (tab === 'pets') items = [{ k: 'egg', name: { en: t('petEgg'), zh: t('petEgg') }, price: { coins: 150 }, owned: false, art: '<div class="egg">🥚</div>' }];
  const node = el(`<div class="meta-screen"><div class="scene-bg">${sceneSVG('village')}</div>${header(t('shop'))}
    <div class="tabs">${tabs.map((x) => `<button class="tab ${x === tab ? 'on' : ''}" data-act="tab" data-arg="${x}">${x === 'pets' ? t('pets') : t(x)}</button>`).join('')}</div>
    <div class="item-grid">${items.map((it) => `<div class="item-card card ${it.owned ? 'on' : ''}">${it.art}<b>${L(it.name)}</b>${it.perk ? `<span class="small">${L(it.perk)}</span>` : ''}${it.count ? `<span class="small">× ${it.count}</span>` : ''}
      ${it.owned ? `<span class="small">✔ ${t('owned')}</span>` : `<button class="btn small" data-act="buy" data-arg="${it.k}">${priceHTML(it.price)}</button>`}</div>`).join('')}</div>
    <p class="small note">${t('shopNote')}</p></div>`);
  bindActions(node, {
    back: () => go('hub'),
    tab: (x) => go('shop', { tab: x }, { replace: true }),
    buy: (k, b) => {
      const it = items.find((x) => x.k === k);
      if (!canAfford(p, it.price)) { sfx('gentle'); toast(t('notEnough'), 'info'); return; }
      if (tab === 'pets') {
        const r = makeRng(randomSeed());
        const sp = randomUnownedPet(p, r, r.chance(0.25) ? ['rare'] : ['common', 'rare']);
        if (!sp) { toast(L({ en: 'You already have every pet from eggs!', zh: '蛋裡的寵物你都有了！' }), 'info'); return; }
        pay(p, it.price); addPet(p, sp); checkAchievements(p); save(p); sfx('chest');
        const m = modal(`<h2>🐣 ${t('newPet', { p: petName(sp, 0, getLang()) })}</h2>${petSVG(sp, 0, { size: 150 })}<span class="tag ${PETS[sp].rarity}">${t('rarity_' + PETS[sp].rarity)}</span><button class="btn big">${t('ok')}</button>`, { onClose: refresh });
        $('button', m.box).addEventListener('click', m.close); confetti();
        return;
      }
      pay(p, it.price);
      if (tab === 'costumes') p.owned.costumes[k] = Date.now();
      if (tab === 'equipment') p.owned.equipment[k] = Date.now();
      if (tab === 'decorations') p.owned.decor[k] = (p.owned.decor[k] || 0) + 1;
      save(p); sfx('coin'); const [x, y] = centerOf(b); burst(x, y);
      setTimeout(refresh, 350);
    },
  });
  return node;
});

// ---------------- home builder ----------------
register('home', () => {
  const p = S.profile;
  const tiles = p.home.tiles;
  let brush = null; let erase = false;
  const placedCount = (k) => tiles.filter((x) => x === k).length;
  const node = el(`<div class="meta-screen home-screen"><div class="scene-bg">${sceneSVG('village')}</div>${header(t('homeTitle', { n: esc(p.name) }))}
    <div class="home-wrap"><div class="yard"></div><div class="palette card"></div></div>
    <div class="row gap center"><button class="btn" data-act="challenge">🌷 ${t('builderChallenge')}</button></div></div>`);
  const draw = () => {
    $('.yard', node).innerHTML = tiles.map((k, i) => `<button class="tile" data-act="tile" data-arg="${i}">${k ? decorSVG(k, 42) : ''}</button>`).join('') + `<div class="yard-hero">${heroSVG(p.avatar, { size: 44 })}${petSVG(p.activePet, p.pets[p.activePet].stage, { size: 40 })}</div>`;
    const owned = Object.entries(p.owned.decor).filter(([, n]) => n > 0);
    $('.palette', node).innerHTML = `<div class="small">${brush || erase ? (erase ? t('eraseMode') : t('placeMode')) : ''}</div>${owned.length ? owned.map(([k, n]) => `<button class="pal ${brush === k ? 'on' : ''}" data-act="brush" data-arg="${k}">${decorSVG(k, 36)}<i>${n - placedCount(k)}</i></button>`).join('') : `<p class="small">${t('emptyPalette')}</p>`}
      <button class="pal ${erase ? 'on' : ''}" data-act="erase">🧽</button>`;
  };
  draw();
  bindActions(node, {
    back: () => go('hub'),
    brush: (k) => { brush = brush === k ? null : k; erase = false; draw(); },
    erase: () => { erase = !erase; brush = null; draw(); },
    tile: (i) => {
      i = +i;
      if (erase) { tiles[i] = null; sfx('whoosh'); }
      else if (brush) {
        if (tiles[i] === brush) tiles[i] = null;
        else if ((p.owned.decor[brush] || 0) - placedCount(brush) > 0) { tiles[i] = brush; sfx('drop'); }
        else { toast(t('notEnough'), 'info'); return; }
      } else return;
      checkAchievements(p); save(p); draw();
    },
    challenge: () => builderChallenge(p),
  });
  return node;
});

// Builder challenge: make a fraction of the flowerbed bloom (equivalence in action).
function builderChallenge(p) {
  const r = makeRng(randomSeed());
  const lv = skillLevel(p, 'frac');
  const d = lv === 1 ? r.pick([2, 3, 4]) : r.pick([2, 3, 4, 5, 6]);
  let n = r.int(1, d - 1); while (lv > 1 && gcd(n, d) !== 1) n = r.int(1, d - 1);
  const k = lv === 1 ? 1 : r.int(2, 3); const D = d * k;
  const bed = Array(D).fill(false);
  let tries = 0;
  const m = modal(`<h2>🌷 ${t('builderChallenge')}</h2><p>${rich(t('builderPrompt', { n, d }))}</p><div class="bed"></div><div class="fb"></div>
    <button class="btn big" data-x="check">${t('builderCheck')}</button>`);
  const drawBed = () => { $('.bed', m.box).innerHTML = bed.map((on, i) => `<button class="bed-tile ${on ? 'on' : ''}" data-i="${i}">${on ? decorSVG('flower', 38) : ''}</button>`).join(''); };
  drawBed();
  m.box.addEventListener('click', (e) => {
    const b = e.target.closest('.bed-tile'); if (b) { const i = +b.dataset.i; bed[i] = !bed[i]; sfx('drop'); drawBed(); return; }
    if (e.target.closest('[data-x="check"]')) {
      const c = bed.filter(Boolean).length;
      if (c * d === n * D) {
        const g = grantRewards(p, { coins: 25, xp: 15 }); p.owned.decor.flower = (p.owned.decor.flower || 0) + 2;
        save(p); sfx('correct'); confetti();
        $('.fb', m.box).innerHTML = `<div class="praise">🌟 ${t('correct')} ${rich(`[${c}/${D}] = [${n}/${d}]`)}<br>+${g.coins} ${t('coins')} · +2 🌸</div>`;
        $('[data-x="check"]', m.box).remove();
      } else {
        tries++; sfx('gentle');
        $('.fb', m.box).innerHTML = `<div class="encourage">💪 ${t('tryAgain')} ${tries >= 1 ? `<div class="small">${L({ en: `The bed has ${D} spots. Split it into ${d} equal groups of ${k}, then fill ${n} group${n > 1 ? 's' : ''}.`, zh: `花圃有 ${D} 格，分成 ${d} 組、每組 ${k} 格，再種滿 ${n} 組。` })}</div>` : ''}</div>`;
      }
    }
  });
}

// ---------------- daily mystery ----------------
register('daily', () => {
  const p = S.profile;
  const d = ensureDaily(p);
  const allDone = d.missions.every((m) => m.done);
  const twistName = { double_coins: { en: 'Double coins!', zh: '金幣加倍！' }, gem_hunt: { en: 'Gem hunt!', zh: '寶石大搜索！' }, pet_party: { en: 'Pet party: double pet XP!', zh: '寵物派對：寵物經驗加倍！' } };
  const node = el(`<div class="meta-screen"><div class="scene-bg">${sceneSVG('legend')}</div>${header(t('dailyTitle'))}
    <p class="lead card">${t('dailyText')}</p>
    <div class="daily-list">${d.missions.map((m, i) => `<button class="daily-card card ${m.done ? 'done' : ''}" data-act="play" data-arg="${i}" ${m.done ? 'disabled' : ''}>
      <span class="dn">${m.done ? '✔' : '❓'}</span><div><b>${t(m.world)} · ${t('node_' + m.mode)}</b><div class="small">✨ ${L(twistName[m.twist])}</div></div></button>`).join('')}</div>
    <div class="mystery card">${allDone ? (d.boxOpened ? `<p>${t('dailyDone')}</p>` : `<button class="chest-btn" data-act="box">${chestSVG(false, 120, '#7048e8')}<div>${t('mysteryBox')} — ${t('tapChest')}</div></button>`) : `${chestSVG(false, 90, '#868e96')}<div class="small">${t('mysteryBox')} 🔒</div>`}</div>
  </div>`);
  bindActions(node, {
    back: () => go('hub'),
    play: (i) => {
      const m = d.missions[+i];
      go('mission', {
        world: m.world, mode: m.mode, seed: m.seed, source: 'daily', daily: m, returnTo: 'daily', returnParams: {},
        backLabel: { en: 'Back to Daily Mystery', zh: '回到每日任務' },
        onComplete: () => { m.done = true; if (d.missions.every((x) => x.done)) p.daily.done[today()] = true; checkAchievements(p); },
      });
    },
    box: (_, b) => {
      d.boxOpened = true;
      const r = makeRng(randomSeed());
      const loot = rollChest(p, r, 2); p.gems += 3;
      checkAchievements(p); save(p); sfx('chest'); confetti();
      b.innerHTML = `${chestSVG(true, 120, '#7048e8')}<div class="loot">${lootHTML(loot)} · +3 ${t('gems')}</div>`;
    },
  });
  return node;
});
