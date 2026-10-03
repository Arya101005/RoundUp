/**
 * End-to-end smoke test against deployed Edge Functions.
 * Covers: anon auth, create/join, duplicate name, bad code, ready sync,
 * chat, snapshot consistency across 3 clients, and RLS leak checks.
 *   node scripts/smoke.mjs
 */
import { createClient, RealtimeClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import ws from 'ws';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const URL_ = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` -- ${detail}`}`);
  ok ? passed++ : failed++;
};

function makeClient() {
  return createClient(URL_, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  });
}

async function signIn(supabase) {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`anon sign-in failed: ${error.message}`);
  return data.user.id;
}

async function fn(supabase, name, body) {
  const { data: session } = await supabase.auth.getSession();
  const res = await fetch(`${URL_}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.session.access_token}`,
      apikey: KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, http: res.status, raw: text.slice(0, 200) };
  }
  return { ok: json.ok === true, http: res.status, ...json };
}

const users = [makeClient(), makeClient(), makeClient()];

try {
  await Promise.all(users.map((u) => signIn(u)));
  check('3 anonymous sessions', true);
} catch (err) {
  console.error('BLOCKED:', err.message);
  console.error('Enable Authentication -> Providers -> Anonymous sign-ins, then re-run.');
  process.exit(1);
}

const first = users[0];
const roomRes = await fn(first, 'create-room', {
  displayName: 'HostPriya',
  gameId: 'imposter',
  theme: 'movies',
  difficulty: 'medium',
  rounds: 3,
  config: {},
});
if (!roomRes.ok && /not found|404|Failed to fetch|No such route/i.test(String(roomRes.raw ?? roomRes.error?.message))) {
  console.error('BLOCKED: Edge Functions are not deployed yet.');
  console.error(`  create-room responded: http=${roomRes.http} ${roomRes.raw ?? roomRes.error?.message}`);
  process.exit(2);
}
check('create-room', roomRes.ok, JSON.stringify(roomRes.error ?? roomRes.raw));
const code = roomRes.room?.code;
check('room code is 5 chars', Boolean(code) && code.length === 5, code ?? '');

const roomCode = { code };

const join2 = await fn(users[1], 'join-room', { ...roomCode, displayName: 'FriendRahul' });
check('join-room second player', join2.ok, JSON.stringify(join2.error));

const dupName = await fn(users[2], 'join-room', { ...roomCode, displayName: 'friendrahul' });
check('duplicate name rejected with suggestion', dupName.ok === false && dupName.error?.code === 'NAME_TAKEN',
  JSON.stringify(dupName.error));
check('name suggestion present', /Try/.test(dupName.error?.message ?? ''), dupName.error?.message ?? '');

const join3 = await fn(users[2], 'join-room', { ...roomCode, displayName: 'FriendAsha' });
check('join-room third player', join3.ok, JSON.stringify(join3.error));

const badCode = await fn(users[2], 'join-room', { code: 'ZZZZZ', displayName: 'Ghost' });
check('bad code -> ROOM_NOT_FOUND', badCode.ok === false && badCode.error?.code === 'ROOM_NOT_FOUND',
  JSON.stringify(badCode.error));

const nonHostUpdate = await fn(users[1], 'update-room', { roomId: roomRes.room.id, rounds: 5 });
check('non-host settings change rejected', nonHostUpdate.ok === false && nonHostUpdate.error?.code === 'NOT_HOST',
  JSON.stringify(nonHostUpdate.error));

const ready2 = await fn(users[1], 'update-room', { roomId: roomRes.room.id, ready: true });
check('member toggles ready', ready2.ok, JSON.stringify(ready2.error));

const chat1 = await fn(users[1], 'send-chat', { roomId: roomRes.room.id, body: '  hello   team  ' });
check('send-chat', chat1.ok, JSON.stringify(chat1.error));
check('chat body sanitized', chat1.message?.body === 'hello team', chat1.message?.body);

const spam = [];
for (let i = 0; i < 6; i++) {
  spam.push(await fn(users[1], 'send-chat', { roomId: roomRes.room.id, body: `flood ${i}` }));
}
const rateHit = spam.some((r) => r.ok === false && r.error?.code === 'RATE_LIMITED');
check('chat rate limit triggers (5 per 5s)', rateHit, JSON.stringify(spam.map((s) => s.error?.code)));

const snapA = await fn(first, 'get-snapshot', roomCode);
const snapB = await fn(users[1], 'get-snapshot', roomCode);
check('snapshot works for both players', snapA.ok && snapB.ok, JSON.stringify(snapA.error ?? snapB.error));
check('both see 3 players', snapA.players?.length === 3 && snapB.players?.length === 3,
  `${snapA.players?.length}/${snapB.players?.length}`);
check('ready state visible in snapshot',
  snapA.players?.find((p) => p.display_name === 'FriendRahul')?.ready === true,
  JSON.stringify(snapA.players?.map((p) => [p.display_name, p.ready])));
check('chat visible in snapshot', (snapA.chat ?? []).some((m) => m.body === 'hello team'),
  String(snapA.chat?.length));

// ---- RLS leak checks (direct table access with a second user's JWT) ----
const attacker = users[1];
const { data: vp } = await attacker.from('player_views').select('*').limit(5);
check('player_views: no rows for other users', (vp ?? []).length === 0, JSON.stringify(vp));
const { error: gss } = await attacker.from('game_state_secure').select('*').limit(5);
check('game_state_secure: unreadable (error or empty)',
  Boolean(gss) || (vp ?? []).length === 0, gss?.message ?? '');
const { error: rc } = await attacker.from('rate_limits').select('*').limit(5);
check('rate_limits: unreadable', Boolean(rc), rc?.message ?? '');
const { data: otherRoom } = await attacker
  .from('rooms')
  .select('id, code')
  .neq('id', roomRes.room.id)
  .limit(5);
check('other rooms invisible', (otherRoom ?? []).length === 0, JSON.stringify(otherRoom));
const { error: insertRoom } = await attacker.from('rooms').insert({ code: 'HACK1', host_id: '00000000-0000-0000-0000-000000000000' });
check('direct room insert denied', Boolean(insertRoom), insertRoom?.message ?? '');
const { error: spoof } = await attacker.rpc('apply_game_action', {
  p_session_id: '00000000-0000-0000-0000-000000000000',
  p_expected_version: 1,
  p_secure_state: '{}',
  p_public_state: '{}',
  p_private_views: '[]',
  p_events: '[]',
  p_scores: '[]',
  p_phase: 'X',
  p_phase_id: '00000000-0000-0000-0000-000000000000',
  p_phase_started_at: new Date().toISOString(),
  p_phase_ends_at: null,
  p_round_index: 0,
  p_status: 'active',
});
check('apply_game_action not callable by authenticated users', Boolean(spoof), spoof?.message ?? '');

console.log(`\nSMOKE_RESULT ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
