// Single shared currency formatter — ported from Cereza's lib/currency.ts
// (same convention: one Intl.NumberFormat instance, not one per call site).
const formatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

// Accepts a plain number or the string Supabase's JS client returns for
// numeric columns (sent as strings to avoid float precision loss).
export function formatCurrency(value: number | string): string {
  return formatter.format(typeof value === "string" ? Number(value) : value);
}
