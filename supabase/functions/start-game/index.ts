import { z } from 'zod';
import { createHandler, checkRateLimit } from '../_shared/http/handler.ts';
import { ok, fail } from '../_shared/http/envelope.ts';
import { randomUUID, isUuid } from '../_shared/std/uuid.ts';
import { getGameMeta } from '../_shared/games/registry.ts';
import { roundsBounds, validateGameConfig } from '../_shared/games/configs.ts';
import { themeSupportsGame, getTheme } from '../_shared/config/themes.ts';
import { wordsForTheme } from '../_shared/content/seed.ts';
import { getEngine } from '../_shared/engine/registry.ts';
import { loadPlayers } from '../_shared/engine/pipeline.ts';
import { postSystemMessage } from '../_shared/events/log.ts';
import type { GameEventRow } from '../_shared/engine/types.ts';
import { isGameId } from '../_shared/games/types.ts';

const schema = z.object({ roomId: z.string().uuid() });
const RATE = { max: 10, windowSeconds: 300 };

interface RoomRow {
  id: string;
  host_id: string;
  status: string;
  game_id: string | null;
  theme: string;
  difficulty: string;
  rounds: number;
  config: Record<string, unknown>;
}

export default createHandler('start-game', { requireAuth: true }, async ({ client, userId, body }) => {
  const now = Date.now();
  if (!userId) return fail('UNAUTHORIZED', undefined, now);

  const parsed = schema.safeParse(body);
  if (!parsed.success || !isUuid(parsed.data.roomId)) return fail('INVALID_INPUT', undefined, now);
  const roomId = parsed.data.roomId;

  const allowed = await checkRateLimit(client, `start-game:${userId}`, RATE.max, RATE.windowSeconds);
  if (!allowed) return fail('ACTION_RATE_LIMITED', undefined, now);

  // Resolve the room once. supabase-js has no `SELECT ... FOR UPDATE` builder,
  // so the atomic guarantee comes from the conditional claim below: only one
  // writer can move the room out of 'lobby', so no two starts both succeed and
  // nothing can act on a room that has moved underneath us.
  const { data: roomData, error: roomError } = await client
    .from('rooms')
    .select('id, host_id, status, game_id, theme, difficulty, rounds, config')
    .eq('id', roomId)
    .maybeSingle();

  if (roomError) {
    console.error('start-game room load failed', roomError.message);
    return fail('SERVER_ERROR', undefined, now);
  }
  const room = (roomData ?? null) as RoomRow | null;
  if (!room) return fail('ROOM_NOT_FOUND', undefined, now);
  if (room.host_id !== userId) return fail('NOT_HOST', undefined, now);

  // Claim the lobby atomically: the `status = 'lobby'` precondition means only
  // one concurrent start wins. An existing running session is returned
  // (idempotent) without touching the row.
  const { data: claimed } = await client
    .from('rooms')
    .update({ status: 'preparing', last_activity_at: new Date(now).toISOString() })
    .eq('id', roomId)
    .eq('status', 'lobby')
    .select('id')
    .maybeSingle();

  if (!claimed) {
    if (room.status === 'closed') return fail('ROOM_CLOSED', undefined, now);
    // Another writer beat us to it (or the room was deleted). No stale session
    // to hand back here, since the claim already failed.
    return fail('ROOM_ALREADY_STARTED', undefined, now);
  }

  const release = async () => {
    await client.from('rooms').update({ status: 'lobby' }).eq('id', roomId).eq('status', 'preparing');
  };

  try {
    if (!room.game_id || !isGameId(room.game_id)) {
      await release();
      return fail('INVALID_INPUT', { message: 'pick a game first' }, now);
    }
    const gameId = room.game_id;
    const meta = getGameMeta(gameId);

    if (!themeSupportsGame(room.theme, gameId)) {
      await release();
      return fail('THEME_GAME_MISMATCH', undefined, now);
    }

    const players = await loadPlayers(client, roomId, now);
    if (players.length < meta.minPlayers || players.length > meta.maxPlayers) {
      await release();
      return fail('PLAYER_COUNT', { min: meta.minPlayers, max: meta.maxPlayers }, now);
    }
    if (meta.evenPlayersOnly && (players.length < 4 || players.length % 2 !== 0)) {
      await release();
      return fail('NEED_EVEN_PLAYERS', undefined, now);
    }

    if (meta.mode === 'teams') {
      const teamA = players.filter((p) => p.teamId === 'a').length;
      const teamB = players.filter((p) => p.teamId === 'b').length;
      if (teamA !== players.length / 2 || teamB !== players.length / 2) {
        await release();
        return fail('INVALID_SETTINGS', { message: 'teams must be balanced' }, now);
      }
    }

    // The host is part of the room: insert the host's seat so the game starts
    // for *everyone* in the room, not just the ready players. The host has no
    // The host is part of the room: insert its seat so the game starts for
    // *everyone* in the room, not just the ready players. The host has no
    // `ready` flag, so its seat is inserted with a neutral ready=false that the
    // engines treat as "participating".
    const { error: hostInsertError } = await client
      .from('room_players')
      .insert({
        room_id: roomId,
        user_id: room.host_id,
        display_name: 'Host',
        ready: false,
        last_seen_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();
    if (hostInsertError) {
      console.error('start-game host player insert failed', hostInsertError.message);
      await release();
      return fail('SERVER_ERROR', undefined, now);
    }

    const bounds = roundsBounds(gameId);
    if (room.rounds < bounds.min || room.rounds > bounds.max) {
      await release();
      return fail('INVALID_SETTINGS', { message: `rounds must be ${bounds.min} to ${bounds.max}` }, now);
    }
    const configCheck = validateGameConfig(gameId, room.config ?? {});
    if (!configCheck.ok) {
      await release();
      return fail('INVALID_SETTINGS', { message: configCheck.message }, now);
    }

    const contentEntries = wordsForTheme(room.theme, room.difficulty);
    if (contentEntries.length === 0) {
      await release();
      return fail('NOT_ENOUGH_CONTENT', undefined, now);
    }

    const engine = getEngine(gameId);
    const phaseId = randomUUID();

    // Session row first so teams can reference it; init fills the rest below.
    const { data: sessionRow, error: sessionError } = await client
      .from('game_sessions')
      .insert({
        room_id: roomId,
        game_id: gameId,
        phase: engine.initialPhase,
        phase_id: phaseId,
        phase_started_at: new Date(now).toISOString(),
        phase_ends_at: null,
        round_index: 0,
        total_rounds: room.rounds,
        config: configCheck.config,
        public_state: {},
        version: 1,
        status: 'active',
      })
      .select('id')
      .single();
    if (sessionError || !sessionRow) {
      console.error('start-game session insert failed', sessionError?.message);
      await release();
      return fail('SERVER_ERROR', undefined, now);
    }
    const sessionId = (sessionRow as { id: string }).id;

    const failRollback = async (message: string) => {
      console.error('start-game rollback', message);
      await client.from('game_sessions').delete().eq('id', sessionId);
      await release();
      return fail('SERVER_ERROR', undefined, now);
    };

    // Teams for team games — created before init so score rows can use ids.
    let teamIds: { a: string; b: string } | null = null;
    if (meta.mode === 'teams') {
      const { data: createdTeams, error: teamsError } = await client
        .from('teams')
        .insert([
          { session_id: sessionId, key: 'a', name: 'Team A', color_token: 'a' },
          { session_id: sessionId, key: 'b', name: 'Team B', color_token: 'b' },
        ])
        .select('id, key');
      if (teamsError || !createdTeams) return await failRollback(teamsError?.message ?? 'teams failed');
      const ids = { a: '', b: '' };
      for (const t of createdTeams as { id: string; key: string }[]) {
        if (t.key === 'a') ids.a = t.id;
        if (t.key === 'b') ids.b = t.id;
      }
      teamIds = ids;
      const memberRows = players
        .filter((p) => p.teamId === 'a' || p.teamId === 'b')
        .map((p, i) => ({
          team_id: p.teamId === 'a' ? ids.a : ids.b,
          user_id: p.id,
          order_index: i,
        }));
      const { error: membersError } = await client.from('team_members').insert(memberRows);
      if (membersError) return await failRollback(membersError.message);
    }

    const theme = getTheme(room.theme);
    let init: ReturnType<typeof engine.initialize>;
    try {
      init = engine.initialize({
        players,
        config: configCheck.config,
        theme: room.theme,
        themeLabel: theme?.label ?? room.theme,
        difficulty: room.difficulty,
        totalRounds: room.rounds,
        now,
        hostId: room.host_id,
        teamIds,
        rng: Math.random,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('NO_CONTENT')) {
        await client.from('game_sessions').delete().eq('id', sessionId);
        await release();
        return fail('NOT_ENOUGH_CONTENT', undefined, now);
      }
      throw err;
    }

    const { error: updateError } = await client
      .from('game_sessions')
      .update({
        phase: init.phase,
        phase_ends_at: init.phaseEndsAt === null ? null : new Date(init.phaseEndsAt).toISOString(),
        public_state: init.publicState,
      })
      .eq('id', sessionId);
    if (updateError) return await failRollback(updateError.message);

    const { error: secureError } = await client.from('game_state_secure').insert({
      session_id: sessionId,
      state: init.state,
      version: 1,
    });
    if (secureError) return await failRollback(secureError.message);

    const viewRows = players.map((p) => ({
      session_id: sessionId,
      user_id: p.id,
      view: init.views[p.id] ?? {},
      version: 1,
    }));
    const { error: viewsError } = await client.from('player_views').insert(viewRows);
    if (viewsError) return await failRollback(viewsError.message);

    const roundRows = Array.from({ length: room.rounds }, (_, i) => ({
      session_id: sessionId,
      index: i,
    }));
    const { error: roundsError } = await client.from('rounds').insert(roundRows);
    if (roundsError) return await failRollback(roundsError.message);

    const eventRows = ((init.events ?? []) as GameEventRow[]).map((e) => ({
      session_id: sessionId,
      room_id: roomId,
      type: e.type,
      actor_id: e.actor_id ?? null,
      action_id: e.action_id ?? null,
      payload: e.payload ?? {},
    }));
    if (eventRows.length > 0) {
      const { error: eventsError } = await client.from('game_events').insert(eventRows);
      if (eventsError) return await failRollback(eventsError.message);
    }
    for (const message of init.systemMessages ?? []) {
      await postSystemMessage(client, { roomId, sessionId, body: message });
    }

    const { error: statusError } = await client
      .from('rooms')
      .update({ status: 'in_game', last_activity_at: new Date(now).toISOString() })
      .eq('id', roomId);
    if (statusError) return await failRollback(statusError.message);

    return ok({ sessionId }, Date.now());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('start-game failed', message);
    await release();
    return fail('SERVER_ERROR', undefined, now);
  }
});
