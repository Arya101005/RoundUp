/**
 * Charades scoring constants (Section 10.4): team points on a correct guess
 * scale with the remaining time; each skip subtracts from the eventual score.
 */
export const charadesScoring = {
  base: 50,
  /** points = base + round(100 * remainingRatio) - skipPenalty * skips. */
  timeWeight: 100,
  skipPenalty: 20,
  floor: 0,
} as const;

export const charadesDurations = {
  turnReveal: 6,
  roundResults: 10,
} as const;
