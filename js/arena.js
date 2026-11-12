// Epic co-op boss arena: phases, taunts, boss attacks the team always blocks,
// and an attack animation (the kid's chosen move) for every correct answer.
import { L, getLang } from './i18n.js';
import { el, $, $$, esc, reducedMotion, confetti } from './ui.js';
import { heroSVG, monsterSVG, makeMonster } from './art.js';
import { sfx, speak } from './audio.js';

const T = (en, zh) => ({ en, zh });
export const MOVE_INFO = {
  thunder: { icon: '⚡', color: '#fab005', name: T('Thunder Strike', '雷霆一擊') },
  fire: { icon: '🔥', color: '#fa5252', name: T('Fire Blast', '烈焰衝擊') },
  tornado: { icon: '🌪️', color: '#20c997', name: T('Tornado Spin', '龍捲旋風') },
  stars: { icon: '💫', color: '#b197fc', name: T('Star Shower', '星光雨') },
  ice: { icon: '❄️', color: '#4dabf7', name: T('Ice Beam', '冰凍光束') },
  dino: { icon: '🦖', color: '#51cf66', name: T('Dino Stomp', '恐龍重踏') },
};
const BOSS_ATTACKS = {
  village: [T('Cookie Crumble Storm', '餅乾碎碎風暴'), T('Sticky Syrup Wave', '黏黏糖漿浪')],
  forest: [T('Pepperoni Rain', '臘腸雨'), T('Cheese Net', '起司大網')],
  kingdom: [T('Mixed-up Boulder', '糊塗大石塊'), T('Muddle Quake', '糊塗地震')],
  legend: [T('Infinity Flame', '無限之火'), T('Chaos Vortex', '混沌漩渦')],
};
const TAUNTS = {
  1: [T('You can\'t divide ME!', '你們分不開我的！'), T('My fractions are too strong!', '我的分數太強了！')],
  2: [T('GRRR! Now I\'m ANGRY!', '吼！我生氣了！'), T('Lucky shot! Try that again!', '運氣好而已！再來啊！')],
  3: [T('FINAL FORM! Feel my power!', '最終型態！感受我的力量！'), T('Impossible… you\'re too smart!', '不可能…你們太聰明了！')],
};
const phaseOf = (g) => (g.hp <= 5 ? 3 : g.hp <= 10 ? 2 : 1);

export function createArena(host, { code, me }) {
  let g0 = null; let phase = 0; let lastHit = 0; let attackTimer = null; let alive = true; let mon = null;
  const node = el(`<div class="arena phase-1">
    <div class="boss-hud"><span class="boss-name"></span><div class="boss-hp"></div><span class="boss-count"></span></div>
    <div class="boss-stage"><div class="aura"></div><div class="boss-sprite"></div><div class="taunt" hidden></div><div class="combo" hidden></div></div>
    <div class="team-row"></div>
    <div class="arena-fx"></div>
    <div class="shield" hidden>🛡️</div>
  </div>`);
  host.replaceChildren(node);
  const sprite = $('.boss-sprite', node); const fx = $('.arena-fx', node);
  const drawBoss = (hurt = false) => { sprite.innerHTML = monsterSVG(mon, { size: 230, hurt }); };

  function taunt(text, ms = 2200) {
    const b = $('.taunt', node); b.textContent = L(text); b.hidden = false;
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    setTimeout(() => { if (alive) b.hidden = true; }, ms);
  }

  // The boss attacks every so often; the team's shield always blocks it.
  function scheduleAttack() {
    clearTimeout(attackTimer);
    attackTimer = setTimeout(() => {
      if (!alive || !g0 || g0.hp <= 0) return;
      const atk = (BOSS_ATTACKS[g0.world] || BOSS_ATTACKS.village)[Math.floor(Math.random() * 2)];
      node.classList.add('charging'); sfx('roar');
      taunt(T(`${g0.boss[0]} uses ${atk.en}!`, `${g0.boss[1]}使出${atk.zh}！`), 2000);
      setTimeout(() => {
        if (!alive) return;
        node.classList.remove('charging');
        if (!reducedMotion()) { node.classList.add('quake'); setTimeout(() => node.classList.remove('quake'), 600); }
        const sh = $('.shield', node); sh.hidden = false; sh.classList.remove('pop'); void sh.offsetWidth; sh.classList.add('pop');
        sfx('whoosh');
        setTimeout(() => { if (alive) { sh.hidden = true; taunt(T('Your team BLOCKED it! Keep going!', '你們擋下來了！繼續加油！'), 1600); } }, 900);
      }, 1300);
      scheduleAttack();
    }, 11000 + Math.random() * 6000);
  }

  function update(state) {
    const g = state.game; if (!g) return;
    if (!mon || !g0 || g0.boss[0] !== g.boss[0]) { mon = { ...makeMonster(code, g.world, true), name: g.boss }; drawBoss(); }
    g0 = g;
    $('.boss-name', node).textContent = L({ en: g.boss[0], zh: g.boss[1] });
    $('.boss-hp', node).innerHTML = Array.from({ length: g.maxHp }, (_, i) => `<i class="${i < g.hp ? 'on' : ''}"></i>`).join('');
    $('.boss-count', node).textContent = `${g.maxHp - g.hp} / ${g.maxHp}`;
    const ph = phaseOf(g);
    if (ph !== phase) {
      const first = phase === 0; phase = ph;
      node.classList.remove('phase-1', 'phase-2', 'phase-3'); node.classList.add(`phase-${ph}`);
      if (!first) { sfx('roar'); taunt(TAUNTS[ph][0], 2600); speak(L(TAUNTS[ph][0]), getLang()); }
    }
    $('.team-row', node).innerHTML = state.order.map((id) => {
      const pl = state.players[id]; const mv = MOVE_INFO[pl.move] || MOVE_INFO.stars;
      return `<div class="tr-hero ${id === me ? 'me' : ''} ${pl.connected ? '' : 'off'}" data-id="${id}">${heroSVG(pl.avatar, { size: id === me ? 86 : 70, glow: id === me })}<span class="name-badge" style="background:${pl.avatar.badge}">${esc(pl.name)}</span><span class="tr-move" title="${L(mv.name)}">${mv.icon}</span></div>`;
    }).join('');
    // play any new hits (works on every device, so everyone sees each other's attacks)
    const hits = (state.log || []).filter((e) => e.type === 'hit' && (e.n || 0) > lastHit);
    if (lastHit === 0 && hits.length > 1) { lastHit = Math.max(...hits.map((h) => h.n || 0)); return; } // joined late: don't replay history
    hits.forEach((h, i) => setTimeout(() => playHit(h, state), i * 700));
    if (hits.length) lastHit = Math.max(...hits.map((h) => h.n || 0));
    if (!attackTimer) scheduleAttack();
  }

  function playHit(h, state) {
    if (!alive) return;
    const mv = MOVE_INFO[h.move] || MOVE_INFO.stars;
    const heroEl = $(`.tr-hero[data-id="${h.who}"]`, node);
    const a = heroEl ? heroEl.getBoundingClientRect() : node.getBoundingClientRect();
    const b = sprite.getBoundingClientRect(); const base = node.getBoundingClientRect();
    const from = [a.left + a.width / 2 - base.left, a.top + a.height / 3 - base.top];
    const to = [b.left + b.width / 2 - base.left, b.top + b.height / 2 - base.top];
    if (heroEl) { heroEl.classList.add('lunge'); setTimeout(() => heroEl.classList.remove('lunge'), 450); }
    sfx('attack');
    const count = h.move === 'stars' ? 6 : h.move === 'fire' ? 3 : 1;
    if (!reducedMotion()) {
      for (let k = 0; k < count; k++) {
        const p = el(`<div class="proj proj-${h.move}" style="color:${mv.color}">${mv.icon}</div>`); fx.appendChild(p);
        const jitter = (k - (count - 1) / 2) * 26;
        const start = h.move === 'thunder' || h.move === 'dino' ? [to[0] + jitter, -60] : [from[0], from[1]];
        p.animate([
          { transform: `translate(${start[0]}px, ${start[1]}px) scale(.6) rotate(0deg)`, opacity: 1 },
          { transform: `translate(${to[0] + jitter}px, ${to[1]}px) scale(${h.move === 'dino' ? 2.6 : 1.6}) rotate(${h.move === 'tornado' ? 900 : 200}deg)`, opacity: 1 },
        ], { duration: 420 + k * 60, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' });
        setTimeout(() => p.remove(), 700 + k * 60);
      }
    }
    setTimeout(() => {
      if (!alive) return;
      sfx('hit');
      node.style.setProperty('--flash', mv.color);
      node.classList.add('flash'); setTimeout(() => node.classList.remove('flash'), 260);
      if (!reducedMotion()) { node.classList.add(h.move === 'dino' || h.crit ? 'quake-big' : 'quake'); setTimeout(() => node.classList.remove('quake', 'quake-big'), 500); }
      sprite.classList.add('boss-hit', `fx-${h.move}`); drawBoss(true);
      setTimeout(() => { if (alive) { sprite.classList.remove('boss-hit', `fx-${h.move}`); drawBoss(false); } }, 520);
      const who = state.players[h.who];
      const dmg = el(`<div class="dmgpop ${h.crit ? 'crit' : ''}" style="left:${to[0]}px;top:${to[1] - 40}px">${h.crit ? L(T('CRITICAL!', '會心一擊！')) : '-1'}<small>${esc(who ? who.name : '')} · ${mv.icon} ${L(mv.name)}</small></div>`);
      fx.appendChild(dmg); setTimeout(() => dmg.remove(), 1300);
      const c = $('.combo', node);
      if (h.combo >= 3) { c.textContent = `COMBO ×${h.combo}!`; c.hidden = false; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
      else c.hidden = true;
    }, reducedMotion() ? 50 : 420);
  }

  // Big finale when the boss falls; resolves when the animation is done.
  function playDefeat() {
    return new Promise((resolve) => {
      if (!alive) { resolve(); return; }
      clearTimeout(attackTimer);
      taunt(T('NOOOOO! …okay, you win. Let\'s be friends!', '不～～！好吧，你們贏了。我們做朋友吧！'), 2600);
      sfx('roar');
      node.classList.add('defeat');
      setTimeout(() => { sfx('levelup'); confetti(120); }, 900);
      setTimeout(resolve, reducedMotion() ? 300 : 2600);
    });
  }

  return {
    update, playDefeat,
    destroy() { alive = false; clearTimeout(attackTimer); },
  };
}

export function movePickerHTML(current) {
  return `<div class="moves"><b>${L(T('Your attack move:', '選擇你的招式：'))}</b><div class="move-row">${Object.entries(MOVE_INFO).map(([k, m]) => `<button class="move-btn ${k === current ? 'on' : ''}" data-act="move" data-arg="${k}" style="--mc:${m.color}"><span>${m.icon}</span><small>${L(m.name)}</small></button>`).join('')}</div></div>`;
}
