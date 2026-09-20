// Loads db/seed/inventario_2026_09.json into the items table.
// Usage: node db/import-inventory.mjs
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

const items = JSON.parse(
  readFileSync(join(__dirname, 'seed', 'inventario_2026_09.json'), 'utf-8')
);

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
  const { rows: existing } = await client.query('select count(*)::int as n from items');
  if (existing[0].n > 0) {
    console.log(`items table already has ${existing[0].n} rows — skipping import to avoid duplicates.`);
    console.log('Delete existing rows first if you want to re-import from scratch.');
    process.exit(0);
  }

  let inserted = 0;
  for (const it of items) {
    await client.query(
      `insert into items
        (name, description, area, location, type, serial_number, quantity,
         years_in_use, condition_pct, condition_notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        it.name,
        it.description,
        it.area,
        it.location,
        it.type,
        it.serial_number,
        it.quantity,
        it.years_in_use,
        it.condition_pct,
        it.condition_notes,
      ]
    );
    inserted++;
  }
  console.log(`Inserted ${inserted} items.`);
} finally {
  await client.end();
}
