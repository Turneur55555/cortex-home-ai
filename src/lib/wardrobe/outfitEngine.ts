/**
 * Outfit Engine (Dressing) — logique pure, zéro import React.
 *
 * Moteur de scoring déterministe pour "Générer une tenue" : à partir des
 * pièces réellement présentes dans le dressing d'un utilisateur (aucune
 * pièce n'est jamais inventée), compose plusieurs combinaisons cohérentes
 * pour un contexte donné (Quotidien/Travail/Soirée/Sport/Vacances/Baignade)
 * et leur attribue un score 0-100 reproductible à partir de critères
 * explicites et pondérés — jamais un score inventé par un LLM.
 *
 * Toute IA éventuelle (édge function) ne doit intervenir qu'en enrichissement
 * léger du texte d'explication, jamais comme décideur du score ou du choix
 * des pièces — cf. `buildExplanation`, généré uniquement à partir des faits
 * calculés ci-dessous.
 *
 * "User overrides win" (§6 de la mission) est satisfait par construction :
 * ce moteur ne lit que les colonnes actuelles de `wardrobe_items`, donc
 * toute correction utilisateur (Part A — édition d'une pièce) est déjà la
 * seule valeur vue ici, sans distinction avec la valeur Vision d'origine.
 *
 * Personnalisation (19/10/2026) — toujours déterministe, toujours à partir de
 * faits lus en base, passés en options :
 *   - saison courante : une pièce hors saison est écartée quand sa catégorie
 *     a une alternative de saison, et pénalisée sinon (pas de short en hiver) ;
 *   - rotation : une pièce portée ces derniers jours recule (`daysSinceWorn`) ;
 *   - goûts : une paire de pièces déjà présente dans une tenue aimée 👍
 *     rapporte un bonus (`likedPairs`) ;
 *   - pièces oubliées : légère priorité (`forgottenItemIds`) ;
 *   - exclusions : le planning de la semaine évite de répéter une pièce
 *     (`excludeItemIds`).
 * Les chaussures ne sont plus obligatoires : un haut + un bas suffisent,
 * la tenue signale alors ce qui manque (`missing`) au lieu d'être refusée.
 */

import { canonicalWardrobeColor, type WardrobeSeason } from "./taxonomy";

export type OutfitCategory = "top" | "bottom" | "outerwear" | "shoes" | "accessory";

export type OutfitContext = "quotidien" | "travail" | "soiree" | "sport" | "vacances" | "baignade";

export const OUTFIT_CONTEXTS: Array<{ value: OutfitContext; label: string }> = [
  { value: "quotidien", label: "Quotidien" },
  { value: "travail", label: "Travail" },
  { value: "soiree", label: "Soirée" },
  { value: "sport", label: "Sport" },
  { value: "vacances", label: "Vacances" },
  { value: "baignade", label: "Baignade" },
];

export function isOutfitContext(value: unknown): value is OutfitContext {
  return OUTFIT_CONTEXTS.some((c) => c.value === value);
}

/** Vue pure d'une pièce du dressing — sous-ensemble typé de `wardrobe_items`. */
export interface OutfitScoringItem {
  id: string;
  category: OutfitCategory;
  subcategory: string | null;
  primary_color: string | null;
  secondary_colors: string[];
  pattern: string | null;
  material: string | null;
  fit: string | null;
  formality: string | null;
  seasons: string[];
  usage: string[];
}

export interface OutfitScoreBreakdown {
  category: number;
  usage: number;
  formality: number;
  color: number;
  pattern: number;
  season: number;
  /** Adéquation à la saison courante (1 sans saison courante fournie). */
  inSeason: number;
  /** 1 = aucune pièce portée récemment, 0 = tout porté hier. */
  freshness: number;
  /** 0-1, part des paires de la tenue déjà vues dans une tenue aimée. */
  affinity: number;
}

export interface GeneratedOutfit {
  items: OutfitScoringItem[];
  /** 0-100, entier, reproductible à partir de `breakdown` (mêmes pièces + contexte => même score). */
  score: number;
  breakdown: OutfitScoreBreakdown;
  /** Phrase courte, générée à partir des faits ci-dessus — jamais un essai verbeux. */
  explanation: string;
  /** Catégories absentes du dressing qui compléteraient la tenue (ex. « chaussures »). */
  missing: string[];
  /** Pièces de la tenue signalées comme oubliées (non portées depuis longtemps). */
  forgottenItemIds: string[];
}

export type GenerateOutfitsResult =
  | { ok: true; outfits: GeneratedOutfit[] }
  | { ok: false; reason: string; missingCategories: string[] };

interface ContextRule {
  label: string;
  preferredUsage: string[];
  hardExcludeUsage: string[];
  hardExcludeSubcategories: string[];
  preferredFormality: string[];
  hardExcludeFormality: string[];
}

const CONTEXT_RULES: Record<OutfitContext, ContextRule> = {
  quotidien: {
    label: "quotidien",
    preferredUsage: ["quotidien"],
    hardExcludeUsage: ["baignade"],
    hardExcludeSubcategories: [],
    preferredFormality: ["casual", "smart_casual"],
    hardExcludeFormality: [],
  },
  travail: {
    label: "travail",
    preferredUsage: ["habille", "quotidien"],
    hardExcludeUsage: ["baignade", "sport"],
    hardExcludeSubcategories: ["running", "jogging"],
    preferredFormality: ["smart_casual", "formal"],
    hardExcludeFormality: ["sport"],
  },
  soiree: {
    label: "soirée",
    preferredUsage: ["habille"],
    hardExcludeUsage: ["baignade", "sport"],
    hardExcludeSubcategories: ["running", "jogging"],
    preferredFormality: ["formal", "smart_casual"],
    hardExcludeFormality: ["sport"],
  },
  sport: {
    label: "sport",
    preferredUsage: ["sport"],
    hardExcludeUsage: ["baignade", "habille"],
    hardExcludeSubcategories: [],
    preferredFormality: ["sport", "casual"],
    hardExcludeFormality: ["formal"],
  },
  vacances: {
    label: "vacances",
    preferredUsage: ["quotidien", "baignade"],
    hardExcludeUsage: [],
    hardExcludeSubcategories: [],
    preferredFormality: ["casual"],
    hardExcludeFormality: [],
  },
  baignade: {
    label: "baignade",
    preferredUsage: ["baignade"],
    hardExcludeUsage: [],
    hardExcludeSubcategories: [],
    preferredFormality: [],
    hardExcludeFormality: [],
  },
};

// ─── Couleur — vocabulaire partagé avec useWardrobe.ts COLOR_ENUM ──────────

const COLOR_NEUTRALS = new Set([
  "noir",
  "blanc",
  "gris",
  "gris fonce",
  "gris clair",
  "beige",
  "marron",
]);

const COLOR_FAMILIES: Record<string, string> = {
  bleu: "bleu",
  "bleu marine": "bleu",
  "bleu clair": "bleu",
  vert: "vert",
  rouge: "chaud",
  orange: "chaud",
  jaune: "chaud",
  bordeaux: "chaud",
  rose: "accent",
  violet: "accent",
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Couleur repliée (sans accent) APRÈS canonicalisation : « Blanche » → « blanc ». */
function colorKey(value: string): string {
  return normalizeText(canonicalWardrobeColor(value) ?? value);
}

/** Score de compatibilité entre deux couleurs — simple, pas de théorie complète des couleurs. */
export function colorPairScore(a: string | null, b: string | null): number {
  if (!a || !b) return 0.8;
  const na = colorKey(a);
  const nb = colorKey(b);
  if (na === nb) return 1;
  if (COLOR_NEUTRALS.has(na) || COLOR_NEUTRALS.has(nb)) return 0.95;
  const fa = COLOR_FAMILIES[na];
  const fb = COLOR_FAMILIES[nb];
  if (fa && fa === fb) return 0.75;
  return 0.4;
}

function colorCoherenceScore(items: OutfitScoringItem[]): number {
  const colored = items.filter((i) => i.primary_color);
  if (colored.length < 2) return 0.9;
  let total = 0;
  let count = 0;
  for (let i = 0; i < colored.length; i++) {
    for (let j = i + 1; j < colored.length; j++) {
      total += colorPairScore(colored[i].primary_color, colored[j].primary_color);
      count++;
    }
  }
  return count > 0 ? total / count : 0.9;
}

function patternCoherenceScore(items: OutfitScoringItem[]): number {
  const patterns = items
    .map((i) => i.pattern)
    .filter((p): p is string => !!p && p !== "uni" && p !== "logo");
  if (patterns.length <= 1) return 1;
  const allSame = patterns.every((p) => p === patterns[0]);
  return allSame ? 0.7 : 0.4;
}

function seasonCoherenceScore(items: OutfitScoringItem[]): number {
  const withSeasons = items.filter((i) => i.seasons.length > 0);
  if (withSeasons.length < 2) return 1;
  let total = 0;
  let count = 0;
  for (let i = 0; i < withSeasons.length; i++) {
    for (let j = i + 1; j < withSeasons.length; j++) {
      const shared = withSeasons[i].seasons.some((s) => withSeasons[j].seasons.includes(s));
      total += shared ? 1 : 0.5;
      count++;
    }
  }
  return count > 0 ? total / count : 1;
}

const FORMALITY_ORDER = ["sport", "casual", "smart_casual", "formal"];

function formalityIndex(f: string | null): number | null {
  const idx = FORMALITY_ORDER.indexOf(f ?? "");
  return idx >= 0 ? idx : null;
}

function formalityScore(items: OutfitScoringItem[], rule: ContextRule): number {
  let prefTotal = 0;
  const prefIdxs = rule.preferredFormality
    .map(formalityIndex)
    .filter((n): n is number => n !== null);
  for (const item of items) {
    const idx = formalityIndex(item.formality);
    if (idx === null) {
      prefTotal += 0.6;
      continue;
    }
    if (item.formality && rule.preferredFormality.includes(item.formality)) {
      prefTotal += 1;
      continue;
    }
    if (prefIdxs.length === 0) {
      prefTotal += 0.7;
      continue;
    }
    const minDist = Math.min(...prefIdxs.map((p) => Math.abs(p - idx)));
    prefTotal += Math.max(0, 1 - minDist / 3);
  }
  const prefAvg = items.length > 0 ? prefTotal / items.length : 1;

  const withFormality = items.filter((i) => formalityIndex(i.formality) !== null);
  let consTotal = 0;
  let consCount = 0;
  for (let i = 0; i < withFormality.length; i++) {
    for (let j = i + 1; j < withFormality.length; j++) {
      const d = Math.abs(
        formalityIndex(withFormality[i].formality)! - formalityIndex(withFormality[j].formality)!,
      );
      consTotal += Math.max(0, 1 - d / 3);
      consCount++;
    }
  }
  const consAvg = consCount > 0 ? consTotal / consCount : 1;

  return 0.4 * consAvg + 0.6 * prefAvg;
}

function usageScore(items: OutfitScoringItem[], rule: ContextRule): number {
  let total = 0;
  for (const item of items) {
    if (item.usage.length === 0) {
      total += 0.6;
      continue;
    }
    const matches = item.usage.some((u) => rule.preferredUsage.includes(u));
    total += matches ? 1 : 0.2;
  }
  return items.length > 0 ? total / items.length : 1;
}

function passesHardFilters(item: OutfitScoringItem, rule: ContextRule): boolean {
  if (rule.hardExcludeUsage.some((u) => item.usage.includes(u))) return false;
  if (item.subcategory && rule.hardExcludeSubcategories.includes(item.subcategory)) return false;
  if (item.formality && rule.hardExcludeFormality.includes(item.formality)) return false;
  return true;
}

// ─── Personnalisation : saison, rotation, goûts ─────────────────────────────

/** Clé stable d'une paire de pièces, indépendante de l'ordre. */
export function itemPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

interface Personalization {
  currentSeason: WardrobeSeason | null;
  daysSinceWorn: ReadonlyMap<string, number>;
  likedPairs: ReadonlySet<string>;
  forgotten: ReadonlySet<string>;
}

const EMPTY_MAP: ReadonlyMap<string, number> = new Map();
const EMPTY_SET: ReadonlySet<string> = new Set();

/** Une pièce sans saison renseignée est considérée « de saison » (jamais exclue à tort). */
function isInSeason(item: OutfitScoringItem, season: WardrobeSeason | null): boolean {
  if (!season || item.seasons.length === 0) return true;
  return item.seasons.includes(season);
}

function itemSeasonFit(item: OutfitScoringItem, season: WardrobeSeason | null): number {
  if (!season) return 1;
  if (item.seasons.length === 0) return 0.8;
  return item.seasons.includes(season) ? 1 : 0.2;
}

function inSeasonScore(items: OutfitScoringItem[], p: Personalization): number {
  if (items.length === 0) return 1;
  return items.reduce((sum, i) => sum + itemSeasonFit(i, p.currentSeason), 0) / items.length;
}

/** 0 = portée aujourd'hui/hier, remonte à 1 au bout d'une semaine. */
function itemFreshness(item: OutfitScoringItem, p: Personalization): number {
  const days = p.daysSinceWorn.get(item.id);
  if (days === undefined) return 1;
  if (days <= 1) return 0;
  if (days <= 3) return 0.4;
  if (days <= 6) return 0.7;
  return 1;
}

function freshnessScore(items: OutfitScoringItem[], p: Personalization): number {
  if (items.length === 0) return 1;
  return items.reduce((sum, i) => sum + itemFreshness(i, p), 0) / items.length;
}

function affinityScore(items: OutfitScoringItem[], p: Personalization): number {
  if (p.likedPairs.size === 0 || items.length < 2) return 0;
  let liked = 0;
  let pairs = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs++;
      if (p.likedPairs.has(itemPairKey(items[i].id, items[j].id))) liked++;
    }
  }
  return pairs > 0 ? liked / pairs : 0;
}

/**
 * Écarte les pièces hors saison d'une catégorie SI elle a au moins une
 * alternative de saison — sinon on garde tout (le score pénalisera).
 */
function preferInSeason(list: OutfitScoringItem[], p: Personalization): OutfitScoringItem[] {
  if (!p.currentSeason) return list;
  const inSeason = list.filter((i) => isInSeason(i, p.currentSeason));
  return inSeason.length > 0 ? inSeason : list;
}

function singleItemScore(item: OutfitScoringItem, rule: ContextRule, p: Personalization): number {
  let s = 0;
  if (item.usage.length === 0) s += 0.5;
  else if (item.usage.some((u) => rule.preferredUsage.includes(u))) s += 1;
  else s += 0.1;

  const idx = formalityIndex(item.formality);
  if (idx === null) s += 0.5;
  else if (item.formality && rule.preferredFormality.includes(item.formality)) s += 1;
  else s += 0.3;

  s += itemSeasonFit(item, p.currentSeason) * 0.6;
  s += itemFreshness(item, p) * 0.8;
  if (p.forgotten.has(item.id)) s += 0.3;

  return s;
}

const CANDIDATE_CAP = 6;
const DEFAULT_MAX_RESULTS = 3;

function rankAndCap(
  list: OutfitScoringItem[],
  rule: ContextRule,
  p: Personalization,
): OutfitScoringItem[] {
  return [...preferInSeason(list, p)]
    .sort(
      (a, b) =>
        singleItemScore(b, rule, p) - singleItemScore(a, rule, p) || a.id.localeCompare(b.id),
    )
    .slice(0, CANDIDATE_CAP);
}

function pickBest(
  list: OutfitScoringItem[],
  rule: ContextRule,
  p: Personalization,
): OutfitScoringItem | null {
  const ranked = rankAndCap(list, rule, p);
  return ranked[0] ?? null;
}

function joinParts(parts: string[]): string {
  return parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

function buildExplanation(
  scores: OutfitScoreBreakdown,
  context: OutfitContext,
  forgottenCount: number,
  hasCurrentSeason: boolean,
): string {
  const parts: string[] = [];
  if (scores.affinity > 0) parts.push("une association que tu as aimée");
  if (scores.color >= 0.75) parts.push("palette cohérente");
  if (scores.formality >= 0.75) parts.push("niveau de formalité compatible");
  if (scores.usage >= 0.75) {
    parts.push(`pièces adaptées au contexte ${CONTEXT_RULES[context].label}`);
  }
  if (hasCurrentSeason && scores.inSeason >= 0.9) parts.push("pièces de saison");
  if (scores.pattern >= 0.9) parts.push("motifs sobres");
  if (!hasCurrentSeason && scores.season >= 0.9) parts.push("saisons compatibles");
  if (parts.length === 0) parts.push("combinaison possible mais perfectible");

  // On garde la phrase courte : au plus quatre arguments.
  const sentence = joinParts(parts.slice(0, 4));
  let text = sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
  if (forgottenCount > 0) {
    text +=
      forgottenCount > 1
        ? " Remet en avant des pièces oubliées."
        : " Remet en avant une pièce oubliée.";
  }
  return text;
}

/** Bonus maximal (en points) d'une tenue dont toutes les paires ont déjà été aimées. */
const AFFINITY_BONUS = 6;
/** Une tenue sans chaussures reste proposée, mais moins bien notée qu'une tenue complète. */
const CATEGORY_SCORE_WITHOUT_SHOES = 0.8;

function scoreCombo(
  pieces: OutfitScoringItem[],
  rule: ContextRule,
  context: OutfitContext,
  p: Personalization,
  missing: string[],
): GeneratedOutfit {
  const usage = usageScore(pieces, rule);
  const formality = formalityScore(pieces, rule);
  const color = colorCoherenceScore(pieces);
  const pattern = patternCoherenceScore(pieces);
  const season = seasonCoherenceScore(pieces);
  const inSeason = inSeasonScore(pieces, p);
  const freshness = freshnessScore(pieces, p);
  const affinity = affinityScore(pieces, p);
  const category = missing.length > 0 ? CATEGORY_SCORE_WITHOUT_SHOES : 1;

  const breakdown: OutfitScoreBreakdown = {
    category,
    usage,
    formality,
    color,
    pattern,
    season,
    inSeason,
    freshness,
    affinity,
  };
  const total =
    category * 15 +
    usage * 20 +
    formality * 15 +
    color * 20 +
    pattern * 8 +
    season * 4 +
    inSeason * 10 +
    freshness * 8 +
    affinity * AFFINITY_BONUS;
  const score = Math.round(Math.max(0, Math.min(100, total)));
  const forgottenItemIds = pieces.filter((i) => p.forgotten.has(i.id)).map((i) => i.id);

  return {
    items: pieces,
    score,
    breakdown,
    explanation: buildExplanation(
      breakdown,
      context,
      forgottenItemIds.length,
      p.currentSeason !== null,
    ),
    missing,
    forgottenItemIds,
  };
}

function comboKey(outfit: GeneratedOutfit): string {
  return [...outfit.items.map((i) => i.id)].sort().join("|");
}

function dedupeAndTake(combos: GeneratedOutfit[], n: number): GeneratedOutfit[] {
  const seen = new Set<string>();
  const result: GeneratedOutfit[] = [];
  for (const combo of combos) {
    const key = comboKey(combo);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(combo);
    if (result.length >= n) break;
  }
  return result;
}

function sortCombos(combos: GeneratedOutfit[]): GeneratedOutfit[] {
  return [...combos].sort((a, b) => b.score - a.score || comboKey(a).localeCompare(comboKey(b)));
}

const MISSING_LABELS: Record<string, string> = {
  top: "haut",
  bottom: "bas",
  shoes: "chaussures",
};

function buildMissingReason(missing: string[]): string {
  return `Pas assez de pièces compatibles dans ton dressing pour composer une tenue : il manque ${missing.join(", ")}.`;
}

function generateStandardOutfits(
  byCategory: Record<OutfitCategory, OutfitScoringItem[]>,
  rule: ContextRule,
  context: OutfitContext,
  anchor: OutfitScoringItem | null,
  maxResults: number,
  p: Personalization,
): GenerateOutfitsResult {
  let tops = rankAndCap(byCategory.top, rule, p);
  let bottoms = rankAndCap(byCategory.bottom, rule, p);
  let shoes = rankAndCap(byCategory.shoes, rule, p);

  if (anchor?.category === "top") tops = [anchor];
  if (anchor?.category === "bottom") bottoms = [anchor];
  if (anchor?.category === "shoes") shoes = [anchor];

  // Seuls un haut et un bas sont indispensables : sans chaussures, la tenue
  // est proposée quand même et signale ce qui la compléterait.
  const missing: string[] = [];
  if (tops.length === 0) missing.push(MISSING_LABELS.top);
  if (bottoms.length === 0) missing.push(MISSING_LABELS.bottom);
  if (missing.length > 0) {
    return { ok: false, reason: buildMissingReason(missing), missingCategories: missing };
  }
  const comboMissing = shoes.length === 0 ? [MISSING_LABELS.shoes] : [];
  const shoeOptions: Array<OutfitScoringItem | null> = shoes.length > 0 ? shoes : [null];

  const bestOuterwear =
    anchor?.category === "outerwear" ? anchor : pickBest(byCategory.outerwear, rule, p);
  const bestAccessory =
    anchor?.category === "accessory" ? anchor : pickBest(byCategory.accessory, rule, p);

  const combos: GeneratedOutfit[] = [];
  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoeOptions) {
        const pieces = [
          top,
          bottom,
          ...(shoe ? [shoe] : []),
          ...(bestOuterwear ? [bestOuterwear] : []),
          ...(bestAccessory ? [bestAccessory] : []),
        ];
        combos.push(scoreCombo(pieces, rule, context, p, comboMissing));
      }
    }
  }

  return { ok: true, outfits: dedupeAndTake(sortCombos(combos), maxResults) };
}

/** Cas particulier Baignade : un maillot une pièce couvre à lui seul haut+bas. */
function generateBaignadeOutfits(
  byCategory: Record<OutfitCategory, OutfitScoringItem[]>,
  rule: ContextRule,
  anchor: OutfitScoringItem | null,
  maxResults: number,
  p: Personalization,
): GenerateOutfitsResult {
  const swimTops = byCategory.top.filter((i) => i.usage.includes("baignade"));
  const swimBottoms = byCategory.bottom.filter((i) => i.usage.includes("baignade"));
  const onePieces = swimTops.filter((i) => i.subcategory === "maillot_une_piece");
  const bikiniTops = swimTops.filter((i) => i.subcategory !== "maillot_une_piece");

  const bestShoes = pickBest(byCategory.shoes, rule, p);
  const bestAccessory = pickBest(byCategory.accessory, rule, p);

  let bases: OutfitScoringItem[][] = [];
  for (const top of onePieces) bases.push([top]);
  for (const top of bikiniTops) {
    for (const bottom of swimBottoms) bases.push([top, bottom]);
  }

  if (anchor) {
    if (anchor.category === "top" || anchor.category === "bottom") {
      bases = bases.filter((base) => base.some((i) => i.id === anchor.id));
    }
    // Une ancre chaussures/accessoire ne restreint pas les bases (elle est
    // attachée à toutes les combinaisons via bestShoes/bestAccessory).
  }

  if (bases.length === 0) {
    const missing: string[] = [];
    if (onePieces.length === 0 && (bikiniTops.length === 0 || swimBottoms.length === 0)) {
      missing.push("tenue de bain complète (maillot)");
    }
    return {
      ok: false,
      reason: buildMissingReason(missing.length > 0 ? missing : ["tenue de bain"]),
      missingCategories: missing.length > 0 ? missing : ["baignade"],
    };
  }

  const combos = bases.map((base) =>
    scoreCombo(
      [...base, ...(bestShoes ? [bestShoes] : []), ...(bestAccessory ? [bestAccessory] : [])],
      rule,
      "baignade",
      p,
      [],
    ),
  );

  return { ok: true, outfits: dedupeAndTake(sortCombos(combos), maxResults) };
}

export interface GenerateOutfitsOptions {
  /** "Créer une tenue avec cette pièce" (§7) — filtre le moteur autour d'une pièce fixée. */
  anchorItemId?: string;
  maxResults?: number;
  /** Saison courante : écarte/pénalise les pièces hors saison. */
  currentSeason?: WardrobeSeason | null;
  /** Rotation : pièce → nombre de jours depuis son dernier port (0 = aujourd'hui). */
  daysSinceWorn?: ReadonlyMap<string, number>;
  /** Paires de pièces (`itemPairKey`) présentes dans des tenues aimées 👍. */
  likedPairs?: ReadonlySet<string>;
  /** Pièces oubliées, légèrement prioritaires. */
  forgottenItemIds?: ReadonlySet<string>;
  /** Pièces à ne pas utiliser (planning : pas deux fois la même pièce dans la semaine). */
  excludeItemIds?: ReadonlySet<string>;
}

/**
 * Génère jusqu'à `maxResults` tenues compatibles pour un contexte donné, à
 * partir UNIQUEMENT des pièces passées en entrée (jamais de pièce
 * hallucinée). Déterministe : mêmes pièces + même contexte + mêmes options
 * => mêmes tenues, mêmes scores, dans le même ordre.
 */
export function generateOutfits(
  allItems: OutfitScoringItem[],
  context: OutfitContext,
  options: GenerateOutfitsOptions = {},
): GenerateOutfitsResult {
  const rule = CONTEXT_RULES[context];
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const p: Personalization = {
    currentSeason: options.currentSeason ?? null,
    daysSinceWorn: options.daysSinceWorn ?? EMPTY_MAP,
    likedPairs: options.likedPairs ?? EMPTY_SET,
    forgotten: options.forgottenItemIds ?? EMPTY_SET,
  };
  const exclude = options.excludeItemIds ?? EMPTY_SET;

  const filtered = allItems.filter(
    (i) => passesHardFilters(i, rule) && (i.id === options.anchorItemId || !exclude.has(i.id)),
  );

  if (options.anchorItemId) {
    const anchorExists = filtered.some((i) => i.id === options.anchorItemId);
    if (!anchorExists) {
      return {
        ok: false,
        reason: "Cette pièce n'est pas disponible pour ce contexte.",
        missingCategories: [],
      };
    }
  }
  const anchor = options.anchorItemId
    ? (filtered.find((i) => i.id === options.anchorItemId) ?? null)
    : null;

  const byCategory: Record<OutfitCategory, OutfitScoringItem[]> = {
    top: filtered.filter((i) => i.category === "top"),
    bottom: filtered.filter((i) => i.category === "bottom"),
    outerwear: filtered.filter((i) => i.category === "outerwear"),
    shoes: filtered.filter((i) => i.category === "shoes"),
    accessory: filtered.filter((i) => i.category === "accessory"),
  };

  if (context === "baignade") {
    return generateBaignadeOutfits(byCategory, rule, anchor, maxResults, p);
  }
  return generateStandardOutfits(byCategory, rule, context, anchor, maxResults, p);
}
