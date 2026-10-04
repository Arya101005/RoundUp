/**
 * Heads Up scoring constants (Section 10.2): time-scaled base score minus
 * wrong-guess penalties, floored at the minimum, plus finishing placement.
 */
export const headsUpScoring = {
  baseScore: 100,
  minRatio: 0.2,
  wrongPenalty: 5,
  placement: [40, 25, 10] as const,
  /** Seconds between guesses by the active player. */
  guessCooldownMs: 2_000,
} as const;

export const headsUpDurations = {
  roundResults: 12,
} as const;

/** points = max(floor, round(base * max(minRatio, remaining/turn)) - penalty*wrong) */
export function headsUpPoints(
  remainingRatio: number,
  wrongGuesses: number,
): number {
  const s = headsUpScoring;
  const floor = Math.round(s.baseScore * s.minRatio);
  const scaled = Math.round(s.baseScore * Math.max(s.minRatio, Math.min(1, remainingRatio)));
  return Math.max(floor, scaled - s.wrongPenalty * wrongGuesses);
}
