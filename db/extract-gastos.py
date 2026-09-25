"""Extracts NotasC / NotasC_Items / FLUJOS (Gastos-sourced only) from the
three AppSheet exports into flat JSON, ready for db/import-gastos.mjs to
load. Deliberately "dumb" — no candidate-pool filtering or CFDI
resolution here, that logic lives in lib/gasto-matching/*.mjs (shared
with the browser) and runs in the Node import script instead, so there
is exactly one implementation of each rule.

Usage: python3 db/extract-gastos.py (from the project root)
"""
import json
import datetime
import openpyxl

IMPORT_DIR = "/Users/philippe/Documents/amarisa-inventario/data/import"
# Extracted JSON lands next to the source xlsx — same gitignored
# directory (real purchase/CFDI data must never reach git either).
OUT_DIR = IMPORT_DIR

GASTOS_OLD = f"{IMPORT_DIR}/GASTOS_App - Archive until 2024.06.30.xlsx"
GASTOS_NEW = f"{IMPORT_DIR}/GASTOS_App.xlsx"
FLUJOS_FILE = f"{IMPORT_DIR}/FLUJOS_App.xlsx"


def jsonable(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.isoformat()
    return v


def row_dict(header, row):
    return {h: jsonable(v) for h, v in zip(header, row) if h is not None}


# A handful of numeric-looking columns (ItemC_UDs, ItemC_$PorUD_NETO,
# ItemC_$Total_NETO) contain a literal "N/A" placeholder or, in one row,
# an unevaluated formula string ("=9660/2") someone typed as text rather
# than a real formula — Postgres numeric columns reject both. Null them
# out rather than guessing/evaluating arbitrary formula text; "keep them,
# don't crash" is about not dropping the row, not inventing a value.
def to_number(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def iso_date(v):
    if v is None:
        return None
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.isoformat()
    return str(v)


def read_sheet(path, sheet):
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb[sheet]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    out = []
    for row in rows:
        if row[0] is None:
            continue
        out.append(row_dict(header, row))
    wb.close()
    return out, header


def upper_or_none(v):
    return str(v).strip().upper() if v not in (None, "") else None


# --- NotasC + NotasC_Items: old file first, new file second, new wins on
# UID collision (dict keyed by UID, later write replaces earlier one). ---
notas_by_uid = {}
items_by_uid = {}

for path, label in [(GASTOS_OLD, "old"), (GASTOS_NEW, "new")]:
    rows, _ = read_sheet(path, "NotasC")
    for r in rows:
        notas_by_uid[r["UID_Gasto"]] = {
            "uid_gasto": r["UID_Gasto"],
            "ref_notac": r.get("REF_NotaC"),
            "ref_proveedor": r.get("REF_Proveedor"),
            "proveedor_nombre": r.get("Proveedor_Nombre"),
            "fecha_op": iso_date(r.get("NotaC_FechaOp")),
            "locacion": upper_or_none(r.get("NotaC_Locacion")),
            "area": r.get("NotaC_Area"),
            "total_neto": to_number(r.get("NotaC_$Total_NETO")),
            "factura_timbrada": r.get("NotaC_FacturaTimbrada_YN"),
            "cfdi_raw": r.get("NotaC_CFDI"),
            "comentario": r.get("NotaC_Comentario"),
            "foto_url": r.get("NotaC_Foto"),
            "source_file": label,
            "raw": r,
        }

    rows, _ = read_sheet(path, "NotasC_Items")
    for r in rows:
        items_by_uid[r["UID_ItemC"]] = {
            "uid_itemc": r["UID_ItemC"],
            "uid_nota": r.get("UID_NotaC"),
            "ref_notac": r.get("REF_NotaC"),
            "descripcion": r.get("Insumo_NombreCompleto"),
            "fecha_op": iso_date(r.get("ItemC_FechaOp")),
            "locacion": upper_or_none(r.get("ItemC_Locacion")),
            "area": r.get("ItemC_Area"),
            "uds": to_number(r.get("ItemC_UDs")),
            "precio_por_ud": to_number(r.get("ItemC_$PorUD_NETO")),
            "total_neto": to_number(r.get("ItemC_$Total_NETO")),
            "ref_proveedor": r.get("REF_Proveedor"),
            "clase": r.get("ItemC_Clase"),
            "categoria": r.get("ItemC_Categoria"),
            "subcategoria": r.get("ItemC_SubCategoria"),
            "tipo": r.get("ItemC_Tipo"),
            "comentarios": r.get("ItemC_Comentarios"),
            "source_file": label,
            "raw": r,
        }

print(f"gasto_notas: {len(notas_by_uid)} (deduped)")
print(f"gasto_lines: {len(items_by_uid)} (deduped)")

# Drop line items whose parent nota doesn't exist in the deduped set (a
# line referencing a UID_NotaC we never saw) — shouldn't happen, but
# don't silently insert an FK violation into the import.
orphans = [uid for uid, it in items_by_uid.items() if it["uid_nota"] not in notas_by_uid]
if orphans:
    print(f"WARNING: {len(orphans)} gasto_lines reference a missing UID_NotaC, dropping: {orphans[:10]}")
    for uid in orphans:
        del items_by_uid[uid]

with open(f"{OUT_DIR}/gasto_notas.json", "w", encoding="utf-8") as f:
    json.dump(list(notas_by_uid.values()), f, ensure_ascii=False)
with open(f"{OUT_DIR}/gasto_lines.json", "w", encoding="utf-8") as f:
    json.dump(list(items_by_uid.values()), f, ensure_ascii=False)

# --- FLUJOS: only Flujo_Fuente == 'Gastos' rows -------------------------
flujo_rows, _ = read_sheet(FLUJOS_FILE, "FLUJOS")
gastos_flujos = [
    {
        "uid_flujo": r["UID_FLUJO"],
        "ref_nota": r.get("REF_NOTA"),
        "ref_tercero": r.get("REF_TERCERO"),
        "fecha_op": iso_date(r.get("Nota_FechaOp")),
        "total_neto": to_number(r.get("Flujo_$Total_Neto")),
        "pago_status": r.get("Flujo_Pago_Status"),
        "factura_status": r.get("Flujo_Factura_Status"),
        "cfdi_raw": r.get("Flujo_CFDI"),
        "comentario": r.get("Flujo_Comentario"),
        "raw": r,
    }
    for r in flujo_rows
    if r.get("Flujo_Fuente") == "Gastos"
]
print(f"gasto_flujos (Flujo_Fuente = 'Gastos' only): {len(gastos_flujos)} / {len(flujo_rows)} total rows")

with open(f"{OUT_DIR}/gasto_flujos.json", "w", encoding="utf-8") as f:
    json.dump(gastos_flujos, f, ensure_ascii=False)

print("\nDone. Wrote gasto_notas.json, gasto_lines.json, gasto_flujos.json")
