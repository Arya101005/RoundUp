/**
 * Applies supabase/migrations/*.sql to a Postgres database in order.
 * Used for hosted Supabase projects where `supabase db push` is not available:
 *   DB_URL=postgresql://postgres:PASSWORD@db.REF.supabase.co:5432/postgres node scripts/migrate.mjs
 * Each file runs in one transaction; applied files are recorded in app_migrations.
 */
import { readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DB_URL;
if (!url) {
  console.error('DB_URL is required');
  process.exit(1);
}

const dir = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(`
    create schema if not exists app_migrations;
    create table if not exists app_migrations.applied (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  // One migration at a time, serialized across sessions.
  await client.query('select pg_advisory_lock(727270)');

  const { rows } = await client.query('select filename from app_migrations.applied');
  const done = new Set(rows.map((r) => r.filename));

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const sql = readFileSync(new URL(file, dir), 'utf8');
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into app_migrations.applied (filename) values ($1)', [file]);
      await client.query('commit');
      console.log(`apply  ${file}`);
      applied++;
    } catch (err) {
      await client.query('rollback').catch(() => {});
      console.error(`FAILED ${file}:`);
      console.error(' ', err.message);
      process.exitCode = 1;
      break;
    }
  }
  console.log(`done: ${applied} applied, ${files.length - applied} skipped/failed`);
} finally {
  await client.query('select pg_advisory_unlock(727270)').catch(() => {});
  await client.end().catch(() => {});
}
