/** Input sanitization shared by functions and the frontend. */

export const NAME_MIN = 2;
export const NAME_MAX = 20;
export const CHAT_MAX = 280;
export const STATEMENT_MAX = 80;

export interface NameCheck {
  ok: boolean;
  value: string;
  reason?: 'empty' | 'length' | 'characters';
}

/** Display names: 2-20 chars, letters/numbers/space/basic punctuation, no HTML, trimmed. */
export function sanitizeDisplayName(raw: string): NameCheck {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return { ok: false, value: '', reason: 'empty' };
  if (collapsed.length < NAME_MIN || collapsed.length > NAME_MAX) {
    return { ok: false, value: collapsed, reason: 'length' };
  }
  // Letters (any script), combining marks (needed for Indic scripts), digits,
  // spaces, and a small punctuation set.
  const allowed = /^[\p{L}\p{M}\p{N} ._'&()+\-!?]+$/u;
  if (!allowed.test(collapsed)) return { ok: false, value: collapsed, reason: 'characters' };
  // Reject anything that looks like markup.
  if (/[<>]/.test(collapsed)) return { ok: false, value: collapsed, reason: 'characters' };
  return { ok: true, value: collapsed };
}

/** Removes C0/C1 control characters without regex literal control classes. */
function stripControlChars(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) continue;
    out += ch;
  }
  return out;
}

export interface ChatCheck {
  ok: boolean;
  value: string;
  reason?: 'empty' | 'length';
}

/** Chat body: trimmed, whitespace collapsed, control chars stripped, 1-280 chars. */
export function sanitizeChatBody(raw: string): ChatCheck {
  const cleaned = stripControlChars(raw)
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length === 0) return { ok: false, value: '', reason: 'empty' };
  if (cleaned.length > CHAT_MAX) return { ok: false, value: cleaned.slice(0, CHAT_MAX), reason: 'length' };
  return { ok: true, value: cleaned };
}

/** Room codes: always uppercase, exactly 5 characters from the safe alphabet. */
export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}
