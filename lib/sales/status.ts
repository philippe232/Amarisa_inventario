import type { FormaDePago, PaymentMethod } from "@/lib/sales/types";

// How money actually arrives — the method of each payment, and what
// Resumen totals by.
export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "spei_8055", label: "SPEI - 8055" },
  { value: "spei_pas", label: "SPEI - PAS" },
  { value: "clip", label: "CLIP" },
  { value: "en_especie", label: "En especie" },
];

// An order's forma de pago: those, plus "Por Pagar" for a buyer who hasn't
// paid yet.
export const FORMA_DE_PAGO_OPTIONS: { value: FormaDePago; label: string }[] = [
  ...PAYMENT_METHOD_OPTIONS,
  { value: "por_pagar", label: "Por Pagar" },
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label]),
) as Record<PaymentMethod, string>;

export const FORMA_DE_PAGO_LABELS: Record<FormaDePago, string> = Object.fromEntries(
  FORMA_DE_PAGO_OPTIONS.map((o) => [o.value, o.label]),
) as Record<FormaDePago, string>;
