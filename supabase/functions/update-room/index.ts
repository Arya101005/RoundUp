import { z } from 'zod';
import { createHandler, checkRateLimit } from '../_shared/http/handler.ts';
import { ok, fail } from '../_shared/http/envelope.ts';
import { validateRoomSettings } from '../_shared/rooms/validation.ts';
import { logEvent, postSystemMessage } from '../_shared/events/log.ts';
import { gameRegistry } from '../_shared/games/registry.ts';

const schema = z.object({
  roomId: z.string().uuid(),
  gameId: z.string().optional(),
  theme: z.string().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  rounds: z.number().int().optional(),
  config: z.record(z.unknown()).optional(),
  ready: z.boolean().optional(),
  kickUserId: z.string().uuid().optional(),
  transferHostTo: z.string().uuid().optional(),
  assignTeam: z.object({ userId: z.string().uuid(), teamId: z.enum(['a', 'b']).nullable() }).optional(),
  assignTeams: z
    .array(z.object({ userId: z.string().uuid(), teamId: z.enum(['a', 'b']) }))
    .max(12)
    .optional(),
});

export default createHandler('update-room', { requireAuth: true }, async ({ client, userId, body }) => {
  const now = Date.now();
  if (!userId) return fail('UNAUTHORIZED', undefined, now);

  const allowed = await checkRateLimit(client, `update-room:${userId}`, 60, 10);
  if (!allowed) return fail('ACTION_RATE_LIMITED', undefined, now);

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail('INVALID_INPUT', undefined, now);
  const input = parsed.data;

  const { data: roomRow } = await client
    .from('rooms')
    .select('*')
    .eq('id', input.roomId)
    .maybeSingle();
  if (!roomRow) return fail('ROOM_NOT_FOUND', undefined, now);
  const room = roomRow as {
    id: string;
    host_id: string;
    status: string;
    game_id: string | null;
    theme: string;
    difficulty: string;
    rounds: number;
    config: Record<string, unknown>;
  };

  const { data: membership } = await client
    .from('room_players')
    .select('id, left_at, team_id')
    .eq('room_id', room.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership || (membership as { left_at: string | null }).left_at) {
    return fail('NOT_IN_ROOM', undefined, now);
  }

  const isHost = room.host_id === userId;
  const gameRunning = room.status === 'preparing' || room.status === 'in_game';

  // Members: toggle own ready state (allowed any time; the server re-checks at start).
  if (input.ready !== undefined) {
    const { error } = await client
      .from('room_players')
      .update({ ready: input.ready })
      .eq('id', (membership as { id: string }).id);
    if (error) {
      console.error('update-room ready failed', error.message);
      return fail('SERVER_ERROR', undefined, now);
    }
    if (input.ready) {
      await logEvent(client, { type: 'PLAYER_READY', roomId: room.id, actorId: userId });
    }
    return ok({ room: null }, Date.now());
  }

  if (!isHost) return fail('NOT_HOST', undefined, now);

  // Host: kick.
  if (input.kickUserId) {
    const { data: target } = await client
      .from('room_players')
      .select('id, display_name')
      .eq('room_id', room.id)
      .eq('user_id', input.kickUserId)
      .is('left_at', null)
      .maybeSingle();
    if (!target) return fail('INVALID_INPUT', undefined, now);

    await client
      .from('room_players')
      .update({ left_at: new Date().toISOString(), ready: false })
      .eq('id', (target as { id: string }).id);
    await postSystemMessage(client, {
      roomId: room.id,
      body: `${(target as { display_name: string }).display_name} was removed from the room.`,
    });
    await logEvent(client, { type: 'PLAYER_LEFT', roomId: room.id, actorId: input.kickUserId });
    return ok({ room: null }, Date.now());
  }

  // Host: transfer host.
  if (input.transferHostTo) {
    const { data: target } = await client
      .from('room_players')
      .select('id, display_name')
      .eq('room_id', room.id)
      .eq('user_id', input.transferHostTo)
      .is('left_at', null)
      .maybeSingle();
    if (!target) return fail('INVALID_INPUT', undefined, now);

    const { error } = await client.from('rooms').update({ host_id: input.transferHostTo }).eq('id', room.id);
    if (error) {
      console.error('update-room transfer failed', error.message);
      return fail('SERVER_ERROR', undefined, now);
    }
    await client.from('room_players').update({ is_host_cached: false }).eq('room_id', room.id);
    await client
      .from('room_players')
      .update({ is_host_cached: true })
      .eq('room_id', room.id)
      .eq('user_id', input.transferHostTo);
    await logEvent(client, {
      type: 'HOST_CHANGED',
      roomId: room.id,
      actorId: input.transferHostTo,
      payload: { name: (target as { display_name: string }).display_name },
    });
    await postSystemMessage(client, {
      roomId: room.id,
      body: `${(target as { display_name: string }).display_name} is now the host.`,
    });
    return ok({ room: null }, Date.now());
  }

  // Host: team assignment (team games only, lobby only).
  if (input.assignTeam || input.assignTeams) {
    if (gameRunning) return fail('ROOM_ALREADY_STARTED', undefined, now);
    const currentGame = input.gameId ?? room.game_id;
    if (!currentGame || gameRegistry[currentGame as keyof typeof gameRegistry]?.mode !== 'teams') {
      return fail('INVALID_INPUT', undefined, now);
    }
    const assignments = input.assignTeams ?? (input.assignTeam ? [input.assignTeam] : []);
    for (const a of assignments) {
      const { error } = await client
        .from('room_players')
        .update({ team_id: a.teamId })
        .eq('room_id', room.id)
        .eq('user_id', a.userId)
        .is('left_at', null);
      if (error) {
        console.error('update-room team failed', error.message);
        return fail('SERVER_ERROR', undefined, now);
      }
    }
    return ok({ room: null }, Date.now());
  }

  // Host: settings changes are rejected while a game is running.
  if (gameRunning) return fail('ROOM_ALREADY_STARTED', undefined, now);

  const nextSettings = {
    gameId: input.gameId ?? room.game_id ?? undefined,
    theme: input.theme ?? room.theme,
    difficulty: input.difficulty ?? room.difficulty,
    rounds: input.rounds ?? room.rounds,
    config:
      input.config ??
      (input.gameId && input.gameId !== room.game_id ? {} : room.config),
  };

  if (!nextSettings.gameId) return fail('INVALID_INPUT', undefined, now);

  const settings = validateRoomSettings({
    gameId: nextSettings.gameId,
    theme: nextSettings.theme,
    difficulty: nextSettings.difficulty,
    rounds: nextSettings.rounds,
    config: nextSettings.config,
  });
  if (!settings.ok || !settings.gameId) {
    return fail('INVALID_SETTINGS', { message: settings.message ?? 'review the values' }, now);
  }

  const { data: updated, error: updateError } = await client
    .from('rooms')
    .update({
      game_id: settings.gameId,
      theme: nextSettings.theme,
      difficulty: nextSettings.difficulty,
      rounds: settings.rounds ?? nextSettings.rounds,
      config: settings.config ?? {},
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', room.id)
    .select('*')
    .single();

  if (updateError || !updated) {
    console.error('update-room settings failed', updateError?.message);
    return fail('SERVER_ERROR', undefined, now);
  }

  if (input.gameId && input.gameId !== room.game_id) {
    await logEvent(client, {
      type: 'GAME_SELECTED',
      roomId: room.id,
      actorId: userId,
      payload: { game: settings.gameId },
    });
  }

  return ok({ room: updated }, Date.now());
});
