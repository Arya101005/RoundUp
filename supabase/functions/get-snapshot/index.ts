import { z } from 'zod';
import { createHandler, checkRateLimit } from '../_shared/http/handler.ts';
import { ok, fail } from '../_shared/http/envelope.ts';
import { normalizeCodeInput } from '../_shared/rooms/codes.ts';

const schema = z.object({ roomCode: z.string().min(1).max(10) });

/** A closed or deleted room can never be re-entered, so no snapshot exists. */
function failRoomClosed(now: number) {
  return fail('ROOM_NOT_FOUND', undefined, now);
}

export default createHandler(
  'get-snapshot',
  { requireAuth: true },
  async ({ client, userId, body }) => {
    const now = Date.now();
    if (!userId) return fail('UNAUTHORIZED', undefined, now);

    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail('INVALID_INPUT', undefined, now);

    const allowed = await checkRateLimit(client, `snapshot:${userId}`, 60, 60);
    if (!allowed) return fail('ACTION_RATE_LIMITED', undefined, now);

    const code = normalizeCodeInput(parsed.data.roomCode);

    const { data: roomRow, error: roomError } = await client
      .from('rooms')
      .select('id, code, status, game_id')
      .eq('code', code)
      .maybeSingle();

    if (roomError) {
      console.error('get-snapshot rooms lookup failed', roomError.message);
      return fail('SERVER_ERROR', undefined, now);
    }
    if (!roomRow) return fail('ROOM_NOT_FOUND', undefined, now);
    const room = roomRow as { id: string; status: string };

    // A closed room has been purged from the user's view entirely (the last
    // player left and the room was deleted). Do not leak that it existed.
    if (room.status === 'closed') return failRoomClosed(now);

    const { data: membership, error: memberError } = await client
      .from('room_players')
      .select('id, left_at')
      .eq('room_id', room.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (memberError) {
      console.error('get-snapshot membership failed', memberError.message);
      return fail('SERVER_ERROR', undefined, now);
    }
    if (!membership) return fail('NOT_IN_ROOM', undefined, now);
    if ((membership as { left_at: string | null }).left_at) {
      // Seat exists but was given up: restore it so refresh mid-game reconnects.
      await client
        .from('room_players')
        .update({ left_at: null, last_seen_at: new Date().toISOString() })
        .eq('id', (membership as { id: string }).id);
    }

    const [playersRes, sessionRes, chatRes] = await Promise.all([
      client
        .from('room_players')
        .select('*')
        .eq('room_id', room.id)
        .is('left_at', null)
        .order('joined_at', { ascending: true }),
      client
        .from('game_sessions')
        .select('*')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from('chat_messages')
        .select('*')
        .eq('room_id', room.id)
        .order('created_at', { ascending: true })
        .limit(100),
    ]);

    if (playersRes.error) {
      console.error('get-snapshot players failed', playersRes.error.message);
      return fail('SERVER_ERROR', undefined, now);
    }

    const session = (sessionRes.data ?? null) as Record<string, unknown> | null;
    const sessionId = session ? (session.id as string) : null;

    let myView: Record<string, unknown> | null = null;
    if (sessionId) {
      const { data: viewRow, error: viewError } = await client
        .from('player_views')
        .select('view')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (viewError) {
        console.error('get-snapshot view failed', viewError.message);
        return fail('SERVER_ERROR', undefined, now);
      }
      myView = ((viewRow as { view: Record<string, unknown> } | null)?.view ?? null);
    }

    return ok(
      {
        room,
        players: playersRes.data ?? [],
        session,
        myView,
        chat: chatRes.data ?? [],
      },
      Date.now(),
    );
  },
);
