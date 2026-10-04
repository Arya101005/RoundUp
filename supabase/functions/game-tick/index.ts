import { z } from 'zod';
import { createHandler, checkRateLimit } from '../_shared/http/handler.ts';
import { ok, fail } from '../_shared/http/envelope.ts';
import {
  loadGame,
  loadPlayers,
  runDueTick,
  syncFinishedRoom,
} from '../_shared/engine/pipeline.ts';

const schema = z.object({
  sessionId: z.string().uuid(),
  phaseId: z.string().uuid().optional(),
});

const RATE = { max: 60, windowSeconds: 10 };

/**
 * Timer advance: any member may ask the server to resolve an expired phase.
 * The commit is guarded by phase_id and the version check, so concurrent or
 * stale ticks are harmless no-ops.
 */
export default createHandler('game-tick', { requireAuth: true }, async ({ client, userId, body }) => {
  const now = Date.now();
  if (!userId) return fail('UNAUTHORIZED', undefined, now);

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail('INVALID_INPUT', undefined, now);

  const allowed = await checkRateLimit(client, `game-tick:${userId}`, RATE.max, RATE.windowSeconds);
  if (!allowed) return fail('ACTION_RATE_LIMITED', undefined, now);

  const game = await loadGame(client, parsed.data.sessionId);
  if (!game) return fail('SESSION_NOT_FOUND', undefined, now);

  const { data: membership } = await client
    .from('room_players')
    .select('id')
    .eq('room_id', game.session.room_id)
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle();
  if (!membership) return fail('NOT_IN_ROOM', undefined, now);

  // A tick for a superseded phase (or a non-running game) is a no-op.
  if (game.session.status !== 'active') {
    return ok({ advanced: false, session: game.session }, Date.now());
  }
  if (parsed.data.phaseId && parsed.data.phaseId !== game.session.phase_id) {
    return ok({ advanced: false, session: game.session }, Date.now());
  }

  const players = await loadPlayers(client, game.session.room_id, now);
  const tick = await runDueTick(client, game, players, now);
  if (tick.status === 'error') return fail('SERVER_ERROR', undefined, now);
  if (tick.status === 'advanced') {
    if (tick.game.session.status === 'finished') {
      await syncFinishedRoom(client, tick.game.session.room_id, now);
    }
  }

  // 'stale' / 'none' still return the original session row.
  return ok(
    {
      advanced: tick.status === 'advanced',
      session: tick.status === 'advanced' ? tick.game.session : game.session,
    },
    Date.now(),
  );
});
