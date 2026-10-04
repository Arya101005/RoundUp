/**
 * Shared game pipeline for start-game / game-action / game-tick / sweeper:
 * loading sessions and presence, building StepCtx, committing transitions
 * through apply_game_action, and the lazy expiry tick.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GameEventRow, PlayerInfo, StepCtx, Transition } from './types.ts';
import { postSystemMessage } from '../events/log.ts';
import { getEngine } from './registry.ts';

export const PRESENCE_WINDOW_MS = 45_000;

export interface SessionRow {
  id: string;
  room_id: string;
  game_id: string;
  phase: string;
  phase_id: string;
  phase_started_at: string;
  phase_ends_at: string | null;
  round_index: number;
  total_rounds: number;
  config: Record<string, unknown>;
  public_state: Record<string, unknown>;
  version: number;
  status: 'preparing' | 'active' | 'finished' | 'aborted';
  created_at: string;
  ended_at: string | null;
}

export interface LoadedGame {
  session: SessionRow;
  state: Record<string, unknown>;
  hostId: string;
}

/** Loads the session row plus its secure engine state and the room host. */
export async function loadGame(
  client: SupabaseClient,
  sessionId: string,
): Promise<LoadedGame | null> {
  const { data, error } = await client
    .from('game_sessions')
    .select('*, rooms ( host_id )')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw new Error(`load session failed: ${error.message}`);
  if (!data) return null;
  const session = data as SessionRow & { rooms: { host_id: string } | { host_id: string }[] | null };

  const hostId = Array.isArray(session.rooms)
    ? session.rooms[0]?.host_id
    : session.rooms?.host_id;
  if (!hostId) throw new Error('session room missing host');

  const { data: secure, error: secureError } = await client
    .from('game_state_secure')
    .select('state')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (secureError) throw new Error(`load state failed: ${secureError.message}`);
  if (!secure) throw new Error(`missing secure state for session ${sessionId}`);

  return {
    session,
    state: (secure.state as Record<string, unknown>) ?? {},
    hostId,
  };
}

/** Active seated players with presence derived from the 45 s heartbeat. */
export async function loadPlayers(
  client: SupabaseClient,
  roomId: string,
  now: number,
): Promise<PlayerInfo[]> {
  const { data, error } = await client
    .from('room_players')
    .select('user_id, display_name, team_id, last_seen_at, joined_at, ready')
    .eq('room_id', roomId)
    .is('left_at', null)
    .order('joined_at', { ascending: true });
  if (error) throw new Error(`load players failed: ${error.message}`);
  return (data ?? []).map((row) => {
    const r = row as {
      user_id: string;
      display_name: string;
      team_id: string | null;
      last_seen_at: string | null;
      ready: boolean | null;
    };
    const seen = Date.parse(r.last_seen_at ?? '') || 0;
    return {
      id: r.user_id,
      name: r.display_name,
      connected: now - seen < PRESENCE_WINDOW_MS,
      teamId: r.team_id,
      ready: r.ready === true,
    };
  });
}

export function buildStepCtx(
  session: SessionRow,
  players: PlayerInfo[],
  hostId: string,
  now: number,
  expired: boolean,
): StepCtx {
  return {
    now,
    players,
    phaseId: session.phase_id,
    currentPhase: session.phase,
    phaseEndsAt: session.phase_ends_at ? Date.parse(session.phase_ends_at) : null,
    expired,
    hostId,
  };
}

export interface CommitArgs {
  session: SessionRow;
  transition: Transition;
  expectedVersion: number;
  actionId?: string | null;
  now: number;
}

export type CommitOutcome =
  | { kind: 'ok'; session: SessionRow; state: Record<string, unknown>; version: number }
  | { kind: 'stale' }
  | { kind: 'missing' };

/**
 * One atomic apply_game_action commit: version check, secure state, public
 * projection, private views, idempotent events, scores. System messages are
 * posted after the commit so readers never see them for an aborted write.
 */
export async function commitTransition(
  client: SupabaseClient,
  args: CommitArgs,
): Promise<CommitOutcome> {
  const t = args.transition;
  const events = t.events.map((e) => ({ ...e }));
  // Exactly one event carries the action id: that is the idempotency key.
  if (args.actionId && events.length > 0 && !events[0]?.action_id) {
    events[0] = { ...(events[0] as GameEventRow), action_id: args.actionId };
  }

  const { data, error } = await client.rpc('apply_game_action', {
    p_session_id: args.session.id,
    p_expected_version: args.expectedVersion,
    p_secure_state: t.state,
    p_public_state: t.publicState,
    p_private_views: Object.entries(t.views).map(([user_id, view]) => ({ user_id, view })),
    p_events: events,
    p_scores: t.scores,
    p_phase: t.phase,
    p_phase_id: t.phaseId,
    p_phase_started_at: new Date(args.now).toISOString(),
    p_phase_ends_at: t.phaseEndsAt === null ? null : new Date(t.phaseEndsAt).toISOString(),
    p_round_index: t.roundIndex,
    p_status: t.status,
  });

  if (error) {
    const message = error.message ?? '';
    if (message.includes('STALE_STATE')) return { kind: 'stale' };
    if (message.includes('SESSION_NOT_FOUND')) return { kind: 'missing' };
    console.error('apply_game_action failed', message);
    throw new Error(`apply_game_action failed: ${message}`);
  }

  for (const body of t.systemMessages) {
    await postSystemMessage(client, {
      roomId: args.session.room_id,
      sessionId: args.session.id,
      body,
    });
  }

  const { data: row } = await client
    .from('game_sessions')
    .select('*')
    .eq('id', args.session.id)
    .maybeSingle();
  if (!row) return { kind: 'missing' };

  return {
    kind: 'ok',
    session: row as SessionRow,
    state: t.state,
    version: typeof data === 'number' ? data : args.expectedVersion + 1,
  };
}

export type TickOutcome =
  | { status: 'none'; game: LoadedGame }
  | { status: 'advanced'; game: LoadedGame }
  | { status: 'stale' }
  | { status: 'error'; message: string };

/**
 * Runs the engine's expiry tick when the current phase deadline has passed.
 * 'stale' means another writer committed first — callers should reload.
 */
export async function runDueTick(
  client: SupabaseClient,
  game: LoadedGame,
  players: PlayerInfo[],
  now: number,
): Promise<TickOutcome> {
  const { session, state, hostId } = game;
  if (session.status !== 'active') return { status: 'none', game };
  const ends = session.phase_ends_at ? Date.parse(session.phase_ends_at) : null;
  if (ends === null || ends > now) return { status: 'none', game };

  let transition: Transition | null;
  try {
    const engine = getEngine(session.game_id);
    transition = engine.tick(state, buildStepCtx(session, players, hostId, now, true));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('engine tick failed', session.id, session.phase, message);
    return { status: 'error', message };
  }
  if (!transition) return { status: 'none', game };

  const outcome = await commitTransition(client, {
    session,
    transition,
    expectedVersion: session.version,
    now,
  });
  if (outcome.kind === 'stale') return { status: 'stale' };
  if (outcome.kind === 'missing') return { status: 'error', message: 'session disappeared' };
  return {
    status: 'advanced',
    game: { session: outcome.session, state: outcome.state, hostId },
  };
}

/** True when game_events already contains this action id (idempotent replay). */
export async function actionWasApplied(
  client: SupabaseClient,
  sessionId: string,
  actionId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('game_events')
    .select('id')
    .eq('session_id', sessionId)
    .eq('action_id', actionId)
    .maybeSingle();
  if (error) throw new Error(`idempotency check failed: ${error.message}`);
  return data !== null;
}

/**
 * A finished game returns its room to the lobby so the host can start a new
 * one; players are routed to the results screen by the client.
 */
export async function syncFinishedRoom(
  client: SupabaseClient,
  roomId: string,
  now: number,
): Promise<void> {
  const { error } = await client
    .from('rooms')
    .update({ status: 'lobby', last_activity_at: new Date(now).toISOString() })
    .eq('id', roomId)
    .eq('status', 'in_game');
  if (error) console.error('room reset after finish failed', error.message);
}
