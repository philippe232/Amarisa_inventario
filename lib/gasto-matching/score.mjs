import { token_set_ratio } from "fuzzball";
import { normalize, extractNumbers, tokenize } from "./normalize.mjs";
import {
  CONCEPTS,
  BIG_EQUIPMENT_CONCEPTS,
  ACCESSORY_PART_KEYWORDS,
  BAKERY_LOCATIONS,
  BAKERY_AREA_CODES,
  AREA_CODE_MAP,
  WEIGHTS,
  SCORE_CAP,
  TIERS,
} from "./config.mjs";

// name + description + brand + model, with the item's own "#01"-style
// renumbering suffix stripped from name first (normalize() would also
// catch it at the end of the combined string, but only if name is the
// last field — stripping it here doesn't depend on field order).
export function buildItemText(item) {
  const name = (item.name ?? "").replace(/\s#\d+$/, "");
  return [name, item.description, item.brand, item.model].filter(Boolean).join(" ");
}

export function resolveConcepts(normalizedText) {
  const hits = [];
  for (const [concept, synonyms] of Object.entries(CONCEPTS)) {
    if (synonyms.some((syn) => normalizedText.includes(syn))) hits.push(concept);
  }
  return hits;
}

function hasAccessoryPart(normalizedDescription) {
  return ACCESSORY_PART_KEYWORDS.some((kw) => normalizedDescription.includes(kw));
}

// Score one gasto_line against one inventory item. Both sides already
// normalized text-wise; line.precio_por_ud/locacion/area are the raw
// (non-normalized) gasto_lines columns.
export function scoreCandidate(item, line, itemConcepts) {
  const itemText = normalize(buildItemText(item));
  const lineText = normalize(line.descripcion);
  const lineConcepts = resolveConcepts(lineText);

  const breakdown = {};

  breakdown.textSimilarity = Math.round(token_set_ratio(itemText, lineText) * WEIGHTS.textSimilarity * 10) / 10;

  if (itemConcepts.length > 0 && itemConcepts.some((c) => lineConcepts.includes(c))) {
    breakdown.conceptMatch = WEIGHTS.conceptMatch;
  }

  let brandModelScore = 0;
  for (const field of [item.brand, item.model]) {
    if (!field) continue;
    for (const tok of tokenize(normalize(field))) {
      if (tok.length < 2) continue;
      if (lineText.includes(tok)) brandModelScore += WEIGHTS.brandOrModelToken;
    }
  }
  if (brandModelScore > 0) breakdown.brandModel = brandModelScore;

  const itemNums = new Set(extractNumbers(normalize(buildItemText(item))).filter((n) => n >= 20));
  const lineNums = new Set(extractNumbers(lineText).filter((n) => n >= 20));
  let dimMatches = 0;
  for (const n of itemNums) {
    if (lineNums.has(n)) dimMatches++;
  }
  if (dimMatches > 0) {
    breakdown.dimensions = Math.min(dimMatches * WEIGHTS.dimensionMatch, WEIGHTS.dimensionMatchMax);
  }

  if (item.area === "Panadería") {
    const loc = (line.locacion ?? "").toUpperCase();
    const area = (line.area ?? "").toUpperCase();
    if (BAKERY_LOCATIONS.includes(loc) || BAKERY_AREA_CODES.includes(area)) {
      breakdown.bakery = WEIGHTS.bakery;
    }
  }

  const areaCode = AREA_CODE_MAP[item.area];
  if (areaCode && (line.area ?? "").startsWith(areaCode)) {
    breakdown.area = WEIGHTS.area;
  }

  if (hasAccessoryPart(lineText)) {
    breakdown.accessoryPenalty = WEIGHTS.accessoryPenalty;
  }

  const isBigEquipmentItem = item.type === "Electrodomestico" || itemConcepts.some((c) => BIG_EQUIPMENT_CONCEPTS.includes(c));
  if (isBigEquipmentItem && line.precio_por_ud != null && Number(line.precio_por_ud) < WEIGHTS.pricePlausibilityThreshold) {
    breakdown.pricePenalty = WEIGHTS.pricePlausibilityPenalty;
  }

  const rawScore = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  const score = Math.max(0, Math.min(SCORE_CAP, Math.round(rawScore * 10) / 10));

  return { score, breakdown };
}

function computeTier(best, second) {
  if (best == null || best < TIERS.debil.minScore) return "sin_candidato";
  if (best >= TIERS.fuerte.minScore) {
    const lead = second == null ? Infinity : best - second;
    if (lead >= TIERS.fuerte.minLead) return "fuerte";
    return "ambiguo";
  }
  if (best >= TIERS.ambiguo.minScore) return "ambiguo";
  return "debil";
}

// Ranks every candidate gasto_line for one inventory item, applying the
// concept-filter narrowing (only lines sharing the item's concept, else
// the full candidate pool) and the fuerte/ambiguo/débil/sin_candidato
// tiering. Returns the top `limit` candidates plus the item's overall
// tier (stamped onto every returned row — tier is an item-level read
// of its own best/second-best scores, not a per-candidate property, but
// item_match_candidates carries one column for it so the queue can
// filter without a join).
export function rankCandidatesForItem(item, candidateLines, limit = 10) {
  const itemConcepts = resolveConcepts(normalize(buildItemText(item)));

  let pool = candidateLines;
  if (itemConcepts.length > 0) {
    const narrowed = candidateLines.filter((line) => {
      const lineConcepts = resolveConcepts(normalize(line.descripcion));
      return itemConcepts.some((c) => lineConcepts.includes(c));
    });
    if (narrowed.length > 0) pool = narrowed;
  }

  const scored = pool
    .map((line) => ({ line, ...scoreCandidate(item, line, itemConcepts) }))
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, limit);
  const tier = computeTier(top[0]?.score, top[1]?.score);

  return top.map((c, i) => ({
    uid_itemc: c.line.uid_itemc,
    score: c.score,
    breakdown: c.breakdown,
    rank: i + 1,
    tier,
  }));
}
