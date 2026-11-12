// Game state, profile model and reward logic.
import * as db from './db.js';
import { newLearning, levelOf, today } from './adaptive.js';
import { setLang } from './i18n.js';
import { setSoundPrefs } from './audio.js';
import { PETS, OUTFITS, BADGES } from './art.js';
import { ACHIEVEMENTS, XP_FOR_LEVEL, PET_XP_FOR_LEVEL, EVOLVE_AT, COSTUMES, EQUIPMENT, DECOR_ITEMS } from './content.js';
import { makeRng, randomSeed } from '../shared/rng.js';

export const S = {
  profiles: [],
  profile: null,
  sessionId: null,
  lastActive: 0,
};

export function uid() {
  const a = new Uint8Array(8); crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newProfile({ name, avatar, pet, lang, startDiv = 1, startFrac = 1, style = null }) {
  const i = Math.floor(Math.random() * BADGES.length);
  return {
    id: uid(), name: name.slice(0, 20), created: Date.now(), style,
    avatar: { hair: 'short', hairColor: '#1b1b1f', skin: '#f6c9a0', outfit: OUTFITS[0], badge: BADGES[i], hat: null, cape: null, held: null, ...avatar },
    settings: { lang: lang || 'en', zhuyin: true, sound: true, music: true, narration: style ? style !== 'older' : startDiv === 1 && startFrac === 1, hintMode: style === 'older' ? 'ask' : 'auto', timed: true, breakEvery: 0, v: 2 },
    xp: 0, level: 1, coins: 30, gems: 0,
    pets: { [pet]: { stage: 0, lv: 1, xp: 0, found: Date.now() } }, activePet: pet,
    owned: { costumes: avatar && avatar.hat ? { [avatar.hat]: Date.now() } : {}, equipment: {}, decor: { flower: 3, tree: 1 } },
    home: { tiles: Array(40).fill(null) },
    learning: newLearning(startDiv, startFrac),
    stats: { missions: 0, answered: 0, firstTry: 0, secondTry: 0, streak: 0, bestStreak: 0, bosses: 0, bossWorlds: {}, secrets: 0, eggs: 0, teamWins: 0, showMe: 0, playMs: 0 },
    achievements: {},
    expeditions: {},
    daily: { date: null, missions: [], done: {} },
    missionsInRow: 0, lastPlayed: 0,
  };
}

export async function loadProfiles() {
  S.profiles = await db.getProfiles();
  // v2: break reminders are off by default (parents can turn them on in the dashboard)
  for (const p of S.profiles) if (!p.settings.v) { p.settings.v = 2; if (p.settings.breakEvery === 3) p.settings.breakEvery = 0; await db.saveProfile(p); }
  return S.profiles;
}

export async function save(p = S.profile) {
  if (!p) return;
  await db.saveProfile(p);
  const i = S.profiles.findIndex((x) => x.id === p.id);
  if (i >= 0) S.profiles[i] = p; else S.profiles.push(p);
}

export function applySettings(p = S.profile) {
  if (!p) return;
  setLang(p.settings.lang);
  document.body.classList.toggle('zhuyin', p.settings.lang === 'zh' && p.settings.zhuyin);
  document.documentElement.style.setProperty('--badge', p.avatar.badge);
  setSoundPrefs({ sound: p.settings.sound, music: p.settings.music });
}

export async function selectProfile(p) {
  S.profile = p;
  // A new "session" starts when a profile is picked after 30+ minutes away.
  if (!S.sessionId || Date.now() - (p.lastPlayed || 0) > 30 * 60 * 1000) {
    S.sessionId = uid();
    if (Date.now() - (p.lastPlayed || 0) > 30 * 60 * 1000) p.missionsInRow = 0;
  }
  p.lastPlayed = Date.now();
  applySettings(p);
  await db.setMeta('lastProfile', p.id);
  await save(p);
}

export function heroAvatar(p = S.profile) { return { ...p.avatar }; }

export const skillLevel = (p, skill) => levelOf(p.learning.skill[skill]);

export function worldUnlocked(p, world) {
  if (world === 'village' || world === 'forest') return true;
  if (world === 'kingdom') return p.level >= 3;
  if (world === 'legend') return p.level >= 8 || skillLevel(p, 'div') === 3 || skillLevel(p, 'frac') === 3;
  return false;
}

export function equipBonus(p, field) {
  const held = p.avatar.held;
  return held && EQUIPMENT[held] && EQUIPMENT[held][field] ? EQUIPMENT[held][field] : 0;
}

// Apply rewards; returns a list of events for the results screen.
export function grantRewards(p, { xp = 0, coins = 0, gems = 0, petXp = 0 }) {
  const events = [];
  xp = Math.round(xp * (1 + equipBonus(p, 'xpBonus')));
  coins = Math.round(coins * (1 + equipBonus(p, 'coinBonus')));
  petXp = Math.round(petXp * (1 + equipBonus(p, 'petBonus')));
  p.xp += xp; p.coins += coins; p.gems += gems;
  while (p.xp >= XP_FOR_LEVEL(p.level)) { p.xp -= XP_FOR_LEVEL(p.level); p.level++; events.push({ type: 'heroLevel', level: p.level }); }
  const pet = p.pets[p.activePet];
  if (pet && petXp) {
    pet.xp += petXp; events.push({ type: 'petXp', species: p.activePet, amount: petXp });
    while (pet.xp >= PET_XP_FOR_LEVEL(pet.lv)) {
      pet.xp -= PET_XP_FOR_LEVEL(pet.lv); pet.lv++;
      const stage = pet.lv >= EVOLVE_AT[1] ? 2 : pet.lv >= EVOLVE_AT[0] ? 1 : 0;
      if (stage > pet.stage) { pet.stage = stage; events.push({ type: 'evolve', species: p.activePet, stage }); }
    }
  }
  return { xp, coins, gems, petXp, events };
}

export function checkAchievements(p) {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id]) continue;
    let ok = false; try { ok = a.test(p, PETS); } catch (e) { ok = false; }
    if (ok) { p.achievements[a.id] = Date.now(); fresh.push(a); }
  }
  return fresh;
}

export function addPet(p, species) {
  if (p.pets[species]) return false;
  p.pets[species] = { stage: 0, lv: 1, xp: 0, found: Date.now() };
  return true;
}

export function randomUnownedPet(p, rng, rarities) {
  const options = Object.keys(PETS).filter((k) => !p.pets[k] && rarities.includes(PETS[k].rarity));
  return options.length ? rng.pick(options) : null;
}

// Random chest loot: coins, gems, a decoration, a costume, equipment or a pet.
export function rollChest(p, rng, quality = 1) {
  const r = rng.next();
  if (r < 0.12 * quality) {
    const pet = randomUnownedPet(p, rng, quality >= 2 && rng.chance(0.3) ? ['rare'] : ['common', 'rare']);
    if (pet) { addPet(p, pet); return { kind: 'pet', id: pet }; }
  }
  if (r < 0.32) {
    const c = Object.keys(COSTUMES).filter((k) => !p.owned.costumes[k] && !COSTUMES[k].legendary);
    if (c.length) { const k = rng.pick(c); p.owned.costumes[k] = Date.now(); return { kind: 'costume', id: k }; }
  }
  if (r < 0.42) {
    const c = Object.keys(EQUIPMENT).filter((k) => !p.owned.equipment[k]);
    if (c.length) { const k = rng.pick(c); p.owned.equipment[k] = Date.now(); return { kind: 'equipment', id: k }; }
  }
  if (r < 0.7) {
    const k = rng.pick(Object.keys(DECOR_ITEMS));
    p.owned.decor[k] = (p.owned.decor[k] || 0) + 1; return { kind: 'decor', id: k };
  }
  if (r < 0.85) { const g = 1 + Math.floor(rng.next() * 2 * quality); p.gems += g; return { kind: 'gems', amount: g }; }
  const c = 20 + Math.floor(rng.next() * 30 * quality); p.coins += c; return { kind: 'coins', amount: c };
}

export function recordAnswerStats(p, { ok, firstTry }) {
  p.stats.answered++;
  if (ok && firstTry) { p.stats.firstTry++; p.stats.streak++; p.stats.bestStreak = Math.max(p.stats.bestStreak, p.stats.streak); }
  else p.stats.streak = 0;
  if (ok && !firstTry) p.stats.secondTry++;
}

export function dailySeed(p) { return `${p.id}-${today()}`; }

export function ensureDaily(p) {
  const d = today();
  if (p.daily.date === d && p.daily.missions.length) return p.daily;
  const rng = makeRng(dailySeed(p));
  const worlds = ['village', 'forest', 'kingdom', 'legend'].filter((w) => worldUnlocked(p, w));
  const modes = ['battle', 'puzzle', 'treasure', 'battle'];
  const missions = [];
  for (let i = 0; i < 3; i++) missions.push({ world: rng.pick(worlds), mode: rng.pick(modes), seed: randomSeed(), done: false, twist: rng.pick(['double_coins', 'gem_hunt', 'pet_party']) });
  p.daily = { ...p.daily, date: d, missions, boxOpened: false };
  return p.daily;
}
