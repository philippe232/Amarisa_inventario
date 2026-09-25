import { normalize } from "./normalize.mjs";
import {
  CANDIDATE_CATEGORIES,
  CANDIDATE_CLASE,
  EXCLUDE_CLASE,
  EXCLUDE_CATEGORIA,
  EQUIPMENT_KEYWORDS,
  CONSUMABLE_SERVICE_KEYWORDS,
  CONSUMABLE_EXCEPTION_KEYWORDS,
} from "./config.mjs";

function containsAny(normalizedText, keywords) {
  return keywords.some((kw) => normalizedText.includes(kw));
}

// A gasto_line is a match candidate if it looks like it could be
// equipment/furniture/tableware Amarisa still owns, per the rules in
// config.mjs. Computed once at import time (db/import-gastos.mjs) and
// stored as gasto_lines.is_candidate — scoring only ever looks at
// candidates, but the Buscar free-text fallback in the review UI can
// still reach every line, candidate or not.
export function isCandidateLine(line) {
  if (EXCLUDE_CLASE.includes(line.clase)) return false;
  if (EXCLUDE_CATEGORIA.includes(line.categoria)) return false;

  const desc = normalize(line.descripcion);
  const looksLikeConsumableOrService =
    containsAny(desc, CONSUMABLE_SERVICE_KEYWORDS) && !containsAny(desc, CONSUMABLE_EXCEPTION_KEYWORDS);
  if (looksLikeConsumableOrService) return false;

  const byCategoryOrClase = CANDIDATE_CATEGORIES.includes(line.categoria) || line.clase === CANDIDATE_CLASE;
  const byKeyword = containsAny(desc, EQUIPMENT_KEYWORDS);

  return byCategoryOrClase || byKeyword;
}
