// Synthesized music + sound effects (Web Audio, no audio files) and
// English / Taiwan-Mandarin narration (speechSynthesis).
let ctx = null; let master; let musicGain; let sfxGain;
const state = { sound: true, music: true, musicOn: false, timer: null, step: 0, nextTime: 0, theme: 'menu' };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  musicGain = ctx.createGain(); musicGain.gain.value = 0; musicGain.connect(master);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.6; sfxGain.connect(master);
  // iOS: play a silent buffer inside the tap to unlock audio
  const b = ctx.createBuffer(1, 1, 22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
}

export function setSoundPrefs({ sound, music }) {
  state.sound = sound; state.music = music;
  if (!music) stopMusic(); else if (state.wantMusic) startMusic(state.theme);
}

function tone(freq, start, dur, { type = 'triangle', vol = 0.2, dest, attack = 0.01, slide } = {}) {
  if (!ctx) return;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, start);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g); g.connect(dest || sfxGain);
  o.start(start); o.stop(start + dur + 0.05);
}

function noise(start, dur, vol, dest, hp = 4000) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(dest || sfxGain); s.start(start);
}

const N = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function sfx(name) {
  if (!ctx || !state.sound) return;
  const t = ctx.currentTime + 0.01;
  switch (name) {
    case 'tap': tone(880, t, 0.06, { type: 'sine', vol: 0.15 }); break;
    case 'correct': [72, 76, 79, 84].forEach((m, i) => tone(N(m), t + i * 0.07, 0.22, { type: 'triangle', vol: 0.25 })); break;
    case 'gentle': tone(N(64), t, 0.18, { type: 'sine', vol: 0.15 }); tone(N(60), t + 0.15, 0.25, { type: 'sine', vol: 0.12 }); break;
    case 'coin': tone(N(88), t, 0.08, { type: 'square', vol: 0.08 }); tone(N(93), t + 0.07, 0.25, { type: 'square', vol: 0.08 }); break;
    case 'attack': noise(t, 0.25, 0.3, null, 1500); tone(300, t, 0.25, { type: 'sawtooth', vol: 0.12, slide: 80 }); break;
    case 'hit': tone(160, t, 0.18, { type: 'square', vol: 0.18, slide: 60 }); noise(t, 0.12, 0.2, null, 800); break;
    case 'chest': [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => tone(N(m), t + i * 0.05, 0.3, { type: 'triangle', vol: 0.18 })); break;
    case 'levelup': [67, 72, 76, 79, 84, 88, 91].forEach((m, i) => tone(N(m), t + i * 0.09, 0.35, { type: 'square', vol: 0.09 })); break;
    case 'evolve': for (let i = 0; i < 16; i++) tone(N(72 + i * 2), t + i * 0.05, 0.2, { type: 'sine', vol: 0.12 }); break;
    case 'drop': tone(N(79), t, 0.1, { type: 'sine', vol: 0.15, slide: N(84) }); break;
    case 'whoosh': noise(t, 0.3, 0.15, null, 2500); break;
    case 'tick': tone(1200, t, 0.03, { type: 'square', vol: 0.05 }); break;
    case 'roar': tone(180, t, 0.6, { type: 'sawtooth', vol: 0.16, slide: 70 }); tone(240, t, 0.5, { type: 'square', vol: 0.06, slide: 90 }); noise(t, 0.5, 0.12, null, 600); break;
    case 'join': tone(N(76), t, 0.12, { type: 'triangle', vol: 0.2 }); tone(N(83), t + 0.1, 0.2, { type: 'triangle', vol: 0.2 }); break;
    default: break;
  }
}

// ---------- music: an original heroic anthem (C major, I–V–vi–IV–I–IV–V–I) ----------
const PROG = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60], [60, 64, 67], [53, 57, 60], [55, 59, 62], [60, 64, 67]];
const MELODY = [
  76, 0, 79, 76, 74, 0, 72, 0, 74, 0, 76, 79, 81, 0, 79, 0,
  76, 0, 72, 74, 76, 0, 74, 72, 69, 0, 72, 0, 74, 0, 0, 0,
  76, 0, 79, 81, 84, 0, 81, 79, 77, 0, 76, 74, 72, 0, 74, 76,
  77, 0, 76, 74, 79, 0, 77, 76, 74, 0, 71, 0, 72, 0, 0, 0,
];
const CALM = [72, 0, 0, 76, 0, 0, 79, 0, 77, 0, 0, 76, 0, 0, 74, 0];

function scheduleStep(step, time) {
  const s16 = 60 / (state.theme === 'menu' ? 132 : 100) / 4;
  const bar = Math.floor(step / 16) % 8;
  const chord = PROG[bar];
  const i = step % 16;
  if (state.theme === 'menu') {
    const m = MELODY[step % 64];
    if (m) tone(N(m), time, s16 * 1.8, { type: 'square', vol: 0.06, dest: musicGain });
    if (i % 4 === 0) tone(N(chord[0] - 24), time, s16 * 3.5, { type: 'triangle', vol: 0.22, dest: musicGain });
    if (i % 2 === 0) tone(N(chord[(i / 2) % 3] + 12), time, s16 * 1.2, { type: 'triangle', vol: 0.05, dest: musicGain });
    if (i % 8 === 0) noise(time, 0.12, 0.25, musicGain, 60);
    if (i % 8 === 4) noise(time, 0.1, 0.12, musicGain, 1800);
    if (i % 2 === 1) noise(time, 0.03, 0.05, musicGain, 7000);
  } else {
    const m = CALM[i];
    if (m) tone(N(m - 12 + (chord[0] - 60)), time, s16 * 4, { type: 'sine', vol: 0.05, dest: musicGain });
    if (i === 0) chord.forEach((c) => tone(N(c - 12), time, s16 * 15, { type: 'sine', vol: 0.03, dest: musicGain, attack: 0.3 }));
  }
}

export function startMusic(theme = 'menu') {
  state.wantMusic = true; state.theme = theme;
  if (!ctx || !state.music) return;
  musicGain.gain.cancelScheduledValues(ctx.currentTime);
  musicGain.gain.setTargetAtTime(theme === 'menu' ? 0.55 : 0.35, ctx.currentTime, 0.4);
  if (state.timer) return;
  state.nextTime = ctx.currentTime + 0.1;
  state.timer = setInterval(() => {
    const s16 = 60 / (state.theme === 'menu' ? 132 : 100) / 4;
    while (state.nextTime < ctx.currentTime + 0.2) { scheduleStep(state.step, state.nextTime); state.step++; state.nextTime += s16; }
  }, 50);
}

export function stopMusic() {
  state.wantMusic = false;
  if (!ctx) return;
  musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
  // keep scheduling quietly during the fade, then stop (unless music restarted)
  const timer = state.timer;
  if (timer) setTimeout(() => { if (!state.wantMusic && state.timer === timer) { clearInterval(timer); state.timer = null; } }, 1500);
}

// ---------- narration ----------
const EN_ORD = { 2: ['half', 'halves'], 3: ['third', 'thirds'], 4: ['fourth', 'fourths'], 5: ['fifth', 'fifths'], 6: ['sixth', 'sixths'], 7: ['seventh', 'sevenths'], 8: ['eighth', 'eighths'], 9: ['ninth', 'ninths'], 10: ['tenth', 'tenths'], 11: ['eleventh', 'elevenths'], 12: ['twelfth', 'twelfths'] };

function fracWords(w, n, d, lang) {
  if (lang === 'zh') {
    const f = `${d === '?' ? '幾' : d}分之${n === '?' ? '幾' : n}`;
    return w ? `${w}又${f}` : f;
  }
  let f;
  if (n === '?' || d === '?' || !EN_ORD[d]) f = `${n === '?' ? 'what' : n} over ${d === '?' ? 'what' : d}`;
  else f = `${n} ${EN_ORD[d][n === '1' ? 0 : 1]}`;
  return w ? `${w} and ${f}` : f;
}

export function speakable(text, lang) {
  let s = String(text).replace(/\[(?:(\d+) )?([\d?]+)\/([\d?]+)\]/g, (_, w, n, d) => ` ${fracWords(w, n, d, lang)} `);
  s = s.replace(/<[^>]+>/g, ' ');
  if (lang === 'zh') {
    s = s.replace(/÷/g, '除以').replace(/×/g, '乘以').replace(/−/g, '減').replace(/\+/g, '加').replace(/= \?/g, '等於多少').replace(/=/g, '等於').replace(/◯/g, '空格').replace(/\?/g, '多少').replace(/ R /g, ' 餘 ');
  } else {
    s = s.replace(/÷/g, ' divided by ').replace(/×/g, ' times ').replace(/−/g, ' minus ').replace(/\+/g, ' plus ').replace(/= \?/g, ' equals what').replace(/=/g, ' equals ').replace(/◯/g, ' blank ').replace(/ \? /g, ' what ').replace(/ R /g, ' remainder ');
  }
  return s.replace(/\s+/g, ' ').trim();
}

let voices = [];
function loadVoices() { try { voices = speechSynthesis.getVoices(); } catch (e) { voices = []; } }
if (typeof speechSynthesis !== 'undefined') { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

function pickVoice(lang) {
  if (!voices.length) loadVoices();
  if (lang === 'zh') {
    return voices.find((v) => /zh[-_]TW/i.test(v.lang) && /mei|jia|yating|hanhan|臺灣|台灣/i.test(v.name))
      || voices.find((v) => /zh[-_]TW/i.test(v.lang))
      || voices.find((v) => /zh[-_]Hant/i.test(v.lang))
      || null; // no Simplified/Mainland voice fallback: wrong accent for Taiwan Mandarin
  }
  return voices.find((v) => /en[-_]US/i.test(v.lang) && /samantha|ava|allison|google us/i.test(v.name))
    || voices.find((v) => /^en/i.test(v.lang)) || null;
}

export function hasVoice(lang) { return typeof speechSynthesis !== 'undefined' && (!!pickVoice(lang) || lang === 'en'); }

export function speak(text, lang) {
  if (typeof speechSynthesis === 'undefined') return false;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(speakable(text, lang));
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.lang = lang === 'zh' ? 'zh-TW' : 'en-US';
    u.rate = lang === 'zh' ? 0.9 : 0.95; u.pitch = 1.1;
    speechSynthesis.speak(u);
    return true;
  } catch (e) { return false; }
}
export function stopSpeaking() { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
