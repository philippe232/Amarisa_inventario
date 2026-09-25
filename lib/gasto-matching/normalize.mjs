// Shared text normalization — used by candidate-pool filtering, CFDI
// extraction and scoring alike, so "does this description contain X"
// always means the same thing everywhere in this feature.

// Lowercase, strip accents, drop punctuation (dimensions like
// "80x170cms" become "80 170", not "80x170cms" or a single glued token),
// remove an item's own "#01"-style renumbering suffix, collapse
// whitespace. Matches the normalization already used for the item-name
// duplicate check elsewhere in this app, extended with punctuation/
// dimension splitting since gasto descriptions are free text.
export function normalize(text) {
  if (text == null) return "";
  let s = String(text).toLowerCase();
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); // strip accents
  s = s.replace(/\s#\d+$/, ""); // trailing "#01" item-renumbering suffix
  // "80x170" -> "80 170" — digit-bounded only, so a bare "x"/"×" inside a
  // real word (Exprimidor, Explorian, Texas) is never touched.
  s = s.replace(/(\d)\s*[x×]\s*(\d)/gi, "$1 $2");
  s = s.replace(/[^a-z0-9\s]/g, " "); // punctuation -> space, keeps numbers/letters
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function normalizeLocation(text) {
  if (text == null) return "";
  return String(text).trim().toUpperCase();
}

// Numbers >= 20 found in normalized text — dimension figures small enough
// to be a quantity or a year get excluded by the caller's own >=20 floor
// (see WEIGHTS.dimensionMatch in config.mjs), not here; this just extracts
// candidates.
export function extractNumbers(normalizedText) {
  const matches = normalizedText.match(/\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map(Number);
}

export function tokenize(normalizedText) {
  return normalizedText.split(" ").filter(Boolean);
}
