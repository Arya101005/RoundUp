/**
 * Verifies the RoundUp schema on a hosted Supabase project.
 *   SUPABASE_DB_PASSWORD=... node scripts/verify-db.mjs
 * (Pooler host is fixed after discovery; override with POOLER_HOST.)
 */
import pg from 'pg';

const host = process.env.POOLER_HOST ?? 'aws-0-ap-southeast-2.pooler.supabase.com';
const client = new pg.Client({
  host,
  port: 5432,
  user: 'postgres.jqdwldqexpjsprwmzqdm',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
});

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -- ${detail}` : ''}`);
  if (!ok) failures++;
};

await client.connect();

const expectedTables = [
  'profiles', 'rooms', 'room_players', 'game_sessions', 'game_state_secure',
  'player_views', 'rounds', 'teams', 'team_members', 'scores', 'game_events',
  'chat_messages', 'generated_content', 'session_content_usage', 'ai_evaluations',
  'ranking_sessions', 'ranking_entries', 'auction_sessions', 'auction_items',
  'auction_bids', 'rate_limits',
];

const { rows: tables } = await client.query(
  `select relname, relrowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and relkind = 'r'`,
);
const tableSet = new Set(tables.map((t) => t.relname));
const missing = expectedTables.filter((t) => !tableSet.has(t));
check('all 21 tables exist', missing.length === 0, missing.join(','));

const noRls = tables.filter((t) => expectedTables.includes(t.relname) && !t.relrowsecurity).map((t) => t.relname);
check('RLS enabled on every app table', noRls.length === 0, noRls.join(','));

const { rows: fns } = await client.query(
  `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'`,
);
const fnSet = new Set(fns.map((f) => f.proname));
const expectedFns = [
  'is_room_member', 'is_session_member', 'is_room_code_member', 'my_team_id',
  'touch_presence', 'apply_game_action', 'check_rate_limit', 'sweeper_round',
  'retention_sweep', 'set_updated_at', 'handle_new_user',
];
const missingFns = expectedFns.filter((f) => !fnSet.has(f));
check('helper functions exist', missingFns.length === 0, missingFns.join(','));

const { rows: pub } = await client.query(
  `select p.pubname, c.relname from pg_publication p
   join pg_publication_tables pt on pt.pubname = p.pubname
   join pg_class c on c.relname = pt.schemaname || '.' || pt.relname or false
   where p.pubname = 'supabase_realtime'`,
).catch(() => ({ rows: [] }));
const { rows: pubTables } = await client.query(
  `select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime'`,
);
const realtimeWanted = ['rooms', 'room_players', 'game_sessions', 'player_views', 'chat_messages', 'scores'];
const missingPub = realtimeWanted.filter((t) => !pubTables.some((r) => r.tablename === t));
check('realtime publication includes watched tables', missingPub.length === 0, missingPub.join(','));
void pub;

const { rows: exts } = await client.query(`select extname from pg_extension`);
const extSet = new Set(exts.map((e) => e.extname));
check('extensions: pgcrypto, pg_trgm, vector', ['pgcrypto', 'pg_trgm', 'vector'].every((e) => extSet.has(e)),
  [...extSet].join(','));
check('extensions: pg_cron, pg_net (sweeper deps)', ['pg_cron', 'pg_net'].every((e) => extSet.has(e)));

const { rows: jobs } = await client.query(
  `select jobname from cron.job where jobname in ('roundup-sweeper', 'roundup-retention')`,
).catch(() => ({ rows: [] }));
check('pg_cron jobs scheduled', jobs.length === 2, jobs.map((j) => j.jobname).join(','));

const { rows: policies } = await client.query(
  `select tablename, count(*)::int as n from pg_policies where schemaname='public' group by tablename`,
);
check('RLS policies present on member-readable tables',
  ['rooms', 'room_players', 'game_sessions', 'player_views', 'chat_messages', 'scores', 'game_events']
    .every((t) => policies.some((p) => p.tablename === t)),
  policies.map((p) => `${p.tablename}:${p.n}`).join(' '));

const { rows: unsafe } = await client.query(
  `select tablename from pg_tables t join pg_class c on c.relname = t.tablename
   join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
   where t.schemaname='public' and not c.relrowsecurity`,
);
check('no app table without RLS', unsafe.length === 0, unsafe.map((u) => u.tablename).join(','));

await client.end();
console.log(failures === 0 ? 'DB_VERIFICATION_OK' : `DB_VERIFICATION_FAILED (${failures})`);
process.exit(failures ? 1 : 0);
