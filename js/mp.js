// Online co-op: private rooms with 4-digit codes and QR joining,
// shared lobby, boss battles, treasure hunts, relays and team building.
import { register, go } from './router.js';
import { S, save, grantRewards, checkAchievements, skillLevel } from './state.js';
import { t, L, getLang } from './i18n.js';
import { el, $, $$, bindActions, toast, burst, confetti, centerOf, esc, richL, fmtRich, progressBar, sleep } from './ui.js';
import { heroSVG, petSVG, monsterSVG, makeMonster, sceneSVG, chestSVG, decorSVG, itemSVG } from './art.js';
import { sfx, speak, stopMusic, startMusic } from './audio.js';
import { createNet, detectBackend } from './net.js';
import { renderInput } from './inputs.js';
import { visualHTML } from './mission.js';
import { createArena, movePickerHTML } from './arena.js';
import { isGentle } from './adaptive.js';
const CODE_LEN = 4; // must match shared/room-logic.js
import { qrSVG } from './qr.js';
import { fmt } from '../shared/fraction.js';

function myProfilePayload(p) {
  return { name: p.name, avatar: p.avatar, pet: p.activePet, petStage: p.pets[p.activePet]?.stage || 0, levels: { div: skillLevel(p, 'div'), frac: skillLevel(p, 'frac') }, gentle: isGentle(p), move: p.settings.move || 'stars' };
}
const errText = (e) => ({ notFound: t('roomNotFound'), full: t('roomFull'), started: t('roomStarted'), needPlayers: t('waitingPlayers') }[e] || t('reconnecting'));

// ---------------- entry ----------------
register('mp', async ({ code: autoCode } = {}) => {
  const p = S.profile;
  if (!p) { const n = el('<div></div>'); setTimeout(() => go('profiles'), 0); return n; }
  const backend = await detectBackend();
  const online = navigator.onLine !== false;
  const sess = p.mpSession;
  let codeEntry = autoCode ? String(autoCode).replace(/\D/g, '').slice(0, CODE_LEN) : '';
  const node = el(`<div class="mp-screen"><div class="scene-bg">${sceneSVG('kingdom')}</div>
    <header class="topbar"><button class="btn-icon" data-act="back">←</button><h1>🌐 ${t('mpTitle')}</h1></header>
    <div class="mp-panel card"></div></div>`);
  const panel = $('.mp-panel', node);
  const draw = () => {
    if (!online) { panel.innerHTML = `<p>📶 ${t('mpNeedsInternet')}</p>`; return; }
    if (!backend) { panel.innerHTML = `<p>🔧 ${t('mpNotConfigured')}</p><p class="small">${t('mpNeedsInternet')}</p>`; return; }
    panel.innerHTML = `
      <div class="lobby"><div class="pl">${heroSVG(p.avatar, { size: 90 })}<span class="name-badge" style="background:${p.avatar.badge}">${esc(p.name)}</span></div></div>
      ${sess ? `<button class="btn big" data-act="rejoin">↻ ${t('continue')}: ${sess.code}</button>` : ''}
      <button class="btn big" data-act="create">🏰 ${t('createRoom')}</button>
      <div><b>${t('joinRoom')}</b> — ${t('enterCode')}</div>
      <div class="code-input">${Array.from({ length: CODE_LEN }, (_, i) => `<span>${codeEntry[i] || ''}</span>`).join('')}</div>
      <div class="code-keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((c) => `<button class="key" data-act="ck" data-arg="${c}">${c}</button>`).join('')}<button class="key muted" data-act="cdel">⌫</button></div>
      <button class="btn big" data-act="join" ${codeEntry.length === CODE_LEN ? '' : 'disabled'}>${t('joinRoom')} ▶</button>
      <p class="small">${t('mpNeedsInternet')}</p>`;
  };
  draw();
  const net = backend ? await createNet() : null;
  let entering = false; // never join twice (auto-join + a tap on the button)
  const enter = async (fn) => {
    if (entering) return; entering = true;
    try {
      const out = await fn();
      if (!out.ok) { toast(errText(out.error), 'info', 2600); if (out.error === 'notFound') { codeEntry = ''; draw(); } return; }
      p.mpSession = { code: out.state.code, playerId: out.playerId, token: out.token };
      await save(p);
      go('mproom', { net, code: out.state.code, state: out.state });
    } catch (e) { toast(t('reconnecting'), 'info'); } finally { entering = false; }
  };
  bindActions(node, {
    back: () => go('hub'),
    ck: (c) => { if (codeEntry.length >= CODE_LEN) return; codeEntry += c; draw(); if (codeEntry.length === CODE_LEN) setTimeout(() => node.querySelector('[data-act="join"]')?.click(), 250); }, // 4th number joins right away
    cdel: () => { codeEntry = codeEntry.slice(0, -1); draw(); },
    create: () => enter(() => net.call({ action: 'create', profile: myProfilePayload(p) })),
    join: () => enter(() => net.call({ action: 'join', code: codeEntry, profile: myProfilePayload(p) })),
    rejoin: () => enter(async () => {
      const out = await net.call({ action: 'rejoin', code: sess.code, playerId: sess.playerId, token: sess.token });
      return out.ok ? { ...out, playerId: sess.playerId, token: sess.token } : out;
    }),
  });
  if (autoCode && codeEntry.length === CODE_LEN && net) {
    if (sess && sess.code === codeEntry) setTimeout(() => node.querySelector('[data-act="rejoin"]')?.click(), 50);
    else setTimeout(() => node.querySelector('[data-act="join"]')?.click(), 50);
  }
  return node;
});

// ---------------- room ----------------
register('mproom', ({ net, code, state: initial }) => {
  const p = S.profile; const sess = p.mpSession;
  const me = sess.playerId;
  stopMusic();
  let state = initial; let shownQid = null; let holdReveal = false; let busy = false; let input = null; let curQ = null; let alive = true; let lastStatus = 'up';
  let tries = 0;
  let arena = null; let endingHold = false;
  const killArena = () => { if (arena) { arena.destroy(); arena = null; } };
  const node = el(`<div class="mp-screen mproom"><div class="scene-bg">${sceneSVG('kingdom')}</div>
    <header class="topbar"><button class="btn-icon" data-act="leave" aria-label="${t('leaveRoom')}">←</button><h1>${t('roomCode')}: ${code}</h1></header>
    <div class="team-bar"></div>
    <div class="mp-body"><div class="mp-panel card mode-area"></div><div class="mp-panel card q-area"></div></div></div>`);
  const teamBar = $('.team-bar', node); const modeArea = $('.mode-area', node); const qArea = $('.q-area', node);

  const status = (s) => {
    if (s === lastStatus) return; lastStatus = s;
    $('.net-status')?.remove();
    if (s === 'down') document.body.appendChild(el(`<div class="net-status">📶 ${t('reconnecting')}</div>`));
    else { toast(t('reconnected'), 'good', 1200); }
  };
  const onState = (s) => {
    if (!alive || !s || s.code !== code) return;
    if (state && s.updated < state.updated) return; // ignore stale snapshots
    const prev = state; state = s;
    if (prev && prev.status === 'playing' && s.status === 'playing') celebrate(prev, s);
    if (prev && prev.status === 'playing' && s.status === 'ended' && s.mode === 'boss' && arena && !endingHold) {
      // let everyone see the final blow and the boss's big defeat before the results
      endingHold = true; arena.update({ ...s, status: 'playing' });
      setTimeout(() => arena && arena.playDefeat().then(() => { endingHold = false; killArena(); render(); }), 900);
      return;
    }
    if (endingHold) return;
    render();
  };
  const unsub = net.subscribe(code, onState, status);
  const call = async (body) => {
    try {
      const out = await net.call({ code, playerId: me, token: sess.token, ...body });
      if (out && out.state) onState(out.state);
      if (lastStatus === 'down') status('up');
      return out;
    } catch (e) { status('down'); return { ok: false, error: 'network' }; }
  };
  // heartbeat + polling fallback (also keeps presence fresh)
  const hb = setInterval(() => call({ action: 'ping' }), 5000);
  const onOnline = () => call({ action: 'rejoin' });
  const onVis = () => { if (document.visibilityState === 'visible') call({ action: 'rejoin' }); };
  const onHide = () => net.beacon && net.beacon({ action: 'away', code, playerId: me, token: sess.token });
  window.addEventListener('online', onOnline); document.addEventListener('visibilitychange', onVis); window.addEventListener('pagehide', onHide);
  call({ action: 'rejoin' });

  function celebrate(prev, s) {
    // play a hit animation when the shared boss takes damage
    if (s.mode === 'treasure' && s.game && prev.game && s.game.found > prev.game.found) { sfx('chest'); }
  }

  function playerChip(id) {
    const pl = state.players[id]; if (!pl) return '';
    const turn = state.status === 'playing' && state.mode === 'relay' && state.game.turn === id;
    const contrib = state.mode === 'boss' ? `⚔️ ${pl.damage}` : `✅ ${pl.correct}`;
    return `<div class="tp ${turn ? 'turn' : ''} ${pl.connected ? '' : 'off'}">${heroSVG(pl.avatar, { size: 40 })}<span class="name-badge" style="background:${pl.avatar.badge};font-size:12px">${esc(pl.name)}${id === me ? ` (${t('you')})` : ''}</span>
      <span>${id === state.hostId ? `👑 ${t('host')} · ` : ''}${state.status === 'lobby' ? '' : contrib}</span>${pl.connected ? '' : `<span class="small">${t('disconnected')}</span>`}</div>`;
  }

  function render() {
    teamBar.innerHTML = state.order.map(playerChip).join('');
    if (state.status !== 'playing' || state.mode !== 'boss') killArena();
    if (state.status === 'lobby') return renderLobby();
    if (state.status === 'ended') return renderEnd();
    renderMode(); renderQuestion();
  }

  function renderLobby() {
    const isHost = state.hostId === me;
    const online = state.order.filter((id) => state.players[id].connected).length;
    const joinUrl = `${location.origin}${location.pathname}?room=${code}`;
    let qr = ''; try { qr = qrSVG(joinUrl); } catch (e) { qr = ''; }
    modeArea.innerHTML = `<div class="room-code">${code}</div><div class="qr">${qr}</div><div class="small">${t('scanQr')} · ${esc(joinUrl)}</div>
      <p>${t('waitingPlayers')}</p>`;
    qArea.innerHTML = `<h3>${t('chooseMode')}</h3><div class="mode-grid">${['boss', 'treasure', 'relay', 'build'].map((m) => `<button class="mode-card card ${state.mode === m ? 'on' : ''}" data-act="mode" data-arg="${m}" ${isHost ? '' : 'disabled'}><b>${{ boss: '👑', treasure: '💰', relay: '🏃', build: '🏰' }[m]} ${t('mode_' + m)}</b>${t('modeDesc_' + m)}</button>`).join('')}</div>
      ${isHost ? `<button class="btn big" data-act="start" ${online >= 2 ? '' : 'disabled'}>▶ ${t('startGame')}</button>` : `<p class="small">👑 ${esc(state.players[state.hostId]?.name || '')}…</p>`}`;
    shownQid = null;
  }

  function renderMode() {
    const g = state.game;
    if (state.mode === 'boss') {
      if (!arena) {
        modeArea.innerHTML = '<div class="arena-host"></div><div class="moves-host"></div>';
        arena = createArena($('.arena-host', modeArea), { code, me });
      }
      arena.update(state);
      $('.moves-host', modeArea).innerHTML = movePickerHTML(p.settings.move || 'stars');
    } else if (state.mode === 'treasure') {
      const mine = state.players[me].pendingPick;
      modeArea.innerHTML = `<div><b>💰 ${g.found} / ${g.need}</b></div><div class="dig-grid">${g.tiles.map((x, i) => `<button class="dig ${x ? (x.treasure ? 'found' : 'dug') : ''}" data-act="pick" data-arg="${i}" ${x || !mine ? 'disabled' : ''}>${x ? (x.treasure ? '💎' : '·') : '🟫'}</button>`).join('')}</div>
        ${mine ? `<p class="praise">${t('pickSpot')}</p>` : ''}`;
    } else if (state.mode === 'relay') {
      const turnName = state.players[g.turn]?.name || '';
      modeArea.innerHTML = `<div class="relay"><b>🏃 ${t('leg')} ${Math.min(g.leg + 1, g.legs)} / ${g.legs}</b>${progressBar(g.leg / g.legs)}
        <p>${g.turn === me ? `⭐ ${t('yourTurn')}` : t('waitTurn', { p: esc(turnName) })}</p></div>`;
    } else {
      const mine = state.players[me].pendingPick;
      modeArea.innerHTML = `<div><b>🏰 ${g.placed} / ${g.need}</b></div><div class="castle-grid">${g.blocks.map((x, i) => `<button class="cb ${x ? 'on' : ''}" data-act="pick" data-arg="${i}" ${x || !mine ? 'disabled' : ''} style="${x ? `border-color:${state.players[x.by]?.avatar.badge || '#1b1530'}` : ''}"></button>`).join('')}</div>
        ${mine ? `<p class="praise">${t('pickBlock')}</p>` : ''}`;
    }
  }

  function renderQuestion() {
    if (holdReveal) return;
    const mine = state.players[me];
    if (!mine.q) {
      shownQid = null;
      qArea.innerHTML = mine.pendingPick ? `<p class="praise">🌟 ${state.mode === 'build' ? t('pickBlock') : t('pickSpot')}</p>`
        : state.mode === 'relay' ? `<p>${t('waitTurn', { p: esc(state.players[state.game.turn]?.name || '') })}</p>${heroSVG(state.players[state.game.turn]?.avatar || {}, { size: 90 })}` : '<p>…</p>';
      return;
    }
    if (mine.q.qid === shownQid) return;
    shownQid = mine.q.qid; tries = 0;
    const q = { ...mine.q }; curQ = q;
    qArea.innerHTML = `<div class="prompt">${richL(q.prompt)}</div><div class="visual">${q.input === 'share' ? '' : visualHTML(q.visual)}</div><div class="answer-area"></div><div class="feedback"></div>
      <div class="qtools"><button class="chip" data-act="hint">💡 ${t('hint')}</button><button class="chip" data-act="read">🔊</button></div>`;
    if (p.settings.narration) speak(L(q.prompt), getLang());
    input = renderInput(q, $('.answer-area', qArea), submit);
    if (window.__test) Object.assign(window.__test, { mpQ: q, mpSubmit: submit });
  }

  async function submit(value, btn) {
    if (busy || !curQ) return; busy = true;
    const qid = curQ.qid;
    const out = await call({ action: 'answer', qid, value, move: p.settings.move || 'stars' });
    busy = false;
    const fb = $('.feedback', qArea); if (!fb) return;
    if (!out.ok) { if (out.error === 'stale') { shownQid = null; render(); } return; }
    if (out.almost) { fb.innerHTML = `<div class="nudge">${t(out.almost === 'simplify' ? 'almostSimplify' : out.almost === 'mixed' ? 'almostMixed' : 'almostImproper')}</div>`; return; }
    if (out.correct) {
      sfx('correct'); fb.innerHTML = `<div class="praise">🌟 ${t('correct')}</div>`;
      const [x, y] = centerOf(btn || fb); burst(x, y);
      await sleep(700); shownQid = null; render();
      return;
    }
    if (out.retry) {
      sfx('gentle'); input.wrong && input.wrong(btn); tries++;
      fb.innerHTML = `<div class="encourage">💪 ${t('tryAgain')}${out.misconception ? `<div class="small">${t('misconception_' + out.misconception)}</div>` : ''}</div>${curQ.hints && curQ.hints[0] ? `<div class="hint-box">💡 ${richL(curQ.hints[0])}</div>` : ''}`;
      return;
    }
    // revealed
    holdReveal = true; sfx('gentle');
    curQ.answer = out.reveal; input.reveal && input.reveal();
    fb.innerHTML = `<div class="reveal-line">💡 ${t('reveal')} ${t('answerWas', { a: fmtRich(out.reveal) })}</div>${(out.steps || []).map((s, i) => `<div class="step"><b>${i + 1}</b> ${richL(s)}</div>`).join('')}<button class="btn big got-it">${L({ en: 'Got it! ▶', zh: '懂了！▶' })}</button>`;
    $('.got-it', fb).addEventListener('click', () => { holdReveal = false; shownQid = null; render(); });
  }

  function renderEnd() {
    const r = state.rewards && state.rewards[me];
    const key = `${code}-${state.endedAt}`;
    if (r && !(p.mpApplied || {})[key]) {
      p.mpApplied = { ...(p.mpApplied || {}), [key]: Date.now() };
      const keys = Object.keys(p.mpApplied); if (keys.length > 50) delete p.mpApplied[keys[0]];
      grantRewards(p, { xp: r.xp, coins: r.coins, gems: r.gems, petXp: r.correct * 5 + 5 });
      p.stats.teamWins = (p.stats.teamWins || 0) + 1; p.stats.missions++;
      checkAchievements(p); save(p); confetti(); sfx('levelup');
    }
    const isHost = state.hostId === me;
    modeArea.innerHTML = `<h2>🏆 ${t('teamWin')}</h2>${r && r.teamBonus ? `<p class="praise">🤝 ${t('teamBonus')}</p>` : ''}
      <div class="lobby">${state.order.map((id) => { const pl = state.players[id]; return `<div class="pl card">${heroSVG(pl.avatar, { size: 64 })}<b>${esc(pl.name)}</b><span>✅ ${pl.correct}${state.mode === 'boss' ? ` · ⚔️ ${pl.damage}` : ''}</span></div>`; }).join('')}</div>`;
    qArea.innerHTML = `${r ? `<h3>${t('rewards')}</h3><div class="reward-row"><span class="rw">⭐ +${r.xp}</span><span class="rw">${itemSVG('coin', 24)} +${r.coins}</span><span class="rw">${itemSVG('gemIcon', 24)} +${r.gems}</span></div><p class="small">🔒 ${t('serverChecked')}</p>` : ''}
      ${isHost ? `<div class="mode-grid">${['boss', 'treasure', 'relay', 'build'].map((m) => `<button class="mode-card card" data-act="again" data-arg="${m}"><b>▶ ${t('mode_' + m)}</b></button>`).join('')}</div>` : ''}
      <button class="btn ghost" data-act="leave">${t('leaveRoom')}</button>`;
  }

  bindActions(node, {
    leave: async () => { await call({ action: 'leave' }); p.mpSession = null; await save(p); go('hub'); },
    mode: (m) => call({ action: 'setMode', mode: m }),
    move: (k) => { p.settings.move = k; save(p); sfx('tap'); const mh = $('.moves-host', modeArea); if (mh) mh.innerHTML = movePickerHTML(k); call({ action: 'setMove', move: k }); },
    start: async () => { const o = await call({ action: 'start' }); if (!o.ok) toast(errText(o.error), 'info'); },
    again: async (m) => { const o = await call({ action: 'start', mode: m }); if (!o.ok) toast(errText(o.error), 'info'); },
    pick: async (i, b) => { const o = await call({ action: 'pick', index: +i }); if (o.ok && o.found) { const [x, y] = centerOf(b); burst(x, y, 24); sfx('chest'); } else if (o.ok) sfx('drop'); },
    hint: () => { if (curQ && curQ.hints && curQ.hints.length) { const fb = $('.feedback', qArea); fb.innerHTML = `<div class="hint-box">💡 ${richL(curQ.hints[Math.min(tries, curQ.hints.length - 1)])}</div>`; } },
    read: () => curQ && speak(L(curQ.prompt), getLang()),
  });
  render();
  if (window.__test) window.__test.mpState = () => state;
  return {
    node,
    cleanup: () => { killArena(); alive = false; clearInterval(hb); unsub(); window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', onHide); $('.net-status')?.remove(); },
  };
});
