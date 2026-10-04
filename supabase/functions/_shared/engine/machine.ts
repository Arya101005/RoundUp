/**
 * State machine helper (Section 7): explicit transition tables per engine.
 * `transition()` is the only way phases change — it mints a fresh phase_id so
 * game-tick calls for the old phase become no-ops.
 */
import { randomUUID } from '../std/uuid.ts';

export class IllegalTransition extends Error {
  constructor(from: string, to: string) {
    super(`illegal phase transition ${from} -> ${to}`);
    this.name = 'IllegalTransition';
  }
}

export interface PhaseDeadline {
  phase: string;
  phaseId: string;
  phaseEndsAt: number | null;
}

/**
 * Moves to `to`, minting a new phase id. `seconds` sets the deadline from
 * `now`; null means "wait for a player action" (no timer).
 */
export function transition(
  from: string,
  table: Record<string, readonly string[]>,
  to: string,
  now: number,
  seconds: number | null,
): PhaseDeadline {
  const allowed = table[from];
  if (!allowed || !allowed.includes(to)) throw new IllegalTransition(from, to);
  return {
    phase: to,
    phaseId: randomUUID(),
    phaseEndsAt: seconds === null ? null : now + seconds * 1000,
  };
}

/** Picks the next round-robin index that skips ids not in `eligible`. */
export function nextIndex(
  order: readonly string[],
  from: number,
  eligible: ReadonlySet<string>,
): number {
  if (order.length === 0) return 0;
  for (let step = 1; step <= order.length; step++) {
    const idx = (from + step) % order.length;
    if (eligible.has(order[idx] ?? '')) return idx;
  }
  return from;
}
