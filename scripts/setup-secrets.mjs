/**
 * Creates the Vault secrets the sweeper cron needs (idempotent).
 *   SUPABASE_DB_PASSWORD=... node scripts/setup-secrets.mjs
 */
import pg from 'pg';

const client = new pg.Client({
  host: process.env.POOLER_HOST ?? 'aws-0-ap-southeast-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.jqdwldqexpjsprwmzqdm',
  password: process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
});

await client.connect();

const { rows: ext } = await client.query(
  `select extname from pg_extension where extname in ('vault', 'supabase_vault')`,
);
if (ext.length === 0) {
  console.error('vault extension missing');
  process.exit(1);
}

const { rows: secrets } = await client.query(
  `select name from vault.decrypted_secrets where name in ('cron_secret', 'app_url')`,
);
const have = new Set(secrets.map((s) => s.name));

if (!have.has('cron_secret')) {
  await client.query(
    `select vault.create_secret(gen_random_uuid()::text, 'cron_secret', 'Bearer token for pg_cron -> Edge Functions')`,
  );
  console.log('created cron_secret');
} else {
  console.log('cron_secret already present');
}

if (!have.has('app_url')) {
  await client.query(
    `select vault.create_secret('https://jqdwldqexpjsprwmzqdm.supabase.co', 'app_url', 'Base URL for cron HTTP calls')`,
  );
  console.log('created app_url');
} else {
  console.log('app_url already present');
}

const { rows: check } = await client.query(
  `select name from vault.decrypted_secrets where name in ('cron_secret', 'app_url') order by name`,
);
console.log('secrets:', check.map((s) => s.name).join(', '));
if (check.length !== 2) {
  console.error('expected both secrets to exist');
  process.exit(1);
}

// Look for how anonymous sign-in is stored, to see if it can be enabled here.
const { rows: authTables } = await client.query(
  `select table_name from information_schema.tables where table_schema = 'auth' order by 1`,
);
console.log('auth tables:', authTables.map((t) => t.table_name).join(', '));

await client.end();
console.log('SECRETS_OK');
