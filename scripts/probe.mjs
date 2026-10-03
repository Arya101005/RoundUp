/**
 * Connectivity probe: verifies the provided Supabase URL + publishable key
 * and that anonymous sign-in is enabled. Run: node scripts/probe.mjs
 */
import { createClient, RealtimeClient } from '@supabase/supabase-js';
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

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

const { data, error } = await supabase.auth.signInAnonymously();
if (error) {
  console.error('ANON_SIGNIN_FAILED:', error.message);
  process.exit(1);
}
console.log('ANON_SIGNIN_OK user:', data.user.id);

const { data: tables, error: tablesError } = await supabase
  .from('rooms')
  .select('id')
  .limit(1);
if (tablesError) {
  console.log('ROOMS_TABLE_QUERY (expected until migrations run):', tablesError.message);
} else {
  console.log('ROOMS_TABLE_OK rows:', tables.length);
}
