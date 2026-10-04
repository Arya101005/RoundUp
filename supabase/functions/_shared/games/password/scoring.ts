/**
 * Password scoring constants (Section 10.3): attempt points by clue number,
 * plus a time bonus of the current guess window.
 */
export const passwordScoring = {
  /** Team points by clue number (1-based), capped at the last entry. */
  attemptPoints: [100, 80, 60, 40, 20] as const,
  /** timeBonus = round(maxTimeBonus * remainingRatio) of the guess window. */
  maxTimeBonus: 30,
} as const;

export const passwordDurations = {
  roundResults: 10,
} as const;

export function attemptPointsFor(clueNumber: number): number {
  const points = passwordScoring.attemptPoints;
  const idx = Math.min(Math.max(clueNumber, 1), points.length) - 1;
  return points[idx] ?? 0;
}
