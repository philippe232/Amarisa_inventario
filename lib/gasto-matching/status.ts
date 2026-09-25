import type { PurchaseMatchStatus, MatchTier } from "@/lib/gasto-matching/types";

export const STATUS_OPTIONS: { value: PurchaseMatchStatus; label: string }[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "confirmado", label: "Confirmado" },
  { value: "sin_registro", label: "Sin registro" },
  { value: "precio_referencia", label: "Precio de referencia" },
];
export const STATUS_LABELS: Record<PurchaseMatchStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label]),
) as Record<PurchaseMatchStatus, string>;

export const TIER_OPTIONS: { value: MatchTier; label: string }[] = [
  { value: "fuerte", label: "Fuerte" },
  { value: "ambiguo", label: "Ambiguo" },
  { value: "debil", label: "Débil" },
  { value: "sin_candidato", label: "Sin candidato" },
];
export const TIER_LABELS: Record<MatchTier, string> = Object.fromEntries(
  TIER_OPTIONS.map((o) => [o.value, o.label]),
) as Record<MatchTier, string>;

export const TIER_COLORS: Record<MatchTier, string> = {
  fuerte: "border-positive/30 bg-positive/10 text-positive",
  ambiguo: "border-yellow/30 bg-yellow/10 text-yellow",
  debil: "border-neutral/30 bg-neutral/10 text-neutral",
  sin_candidato: "border-line-strong bg-page text-ink-faint",
};

export const STATUS_COLORS: Record<PurchaseMatchStatus, string> = {
  pendiente: "border-line-strong bg-page text-ink-faint",
  confirmado: "border-positive/30 bg-positive/10 text-positive",
  sin_registro: "border-neutral/30 bg-neutral/10 text-neutral",
  precio_referencia: "border-yellow/30 bg-yellow/10 text-yellow",
};
