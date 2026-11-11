// Parent gate + dashboard + reset records.
import { register, go, refresh } from './router.js';
import { S, save, loadProfiles, newProfile } from './state.js';
import * as db from './db.js';
import { t, L, getLang } from './i18n.js';
import { el, $, $$, bindActions, toast, modal, progressBar, esc } from './ui.js';
import { heroSVG, sceneSVG } from './art.js';
import { CONCEPTS, skillOf, conceptLevels } from '../shared/mathgen.js';
import { conceptMastery, levelOf, skillMastery, suggestions, newLearning } from './adaptive.js';
import { sfx } from './audio.js';

// Gate: a 3-digit × 2-digit multiplication on an on-screen keypad. New question after a wrong answer.
export function parentGate(onPass) {
  let a; let b; let val = '';
  const fresh = () => { a = 100 + Math.floor(Math.random() * 900); b = 11 + Math.floor(Math.random() * 89); val = ''; };
  fresh();
  const m = modal(`<h2>🔒 ${t('parentGate')}</h2><p class="gate-q"></p><div class="gate-val"></div><div class="keys">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map((k) => `<button class="key" data-k="${k}">${k}</button>`).join('')}</div><div class="gate-msg small"></div>`, { cls: 'gate' });
  const draw = () => { $('.gate-q', m.box).textContent = t('parentGateQ', { a, b }); $('.gate-val', m.box).textContent = val || ' '; };
  draw();
  m.box.addEventListener('click', (e) => {
    const k = e.target.closest('.key')?.dataset.k; if (!k) return;
    if (k === '⌫') val = val.slice(0, -1);
    else if (k === '✓') {
      if (parseInt(val, 10) === a * b) { m.close(); onPass(); return; }
      $('.gate-msg', m.box).textContent = t('parentGateWrong'); fresh();
    } else if (val.length < 6) val += k;
    draw();
  });
}

function fmtMin(ms) { return `${Math.round(ms / 60000)} ${t('minutes')}`; }

function historyChart(L) {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ k, label: `${d.getMonth() + 1}/${d.getDate()}`, ...(L.days[k] || { ms: 0, q: 0, ft: 0 }) });
  }
  const maxQ = Math.max(5, ...days.map((d) => d.q));
  const w = 28; const h = 110;
  return `<svg class="chart" viewBox="0 0 ${days.length * w + 10} ${h + 34}" role="img" aria-label="${t('learningHistory')}">
    ${days.map((d, i) => {
    const bh = (d.q / maxQ) * h; const fh = (d.ft / maxQ) * h;
    return `<g><rect x="${i * w + 6}" y="${h - bh + 4}" width="${w - 8}" height="${bh}" rx="3" fill="var(--chart-q)"><title>${d.label}: ${d.q} Q, ${d.ft} first-try, ${fmtMin(d.ms)}</title></rect>
        <rect x="${i * w + 6}" y="${h - fh + 4}" width="${w - 8}" height="${fh}" rx="3" fill="var(--chart-ok)"/>
        <text x="${i * w + 6 + (w - 8) / 2}" y="${h + 20}" font-size="9" text-anchor="middle" fill="currentColor">${d.label}</text>
        ${d.q ? `<text x="${i * w + 6 + (w - 8) / 2}" y="${h - bh}" font-size="9" text-anchor="middle" fill="currentColor">${d.q}</text>` : ''}</g>`;
  }).join('')}</svg>
  <div class="legend small"><i style="background:var(--chart-q)"></i>${t('questionsAnswered')} <i style="background:var(--chart-ok)"></i>${t('firstTry')}</div>`;
}

register('parent', ({ tab = 'dash', pid } = {}) => {
  const profiles = S.profiles;
  const p = profiles.find((x) => x.id === pid) || S.profile || profiles[0];
  let body = '';
  if (!profiles.length) body = `<p>${t('none')}</p>`;
  else if (tab === 'reset') {
    body = `<div class="card pad"><h3>♻️ ${t('resetRecords')}</h3><p>${t('resetWho')}</p>
      ${profiles.map((x) => `<label class="toggle"><input type="checkbox" data-pid="${x.id}"> ${esc(x.name)}</label>`).join('')}
      <button class="btn big danger" data-act="doReset">${t('resetNow')}</button></div>`;
  } else {
    const Ln = p.learning;
    const all = Ln.log; const ftAll = Object.values(Ln.days).reduce((s, d) => s + d.ft, 0); const qAll = Object.values(Ln.days).reduce((s, d) => s + d.q, 0); const okAll = Object.values(Ln.days).reduce((s, d) => s + d.ok, 0);
    const ms = Object.values(Ln.days).reduce((s, d) => s + d.ms, 0);
    const rows = (skill) => Object.keys(CONCEPTS).filter((c) => skillOf(c) === skill).map((c) => {
      const m = conceptMastery(Ln, c);
      const st = m.status === 'mastered' ? t('mastered') : m.status === 'practice' ? t('needsPractice') : m.attempts ? t('practicing') : t('notStarted');
      return `<tr class="st-${m.status}"><td>${L(CONCEPTS[c].name)} <span class="small">L${conceptLevels(c).join('/')}</span></td><td>${progressBar(m.mastery)}</td><td>${m.attempts ? Math.round(m.acc * 100) + '%' : '–'}</td><td>${m.attempts}</td><td>${st}</td></tr>`;
    }).join('');
    const mastered = Object.keys(CONCEPTS).filter((c) => conceptMastery(Ln, c).status === 'mastered');
    const practice = Object.keys(CONCEPTS).filter((c) => conceptMastery(Ln, c).status === 'practice');
    const sug = suggestions(Ln).slice(0, 4);
    const worldFor = (c) => t(skillOf(c) === 'div' ? 'village' : 'forest');
    const lvSel = (skill) => `<select data-skill="${skill}">${[1, 2, 3].map((n) => `<option value="${n}" ${levelOf(Ln.skill[skill]) === n ? 'selected' : ''}>${t(['beginner', 'intermediate', 'advanced'][n - 1])}</option>`).join('')}</select>`;
    body = `
      <div class="ptabs">${profiles.map((x) => `<button class="tab ${x.id === p.id ? 'on' : ''}" data-act="pick" data-arg="${x.id}">${esc(x.name)}</button>`).join('')}</div>
      <div class="dash-grid">
        <div class="card stat"><b>${fmtMin(ms)}</b><span>${t('timePlayed')}</span></div>
        <div class="card stat"><b>${qAll}</b><span>${t('questionsAnswered')}</span></div>
        <div class="card stat"><b>${qAll ? Math.round((okAll / qAll) * 100) : 0}%</b><span>${t('accuracy')}</span></div>
        <div class="card stat"><b>${qAll ? Math.round((ftAll / qAll) * 100) : 0}%</b><span>${t('firstTryAcc')}</span></div>
      </div>
      <div class="card pad"><h3>${t('learningHistory')}</h3>${historyChart(Ln)}</div>
      <div class="card pad"><h3>➗ ${t('division')} — ${t(['beginner', 'intermediate', 'advanced'][levelOf(Ln.skill.div) - 1])} · ${t('mastery')} ${Math.round(skillMastery(Ln, 'div') * 100)}%</h3>
        <table class="mtable"><thead><tr><th></th><th>${t('mastery')}</th><th>${t('firstTry')}</th><th>#</th><th></th></tr></thead><tbody>${rows('div')}</tbody></table></div>
      <div class="card pad"><h3>🍕 ${t('fractions')} — ${t(['beginner', 'intermediate', 'advanced'][levelOf(Ln.skill.frac) - 1])} · ${t('mastery')} ${Math.round(skillMastery(Ln, 'frac') * 100)}%</h3>
        <table class="mtable"><thead><tr><th></th><th>${t('mastery')}</th><th>${t('firstTry')}</th><th>#</th><th></th></tr></thead><tbody>${rows('frac')}</tbody></table></div>
      <div class="card pad two-col">
        <div><h3>🏅 ${t('conceptsMastered')}</h3>${mastered.length ? `<ul>${mastered.map((c) => `<li>${L(CONCEPTS[c].name)}</li>`).join('')}</ul>` : `<p class="small">${t('none')}</p>`}</div>
        <div><h3>🌱 ${t('areasPractice')}</h3>${practice.length ? `<ul>${practice.map((c) => `<li>${L(CONCEPTS[c].name)} (${Math.round(conceptMastery(Ln, c).acc * 100)}%)</li>`).join('')}</ul>` : `<p class="small">${t('none')}</p>`}</div>
      </div>
      <div class="card pad"><h3>🎯 ${t('goals')}</h3><ul>${sug.length ? sug.map((s) => `<li>${s.kind === 'practice' ? t('goalPractice', { c: L(CONCEPTS[s.c].name), p: Math.round(s.m.acc * 100) }) : t('goalNext', { c: L(CONCEPTS[s.c].name), w: worldFor(s.c) })}</li>`).join('') : `<li>${t('goalNone')}</li>`}</ul></div>
      <div class="card pad"><h3>⚙️ ${t('settings')} — ${esc(p.name)}</h3>
        <div class="set-row"><b>${t('setLevel')}</b> ➗ ${lvSel('div')} 🍕 ${lvSel('frac')}</div>
        <div class="set-row"><b>${t('hintMode')}</b><select data-set="hintMode"><option value="auto" ${p.settings.hintMode === 'auto' ? 'selected' : ''}>${t('hintAuto')}</option><option value="ask" ${p.settings.hintMode === 'ask' ? 'selected' : ''}>${t('hintAsk')}</option></select></div>
        <div class="set-row"><b>${t('breakEvery')}</b><select data-set="breakEvery">${[0, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${p.settings.breakEvery === n ? 'selected' : ''}>${n || t('off')}</option>`).join('')}</select></div>
        <label class="toggle"><input type="checkbox" data-set="timed" ${p.settings.timed ? 'checked' : ''}> ${t('timedOn')}</label>
        <button class="btn ghost danger" data-act="del">🗑 ${t('deleteHero')}</button>
      </div>
      <p class="small">${t('deviceNote')}</p>`;
  }
  const node = el(`<div class="parent-screen"><div class="panel-wide">
    <header class="topbar solid"><button class="btn-icon" data-act="back">←</button><h1>👪 ${t('dashboard')}</h1>
    <div class="tabs"><button class="tab ${tab === 'dash' ? 'on' : ''}" data-act="tab" data-arg="dash">${t('dashboard')}</button><button class="tab ${tab === 'reset' ? 'on' : ''}" data-act="tab" data-arg="reset">${t('resetRecords')}</button></div></header>
    ${body}</div></div>`);
  node.addEventListener('change', async (e) => {
    const sk = e.target.dataset.skill;
    if (sk) { const lv = +e.target.value; p.learning.skill[sk].r = (lv - 1) * 100 + 10; p.learning.skill[sk].sessionsAtLevel = []; await save(p); toast('✔', 'good', 800); return; }
    const k = e.target.dataset.set;
    if (k) { p.settings[k] = e.target.type === 'checkbox' ? e.target.checked : (k === 'breakEvery' ? +e.target.value : e.target.value); await save(p); toast('✔', 'good', 800); }
  });
  bindActions(node, {
    back: () => go(S.profile ? 'hub' : 'profiles'),
    tab: (x) => go('parent', { tab: x, pid: p && p.id }, { replace: true }),
    pick: (id) => go('parent', { tab, pid: id }, { replace: true }),
    doReset: async () => {
      const ids = $$('input[data-pid]:checked', node).map((i) => i.dataset.pid);
      if (!ids.length) return;
      for (const id of ids) {
        const old = profiles.find((x) => x.id === id);
        // Clear everything for this hero but keep the name + look so they can start fresh.
        const fresh = newProfile({ name: old.name, avatar: { ...old.avatar, hat: null, cape: null, held: null }, pet: Object.keys(old.pets).sort((a, b) => old.pets[a].found - old.pets[b].found)[0] || 'divi', lang: old.settings.lang });
        fresh.id = old.id; fresh.created = old.created;
        await save(fresh);
        if (S.profile && S.profile.id === id) S.profile = fresh;
      }
      await loadProfiles();
      if (S.profile) S.profile = S.profiles.find((x) => x.id === S.profile.id) || null;
      toast(t('resetDone'), 'good'); sfx('whoosh'); refresh();
    },
    del: async () => {
      const m = modal(`<h3>🗑 ${t('deleteHero')}: ${esc(p.name)}?</h3><div class="row gap center"><button class="btn danger" data-x="yes">${t('yes')}</button><button class="btn ghost" data-x="no">${t('no')}</button></div>`);
      m.box.addEventListener('click', async (e) => {
        const x = e.target.closest('[data-x]')?.dataset.x; if (!x) return; m.close();
        if (x === 'yes') { await db.deleteProfile(p.id); await loadProfiles(); if (S.profile && S.profile.id === p.id) S.profile = null; go('profiles'); }
      });
    },
  });
  return node;
});
