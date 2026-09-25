// Precomputes item_match_candidates for every inventory item against the
// candidate gasto_lines pool — the CLI counterpart to the browser's
// "Recalcular" button in /match-compras (both call the same
// lib/gasto-matching/score.mjs, so there's exactly one scoring
// implementation). Used for the initial precompute right after import,
// and available to re-run by hand any time the config/weights change.
//
// Recalculation never overwrites a confirmed match — items with an
// active item_purchase_matches row whose status = 'confirmado' are
// skipped entirely, candidates and all, so a confirmed pick's own
// candidate-row history stays intact.
//
// Usage: node db/recalculate-matches.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "pg";
import { rankCandidatesForItem } from "../lib/gasto-matching/score.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = join(__dirname, "..", ".env.local");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (v && !(k in process.env)) process.env[k] = v;
  }
}
loadEnvLocal();

async function main() {
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
    const { rows: items } = await client.query(
      `select id, name, description, brand, model, area, type from items`
    );
    const { rows: lines } = await client.query(
      `select uid_itemc, descripcion, locacion, area, precio_por_ud, uds, total_neto
       from gasto_lines where is_candidate`
    );
    const { rows: confirmed } = await client.query(
      `select item_id from item_purchase_matches where is_active and status = 'confirmado'`
    );
    const skip = new Set(confirmed.map((r) => r.item_id));

    // "Descartar" in the review UI — a candidate the admin has already
    // ruled out for this item, excluded from the pool before ranking
    // (not just hidden after) so the next-best real candidate takes its
    // rank instead of leaving a gap.
    const { rows: rejections } = await client.query(`select item_id, uid_itemc from item_candidate_rejections`);
    const rejectedByItem = new Map();
    for (const r of rejections) {
      if (!rejectedByItem.has(r.item_id)) rejectedByItem.set(r.item_id, new Set());
      rejectedByItem.get(r.item_id).add(r.uid_itemc);
    }

    console.log(`Scoring ${items.length} items against ${lines.length} candidate lines (${skip.size} confirmed, skipped; ${rejections.length} rejections)...`);

    const tierCounts = { fuerte: 0, ambiguo: 0, debil: 0, sin_candidato: 0 };
    let inserted = 0;

    for (const item of items) {
      if (skip.has(item.id)) continue;

      await client.query(`delete from item_match_candidates where item_id = $1`, [item.id]);

      const rejected = rejectedByItem.get(item.id);
      const pool = rejected ? lines.filter((l) => !rejected.has(l.uid_itemc)) : lines;
      const ranked = rankCandidatesForItem(item, pool, 10);
      if (ranked.length === 0) {
        tierCounts.sin_candidato++;
        continue;
      }
      tierCounts[ranked[0].tier]++;

      const tuples = [];
      const values = [];
      let p = 1;
      for (const c of ranked) {
        tuples.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        values.push(item.id, c.uid_itemc, c.score, c.tier, c.rank, JSON.stringify(c.breakdown));
      }
      await client.query(
        `insert into item_match_candidates (item_id, uid_itemc, score, tier, rank, score_breakdown)
         values ${tuples.join(",")}`,
        values
      );
      inserted += ranked.length;
    }

    console.log(`\nInserted ${inserted} candidate rows.`);
    console.log("Tier counts (best candidate per item):", tierCounts);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
