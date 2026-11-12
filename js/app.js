// Boot + main screens: title, profiles, hero creation, hub, settings.
import { register, go, refresh } from './router.js';
import { S, loadProfiles, newProfile, save, selectProfile, applySettings, worldUnlocked, skillLevel, ensureDaily } from './state.js';
import * as db from './db.js';
import { t, L, setLang, getLang } from './i18n.js';
import { el, $, $$, bindActions, toast, modal, progressBar, esc, langToggleHTML, confetti } from './ui.js';
import { heroSVG, petSVG, petName, sceneSVG, itemSVG, HAIR_STYLES, HAIR_COLORS, SKINS, OUTFITS, BADGES, STARTER_PETS, PETS } from './art.js';
import { initAudio, startMusic, stopMusic, sfx } from './audio.js';
import { NAME_IDEAS, XP_FOR_LEVEL } from './content.js';
import { levelOf, skillMastery } from './adaptive.js';
import { parentGate } from './parent.js';
import './mission.js';
import './world.js';
import './meta.js';
import './parent.js';
import './mp.js';
import './little.js';

// ---------------- title ----------------
register('title', () => {
  const heroes = S.profiles.slice(0, 3);
  const node = el(`<div class="title-screen">
    <div class="scene-bg">${sceneSVG('menu')}</div>
    <div class="rays"></div>
    <div class="title-cast">
      ${heroes.length ? heroes.map((p, i) => `<div class="cast c${i}">${heroSVG(p.avatar, { size: 110 })}<span class="name-badge" style="background:${p.avatar.badge}">${esc(p.name)}</span></div>`).join('')
    : `<div class="cast c0">${heroSVG({ hair: 'ponytail', hairColor: '#1b1b1f', outfit: '#1c7ed6', number: '' }, { size: 110 })}</div><div class="cast c1">${heroSVG({ hair: 'spiky', hairColor: '#1b1b1f', outfit: '#1c7ed6', number: '' }, { size: 110 })}</div>`}
      <div class="cast pet1">${petSVG('fracto', 1, { size: 90 })}</div><div class="cast pet2">${petSVG('divi', 0, { size: 80 })}</div>
    </div>
    <div class="logo"><div class="logo-main">MATH QUEST</div><div class="logo-zh">數學大冒險</div><div class="logo-sub">${t('subtitle')}</div></div>
    <button class="btn huge start-btn" data-act="start">${t('tapToStart')}</button>
    <div class="title-foot">${langToggleHTML()}</div>
  </div>`);
  bindActions(node, {
    start: () => { initAudio(); startMusic('menu'); go('profiles'); },
    toggleLang: () => { setLang(getLang() === 'zh' ? 'en' : 'zh'); db.setMeta('uiLang', getLang()); refresh(); },
  });
  // tapping anywhere during the intro animation also starts
  node.addEventListener('click', (e) => { if (!e.target.closest('button')) { initAudio(); startMusic('menu'); go('profiles'); } });
  return node;
});

// ---------------- profiles ----------------
register('profiles', () => {
  const node = el(`<div class="profiles-screen">
    <div class="scene-bg">${sceneSVG('menu')}</div>
    <header class="topbar"><h1>${t('whoPlays')}</h1>${langToggleHTML()}</header>
    <div class="profile-grid">
      ${S.profiles.map((p) => `<button class="profile-card card" data-act="pick" data-arg="${p.id}" style="--badge:${p.avatar.badge}">
        ${heroSVG(p.avatar, { size: 96 })}<div class="name-badge">${esc(p.name)}</div><div class="small">${t('level')} ${p.level} · ${petName(p.activePet, p.pets[p.activePet]?.stage || 0, getLang())}</div></button>`).join('')}
      <button class="profile-card card new" data-act="new"><span class="plus">＋</span><div>${t('newHero')}</div></button>
    </div>
    <div class="row gap center foot-row">
      <button class="btn ghost" data-act="parents">👪 ${t('parents')}</button>
      <button class="btn ghost" data-act="reset">♻️ ${t('resetRecords')}</button>
      <button class="btn ghost" data-act="team">🌐 ${t('team')}</button>
    </div>
    ${!db.persistent ? `<div class="warn">${t('storageWarning')}</div>` : ''}
  </div>`);
  bindActions(node, {
    pick: async (id) => { const p = S.profiles.find((x) => x.id === id); await selectProfile(p); go(p.style === 'little' ? 'little' : 'hub'); },
    new: () => go('create'),
    parents: () => parentGate(() => go('parent')),
    reset: () => parentGate(() => go('parent', { tab: 'reset' })),
    team: () => { if (!S.profile && S.profiles.length) { toast(t('whoPlays'), 'info'); return; } if (!S.profiles.length) { go('create'); return; } go('mp'); },
    toggleLang: () => { setLang(getLang() === 'zh' ? 'en' : 'zh'); db.setMeta('uiLang', getLang()); refresh(); },
  });
  return node;
});

// ---------------- create hero ----------------
// Two ready-made looks (bold retro style). Names are typed on the device and never stored in the code.
// 'older': harder rules (hints only on request, no auto read-aloud). 'younger': auto hints + read-aloud.
const PRESETS = {
  ponytail9: { avatar: { hair: 'ponytail', hairColor: '#1b1b1f', skin: SKINS[1], outfit: '#1c7ed6', badge: '#7048e8', number: 9 }, style: 'older', startDiv: 2, startFrac: 1 },
  spiky6: { avatar: { hair: 'spiky', hairColor: '#1b1b1f', skin: SKINS[1], outfit: '#1c7ed6', badge: '#f76707', number: 6 }, style: 'younger', startDiv: 1, startFrac: 1 },
  // Little Explorer (age 3): dinosaur mode — counting, sharing, halves; voice-first
  dino3: { avatar: { hair: 'short', hairColor: '#1b1b1f', skin: SKINS[1], outfit: '#1c7ed6', badge: '#2f9e44', number: 3, hat: 'dino' }, style: 'little', startDiv: 1, startFrac: 1 },
};
register('create', () => {
  const draft = { name: '', avatar: { hair: 'short', hairColor: HAIR_COLORS[0], skin: SKINS[1], outfit: '#1c7ed6', badge: BADGES[0], number: '' }, pet: null, lang: getLang(), startDiv: 1, startFrac: 1 };
  let step = 0;
  const node = el(`<div class="create-screen"><div class="scene-bg">${sceneSVG('menu')}</div><div class="create card"></div></div>`);
  const box = $('.create', node);
  const swatches = (key, list) => `<div class="swatches">${list.map((c) => `<button class="sw ${draft.avatar[key] === c ? 'on' : ''}" data-act="set" data-arg="${key}|${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>`;
  const draw = () => {
    let body = '';
    if (step === 0) {
      body = `<h2>${t('heroName')}</h2>
        <input class="name-input" maxlength="20" placeholder="${t('typeName')}" value="${esc(draft.name)}" autocomplete="off">
        <p class="small">${t('orPickName')}</p>
        <div class="chips">${NAME_IDEAS.map((n) => `<button class="chip" data-act="name" data-arg="${esc(L(n))}">${esc(L(n))}</button>`).join('')}</div>
        <div class="row gap center"><button class="chip" data-act="lang" data-arg="en">English</button><button class="chip" data-act="lang" data-arg="zh">繁體中文</button></div>`;
    } else if (step === 1) {
      body = `<h2>${t('designHero')}</h2>
        <div class="designer"><div class="preview">${heroSVG(draft.avatar, { size: 150, glow: true })}<div class="name-badge" style="background:${draft.avatar.badge}">${esc(draft.name)}</div></div>
        <div class="opts">
          <div class="opt"><b>${L({ en: 'Quick look', zh: '快速造型' })}</b><div class="hair-row">${Object.entries(PRESETS).map(([k, v]) => `<button class="hair-btn preset ${draft.preset === k ? 'on' : ''}" data-act="preset" data-arg="${k}" aria-label="${k}">${heroSVG(v.avatar, { size: 44 })}<span class="small">${v.style === 'little' ? '🦖' : ''}#${v.avatar.number}</span></button>`).join('')}</div></div>
          <div class="opt"><b>${t('hair')}</b><div class="hair-row">${HAIR_STYLES.map((h) => `<button class="hair-btn ${draft.avatar.hair === h ? 'on' : ''}" data-act="set" data-arg="hair|${h}">${heroSVG({ ...draft.avatar, hair: h }, { size: 44 })}</button>`).join('')}</div></div>
          <div class="opt"><b>${t('hairColor')}</b>${swatches('hairColor', HAIR_COLORS)}</div>
          <div class="opt"><b>${t('skin')}</b>${swatches('skin', SKINS)}</div>
          <div class="opt"><b>${t('outfit')}</b>${swatches('outfit', OUTFITS)}</div>
          <div class="opt"><b>${t('badgeColor')}</b>${swatches('badge', BADGES)}</div>
          <div class="opt"><b>#</b><div class="chips">${['', 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="chip small ${String(draft.avatar.number) === String(n) ? 'on' : ''}" data-act="set" data-arg="number|${n}">${n === '' ? '–' : n}</button>`).join('')}</div></div>
        </div></div>`;
    } else if (step === 2) {
      body = `<h2>${t('pickPet')}</h2><div class="pet-pick">${STARTER_PETS.map((s) => `<button class="pet-card card ${draft.pet === s ? 'on' : ''}" data-act="pet" data-arg="${s}">${petSVG(s, 0, { size: 110 })}<b>${petName(s, 0, getLang())}</b></button>`).join('')}</div>`;
    } else {
      const lvBtns = (k) => [1, 2, 3].map((n) => `<button class="chip ${draft[k] === n ? 'on' : ''}" data-act="lvl" data-arg="${k}|${n}">${t(['beginner', 'intermediate', 'advanced'][n - 1])}</button>`).join('');
      body = `<h2>${t('startLevels')}</h2>
        <div class="lv-row"><b>➗ ${t('division')}</b><div class="chips">${lvBtns('startDiv')}</div></div>
        <div class="lv-row"><b>🍕 ${t('fractions')}</b><div class="chips">${lvBtns('startFrac')}</div></div>
        <p class="small">${t('startLevelsHelp')}</p>`;
    }
    const canNext = (step === 0 && draft.name.trim()) || step === 1 || (step === 2 && draft.pet) || step === 3;
    box.innerHTML = `<div class="steps-dots">${[0, 1, 2, 3].map((i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>${body}
      <div class="row gap between"><button class="btn ghost" data-act="prev">${t('back')}</button>
      <button class="btn big" data-act="next" ${canNext ? '' : 'disabled'}>${step === 3 || (step === 2 && draft.style === 'little') ? t('letsGo') : t('next')} ▶</button></div>`;
    const inp = $('.name-input', box);
    if (inp) inp.addEventListener('input', () => { draft.name = inp.value; $('[data-act="next"]', box).disabled = !draft.name.trim(); });
  };
  draw();
  bindActions(node, {
    name: (n) => { draft.name = n; draw(); },
    lang: (l) => { draft.lang = l; setLang(l); draw(); },
    preset: (k) => { const v = PRESETS[k]; draft.preset = k; draft.avatar = { ...draft.avatar, hat: null, ...v.avatar }; draft.style = v.style; draft.startDiv = v.startDiv; draft.startFrac = v.startFrac; draw(); },
    set: (arg) => { const [k, v] = arg.split('|'); draft.avatar[k] = k === 'number' ? (v === '' ? '' : +v) : v; draw(); },
    pet: (s) => { draft.pet = s; draw(); },
    lvl: (arg) => { const [k, v] = arg.split('|'); draft[k] = +v; draw(); },
    prev: () => { if (step === 0) go('profiles'); else { step--; draw(); } },
    next: async () => {
      if (step < 3 && !(step === 2 && draft.style === 'little')) { step++; draw(); return; }
      const p = newProfile({ name: draft.name.trim(), avatar: draft.avatar, pet: draft.pet, lang: draft.lang, startDiv: draft.startDiv, startFrac: draft.startFrac, style: draft.style });
      await save(p); await selectProfile(p); confetti(); sfx('levelup');
      go(p.style === 'little' ? 'little' : 'hub');
    },
  });
  return node;
});

// ---------------- hub ----------------
const WORLDS = ['village', 'forest', 'kingdom', 'legend'];
register('hub', () => {
  const p = S.profile;
  if (!p || p.style === 'little') { setTimeout(() => go(p ? 'little' : 'profiles', {}, { replace: true }), 0); return el('<div></div>'); }
  applySettings(p); startMusic('menu');
  const daily = ensureDaily(p); save(p);
  const dailyLeft = daily.missions.filter((m) => !m.done).length;
  const lvName = (s) => t(['beginner', 'intermediate', 'advanced'][skillLevel(p, s) - 1]);
  const node = el(`<div class="hub">
    <div class="scene-bg">${sceneSVG('menu')}</div>
    <header class="hud card">
      <button class="hud-hero" data-act="collection">${heroSVG(p.avatar, { size: 46 })}</button>
      <div class="hud-main"><div class="hud-name"><span class="name-badge">${esc(p.name)}</span> ${t('level')} ${p.level}</div>${progressBar(p.xp / XP_FOR_LEVEL(p.level), 'xp')}</div>
      <div class="hud-cur"><span>${itemSVG('coin', 24)} ${p.coins}</span><span>${itemSVG('gemIcon', 24)} ${p.gems}</span></div>
      <button class="btn-icon" data-act="settings" aria-label="${t('settings')}">⚙️</button>
    </header>
    <div class="skills card"><span>➗ ${t('division')}: <b>${lvName('div')}</b></span>${progressBar(skillMastery(p.learning, 'div'), 'sk')}<span>🍕 ${t('fractions')}: <b>${lvName('frac')}</b></span>${progressBar(skillMastery(p.learning, 'frac'), 'sk')}</div>
    <div class="worlds">${WORLDS.map((w) => {
    const open = worldUnlocked(p, w);
    return `<button class="world-card card w-${w} ${open ? '' : 'locked'}" data-act="world" data-arg="${w}">
        <div class="wc-art">${sceneSVG(w)}</div>
        <div class="wc-txt"><b>${t(w)}</b><span>${open ? t(w + 'Desc') : '🔒 ' + (w === 'legend' ? t('unlockLegend', { n: 8 }) : t('unlockAt', { n: 3 }))}</span></div></button>`;
  }).join('')}</div>
    <nav class="hub-nav">
      <button class="nav-btn" data-act="daily">🎁<span>${t('daily')}</span>${dailyLeft ? `<i class="badge-n">${dailyLeft}</i>` : ''}</button>
      <button class="nav-btn" data-act="pets">🐾<span>${t('pets')}</span></button>
      <button class="nav-btn" data-act="home">🏠<span>${t('home')}</span></button>
      <button class="nav-btn" data-act="collection">🎒<span>${t('collection')}</span></button>
      <button class="nav-btn" data-act="shop">🛒<span>${t('shop')}</span></button>
      <button class="nav-btn" data-act="team">🌐<span>${t('team')}</span></button>
    </nav>
    <div class="buddy"><div class="hero-wrap">${heroSVG(p.avatar, { size: 120, glow: true })}<span class="name-badge">${esc(p.name)}</span></div>${petSVG(p.activePet, p.pets[p.activePet].stage, { size: 96 })}</div>
  </div>`);
  bindActions(node, {
    world: (w) => { if (!worldUnlocked(p, w)) { sfx('gentle'); toast(w === 'legend' ? t('unlockLegend', { n: 8 }) : t('unlockAt', { n: 3 }), 'info'); return; } go('world', { world: w }); },
    settings: () => go('settings'),
    daily: () => go('daily'), pets: () => go('pets'), home: () => go('home'), collection: () => go('collection'), shop: () => go('shop'), team: () => go('mp'),
  });
  return node;
});

// ---------------- settings ----------------
register('settings', () => {
  const p = S.profile;
  const s = p.settings;
  const node = el(`<div class="settings-screen"><div class="scene-bg">${sceneSVG('menu')}</div><div class="card panel">
    <header class="row between"><button class="btn-icon" data-act="back">←</button><h2>${t('settings')}</h2><span></span></header>
    <div class="set-row"><b>${t('language')}</b><div class="chips"><button class="chip ${s.lang === 'en' ? 'on' : ''}" data-act="lang" data-arg="en">English</button><button class="chip ${s.lang === 'zh' ? 'on' : ''}" data-act="lang" data-arg="zh">繁體中文</button></div></div>
    <label class="toggle"><input type="checkbox" data-k="zhuyin" ${s.zhuyin ? 'checked' : ''}> ${t('zhuyin')} <span class="zy-sample">注音</span></label>
    <label class="toggle"><input type="checkbox" data-k="sound" ${s.sound ? 'checked' : ''}> ${t('sound')}</label>
    <label class="toggle"><input type="checkbox" data-k="music" ${s.music ? 'checked' : ''}> ${t('music')}</label>
    <label class="toggle"><input type="checkbox" data-k="narration" ${s.narration ? 'checked' : ''}> ${t('narration')}</label>
    <p class="small">${t('deviceNote')}</p>
    <div class="row gap wrap"><button class="btn ghost" data-act="switch">👥 ${t('switchHero')}</button><button class="btn ghost" data-act="parents">👪 ${t('parents')}</button><button class="btn ghost" data-act="reset">♻️ ${t('resetRecords')}</button></div>
  </div></div>`);
  node.addEventListener('change', (e) => { const k = e.target.dataset.k; if (k) { s[k] = e.target.checked; applySettings(p); save(p); if (k === 'music' && s.music) startMusic('menu'); } });
  bindActions(node, {
    back: () => go('hub'),
    lang: (l) => { s.lang = l; applySettings(p); save(p); refresh(); },
    switch: () => go('profiles'),
    parents: () => parentGate(() => go('parent', { pid: p.id })),
    reset: () => parentGate(() => go('parent', { tab: 'reset' })),
  });
  return node;
});

// ---------------- boot ----------------
async function boot() {
  await db.ready();
  db.requestPersist();
  setLang((await db.getMeta('uiLang')) || (navigator.language || '').startsWith('zh') ? 'zh' : 'en');
  const uiLang = await db.getMeta('uiLang'); if (uiLang) setLang(uiLang);
  await loadProfiles();
  const last = await db.getMeta('lastProfile');
  const lp = S.profiles.find((p) => p.id === last);
  if (lp) { S.profile = lp; applySettings(lp); }
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !location.search.includes('nosw')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  const params = new URLSearchParams(location.search);
  if (params.get('room')) { await go('title'); if (S.profiles.length) { if (!S.profile) await selectProfile(S.profiles[0]); go('mp', { code: params.get('room') }); } else go('create'); return; }
  go('title');
}

// Expose for automated playtests. Harmless for players.
window.__test = {
  state: () => ({ screen: document.body.dataset.screen, profile: S.profile && S.profile.name, profiles: S.profiles.length }),
  S,
};

window.addEventListener('error', (e) => console.error('page error', e.message));
boot();
