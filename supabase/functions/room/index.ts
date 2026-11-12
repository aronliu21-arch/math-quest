// Supabase Edge Function "room": the authoritative multiplayer server.
// Validates every answer, computes rewards, and broadcasts public room state.
// Deploy: supabase functions deploy room
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
// Copied from /shared by scripts/sync-shared.mjs — do not edit the copies.
import { handle } from '../_shared/room-logic.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// Projects created with the newer API keys may expose the secret key under a different name.
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY')!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const db = {
  async get(code: string) {
    const { data, error } = await sb.from('rooms').select('state, version, room_secrets(secrets)').eq('code', code).maybeSingle();
    if (error || !data) return null;
    const sec = Array.isArray(data.room_secrets) ? data.room_secrets[0] : data.room_secrets;
    if (!sec) return null;
    return { state: data.state, version: data.version, secrets: sec.secrets };
  },
  async insert(code: string, state: unknown, secrets: unknown) {
    const { data, error } = await sb.rpc('room_insert', { p_code: code, p_state: state, p_secrets: secrets });
    return !error && data === true;
  },
  async update(code: string, state: unknown, secrets: unknown, version: number) {
    const { data, error } = await sb.rpc('room_save', { p_code: code, p_state: state, p_secrets: secrets, p_version: version });
    return !error && data === true;
  },
};

// Public state goes out over Realtime Broadcast on channel "room-CODE".
async function broadcast(state: { code: string }) {
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ messages: [{ topic: `room-${state.code}`, event: 'state', payload: { state } }] }),
    });
  } catch (_e) { /* clients also poll, so a missed broadcast is recovered */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false }, 405);
  const text = await req.text();
  if (text.length > 20000) return json({ ok: false }, 413);
  let body;
  try { body = JSON.parse(text); } catch { return json({ ok: false }, 400); }
  const out = await handle(db, body);
  if (out.state) await broadcast(out.state);
  return json(out);
});
