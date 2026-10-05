/**
 * End-to-end HTTP test of the whole room lifecycle through the deployed function
 * adapter (`/api/functions/<name>`). This is the exact path Vercel serves from
 * `api/functions/[name].ts`, so running it against a local `vite preview` proves
 * the production handler stack, and running it against a live deployment proves
 * production itself.
 *
 *   node scripts/e2e-http.mjs                         # http://localhost:4173
 *   node scripts/e2e-http.mjs http://localhost:5173   # vite dev
 *   ROUNDUP_BASE_URL=https://your-app.vercel.app node scripts/e2e-http.mjs
 *
 * Covers: anon auth, create-room, joins to the required player count, ready
 * gate, start-game (idempotent), role reveal -> discussion -> voting -> vote
 * reveal transitions via game-action/game-tick, invalid-action handling,
 * 404/405/401 adapter errors, and snapshot consistency.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import ws from 'ws';

if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = ws;
}

const BASE = (process.env.ROUNDUP_BASE_URL ?? process.argv[2] ?? 'http://localhost:4173').replace(
  /\/$/,
  '',
);

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` -- ${detail}`}`);
  ok ? passed++ : failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let env = {};
try {
  env = Object.fromEntries(
    readFileSync(new URL('../.env', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
} catch {
  console.error('BLOCKED: .env not readable. Cannot sign in anonymous users.');
  process.exit(1);
}

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('BLOCKED: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY missing in .env');
  process.exit(1);
}

function makeClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  });
}

async function signIn(client) {
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw new Error(`anon sign-in failed: ${error.message}`);
  return { id: data.user.id, token: data.session.access_token };
}

async function post(name, token, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.apikey !== false) headers.apikey = SUPABASE_KEY;
  const res = await fetch(`${BASE}/api/functions/${name}`, {
    method: opts.method ?? 'POST',
    headers,
    ...(opts.method && opts.method !== 'POST' ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { http: res.status, ok: false, raw: text.slice(0, 200) };
  }
  return { http: res.status, ...json };
}

const uuid = () => crypto.randomUUID();

console.log(`\nRoundUp HTTP end-to-end flow against ${BASE}\n`);

const users = [makeClient(), makeClient(), makeClient()];
let host, p2, p3;
try {
  [host, p2, p3] = await Promise.all(users.map(signIn));
  check('anonymous sign-in for 3 players', true);
} catch (err) {
  console.error('BLOCKED:', err.message);
  console.error('Enable Supabase Authentication -> Providers -> Anonymous sign-ins.');
  process.exit(1);
}

// ---- Adapter error handling -------------------------------------------------
const missing = await post('does-not-exist', host.token, {});
check('unknown function -> 404 NOT_FOUND', missing.http === 404 && missing.error?.code === 'NOT_FOUND',
  JSON.stringify(missing));

const wrongMethod = await post('create-room', host.token, {}, { method: 'GET' });
check('GET on a POST-only function -> 405', wrongMethod.http === 405, JSON.stringify(wrongMethod));

const noAuth = await post('create-room', null, { displayName: 'Nope', gameId: 'imposter', theme: 'movies', difficulty: 'medium', rounds: 1, config: {} });
check('missing token -> 401 UNAUTHORIZED', noAuth.http === 401 && noAuth.error?.code === 'UNAUTHORIZED',
  JSON.stringify(noAuth));

// ---- create-room ------------------------------------------------------------
const created = await post('create-room', host.token, {
  displayName: 'HostPriya',
  gameId: 'imposter',
  theme: 'movies',
  difficulty: 'medium',
  rounds: 1,
  config: { imposterGuessEnabled: false, discussionSeconds: 60, votingSeconds: 20 },
});
check('create-room succeeds', created.ok === true && created.http === 200,
  JSON.stringify(created.error ?? created.raw ?? created));
if (created.ok !== true) {
  console.error('\nCannot continue: room was not created.');
  process.exit(1);
}
const room = created.room;
check('room code is 5 characters', /^[A-Z0-9]{5}$/.test(room?.code ?? ''), room?.code);
const roomCode = room.code;
const roomId = room.id;

// ---- joins to the required player count (imposter needs 3) ------------------
const join2 = await post('join-room', p2.token, { code: roomCode, displayName: 'FriendRahul' });
check('second player joins', join2.ok === true, JSON.stringify(join2.error ?? join2.raw));
const join3 = await post('join-room', p3.token, { code: roomCode, displayName: 'FriendAsha' });
check('third player joins (required count reached)', join3.ok === true, JSON.stringify(join3.error ?? join3.raw));

// ---- ready gate -------------------------------------------------------------
const ready2 = await post('update-room', p2.token, { roomId, ready: true });
const ready3 = await post('update-room', p3.token, { roomId, ready: true });
check('both non-host players ready up', ready2.ok === true && ready3.ok === true,
  JSON.stringify(ready2.error ?? ready3.error));

const lobbySnap = await post('get-snapshot', host.token, { roomCode });
check('lobby snapshot lists 3 players', lobbySnap.ok === true && lobbySnap.players?.length === 3,
  `${lobbySnap.http} ${lobbySnap.players?.length}`);
check('lobby snapshot has no session yet', lobbySnap.session === null, JSON.stringify(lobbySnap.session));

// ---- start-game -------------------------------------------------------------
const started = await post('start-game', host.token, { roomId });
check('start-game succeeds', started.ok === true && typeof started.sessionId === 'string',
  JSON.stringify(started.error ?? started.raw));
if (started.ok !== true) {
  console.error('\nCannot continue: game did not start.');
  process.exit(1);
}
const sessionId = started.sessionId;

const restarted = await post('start-game', host.token, { roomId });
check('start-game is idempotent', restarted.ok === true && restarted.sessionId === sessionId,
  JSON.stringify(restarted.error ?? restarted.sessionId));

const gameSnap = await post('get-snapshot', host.token, { roomCode });
check('room moved to in_game', gameSnap.room?.status === 'in_game', gameSnap.room?.status);
check('session is active in role_reveal', gameSnap.session?.status === 'active' && gameSnap.session?.phase === 'role_reveal',
  `${gameSnap.session?.status}/${gameSnap.session?.phase}`);
check('host receives a private view', gameSnap.myView !== null && typeof gameSnap.myView === 'object',
  JSON.stringify(gameSnap.myView));

// ---- game-action: wrong-phase action is reported, not crashed ---------------
const wrongPhase = await post('game-action', p2.token, {
  sessionId, actionId: uuid(), type: 'vote', payload: { targetId: host.id },
});
check('action in the wrong phase -> WRONG_PHASE', wrongPhase.ok === false && wrongPhase.error?.code === 'WRONG_PHASE',
  JSON.stringify(wrongPhase.error ?? wrongPhase));

// ---- advance role_reveal -> discussion (phase deadline passes) --------------
// Either our tick or the pg_cron sweeper may be the writer, so observe the
// invariant (the phase progresses) rather than who committed it.
let reachedDiscussion = false;
let advancedByTick = false;
const deadline = Date.now() + 35_000;
while (Date.now() < deadline) {
  const tick = await post('game-tick', host.token, { sessionId });
  if (tick.advanced === true) advancedByTick = true;
  if (tick.session?.phase === 'discussion') {
    reachedDiscussion = true;
    break;
  }
  await sleep(2000);
}
check('game advances role_reveal -> discussion', reachedDiscussion,
  `advancedByTick=${advancedByTick}`);

// ---- host ends discussion -> voting ----------------------------------------
const toVoting = await post('game-action', host.token, {
  sessionId, actionId: uuid(), type: 'end_discussion',
});
check('host end_discussion -> voting', toVoting.ok === true && toVoting.session?.phase === 'voting',
  JSON.stringify(toVoting.error ?? toVoting.session?.phase));

// ---- everyone votes -> vote_reveal ------------------------------------------
const v1 = await post('game-action', host.token, { sessionId, actionId: uuid(), type: 'vote', payload: { targetId: p2.id } });
const v2 = await post('game-action', p2.token, { sessionId, actionId: uuid(), type: 'vote', payload: { targetId: host.id } });
const v3 = await post('game-action', p3.token, { sessionId, actionId: uuid(), type: 'vote', payload: { targetId: host.id } });
check('all players can vote', v1.ok === true && v2.ok === true && v3.ok === true,
  JSON.stringify(v1.error ?? v2.error ?? v3.error));
check('final vote closes voting -> vote_reveal', v3.session?.phase === 'vote_reveal',
  v3.session?.phase ?? JSON.stringify(v3.error));

const finalSnap = await post('get-snapshot', p3.token, { roomCode });
check('mid-game snapshot is consistent for a non-host', finalSnap.ok === true && finalSnap.session?.phase === 'vote_reveal',
  `${finalSnap.ok}/${finalSnap.session?.phase}`);
check('snapshot still lists 3 players mid-game', finalSnap.players?.length === 3, String(finalSnap.players?.length));

console.log(`\nHTTP_E2E_RESULT ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
