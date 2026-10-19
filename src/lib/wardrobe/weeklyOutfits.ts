/**
 * Mes tenues de la semaine (Dressing) — logique pure, zéro import React.
 *
 * Le planning n'est JAMAIS stocké : il se recalcule à chaque lecture à partir
 * du dressing, de l'historique de port et de deux préférences légères par
 * jour (contexte choisi, nombre de « Autre tenue » demandés). Conséquences :
 *   - un jour porté affiche la tenue réellement portée (source : `outfits`) ;
 *   - un jour passé sans tenue notée reste vide, il ne « consomme » aucune pièce ;
 *   - aujourd'hui et les jours suivants reçoivent une tenue générée, sans
 *     répéter un haut ou un bas déjà prévu/porté plus tôt dans la semaine
 *     (chaussures, vestes et accessoires peuvent revenir, comme en vrai).
 * Déterministe : mêmes entrées => même semaine.
 */
import { addDaysYMD } from "@/lib/dates";
import {
  generateOutfits,
  isOutfitContext,
  type GenerateOutfitsOptions,
  type GeneratedOutfit,
  type OutfitContext,
  type OutfitScoringItem,
} from "./outfitEngine";
import { daysBetween, type WornOutfit } from "./wearHistory";

/** Taille du réservoir de tenues par jour, pour « Autre tenue ». */
export const WEEK_DAY_POOL_SIZE = 9;

export interface WeekDayPreference {
  context?: OutfitContext;
  /** Nombre d'appuis sur « Autre tenue » — sélectionne la tenue suivante du réservoir. */
  reroll?: number;
}

export type WeekDayStatus = "worn" | "planned" | "missed" | "unavailable";

export interface WeekDayPlan {
  date: string;
  context: OutfitContext;
  status: WeekDayStatus;
  isToday: boolean;
  /** Tenue générée (statut `planned`). */
  outfit: GeneratedOutfit | null;
  /** Tenue réellement portée (statut `worn`). */
  worn: WornOutfit | null;
  /** Nombre de tenues différentes disponibles pour ce jour. */
  poolSize: number;
  /** Raison lisible quand aucune tenue n'est possible (`unavailable`). */
  reason: string | null;
}

export interface PlanWeekInput {
  weekStart: string;
  today: string;
  items: OutfitScoringItem[];
  history: WornOutfit[];
  preferences: Record<string, WeekDayPreference>;
  defaultContext?: OutfitContext;
  /** Saison, goûts, oubliées… — mêmes options que la génération simple. */
  engineOptions?: Omit<GenerateOutfitsOptions, "excludeItemIds" | "maxResults" | "anchorItemId">;
}

const NO_REPEAT_CATEGORIES = new Set<OutfitScoringItem["category"]>(["top", "bottom"]);

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysYMD(weekStart, i));
}

/** Clé haut|bas d'une liste de pièces — deux jours ne portent jamais la même association. */
function baseComboKey(ids: string[], categoryById: Map<string, OutfitScoringItem["category"]>) {
  return ids
    .filter((id) => {
      const category = categoryById.get(id);
      return category !== undefined && NO_REPEAT_CATEGORIES.has(category);
    })
    .sort()
    .join("|");
}

export function planWeek(input: PlanWeekInput): WeekDayPlan[] {
  const categoryById = new Map(input.items.map((i) => [i.id, i.category]));
  const season = input.engineOptions?.currentSeason ?? null;
  const used = new Set<string>();
  const usedCombos = new Set<string>();
  /** Pièce → dernier jour de la semaine où elle est prévue/portée. */
  const lastPlanned = new Map<string, string>();
  const markUsed = (ids: string[], date: string) => {
    for (const id of ids) {
      const category = categoryById.get(id);
      if (category && NO_REPEAT_CATEGORIES.has(category)) used.add(id);
      lastPlanned.set(id, date);
    }
    usedCombos.add(baseComboKey(ids, categoryById));
  };

  /**
   * Pièces à exclure pour ce jour : les hauts/bas déjà prévus, catégorie par
   * catégorie, TANT QU'il reste une pièce de saison non utilisée dans cette
   * catégorie. Sinon on autorise la répétition : mieux vaut remettre un
   * pantalon de saison que proposer un short en octobre.
   */
  const exclusionFor = (): Set<string> => {
    const exclude = new Set<string>();
    for (const category of NO_REPEAT_CATEGORIES) {
      const fresh = input.items.some(
        (i) =>
          i.category === category &&
          !used.has(i.id) &&
          (!season || i.seasons.length === 0 || i.seasons.includes(season)),
      );
      if (!fresh) continue;
      for (const id of used) if (categoryById.get(id) === category) exclude.add(id);
    }
    return exclude;
  };

  /**
   * Rotation vue depuis `date` : l'historique réel (décalé du nombre de jours
   * entre aujourd'hui et `date`) puis les jours déjà prévus plus tôt dans la
   * semaine — une pièce prévue mardi recule mercredi, comme si elle était portée.
   */
  const daysSinceWornFrom = (date: string): Map<string, number> => {
    const offset = Math.max(0, daysBetween(input.today, date));
    const map = new Map<string, number>();
    for (const [id, days] of input.engineOptions?.daysSinceWorn ?? []) map.set(id, days + offset);
    for (const [id, planned] of lastPlanned) {
      const days = daysBetween(planned, date);
      const prev = map.get(id);
      if (prev === undefined || days < prev) map.set(id, days);
    }
    return map;
  };

  const wornByDate = new Map<string, WornOutfit>();
  for (const outfit of [...input.history].sort((a, b) => b.wornAt.localeCompare(a.wornAt))) {
    // La tenue la plus récente du jour fait foi.
    if (!wornByDate.has(outfit.date)) wornByDate.set(outfit.date, outfit);
  }

  return weekDates(input.weekStart).map((date): WeekDayPlan => {
    const pref = input.preferences[date] ?? {};
    const worn = wornByDate.get(date) ?? null;
    const wornContext = isOutfitContext(worn?.occasion) ? worn.occasion : undefined;
    const context = pref.context ?? wornContext ?? input.defaultContext ?? "quotidien";
    const isToday = date === input.today;
    const base = { date, context, isToday, outfit: null, worn: null, poolSize: 0, reason: null };

    if (worn) {
      markUsed(worn.itemIds, date);
      return { ...base, status: "worn", worn };
    }
    if (date < input.today) return { ...base, status: "missed" };

    const options = {
      ...input.engineOptions,
      daysSinceWorn: daysSinceWornFrom(date),
      maxResults: WEEK_DAY_POOL_SIZE,
    };
    let result = generateOutfits(input.items, context, {
      ...options,
      excludeItemIds: exclusionFor(),
    });
    // Pas assez de pièces pour ne rien répéter : on accepte une répétition
    // plutôt que de laisser un jour sans tenue.
    if (!result.ok) result = generateOutfits(input.items, context, options);
    if (!result.ok || result.outfits.length === 0) {
      return {
        ...base,
        status: "unavailable",
        reason: result.ok ? "Aucune tenue possible pour ce contexte." : result.reason,
      };
    }

    // Jamais deux fois la même association haut + bas dans la semaine (sauf
    // dressing trop petit pour l'éviter).
    const unseen = result.outfits.filter(
      (o) =>
        !usedCombos.has(
          baseComboKey(
            o.items.map((i) => i.id),
            categoryById,
          ),
        ),
    );
    const pool = unseen.length > 0 ? unseen : result.outfits;
    const reroll = Math.max(0, Math.floor(pref.reroll ?? 0));
    const outfit = pool[reroll % pool.length];
    markUsed(
      outfit.items.map((i) => i.id),
      date,
    );
    return { ...base, status: "planned", outfit, poolSize: pool.length };
  });
}
