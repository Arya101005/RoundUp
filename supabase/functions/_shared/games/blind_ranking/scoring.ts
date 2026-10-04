/**
 * Blind Ranking objective scoring (Section 10.5): a weighted blend of five
 * metrics, computed server-side only. Exported separately from the engine so
 * unit tests can assert known examples directly.
 */
export const blindRankingScoring = {
  position: 0.4,
  spearman: 0.2,
  kendall: 0.25,
  exact: 0.1,
  topK: 0.05,
  maxScore: 1000,
} as const;

export interface RankingMetrics {
  position: number;
  spearman: number;
  kendall: number;
  exact: number;
  topK: number;
  score: number;
  /** item -> (player position - reference position) */
  diffs: Record<string, number>;
}

function indexOfAll(order: string[]): Map<string, number> {
  const map = new Map<string, number>();
  order.forEach((item, i) => map.set(item, i));
  return map;
}

export function rankMetrics(player: string[], reference: string[]): RankingMetrics {
  const n = Math.min(player.length, reference.length);
  if (n === 0) {
    return { position: 1, spearman: 1, kendall: 1, exact: 1, topK: 1, score: 0, diffs: {} };
  }

  const pIdx = indexOfAll(player);
  const rIdx = indexOfAll(reference);
  const diffs: Record<string, number> = {};

  let absSum = 0;
  let sqSum = 0;
  let matches = 0;
  for (const item of reference) {
    const p = pIdx.get(item) ?? 0;
    const r = rIdx.get(item) ?? 0;
    const d = p - r;
    diffs[item] = d;
    absSum += Math.abs(d);
    sqSum += d * d;
    if (p === r) matches += 1;
  }

  // Position accuracy: 1 - mean(|d|) / (N - 1)
  const position = n === 1 ? 1 : Math.max(0, 1 - absSum / n / (n - 1));

  // Spearman rho mapped to [0, 1]
  let spearman = 1;
  if (n > 1) {
    const rho = 1 - (6 * sqSum) / (n * (n * n - 1));
    spearman = (rho + 1) / 2;
  }

  // Kendall pairwise agreement
  let kendall = 1;
  if (n > 1) {
    let concordant = 0;
    let total = 0;
    for (let i = 0; i < reference.length; i++) {
      for (let j = i + 1; j < reference.length; j++) {
        const a = reference[i] as string;
        const b = reference[j] as string;
        const pa = pIdx.get(a) ?? 0;
        const pb = pIdx.get(b) ?? 0;
        total += 1;
        if (pa < pb) concordant += 1;
      }
    }
    kendall = total > 0 ? concordant / total : 1;
  }

  const exact = matches / n;

  const k = Math.min(3, n);
  const refTop = new Set(reference.slice(0, k));
  const playerTop = new Set(player.slice(0, k));
  let hit = 0;
  for (const item of refTop) if (playerTop.has(item)) hit += 1;
  const topK = hit / k;

  const w = blindRankingScoring;
  const blended =
    w.position * position +
    w.spearman * spearman +
    w.kendall * kendall +
    w.exact * exact +
    w.topK * topK;

  return {
    position,
    spearman,
    kendall,
    exact,
    topK,
    score: Math.round(w.maxScore * blended),
    diffs,
  };
}

/** Blind Ranking fixed phase durations (seconds). */
export const blindRankingDurations = {
  roundIntro: 6,
  reveal: 12,
  roundResults: 8,
} as const;
