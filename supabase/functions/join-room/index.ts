import { createHandler, checkRateLimit } from '../_shared/http/handler.ts';
import { ok, fail } from '../_shared/http/envelope.ts';
import { checkDisplayName, joinRoomSchema } from '../_shared/rooms/validation.ts';
import { isValidCode, normalizeCodeInput } from '../_shared/rooms/codes.ts';
import { logEvent, postSystemMessage } from '../_shared/events/log.ts';
import { suggestName } from '../_shared/rooms/validation.ts';

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

export default createHandler('join-room', { requireAuth: true }, async ({ client, userId, body }) => {
  const now = Date.now();
  if (!userId) return fail('UNAUTHORIZED', undefined, now);

  const allowed = await checkRateLimit(client, `join-room:${userId}`, 20, 300);
  if (!allowed) return fail('ACTION_RATE_LIMITED', undefined, now);

  const parsed = joinRoomSchema.safeParse(body);
  if (!parsed.success) return fail('INVALID_INPUT', undefined, now);

  const code = normalizeCodeInput(parsed.data.code);
  if (!isValidCode(code)) return fail('ROOM_NOT_FOUND', undefined, now);

  const name = checkDisplayName(parsed.data.displayName);
  if (!name.ok) return fail('NAME_INVALID', undefined, now);

  const { data: roomRow, error: roomError } = await client
    .from('rooms')
    .select('id, code, status, game_id')
    .eq('code', code)
    .maybeSingle();

  if (roomError) {
    console.error('join-room rooms lookup failed', roomError.message);
    return fail('SERVER_ERROR', undefined, now);
  }
  if (!roomRow) return fail('ROOM_NOT_FOUND', undefined, now);
  const room = roomRow as RoomRow;

  // A closed room is simply gone — nothing to rejoin, nothing to leak.
  if (room.status === 'closed') return fail('ROOM_NOT_FOUND', undefined, now);

  // Rejoin: an existing seat is restored even mid-game (reconnect, not new join).
  const { data: existing, error: memberError } = await client
    .from('room_players')
    .select('id, left_at')
    .eq('room_id', room.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (memberError) {
    console.error('join-room membership failed', memberError.message);
    return fail('SERVER_ERROR', undefined, now);
  }

  if (existing) {
    const { error: restoreError } = await client
      .from('room_players')
      .update({ left_at: null, last_seen_at: new Date().toISOString(), ready: false })
      .eq('id', (existing as { id: string }).id);

    if (restoreError) {
      console.error('join-room restore failed', restoreError.message);
      return fail('SERVER_ERROR', undefined, now);
    }
    if ((existing as { left_at: string | null }).left_at) {
      await logEvent(client, { type: 'PLAYER_RECONNECTED', roomId: room.id, actorId: userId });
      await postSystemMessage(client, {
        roomId: room.id,
        body: `${name.name} is back in the room.`,
      });
    }
    return ok({ room, playerId: (existing as { id: string }).id }, Date.now());
  }

  if (room.status !== 'lobby') {
    // A brand-new user cannot enter a running game.
    return fail('ROOM_ALREADY_STARTED', undefined, now);
  }

  // Atomic membership insert: the room must still be lobby and the row must not
  // exist yet. The `left_at` filter on room_players below doubles as the active
  // count used for the full-player gate, so this cannot be observed "between"
  // members joining.
  const { data: player, error: insertError } = await client
    .from('room_players')
    .insert({
      room_id: room.id,
      user_id: userId,
      display_name: name.name,
      ready: false,
      last_seen_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return fail('NAME_TAKEN', { suggestion: suggestName(name.name, []) }, now);
    }
    console.error('join-room insert failed', insertError.message);
    return fail('SERVER_ERROR', undefined, now);
  }

  await logEvent(client, {
    type: 'PLAYER_JOINED',
    roomId: room.id,
    actorId: userId,
    payload: { name: name.name },
  });
  await postSystemMessage(client, { roomId: room.id, body: `${name.name} joined the room.` });

  return ok({ room, playerId: (player as { id: string }).id }, Date.now());
});
