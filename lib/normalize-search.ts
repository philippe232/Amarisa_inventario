// Strips accents/diacritics and lowercases, so client-side search
// matches case- and accent-insensitively — e.g. "sillon" must find
// "Sillón". Ported from reference/cereza/lib/normalize-search.ts.
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
