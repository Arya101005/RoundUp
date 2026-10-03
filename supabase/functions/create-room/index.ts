import { createHandler, checkRateLimit } from '../_shared/http/handler.ts';
import { ok, fail } from '../_shared/http/envelope.ts';
import {
  checkDisplayName,
  createRoomSchema,
  validateRoomSettings,
} from '../_shared/rooms/validation.ts';
import { generateCode } from '../_shared/rooms/codes.ts';
import { logEvent } from '../_shared/events/log.ts';

const RATE = { max: 10, windowSeconds: 300 };

interface RoomRow {
  id: string;
  code: string;
  host_id: string;
  status: string;
  game_id: string | null;
  theme: string;
  difficulty: string;
  rounds: number;
  config: Record<string, unknown>;
  max_players: number;
  created_at: string;
  last_activity_at: string;
}

export default createHandler(
  'create-room',
  { requireAuth: true },
  async ({ client, userId, body }) => {
    const now = Date.now();
    if (!userId) return fail('UNAUTHORIZED', undefined, now);

    const allowed = await checkRateLimit(
      client,
      `create-room:${userId}`,
      RATE.max,
      RATE.windowSeconds,
    );
    if (!allowed) return fail('ACTION_RATE_LIMITED', undefined, now);

    const parsed = createRoomSchema.safeParse(body);
    if (!parsed.success) return fail('INVALID_INPUT', undefined, now);

    const name = checkDisplayName(parsed.data.displayName);
    if (!name.ok) return fail('NAME_INVALID', undefined, now);

    const settings = validateRoomSettings({
      gameId: parsed.data.gameId,
      theme: parsed.data.theme,
      difficulty: parsed.data.difficulty,
      rounds: parsed.data.rounds,
      config: parsed.data.config,
    });
    if (!settings.ok || !settings.gameId) {
      return fail('INVALID_SETTINGS', { message: settings.message ?? 'review the values' }, now);
    }

    // Unique code with collision retry.
    let room: RoomRow | null = null;
    for (let attempt = 0; attempt < 6 && !room; attempt++) {
      const code = generateCode();
      const { data, error } = await client
        .from('rooms')
        .insert({
          code,
          host_id: userId,
          status: 'lobby',
          game_id: settings.gameId,
          theme: parsed.data.theme,
          difficulty: parsed.data.difficulty,
          rounds: settings.rounds ?? parsed.data.rounds,
          config: settings.config ?? {},
          max_players: parsed.data.maxPlayers ?? 10,
        })
        .select()
        .single();

      if (!error && data) {
        room = data as RoomRow;
      } else if (error && !error.code?.includes('23505')) {
        console.error('create-room insert failed', error.message);
        return fail('SERVER_ERROR', undefined, now);
      }
    }
    if (!room) return fail('SERVER_ERROR', undefined, now);

    const { data: player, error: playerError } = await client
      .from('room_players')
      .insert({
        room_id: room.id,
        user_id: userId,
        display_name: name.name,
        ready: false,
        is_host_cached: true,
      })
      .select('id')
      .single();

    if (playerError || !player) {
      console.error('create-room player insert failed', playerError?.message);
      await client.from('rooms').delete().eq('id', room.id);
      return fail('SERVER_ERROR', undefined, now);
    }

    await logEvent(client, {
      type: 'ROOM_CREATED',
      roomId: room.id,
      actorId: userId,
      payload: { game: settings.gameId, theme: room.theme },
    });
    await logEvent(client, {
      type: 'PLAYER_JOINED',
      roomId: room.id,
      actorId: userId,
      payload: { name: name.name },
    });

    return ok({ room, playerId: (player as { id: string }).id }, Date.now());
  },
);
