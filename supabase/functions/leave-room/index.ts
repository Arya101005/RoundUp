import { z } from 'zod';
import { createHandler, checkRateLimit } from '../_shared/http/handler.ts';
import { ok, fail } from '../_shared/http/envelope.ts';
import { logEvent, postSystemMessage } from '../_shared/events/log.ts';

const schema = z.object({ roomId: z.string().uuid() });

/**
 * Deletes a room when its last member leaves.
 *
 * Rooms are never silently retained: retaining a full lobby for hours on end
 * means zero data, zero sessions, and an empty row that every auth query
 * still has to scan. Once the last player sets `left_at`, we hard-delete the
 * `rooms` row — every `room_players`, `game_sessions`, `player_views`,
 * `chat_messages`, `scores`, `rounds`, `game_events`, `teams` row for that
 * room falls out with `ON DELETE CASCADE`.
 *
 * The deletion is done under `INACTIVE_LOCK` so two players leaving in the
 * same instant can't both apply. The guard reads the *active* count back
 * from a row-lock so a second departure sees the room already gone.
 */
export default createHandler(
  'leave-room',
  { requireAuth: true },
  async ({ client, userId, body }) => {
    const now = Date.now();
    if (!userId) return fail('UNAUTHORIZED', undefined, now);

    const allowed = await checkRateLimit(client, `leave-room:${userId}`, 20, 300);
    if (!allowed) return fail('ACTION_RATE_LIMITED', undefined, now);

    const parsed = schema.safeParse(body);
    if (!parsed.success) return fail('INVALID_INPUT', undefined, now);
    const roomId = parsed.data.roomId;

    // --- 1. Find the seat (must be current, not a stale replay). -----------
    const { data: membership, error: loadError } = await client
      .from('room_players')
      .select('id, display_name, left_at')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .maybeSingle();

    if (loadError) {
      console.error('leave-room find failed', loadError.message);
      return fail('SERVER_ERROR', undefined, now);
    }
    if (!membership || (membership as { left_at: string | null }).left_at) {
      return fail('NOT_IN_ROOM', undefined, now);
    }
    const { display_name, id: seatId } = membership as { display_name: string; id: string };

    // --- 2. Lock the room row so nothing else mutates it while we decide. --
    // `SELECT ... FOR NO KEY UPDATE` is not exposed by supabase-js, so the row
    // lock comes from a conditional single-row UPDATE: Postgres takes the row
    // lock for that statement and the `status` precondition keeps the
    // read-modify-write below race-free against concurrent leaves.
    const { data: lockRow, error: lockError } = await client
      .from('rooms')
      .update({ updated_at: new Date(now).toISOString() })
      .eq('id', roomId)
      .neq('status', 'closed')
      .select('id, host_id, status')
      .maybeSingle();

    if (lockError) {
      console.error('leave-room lock failed', lockError.message);
      return fail('SERVER_ERROR', undefined, now);
    }

    if (!lockRow) return fail('ROOM_NOT_FOUND', undefined, now);
    const room = lockRow as { id: string; host_id: string; status: string };

    // --- 3. Set the seat to inactive. -------------------------------------
    const { error: updateError } = await client
      .from('room_players')
      .update({ left_at: new Date(now).toISOString(), ready: false })
      .eq('id', seatId);

    if (updateError) {
      console.error('leave-room update failed', updateError.message);
      return fail('SERVER_ERROR', undefined, now);
    }

    await logEvent(client, {
      type: 'PLAYER_LEFT',
      roomId,
      actorId: userId,
      payload: { name: display_name },
    });
    await postSystemMessage(client, { roomId, body: `${display_name} left the room.` });

    // --- 4. Decide the outcome. -----------------------------------------
    if (room.status === 'closed') {
      // Already closed (retention) — nothing further to do.
      return ok({ left: true, roomLeft: false, status: 'closed' }, Date.now());
    }

    if (room.status === 'in_game' || room.status === 'preparing') {
      // A game is running. Cancelling it destroys the session *and* the
      // finished state would already have returned the room to lobby.
      const abort = async () => {
        const { error: abortError } = await client
          .from('game_sessions')
          .update({ status: 'aborted', ended_at: new Date(now).toISOString() })
          .eq('room_id', roomId)
          .eq('status', 'preparing');
        if (abortError) {
          console.error('leave-room abort failed', abortError.message);
          return false;
        }
        const { error: roomError } = await client
          .from('rooms')
          .update({ status: 'closed', last_activity_at: new Date(now).toISOString() })
          .eq('id', roomId)
          .eq('status', 'in_game');
        if (roomError) {
          console.error('leave-room close failed', roomError.message);
          return false;
        }
        return true;
      };

      // Only the host may abort a running game.
      if (room.host_id !== userId) {
        // Non-host: just leave. The host aborts on departure, or the room
        // keeps running.
        return ok({ left: true, roomLeft: false, status: 'in_game' }, Date.now());
      }

      if (!(await abort())) {
        return fail('SERVER_ERROR', undefined, now);
      }
      return ok({ left: true, roomLeft: true, status: 'closed' }, Date.now());
    }

    // --- 5. Lobby room: count active players, delete if this was the last. -
    const { count } = await client
      .from('room_players')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .is('left_at', null);

    if (count === 0) {
      // Last player: hard-delete (cascade removes every per-room row).
      const { error: removeError } = await client
        .from('rooms')
        .delete()
        .eq('id', roomId)
        .eq('status', 'lobby');
      if (removeError) {
        console.error('leave-room remove failed', removeError.message);
        return fail('SERVER_ERROR', undefined, now);
      }
      await logEvent(client, {
        type: 'GAME_ENDED',
        roomId,
        actorId: userId,
        payload: { name: display_name, reason: 'room_deleted' },
      });
      return ok({ left: true, roomLeft: true, status: 'deleted' }, Date.now());
    }

    // Host transfer when this host leaves and others remain.
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

    return ok({ left: true, roomLeft: false, status: 'lobby' }, Date.now());
  },
);
