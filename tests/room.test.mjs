// Server room logic: create/join, auth, all four co-op modes, two tries,
// disconnection handling and server-side rewards. Run: node tests/room.test.mjs
import { handle, memoryDb, OFFLINE_AFTER_MS } from '../shared/room-logic.js';

let fails = 0; let n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL', m); } };
const prof = (name, div = 1, frac = 1) => ({ name, avatar: { hair: 'short' }, pet: 'divi', levels: { div, frac } });

async function setup(players = 2, mode = 'boss') {
  const db = memoryDb(); let now = 1_000_000;
  const c = await handle(db, { action: 'create', profile: prof('A') }, now);
  ok(c.ok && /^[0-9]{4}$/.test(c.state.code), 'room created with a 4-digit code');
  const ps = [{ id: c.playerId, token: c.token }];
  for (let i = 1; i < players; i++) {
    const j = await handle(db, { action: 'join', code: c.state.code.toLowerCase(), profile: prof('P' + i, 2, 3) }, now);
    ok(j.ok, 'join by code (case-insensitive)'); ps.push({ id: j.playerId, token: j.token });
  }
  const code = c.state.code;
  const call = (p, body, t = now) => handle(db, { code, playerId: p.id, token: p.token, ...body }, t);
  await call(ps[0], { action: 'setMode', mode });
  return { db, code, ps, call, now };
}
const secretOf = async (db, code, id) => (await db.get(code)).secrets.answers[id];
const stateOf = async (db, code) => (await db.get(code)).state;

// --- auth & lobby rules
{
  const { db, code, ps, call } = await setup(2);
  ok(!(await handle(db, { action: 'start', code, playerId: ps[0].id, token: 'bad' })).ok, 'bad token rejected');
  ok(!(await call(ps[1], { action: 'start' })).ok, 'only host can start');
  ok(!(await call(ps[1], { action: 'setMode', mode: 'relay' })).ok, 'only host can set mode');
  const st = await call(ps[0], { action: 'get' });
  ok(!JSON.stringify(st).includes('"answer"'), 'state never contains answers');
  ok((await handle(db, { action: 'join', code: 'ZZZZZZ', profile: prof('x') })).error === 'notFound', 'unknown room');
  const { now } = { now: 1_000_000 };
  await handle(db, { action: 'join', code, profile: prof('C') }, now); await handle(db, { action: 'join', code, profile: prof('D') }, now);
  ok((await handle(db, { action: 'join', code, profile: prof('E') }, now)).error === 'full', 'max 4 players');
  const evil = await handle(db, { action: 'join', code: 'ZZZZZZ' });
  ok(!evil.ok, 'join rejects invalid room');
  const x = await handle(db, { action: 'create', profile: { name: '<script>alert(1)</script>', avatar: { hairColor: 'red;}' }, levels: { div: 9 } } });
  ok(!x.state.players[x.playerId].name.includes('<') && x.state.players[x.playerId].avatar.hairColor === '#1b1b1f' && x.state.players[x.playerId].levels.div === 1, 'profile input sanitized');
}

// --- boss mode: shared HP, first-try = 2 dmg, two tries then reveal
{
  const { db, code, ps, call } = await setup(2, 'boss');
  const solo = await setup(1); ok((await solo.call(solo.ps[0], { action: 'start' })).error === 'needPlayers', 'needs 2 players');
  ok((await call(ps[0], { action: 'start' })).ok, 'host starts');
  let s = await stateOf(db, code);
  ok(s.status === 'playing' && s.game.hp === 15, 'boss needs 15 correct answers');
  ok(s.players[ps[0].id].q && s.players[ps[1].id].q && !('answer' in s.players[ps[0].id].q), 'each player has a question without answer');
  ok(s.players[ps[1].id].q.level >= 2, 'player levels respected');
  const sec = await secretOf(db, code, ps[0].id);
  const r1 = await call(ps[0], { action: 'answer', qid: sec.qid, value: sec.q.answer, move: 'thunder' });
  ok(r1.correct && r1.firstTry && r1.state.game.hp === 14, 'each correct answer is one hit');
  const hit = r1.state.log.filter((e) => e.type === 'hit').pop();
  ok(hit && hit.move === 'thunder' && hit.crit && hit.combo === 1, 'hit records the chosen attack move, crit and combo');
  ok((await call(ps[0], { action: 'setMove', move: 'hack' })).error === 'bad', 'unknown attack moves rejected');
  const sec2 = await secretOf(db, code, ps[1].id);
  const w1 = await call(ps[1], { action: 'answer', qid: sec2.qid, value: { t: 'n', v: -12345 } });
  ok(!w1.correct && w1.retry, 'first miss → retry');
  ok((await stateOf(db, code)).game.combo === 0, 'a miss resets the team combo');
  const w2 = await call(ps[1], { action: 'answer', qid: sec2.qid, value: { t: 'n', v: -12345 } });
  ok(!w2.correct && w2.reveal && !w2.retry, 'second miss → reveal');
  const stale = await call(ps[1], { action: 'answer', qid: sec2.qid, value: sec2.q.answer });
  ok(stale.error === 'stale', 'cannot re-answer an old question');
  // play to the end
  for (let i = 0; i < 40; i++) {
    s = await stateOf(db, code); if (s.status === 'ended') break;
    const p = ps[i % 2]; const sc = await secretOf(db, code, p.id);
    await call(p, { action: 'answer', qid: sc.qid, value: sc.q.answer });
  }
  s = await stateOf(db, code);
  ok(s.status === 'ended' && s.game.hp === 0, 'boss defeated');
  ok(s.rewards && s.rewards[ps[0].id].xp > 0 && s.rewards[ps[0].id].teamBonus, 'server computed rewards with team bonus');
}

// --- treasure: correct answer lets you dig once
{
  const { db, code, ps, call } = await setup(2, 'treasure');
  await call(ps[0], { action: 'start' });
  ok((await call(ps[0], { action: 'pick', index: 0 })).error === 'denied', 'cannot dig before answering');
  for (let i = 0; i < 80; i++) {
    const s = await stateOf(db, code); if (s.status === 'ended') break;
    const p = ps[i % 2]; const me = s.players[p.id];
    if (me.pendingPick) { const idx = s.game.tiles.findIndex((x) => !x); await call(p, { action: 'pick', index: idx }); continue; }
    const sc = await secretOf(db, code, p.id); await call(p, { action: 'answer', qid: sc.qid, value: sc.q.answer });
  }
  const s = await stateOf(db, code);
  ok(s.status === 'ended' && s.game.found === 4, 'all treasure found');
}

// --- relay: only the baton holder answers; offline runner is skipped
{
  const { db, code, ps, call, now } = await setup(3, 'relay');
  await call(ps[0], { action: 'start' });
  let s = await stateOf(db, code);
  ok(s.game.turn === ps[0].id && s.players[ps[1].id].q === null, 'relay: only first runner has a question');
  const sc = await secretOf(db, code, ps[0].id);
  await call(ps[0], { action: 'answer', qid: sc.qid, value: sc.q.answer });
  s = await stateOf(db, code); ok(s.game.turn === ps[1].id && s.game.leg === 1, 'baton passed');
  // player 1 goes silent; player 0 and 2 keep pinging
  const later = now + OFFLINE_AFTER_MS + 1000;
  await call(ps[2], { action: 'ping' }, later); await call(ps[0], { action: 'ping' }, later);
  s = await stateOf(db, code);
  ok(!s.players[ps[1].id].connected, 'silent player marked offline');
  ok(s.game.turn === ps[2].id, 'baton skips offline runner');
  const aw = await call(ps[2], { action: 'away' }, later + 5);
  ok(aw.ok && !aw.state.players[ps[2].id].connected && aw.state.game.turn !== ps[2].id, 'closing the tab marks player away and passes the baton');
  const rj = await call(ps[1], { action: 'rejoin' }, later + 10);
  ok(rj.ok && rj.state.players[ps[1].id].connected, 'reconnect with saved token');
}

// --- build
{
  const { db, code, ps, call } = await setup(2, 'build');
  await call(ps[0], { action: 'start' });
  for (let i = 0; i < 60; i++) {
    const s = await stateOf(db, code); if (s.status === 'ended') break;
    const p = ps[i % 2]; const me = s.players[p.id];
    if (me.pendingPick) { await call(p, { action: 'pick', index: s.game.blocks.findIndex((x) => !x) }); continue; }
    const sc = await secretOf(db, code, p.id); await call(p, { action: 'answer', qid: sc.qid, value: sc.q.answer });
  }
  const s = await stateOf(db, code);
  ok(s.status === 'ended' && s.game.placed >= s.game.need, 'castle built');
  ok((await call(ps[0], { action: 'backToLobby' })).ok, 'back to lobby');
}

// --- concurrent writes keep consistency (optimistic versioning)
{
  const { db, code, ps, call } = await setup(2, 'boss');
  await call(ps[0], { action: 'start' });
  const a = await secretOf(db, code, ps[0].id); const b = await secretOf(db, code, ps[1].id);
  await Promise.all([call(ps[0], { action: 'answer', qid: a.qid, value: a.q.answer }), call(ps[1], { action: 'answer', qid: b.qid, value: b.q.answer })]);
  const s = await stateOf(db, code);
  ok(s.game.hp === 13, `simultaneous hits both count (hp ${s.game.hp})`);
}

console.log(`${n - fails}/${n} room checks passed`);
process.exit(fails ? 1 : 0);
