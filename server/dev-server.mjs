// Local server: serves the game and runs the multiplayer room API in memory.
// Good for testing and for play on one home network (or a small server).
// For play across different networks/locations, deploy the Supabase backend (see README).
//
//   node server/dev-server.mjs            → http://localhost:8080
//   PORT=3000 node server/dev-server.mjs
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, memoryDb, ROOM_TTL_MS } from '../shared/room-logic.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const db = memoryDb();
const subscribers = new Map(); // code → Set(res)

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

function publish(code, state) {
  const subs = subscribers.get(code); if (!subs) return;
  const msg = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of subs) res.write(msg);
}

// tiny per-IP rate limit for the API (kids tap fast, so it is generous)
const hits = new Map();
function limited(ip) {
  const now = Date.now(); const w = hits.get(ip) || []; const recent = w.filter((t) => now - t < 10000); recent.push(now); hits.set(ip, recent);
  return recent.length > 120;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true,"backend":"dev"}'); return; }
    if (url.pathname === '/api/room' && req.method === 'POST') {
      if (limited(req.socket.remoteAddress)) { res.writeHead(429); res.end('{"ok":false,"error":"slow"}'); return; }
      let body = ''; for await (const c of req) { body += c; if (body.length > 20000) { res.writeHead(413); res.end(); return; } }
      let data; try { data = JSON.parse(body); } catch { res.writeHead(400); res.end('{"ok":false}'); return; }
      const out = await handle(db, data);
      if (out.state) publish(out.state.code, out.state);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(out));
      return;
    }
    const ev = url.pathname.match(/^\/api\/room\/([0-9]{4})\/events$/);
    if (ev) {
      const code = ev[1];
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      const row = await db.get(code); if (row) res.write(`data: ${JSON.stringify(row.state)}\n\n`);
      if (!subscribers.has(code)) subscribers.set(code, new Set());
      subscribers.get(code).add(res);
      const ka = setInterval(() => res.write(': keepalive\n\n'), 15000);
      req.on('close', () => { clearInterval(ka); subscribers.get(code)?.delete(res); });
      return;
    }
    // static files
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT) || p.includes('/server/') || p.includes('/.git')) { res.writeHead(403); res.end(); return; }
    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(file));
  } catch (e) {
    console.error(e); res.writeHead(500); res.end('error');
  }
});

// forget old rooms
setInterval(() => { const now = Date.now(); for (const [code, r] of db.rooms) if (now - r.state.updated > ROOM_TTL_MS) db.rooms.delete(code); }, 60000).unref();

server.listen(PORT, () => console.log(`Math Quest running at http://localhost:${PORT}`));
