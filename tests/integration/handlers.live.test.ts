/**
 * Live integration test: calls the real Edge Function handlers directly
 * (Web Request in, Web Response out) against the hosted Supabase project.
 * Skips itself when .env is absent (e.g. in CI without credentials).
 *
 * This bypasses the Supabase functions gateway, so it verifies handler logic,
 * auth, rate limits, RLS, and DB writes end to end.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import createRoom from '../../supabase/functions/create-room/index.ts';
import joinRoom from '../../supabase/functions/join-room/index.ts';
import leaveRoom from '../../supabase/functions/leave-room/index.ts';
import updateRoom from '../../supabase/functions/update-room/index.ts';
import sendChat from '../../supabase/functions/send-chat/index.ts';
import getSnapshot from '../../supabase/functions/get-snapshot/index.ts';

type Handler = (req: Request) => Promise<Response>;

let envPresent = true;
try {
  const text = readFileSync(join(process.cwd(), '.env'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('=') || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
} catch (err) {
  envPresent = false;
  console.warn('live tests skipped, .env not readable:', (err as Error).message);
}

async function call(
  handler: Handler,
  token: string | null | undefined,
  body: unknown,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Hard ceiling: a wedged network call must fail this call, not the whole suite.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('handler call exceeded 25s')), 25_000);
  });
  try {
    const res = await Promise.race([
      handler(
        new Request('https://handlers.test/invoke', {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        }),
      ),
      timeout,
    ]);
    return { status: res.status, json: await res.json() };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function makeClient(): SupabaseClient {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function tokenOf(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw new Error(`anon sign-in failed: ${error.message}`);
  return data.session!.access_token;
}

describe.skipIf(!envPresent)('live handlers against hosted project', () => {
  let tokens: string[] = [];
  let users: SupabaseClient[] = [];
  let roomId = '';
  let roomCode = '';

  beforeAll(async () => {
    users = [makeClient(), makeClient(), makeClient()];
    tokens = [];
    for (const u of users) tokens.push(await tokenOf(u));
  }, 60_000);

  it('creates a room with a 5-character code', async () => {
    const res = await call(createRoom, tokens[0], {
      displayName: 'HostPriya',
      gameId: 'imposter',
      theme: 'movies',
      difficulty: 'medium',
      rounds: 3,
      config: {},
    });
    expect(res.json.ok).toBe(true);
    roomId = res.json.room.id;
    roomCode = res.json.room.code;
    expect(roomCode).toMatch(/^[A-Z0-9]{5}$/);
  }, 30_000);

  it('rejects a request without a token', async () => {
    const res = await call(createRoom, null, {});
    expect(res.json.ok).toBe(false);
    expect(res.json.error.code).toBe('UNAUTHORIZED');
  });

  it('lets a second player join', async () => {
    const res = await call(joinRoom, tokens[1], { code: roomCode, displayName: 'FriendRahul' });
    expect(res.json.ok).toBe(true);
  }, 30_000);

  it('rejects duplicate names with a suggestion', async () => {
    const res = await call(joinRoom, tokens[2], { code: roomCode, displayName: 'friendrahul' });
    expect(res.json.ok).toBe(false);
    expect(res.json.error.code).toBe('NAME_TAKEN');
    expect(res.json.error.message).toMatch(/Try/);
  }, 30_000);

  it('rejects an unknown room code', async () => {
    const res = await call(joinRoom, tokens[2], { code: 'ZZZZZ', displayName: 'Ghost' });
    expect(res.json.ok).toBe(false);
    expect(res.json.error.code).toBe('ROOM_NOT_FOUND');
  }, 30_000);

  it('lets the third player join with a free name', async () => {
    const res = await call(joinRoom, tokens[2], { code: roomCode, displayName: 'FriendAsha' });
    expect(res.json.ok).toBe(true);
  }, 30_000);

  it('rejects settings changes from a non-host', async () => {
    const res = await call(updateRoom, tokens[1], { roomId, rounds: 5 });
    expect(res.json.ok).toBe(false);
    expect(res.json.error.code).toBe('NOT_HOST');
  }, 30_000);

  it('lets a member toggle ready and validates host settings', async () => {
    const ready = await call(updateRoom, tokens[1], { roomId, ready: true });
    expect(ready.json.ok).toBe(true);

    const bad = await call(updateRoom, tokens[0], { roomId, rounds: 99 });
    expect(bad.json.ok).toBe(false);
    expect(bad.json.error.code).toBe('INVALID_SETTINGS');

    const ok = await call(updateRoom, tokens[0], { roomId, theme: 'cricket' });
    expect(ok.json.ok).toBe(true);
    expect(ok.json.room.theme).toBe('cricket');
  }, 30_000);

  it('sanitizes chat and rate limits floods', async () => {
    const sent = await call(sendChat, tokens[1], { roomId, body: '  hello   team  ' });
    expect(sent.json.ok).toBe(true);
    expect(sent.json.message.body).toBe('hello team');

    // Fire the flood concurrently so every attempt lands in one time window;
    // the limit is 5 messages per 5 seconds.
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        call(sendChat, tokens[1], { roomId, body: `flood ${i}` }),
      ),
    );
    const rateHits = results.filter(
      (r) => r.json.ok === false && r.json.error.code === 'RATE_LIMITED',
    );
    expect(rateHits.length).toBeGreaterThan(0);
  }, 30_000);

  it('returns a consistent snapshot to every player', async () => {
    const a = await call(getSnapshot, tokens[0], { roomCode });
    const b = await call(getSnapshot, tokens[1], { roomCode });
    expect(a.json.ok).toBe(true);
    expect(b.json.ok).toBe(true);
    expect(a.json.players).toHaveLength(3);
    expect(b.json.players).toHaveLength(3);
    expect(
      a.json.players.find((p: any) => p.display_name === 'FriendRahul').ready,
    ).toBe(true);
    expect(a.json.chat.some((m: any) => m.body === 'hello team')).toBe(true);
  }, 30_000);

  it('rejects leaving a room you are not a member of', async () => {
    const outsider = await call(leaveRoom, tokens[2], {
      roomId: '00000000-0000-0000-0000-000000000000',
    });
    expect(outsider.json.ok).toBe(false);
    // Stable code for "you are not in this room"; does not leak room existence.
    expect(outsider.json.error.code).toBe('NOT_IN_ROOM');
  }, 30_000);

  it('keeps other users out of private tables (RLS leak checks)', async () => {
    const attacker = users[1]!;
    expect(attacker).toBeDefined();

    const { data: views } = await attacker.from('player_views').select('*').limit(5);
    expect(views ?? []).toHaveLength(0);

    // Rows exist in rate_limits (we just flooded chat); a broken RLS would show them.
    const { data: rates } = await attacker.from('rate_limits').select('*').limit(5);
    expect(rates ?? []).toHaveLength(0);

    const { data: secure } = await attacker.from('game_state_secure').select('*').limit(5);
    expect(secure ?? []).toHaveLength(0);

    const { data: otherRooms } = await attacker.from('rooms').select('id').limit(10);
    // Only rooms the attacker belongs to are visible: exactly one.
    expect(otherRooms ?? []).toHaveLength(1);
    expect((otherRooms ?? []).map((r) => r.id)).toContain(roomId);

    const { error: insert } = await attacker
      .from('rooms')
      .insert({ code: 'HACK1', host_id: '00000000-0000-0000-0000-000000000000' });
    expect(insert).toBeTruthy();
  }, 60_000);
});
