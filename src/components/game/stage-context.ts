/**
 * Non-component stage helpers: safe readers over the untyped engine
 * `publicState` / `myView`, the stage context contract, and friendly phase
 * labels. Kept apart from the components so React Fast Refresh stays happy.
 */
import type { RoomPlayer, SessionSummary } from '@/types/domain';
import type { GameId } from '@shared/games/types';

/* ---- safe readers -------------------------------------------------------- */

export const asString = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;
export const asNullableString = (v: unknown): string | null =>
  typeof v === 'string' ? v : null;
export const asNumber = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
export const asBoolean = (v: unknown, fallback = false): boolean =>
  typeof v === 'boolean' ? v : fallback;
export const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const asStringArray = (v: unknown): string[] =>
  asArray(v).filter((x): x is string => typeof x === 'string');

/** userId -> display name for the active roster. */
export function nameMap(players: RoomPlayer[]): Record<string, string> {
  return Object.fromEntries(players.map((p) => [p.userId, p.displayName]));
}

/* ---- stage contract ------------------------------------------------------ */

export interface StageContext {
  gameId: GameId;
  session: SessionSummary;
  /** session.publicState */
  pub: Record<string, unknown>;
  /** snapshot.myView — this player's private slice for the current phase */
  view: Record<string, unknown>;
  players: RoomPlayer[];
  meId: string | null;
  hostId: string;
  themeLabel: string;
  /** Sends a game action. Resolves false (and sets the context error) on failure. */
  act: (type: string, payload?: Record<string, unknown>) => Promise<boolean>;
  /** Action type currently in flight, for per-button spinners. */
  pending: string | null;
  actionError: string | null;
  onDismissError: () => void;
  onOpenResults: () => void;
  /** True once the session reached the finished state. */
  finished: boolean;
}

/* ---- friendly phase labels ----------------------------------------------- */

export const phaseLabels: Record<GameId, Record<string, string>> = {
  imposter: {
    role_reveal: 'Roles dealt',
    discussion: 'Discussion',
    voting: 'Voting',
    vote_reveal: 'Vote result',
    imposter_guess: "Imposter's guess",
    round_results: 'Round results',
  },
  heads_up: {
    turn: 'On air',
    round_results: 'Round results',
  },
  password: {
    clue: 'Clue',
    guess: 'Guessing',
    round_results: 'Round results',
  },
  charades: {
    perform: 'Performance',
    turn_reveal: 'Reveal',
    round_results: 'Round results',
  },
  blind_ranking: {
    round_intro: 'Criterion',
    placing: 'Placing',
    reveal: 'Reveal',
    round_results: 'Round results',
  },
  auction: {
    item_intro: 'Next lot',
    bidding: 'Bidding open',
    reveal: 'Values revealed',
    round_results: 'Round results',
  },
};

export function phaseLabel(gameId: GameId, phase: string): string {
  return (
    phaseLabels[gameId]?.[phase] ??
    phase.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  );
}