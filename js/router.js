// Tiny screen router with fade transitions.
import { stopSpeaking } from './audio.js';

const screens = {};
let cleanup = null;
export let currentScreen = null;
export const history = [];

export function register(name, fn) { screens[name] = fn; }

export async function go(name, params = {}, { replace = false } = {}) {
  const app = document.getElementById('app');
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  stopSpeaking();
  document.querySelectorAll('.modal-wrap').forEach((m) => m.remove());
  if (!replace && currentScreen) history.push(currentScreen);
  if (history.length > 30) history.shift();
  currentScreen = { name, params };
  const res = await screens[name](params);
  const node = res.node || res;
  cleanup = res.cleanup || null;
  node.classList.add('screen', 'enter');
  app.replaceChildren(node);
  window.scrollTo(0, 0);
  requestAnimationFrame(() => requestAnimationFrame(() => node.classList.remove('enter')));
  document.body.dataset.screen = name;
  return node;
}

export function refresh() { if (currentScreen) return go(currentScreen.name, currentScreen.params, { replace: true }); return null; }
