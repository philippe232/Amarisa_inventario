// Every text-like input selects its full contents on focus, so retyping
// a value is one tap + type, never a manual clear-then-type. Ported from
// reference/cereza/lib/select-on-focus.ts.
export function selectAllOnFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.select();
}
