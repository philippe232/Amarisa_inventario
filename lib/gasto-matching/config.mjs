// Tunable knobs for purchase-price/CFDI matching — every weight, keyword
// list and synonym dictionary the scorer (score.mjs) and the importer
// (db/import-gastos.mjs) use lives here, in one file, on purpose: Philippe
// asked to be able to retune this without touching scoring logic. Plain
// ESM .mjs (not .ts) so it loads identically from a Node CLI script and
// from the Next.js app bundle (allowJs) with no build step either way.

// --- Candidate pool (db/import-gastos.mjs, computed once per gasto_line) ---

export const CANDIDATE_CATEGORIES = ["FF&E", "Muebles & Equipos", "Inversiones"];
export const CANDIDATE_CLASE = "Activos";

// A line in one of these never counts, even if it matches a keyword below —
// payroll and ingredient/packaging spend are never equipment.
export const EXCLUDE_CLASE = ["Laboral"];
export const EXCLUDE_CATEGORIA = ["Ingredientes", "Envasados"];

// Soft signal: a normalized description containing any of these makes a
// line a candidate even outside the categories above (classifiers are
// inconsistent — a licuadora filed under Remodelación, a fan under
// Decoración — so keyword matching is the primary net, category/clase
// the secondary one).
export const EQUIPMENT_KEYWORDS = [
  "licuadora", "refrigerador", "congelador", "horno", "molino", "cafetera",
  "espresso", "vitrina", "batidora", "amasadora", "laminadora", "bascula",
  "ventilador", "mesa", "silla", "banco", "lampara", "charola", "molde",
  "tostador", "procesador", "exprimidor", "panini", "plancha", "hervidor",
  "tetera", "microondas", "parrilla", "espiguero", "anaquel", "repisa",
  "espejo", "taza", "tarro", "vaso", "plato", "bowl", "tazon", "cuchillo",
  "tenedor", "cuchara", "sarten", "olla", "jarra", "impresora", "bocina",
  "aire acondicionado", "extractor",
];

// A line matching one of these is dropped even if it also hit an equipment
// keyword above (e.g. "papel" for horno paper, "filtro" for a coffee
// filter) — consumables/services, not equipment. "suministro" is the one
// deliberate exception ("Suministro e instalación aire acond." is real
// equipment spend, not a service line).
export const CONSUMABLE_SERVICE_KEYWORDS = [
  "desechable", "filtro", "papel", "domos", "popote", "comandas",
  "mano de obra", "pintura", "trabajos", "servicio", "ferreteria",
  "herreria", "playera", "anticipo", "remodelacion", "tablaroca",
  "instalacion", "licencia", "mantenimiento", "reparacion",
];
export const CONSUMABLE_EXCEPTION_KEYWORDS = ["suministro"];

// --- Accessory/part penalty (score.mjs) ---------------------------------
// A gasto_line whose description names a part or consumable FOR a machine,
// not the machine itself — without this, e.g. a Vitamix jar outranks the
// Vitamix blender it belongs to.
export const ACCESSORY_PART_KEYWORDS = [
  "vaso para licuadora", "tuerca", "pastilla limpieza", "compresor",
  "evaporador", "globo p/batidora", "globo para batidora", "manguera",
  "refaccion", "cuchilla", "tapa", "filtro",
];

// --- Concept dictionary (score.mjs) -------------------------------------
// Maps both an inventory item's text and a gasto_line's description to a
// shared concept key. If the item resolves to a concept, only candidates
// sharing it are shown (falling back to the full pool if none do) — this
// is what keeps "Molino para café" from being buried under 1,400 unrelated
// lines. Every synonym must already be accent-stripped/lowercased the same
// way normalize() in score.mjs does, since matching happens post-normalize.
export const CONCEPTS = {
  licuadora: ["licuadora", "blender", "vitamix", "ninja"],
  refrigerador: ["refrigerador", "refri", "enfriador", "criotec"],
  molino: ["molino", "grinder", "sr70"],
  cafetera: ["cafetera", "maquina de cafe", "espresso", "zoe", "rancilio", "appia"],
  hervidor: ["hervidor", "tetera", "calentador"],
  taza: ["taza", "tasa", "jarrito"],
  tarro: ["tarro"],
  aeropress: ["aeropress", "aeroexpress"],
  horno: ["horno"],
  congelador: ["congelador"],
  batidora: ["batidora"],
  amasadora: ["amasadora"],
  laminadora: ["laminadora"],
  bascula: ["bascula", "balanza"],
  ventilador: ["ventilador"],
  vitrina: ["vitrina"],
  tostador: ["tostador"],
  procesador: ["procesador"],
  exprimidor: ["exprimidor"],
  microondas: ["microondas"],
  parrilla: ["parrilla", "plancha"],
  extractor: ["extractor"],
  mesa: ["mesa"],
  silla: ["silla", "banco"],
  lampara: ["lampara"],
  // Tableware/smallware — the rest of EQUIPMENT_KEYWORDS above. Without
  // a concept entry these never get the +25 bonus or the candidate-pool
  // narrowing, so a genuinely good match (e.g. "Bowl de barro" vs "15
  // PLATOS Y 10 BOWLS DE BARRO") loses to text-similarity noise alone
  // and lands in sin_candidato even though the words are right there.
  bowl: ["bowl", "tazon"], // spec lists these together ("bowl/tazón")
  charola: ["charola"],
  molde: ["molde"],
  espiguero: ["espiguero"],
  anaquel: ["anaquel", "repisa"],
  espejo: ["espejo"],
  vaso: ["vaso"],
  plato: ["plato"],
  cuchillo: ["cuchillo"],
  tenedor: ["tenedor"],
  cuchara: ["cuchara"],
  sarten: ["sarten"],
  olla: ["olla"],
  jarra: ["jarra"],
  impresora: ["impresora"],
  bocina: ["bocina"],
  aire_acondicionado: ["aire acondicionado"],
};

// Concepts that count as "big equipment" for the price-plausibility
// penalty — a $150 "cafetera" line is almost certainly a part or an
// ingredient miscategorized, not the actual machine.
export const BIG_EQUIPMENT_CONCEPTS = [
  "refrigerador", "congelador", "horno", "molino", "cafetera", "batidora",
  "amasadora", "laminadora", "vitrina", "microondas",
];

// --- Area / location bonuses (score.mjs) --------------------------------
// All equipment now physically lives at La Punta, including items
// originally bought for Guadalajara/Zicatela/Rinconada locations — so
// location is NEVER used as a general signal, only this one narrow
// bakery exception (Philippe's explicit instruction).
export const BAKERY_LOCATIONS = ["PXM11 - FABRICA LAZARO"]; // uppercase-normalized
export const BAKERY_AREA_CODES = ["38 - BAKERY", "10 - PRODUCCION"]; // uppercase-normalized

export const AREA_CODE_MAP = {
  Barra: "35",
  Cocina: "20",
  Piso: "30",
};

// --- Weights (score.mjs) -------------------------------------------------
export const WEIGHTS = {
  textSimilarity: 0.6,       // multiplies the 0-100 token-set ratio
  conceptMatch: 25,
  brandOrModelToken: 12,     // per matching token, brand and model scored separately
  dimensionMatch: 8,         // per matching dimension number >= 20cm
  dimensionMatchMax: 16,     // cap across all dimension matches
  bakery: 10,
  area: 5,
  accessoryPenalty: -20,
  pricePlausibilityPenalty: -15,
  pricePlausibilityThreshold: 1000, // MXN unit price below which a big-equipment line looks implausible
};

export const SCORE_CAP = 100;

// Tiers are display-only — they never gate which candidates are shown,
// only how the queue/UI groups and sorts them.
export const TIERS = {
  fuerte: { minScore: 75, minLead: 5 }, // best >= 75 AND >= 5 points ahead of #2
  ambiguo: { minScore: 60 },            // best >= 60, or >= 75 but not clear of #2
  debil: { minScore: 45 },
  // below 45: sin_candidato
};
