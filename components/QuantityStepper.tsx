"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

// − / number / + for choosing how many units, clamped to 1..max. Buttons
// apply immediately; typing applies on blur or Enter.
export default function QuantityStepper({
  value,
  max,
  onChange,
  disabled = false,
  label = "Cantidad",
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [text, setText] = useState(String(value));
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(String(value));
  }

  function apply(next: number) {
    const clamped = Math.min(Math.max(Math.floor(next) || 1, 1), Math.max(max, 1));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  const btn =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line-strong bg-card text-ink disabled:opacity-40";

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label="Menos" disabled={disabled || value <= 1} onClick={() => apply(value - 1)} className={btn}>
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        step={1}
        value={text}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => apply(Number(text))}
        onKeyDown={(e) => e.key === "Enter" && apply(Number(text))}
        className="h-9 w-16 rounded-md border border-line-strong bg-card px-1 text-center text-sm text-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" aria-label="Más" disabled={disabled || value >= max} onClick={() => apply(value + 1)} className={btn}>
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
