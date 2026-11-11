// IndexedDB storage for profiles and settings, with an in-memory fallback
// when IndexedDB is unavailable (e.g. some private-browsing modes).
const DB_NAME = 'math-quest';
const DB_VERSION = 1;
let dbp = null;
let memory = null;
export let persistent = true;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { resolve(null); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
    setTimeout(() => resolve(null), 4000);
  }).then((db) => {
    if (!db) { persistent = false; memory = { profiles: new Map(), meta: new Map() }; }
    return db;
  });
  return dbp;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const clone = (o) => JSON.parse(JSON.stringify(o));

export async function getProfiles() {
  const db = await open();
  if (!db) return [...memory.profiles.values()].map(clone);
  const all = await tx(db, 'profiles', 'readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => a.created - b.created);
}

export async function saveProfile(p) {
  p.updated = Date.now();
  const db = await open();
  if (!db) { memory.profiles.set(p.id, clone(p)); return; }
  await tx(db, 'profiles', 'readwrite', (s) => s.put(clone(p)));
}

export async function deleteProfile(id) {
  const db = await open();
  if (!db) { memory.profiles.delete(id); return; }
  await tx(db, 'profiles', 'readwrite', (s) => s.delete(id));
}

export async function getMeta(k, def = null) {
  const db = await open();
  if (!db) return memory.meta.has(k) ? clone(memory.meta.get(k)) : def;
  const v = await tx(db, 'meta', 'readonly', (s) => s.get(k));
  return v === undefined ? def : v;
}

export async function setMeta(k, v) {
  const db = await open();
  if (!db) { memory.meta.set(k, clone(v)); return; }
  await tx(db, 'meta', 'readwrite', (s) => s.put(clone(v), k));
}

export async function ready() { await open(); return persistent; }

// Ask the browser to keep our data (helps Safari not evict it).
export async function requestPersist() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* ignore */ }
}
