// Server-authoritative cooperative room logic. Runs ONLY on the server
// (local dev server or Supabase Edge Function). Clients never see answers
// before they submit, and every reward is computed here.
import { makeRng } from './rng.js';
import { generate, checkAnswer, publicQuestion, CONCEPTS, conceptLevels } from './mathgen.js';

export const CODE_ALPHABET = '0123456789'; // 4-digit number: easy for kids to type
export const CODE_LENGTH = 4;
export const MODES = ['boss', 'treasure', 'relay', 'build'];
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
export const OFFLINE_AFTER_MS = 15000;
export const ROOM_TTL_MS = 6 * 3600 * 1000;

export function newCode(rnd = Math.random) {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
  return s;
}
export const validCode = (c) => typeof c === 'string' && c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch));

function randHex(bytes = 16) {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- input sanitizing (never trust the client) ----------
const HAIRS = ['spiky', 'ponytail', 'short', 'curly', 'bun', 'long'];
const isColor = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
function cleanProfile(p = {}) {
  const a = p.avatar || {};
  const lv = (x) => (x === 1 || x === 2 || x === 3 ? x : 1);
  return {
    name: String(p.name || 'Hero').replace(/[<>&"']/g, '').slice(0, 20) || 'Hero',
    avatar: {
      hair: HAIRS.includes(a.hair) ? a.hair : 'short',
      hairColor: isColor(a.hairColor) ? a.hairColor : '#1b1b1f',
      skin: isColor(a.skin) ? a.skin : '#f6c9a0',
      outfit: isColor(a.outfit) ? a.outfit : '#1c7ed6',
      badge: isColor(a.badge) ? a.badge : '#7048e8',
      hat: typeof a.hat === 'string' ? a.hat.slice(0, 12) : null,
      cape: typeof a.cape === 'string' ? a.cape.slice(0, 12) : null,
      held: typeof a.held === 'string' ? a.held.slice(0, 12) : null,
      number: Number.isInteger(a.number) && a.number >= 0 && a.number <= 99 ? a.number : '',
    },
    pet: typeof p.pet === 'string' ? p.pet.slice(0, 16) : 'divi',
    petStage: [0, 1, 2].includes(p.petStage) ? p.petStage : 0,
    levels: { div: lv(p.levels && p.levels.div), frac: lv(p.levels && p.levels.frac) },
  };
}

function cleanValue(v) {
  if (!v || typeof v !== 'object') return null;
  const int = (x) => (Number.isInteger(x) && Math.abs(x) < 1e7 ? x : null);
  switch (v.t) {
    case 'n': return int(v.v) == null ? null : { t: 'n', v: v.v };
    case 'f': return int(v.n) == null || int(v.d) == null ? null : { t: 'f', n: v.n, d: v.d };
    case 'm': return [v.w, v.n, v.d].some((x) => int(x) == null) ? null : { t: 'm', w: v.w, n: v.n, d: v.d };
    case 'r': return int(v.q) == null || int(v.r) == null ? null : { t: 'r', q: v.q, r: v.r };
    case 's': return typeof v.v === 'string' ? { t: 's', v: v.v.slice(0, 12) } : null;
    case 'o': return Array.isArray(v.v) && v.v.length <= 6 && v.v.every((x) => int(x) != null) ? { t: 'o', v: v.v.slice() } : null;
    default: return null;
  }
}

// ---------- questions ----------
function pickConcept(rng, levels, preferMix) {
  const pool = [];
  for (const c of Object.keys(CONCEPTS)) {
    const dom = CONCEPTS[c].domain; const lv = conceptLevels(c);
    if (dom === 'div' && lv.includes(levels.div)) pool.push({ c, level: levels.div });
    if (dom === 'frac' && lv.includes(levels.frac)) pool.push({ c, level: levels.frac });
    const m = Math.min(levels.div, levels.frac);
    if (preferMix && dom === 'mix' && lv.includes(m)) pool.push({ c, level: m }, { c, level: m });
  }
  return rng.pick(pool.length ? pool : [{ c: 'div_facts20', level: 1 }]);
}

function issueQuestion(state, secrets, pid, { easier = false } = {}) {
  const pl = state.players[pid];
  secrets.qn = (secrets.qn || 0) + 1;
  const rng = makeRng(`${secrets.seed}-${pid}-${secrets.qn}`);
  const pick = pickConcept(rng, pl.levels, true);
  const tier = easier ? 0.1 : 0.3 + rng.next() * 0.6;
  let q = generate(pick.c, { rng, tier, level: pick.level });
  // keep team play brisk: prefer tap/keypad questions over long drag puzzles
  for (let i = 0; i < 6 && ['share', 'order'].includes(q.input); i++) q = generate(pick.c, { rng, tier, level: pick.level });
  const qid = `${secrets.qn}`;
  secrets.answers[pid] = { qid, q, tries: 0 };
  pl.q = { ...publicQuestion(q), qid };
  pl.pendingPick = false;
}

// ---------- room lifecycle ----------
export async function createRoom(profile, now, rnd = Math.random) {
  const pid = randHex(8); const token = randHex(16);
  const code = newCode(rnd);
  const p = cleanProfile(profile);
  const state = {
    code, status: 'lobby', mode: 'boss', hostId: pid, created: now, updated: now, round: 0,
    players: { [pid]: { ...p, joinedAt: now, lastSeen: now, connected: true, correct: 0, attempts: 0, damage: 0, picks: 0, q: null, pendingPick: false, last: null } },
    order: [pid], game: null, rewards: null, log: [],
  };
  const secrets = { tokens: { [pid]: await sha256(token) }, answers: {}, seed: randHex(8), qn: 0 };
  return { state, secrets, playerId: pid, token };
}

async function authed(secrets, pid, token) {
  if (!pid || !token || !secrets.tokens[pid]) return false;
  return secrets.tokens[pid] === await sha256(String(token));
}

function sweep(state, now) {
  for (const pid of state.order) {
    const pl = state.players[pid];
    pl.connected = now - pl.lastSeen < OFFLINE_AFTER_MS;
  }
  // host migrates if the host has been gone a long time in the lobby
  const host = state.players[state.hostId];
  if (host && !host.connected) {
    const next = state.order.find((id) => state.players[id].connected);
    if (next) state.hostId = next;
  }
}

function log(state, entry) { state.log.push(entry); if (state.log.length > 30) state.log.shift(); }

function startGame(state, secrets) {
  const n = state.order.length;
  const rng = makeRng(`${secrets.seed}-start`);
  state.status = 'playing'; state.round = 1;
  for (const pid of state.order) Object.assign(state.players[pid], { correct: 0, attempts: 0, damage: 0, picks: 0, last: null });
  if (state.mode === 'boss') {
    const names = [['Count Crumble', '碎碎伯爵'], ['The Pizza Hydra', '披薩九頭蛇'], ['Muddle the Mixed-up Golem', '糊塗石像巨人'], ['Chaos Infinity Dragon', '混沌無限龍']];
    const i = rng.int(0, 3);
    state.game = { hp: 6 * n, maxHp: 6 * n, boss: names[i], world: ['village', 'forest', 'kingdom', 'legend'][i] };
  } else if (state.mode === 'treasure') {
    const tiles = 16; const need = 4;
    secrets.treasure = rng.shuffle([...Array(tiles).keys()]).slice(0, need);
    state.game = { tiles: Array(tiles).fill(null), need, found: 0 };
  } else if (state.mode === 'relay') {
    state.game = { leg: 0, legs: 3 * n, turn: state.order[0] };
  } else {
    state.game = { blocks: Array(16).fill(null), need: Math.min(16, 5 * n), placed: 0 };
  }
  for (const pid of state.order) {
    if (state.mode === 'relay' && pid !== state.game.turn) { state.players[pid].q = null; continue; }
    issueQuestion(state, secrets, pid);
  }
}

function nextRelayTurn(state) {
  const ids = state.order;
  const cur = ids.indexOf(state.game.turn);
  for (let k = 1; k <= ids.length; k++) {
    const id = ids[(cur + k) % ids.length];
    if (state.players[id].connected) return id;
  }
  return state.game.turn;
}

function finishGame(state) {
  state.status = 'ended'; state.endedAt = state.updated;
  const ids = state.order;
  const everyone = ids.every((id) => state.players[id].correct >= 2);
  const rewards = {};
  for (const id of ids) {
    const pl = state.players[id];
    let xp = 25 + pl.correct * 8; let coins = 20 + pl.correct * 5; let gems = 1;
    if (everyone && ids.length >= 2) { coins = Math.round(coins * 1.5); gems += 1; }
    rewards[id] = { xp, coins, gems, teamBonus: everyone && ids.length >= 2, correct: pl.correct };
  }
  state.rewards = rewards;
  for (const id of ids) { state.players[id].q = null; state.players[id].pendingPick = false; }
}

function checkWin(state) {
  const g = state.game;
  if (state.mode === 'boss') return g.hp <= 0;
  if (state.mode === 'treasure') return g.found >= g.need;
  if (state.mode === 'relay') return g.leg >= g.legs;
  return g.placed >= g.need;
}

// ---------- the single entry point ----------
// db: { get(code) → {state, secrets, version}|null, insert(code, state, secrets) → bool, update(code, state, secrets, version) → bool }
export async function handle(db, body, now = Date.now()) {
  const action = body && body.action;
  if (action === 'create') {
    for (let i = 0; i < 20; i++) { // retry on the rare clash with an open room
      const r = await createRoom(body.profile, now);
      if (await db.insert(r.state.code, r.state, r.secrets)) return { ok: true, state: r.state, playerId: r.playerId, token: r.token };
    }
    return { ok: false, error: 'busy' };
  }
  const code = String(body.code || '').toUpperCase();
  if (!validCode(code)) return { ok: false, error: 'notFound' };
  for (let attempt = 0; attempt < 6; attempt++) {
    const row = await db.get(code);
    if (!row || now - row.state.updated > ROOM_TTL_MS) return { ok: false, error: 'notFound' };
    const state = structuredClone(row.state); const secrets = structuredClone(row.secrets);
    const res = await apply(state, secrets, body, now);
    if (res.readOnly) return res.out;
    state.updated = now;
    if (await db.update(code, state, secrets, row.version)) return { ...res.out, state };
    // version conflict: someone else wrote first → retry on fresh data
  }
  return { ok: false, error: 'busy' };
}

async function apply(state, secrets, body, now) {
  const { action, playerId: pid, token } = body;
  sweep(state, now);
  if (action === 'get') return { readOnly: true, out: { ok: true, state } };

  if (action === 'join') {
    if (state.order.length >= MAX_PLAYERS) return { readOnly: true, out: { ok: false, error: 'full' } };
    if (state.status !== 'lobby') return { readOnly: true, out: { ok: false, error: 'started' } };
    const id = randHex(8); const tk = randHex(16);
    state.players[id] = { ...cleanProfile(body.profile), joinedAt: now, lastSeen: now, connected: true, correct: 0, attempts: 0, damage: 0, picks: 0, q: null, pendingPick: false, last: null };
    state.order.push(id);
    secrets.tokens[id] = await sha256(tk);
    log(state, { t: now, type: 'join', who: id });
    return { out: { ok: true, playerId: id, token: tk } };
  }

  if (!(await authed(secrets, pid, token))) return { readOnly: true, out: { ok: false, error: 'auth' } };
  const me = state.players[pid];
  me.lastSeen = now; me.connected = true;
  // relay: if the runner holding the baton went offline, pass it on so the team is never stuck
  if (state.status === 'playing' && state.mode === 'relay' && !state.players[state.game.turn].connected) {
    const old = state.game.turn; const nt = nextRelayTurn(state);
    if (nt !== old) { state.players[old].q = null; delete secrets.answers[old]; state.game.turn = nt; issueQuestion(state, secrets, nt); }
  }

  switch (action) {
    case 'ping':
    case 'rejoin':
      if (state.status === 'playing' && !me.q && !me.pendingPick && (state.mode !== 'relay' || state.game.turn === pid)) issueQuestion(state, secrets, pid);
      return { out: { ok: true } };
    case 'away': // tab closed / app backgrounded: show as reconnecting right away, keep their spot
      me.lastSeen = 0; me.connected = false;
      if (state.status === 'playing' && state.mode === 'relay' && state.game.turn === pid) {
        const nt = nextRelayTurn(state);
        if (nt !== pid) { me.q = null; delete secrets.answers[pid]; state.game.turn = nt; issueQuestion(state, secrets, nt); }
      }
      return { out: { ok: true } };
    case 'leave':
      me.lastSeen = 0; me.connected = false;
      if (state.status === 'lobby') {
        state.order = state.order.filter((x) => x !== pid); delete state.players[pid]; delete secrets.tokens[pid];
        if (state.hostId === pid && state.order.length) state.hostId = state.order[0];
      } else if (state.mode === 'relay' && state.game && state.game.turn === pid) {
        state.game.turn = nextRelayTurn(state); if (state.game.turn !== pid) issueQuestion(state, secrets, state.game.turn);
      }
      return { out: { ok: true } };
    case 'setMode':
      if (pid !== state.hostId || state.status !== 'lobby' || !MODES.includes(body.mode)) return { readOnly: true, out: { ok: false, error: 'denied' } };
      state.mode = body.mode; return { out: { ok: true } };
    case 'start': {
      if (pid !== state.hostId || (state.status !== 'lobby' && state.status !== 'ended')) return { readOnly: true, out: { ok: false, error: 'denied' } };
      const online = state.order.filter((id) => state.players[id].connected);
      if (online.length < MIN_PLAYERS) return { readOnly: true, out: { ok: false, error: 'needPlayers' } };
      if (state.status === 'ended' && body.mode && MODES.includes(body.mode)) state.mode = body.mode;
      state.rewards = null;
      startGame(state, secrets);
      return { out: { ok: true } };
    }
    case 'answer': {
      if (state.status !== 'playing') return { readOnly: true, out: { ok: false, error: 'notPlaying' } };
      const slot = secrets.answers[pid];
      if (!slot || !me.q || String(body.qid) !== slot.qid) return { readOnly: true, out: { ok: false, error: 'stale' } };
      if (state.mode === 'relay' && state.game.turn !== pid) return { readOnly: true, out: { ok: false, error: 'notYourTurn' } };
      const value = cleanValue(body.value);
      const res = value ? checkAnswer(slot.q, value) : { ok: false };
      if (res.almost) return { out: { ok: true, correct: false, almost: res.almost } };
      me.attempts++;
      if (res.ok) {
        const firstTry = slot.tries === 0;
        me.correct++;
        me.last = { ok: true, firstTry, t: now };
        if (state.mode === 'boss') { const dmg = firstTry ? 2 : 1; state.game.hp = Math.max(0, state.game.hp - dmg); me.damage += dmg; log(state, { t: now, type: 'hit', who: pid, dmg }); }
        if (state.mode === 'relay') { state.game.leg++; log(state, { t: now, type: 'leg', who: pid }); }
        if (state.mode === 'treasure' || state.mode === 'build') { me.pendingPick = true; me.q = null; delete secrets.answers[pid]; }
        if (checkWin(state)) { finishGame(state); return { out: { ok: true, correct: true, firstTry } }; }
        if (state.mode === 'relay') { me.q = null; delete secrets.answers[pid]; state.game.turn = nextRelayTurn(state); issueQuestion(state, secrets, state.game.turn); }
        else if (state.mode === 'boss') issueQuestion(state, secrets, pid);
        return { out: { ok: true, correct: true, firstTry } };
      }
      slot.tries++;
      if (slot.tries < 2) { me.last = { ok: false, retry: true, t: now }; return { out: { ok: true, correct: false, retry: true, misconception: res.misconception || null } }; }
      // second miss: reveal, then an easier question (relay passes the baton, no penalty)
      const reveal = slot.q.answer; const steps = slot.q.steps;
      me.last = { ok: false, t: now };
      if (state.mode === 'relay') { me.q = null; delete secrets.answers[pid]; state.game.leg++; if (checkWin(state)) { finishGame(state); return { out: { ok: true, correct: false, reveal, steps } }; } state.game.turn = nextRelayTurn(state); issueQuestion(state, secrets, state.game.turn, { easier: state.game.turn === pid }); }
      else issueQuestion(state, secrets, pid, { easier: true });
      return { out: { ok: true, correct: false, reveal, steps } };
    }
    case 'pick': {
      if (state.status !== 'playing' || !me.pendingPick) return { readOnly: true, out: { ok: false, error: 'denied' } };
      const i = Number(body.index);
      if (state.mode === 'treasure') {
        const g = state.game;
        if (!Number.isInteger(i) || i < 0 || i >= g.tiles.length || g.tiles[i]) return { readOnly: true, out: { ok: false, error: 'bad' } };
        const hit = secrets.treasure.includes(i);
        g.tiles[i] = { by: pid, treasure: hit }; if (hit) g.found++;
        me.picks++; me.pendingPick = false;
        log(state, { t: now, type: hit ? 'found' : 'dig', who: pid });
        if (checkWin(state)) { finishGame(state); return { out: { ok: true, found: hit } }; }
        issueQuestion(state, secrets, pid);
        return { out: { ok: true, found: hit } };
      }
      if (state.mode === 'build') {
        const g = state.game;
        if (!Number.isInteger(i) || i < 0 || i >= g.blocks.length || g.blocks[i]) return { readOnly: true, out: { ok: false, error: 'bad' } };
        g.blocks[i] = { by: pid }; g.placed++; me.picks++; me.pendingPick = false;
        if (checkWin(state)) { finishGame(state); return { out: { ok: true } }; }
        issueQuestion(state, secrets, pid);
        return { out: { ok: true } };
      }
      return { readOnly: true, out: { ok: false, error: 'denied' } };
    }
    case 'backToLobby':
      if (pid !== state.hostId || state.status !== 'ended') return { readOnly: true, out: { ok: false, error: 'denied' } };
      state.status = 'lobby'; state.game = null; state.rewards = null;
      for (const id of state.order) Object.assign(state.players[id], { q: null, pendingPick: false });
      return { out: { ok: true } };
    default:
      return { readOnly: true, out: { ok: false, error: 'unknownAction' } };
  }
}

// In-memory store with optimistic versioning (used by the dev server and tests).
export function memoryDb() {
  const rooms = new Map();
  return {
    rooms,
    async get(code) { const r = rooms.get(code); return r ? structuredClone(r) : null; },
    async insert(code, state, secrets) { if (rooms.has(code)) return false; rooms.set(code, { state: structuredClone(state), secrets: structuredClone(secrets), version: 1 }); return true; },
    async update(code, state, secrets, version) {
      const r = rooms.get(code); if (!r || r.version !== version) return false;
      rooms.set(code, { state: structuredClone(state), secrets: structuredClone(secrets), version: version + 1 }); return true;
    },
  };
}
