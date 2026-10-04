/**
 * Engine framework types (Section 7). Pure TypeScript: imported by Edge
 * Functions (Deno), Vitest (Node), and the frontend (types only via @shared).
 */
import type { GameId } from '../games/types.ts';

/** A seated player as the engine sees them. `connected` reflects presence (45 s). */
export interface PlayerInfo {
  id: string;
  name: string;
  connected: boolean;
  teamId: string | null;
  /** Lobby ready flag (start-game validates the non-host ready gate). */
  ready?: boolean;
}

/** Write-back rows produced by a transition, shaped for apply_game_action(). */
export interface GameEventRow {
  type: string;
  actor_id?: string | null;
  action_id?: string | null;
  payload?: Record<string, unknown>;
}

export interface ScoreRow {
  round_index: number;
  user_id?: string | null;
  team_id?: string | null;
  points: number;
  breakdown?: Record<string, unknown>;
}

/** The full result of any state change: one atomic apply_game_action commit. */
export interface Transition {
  state: Record<string, unknown>;
  publicState: Record<string, unknown>;
  /** userId -> private view. Must include every player whose view changed. */
  views: Record<string, Record<string, unknown>>;
  events: GameEventRow[];
  /** System chat lines ("Round 2 started."), posted after the commit. */
  systemMessages: string[];
  scores: ScoreRow[];
  phase: string;
  /** Same id when the phase did not change; new uuid when it did. */
  phaseId: string;
  phaseEndsAt: number | null;
  roundIndex: number;
  status: 'active' | 'finished';
}

export interface ActionInput {
  type: string;
  payload: Record<string, unknown>;
  actionId: string;
}

export type ActionResult =
  | { ok: true; transition: Transition }
  | { ok: false; code: string; details?: Record<string, string | number> };

export interface InitCtx {
  players: PlayerInfo[];
  config: Record<string, unknown>;
  theme: string;
  themeLabel: string;
  difficulty: string;
  totalRounds: number;
  now: number;
  /** Room host: the only player allowed to end phases early. */
  hostId: string;
  /** Team key -> team uuid for team games; null for free-for-all games. */
  teamIds: { a: string; b: string } | null;
}

export interface StepCtx {
  now: number;
  players: PlayerInfo[];
  /** phaseId of the session row this step was computed against. */
  phaseId: string;
  currentPhase: string;
  /** Deadline of the current phase (ms epoch) — keep it for same-phase updates. */
  phaseEndsAt: number | null;
  /** True when called from the sweeper/tick with an expired phase deadline. */
  expired: boolean;
  hostId: string;
}

export interface EngineInit {
  state: Record<string, unknown>;
  publicState: Record<string, unknown>;
  views: Record<string, Record<string, unknown>>;
  phase: string;
  phaseEndsAt: number | null;
  /** Logged once at start (action_id null): ROUND_STARTED and friends. */
  events?: GameEventRow[];
  systemMessages?: string[];
}

/**
 * A game engine. Pure functions only: no network, no clock reads (use ctx),
 * no Math.random (use the provided rng in initialize).
 */
export interface GameEngine {
  id: GameId;
  /** First phase entered at start-game. */
  initialPhase: string;
  initialize(ctx: InitCtx & { rng: () => number }): EngineInit;
  handleAction(
    state: Record<string, unknown>,
    action: ActionInput,
    actor: PlayerInfo | null,
    ctx: StepCtx,
  ): ActionResult;
  /** Timer expiry: advance the phase. Returns null when nothing is due. */
  tick(state: Record<string, unknown>, ctx: StepCtx): Transition | null;
  isFinished(state: Record<string, unknown>): boolean;
  /**
   * Chat gate for send-chat: engines with per-phase chat rules (Imposter
   * turn-based statements, Heads Up questions, Password/Charades turn locks)
   * return the kind to store or a stable error code. Omitted = always allowed.
   */
  validateChat?(
    state: Record<string, unknown>,
    actor: PlayerInfo | null,
    ctx: StepCtx,
    body: string,
  ): ChatCheck;
}

export type ChatCheck =
  | { ok: true; kind: 'chat' | 'question' | 'statement' }
  | { ok: false; code: string };
