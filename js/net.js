// Multiplayer transport. Two backends share one interface:
//  - 'supabase': Edge Function for actions + Realtime Broadcast for live state
//  - 'dev':      local Node server (HTTP actions + Server-Sent Events)
// Both also poll every few seconds, so a dropped live connection never leaves
// a player with a stale game.
import { MP_CONFIG } from './config.js';

let detected;
export async function detectBackend() {
  if (detected !== undefined) return detected;
  if (MP_CONFIG.supabaseUrl && MP_CONFIG.supabaseAnonKey) { detected = 'supabase'; return detected; }
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(`${MP_CONFIG.devApi}/api/health`, { cache: 'no-store', signal: ctl.signal });
    clearTimeout(tm);
    detected = r.ok && (await r.json()).ok ? 'dev' : null;
  } catch (e) { detected = null; }
  return detected;
}

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

export async function createNet() {
  const kind = await detectBackend();
  if (!kind) return null;
  if (kind === 'dev') {
    return {
      kind,
      beacon(body) { try { fetch(`${MP_CONFIG.devApi}/api/room`, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); } catch (e) { /* ignore */ } },
      async call(body) {
        const r = await fetch(`${MP_CONFIG.devApi}/api/room`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      },
      subscribe(code, onState, onStatus) {
        let es; let closed = false;
        const open = () => {
          es = new EventSource(`${MP_CONFIG.devApi}/api/room/${code}/events`);
          es.onopen = () => onStatus('up');
          es.onmessage = (e) => { try { onState(JSON.parse(e.data)); } catch (err) { /* ignore */ } };
          es.onerror = () => { onStatus('down'); if (es.readyState === 2 && !closed) setTimeout(open, 2000); };
        };
        open();
        return () => { closed = true; es && es.close(); };
      },
    };
  }
  if (!window.supabase) await loadScript('vendor/supabase.js');
  const client = window.supabase.createClient(MP_CONFIG.supabaseUrl, MP_CONFIG.supabaseAnonKey, { auth: { persistSession: false } });
  return {
    kind,
    beacon(body) {
      try {
        fetch(`${MP_CONFIG.supabaseUrl}/functions/v1/room`, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', apikey: MP_CONFIG.supabaseAnonKey, authorization: `Bearer ${MP_CONFIG.supabaseAnonKey}` }, body: JSON.stringify(body) });
      } catch (e) { /* ignore */ }
    },
    async call(body) {
      const { data, error } = await client.functions.invoke('room', { body });
      if (error) throw error;
      return data;
    },
    subscribe(code, onState, onStatus) {
      const ch = client.channel(`room-${code}`, { config: { broadcast: { self: true } } })
        .on('broadcast', { event: 'state' }, ({ payload }) => { if (payload && payload.state) onState(payload.state); })
        .subscribe((status) => onStatus(status === 'SUBSCRIBED' ? 'up' : 'down'));
      return () => { client.removeChannel(ch); };
    },
  };
}
