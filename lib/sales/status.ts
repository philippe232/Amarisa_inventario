import type { PaymentMethod } from "@/lib/sales/types";

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "spei_8055", label: "SPEI - 8055" },
  { value: "spei_pas", label: "SPEI - PAS" },
];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label]),
) as Record<PaymentMethod, string>;
