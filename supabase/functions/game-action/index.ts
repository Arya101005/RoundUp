import { z } from 'zod';
import { createHandler, checkRateLimit } from '../_shared/http/handler.ts';
import { ok, fail } from '../_shared/http/envelope.ts';
import { isErrorCode } from '../_shared/errors/codes.ts';
import { getEngine } from '../_shared/engine/registry.ts';
import {
  actionWasApplied,
  buildStepCtx,
  commitTransition,
  loadGame,
  loadPlayers,
  runDueTick,
  syncFinishedRoom,
} from '../_shared/engine/pipeline.ts';
import type { ActionResult } from '../_shared/engine/types.ts';

const schema = z.object({
  sessionId: z.string().uuid(),
  actionId: z.string().uuid(),
  type: z.string().min(1).max(40),
  payload: z.record(z.unknown()).optional(),
  expectedPhaseId: z.string().uuid().optional(),
});

const RATE = { max: 40, windowSeconds: 10 };
const MAX_ATTEMPTS = 3;

export default createHandler('game-action', { requireAuth: true }, async ({ client, userId, body }) => {
  const now = Date.now();
  if (!userId) return fail('UNAUTHORIZED', undefined, now);

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail('INVALID_INPUT', undefined, now);
  const input = parsed.data;

  const allowed = await checkRateLimit(
    client,
    `game-action:${userId}`,
    RATE.max,
    RATE.windowSeconds,
  );
  if (!allowed) return fail('ACTION_RATE_LIMITED', undefined, now);

  // Membership: the session's room must contain this user, still seated.
  const probe = await loadGame(client, input.sessionId);
  if (!probe) return fail('SESSION_NOT_FOUND', undefined, now);
  const roomId = probe.session.room_id;

  const { data: membership } = await client
    .from('room_players')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle();
  if (!membership) return fail('NOT_IN_ROOM', undefined, now);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const game = attempt === 0 ? probe : (await loadGame(client, input.sessionId));
    if (!game) return fail('SESSION_NOT_FOUND', undefined, now);
    const { session } = game;

    // Idempotency first: a replayed action returns the current session
    // untouched — even when that action is what finished the game.
    if (await actionWasApplied(client, session.id, input.actionId)) {
      return ok({ session, replayed: true }, Date.now());
    }

    if (session.status === 'finished' || session.status === 'aborted') {
      return fail('GAME_ENDED', undefined, now);
    }

    const players = await loadPlayers(client, session.room_id, now);

    // Lazy expiry tick: an expired phase advances before the action lands.
    let current = game;
    const tick = await runDueTick(client, game, players, now);
    if (tick.status === 'stale') continue;
    if (tick.status === 'error') return fail('SERVER_ERROR', undefined, now);
    current = tick.game;

    if (input.expectedPhaseId && input.expectedPhaseId !== current.session.phase_id) {
      return fail('STALE_STATE', undefined, now);
    }

    const engine = getEngine(current.session.game_id);
    const actor = players.find((p) => p.id === userId) ?? null;
    const ctx = buildStepCtx(current.session, players, current.hostId, now, false);

    let result: ActionResult;
    try {
      result = engine.handleAction(
        current.state,
        { type: input.type, payload: input.payload ?? {}, actionId: input.actionId },
        actor,
        ctx,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('engine action failed', current.session.game_id, input.type, message);
      return fail('SERVER_ERROR', undefined, now);
    }

    if (!result.ok) {
      const code = isErrorCode(result.code) ? result.code : 'INVALID_ACTION';
      return fail(code, result.details, Date.now());
    }

    const outcome = await commitTransition(client, {
      session: current.session,
      transition: result.transition,
      expectedVersion: current.session.version,
      actionId: input.actionId,
      now,
    });

    if (outcome.kind === 'ok') {
      if (outcome.session.status === 'finished') {
        await syncFinishedRoom(client, outcome.session.room_id, now);
      }
      return ok({ session: outcome.session, replayed: false }, Date.now());
    }

    if (outcome.kind === 'stale') {
      // Lost a race: either our own action already landed (replay) or another
      // writer moved first — reload and validate against the fresh phase.
      if (await actionWasApplied(client, session.id, input.actionId)) {
        const fresh = await loadGame(client, input.sessionId);
        if (fresh) return ok({ session: fresh.session, replayed: true }, Date.now());
      }
      continue;
    }
    return fail('SESSION_NOT_FOUND', undefined, now);
  }

  return fail('STALE_STATE', undefined, now);
});
