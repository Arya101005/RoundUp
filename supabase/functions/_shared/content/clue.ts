/**
 * Password clue validation (Section 10.3): deterministic, server-side, no AI.
 * All checks run against the normalized clue; reasons map to stable error codes.
 */
import { levenshtein, normalizeAnswer, stem } from './matcher.ts';

export type ClueRejection =
  | 'empty'
  | 'multi_word'
  | 'is_secret'
  | 'too_close'
  | 'duplicate'
  | 'forbidden';

export type ClueCheck = { ok: true } | { ok: false; reason: ClueRejection };

/** One token of letters; hyphens and apostrophes allowed inside. */
const CLUE_TOKEN = /^[a-z]+(?:['-][a-z]+)*$/;

/**
 * Returns a normalized clue when it passes every rule, or a rejection reason.
 * `used` is the list of clues already given for this word (normalized here).
 * `forbidden` is the item's forbidden list (e.g. same-category words).
 */
export function validateClue(
  clue: string,
  secret: string,
  used: readonly string[] = [],
  forbidden: readonly string[] = [],
): ClueCheck {
  const normalized = normalizeAnswer(clue).replace(/\s+/g, '');
  if (!normalized) return { ok: false, reason: 'empty' };
  // Spaces are rejected outright; only a single hyphen/apostrophe token passes.
  if (/\s/.test(clue.trim()) || !CLUE_TOKEN.test(normalized)) {
    return { ok: false, reason: 'multi_word' };
  }

  const s = normalizeAnswer(secret);
  if (normalized === s) return { ok: false, reason: 'is_secret' };

  if (isTooClose(normalized, s)) return { ok: false, reason: 'too_close' };

  const usedNorm = used.map((u) => normalizeAnswer(u).replace(/\s+/g, ''));
  if (usedNorm.includes(normalized)) return { ok: false, reason: 'duplicate' };

  const forbiddenNorm = forbidden.map((f) => normalizeAnswer(f));
  if (forbiddenNorm.includes(normalized)) return { ok: false, reason: 'forbidden' };

  return { ok: true };
}

/** The "too close" variation rules from the spec, all deterministic. */
export function isTooClose(clue: string, secret: string): boolean {
  if (clue === secret) return true;
  if (stem(clue) === stem(secret)) return true;

  const shorter = Math.min(clue.length, secret.length);


  // One contains the other when both are at least 4 chars.
  if (shorter >= 4 && (secret.includes(clue) || clue.includes(secret))) return true;

  // Edit distance <= 2 for words of 6+ chars.
  if (clue.length >= 6 && secret.length >= 6 && levenshtein(clue, secret) <= 2) return true;

  // Common prefix >= 5 chars covering >= 70% of the shorter word.
  if (shorter >= 5) {
    let shared = 0;
    const limit = Math.min(clue.length, secret.length);
    while (shared < limit && clue[shared] === secret[shared]) shared++;
    if (shared >= 5 && shared / shorter >= 0.7) return true;
  }
  return false;
}
