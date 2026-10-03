"use client";

import { useState } from "react";
import { formatCurrencyFlex } from "@/lib/currency";
import { selectAllOnFocus } from "@/lib/select-on-focus";

// Digits and one decimal point only (plus a leading minus when negatives
// are allowed) — typing, pasting "$1,200.50" and everything in between all
// come out as a plain number string.
function sanitize(raw: string, allowNegative: boolean): string {
  const negative = allowNegative && raw.trim().startsWith("-");
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const dot = cleaned.indexOf(".");
  const digits = dot === -1 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
  return negative ? `-${digits}` : digits;
}

// An amount field: "$1,000" (or "$83.33") while you're not in it, the bare
// number to edit while you are. The value is always the plain number
// string, so callers do their math on it as before.
export default function MoneyInput({
  value,
  onChange,
  onBlur,
  disabled = false,
  allowNegative = false,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  // A leading "-" is kept (a refund, a correction); off by default.
  allowNegative?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const n = Number(value);
  const shown = focused || value.trim() === "" || !Number.isFinite(n) ? value : formatCurrencyFlex(n);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={shown}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={(e) => {
        setFocused(true);
        // The text swaps from "$1,000" to "1000" on focus; select it once
        // that has rendered.
        const el = e.target;
        setTimeout(() => selectAllOnFocus({ target: el } as React.FocusEvent<HTMLInputElement>), 0);
      }}
      onChange={(e) => onChange(sanitize(e.target.value, allowNegative))}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
      className={className}
    />
  );
}
