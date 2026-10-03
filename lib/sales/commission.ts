import { IVA_RATE, round2 } from "@/lib/sales/orders";
import type { PaymentMethod } from "@/lib/sales/types";

// What CLIP keeps from each card payment: 2.6% of it, plus IVA on that
// commission. Charged to the seller, so it comes off net income — it never
// changes what the buyer owes or has paid.
export const CLIP_RATE = 0.026;

export type Commission = { base: number; iva: number; total: number };

export function clipCommission(amount: number): Commission {
  const base = round2(amount * CLIP_RATE);
  const iva = round2(base * IVA_RATE);
  return { base, iva, total: round2(base + iva) };
}

// The commission on a payment: only CLIP payments carry one.
export function paymentCommission(payment: { method: PaymentMethod; amount: number }): number {
  return payment.method === "clip" ? clipCommission(payment.amount).total : 0;
}

// Gross, commissions and what's actually kept, across payments.
export function paymentsNet(payments: { method: PaymentMethod; amount: number }[]): { gross: number; commission: number; net: number } {
  const gross = round2(payments.reduce((s, p) => s + p.amount, 0));
  const commission = round2(payments.reduce((s, p) => s + paymentCommission(p), 0));
  return { gross, commission, net: round2(gross - commission) };
}
