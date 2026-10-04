/**
 * Small pure helpers shared by every engine (Section 7). No clock, no network,
 * no unseeded randomness: rng is always passed in.
 */
import type { GameEventRow, ScoreRow, Transition } from './types.ts';

/** Fisher-Yates using the provided rng. Returns a new array. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = arr[i] as T;
    const b = arr[j] as T;
    arr[i] = b;
    arr[j] = a;
  }
  return arr;
}

export function pick<T>(items: readonly T[], rng: () => number): T {
  if (items.length === 0) throw new Error('pick() from empty list');
  return items[Math.floor(rng() * items.length)] as T;
}

export interface TransitionInput {
  state: Record<string, unknown>;
  publicState: Record<string, unknown>;
  phase: string;
  phaseId: string;
  phaseEndsAt: number | null;
  roundIndex: number;
  views?: Record<string, Record<string, unknown>>;
  events?: GameEventRow[];
  systemMessages?: string[];
  scores?: ScoreRow[];
  status?: 'active' | 'finished';
}

/** Fills the optional Transition fields with safe defaults. */
export function tr(input: TransitionInput): Transition {
  return {
    state: input.state,
    publicState: input.publicState,
    views: input.views ?? {},
    events: input.events ?? [],
    systemMessages: input.systemMessages ?? [],
    scores: input.scores ?? [],
    phase: input.phase,
    phaseId: input.phaseId,
    phaseEndsAt: input.phaseEndsAt,
    roundIndex: input.roundIndex,
    status: input.status ?? 'active',
  };
}

/** Merges per-round point deltas into the running public totals. */
export function addTotals(
  prev: Record<string, number>,
  deltas: Record<string, number>,
): Record<string, number> {
  const next: Record<string, number> = { ...prev };
  for (const [userId, delta] of Object.entries(deltas)) {
    next[userId] = (next[userId] ?? 0) + delta;
  }
  return next;
}

/** A single event row, keeping call sites short. */
export function ev(
  type: string,
  extra?: { actorId?: string | null; actionId?: string | null; payload?: Record<string, unknown> },
): GameEventRow {
  return {
    type,
    actor_id: extra?.actorId ?? null,
    action_id: extra?.actionId ?? null,
    payload: extra?.payload ?? {},
  };
}

export function failResult(
  code: string,
  details?: Record<string, string | number>,
): { ok: false; code: string; details?: Record<string, string | number> } {
  return details ? { ok: false, code, details } : { ok: false, code };
}

/** Case/whitespace-insensitive comparison for word guesses. */
export function sameWord(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return norm(a) === norm(b);
}
