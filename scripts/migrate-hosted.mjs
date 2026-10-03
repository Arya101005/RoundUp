/**
 * Applies migrations to a hosted Supabase project over the IPv4 pooler.
 * Needed because `db.REF.supabase.co` is IPv6-only and this machine has no
 * IPv6 route. Finds the session-mode pooler host by trying known regions.
 *
 *   SUPABASE_DB_PASSWORD=... node scripts/migrate-hosted.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';

const REF = 'jqdwldqexpjsprwmzqdm';
const USER = `postgres.${REF}`;
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
if (!PASSWORD) {
  console.error('SUPABASE_DB_PASSWORD is required');
  process.exit(1);
}

const REGIONS = [
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-southeast-3',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'eu-north-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ca-central-1',
  'sa-east-1',
  'af-south-1',
  'me-south-1',
  'il-central-1',
];

async function probe(host) {
  const client = new pg.Client({
    host,
    port: 5432,
    user: USER,
    password: PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000,
    application_name: 'roundup-migrate',
  });
  try {
    await client.connect();
    const { rows } = await client.query('select current_database()');
    return { ok: true, client, info: rows[0] };
  } catch (err) {
    await client.end().catch(() => {});
    return { ok: false, error: err.message };
  }
}

let chosen = null;
for (const region of REGIONS) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const result = await probe(host);
  if (result.ok) {
    chosen = { host, client: result.client };
    console.log(`pooler: ${host} (connected)`);
    break;
  }
  const notThisProject = /tenant|project|auth|password|hba|does not exist/i.test(result.error);
  console.log(`  ${host}: ${result.error.split('\n')[0]}${notThisProject ? '' : ''}`);
}

if (!chosen) {
  console.error('No reachable pooler host found. Set POOLER_HOST manually.');
  if (process.env.POOLER_HOST) {
    const result = await probe(process.env.POOLER_HOST);
    if (result.ok) chosen = { host: process.env.POOLER_HOST, client: result.client };
  }
  if (!chosen) process.exit(1);
}

const client = chosen.client;
const dir = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

await client.query(`create schema if not exists app_migrations;
  create table if not exists app_migrations.applied (
    filename text primary key, applied_at timestamptz not null default now())`);

const { rows } = await client.query('select filename from app_migrations.applied');
const done = new Set(rows.map((r) => r.filename));

let applied = 0;
let failed = 0;
for (const file of files) {
  if (done.has(file)) {
    console.log(`skip   ${file}`);
    continue;
  }
  const sql = readFileSync(new URL(file, dir), 'utf8');
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query(`insert into app_migrations.applied (filename) values ('${file}')`);
    await client.query('commit');
    console.log(`apply  ${file}`);
    applied++;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.error(`FAILED ${file}: ${err.message}`);
    failed++;
    break;
  }
}

console.log(`done via ${chosen.host}: ${applied} applied, ${failed} failed, ${files.length - applied - failed} already present`);
await client.end();
process.exit(failed ? 1 : 0);
