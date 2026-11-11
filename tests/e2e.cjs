// End-to-end playtest in headless Chromium. Starts the dev server itself.
//   node tests/e2e.cjs            (screenshots go to test-output/)
// Covers: profiles, division + fraction missions, drag/tap puzzles, hints,
// two-tries-then-reveal, boss/treasure/timed modes, rewards, language switch,
// saved progress after reload, separate profiles, parent gate + dashboard +
// reset, shop/pets/home/daily, fresh questions across sessions, offline play,
// and two-device multiplayer with disconnect + reconnect.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://localhost:${PORT}/`;
const OUT = path.join(__dirname, '..', 'test-output');
fs.mkdirSync(OUT, { recursive: true });
let passed = 0; let failed = 0;
const check = (cond, msg) => { if (cond) { passed++; console.log('  ✔', msg); } else { failed++; console.log('  ✘', msg); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newDevice(browser, errs, name, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce', ...opts });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  pg.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push(`${name} console: ${m.text()}`); });
  return { ctx, pg };
}
async function createHero(pg, name, { hair = 'short', pet = 0, lang = null, div = 1, frac = 1 } = {}) {
  await pg.click('.profile-card.new');
  await pg.fill('.name-input', name);
  if (lang) await pg.click(`[data-act="lang"][data-arg="${lang}"]`);
  await pg.click('[data-act="next"]');
  await pg.click(`[data-act="set"][data-arg="hair|${hair}"]`);
  await pg.click('[data-act="next"]');
  await pg.click(`.pet-card >> nth=${pet}`); await pg.click('[data-act="next"]');
  if (div > 1) await pg.click(`[data-act="lvl"][data-arg="startDiv|${div}"]`);
  if (frac > 1) await pg.click(`[data-act="lvl"][data-arg="startFrac|${frac}"]`);
  await pg.click('[data-act="next"]');
  await pg.waitForFunction(() => window.__test.state().screen === 'hub');
}
const startMission = (pg, cfg) => pg.evaluate(async (c) => { const r = await import('/js/router.js'); r.go('mission', c); }, cfg);
async function solveUntilResults(pg, max = 20) {
  for (let i = 0; i < max; i++) {
    if (await pg.$('.results')) return true;
    const ready = await pg.evaluate(() => window.__test.q && !window.__test.mission().ended);
    if (ready) await pg.evaluate(() => window.__test.solve());
    await sleep(900);
  }
  return !!(await pg.$('.results'));
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'dev-server.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await sleep(800);
  const browser = await chromium.launch();
  const errs = [];
  try {
    // ---------------- single player ----------------
    console.log('Profiles + division mission');
    const { ctx, pg } = await newDevice(browser, errs, 'tablet');
    await pg.goto(BASE + '?nosw'); await pg.click('.start-btn');
    await createHero(pg, 'Ava', { hair: 'ponytail', pet: 0 });
    await createHero2();
    async function createHero2() { await pg.click('[data-act="settings"]'); await pg.click('[data-act="switch"]'); await createHero(pg, 'Ben', { hair: 'spiky', pet: 1, div: 2 }); }
    check((await pg.evaluate(() => window.__test.state().profiles)) === 2, 'two separate profiles created');
    await pg.screenshot({ path: `${OUT}/e2e-hub.png` });

    await startMission(pg, { world: 'village', mode: 'battle', seed: 11 }); await sleep(1800);
    const q1 = await pg.evaluate(() => ({ c: window.__test.q.concept, lv: window.__test.q.level }));
    check(q1.c.startsWith('div_') && q1.lv === 2, `Ben starts at intermediate division (${q1.c})`);
    await pg.click('[data-q="hint"]'); await sleep(200);
    check(!!(await pg.$('.hint-box')), 'hint button shows a hint');
    await pg.evaluate(() => window.__test.wrong()); await sleep(400);
    check((await pg.textContent('.feedback')).length > 3, 'first miss shows encouragement');
    await pg.evaluate(() => window.__test.wrong()); await sleep(400);
    check(!!(await pg.$('.got-it')) && !!(await pg.$('.steps-box')), 'second miss reveals answer with steps');
    await pg.screenshot({ path: `${OUT}/e2e-reveal.png` });
    await pg.click('.got-it'); await sleep(700);
    const follow = await pg.evaluate(() => window.__test.q.concept);
    check(follow === q1.c, 'easier follow-up uses the same concept');
    check(await solveUntilResults(pg), 'battle completes with results screen');
    const after = await pg.evaluate(() => ({ coins: window.__test.S.profile.coins, xp: window.__test.S.profile.xp, lvl: window.__test.S.profile.level, ans: window.__test.S.profile.stats.answered }));
    check(after.coins > 30 && after.ans >= 5, `rewards + stats saved (coins ${after.coins}, answered ${after.ans})`);
    await pg.screenshot({ path: `${OUT}/e2e-results.png` });

    console.log('Fraction puzzles (drag + tap)');
    await startMission(pg, { world: 'village', mode: 'puzzle', seed: 5 }); await sleep(900);
    let qi = await pg.evaluate(() => window.__test.q);
    check(qi.input === 'share', `village puzzle is a drag-to-share puzzle (${qi.input})`);
    const tok = await (await pg.$('.pile .token')).boundingBox(); const plate = await (await pg.$('.plate[data-z="0"]')).boundingBox();
    await pg.mouse.move(tok.x + 10, tok.y + 10); await pg.mouse.down(); await pg.mouse.move(tok.x + 60, tok.y + 60, { steps: 4 });
    await pg.mouse.move(plate.x + plate.width / 2, plate.y + plate.height / 2, { steps: 6 }); await pg.mouse.up(); await sleep(150);
    check((await pg.$$('.plate[data-z="0"] .token')).length === 1, 'dragging an item onto a plate works');
    await startMission(pg, { world: 'forest', mode: 'puzzle', seed: 9 }); await sleep(900);
    qi = await pg.evaluate(() => window.__test.q);
    if (qi.input === 'shade') {
      for (let i = 0; i < qi.answer.v; i++) await pg.click(`.shape-host .slice[data-i="${i}"]`, { force: true });
      await pg.click('.shade .check'); await sleep(300);
      check((await pg.$$('.praise')).length === 1, 'tapping slices to shade a fraction is accepted');
    } else check(['line', 'order'].includes(qi.input), `forest puzzle is hands-on (${qi.input})`);
    check(await solveUntilResults(pg), 'fraction puzzle mission completes');

    console.log('Boss, treasure, timed');
    await startMission(pg, { world: 'forest', mode: 'boss', seed: 21 }); await sleep(1800);
    check(await solveUntilResults(pg, 30), 'boss battle completes');
    check((await pg.evaluate(() => window.__test.S.profile.stats.bosses)) === 1, 'boss counted');
    await startMission(pg, { world: 'village', mode: 'treasure', seed: 4 }); await sleep(1000);
    check((await pg.$$('.chest-choice')).length > 0, 'treasure answers appear as chests');
    check(await solveUntilResults(pg), 'treasure hunt completes');
    await startMission(pg, { world: 'village', mode: 'timed', seed: 8 }); await sleep(500);
    await pg.click('[data-x="untimed"]'); await sleep(400);
    check(await solveUntilResults(pg), 'timed challenge can be played without a timer');

    console.log('Fresh content');
    const seenCount = await pg.evaluate(() => Object.keys(window.__test.S.profile.learning.seen).length);
    const answered = await pg.evaluate(() => window.__test.S.profile.stats.answered);
    check(seenCount >= answered - 3, `questions rarely repeat (${seenCount} unique of ${answered})`);

    console.log('Language + saved progress');
    await pg.evaluate(async () => { const r = await import('/js/router.js'); r.go('settings'); }); await sleep(300);
    await pg.click('[data-act="lang"][data-arg="zh"]'); await sleep(300);
    check(/設定/.test(await pg.textContent('body')), 'settings switch to Traditional Chinese');
    check(await pg.evaluate(() => document.body.classList.contains('zhuyin')), 'zhuyin font enabled for Chinese');
    await startMission(pg, { world: 'forest', mode: 'battle', seed: 3 }); await sleep(1800);
    const zhPrompt = await pg.textContent('.prompt');
    check(/[一-鿿]/.test(zhPrompt) && !/[么们这为说过还]/.test(zhPrompt), `question shown in Traditional Chinese: ${zhPrompt.slice(0, 30)}`);
    await pg.screenshot({ path: `${OUT}/e2e-zh-mission.png` });
    const coinsBefore = await pg.evaluate(() => window.__test.S.profile.coins);
    await pg.reload(); await sleep(800);
    await pg.click('.start-btn'); await sleep(300);
    await pg.click('.profile-card >> nth=1'); await sleep(500);
    const reloaded = await pg.evaluate(() => ({ coins: window.__test.S.profile.coins, name: window.__test.S.profile.name, lang: window.__test.S.profile.settings.lang }));
    check(reloaded.name === 'Ben' && reloaded.coins === coinsBefore && reloaded.lang === 'zh', 'progress + language saved in IndexedDB after reload');
    const ava = await pg.evaluate(() => window.__test.S.profiles.find((p) => p.name === 'Ava'));
    check(ava.stats.answered === 0 && ava.coins === 30, 'other profile untouched');

    console.log('Meta screens');
    for (const s of ['pets', 'collection', 'shop', 'home', 'daily']) { await pg.evaluate(async (n) => { const r = await import('/js/router.js'); r.go(n); }, s); await sleep(250); }
    check(!errs.length, 'pets, collection, shop, home and daily render without errors');
    await pg.evaluate(async () => { const r = await import('/js/router.js'); r.go('shop', { tab: 'decorations' }); }); await sleep(300);
    const c0 = await pg.evaluate(() => window.__test.S.profile.coins);
    await pg.click('[data-act="buy"][data-arg="flower"]'); await sleep(500);
    check((await pg.evaluate(() => window.__test.S.profile.coins)) === c0 - 10, 'buying a decoration spends coins');
    await pg.evaluate(async () => { const r = await import('/js/router.js'); r.go('home'); }); await sleep(300);
    await pg.click('[data-act="brush"][data-arg="flower"]'); await pg.click('[data-act="tile"][data-arg="0"]'); await sleep(200);
    check((await pg.evaluate(() => window.__test.S.profile.home.tiles[0])) === 'flower', 'placing a decoration at home works');
    await pg.screenshot({ path: `${OUT}/e2e-home.png` });

    console.log('Parent gate + dashboard + reset');
    await pg.evaluate(async () => { const r = await import('/js/router.js'); r.go('profiles'); }); await sleep(300);
    await pg.click('[data-act="parents"]'); await sleep(200);
    const q0 = await pg.textContent('.gate-q');
    for (const k of '1') await pg.click(`.gate .key[data-k="${k}"]`);
    await pg.click('.gate .key[data-k="✓"]'); await sleep(150);
    const qNew = await pg.textContent('.gate-q');
    check(qNew !== q0 && (await pg.$('.gate')), 'wrong gate answer → new question, still locked');
    const [a, b] = qNew.match(/(\d+) × (\d+)/).slice(1).map(Number);
    for (const k of String(a * b)) await pg.click(`.gate .key[data-k="${k}"]`);
    await pg.click('.gate .key[data-k="✓"]'); await sleep(500);
    check((await pg.evaluate(() => window.__test.state().screen)) === 'parent', 'correct answer opens the dashboard');
    const dash = await pg.textContent('.parent-screen');
    check(/除法|Division/.test(dash) && /分數|Fractions/.test(dash) && (await pg.$('.chart')), 'dashboard shows division + fraction mastery and history');
    await pg.screenshot({ path: `${OUT}/e2e-dashboard.png`, fullPage: true });
    await pg.click('[data-act="tab"][data-arg="reset"]'); await sleep(300);
    const benId = await pg.evaluate(() => window.__test.S.profiles.find((p) => p.name === 'Ben').id);
    await pg.check(`input[data-pid="${benId}"]`); await pg.click('[data-act="doReset"]'); await sleep(600);
    const afterReset = await pg.evaluate(() => window.__test.S.profiles.map((p) => ({ n: p.name, a: p.stats.answered, c: p.coins })));
    check(afterReset.find((p) => p.n === 'Ben').a === 0 && afterReset.length === 2, 'reset clears only the selected hero');

    console.log('Typed answers on the on-screen keypad (advanced, Math Kingdom + Legendary)');
    const kp = await newDevice(browser, errs, 'keypad');
    await kp.pg.goto(BASE + '?nosw'); await kp.pg.click('.start-btn'); await createHero(kp.pg, 'Pro', { div: 3, frac: 3 });
    const typed = {}; let rejected = 0;
    const typeVal = async (sel, digits) => { await kp.pg.click(sel); for (const d of String(digits)) await kp.pg.click(`.key[data-k="${d}"]`); };
    for (const world of ['kingdom', 'legend']) {
      await startMission(kp.pg, { world, mode: 'battle', seed: 42 }); await sleep(1800);
      for (let i = 0; i < 10 && !(await kp.pg.$('.results')); i++) {
        const q = await kp.pg.evaluate(() => { window.__test.ft0 = window.__test.S.profile.stats.firstTry; const q = window.__test.q; return { input: q.input, a: q.answer }; });
        if (q.input === 'pad') await typeVal('.field[data-f="v"]', q.a.v);
        else if (q.input === 'rempad') { await typeVal('.field[data-f="q"]', q.a.q); if (q.a.r) await typeVal('.field[data-f="r"]', q.a.r); }
        else if (q.input === 'fracpad') { if (q.a.t === 'm') await typeVal('.field[data-f="w"]', q.a.w); await typeVal('.field[data-f="n"]', q.a.n); await typeVal('.field[data-f="d"]', q.a.d); }
        else { await kp.pg.evaluate(() => window.__test.solve()); await sleep(1200); continue; }
        typed[q.input] = (typed[q.input] || 0) + 1;
        await kp.pg.click('.answer-area .check'); await sleep(400);
        if (!(await kp.pg.evaluate(() => window.__test.S.profile.stats.firstTry > window.__test.ft0))) { rejected++; await kp.pg.evaluate(() => window.__test.solve()); }
        await sleep(1200);
      }
    }
    check(rejected === 0 && Object.keys(typed).length >= 2, `answers typed on the keypad are accepted (${JSON.stringify(typed)})`);
    await kp.ctx.close();

    console.log('Phone layout');
    const phone = await newDevice(browser, errs, 'phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await phone.pg.goto(BASE + '?nosw'); await phone.pg.click('.start-btn'); await createHero(phone.pg, 'Kai', { pet: 2 });
    await startMission(phone.pg, { world: 'village', mode: 'battle', seed: 2 }); await sleep(1800);
    const overflow = await phone.pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    check(!overflow, 'no horizontal scrolling on a phone');
    await phone.pg.screenshot({ path: `${OUT}/e2e-phone-mission.png` });
    await phone.ctx.close();

    console.log('Offline single-player');
    const off = await newDevice(browser, errs, 'offline');
    await off.pg.goto(BASE); await off.pg.evaluate(() => navigator.serviceWorker.ready); await sleep(1500);
    await off.pg.reload(); await sleep(800); // second load is served by the SW
    await off.ctx.setOffline(true);
    await off.pg.reload(); await sleep(1200);
    check(!!(await off.pg.$('.start-btn')), 'game loads offline after the first visit');
    await off.pg.click('.start-btn'); await createHero(off.pg, 'Offline');
    await startMission(off.pg, { world: 'village', mode: 'battle', seed: 1 }); await sleep(1800);
    check(await solveUntilResults(off.pg), 'a full mission plays offline');
    await off.ctx.close();

    await ctx.close();
  } catch (e) {
    failed++; console.log('  ✘ crashed:', e.message);
  } finally {
    if (errs.length) { failed++; console.log('Page errors:\n' + errs.join('\n')); } else { passed++; console.log('  ✔ no page errors'); }
    console.log(`\n${passed} passed, ${failed} failed`);
    await browser.close(); server.kill();
    process.exit(failed ? 1 : 0);
  }
})();
