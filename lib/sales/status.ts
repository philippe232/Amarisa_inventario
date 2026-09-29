import type { PaymentMethod } from "@/lib/sales/types";

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "otro", label: "Otro" },
];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((o) => [o.value, o.label]),
) as Record<PaymentMethod, string>;
