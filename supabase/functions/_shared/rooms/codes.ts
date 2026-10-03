/** Room code generation: 5 chars, ambiguous characters excluded. */
export const CODE_LENGTH = 5;
/** No 0/O/1/I/L so codes are readable aloud. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = Math.floor(random() * CODE_ALPHABET.length);
    out += CODE_ALPHABET[idx % CODE_ALPHABET.length] ?? '';
  }
  return out;
}

export function isValidCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) {
    if (!CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

/** Uppercases, strips disallowed characters, and trims to code length. */
export function normalizeCodeInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}
