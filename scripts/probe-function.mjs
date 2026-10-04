/** Direct probe of a deployed Edge Function with hard timeouts.
 *  node scripts/probe-function.mjs [functionName]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import ws from 'ws';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const fnName = process.argv[2] ?? 'create-room';
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

console.log('signing in...');
const { data, error } = await sb.auth.signInAnonymously();
if (error) {
  console.error('signin failed:', error.message);
  process.exit(1);
}
console.log('signed in, calling', fnName);

const body =
  fnName === 'create-room'
    ? { displayName: 'ProbeUser', gameId: 'imposter', theme: 'movies', difficulty: 'medium', rounds: 3, config: {} }
    : { roomCode: 'XXXXX' };

const ctl = new AbortController();
const timer = setTimeout(() => ctl.abort(), 20_000);
const started = Date.now();
try {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
    signal: ctl.signal,
  });
  const text = await res.text();
  console.log(`status=${res.status} in ${Date.now() - started}ms`);
  console.log(text.slice(0, 500));
} catch (err) {
  console.log(`FAILED after ${Date.now() - started}ms:`, err.name, err.message);
}
clearTimeout(timer);
process.exit(0);
