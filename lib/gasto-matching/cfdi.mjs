// CFDI (fiscal invoice) UUID extraction and resolution — free text in
// both source systems: a UUID plus a trailing date ("cd4b0363-...  03JUL
//2024"), placeholders ("nohayfactura", "sin factura", "000-no se
// asignó..."), or a handful of UUIDs pasted hundreds of times as
// defaults (cfdi_suspect below).

const UUID_RE = /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i;

// Returns the UUID uppercased, or null if the text has no UUID-shaped
// substring (placeholder text, empty, etc.) — the raw text is kept
// separately by the caller so the admin can still see what's there.
export function extractCfdiUuid(text) {
  if (!text) return null;
  const match = String(text).match(UUID_RE);
  return match ? match[0].toUpperCase() : null;
}

// Resolved CFDI for one gasto_notas row: its own UUID if it has one,
// else the first non-empty UUID among its linked gasto_flujos rows
// (REF_NotaC = REF_NOTA can repeat for split payments — first one wins,
// per spec). Conflict is flagged, never silently overridden, so the
// admin picks in the UI.
export function resolveCfdi(notaCfdiUuid, flujoCfdiUuids) {
  const firstFlujoUuid = flujoCfdiUuids.find((u) => u) ?? null;

  if (notaCfdiUuid && firstFlujoUuid) {
    return {
      resolved: notaCfdiUuid,
      source: "gastos",
      conflict: notaCfdiUuid !== firstFlujoUuid,
    };
  }
  if (notaCfdiUuid) return { resolved: notaCfdiUuid, source: "gastos", conflict: false };
  if (firstFlujoUuid) return { resolved: firstFlujoUuid, source: "flujos", conflict: false };
  return { resolved: null, source: null, conflict: false };
}

// A UUID reused across many unrelated notas is a default/placeholder
// someone pasted rather than a real invoice reference — flagged, not
// dropped, so the admin can still see it and decide.
export const CFDI_SUSPECT_THRESHOLD = 10;

export function markSuspectCfdis(notas) {
  const counts = new Map();
  for (const n of notas) {
    if (!n.cfdi_resolved) continue;
    counts.set(n.cfdi_resolved, (counts.get(n.cfdi_resolved) ?? 0) + 1);
  }
  for (const n of notas) {
    n.cfdi_suspect = Boolean(n.cfdi_resolved) && counts.get(n.cfdi_resolved) > CFDI_SUSPECT_THRESHOLD;
  }
}
