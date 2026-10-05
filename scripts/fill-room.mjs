/**
 * Seats extra players into an existing room and readies them, so the lobby can
 * be started from a browser (manual UI testing of the game page).
 *
 *   node scripts/fill-room.mjs <ROOM_CODE> [count] [baseUrl]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import ws from 'ws';

if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = ws;

const [codeArg, countArg, baseArg] = process.argv.slice(2);
const CODE = (codeArg ?? '').toUpperCase();
const COUNT = Number(countArg ?? 2);
const BASE = (baseArg ?? process.env.ROUNDUP_BASE_URL ?? 'https://roundup-sgs.pages.dev').replace(/\/$/, '');
if (!CODE) {
  console.error('usage: node scripts/fill-room.mjs <ROOM_CODE> [count] [baseUrl]');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

async function call(name, token, body) {
  const res = await fetch(`${BASE}/api/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  });
  return res.json();
}

const names = ['BotMaya', 'BotLeo', 'BotZoe', 'BotSam', 'BotIvy'];
let roomId = null;

for (let i = 0; i < COUNT; i++) {
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  const token = data.session.access_token;

  const joined = await call('join-room', token, { code: CODE, displayName: names[i % names.length] });
  if (!joined.ok) throw new Error(`join failed: ${JSON.stringify(joined.error)}`);
  roomId = joined.room.id;

  const ready = await call('update-room', token, { roomId, ready: true });
  if (!ready.ok) throw new Error(`ready failed: ${JSON.stringify(ready.error)}`);
  console.log(`seated+ready: ${names[i % names.length]}`);
}

console.log(`\nOK: room ${CODE} now has ${COUNT} extra ready players (roomId=${roomId}).`);
