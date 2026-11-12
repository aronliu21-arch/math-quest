// Two-device multiplayer test against the local dev server (separate browser
// contexts = separate devices with separate storage). Run: node tests/mp-e2e.cjs
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
// MODE=p2p tests the zero-setup direct mode: a plain static server (no game API)
// plus a local PeerJS signaling server standing in for the public one.
const P2P = process.env.MODE === 'p2p';
const PORT = 9000 + Math.floor(Math.random() * 900);
const PEER_PORT = PORT + 1000;
const BASE = `http://localhost:${PORT}/?nosw${P2P ? `&peer=127.0.0.1:${PEER_PORT}` : ''}`;
let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘', m); if (!c) fails++; };
async function device(b, name, errs, vp = { width: 1024, height: 768 }) {
  const ctx = await b.newContext({ viewport: vp, reducedMotion: 'reduce' });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(name + ' PAGEERR ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push(name + ' CONSOLE ' + m.text()); });
  await pg.goto(BASE); await pg.waitForTimeout(300);
  await pg.click('.start-btn'); await pg.click('.profile-card.new');
  await pg.fill('.name-input', name); await pg.click('[data-act="next"]'); await pg.click('[data-act="next"]');
  await pg.click('.pet-card >> nth=0'); await pg.click('[data-act="next"]'); await pg.click('[data-act="next"]'); await pg.waitForTimeout(400);
  return { ctx, pg };
}
(async () => {
  const root = path.join(__dirname, '..');
  const procs = P2P
    ? [spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: root, stdio: 'ignore' }),
      spawn(process.execPath, [path.join(process.env.PEER_MODULES || path.join(root, 'node_modules'), 'peer', 'dist', 'bin', 'peerjs.js'), '--port', String(PEER_PORT), '--host', '127.0.0.1', '--path', '/'], { stdio: 'ignore' })]
    : [spawn(process.execPath, [path.join(root, 'server', 'dev-server.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' })];
  const server = { kill: () => procs.forEach((p) => p.kill()) };
  await new Promise((r) => setTimeout(r, 1500));
  const b = await chromium.launch(); const errs = [];
  const A = await device(b, 'Ava', errs);
  const B = await device(b, 'Ben', errs, { width: 390, height: 844 });
  await A.pg.click('[data-act="team"]'); await A.pg.waitForTimeout(600);
  await A.pg.click('[data-act="create"]'); await A.pg.waitForTimeout(800);
  const code = await A.pg.evaluate(() => window.__test.mpState().code);
  check(/^[0-9]{4}$/.test(code), 'room created with 4-digit code ' + code);
  await A.pg.screenshot({ path: path.join(__dirname, '..', 'test-output', '20-lobby-host.png') });
  // B joins by typing the code on the on-screen keypad
  await B.pg.click('[data-act="team"]'); await B.pg.waitForTimeout(600);
  for (const ch of code) await B.pg.click(`[data-act="ck"][data-arg="${ch}"]`);
  await B.pg.waitForTimeout(1500); // the 4th digit joins automatically
  check((await A.pg.evaluate(() => window.__test.mpState().order.length)) === 2, 'host lobby shows the joined player');
  await B.pg.screenshot({ path: path.join(__dirname, '..', 'test-output', '21-lobby-guest-phone.png') });
  await A.pg.click('[data-act="start"]'); await A.pg.waitForTimeout(1200);
  const hp0 = await B.pg.evaluate(() => window.__test.mpState().game.hp);
  check(hp0 === 12 && (await B.pg.evaluate(() => window.__test.mpState().status)) === 'playing', 'guest sees the started boss battle with shared HP');
  await A.pg.screenshot({ path: path.join(__dirname, '..', 'test-output', '22-boss-A.png') });
  // A answers wrong twice (reveal) then both answer correctly using the visible question only via server truth: we don't have answers client-side!
  // so drive answers through the input UI: for mc pick each choice until correct
  async function answerOnce(pg) {
    const q = await pg.evaluate(() => window.__test.mpQ && { input: window.__test.mpQ.input, qid: window.__test.mpQ.qid, n: (window.__test.mpQ.choices || []).length });
    if (!q) return;
    if (q.input === 'mc') { // try choices in order (server decides)
      for (let i = 0; i < q.n; i++) {
        const btn = await pg.$(`.q-area .choice[data-i="${i}"]:not([disabled])`); if (!btn) continue;
        await btn.click({ timeout: 3000 }).catch(() => {});
        for (let w = 0; w < 20; w++) {
          await pg.waitForTimeout(150);
          if (await pg.$('.q-area .got-it')) { await pg.click('.q-area .got-it'); return; }
          const cur = await pg.evaluate(() => window.__test.mpQ && window.__test.mpQ.qid);
          if (cur !== q.qid) return;
          if (await pg.$('.q-area .encourage')) break;
        }
      }
    } else {
      await pg.evaluate(() => window.__test.mpSubmit({ t: 'n', v: 999999 })); await pg.waitForTimeout(400);
      await pg.evaluate(() => window.__test.mpSubmit({ t: 'n', v: 999998 })); await pg.waitForTimeout(500);
      if (await pg.$('.q-area .got-it')) await pg.click('.q-area .got-it');
    }
  }
  for (let i = 0; i < 40; i++) {
    const st = await A.pg.evaluate(() => window.__test.mpState().status);
    if (st !== 'playing') break;
    await answerOnce(A.pg); await answerOnce(B.pg);
  }
  const hpA = await A.pg.evaluate(() => window.__test.mpState().game.hp), hpB = await B.pg.evaluate(() => window.__test.mpState().game.hp);
  check(hpA === 0 && hpB === 0 && (await A.pg.evaluate(() => window.__test.mpState().status)) === 'ended', 'both devices agree the boss was defeated');
  await A.pg.waitForTimeout(800);
  await A.pg.screenshot({ path: path.join(__dirname, '..', 'test-output', '23-end-A.png') });
  await B.pg.screenshot({ path: path.join(__dirname, '..', 'test-output', '24-end-B.png') });
  check((await A.pg.evaluate(() => window.__test.S.profile.coins)) > 30 && (await B.pg.evaluate(() => window.__test.S.profile.stats.teamWins)) === 1, 'server rewards applied once on each device');
  // --- disconnection + recovery: start relay, close B, A should see B offline, B reopens and rejoins
  await A.pg.click('[data-act="again"][data-arg="relay"]'); await A.pg.waitForTimeout(1000);
  check(await A.pg.evaluate(() => window.__test.mpState().game.turn === window.__test.S.profile.mpSession.playerId), 'relay starts with the host holding the baton');
  await B.pg.close({ runBeforeUnload: true });
  let offline = [];
  for (let w = 0; w < 50; w++) { // closed tab is reported right away; a network drop within ~20s
    await A.pg.waitForTimeout(500);
    offline = await A.pg.evaluate(() => { const s = window.__test.mpState(); return s.order.map(id => s.players[id].connected); });
    if (offline[1] === false) break;
  }
  check(offline[0] === true && offline[1] === false, 'closing a device marks that player as reconnecting');
  await A.pg.screenshot({ path: path.join(__dirname, '..', 'test-output', '25-B-offline.png') });
  const B2 = await B.ctx.newPage();
  B2.on('pageerror', e => errs.push('B2 PAGEERR ' + e.message));
  await B2.goto(BASE + '&room=' + code); await B2.waitForTimeout(2500);
  check((await B2.evaluate(() => window.__test.state().screen)) === 'mproom', 'reopening the room link rejoins the game');
  const back = await A.pg.evaluate(() => { const s = window.__test.mpState(); return s.order.map(id => s.players[id].connected); });
  check(back[0] && back[1], 'host sees the player back online');
  await B2.screenshot({ path: path.join(__dirname, '..', 'test-output', '26-B-rejoined.png') });
  check(!errs.length, 'no page errors ' + errs.join(' | '));
  if (P2P) console.log('  (mode: direct peer-to-peer)');
  await b.close(); server.kill();
  process.exit(fails ? 1 : 0);
})();
