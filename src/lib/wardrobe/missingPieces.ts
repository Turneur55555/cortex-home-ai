/**
 * Pièces manquantes (Dressing) — logique pure, zéro import React.
 *
 * « Qu'est-ce qui débloquerait le plus de tenues ? » Chaque suggestion est
 * déduite du dressing réel (catégories absentes, saison courante, usages non
 * couverts) et, quand c'est mesurable, chiffrée par le nombre de tenues
 * qu'elle complète. Aucune marque, aucun produit, aucun lien d'achat : on
 * décrit un type de pièce, jamais un article inventé.
 */
import { colorPairScore, type OutfitScoringItem } from "./outfitEngine";
import type { WardrobeSeason } from "./taxonomy";

export interface MissingPieceSuggestion {
  key:
    | "shoes"
    | "seasonal_bottom"
    | "outerwear"
    | "dressy_bottom"
    | "sport_top"
    | "accessory"
    | "swim";
  title: string;
  reason: string;
  /** Nombre de tenues complétées/débloquées, quand il est mesurable. */
  unlocks: number | null;
}

const SEASON_LABELS: Record<WardrobeSeason, string> = {
  printemps: "au printemps",
  ete: "en été",
  automne: "en automne",
  hiver: "en hiver",
};

/** Accord au féminin pluriel (« des sneakers blanches »). */
const SHOE_COLOR_LABELS: Record<string, string> = {
  blanc: "blanches",
  noir: "noires",
  beige: "beiges",
  marron: "marron",
};

function inSeason(item: OutfitScoringItem, season: WardrobeSeason | null): boolean {
  return !season || item.seasons.length === 0 || item.seasons.includes(season);
}

function isEverydayWearable(item: OutfitScoringItem): boolean {
  return !item.usage.includes("baignade");
}

/** Le neutre qui s'accorde le mieux, en moyenne, avec les hauts et les bas existants. */
function bestNeutralFor(pieces: OutfitScoringItem[]): string {
  const candidates = Object.keys(SHOE_COLOR_LABELS);
  let best = candidates[0];
  let bestScore = -1;
  for (const color of candidates) {
    const colored = pieces.filter((p) => p.primary_color);
    const score =
      colored.length === 0
        ? 0
        : colored.reduce((sum, p) => sum + colorPairScore(color, p.primary_color), 0) /
          colored.length;
    // Départage déterministe : ordre de `candidates` (blanc d'abord).
    if (score > bestScore + 1e-9) {
      best = color;
      bestScore = score;
    }
  }
  return best;
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Suggestions classées par impact (la première débloque le plus). Liste vide
 * si le dressing est vide : on n'invente pas de besoin sans aucune pièce.
 */
export function suggestMissingPieces(
  items: OutfitScoringItem[],
  season: WardrobeSeason | null,
): MissingPieceSuggestion[] {
  if (items.length === 0) return [];
  const suggestions: MissingPieceSuggestion[] = [];

  const tops = items.filter((i) => i.category === "top" && isEverydayWearable(i));
  const bottoms = items.filter((i) => i.category === "bottom" && isEverydayWearable(i));
  const seasonTops = tops.filter((i) => inSeason(i, season));
  const seasonBottoms = bottoms.filter((i) => inSeason(i, season));
  const has = (category: OutfitScoringItem["category"]) =>
    items.some((i) => i.category === category);

  if (!has("shoes")) {
    const color = bestNeutralFor([...tops, ...bottoms]);
    const combos = Math.max(seasonTops.length, 0) * Math.max(seasonBottoms.length, 0);
    suggestions.push({
      key: "shoes",
      title: `Des sneakers ${SHOE_COLOR_LABELS[color]}`,
      reason:
        combos > 0
          ? `Elles complètent tes ${plural(combos, "tenue", "tenues")} haut + bas et vont avec la majorité de tes couleurs.`
          : "Aucune paire dans ton dressing : c'est la pièce qui manque à toutes tes tenues.",
      unlocks: combos > 0 ? combos : null,
    });
  }

  if (season && seasonBottoms.length < 2 && bottoms.length > 0) {
    const cold = season === "automne" || season === "hiver";
    suggestions.push({
      key: "seasonal_bottom",
      title: cold ? "Un jean ou un chino" : "Un short ou un pantalon léger",
      reason: `Seulement ${plural(seasonBottoms.length, "bas portable", "bas portables")} ${SEASON_LABELS[season]} : chaque bas de saison ajoute ${plural(seasonTops.length, "tenue", "tenues")}.`,
      unlocks: seasonTops.length > 0 ? seasonTops.length : null,
    });
  }

  if (!has("outerwear") && (season === null || season === "automne" || season === "hiver")) {
    suggestions.push({
      key: "outerwear",
      title: "Une veste ou un manteau",
      reason: season
        ? `Aucune veste dans ton dressing : la superposition qui manque ${SEASON_LABELS[season]}.`
        : "Aucune veste dans ton dressing : la pièce qui structure une tenue.",
      unlocks: null,
    });
  }

  const dressyBottom = bottoms.some(
    (i) =>
      i.formality === "smart_casual" || i.formality === "formal" || i.usage.includes("habille"),
  );
  if (!dressyBottom && bottoms.length > 0) {
    suggestions.push({
      key: "dressy_bottom",
      title: "Un chino ou un pantalon habillé",
      reason: "Tous tes bas sont décontractés : il en faut un plus habillé pour Travail et Soirée.",
      unlocks: null,
    });
  }

  if (!tops.some((i) => i.usage.includes("sport"))) {
    suggestions.push({
      key: "sport_top",
      title: "Un t-shirt de sport",
      reason: "Aucun haut tagué Sport : tes tenues de sport empruntent des pièces du quotidien.",
      unlocks: null,
    });
  }

  if (!has("accessory")) {
    suggestions.push({
      key: "accessory",
      title: "Une ceinture ou une montre",
      reason: "Aucun accessoire : la touche finale qui s'ajoute à toutes tes tenues.",
      unlocks: null,
    });
  }

  if (!items.some((i) => i.usage.includes("baignade"))) {
    suggestions.push({
      key: "swim",
      title: "Un short de bain ou un maillot",
      reason: "Débloque le contexte Baignade, aujourd'hui impossible.",
      unlocks: null,
    });
  }

  return suggestions;
}
