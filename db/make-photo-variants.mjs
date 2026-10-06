// One-time (and re-runnable) job: makes the small copies of photos that
// don't have them yet — a ~1280px "md" and a ~320px "thumb" for each row of
// item_photos — uploads them next to the original, and records their URLs
// (item_photos.md_url / thumb_url, migration 0044). Originals are never
// touched or deleted. New uploads already make their own copies in the
// browser (lib/photos.ts); this is for the ones that existed before.
//
// Usage:  node db/make-photo-variants.mjs --dry-run     what it would do
//         node db/make-photo-variants.mjs               do it (all)
//         node db/make-photo-variants.mjs --limit 5     try a few first
//
// Heads up: it downloads each original once (~1.7 MB each), which counts
// toward Supabase egress — run it once service is available, not repeatedly.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import sharp from "sharp";

const BUCKET = "item-photos";
const CACHE = "max-age=31536000";

export async function makeVariants(buffer) {
  const base = sharp(buffer, { failOn: "none" }).rotate(); // honor EXIF orientation
  const resize = (side) => base.clone().resize({ width: side, height: side, fit: "inside", withoutEnlargement: true });
  const [md, thumb] = await Promise.all([
    resize(1280).jpeg({ quality: 80, mozjpeg: true }).toBuffer(),
    resize(320).jpeg({ quality: 75, mozjpeg: true }).toBuffer(),
  ]);
  return { md, thumb };
}

function loadEnv() {
  const dir = dirname(fileURLToPath(import.meta.url));
  for (const line of readFileSync(join(dir, "..", ".env.local"), "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    if (!(key in process.env)) process.env[key] = t.slice(eq + 1).trim();
  }
}

const mb = (n) => (Number(n) / 1048576).toFixed(1) + " MB";

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitAt = args.indexOf("--limit");
  const limit = limitAt === -1 ? Infinity : Number(args[limitAt + 1]);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // A pool, because the three workers run queries at the same time.
  const client = new pg.Pool({
    max: 4,
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false },
  });
  try {
    const { rows } = await client.query(
      `select p.id, p.item_id, p.url, p.thumb_url, p.md_url,
              (select (o.metadata->>'size')::bigint from storage.objects o
                where o.bucket_id = $1 and o.name = substring(p.url from $2)) as size
         from item_photos p
        where p.thumb_url is null or p.md_url is null
        order by p.created_at`,
      [BUCKET, `${BUCKET}/(.*)$`],
    );
    const todo = rows.slice(0, limit);
    const bytes = todo.reduce((s, r) => s + Number(r.size ?? 0), 0);
    console.log(`${rows.length} photos still need small copies; processing ${todo.length} (originals: ${mb(bytes)} to download).`);
    if (dryRun || todo.length === 0) return;
    if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in .env.local");

    const upload = async (path, body) => {
      const res = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": CACHE },
        body,
      });
      if (!res.ok) throw new Error(`upload ${path}: ${res.status} ${await res.text()}`);
      return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
    };

    let done = 0;
    let failed = 0;
    let before = 0;
    let after = 0;
    const queue = [...todo];
    async function worker() {
      for (let row = queue.shift(); row; row = queue.shift()) {
        try {
          const res = await fetch(row.url);
          if (!res.ok) throw new Error(`download ${res.status}`);
          const original = Buffer.from(await res.arrayBuffer());
          const { md, thumb } = await makeVariants(original);
          const file = row.url.split(`/${BUCKET}/`)[1].split("/").pop().replace(/\.[^.]+$/, "");
          const mdUrl = await upload(`${row.item_id}/md/${file}.jpg`, md);
          const thumbUrl = await upload(`${row.item_id}/thumb/${file}.jpg`, thumb);
          await client.query("update item_photos set md_url = $1, thumb_url = $2 where id = $3", [mdUrl, thumbUrl, row.id]);
          before += original.length;
          after += md.length + thumb.length;
          done++;
          if (done % 25 === 0) console.log(`  ${done}/${todo.length}`);
        } catch (err) {
          failed++;
          console.error(`  skipped ${row.id}: ${err.message}`);
        }
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    console.log(`Done: ${done} converted, ${failed} skipped. Originals ${mb(before)} -> small copies ${mb(after)}. Re-run to retry skipped ones.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
