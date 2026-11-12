// Multiplayer transport. Three backends share one interface:
//  - 'p2p' (default, zero setup): devices connect directly (WebRTC via PeerJS).
//    The host's device runs the same room logic the servers run and acts as referee.
//  - 'supabase': Edge Function for actions + Realtime Broadcast for live state
//  - 'dev':      local Node server (HTTP actions + Server-Sent Events)
// Clients also ping every few seconds, so a dropped connection recovers by itself.
import { MP_CONFIG } from './config.js';
import { handle, memoryDb, ROOM_TTL_MS } from '../shared/room-logic.js';

let detected;
export async function detectBackend() {
  if (detected !== undefined) return detected;
  if (MP_CONFIG.supabaseUrl && MP_CONFIG.supabaseAnonKey) { detected = 'supabase'; return detected; }
  // Only look for the local dev server when it could exist (not on GitHub Pages).
  const maybeDev = MP_CONFIG.devApi || !(/github\.io$/.test(location.hostname) || new URLSearchParams(location.search).has('peer'));
  if (maybeDev) try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(`${MP_CONFIG.devApi}/api/health`, { cache: 'no-store', signal: ctl.signal });
    clearTimeout(tm);
    detected = r.ok && (await r.json()).ok ? 'dev' : null;
  } catch (e) { detected = null; }
  if (!detected && typeof RTCPeerConnection !== 'undefined') detected = 'p2p';
  return detected;
}

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

export async function createNet() {
  const kind = await detectBackend();
  if (!kind) return null;
  if (kind === 'p2p') { if (!window.Peer) await loadScript('vendor/peerjs.min.js'); return p2pNet(); }
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

// ---------------- peer-to-peer (no server setup) ----------------
let p2pSingleton = null;
function peerOptions() {
  // tests can point at a local PeerJS server: ?peer=localhost:9001
  const q = new URLSearchParams(location.search).get('peer');
  if (q) { const [host, port] = q.split(':'); return { host, port: Number(port), path: '/', secure: false, debug: 0 }; }
  return { debug: 0, ...(MP_CONFIG.peer || {}) };
}
const peerId = (code) => `mathquest-room-${String(code).toLowerCase()}`;
const HOST_KEY = 'mq-host-room';
const withTimeout = (p, ms, err) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(err)), ms))]);

function p2pNet() {
  if (p2pSingleton) return p2pSingleton;
  const opts = peerOptions();
  const subs = new Set();
  const emit = (state) => { for (const s of subs) if (s.code === state.code) s.onState(state); };
  const status = (code, st) => { for (const s of subs) if (s.code === code) s.onStatus(st); };

  // ----- host side -----
  let host = null; // { code, db, peer, conns:Set, starting:Promise }
  const saveHost = () => {
    if (!host) return;
    try { const row = host.db.rooms.get(host.code); if (row) localStorage.setItem(HOST_KEY, JSON.stringify({ code: host.code, row })); } catch (e) { /* storage may be unavailable */ }
  };
  const broadcast = (state) => {
    saveHost();
    for (const c of host.conns) { try { if (c.open) c.send({ type: 'state', state }); } catch (e) { /* ignore */ } }
    emit(state);
  };
  const runHost = async (body) => {
    const out = await handle(host.db, { ...body, code: host.code });
    if (out.state) broadcast(out.state);
    return out;
  };
  function listen(code, retries) {
    // Register this device under the room's id so guests can find it. If the id is
    // still held from a moment ago (page reload), keep retrying for a little while.
    return new Promise((resolve, reject) => {
      let tries = 0;
      const attempt = () => {
        const peer = new window.Peer(peerId(code), opts);
        peer.on('open', () => resolve(peer));
        peer.on('error', (e) => {
          if (e.type === 'unavailable-id' && tries++ < retries) { peer.destroy(); setTimeout(attempt, 2500); return; }
          if (!host || host.peer !== peer) reject(e);
        });
      };
      attempt();
    });
  }
  async function startHosting(code, db, retries = 0) {
    host = { code, db, peer: null, conns: new Set() };
    host.starting = listen(code, retries).then((peer) => {
      host.peer = peer;
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
      peer.on('connection', (conn) => {
        host.conns.add(conn);
        conn.on('data', async (msg) => {
          if (!msg || !msg.body || msg.body.action === 'create') return;
          const out = await runHost(msg.body);
          try { conn.send({ type: 'res', id: msg.id, out }); } catch (e) { /* ignore */ }
        });
        conn.on('close', () => host.conns.delete(conn));
        conn.on('error', () => host.conns.delete(conn));
      });
      saveHost();
      return peer;
    });
    return host.starting;
  }
  // a host that reloads the page picks its room back up
  function restoreHost(code) {
    try {
      const saved = JSON.parse(localStorage.getItem(HOST_KEY) || 'null');
      if (!saved || saved.code !== code || Date.now() - saved.row.state.updated > ROOM_TTL_MS) return false;
      const db = memoryDb(); db.rooms.set(code, saved.row);
      startHosting(code, db, 8).catch(() => {}); // our own old registration may linger a few seconds
      return true;
    } catch (e) { return false; }
  }

  // ----- guest side -----
  let guest = null; // { code, peer, conn, pending:Map, opening:Promise }
  let msgId = 1;
  let guestPeer = null;
  const getGuestPeer = () => {
    if (guestPeer && !guestPeer.destroyed && guestPeer.open) return Promise.resolve(guestPeer);
    if (guestPeer && guestPeer.disconnected && !guestPeer.destroyed) { try { guestPeer.reconnect(); } catch (e) { /* ignore */ } }
    return withTimeout(new Promise((resolve, reject) => {
      if (guestPeer && !guestPeer.destroyed && !guestPeer.open) { guestPeer.once('open', () => resolve(guestPeer)); return; }
      guestPeer = new window.Peer(opts);
      guestPeer.on('open', () => resolve(guestPeer));
      guestPeer.on('error', (e) => { if (e.type !== 'peer-unavailable') reject(e); });
    }), 12000, 'signal');
  };
  async function ensureGuest(code) {
    if (guest && guest.code === code && guest.conn && guest.conn.open) return guest;
    if (guest && guest.code === code && guest.opening) return guest.opening;
    const g = { code, conn: null, pending: new Map() };
    guest = g;
    g.opening = (async () => {
      const peer = await getGuestPeer();
      const conn = peer.connect(peerId(code), { reliable: true });
      await withTimeout(new Promise((resolve, reject) => {
        conn.on('open', resolve);
        conn.on('error', reject);
        const onErr = (e) => { if (e.type === 'peer-unavailable') { peer.off('error', onErr); reject(new Error('notFound')); } };
        peer.on('error', onErr);
      }), 12000, 'notFound');
      g.conn = conn;
      conn.on('data', (msg) => {
        if (!msg) return;
        if (msg.type === 'res' && g.pending.has(msg.id)) { g.pending.get(msg.id)(msg.out); g.pending.delete(msg.id); }
        if (msg.type === 'state' && msg.state) emit(msg.state);
      });
      const down = () => { if (guest === g) { g.conn = null; g.opening = null; status(code, 'down'); } };
      conn.on('close', down); conn.on('error', down);
      status(code, 'up');
      return g;
    })();
    try { return await g.opening; } catch (e) { if (guest === g) guest = null; throw e; }
  }
  async function guestCall(body) {
    let g;
    try { g = await ensureGuest(body.code); } catch (e) {
      if (e.message === 'notFound' && body.action === 'join') return { ok: false, error: 'notFound' };
      throw e;
    }
    const id = msgId++;
    const res = new Promise((resolve) => g.pending.set(id, resolve));
    g.conn.send({ id, body });
    return withTimeout(res, 10000, 'timeout');
  }

  p2pSingleton = {
    kind: 'p2p',
    async call(body) {
      const code = String(body.code || '').toUpperCase();
      if (body.action === 'create') {
        for (let i = 0; i < 8; i++) { // a number already in use by another family → just pick another
          const db = memoryDb();
          const out = await handle(db, body);
          if (!out.ok) return out;
          try { await withTimeout(startHosting(out.state.code, db), 15000, 'signal'); return out; } catch (e) { if (host) { try { host.peer && host.peer.destroy(); } catch (x) { /* ignore */ } host = null; } }
        }
        throw new Error('signal');
      }
      if (host && host.code === code) return runHost(body);
      if (!host && restoreHost(code)) return runHost(body);
      return guestCall({ ...body, code });
    },
    subscribe(code, onState, onStatus) {
      const s = { code, onState, onStatus }; subs.add(s);
      if (host && host.code === code) onStatus('up');
      return () => subs.delete(s);
    },
    beacon(body) {
      const code = String(body.code || '').toUpperCase();
      if (host && host.code === code) return; // the referee's own tab closing ends the room anyway
      try { if (guest && guest.conn && guest.conn.open) guest.conn.send({ id: 0, body: { ...body, code } }); } catch (e) { /* ignore */ }
    },
  };
  return p2pSingleton;
}
