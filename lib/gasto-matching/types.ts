// Mirrors db/migrations/0023_gasto_matching_schema.sql — kept by hand,
// same convention as lib/types.ts for the items table.

export type PurchaseMatchStatus = "pendiente" | "confirmado" | "sin_registro" | "precio_referencia";
export type MatchTier = "fuerte" | "ambiguo" | "debil" | "sin_candidato";

export type GastoNota = {
  uid_gasto: string;
  ref_notac: string | null;
  ref_proveedor: string | null;
  proveedor_nombre: string | null;
  fecha_op: string | null;
  locacion: string | null;
  area: string | null;
  total_neto: number | null;
  factura_timbrada: boolean | null;
  cfdi_raw: string | null;
  cfdi_uuid: string | null;
  cfdi_resolved: string | null;
  cfdi_source: "gastos" | "flujos" | null;
  cfdi_conflict: boolean;
  cfdi_suspect: boolean;
  comentario: string | null;
  foto_url: string | null;
};

export type GastoLine = {
  uid_itemc: string;
  uid_nota: string;
  ref_notac: string | null;
  descripcion: string | null;
  fecha_op: string | null;
  locacion: string | null;
  area: string | null;
  uds: number | null;
  precio_por_ud: number | null;
  total_neto: number | null;
  ref_proveedor: string | null;
  clase: string | null;
  categoria: string | null;
  subcategoria: string | null;
  tipo: string | null;
  comentarios: string | null;
  is_candidate: boolean;
  gasto_notas?: GastoNota | null;
};

export type ItemMatchCandidate = {
  id: string;
  item_id: string;
  uid_itemc: string;
  score: number;
  tier: MatchTier;
  rank: number;
  score_breakdown: Record<string, number> | null;
  gasto_lines: GastoLine | null;
};

export type ItemPurchaseMatch = {
  id: string;
  item_id: string;
  uid_itemc: string | null;
  uid_gasto: string | null;
  units_covered: number | null;
  unit_cost: number | null;
  cfdi_uuid: string | null;
  cfdi_source: "gastos" | "flujos" | "manual" | null;
  status: PurchaseMatchStatus;
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  is_active: boolean;
};
