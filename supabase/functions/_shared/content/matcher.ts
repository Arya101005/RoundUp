/**
 * AnswerMatcher (Section 10): deterministic exact / alias / fuzzy matching for
 * free-text guesses. No embeddings decide acceptance; fuzzy distance is bounded
 * by word length and a one-step "near miss" band powers Close hints.
 */

export type MatchConfidence = 'exact' | 'alias' | 'fuzzy' | 'near' | 'none';

export interface MatchResult {
  match: boolean;
  confidence: MatchConfidence;
  distance: number;
}

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Crude suffix stemmer: strips plural, -ing and -ed endings. */
export function stem(value: string): string {
  let s = normalizeAnswer(value);
  if (s.endsWith('ies') && s.length > 4) s = `${s.slice(0, -3)}y`;
  else if (s.endsWith('es') && s.length > 4) s = s.slice(0, -2);
  else if (s.endsWith('s') && !s.endsWith('ss') && s.length > 3) s = s.slice(0, -1);
  if (s.endsWith('ing') && s.length > 5) s = s.slice(0, -3);
  else if (s.endsWith('ed') && s.length > 4) s = s.slice(0, -2);
  return s;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[n] ?? 0;
}

/** Fuzzy acceptance threshold by normalized guess length. */
export function fuzzyThreshold(length: number): number {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  return 2;
}

/**
 * Compares a guess against a target (and optional aliases).
 * `match` is true for exact, alias and bounded-fuzzy hits; a one-step-over
 * distance reports `confidence: 'near'` with `match: false` so the UI can show
 * a Close hint without accepting the guess.
 */
export function matchAnswer(
  guess: string,
  target: string,
  aliases: readonly string[] = [],
): MatchResult {
  const g = normalizeAnswer(guess);
  const t = normalizeAnswer(target);
  if (!g) return { match: false, confidence: 'none', distance: Number.MAX_SAFE_INTEGER };
  if (!t) return { match: false, confidence: 'none', distance: Number.MAX_SAFE_INTEGER };
  if (g === t) return { match: true, confidence: 'exact', distance: 0 };

  const aliasList = aliases.map(normalizeAnswer).filter(Boolean);
  if (aliasList.includes(g)) return { match: true, confidence: 'alias', distance: 0 };

  if (stem(g) === stem(t) && stem(g).length >= 3) {
    return { match: true, confidence: 'alias', distance: 1 };
  }
  if (aliasList.some((a) => stem(a) === stem(g) && stem(a).length >= 3)) {
    return { match: true, confidence: 'alias', distance: 1 };
  }

  const distance = levenshtein(g, t);
  const threshold = fuzzyThreshold(Math.max(g.length, t.length));
  if (distance <= threshold) {
    return { match: true, confidence: 'fuzzy', distance };
  }
  if (distance === threshold + 1) {
    return { match: false, confidence: 'near', distance };
  }
  return { match: false, confidence: 'none', distance };
}
