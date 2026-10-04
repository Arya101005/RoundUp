/**
 * Imposter scoring constants (Section 10.1). Tunable in one place so unit
 * tests can assert against the exported object instead of magic numbers.
 */
export const imposterScoring = {
  /** Crew member who voted for the imposter. */
  correctVote: 100,
  /** Extra per correct voter when the imposter is caught. */
  correctVoteCaughtBonus: 50,
  /** Imposter earns nothing when caught without a correct guess. */
  caughtImposter: 0,
  /** Imposter who is caught but guesses the secret. */
  guessSuccess: 150,
  /** Imposter who survives the vote. */
  survives: 200,
} as const;

/** Fixed phase durations in seconds (spec: ROLE_REVEAL 8 s etc.). */
export const imposterDurations = {
  roleReveal: 8,
  voteReveal: 8,
  roundResults: 10,
} as const;
