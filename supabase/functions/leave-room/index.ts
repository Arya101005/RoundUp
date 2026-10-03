import { z } from 'zod';
import { createHandler, checkRateLimit } from '../_shared/http/handler.ts';
import { ok, fail } from '../_shared/http/envelope.ts';
import { logEvent, postSystemMessage } from '../_shared/events/log.ts';

const schema = z.object({ roomId: z.string().uuid() });

export default createHandler('leave-room', { requireAuth: true }, async ({ client, userId, body }) => {
  const now = Date.now();
  if (!userId) return fail('UNAUTHORIZED', undefined, now);

  const allowed = await checkRateLimit(client, `leave-room:${userId}`, 20, 300);
  if (!allowed) return fail('ACTION_RATE_LIMITED', undefined, now);

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail('INVALID_INPUT', undefined, now);
  const roomId = parsed.data.roomId;

  const { data: membership } = await client
    .from('room_players')
    .select('id, display_name, left_at')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership || (membership as { left_at: string | null }).left_at) {
    return fail('NOT_IN_ROOM', undefined, now);
  }

  const { data: roomRow } = await client
    .from('rooms')
    .select('id, host_id, status')
    .eq('id', roomId)
    .maybeSingle();

  if (!roomRow) return fail('ROOM_NOT_FOUND', undefined, now);
  const room = roomRow as { id: string; host_id: string; status: string };
  const displayName = (membership as { display_name: string }).display_name;

  const { error: leaveError } = await client
    .from('room_players')
    .update({ left_at: new Date().toISOString(), ready: false })
    .eq('id', (membership as { id: string }).id);

  if (leaveError) {
    console.error('leave-room update failed', leaveError.message);
    return fail('SERVER_ERROR', undefined, now);
  }

  await logEvent(client, {
    type: 'PLAYER_LEFT',
    roomId,
    actorId: userId,
    payload: { name: displayName },
  });
  await postSystemMessage(client, { roomId, body: `${displayName} left the room.` });

  // Host migration: longest-connected active player becomes host.
  if (room.host_id === userId) {
    const { data: candidates } = await client
      .from('room_players')
      .select('user_id, display_name, joined_at')
      .eq('room_id', roomId)
      .is('left_at', null)
      .order('joined_at', { ascending: true })
      .limit(1);

    const next = (candidates?.[0] ?? null) as { user_id: string; display_name: string } | null;
    if (next) {
      const { error: hostError } = await client
        .from('rooms')
        .update({ host_id: next.user_id })
        .eq('id', roomId);
      if (hostError) {
        console.error('leave-room host transfer failed', hostError.message);
      } else {
        await client
          .from('room_players')
          .update({ is_host_cached: false })
          .eq('room_id', roomId);
        await client
          .from('room_players')
          .update({ is_host_cached: true })
          .eq('room_id', roomId)
          .eq('user_id', next.user_id);
        await logEvent(client, {
          type: 'HOST_CHANGED',
          roomId,
          actorId: next.user_id,
          payload: { name: next.display_name },
        });
        await postSystemMessage(client, {
          roomId,
          body: `${next.display_name} is now the host.`,
        });
      }
    }
  }

  return ok({ left: true }, Date.now());
});
