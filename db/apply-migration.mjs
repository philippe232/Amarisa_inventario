// Runs a migration file against the DB using PG* vars from .env.local.
// Usage: node db/apply-migration.mjs db/migrations/0001_init_schema.sql
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = join(__dirname, '..', '.env.local');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (value && !(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const migrationPath = process.argv[2];
if (!migrationPath) {
  console.error('Usage: node db/apply-migration.mjs <path-to-migration.sql>');
  process.exit(1);
}

const sql = readFileSync(migrationPath, 'utf-8');

const client = new Client({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query(sql);
  console.log(`Applied ${migrationPath}`);
} finally {
  await client.end();
}
