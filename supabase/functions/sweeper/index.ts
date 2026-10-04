import { createHandler } from '../_shared/http/handler.ts';
import { ok, fail } from '../_shared/http/envelope.ts';
import { env } from '../_shared/http/env.ts';
import {
  loadGame,
  loadPlayers,
  runDueTick,
  syncFinishedRoom,
} from '../_shared/engine/pipeline.ts';

const SWEEP_LIMIT = 25;
const ABORT_AFTER_MS = 2 * 60 * 60 * 1000;
const ABORT_LIMIT = 10;

/**
 * Safety-net sweeper: resolves expired phase deadlines for sessions nobody is
 * watching and aborts games abandoned for hours. Also invoked by pg_cron
 * (vault cron_secret) and, when configured, by a platform cron with
 * CRON_SECRET — the operation is time-gated, so calling it unauthenticated
 * can only advance phases whose deadline has genuinely passed.
 */
export default createHandler('sweeper', { requireAuth: false }, async ({ client, req }) => {
  const now = Date.now();

  const cronSecret = env('CRON_SECRET');
  if (cronSecret) {
    const header = req.headers.get('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token !== cronSecret) return fail('UNAUTHORIZED', undefined, now);
  }

  const { data: due, error } = await client
    .from('game_sessions')
    .select('id')
    .eq('status', 'active')
    .not('phase_ends_at', 'is', null)
    .lte('phase_ends_at', new Date(now).toISOString())
    .limit(SWEEP_LIMIT);
  if (error) {
    console.error('sweeper query failed', error.message);
    return fail('SERVER_ERROR', undefined, now);
  }

  let swept = 0;
  for (const row of (due ?? []) as { id: string }[]) {
    try {
      const game = await loadGame(client, row.id);
      if (!game) continue;
      const players = await loadPlayers(client, game.session.room_id, now);
      const tick = await runDueTick(client, game, players, now);
      if (tick.status === 'advanced') {
        swept += 1;
        if (tick.game.session.status === 'finished') {
          await syncFinishedRoom(client, tick.game.session.room_id, now);
        }
      }
    } catch (err) {
      console.error('sweeper tick failed', row.id, err instanceof Error ? err.message : err);
    }
  }

  // Abandoned games: no session may stay active for hours on end.
  const cutoff = new Date(now - ABORT_AFTER_MS).toISOString();
  const { data: abandoned } = await client
    .from('game_sessions')
    .select('id, room_id')
    .in('status', ['preparing', 'active'])
    .lt('created_at', cutoff)
    .limit(ABORT_LIMIT);

  let aborted = 0;
  for (const row of (abandoned ?? []) as { id: string; room_id: string }[]) {
    const { error: abortError } = await client
      .from('game_sessions')
      .update({ status: 'aborted', ended_at: new Date(now).toISOString() })
      .eq('id', row.id)
      .in('status', ['preparing', 'active']);
    if (!abortError) {
      aborted += 1;
      await client
        .from('rooms')
        .update({ status: 'closed', last_activity_at: new Date(now).toISOString() })
        .eq('id', row.room_id)
        .eq('status', 'in_game');
    } else {
      console.error('sweeper abort failed', row.id, abortError.message);
    }
  }

  return ok({ swept, aborted }, Date.now());
});
