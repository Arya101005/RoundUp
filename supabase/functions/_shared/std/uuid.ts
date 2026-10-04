/**
 * UUID helpers shared by engines and functions. Uses the Web Crypto API,
 * which exists in Deno (Edge Functions), Node 20 (Vercel adapter, Vitest),
 * and browsers alike.
 */
export function randomUUID(): string {
  const c = globalThis.crypto;
  if (!c || typeof c.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID is unavailable in this runtime');
  }
  return c.randomUUID();
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
