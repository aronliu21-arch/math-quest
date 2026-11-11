// Original SVG artwork: heroes, pets, monsters, items, fraction visuals, scenes.
import { makeRng } from '../shared/rng.js';

const OL = '#1b1530'; // outline color
let uid = 0; const nid = (p) => `${p}${++uid}`;

// ---------------- heroes ----------------
export const HAIR_STYLES = ['spiky', 'ponytail', 'short', 'curly', 'bun', 'long'];
export const HAIR_COLORS = ['#1b1b1f', '#4a2c1a', '#8a5a2b', '#d9a441', '#c2410c', '#7c3aed'];
export const SKINS = ['#ffe0c7', '#f6c9a0', '#e2a679', '#b97a4f', '#8a5634'];
export const OUTFITS = ['#1c7ed6', '#2f9e44', '#e8590c', '#ae3ec9', '#f59f00', '#0ca678'];
export const BADGES = ['#7048e8', '#f76707', '#1c7ed6', '#2f9e44', '#e64980', '#0c8599'];

function hairBack(style, c) {
  if (style === 'ponytail') {
    return `<path d="M88 34 C112 30 118 56 106 78 C100 90 108 98 114 96 C104 108 88 98 92 82 C96 66 98 50 86 44 Z" fill="${c}" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="90" cy="40" r="6" fill="#f783ac" stroke="${OL}" stroke-width="2.5"/>`;
  }
  if (style === 'long') return `<path d="M24 50 C20 80 22 100 30 108 L90 108 C98 100 100 80 96 50 Z" fill="${c}" stroke="${OL}" stroke-width="3"/>`;
  if (style === 'bun') return `<circle cx="60" cy="14" r="13" fill="${c}" stroke="${OL}" stroke-width="3"/>`;
  return '';
}

function hairFront(style, c) {
  switch (style) {
    case 'spiky':
      return `<path d="M24 56 L18 38 L30 40 L26 20 L42 30 L46 8 L58 26 L68 6 L74 28 L90 14 L88 34 L102 32 L94 50 L98 60 C88 44 74 38 60 38 C44 38 32 44 24 56 Z" fill="${c}" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>`;
    case 'ponytail':
      return `<path d="M25 58 C22 30 40 18 60 18 C82 18 98 30 96 56 C90 44 80 38 70 36 C62 46 46 50 34 48 C30 52 27 55 25 58 Z" fill="${c}" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M27 54 C24 66 26 78 30 84" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>
        <path d="M93 54 C96 66 94 78 90 84" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>
        <path d="M44 26 C54 22 66 22 74 26" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="4" stroke-linecap="round"/>
        <path d="M80 34 l2.4 5 5.4.6-4 3.7 1.1 5.3-4.9-2.7-4.8 2.7 1-5.3-4-3.7 5.4-.6z" fill="#fcc419" stroke="${OL}" stroke-width="1.5"/>`;
    case 'curly':
      return `<g fill="${c}" stroke="${OL}" stroke-width="3">${[[30, 40], [42, 28], [58, 24], [74, 28], [88, 40], [94, 54], [26, 54]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12"/>`).join('')}</g>
        <path d="M30 50 C40 36 80 36 92 50" fill="${c}"/>`;
    case 'bun':
    case 'short':
    case 'long':
    default:
      return `<path d="M24 58 C20 30 40 18 60 18 C80 18 100 30 96 58 C88 46 76 40 62 44 C52 38 36 44 24 58 Z" fill="${c}" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M44 26 C54 22 66 22 74 26" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="4" stroke-linecap="round"/>`;
  }
}

const HATS = {
  crown: `<path d="M38 22 L42 4 L52 16 L60 0 L68 16 L78 4 L82 22 Z" fill="#fcc419" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/><circle cx="60" cy="14" r="3" fill="#e03131"/>`,
  wizard: `<path d="M30 30 L64 -14 L90 30 Z" fill="#5f3dc4" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/><path d="M24 30 L96 30" stroke="${OL}" stroke-width="7" stroke-linecap="round"/><path d="M24 30 L96 30" stroke="#7950f2" stroke-width="3" stroke-linecap="round"/><text x="58" y="18" font-size="12" fill="#ffe066">½</text>`,
  helmet: `<path d="M24 40 C24 12 96 12 96 40 L96 46 L24 46 Z" fill="#adb5bd" stroke="${OL}" stroke-width="3"/><path d="M60 8 C66 0 76 2 78 -4" stroke="#e03131" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  cat: `<path d="M28 34 L30 6 L50 24 Z M92 34 L90 6 L70 24 Z" fill="#ffa8a8" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>`,
  pirate: `<path d="M20 30 C30 4 90 4 100 30 Z" fill="#212529" stroke="${OL}" stroke-width="3"/><circle cx="60" cy="18" r="5" fill="#fff"/>`,
  flowers: `${[30, 44, 60, 76, 90].map((x, i) => `<circle cx="${x}" cy="${26 - (i % 2) * 6}" r="6" fill="${['#ff8787', '#ffd43b', '#74c0fc', '#b197fc', '#8ce99a'][i]}" stroke="${OL}" stroke-width="2"/>`).join('')}`,
  astro: `<circle cx="60" cy="52" r="46" fill="#d0ebff" fill-opacity=".35" stroke="${OL}" stroke-width="3"/>`,
  dino: `<path d="M30 30 L36 14 L44 26 L52 8 L60 24 L68 8 L76 26 L84 14 L90 30 Z" fill="#69db7c" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>`,
};
const HELD = {
  wand: `<g transform="rotate(-25 104 112)"><rect x="101" y="96" width="6" height="40" rx="3" fill="#845ef7" stroke="${OL}" stroke-width="2.5"/><path d="M104 82 l4 8 9 1-6.5 6 2 9-8.5-4.5-8.5 4.5 2-9-6.5-6 9-1z" fill="#ffe066" stroke="${OL}" stroke-width="2"/></g>`,
  sword: `<g transform="rotate(-20 104 120)"><rect x="100" y="70" width="9" height="48" rx="3" fill="#dee2e6" stroke="${OL}" stroke-width="2.5"/><rect x="94" y="116" width="21" height="7" rx="3" fill="#fab005" stroke="${OL}" stroke-width="2.5"/><rect x="101" y="122" width="7" height="14" rx="3" fill="#862e9c" stroke="${OL}" stroke-width="2.5"/></g>`,
  shield: `<path d="M94 100 L118 100 L118 120 C118 132 106 140 106 140 C106 140 94 132 94 120 Z" fill="#1c7ed6" stroke="${OL}" stroke-width="3"/><text x="100" y="125" font-size="14" font-weight="900" fill="#fff">÷</text>`,
  book: `<rect x="94" y="104" width="24" height="28" rx="3" fill="#e8590c" stroke="${OL}" stroke-width="3"/><text x="99" y="124" font-size="12" font-weight="900" fill="#fff">¾</text>`,
  staff: `<rect x="104" y="60" width="6" height="80" rx="3" fill="#8d5524" stroke="${OL}" stroke-width="2.5"/><circle cx="107" cy="58" r="9" fill="#66d9e8" stroke="${OL}" stroke-width="3"/>`,
};
const CAPES = { red: '#e03131', gold: '#fab005', star: '#4c6ef5', green: '#2b8a3e' };

export function heroSVG(a = {}, { size = 120, glow = false, pose = 'idle' } = {}) {
  const hair = a.hair || 'short'; const hc = a.hairColor || HAIR_COLORS[0]; const skin = a.skin || SKINS[1];
  const outfit = a.outfit || OUTFITS[0]; const num = a.number ?? '';
  const id = nid('h');
  const cape = a.cape && CAPES[a.cape] ? `<path d="M36 100 C26 130 30 150 40 156 L80 156 C90 150 94 130 84 100 Z" fill="${CAPES[a.cape]}" stroke="${OL}" stroke-width="3"/>` : '';
  return `<svg class="hero ${pose}" viewBox="-10 -20 140 182" width="${size}" height="${size * 1.3}" aria-hidden="true">
  <defs><radialGradient id="${id}g"><stop offset="0" stop-color="#ffe066" stop-opacity=".9"/><stop offset="1" stop-color="#ffe066" stop-opacity="0"/></radialGradient></defs>
  ${glow ? `<ellipse cx="60" cy="80" rx="70" ry="88" fill="url(#${id}g)"/>` : ''}
  <ellipse cx="60" cy="158" rx="30" ry="6" fill="#000" opacity=".18"/>
  ${cape}
  ${hairBack(hair, hc)}
  <g class="legs"><rect x="44" y="128" width="13" height="26" rx="6" fill="#343a40" stroke="${OL}" stroke-width="3"/><rect x="63" y="128" width="13" height="26" rx="6" fill="#343a40" stroke="${OL}" stroke-width="3"/>
  <ellipse cx="49" cy="154" rx="10" ry="5" fill="#fff" stroke="${OL}" stroke-width="2.5"/><ellipse cx="71" cy="154" rx="10" ry="5" fill="#fff" stroke="${OL}" stroke-width="2.5"/></g>
  <path d="M38 96 C38 88 82 88 82 96 L86 132 L34 132 Z" fill="${outfit}" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M52 92 L60 102 L68 92" fill="none" stroke="#fff" stroke-width="3"/>
  <text x="60" y="124" text-anchor="middle" font-size="18" font-weight="900" fill="#fff" stroke="${OL}" stroke-width=".8">${num}</text>
  <g class="arm-l"><path d="M38 98 C26 104 24 118 28 124" fill="none" stroke="${OL}" stroke-width="13" stroke-linecap="round"/><path d="M38 98 C26 104 24 118 28 124" fill="none" stroke="${outfit}" stroke-width="8" stroke-linecap="round"/><circle cx="28" cy="126" r="6" fill="${skin}" stroke="${OL}" stroke-width="2.5"/></g>
  <g class="arm-r"><path d="M82 98 C94 104 98 114 100 118" fill="none" stroke="${OL}" stroke-width="13" stroke-linecap="round"/><path d="M82 98 C94 104 98 114 100 118" fill="none" stroke="${outfit}" stroke-width="8" stroke-linecap="round"/><circle cx="101" cy="120" r="6" fill="${skin}" stroke="${OL}" stroke-width="2.5"/></g>
  ${a.held && HELD[a.held] ? HELD[a.held] : ''}
  <rect x="53" y="82" width="14" height="12" fill="${skin}" stroke="${OL}" stroke-width="2.5"/>
  <circle cx="60" cy="56" r="36" fill="${skin}" stroke="${OL}" stroke-width="3"/>
  <ellipse cx="26" cy="60" rx="5" ry="8" fill="${skin}" stroke="${OL}" stroke-width="2.5"/><ellipse cx="94" cy="60" rx="5" ry="8" fill="${skin}" stroke="${OL}" stroke-width="2.5"/>
  ${hairFront(hair, hc)}
  <g class="eyes">
    <ellipse cx="46" cy="62" rx="8" ry="10" fill="#fff" stroke="${OL}" stroke-width="2.5"/><ellipse cx="74" cy="62" rx="8" ry="10" fill="#fff" stroke="${OL}" stroke-width="2.5"/>
    <ellipse cx="47" cy="64" rx="5" ry="7" fill="${hair === 'ponytail' ? '#6b3e1f' : '#2b2140'}"/><ellipse cx="73" cy="64" rx="5" ry="7" fill="${hair === 'ponytail' ? '#6b3e1f' : '#2b2140'}"/>
    <circle cx="49" cy="60" r="2.4" fill="#fff"/><circle cx="75" cy="60" r="2.4" fill="#fff"/><circle cx="45" cy="67" r="1.2" fill="#fff"/><circle cx="71" cy="67" r="1.2" fill="#fff"/>
    ${hair === 'ponytail' ? `<path d="M37 55 C42 51 50 51 55 54 M65 54 C70 51 78 51 83 55" stroke="${OL}" stroke-width="3" fill="none" stroke-linecap="round"/>` : ''}
  </g>
  ${hair === 'ponytail'
    ? `<path d="M38 46 C43 43 49 43 53 45 M67 45 C71 43 77 43 82 46" stroke="${OL}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
    : `<path d="M36 46 L54 51 M84 46 L66 51" stroke="${OL}" stroke-width="4" stroke-linecap="round"/>`}
  ${hair === 'spiky'
    ? `<path d="M48 76 C54 84 66 84 72 76 Z" fill="#fff" stroke="${OL}" stroke-width="2.5" stroke-linejoin="round"/><path d="M52 78 L52 81 M57 79 L57 82.5 M63 79 L63 82.5 M68 78 L68 81" stroke="${OL}" stroke-width="1.4"/>`
    : `<path d="M48 75 C53 84 67 84 72 75 Z" fill="#c92a2a" stroke="${OL}" stroke-width="2.5" stroke-linejoin="round"/><path d="M53 80 C57 83 63 83 67 80" fill="#ff8787"/>`}
  <ellipse cx="36" cy="72" rx="5" ry="3" fill="#ff8787" opacity=".55"/><ellipse cx="84" cy="72" rx="5" ry="3" fill="#ff8787" opacity=".55"/>
  ${a.hat && HATS[a.hat] ? HATS[a.hat] : ''}
</svg>`;
}

// ---------------- pets ----------------
// Each species: colors + parts. Stages 0..2 (baby, teen, evolved)
export const PETS = {
  divi: { name: ['Divi', '迪迪'], stages: [['Divi', '迪迪'], ['Divix', '迪克斯'], ['Divinova', '迪諾瓦']], rarity: 'common', body: '#ff922b', belly: '#fff4e6', ears: 'pointy', tail: 'split', accent: '#e8590c' },
  pizzapup: { name: ['Pizzapup', '披薩狗'], stages: [['Pizzapup', '披薩狗'], ['Slicehound', '切片獵犬'], ['Supreme Woof', '至尊汪汪']], rarity: 'common', body: '#ffd43b', belly: '#fff9db', ears: 'floppy', tail: 'curl', accent: '#e03131' },
  leaflet: { name: ['Leaflet', '葉葉'], stages: [['Leaflet', '葉葉'], ['Leafhop', '跳跳葉'], ['Grovequeen', '森林守護兔']], rarity: 'common', body: '#69db7c', belly: '#ebfbee', ears: 'long', tail: 'leaf', accent: '#2b8a3e' },
  bubbo: { name: ['Bubbo', '泡泡'], stages: [['Bubbo', '泡泡'], ['Bubblor', '泡泡龍'], ['Tidalord', '浪潮之王']], rarity: 'common', body: '#4dabf7', belly: '#e7f5ff', ears: 'fins', tail: 'fish', accent: '#1864ab' },
  puffle: { name: ['Puffle', '棉棉'], stages: [['Puffle', '棉棉'], ['Cloudle', '雲朵羊'], ['Skywool', '天空綿羊']], rarity: 'common', body: '#fcc2d7', belly: '#fff0f6', ears: 'round', tail: 'fluff', accent: '#d6336c' },
  pebblet: { name: ['Pebblet', '石石'], stages: [['Pebblet', '石石'], ['Bouldo', '大石頭'], ['Mountaro', '山岳巨龜']], rarity: 'common', body: '#adb5bd', belly: '#f1f3f5', ears: 'none', tail: 'short', accent: '#495057' },
  fracto: { name: ['Fracto', '分分龍'], stages: [['Fracto', '分分龍'], ['Fractagon', '分數飛龍'], ['Fractalisk', '分形巨龍']], rarity: 'rare', body: '#9775fa', belly: '#f3f0ff', ears: 'horns', tail: 'spike', accent: '#5f3dc4' },
  quotia: { name: ['Quotia', '商商鳥'], stages: [['Quotia', '商商鳥'], ['Quotiwing', '商羽鳥'], ['Quotiwhirl', '風暴商鳥']], rarity: 'rare', body: '#38d9a9', belly: '#e6fcf5', ears: 'crest', tail: 'feather', accent: '#087f5b' },
  remmy: { name: ['Remmy', '餘餘貓'], stages: [['Remmy', '餘餘貓'], ['Remmeow', '餘喵喵'], ['Remainstar', '星辰餘貓']], rarity: 'rare', body: '#748ffc', belly: '#edf2ff', ears: 'pointy', tail: 'star', accent: '#364fc7' },
  halfmoon: { name: ['Halfmoon', '半月兔'], stages: [['Halfmoon', '半月兔'], ['Lunabun', '月光兔'], ['Eclipsa', '日蝕月兔']], rarity: 'rare', body: '#e9ecef', belly: '#fff', ears: 'long', tail: 'fluff', accent: '#fab005' },
  infinidra: { name: ['Infinidra', '無限龍'], stages: [['Infinidra', '無限龍'], ['Infinidrake', '無限飛龍'], ['Infinity Sovereign', '無限龍王']], rarity: 'legendary', body: '#fcc419', belly: '#fff9db', ears: 'horns', tail: 'spike', accent: '#e67700' },
  phoenum: { name: ['Phoenum', '數字鳳凰'], stages: [['Phoenum', '數字鳳凰'], ['Blazenum', '烈焰鳳凰'], ['Solarnum', '太陽鳳凰']], rarity: 'legendary', body: '#ff6b6b', belly: '#fff5f5', ears: 'crest', tail: 'flame', accent: '#c92a2a' },
};
export const STARTER_PETS = ['divi', 'leaflet', 'bubbo'];

function petEars(type, c, a) {
  switch (type) {
    case 'pointy': return `<path d="M26 36 L22 6 L44 24 Z M94 36 L98 6 L76 24 Z" fill="${c}" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/><path d="M28 28 L26 14 L38 24 Z M92 28 L94 14 L82 24Z" fill="${a}" opacity=".6"/>`;
    case 'floppy': return `<path d="M26 30 C8 32 8 64 20 66 C28 60 30 44 34 34 Z M94 30 C112 32 112 64 100 66 C92 60 90 44 86 34 Z" fill="${a}" stroke="${OL}" stroke-width="3"/>`;
    case 'long': return `<path d="M38 28 C30 -10 46 -14 50 26 Z M82 28 C90 -10 74 -14 70 26 Z" fill="${c}" stroke="${OL}" stroke-width="3"/><path d="M41 22 C37 0 45 -2 47 22 Z M79 22 C83 0 75 -2 73 22Z" fill="#ffc9c9"/>`;
    case 'fins': return `<path d="M22 50 L4 36 L18 64 Z M98 50 L116 36 L102 64 Z" fill="${a}" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>`;
    case 'round': return `<circle cx="28" cy="28" r="12" fill="${c}" stroke="${OL}" stroke-width="3"/><circle cx="92" cy="28" r="12" fill="${c}" stroke="${OL}" stroke-width="3"/>`;
    case 'horns': return `<path d="M36 24 C30 8 36 0 42 -2 C40 8 44 16 48 22 Z M84 24 C90 8 84 0 78 -2 C80 8 76 16 72 22 Z" fill="#fff3bf" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>`;
    case 'crest': return `<path d="M50 20 C48 0 56 -4 60 -6 C60 4 64 10 70 20 Z" fill="${a}" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>`;
    default: return '';
  }
}
function petTail(type, c, a) {
  switch (type) {
    case 'split': return `<path d="M96 96 C120 90 124 70 116 62 C114 76 106 84 98 86 Z M96 100 C122 104 128 88 126 78 C120 92 108 96 98 94 Z" fill="${c}" stroke="${OL}" stroke-width="3"/><path d="M116 62 l-4 8 M126 78 l-6 6" stroke="#fff" stroke-width="3"/>`;
    case 'curl': return `<path d="M98 96 C118 96 120 76 108 74 C100 74 102 84 108 84" fill="none" stroke="${OL}" stroke-width="9" stroke-linecap="round"/><path d="M98 96 C118 96 120 76 108 74 C100 74 102 84 108 84" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`;
    case 'leaf': return `<path d="M96 98 C110 80 128 84 126 70 C112 70 100 82 96 98 Z" fill="#40c057" stroke="${OL}" stroke-width="3"/>`;
    case 'fish': return `<path d="M96 96 L120 82 L116 100 L122 116 Z" fill="${a}" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>`;
    case 'fluff': return `<circle cx="104" cy="98" r="10" fill="#fff" stroke="${OL}" stroke-width="3"/>`;
    case 'spike': return `<path d="M94 98 C112 98 120 88 124 74 L116 80 L114 72 L108 82 C104 86 100 88 94 90 Z" fill="${c}" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>`;
    case 'star': return `<path d="M96 96 C110 92 114 82 114 74" fill="none" stroke="${OL}" stroke-width="8" stroke-linecap="round"/><path d="M96 96 C110 92 114 82 114 74" fill="none" stroke="${c}" stroke-width="4"/><path d="M114 60 l4 8 9 1-6.5 6 2 9-8.5-4.5-8.5 4.5 2-9-6.5-6 9-1z" fill="#ffe066" stroke="${OL}" stroke-width="2"/>`;
    case 'feather': return `<path d="M96 96 C112 100 126 92 128 80 C118 86 108 86 98 88 Z" fill="${a}" stroke="${OL}" stroke-width="3"/>`;
    case 'flame': return `<path d="M94 96 C110 100 126 90 122 70 C118 80 114 76 116 66 C106 74 108 86 96 88 Z" fill="#ffa94d" stroke="${OL}" stroke-width="3"/><path d="M100 92 C110 92 116 86 116 78 C112 84 108 84 104 86Z" fill="#ffe066"/>`;
    default: return `<circle cx="100" cy="98" r="7" fill="${c}" stroke="${OL}" stroke-width="3"/>`;
  }
}

export function petSVG(species, stage = 0, { size = 100, silhouette = false, mood = 'happy' } = {}) {
  const p = PETS[species] || PETS.divi;
  const c = silhouette ? '#495057' : p.body; const b = silhouette ? '#495057' : p.belly; const a = silhouette ? '#343a40' : p.accent;
  const s = 0.82 + stage * 0.12;
  const wings = stage >= 1 && !silhouette ? `<path d="M24 74 C0 60 -6 40 4 34 C8 50 18 56 30 62 Z M96 74 C120 60 126 40 116 34 C112 50 102 56 90 62 Z" fill="${a}" fill-opacity=".85" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>` : '';
  const aura = stage >= 2 && !silhouette ? `<circle cx="60" cy="70" r="62" fill="none" stroke="${p.rarity === 'legendary' ? '#ffd43b' : a}" stroke-width="3" stroke-dasharray="6 8" opacity=".7" class="spin"/>` : '';
  const crown = stage >= 2 && !silhouette ? `<path d="M46 14 L50 2 L56 10 L60 0 L64 10 L70 2 L74 14 Z" fill="#fcc419" stroke="${OL}" stroke-width="2.5" stroke-linejoin="round"/>` : '';
  const marks = stage >= 1 && !silhouette ? `<path d="M40 40 L46 46 M80 40 L74 46" stroke="${a}" stroke-width="4" stroke-linecap="round"/>` : '';
  const eye = silhouette ? '' : (mood === 'sad'
    ? `<path d="M40 60 C44 56 50 56 54 60 M66 60 C70 56 76 56 80 60" stroke="${OL}" stroke-width="3" fill="none"/>`
    : `<ellipse cx="46" cy="58" rx="7" ry="9" fill="${OL}"/><ellipse cx="74" cy="58" rx="7" ry="9" fill="${OL}"/><circle cx="48" cy="54" r="3" fill="#fff"/><circle cx="76" cy="54" r="3" fill="#fff"/><circle cx="44" cy="61" r="1.4" fill="#fff"/><circle cx="72" cy="61" r="1.4" fill="#fff"/>`);
  return `<svg class="pet" viewBox="-12 -16 144 136" width="${size}" height="${size}" aria-hidden="true">
  ${aura}
  <ellipse cx="60" cy="112" rx="34" ry="6" fill="#000" opacity=".15"/>
  <g transform="translate(60 70) scale(${s}) translate(-60 -70)">
  ${wings}
  ${petTail(p.tail, c, a)}
  ${petEars(p.ears, c, a)}
  <ellipse cx="60" cy="68" rx="40" ry="38" fill="${c}" stroke="${OL}" stroke-width="3"/>
  <ellipse cx="60" cy="82" rx="24" ry="20" fill="${b}"/>
  ${marks}
  <ellipse cx="42" cy="104" rx="10" ry="7" fill="${c}" stroke="${OL}" stroke-width="3"/><ellipse cx="78" cy="104" rx="10" ry="7" fill="${c}" stroke="${OL}" stroke-width="3"/>
  ${eye}
  ${silhouette ? `<text x="60" y="80" text-anchor="middle" font-size="34" font-weight="900" fill="#868e96">?</text>` : `<path d="M54 70 C57 74 63 74 66 70" stroke="${OL}" stroke-width="2.5" fill="none" stroke-linecap="round"/><ellipse cx="36" cy="70" rx="5" ry="3" fill="#ff8787" opacity=".5"/><ellipse cx="84" cy="70" rx="5" ry="3" fill="#ff8787" opacity=".5"/>`}
  ${crown}
  </g>
</svg>`;
}

export const petName = (species, stage, lang) => { const p = PETS[species]; return p ? p.stages[stage][lang === 'zh' ? 1 : 0] : species; };

// ---------------- monsters ----------------
const M_PRE = [['Grum', '咕嚕'], ['Snag', '歪歪'], ['Mud', '泥泥'], ['Zig', '滋滋'], ['Bop', '波波'], ['Fizz', '嘶嘶'], ['Gloo', '黏黏'], ['Thorn', '刺刺'], ['Wob', '搖搖'], ['Crag', '岩岩'], ['Puzz', '迷迷'], ['Nib', '咬咬']];
const M_SUF = [['blob', '怪'], ['gle', '獸'], ['ster', '妖'], ['bit', '精'], ['mop', '球'], ['puff', '團']];
const WORLD_HUES = { village: [10, 40], forest: [90, 150], kingdom: [200, 280], legend: [270, 330] };

export function makeMonster(seed, world = 'village', boss = false) {
  const r = makeRng(seed);
  const [h0, h1] = WORLD_HUES[world] || [0, 360];
  const pre = r.int(0, M_PRE.length - 1); const suf = r.int(0, M_SUF.length - 1);
  return {
    seed, world, boss,
    hue: r.int(h0, h1), eyes: r.pick([1, 2, 2, 3]), horns: r.chance(0.6), teeth: r.chance(0.5), shape: r.pick(['blob', 'tall', 'wide']),
    name: [M_PRE[pre][0] + M_SUF[suf][0], M_PRE[pre][1] + M_SUF[suf][1]],
  };
}

export const BOSSES = {
  village: { name: ['Count Crumble', '碎碎伯爵'], hue: 25 },
  forest: { name: ['The Pizza Hydra', '披薩九頭蛇'], hue: 120 },
  kingdom: { name: ['Muddle the Mixed-up Golem', '糊塗石像巨人'], hue: 230 },
  legend: { name: ['Chaos Infinity Dragon', '混沌無限龍'], hue: 290 },
};

export function monsterSVG(m, { size = 140, hurt = false } = {}) {
  const c = `hsl(${m.hue} 70% 58%)`; const d = `hsl(${m.hue} 60% 38%)`; const l = `hsl(${m.hue} 80% 82%)`;
  const rx = m.shape === 'wide' ? 52 : m.shape === 'tall' ? 36 : 44; const ry = m.shape === 'tall' ? 52 : 42;
  const eyes = m.eyes === 1 ? [[60, 58, 14]] : m.eyes === 2 ? [[46, 58, 10], [74, 58, 10]] : [[40, 60, 8], [60, 50, 9], [80, 60, 8]];
  return `<svg class="monster${hurt ? ' hurt' : ''}" viewBox="-10 -24 140 150" width="${size}" height="${size}" aria-hidden="true">
  <ellipse cx="60" cy="118" rx="44" ry="7" fill="#000" opacity=".18"/>
  ${m.boss ? `<path d="M30 30 C10 10 0 30 8 50 M90 30 C110 10 120 30 112 50" stroke="${d}" stroke-width="10" fill="none" stroke-linecap="round"/>` : ''}
  ${m.horns ? `<path d="M34 34 L24 2 L48 24 Z M86 34 L96 2 L72 24 Z" fill="${l}" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/>` : ''}
  <path d="M${60 - rx} 80 C${60 - rx} ${80 - ry * 1.4} ${60 + rx} ${80 - ry * 1.4} ${60 + rx} 80 C${60 + rx} 104 ${60 + rx - 8} 114 ${60 + rx - 14} 114 L${60 - rx + 14} 114 C${60 - rx + 8} 114 ${60 - rx} 104 ${60 - rx} 80 Z" fill="${c}" stroke="${OL}" stroke-width="3.5"/>
  <ellipse cx="60" cy="92" rx="${rx * 0.55}" ry="16" fill="${l}" opacity=".7"/>
  <path d="M38 102 L82 102" stroke="#e03131" stroke-width="9" stroke-linecap="round"/><path d="M80 102 L94 112 M80 102 L92 96" stroke="#e03131" stroke-width="5" stroke-linecap="round"/>
  ${eyes.map(([x, y, r2]) => hurt
    ? `<path d="M${x - r2} ${y - r2 / 2} L${x + r2} ${y + r2 / 2} M${x + r2} ${y - r2 / 2} L${x - r2} ${y + r2 / 2}" stroke="${OL}" stroke-width="3.5" stroke-linecap="round"/>`
    : `<circle cx="${x}" cy="${y}" r="${r2}" fill="#fff" stroke="${OL}" stroke-width="2.5"/><circle cx="${x + 2}" cy="${y + 2}" r="${r2 * 0.5}" fill="${OL}"/><circle cx="${x + 3.5}" cy="${y}" r="${r2 * 0.18}" fill="#fff"/>`).join('')}
  <path d="M${60 - rx * 0.4} 34 L${60 - rx * 0.1} 42 M${60 + rx * 0.4} 34 L${60 + rx * 0.1} 42" stroke="${OL}" stroke-width="3.5" stroke-linecap="round"/>
  ${m.teeth ? `<path d="M46 76 C52 84 68 84 74 76 Z" fill="${OL}"/><path d="M50 77 L53 82 L56 78 M64 78 L67 82 L70 77" fill="#fff"/>` : `<path d="M48 78 C54 74 66 74 72 78" stroke="${OL}" stroke-width="3" fill="none" stroke-linecap="round"/>`}
  ${m.boss ? `<path d="M36 18 L42 -6 L52 10 L60 -12 L68 10 L78 -6 L84 18 Z" fill="#fcc419" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/><circle cx="60" cy="6" r="4" fill="#e03131"/>` : ''}
</svg>`;
}

// ---------------- items & icons ----------------
export function itemSVG(kind, size = 34) {
  const w = `width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true" class="item item-${kind}"`;
  switch (kind) {
    case 'cookie': return `<svg ${w}><circle cx="20" cy="20" r="16" fill="#e0a458" stroke="${OL}" stroke-width="2.5"/><circle cx="14" cy="15" r="2.5" fill="#5c3a21"/><circle cx="24" cy="13" r="2" fill="#5c3a21"/><circle cx="25" cy="24" r="2.6" fill="#5c3a21"/><circle cx="15" cy="26" r="2" fill="#5c3a21"/></svg>`;
    case 'apple': return `<svg ${w}><path d="M20 12 C8 6 2 18 6 28 C10 38 16 36 20 34 C24 36 30 38 34 28 C38 18 32 6 20 12Z" fill="#fa5252" stroke="${OL}" stroke-width="2.5"/><path d="M20 12 C20 6 22 4 24 3" stroke="${OL}" stroke-width="2.5" fill="none"/><path d="M22 8 C28 4 32 6 32 8 C28 10 24 10 22 8Z" fill="#51cf66" stroke="${OL}" stroke-width="1.5"/></svg>`;
    case 'gem': return `<svg ${w}><path d="M8 14 L14 6 L26 6 L32 14 L20 34 Z" fill="#4dabf7" stroke="${OL}" stroke-width="2.5" stroke-linejoin="round"/><path d="M8 14 L32 14 M14 6 L20 14 L26 6 M20 14 L20 34" stroke="#d0ebff" stroke-width="1.5"/></svg>`;
    case 'star': return `<svg ${w}><path d="M20 3 l5 11 12 1.3-9 8 2.6 12L20 29.5 9.4 35.3 12 23.3l-9-8L15 14z" fill="#ffd43b" stroke="${OL}" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
    case 'berry': return `<svg ${w}><path d="M20 36 C8 28 6 16 10 12 C14 10 26 10 30 12 C34 16 32 28 20 36Z" fill="#f03e3e" stroke="${OL}" stroke-width="2.5"/><path d="M12 11 L20 4 L28 11 Z" fill="#40c057" stroke="${OL}" stroke-width="2"/><g fill="#ffe066"><circle cx="16" cy="18" r="1.2"/><circle cx="24" cy="18" r="1.2"/><circle cx="20" cy="24" r="1.2"/><circle cx="15" cy="26" r="1.2"/><circle cx="25" cy="26" r="1.2"/></g></svg>`;
    case 'coin': return `<svg ${w}><circle cx="20" cy="20" r="16" fill="#fcc419" stroke="${OL}" stroke-width="2.5"/><circle cx="20" cy="20" r="11" fill="none" stroke="#f08c00" stroke-width="2"/><text x="20" y="25.5" text-anchor="middle" font-size="14" font-weight="900" fill="#e67700">÷</text></svg>`;
    case 'dumpling': return `<svg ${w}><path d="M4 26 C4 12 36 12 36 26 C30 32 10 32 4 26Z" fill="#fff8f0" stroke="${OL}" stroke-width="2.5"/><path d="M10 18 l2 4 M16 15 l1 5 M22 15 l-1 5 M28 18 l-2 4" stroke="${OL}" stroke-width="1.6"/></svg>`;
    case 'shell': return `<svg ${w}><path d="M20 6 C6 8 2 24 8 32 L32 32 C38 24 34 8 20 6Z" fill="#ffc9c9" stroke="${OL}" stroke-width="2.5"/><path d="M20 8 L20 32 M12 12 L14 32 M28 12 L26 32" stroke="#fa5252" stroke-width="1.5"/></svg>`;
    case 'gemIcon': return `<svg ${w}><path d="M8 14 L14 6 L26 6 L32 14 L20 34 Z" fill="#da77f2" stroke="${OL}" stroke-width="2.5" stroke-linejoin="round"/><path d="M8 14 L32 14 M14 6 L20 14 L26 6 M20 14 L20 34" stroke="#f8f0fc" stroke-width="1.5"/></svg>`;
    default: return `<svg ${w}><circle cx="20" cy="20" r="14" fill="#ced4da" stroke="${OL}" stroke-width="2.5"/></svg>`;
  }
}

export function chestSVG(open = false, size = 110, color = '#c2410c') {
  return `<svg class="chest${open ? ' open' : ''}" viewBox="0 0 120 110" width="${size}" height="${size * 0.92}" aria-hidden="true">
  <ellipse cx="60" cy="102" rx="46" ry="6" fill="#000" opacity=".2"/>
  ${open ? `<g class="rays">${Array.from({ length: 10 }, (_, i) => `<path d="M60 50 L${60 + Math.cos(i * 0.63) * 70} ${50 - Math.abs(Math.sin(i * 0.63)) * 70}" stroke="#ffe066" stroke-width="6" opacity=".7"/>`).join('')}</g>` : ''}
  <rect x="14" y="52" width="92" height="48" rx="6" fill="${color}" stroke="${OL}" stroke-width="3.5"/>
  <rect x="14" y="66" width="92" height="8" fill="#fcc419" stroke="${OL}" stroke-width="2"/>
  ${open ? `<path d="M14 52 L24 18 L96 18 L106 52 Z" fill="#9a3412" stroke="${OL}" stroke-width="3.5" transform="translate(0 -14) skewX(-6)"/>` : `<path d="M14 54 C14 26 106 26 106 54 Z" fill="${color}" stroke="${OL}" stroke-width="3.5"/><rect x="52" y="44" width="16" height="20" rx="3" fill="#fcc419" stroke="${OL}" stroke-width="2.5"/>`}
  </svg>`;
}

// ---------------- fraction visuals ----------------
const FILL = '#ff922b'; const EMPTY = '#fff8ef';

export function pieSVG(n, d, { size = 130, shaded, interactive = false, fill = FILL, crust = true } = {}) {
  const r = 52; const cx = 60; const cy = 60;
  const sh = shaded || Array.from({ length: d }, (_, i) => i < n);
  let parts = '';
  for (let i = 0; i < d; i++) {
    const a0 = (i / d) * Math.PI * 2 - Math.PI / 2; const a1 = ((i + 1) / d) * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + r * Math.cos(a0); const y0 = cy + r * Math.sin(a0); const x1 = cx + r * Math.cos(a1); const y1 = cy + r * Math.sin(a1);
    const path = d === 1 ? `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z` : `M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1} Z`;
    parts += `<path d="${path}" data-i="${i}" class="slice${sh[i] ? ' on' : ''}" fill="${sh[i] ? fill : EMPTY}" stroke="${OL}" stroke-width="2.5" ${interactive ? 'role="button"' : ''}/>`;
    if (sh[i] && fill === FILL) {
      const am = (a0 + a1) / 2;
      parts += `<circle cx="${cx + r * 0.6 * Math.cos(am)}" cy="${cy + r * 0.6 * Math.sin(am)}" r="${Math.max(2.5, 7 - d * 0.4)}" fill="#e03131" pointer-events="none"/>`;
    }
  }
  return `<svg class="frac-vis pie${interactive ? ' interactive' : ''}" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">${crust ? `<circle cx="60" cy="60" r="57" fill="#e0a458" stroke="${OL}" stroke-width="3"/>` : ''}${parts}</svg>`;
}

export function barSVG(n, d, { width = 240, height = 44, shaded, interactive = false, fill = '#4dabf7', label } = {}) {
  const sh = shaded || Array.from({ length: d }, (_, i) => i < n);
  const w = (width - 8) / d;
  let s = '';
  for (let i = 0; i < d; i++) s += `<rect data-i="${i}" class="slice${sh[i] ? ' on' : ''}" x="${4 + i * w}" y="4" width="${w}" height="${height - 8}" fill="${sh[i] ? fill : '#f8f9fa'}" stroke="${OL}" stroke-width="2.5"/>`;
  return `<svg class="frac-vis bar${interactive ? ' interactive' : ''}" viewBox="0 0 ${width} ${height + (label ? 22 : 0)}" width="${width}" height="${height + (label ? 22 : 0)}" aria-hidden="true">${s}${label ? `<text x="${width / 2}" y="${height + 18}" text-anchor="middle" font-size="16" font-weight="800">${label}</text>` : ''}</svg>`;
}

function gridDims(d) {
  let best = [1, d];
  for (let r = 1; r <= Math.sqrt(d); r++) if (d % r === 0) best = [r, d / r];
  return best;
}
export function rectSVG(n, d, { size = 150, shaded, interactive = false, fill = '#69db7c' } = {}) {
  const [rows, cols] = gridDims(d);
  const sh = shaded || Array.from({ length: d }, (_, i) => i < n);
  const cw = (size - 8) / cols; const chh = (size * 0.75 - 8) / rows;
  let s = '';
  for (let i = 0; i < d; i++) {
    const r = Math.floor(i / cols); const c = i % cols;
    s += `<rect data-i="${i}" class="slice${sh[i] ? ' on' : ''}" x="${4 + c * cw}" y="${4 + r * chh}" width="${cw}" height="${chh}" fill="${sh[i] ? fill : '#f4fce3'}" stroke="${OL}" stroke-width="2.5"/>`;
    if (sh[i]) s += `<circle cx="${4 + c * cw + cw / 2}" cy="${4 + r * chh + chh / 2}" r="${Math.min(cw, chh) / 5}" fill="#f783ac" pointer-events="none"/>`;
  }
  return `<svg class="frac-vis rect${interactive ? ' interactive' : ''}" viewBox="0 0 ${size} ${size * 0.75}" width="${size}" height="${size * 0.75}" aria-hidden="true">${s}</svg>`;
}

export function lineSVG(d, max = 1, { width = 320, mark = null, ticksClickable = false, placed = null } = {}) {
  const pad = 24; const len = width - pad * 2; const total = d * max;
  let s = `<line x1="${pad}" y1="40" x2="${width - pad}" y2="40" stroke="${OL}" stroke-width="4" stroke-linecap="round"/>`;
  for (let k = 0; k <= total; k++) {
    const x = pad + (len * k) / total; const whole = k % d === 0;
    s += `<line x1="${x}" y1="${whole ? 26 : 31}" x2="${x}" y2="${whole ? 54 : 49}" stroke="${OL}" stroke-width="${whole ? 4 : 2.5}"/>`;
    if (whole) s += `<text x="${x}" y="76" text-anchor="middle" font-size="18" font-weight="900">${k / d}</text>`;
    if (ticksClickable && !whole) s += `<circle class="tick-hit" data-k="${k}" cx="${x}" cy="40" r="${Math.min(22, len / total / 2)}" fill="transparent"/>`;
  }
  if (mark != null) { const x = pad + (len * mark) / total; s += `<path transform="translate(${x - 12} 4)" d="M12 0 l3.5 7.5 8 .8-6 5.5 1.8 8L12 17.8 4.7 21.8l1.8-8-6-5.5 8-.8z" fill="#ffd43b" stroke="${OL}" stroke-width="2"/>`; }
  if (placed != null) { const x = pad + (len * placed) / total; s += `<circle cx="${x}" cy="40" r="10" fill="#e64980" stroke="${OL}" stroke-width="3"/>`; }
  return `<svg class="frac-vis line" viewBox="0 0 ${width} 84" width="${width}" height="84" aria-hidden="true">${s}</svg>`;
}

// ---------------- scenes ----------------
export function sceneSVG(world, { night = false } = {}) {
  const sky = { village: ['#a5d8ff', '#e7f5ff'], forest: ['#b2f2bb', '#ebfbee'], kingdom: ['#d0bfff', '#f3f0ff'], legend: ['#1b1036', '#4c1d95'], menu: ['#74c0fc', '#d0ebff'] }[world] || ['#a5d8ff', '#fff'];
  const id = nid('sky');
  let deco = '';
  if (world === 'village' || world === 'menu') {
    deco = `<path d="M0 300 C120 240 240 260 400 230 C560 200 700 250 800 240 L800 450 L0 450 Z" fill="#8ce99a"/>
      <path d="M0 340 C160 300 300 330 460 300 C620 270 720 320 800 300 L800 450 L0 450 Z" fill="#51cf66"/>
      ${[[90, 250], [600, 220], [700, 260]].map(([x, y], i) => `<g transform="translate(${x} ${y})"><rect x="-30" y="-10" width="60" height="44" fill="${['#ffe8cc', '#fff3bf', '#ffdeeb'][i]}" stroke="${OL}" stroke-width="3"/><path d="M-38 -8 L0 -40 L38 -8 Z" fill="${['#e8590c', '#e03131', '#7048e8'][i]}" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/><rect x="-8" y="12" width="16" height="22" fill="#8d5524" stroke="${OL}" stroke-width="2.5"/></g>`).join('')}
      <circle cx="680" cy="80" r="40" fill="#ffe066"/>`;
  } else if (world === 'forest') {
    deco = `<path d="M0 320 C200 280 600 300 800 290 L800 450 L0 450 Z" fill="#69db7c"/>
      ${Array.from({ length: 9 }, (_, i) => { const x = 40 + i * 92; const h = 120 + (i % 3) * 30; return `<g transform="translate(${x} ${320 - h * 0.2})"><rect x="-8" y="0" width="16" height="${h * 0.5}" fill="#8d5524" stroke="${OL}" stroke-width="2.5"/><circle cx="0" cy="-${h * 0.25}" r="${h * 0.35}" fill="${i % 2 ? '#2f9e44' : '#37b24d'}" stroke="${OL}" stroke-width="3"/></g>`; }).join('')}
      ${[[150, 360], [500, 380], [690, 350]].map(([x, y]) => `<g transform="translate(${x} ${y})"><rect x="-5" y="0" width="10" height="16" fill="#fff"/><path d="M-18 2 C-18 -18 18 -18 18 2 Z" fill="#fa5252" stroke="${OL}" stroke-width="2.5"/><circle cx="-6" cy="-6" r="3" fill="#fff"/><circle cx="7" cy="-8" r="2.5" fill="#fff"/></g>`).join('')}`;
  } else if (world === 'kingdom') {
    deco = `<path d="M0 320 C200 290 600 300 800 300 L800 450 L0 450 Z" fill="#b197fc"/>
      <g transform="translate(400 120)"><rect x="-120" y="40" width="240" height="160" fill="#e9ecef" stroke="${OL}" stroke-width="4"/>
      ${[-120, -40, 40, 120].map((x) => `<rect x="${x - 26}" y="-10" width="52" height="210" fill="#dee2e6" stroke="${OL}" stroke-width="4"/><path d="M${x - 34} -10 L${x} -60 L${x + 34} -10 Z" fill="#7048e8" stroke="${OL}" stroke-width="4" stroke-linejoin="round"/><path d="M${x} -60 L${x} -84 L${x + 20} -76 L${x} -70" fill="#fcc419" stroke="${OL}" stroke-width="2"/>`).join('')}
      <path d="M-24 200 L-24 150 C-24 120 24 120 24 150 L24 200 Z" fill="#5c3a21" stroke="${OL}" stroke-width="4"/></g>`;
  } else if (world === 'legend') {
    deco = `${Array.from({ length: 60 }, (_, i) => `<circle cx="${(i * 137) % 800}" cy="${(i * 71) % 300}" r="${(i % 3) + 1}" fill="#fff" opacity="${0.4 + (i % 5) / 10}"/>`).join('')}
      <g transform="translate(400 200)" class="spin-slow"><ellipse rx="150" ry="150" fill="none" stroke="#da77f2" stroke-width="10" stroke-dasharray="30 18"/><ellipse rx="110" ry="110" fill="none" stroke="#748ffc" stroke-width="8" stroke-dasharray="20 14"/></g>
      <circle cx="400" cy="200" r="80" fill="#e599f7" opacity=".35"/>
      <path d="M0 360 L120 330 L220 350 L340 320 L480 350 L620 315 L800 345 L800 450 L0 450 Z" fill="#2b1b4f" stroke="#7950f2" stroke-width="3"/>`;
  }
  return `<svg class="scene" viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
  <rect width="800" height="450" fill="url(#${id})"/>
  ${world !== 'legend' ? `<g fill="#fff" opacity=".85" class="clouds"><ellipse cx="150" cy="90" rx="60" ry="22"/><ellipse cx="190" cy="76" rx="40" ry="22"/><ellipse cx="520" cy="60" rx="70" ry="20"/><ellipse cx="560" cy="48" rx="40" ry="20"/></g>` : ''}
  ${deco}
</svg>`;
}

// ---------------- home decorations ----------------
export const DECOR = {
  tree: '<circle cx="20" cy="15" r="13" fill="#40c057" stroke="#1b1530" stroke-width="2"/><rect x="17" y="24" width="6" height="13" fill="#8d5524" stroke="#1b1530" stroke-width="2"/>',
  flower: '<g stroke="#1b1530" stroke-width="1.5">' + [0, 72, 144, 216, 288].map((a) => `<circle cx="${20 + 7 * Math.cos(a * Math.PI / 180)}" cy="${17 + 7 * Math.sin(a * Math.PI / 180)}" r="5.5" fill="#f783ac"/>`).join('') + '<circle cx="20" cy="17" r="4" fill="#ffd43b"/></g><path d="M20 24 L20 38" stroke="#2f9e44" stroke-width="3"/>',
  fountain: '<ellipse cx="20" cy="32" rx="17" ry="6" fill="#74c0fc" stroke="#1b1530" stroke-width="2"/><rect x="16" y="14" width="8" height="18" fill="#dee2e6" stroke="#1b1530" stroke-width="2"/><path d="M20 12 C12 4 8 14 10 20 M20 12 C28 4 32 14 30 20" stroke="#4dabf7" stroke-width="2.5" fill="none"/>',
  bench: '<rect x="4" y="18" width="32" height="6" fill="#e8590c" stroke="#1b1530" stroke-width="2"/><rect x="4" y="10" width="32" height="5" fill="#e8590c" stroke="#1b1530" stroke-width="2"/><path d="M8 24 L8 34 M32 24 L32 34" stroke="#1b1530" stroke-width="3"/>',
  lamp: '<rect x="18" y="12" width="4" height="26" fill="#495057"/><circle cx="20" cy="9" r="7" fill="#ffe066" stroke="#1b1530" stroke-width="2"/>',
  tower: '<rect x="8" y="10" width="24" height="28" fill="#dee2e6" stroke="#1b1530" stroke-width="2"/><path d="M5 10 L20 -2 L35 10 Z" fill="#7048e8" stroke="#1b1530" stroke-width="2"/><rect x="16" y="26" width="8" height="12" fill="#5c3a21"/>',
  pond: '<ellipse cx="20" cy="24" rx="18" ry="11" fill="#4dabf7" stroke="#1b1530" stroke-width="2"/><ellipse cx="14" cy="22" rx="5" ry="2" fill="#a5d8ff"/>',
  statue: '<rect x="10" y="30" width="20" height="8" fill="#adb5bd" stroke="#1b1530" stroke-width="2"/><text x="20" y="28" text-anchor="middle" font-size="24" font-weight="900" fill="#fab005" stroke="#1b1530" stroke-width="1">÷</text>',
  rainbow: '<path d="M2 36 A18 18 0 0 1 38 36" stroke="#fa5252" stroke-width="4" fill="none"/><path d="M6 36 A14 14 0 0 1 34 36" stroke="#fab005" stroke-width="4" fill="none"/><path d="M10 36 A10 10 0 0 1 30 36" stroke="#40c057" stroke-width="4" fill="none"/><path d="M14 36 A6 6 0 0 1 26 36" stroke="#4dabf7" stroke-width="4" fill="none"/>',
  tent: '<path d="M2 36 L20 6 L38 36 Z" fill="#ff922b" stroke="#1b1530" stroke-width="2" stroke-linejoin="round"/><path d="M20 6 L20 36 M14 36 L20 22 L26 36" stroke="#1b1530" stroke-width="2" fill="#fff3bf"/>',
  pizza: '<path d="M20 4 L36 36 L4 36 Z" fill="#ffd43b" stroke="#1b1530" stroke-width="2" stroke-linejoin="round"/><circle cx="18" cy="24" r="3" fill="#e03131"/><circle cx="25" cy="30" r="3" fill="#e03131"/>',
  crystal: '<path d="M20 2 L30 16 L24 38 L16 38 L10 16 Z" fill="#da77f2" stroke="#1b1530" stroke-width="2" stroke-linejoin="round"/><path d="M20 2 L20 38" stroke="#f8f0fc" stroke-width="1.5"/>',
  house: '<rect x="6" y="16" width="28" height="22" fill="#ffe8cc" stroke="#1b1530" stroke-width="2"/><path d="M2 18 L20 2 L38 18 Z" fill="#e03131" stroke="#1b1530" stroke-width="2" stroke-linejoin="round"/><rect x="16" y="26" width="8" height="12" fill="#8d5524"/>',
};
export function decorSVG(k, size = 40) { return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">${DECOR[k] || ''}</svg>`; }

export function sparkleBurst(n = 14) {
  return Array.from({ length: n }, (_, i) => `<span class="spark" style="--a:${(i / n) * 360}deg;--d:${60 + (i % 4) * 25}px;--c:${['#ffd43b', '#ff8787', '#74c0fc', '#b197fc', '#8ce99a'][i % 5]}"></span>`).join('');
}
