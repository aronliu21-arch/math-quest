// Little Explorer (age 3) play-through: preset, all 5 activities, real drag,
// two-miss reveal, stickers, and returning to the mode after reload.
// Run: node tests/little-e2e.cjs
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const PORT = 7000 + Math.floor(Math.random() * 900);
let fails = 0; const check = (c, m) => { console.log(c ? '  ✔' : '  ✘', m); if (!c) fails++; };
(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'dev-server.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
  const errs = []; pg.on('pageerror', e => errs.push(e.message + e.stack)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(`http://localhost:${PORT}/?nosw`); await pg.waitForTimeout(300);
  await pg.click('.start-btn'); await pg.click('.profile-card.new'); await pg.fill('.name-input', 'Kai');
  await pg.click('[data-act="next"]'); await pg.click('[data-act="preset"][data-arg="dino3"]');
  await pg.screenshot({ path: path.join(__dirname, '..', 'test-output', 'l-preset.png') });
  await pg.click('[data-act="next"]'); await pg.click('[data-act="next"]'); await pg.click('.pet-card >> nth=0');
  check(/go|出發/i.test(await pg.textContent('[data-act="next"]')), 'dino preset skips the level step');
  await pg.click('[data-act="next"]'); await pg.waitForTimeout(800);
  check((await pg.evaluate(() => window.__test.state().screen)) === 'little' && (await pg.evaluate(() => window.__test.S.profile.settings.narration)), 'opens Little Explorer with read-aloud on');
  await pg.screenshot({ path: path.join(__dirname, '..', 'test-output', 'l-home.png') });
  const kinds = {};
  for (const k of ['count', 'add', 'share', 'half', 'more']) {
    await pg.click(`.lt-tile[data-arg="${k}"]`); await pg.waitForTimeout(500);
    for (let i = 0; i < 5; i++) {
      const q = await pg.evaluate(() => window.__test.little);
      kinds[q.kind] = (kinds[q.kind] || 0) + 1;
      if (i === 0) await pg.screenshot({ path: path.join(__dirname, '..', 'test-output', `l-${k}.png`) });
      if (q.kind === 'share' && i === 0) {
        // drag one cookie for real, then tap plates evenly
        const tok = await (await pg.$('.pile .token')).boundingBox(); const pl = await (await pg.$('.plate[data-z="0"]')).boundingBox();
        await pg.mouse.move(tok.x + 10, tok.y + 10); await pg.mouse.down(); await pg.mouse.move(tok.x + 50, tok.y + 50, { steps: 4 }); await pg.mouse.move(pl.x + pl.width / 2, pl.y + pl.height / 2, { steps: 6 }); await pg.mouse.up();
        for (let g = 0; g < q.groups; g++) for (let j = (g === 0 ? 1 : 0); j < q.answer; j++) await pg.click(`.plate[data-z="${g}"]`, { position: { x: 20, y: 120 } });
        await pg.waitForTimeout(800);
        check((await pg.textContent('.lt-fb')).includes('⭐'), 'sharing cookies by drag + tap is accepted without a Check button');
      } else if (i === 1) { // two mistakes → reveal path
        await pg.evaluate(() => window.__test.littleWrong()); await pg.waitForTimeout(300);
        await pg.evaluate(() => window.__test.littleWrong()); await pg.waitForTimeout(200);
        if (i === 1 && k === 'count') await pg.screenshot({ path: path.join(__dirname, '..', 'test-output', 'l-reveal.png') });
      } else {
        await pg.evaluate(() => window.__test.littleSolve());
      }
      await pg.waitForTimeout(q.kind === 'share' && i === 0 ? 1500 : 2900);
    }
    await pg.waitForTimeout(600);
    if (k === 'count') await pg.screenshot({ path: path.join(__dirname, '..', 'test-output', 'l-done.png') });
    const done = !!(await pg.$('.lt-done'));
    check(done, `${k}: round of 5 finishes with a sticker screen`);
    await pg.click('[data-act2="home"]'); await pg.waitForTimeout(400);
  }
  const lt = await pg.evaluate(() => window.__test.S.profile.little);
  check(lt.stickers.length === 5, `earned 5 dinosaur stickers (stars ${lt.stars})`);
  await pg.click('[data-act="book"]'); await pg.waitForTimeout(300); await pg.screenshot({ path: path.join(__dirname, '..', 'test-output', 'l-book.png') });
  // reload: goes straight back to little mode
  await pg.reload(); await pg.waitForTimeout(500); await pg.click('.start-btn'); await pg.waitForTimeout(300);
  await pg.click('.profile-card >> nth=0'); await pg.waitForTimeout(500);
  check((await pg.evaluate(() => window.__test.state().screen)) === 'little' && (await pg.evaluate(() => window.__test.S.profile.little.stickers.length)) === 5, 'after reload: back in Little Explorer, stickers kept');
  check(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close(); server.kill();
  process.exit(fails ? 1 : 0);
})();
