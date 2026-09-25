// Loads data/import/gasto_{notas,lines,flujos}.json (produced by
// db/extract-gastos.py) into gasto_notas/gasto_lines/gasto_flujos.
// Re-runnable: every insert is an upsert keyed on the original AppSheet
// UID, so re-running after a fresh export just refreshes existing rows
// instead of duplicating them. Candidate-pool filtering and CFDI
// resolution use the same lib/gasto-matching/*.mjs modules the browser's
// "Recalcular" scoring uses — one implementation of each rule.
//
// Usage: node db/import-gastos.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "pg";
import { isCandidateLine } from "../lib/gasto-matching/candidate-pool.mjs";
import { extractCfdiUuid, resolveCfdi, markSuspectCfdis } from "../lib/gasto-matching/cfdi.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMPORT_DIR = join(__dirname, "..", "data", "import");

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

function loadJson(name) {
  return JSON.parse(readFileSync(join(IMPORT_DIR, name), "utf-8"));
}

// Runs `insertOne(row)` in batched multi-row INSERT ... ON CONFLICT
// statements instead of one round-trip per row — needed here (tens of
// thousands of rows), unlike db/import-inventory.mjs's original
// one-row-at-a-time loop (263 rows, never needed to be fast).
async function upsertBatched(client, { table, conflictCol, columns, rows, toValues, batchSize = 500 }) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = [];
    const tuples = [];
    let p = 1;
    for (const row of batch) {
      const vals = toValues(row);
      tuples.push(`(${vals.map(() => `$${p++}`).join(",")})`);
      values.push(...vals);
    }
    const updateCols = columns.filter((c) => c !== conflictCol);
    const sql = `
      insert into ${table} (${columns.join(",")})
      values ${tuples.join(",")}
      on conflict (${conflictCol}) do update set
        ${updateCols.map((c) => `${c} = excluded.${c}`).join(",\n        ")}
    `;
    await client.query(sql, values);
    process.stdout.write(`\r${table}: ${Math.min(i + batchSize, rows.length)} / ${rows.length}`);
  }
  console.log();
}

async function main() {
  const notas = loadJson("gasto_notas.json");
  const lines = loadJson("gasto_lines.json");
  const flujos = loadJson("gasto_flujos.json");

  console.log(`Loaded: ${notas.length} notas, ${lines.length} lines, ${flujos.length} flujos`);

  // --- CFDI extraction + resolution (gasto_notas) -----------------------
  const flujosByRefNota = new Map();
  for (const f of flujos) {
    f.cfdi_uuid = extractCfdiUuid(f.cfdi_raw);
    if (!f.ref_nota) continue;
    if (!flujosByRefNota.has(f.ref_nota)) flujosByRefNota.set(f.ref_nota, []);
    flujosByRefNota.get(f.ref_nota).push(f.cfdi_uuid);
  }

  for (const n of notas) {
    n.cfdi_uuid = extractCfdiUuid(n.cfdi_raw);
    const linkedFlujoCfdis = flujosByRefNota.get(n.ref_notac) ?? [];
    const { resolved, source, conflict } = resolveCfdi(n.cfdi_uuid, linkedFlujoCfdis);
    n.cfdi_resolved = resolved;
    n.cfdi_source = source;
    n.cfdi_conflict = conflict;
  }
  markSuspectCfdis(notas);

  const conflicts = notas.filter((n) => n.cfdi_conflict).length;
  const suspects = notas.filter((n) => n.cfdi_suspect).length;
  const withCfdi = notas.filter((n) => n.cfdi_resolved).length;
  console.log(`CFDI resolved: ${withCfdi} / ${notas.length} (${conflicts} conflicts, ${suspects} suspect)`);

  // --- Candidate pool (gasto_lines) --------------------------------------
  for (const l of lines) {
    l.is_candidate = isCandidateLine(l);
  }
  const candidateCount = lines.filter((l) => l.is_candidate).length;
  const candidateTotal = lines.filter((l) => l.is_candidate).reduce((s, l) => s + (Number(l.total_neto) || 0), 0);
  console.log(`Candidate lines: ${candidateCount} / ${lines.length}, worth $${candidateTotal.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`);

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
    await upsertBatched(client, {
      table: "gasto_notas",
      conflictCol: "uid_gasto",
      columns: [
        "uid_gasto", "ref_notac", "ref_proveedor", "proveedor_nombre", "fecha_op", "locacion", "area",
        "total_neto", "factura_timbrada", "cfdi_raw", "cfdi_uuid", "cfdi_resolved", "cfdi_source",
        "cfdi_conflict", "cfdi_suspect", "comentario", "foto_url", "source_file", "raw",
      ],
      rows: notas,
      toValues: (n) => [
        n.uid_gasto, n.ref_notac, n.ref_proveedor, n.proveedor_nombre, n.fecha_op, n.locacion, n.area,
        n.total_neto, n.factura_timbrada, n.cfdi_raw, n.cfdi_uuid, n.cfdi_resolved, n.cfdi_source,
        n.cfdi_conflict, n.cfdi_suspect, n.comentario, n.foto_url, n.source_file, JSON.stringify(n.raw),
      ],
    });

    await upsertBatched(client, {
      table: "gasto_lines",
      conflictCol: "uid_itemc",
      columns: [
        "uid_itemc", "uid_nota", "ref_notac", "descripcion", "fecha_op", "locacion", "area", "uds",
        "precio_por_ud", "total_neto", "ref_proveedor", "clase", "categoria", "subcategoria", "tipo",
        "comentarios", "is_candidate", "source_file", "raw",
      ],
      rows: lines,
      toValues: (l) => [
        l.uid_itemc, l.uid_nota, l.ref_notac, l.descripcion, l.fecha_op, l.locacion, l.area, l.uds,
        l.precio_por_ud, l.total_neto, l.ref_proveedor, l.clase, l.categoria, l.subcategoria, l.tipo,
        l.comentarios, l.is_candidate, l.source_file, JSON.stringify(l.raw),
      ],
    });

    await upsertBatched(client, {
      table: "gasto_flujos",
      conflictCol: "uid_flujo",
      columns: [
        "uid_flujo", "ref_nota", "ref_tercero", "fecha_op", "total_neto", "pago_status",
        "factura_status", "cfdi_raw", "cfdi_uuid", "comentario", "raw",
      ],
      rows: flujos,
      toValues: (f) => [
        f.uid_flujo, f.ref_nota, f.ref_tercero, f.fecha_op, f.total_neto, f.pago_status,
        f.factura_status, f.cfdi_raw, f.cfdi_uuid, f.comentario, JSON.stringify(f.raw),
      ],
    });

    console.log("\nDone.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
