/**
 * Full playthrough driver: every game from room creation to a finished session.
 *
 *   node scripts/e2e-games.mjs                       # deployed prod
 *   ROUNDUP_BASE_URL=http://localhost:4173 node scripts/e2e-games.mjs
 *   node scripts/e2e-games.mjs --game=auction        # one game only
 *
 * Unlike scripts/e2e-http.mjs (which only proves the lifecycle up to a couple
 * of Imposter phases), this drives each of the six engines to `finished` and
 * checks the evaluated scores and winner. It talks to the same
 * `/api/functions/<name>` surface the browser uses and reads the server-only
 * state (game_state_secure / player_views) with the service role so it can play
 * the games *correctly* (guess the real words, place items in reference order,
 * bid the minimum). That exercises the real scoring paths.
 *
 * Authored for the `movies` theme; every game listed below supports it.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import ws from 'ws';

if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = ws;

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--game='))?.split('=')[1] ?? null;
const positional = args.filter((a) => !a.startsWith('--'));
const BASE = (process.env.ROUNDUP_BASE_URL ?? positional[0] ?? 'https://roundup-sgs.pages.dev').replace(/\/$/, '');
const THEME = process.env.ROUNDUP_THEME ?? 'movies';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !ANON || !SERVICE) {
  console.error('BLOCKED: .env needs VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let checks = 0;
let failures = 0;
const expect = (label, ok, detail = '') => {
  checks++;
  if (!ok) failures++;
  console.log(`   ${ok ? 'ok  ' : 'FAIL'}  ${label}${ok || !detail ? '' : ` -- ${detail}`}`);
};

// ---- transport -------------------------------------------------------------

async function api(name, token, body) {
  const res = await fetch(`${BASE}/api/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return { http: res.status, ...json };
  } catch {
    return { http: res.status, ok: false, raw: text.slice(0, 300) };
  }
}

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  if (!res.ok) throw new Error(`REST ${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const getSession = async (id) => (await rest(`game_sessions?select=*&id=eq.${id}`))[0] ?? null;
const getState = async (id) => (await rest(`game_state_secure?select=state&session_id=eq.${id}`))[0]?.state ?? null;
const getViews = async (id) => {
  const rows = await rest(`player_views?select=user_id,view&session_id=eq.${id}`);
  return Object.fromEntries(rows.map((r) => [r.user_id, r.view]));
};
const hasEvent = async (id, type) =>
  (await rest(`game_events?select=id&session_id=eq.${id}&type=eq.${type}`)).length > 0;

// ---- players ---------------------------------------------------------------

async function makeUser(label) {
  const client = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  });
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  return { label, id: data.user.id, token: data.session.access_token };
}

async function touchPresence(user, roomId) {
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/touch_presence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${user.token}` },
    body: JSON.stringify({ p_room_id: roomId }),
  }).catch(() => {});
}

// ---- session helpers -------------------------------------------------------

const act = (user, sessionId, type, payload = {}) =>
  api('game-action', user.token, { sessionId, actionId: randomUUID(), type, payload });

const leaderboard = (session) => {
  const totals = (session?.public_state?.totalScores ?? {}) ?? {};
  return Object.entries(totals)
    .map(([id, points]) => ({ id, points: Number(points) || 0 }))
    .sort((a, b) => b.points - a.points);
};

/** Waits out the current phase deadline, ticks, and returns the fresh session. */
async function tickToNextPhase(user, sessionId, guard = 14) {
  const start = await getSession(sessionId);
  const fromPhaseId = start?.phase_id ?? null;
  for (let i = 0; i < guard; i++) {
    const s = await getSession(sessionId);
    if (!s || s.status !== 'active') return s;
    if (s.phase_id !== fromPhaseId) return s;
    const ends = s.phase_ends_at ? Date.parse(s.phase_ends_at) : Date.now();
    const wait = ends - Date.now() + 450;
    if (wait > 0) await sleep(wait);
    await api('game-tick', user.token, { sessionId, phaseId: s.phase_id });
  }
  return getSession(sessionId);
}

// ---- room scaffolding ------------------------------------------------------

async function createRoom(host, gameId, config, rounds = 1) {
  const created = await api('create-room', host.token, {
    displayName: `Host_${gameId}`,
    gameId,
    theme: THEME,
    difficulty: 'medium',
    rounds,
    config,
  });
  if (created.ok !== true) throw new Error(`create-room(${gameId}) failed: ${JSON.stringify(created.error ?? created.raw ?? created)}`);
  return created.room;
}

async function seatPlayers(room, users, { teams = false } = {}) {
  for (let i = 1; i < users.length; i++) {
    const joined = await api('join-room', users[i].token, { code: room.code, displayName: `${users[i].label}` });
    if (joined.ok !== true) throw new Error(`join ${users[i].label} failed: ${JSON.stringify(joined.error ?? joined.raw)}`);
  }
  if (teams) {
    users.forEach((u, i) => {
      u.teamId = i % 2 === 0 ? 'a' : 'b';
    });
    const assign = await api('update-room', users[0].token, {
      roomId: room.id,
      assignTeams: users.map((u, i) => ({ userId: u.id, teamId: i % 2 === 0 ? 'a' : 'b' })),
    });
    if (assign.ok !== true) throw new Error(`assignTeams failed: ${JSON.stringify(assign.error ?? assign.raw)}`);
  }
  for (let i = 1; i < users.length; i++) {
    const r = await api('update-room', users[i].token, { roomId: room.id, ready: true });
    if (r.ok !== true) throw new Error(`ready ${users[i].label} failed: ${JSON.stringify(r.error ?? r.raw)}`);
  }
  const started = await api('start-game', users[0].token, { roomId: room.id });
  if (started.ok !== true) throw new Error(`start-game(${room.game_id}) failed: ${JSON.stringify(started.error ?? started.raw)}`);
  await Promise.all(users.map((u) => touchPresence(u, room.id)));
  return started.sessionId;
}

/** Verifies the finished session and returns a report row. */
async function finishReport(gameId, room, sessionId, users, notes) {
  const s = await getSession(sessionId);
  const board = leaderboard(s);
  const top = board[0]?.points ?? 0;
  const winners = board.filter((b) => b.points === top).map((b) => b.id);
  const names = Object.fromEntries(users.map((u) => [u.id, u.label]));

  expect('session is finished', s?.status === 'finished', `status=${s?.status}`);
  expect('GAME_ENDED event logged', await hasEvent(sessionId, 'GAME_ENDED'));
  expect('a top scorer is above zero', top > 0, JSON.stringify(board));
  expect('room returned to lobby', (await rest(`rooms?select=status&id=eq.${room.id}`))[0]?.status === 'lobby');

  return {
    game: gameId,
    code: room.code,
    winnerLabels: winners.map((id) => names[id] ?? id.slice(0, 8)),
    winnerScore: top,
    board: board.map((b) => ({ name: names[b.id] ?? b.id.slice(0, 8), points: b.points })),
    notes,
  };
}

// ---- per-game drivers ------------------------------------------------------

async function playImposter() {
  const users = [await makeUser('ImpHost'), await makeUser('ImpA'), await makeUser('ImpB')];
  const room = await createRoom(users[0], 'imposter', {
    discussionMode: 'free_chat',
    discussionSeconds: 60,
    votingSeconds: 20,
    imposterSeesTheme: true,
    imposterGuessEnabled: true,
    guessSeconds: 15,
    turnSeconds: 10,
    laps: 1,
  });
  const sessionId = await seatPlayers(room, users);

  let s = await tickToNextPhase(users[0], sessionId); // role_reveal -> discussion
  expect('imposter: role_reveal advanced to discussion', s?.phase === 'discussion', s?.phase);

  const ended = await act(users[0], sessionId, 'end_discussion'); // -> voting
  expect('imposter: end_discussion opened voting', ended.ok === true && ended.session?.phase === 'voting',
    JSON.stringify(ended.error ?? ended.session?.phase));

  const state = await getState(sessionId);
  const setup = state.rounds[0];
  const imposterId = setup.imposterId;
  const imposter = users.find((u) => u.id === imposterId);
  const crew = users.filter((u) => u.id !== imposterId);

  await act(crew[0], sessionId, 'vote', { targetId: imposterId });
  await act(crew[1], sessionId, 'vote', { targetId: imposterId });
  const lastVote = await act(imposter, sessionId, 'vote', { targetId: crew[0].id });
  expect('imposter: all votes closed voting -> vote_reveal', lastVote.session?.phase === 'vote_reveal',
    lastVote.session?.phase ?? JSON.stringify(lastVote.error));
  expect('imposter: the imposter was caught', lastVote.session?.public_state?.caughtId === imposterId,
    String(lastVote.session?.public_state?.caughtId));

  s = await tickToNextPhase(users[0], sessionId); // vote_reveal -> imposter_guess
  expect('imposter: caught imposter gets a guess', s?.phase === 'imposter_guess', s?.phase);

  const guessed = await act(imposter, sessionId, 'guess', { word: setup.word });
  expect('imposter: correct guess reached round_results', guessed.session?.phase === 'round_results',
    guessed.session?.phase ?? JSON.stringify(guessed.error));

  s = await tickToNextPhase(users[0], sessionId); // round_results -> finished

  return finishReport('imposter', room, sessionId, users, {
    secret: setup.word,
    imposter: imposter.label,
    path: 'caught + guessed the word',
  });
}

async function playHeadsUp() {
  const users = [await makeUser('HUHost'), await makeUser('HUA'), await makeUser('HUB')];
  const room = await createRoom(users[0], 'heads_up', { turnSeconds: 30, turnsPerPlayer: 1, guessesPerTurn: 3 });
  const sessionId = await seatPlayers(room, users);

  for (let i = 0; i < 8; i++) {
    const s = await getSession(sessionId);
    if (!s || s.status !== 'active') break;
    if (s.phase !== 'turn') {
      await tickToNextPhase(users[0], sessionId);
      continue;
    }
    await Promise.all(users.map((u) => touchPresence(u, room.id)));
    const activeId = s.public_state?.currentId;
    const state = await getState(sessionId);
    const word = state?.rounds?.[s.round_index]?.assignments?.[activeId];
    const active = users.find((u) => u.id === activeId);
    if (!active || !word) {
      await tickToNextPhase(users[0], sessionId);
      continue;
    }
    const res = await act(active, sessionId, 'guess', { word });
    expect(`heads_up: ${active.label} solved their word`, res.ok === true, JSON.stringify(res.error ?? res.raw));
    if (res.session?.status !== 'active') break;
  }

  await tickToNextPhase(users[0], sessionId); // round_results -> finished
  return finishReport('heads_up', room, sessionId, users, { turnsPerPlayer: 1 });
}

async function playPassword() {
  const users = [await makeUser('PwHost'), await makeUser('PwA'), await makeUser('PwB'), await makeUser('PwC')];
  const room = await createRoom(users[0], 'password', { clueSeconds: 15, guessSeconds: 10, maxClues: 3 });
  const sessionId = await seatPlayers(room, users, { teams: true });

  // Two word turns: Team A solves on clue 1, Team B takes a wrong guess then solves on clue 2.
  const CLUES = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
  let clueIndex = 0;
  let teamATurn = true;
  let teamBWasted = false;
  for (let i = 0; i < 12; i++) {
    const s = await getSession(sessionId);
    if (!s || s.status !== 'active') break;
    const state = await getState(sessionId);
    const turn = state.current.wordTurn;
    const giver = users.find((u) => u.id === turn.giverId);
    const guesser = users.find((u) => u.id !== turn.giverId && u.teamId === turn.team);
    if (!giver || !guesser) break;

    if (s.phase === 'clue') {
      const clue = CLUES[clueIndex++ % CLUES.length];
      const res = await act(giver, sessionId, 'clue', { text: clue });
      expect(`password: Team ${turn.team.toUpperCase()} giver submitted a clue`, res.ok === true,
        JSON.stringify(res.error ?? res.raw));
    } else if (s.phase === 'guess') {
      if (teamATurn) {
        const res = await act(guesser, sessionId, 'guess', { word: turn.word });
        expect('password: Team A solved on the first clue', res.ok === true, JSON.stringify(res.error ?? res.raw));
        teamATurn = false;
      } else if (!teamBWasted) {
        const wrong = await act(guesser, sessionId, 'guess', { word: 'zzzznotaword' });
        expect('password: Team B wasted a guess', wrong.ok === true, JSON.stringify(wrong.error ?? wrong.raw));
        teamBWasted = true;
      } else {
        const right = await act(guesser, sessionId, 'guess', { word: turn.word });
        expect('password: Team B solved on the second clue', right.ok === true, JSON.stringify(right.error ?? right.raw));
      }
    } else {
      await tickToNextPhase(users[0], sessionId);
    }
  }

  await tickToNextPhase(users[0], sessionId); // round_results -> finished
  return finishReport('password', room, sessionId, users, { teams: 2, turns: 2 });
}

async function playCharades() {
  const users = [await makeUser('ChHost'), await makeUser('ChA'), await makeUser('ChB'), await makeUser('ChC')];
  const room = await createRoom(users[0], 'charades', { performanceSeconds: 45, skips: 1 });
  const sessionId = await seatPlayers(room, users, { teams: true });

  let bSkipped = false;
  for (let i = 0; i < 16; i++) {
    const s = await getSession(sessionId);
    if (!s || s.status !== 'active') break;
    if (s.phase !== 'perform') {
      await tickToNextPhase(users[0], sessionId);
      continue;
    }
    const state = await getState(sessionId);
    const turn = state.current.turn;
    const performer = users.find((u) => u.id === turn.performerId);
    const guesser = users.find((u) => u.id !== turn.performerId && u.teamId === turn.team);
    if (!performer || !guesser) {
      await tickToNextPhase(users[0], sessionId);
      continue;
    }
    if (turn.team === 'b' && !bSkipped) {
      const skip = await act(performer, sessionId, 'skip');
      expect('charades: performer skipped once (penalty path)', skip.ok === true, JSON.stringify(skip.error ?? skip.raw));
      const fresh = await getState(sessionId);
      const newSecret = fresh.current.turn.pool[fresh.current.wordIndex];
      const res = await act(guesser, sessionId, 'guess', { word: newSecret });
      expect('charades: Team B solved after a skip', res.ok === true, JSON.stringify(res.error ?? res.raw));
      bSkipped = true;
    } else {
      const secret = turn.pool[state.current.wordIndex];
      const res = await act(guesser, sessionId, 'guess', { word: secret });
      expect(`charades: Team ${turn.team.toUpperCase()} solved the prompt`, res.ok === true, JSON.stringify(res.error ?? res.raw));
    }
  }

  return finishReport('charades', room, sessionId, users, { teams: 2, turns: 2, teamBSkipped: true });
}

async function playBlindRanking() {
  const users = [await makeUser('BrHost'), await makeUser('BrA')];
  const room = await createRoom(users[0], 'blind_ranking', { rankingSize: 4, perItemSeconds: 10 });
  const sessionId = await seatPlayers(room, users);

  for (let i = 0; i < 30; i++) {
    const s = await getSession(sessionId);
    if (!s || s.status !== 'active') break;
    if (s.phase !== 'placing') {
      await tickToNextPhase(users[0], sessionId);
      continue;
    }
    const state = await getState(sessionId);
    const setup = state.rounds[s.round_index];
    const item = s.public_state?.item;
    if (!item) {
      await tickToNextPhase(users[0], sessionId);
      continue;
    }
    for (const u of users) {
      const placed = state.current.placed[u.id] ?? [];
      if (placed.includes(item)) continue;
      let position;
      if (u.label === 'BrHost') {
        // Perfect play: keep the list sorted in reference (best-first) order —
        // count only already-placed items that precede this one in the reference.
        const refIdx = setup.reference.indexOf(item);
        position = setup.reference.filter((r, i) => i < refIdx && placed.includes(r)).length;
      } else {
        position = 0; // Adversarial: always dump the new item at the front.
      }
      const res = await act(u, sessionId, 'place', { item, position });
      expect(`blind_ranking: ${u.label} placed "${item}"`, res.ok === true, JSON.stringify(res.error ?? res.raw));
    }
  }

  await tickToNextPhase(users[0], sessionId); // reveal -> round_results
  await tickToNextPhase(users[0], sessionId); // round_results -> finished
  return finishReport('blind_ranking', room, sessionId, users, { rankingSize: 4, hostPlayedPerfect: true });
}

async function playAuction() {
  const users = [await makeUser('AucHost'), await makeUser('AucA')];
  const room = await createRoom(users[0], 'auction', {
    startingBudget: 1000,
    itemCount: 4,
    bidSeconds: 10,
    minIncrement: 10,
  });
  const sessionId = await seatPlayers(room, users);

  const bidOn = new Set();
  for (let i = 0; i < 80; i++) {
    const s = await getSession(sessionId);
    if (!s || s.status !== 'active') break;
    if (s.phase !== 'bidding') {
      await tickToNextPhase(users[0], sessionId);
      continue;
    }
    const idx = s.public_state?.itemIndex ?? 0;
    if (!bidOn.has(idx)) {
      const amount = s.public_state?.minNextBid;
      const res = await act(users[0], sessionId, 'bid', { amount });
      expect(`auction: host bid ${amount} on item ${idx + 1}`, res.ok === true, JSON.stringify(res.error ?? res.raw));
      bidOn.add(idx);
    }
    await tickToNextPhase(users[0], sessionId); // bidding -> next intro / reveal
  }

  await tickToNextPhase(users[0], sessionId); // reveal -> round_results
  await tickToNextPhase(users[0], sessionId); // round_results -> finished
  return finishReport('auction', room, sessionId, users, { itemCount: 4, hostWonAll: true });
}

// ---- driver ----------------------------------------------------------------

const GAMES = {
  imposter: playImposter,
  heads_up: playHeadsUp,
  password: playPassword,
  charades: playCharades,
  blind_ranking: playBlindRanking,
  auction: playAuction,
};

console.log(`\nRoundUp full playthrough — theme=${THEME} — ${BASE}\n`);

const results = [];
for (const [game, run] of Object.entries(GAMES)) {
  if (only && only !== game) continue;
  console.log(`▶ ${game}`);
  try {
    const row = await run();
    results.push(row);
    const b = row.board.map((x) => `${x.name}=${x.points}`).join('  ');
    console.log(`   → winner: ${row.winnerLabels.join(', ')} (${row.winnerScore})  scores: ${b}\n`);
  } catch (err) {
    failures++;
    console.log(`   → FAILED: ${err.message}\n`);
    results.push({ game, error: err.message });
  }
}

console.log('================ SUMMARY ================');
for (const r of results) {
  if (r.error) console.log(`${r.game.padEnd(14)} ERROR  ${r.error}`);
  else console.log(`${r.game.padEnd(14)} ${r.code}  winner=${r.winnerLabels.join('/')} (${r.winnerScore})`);
}
const total = Object.keys(GAMES).filter((g) => !only || only === g).length;
console.log(`\nGAMES_PLAYED ${results.filter((r) => !r.error).length}/${total}`);
console.log(`CHECKS ${checks - failures} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
