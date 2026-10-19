/**
 * Dressing — tout ce qui se lit dans l'historique de port et les avis 👍 :
 * rotation, goûts, pièces oubliées, pièces manquantes, journal de style et
 * planning de la semaine. Ce fichier ne fait que LIRE Supabase et brancher
 * les fonctions pures de `src/lib/wardrobe/` (aucune règle métier ici).
 *
 * Toutes les lectures sont bornées (`limit`) : l'historique couvre une
 * fenêtre glissante de `HISTORY_WINDOW_DAYS` jours, plafonnée à
 * `HISTORY_MAX_ROWS` tenues — largement au-delà d'une tenue par jour.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useLocalToday } from "@/hooks/useLocalToday";
import { useWardrobeItems, type WardrobeItemView } from "@/hooks/useWardrobe";
import { mapWardrobeItemToScoringItem } from "@/hooks/useOutfitGenerator";
import { addDaysYMD, localWeekStartYMD } from "@/lib/dates";
import type { GenerateOutfitsOptions, OutfitScoringItem } from "@/lib/wardrobe/outfitEngine";
import { seasonForDate, type WardrobeSeason } from "@/lib/wardrobe/taxonomy";
import {
  daysSinceWornMap,
  findForgottenItems,
  likedPairsFrom,
  wornDateOf,
  type WornOutfit,
} from "@/lib/wardrobe/wearHistory";
import { suggestMissingPieces, type MissingPieceSuggestion } from "@/lib/wardrobe/missingPieces";
import { planWeek, type WeekDayPlan, type WeekDayPreference } from "@/lib/wardrobe/weeklyOutfits";

export const HISTORY_WINDOW_DAYS = 120;
export const HISTORY_MAX_ROWS = 300;
const LIKED_MAX_ROWS = 300;

interface OutfitHistoryRow {
  id: string;
  occasion: string | null;
  score: number | null;
  worn_at: string | null;
  outfit_items: Array<{ wardrobe_item_id: string; position: number | null }> | null;
}

export function mapHistoryRow(row: OutfitHistoryRow): WornOutfit | null {
  if (!row.worn_at) return null;
  const itemIds = [...(row.outfit_items ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((i) => i.wardrobe_item_id);
  return {
    id: row.id,
    wornAt: row.worn_at,
    date: wornDateOf(row.worn_at),
    occasion: row.occasion,
    score: row.score,
    itemIds,
  };
}

/** Tenues portées sur la fenêtre glissante, de la plus récente à la plus ancienne. */
export function useOutfitHistory() {
  const { user } = useAuth();
  const today = useLocalToday();

  return useQuery({
    queryKey: ["outfit-history", user?.id, today],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<WornOutfit[]> => {
      const since = new Date(`${addDaysYMD(today, -HISTORY_WINDOW_DAYS)}T00:00:00`).toISOString();
      const { data, error } = await supabase
        .from("outfits")
        .select("id, occasion, score, worn_at, outfit_items(wardrobe_item_id, position)")
        .eq("user_id", user!.id)
        .not("worn_at", "is", null)
        .gte("worn_at", since)
        .order("worn_at", { ascending: false })
        .order("id")
        .limit(HISTORY_MAX_ROWS);
      if (error) throw error;
      return ((data ?? []) as OutfitHistoryRow[])
        .map(mapHistoryRow)
        .filter((o): o is WornOutfit => o !== null);
    },
  });
}

interface LikedRow {
  outfits: { outfit_items: Array<{ wardrobe_item_id: string }> | null } | null;
}

/** Pièces de chaque tenue aimée 👍 (les plus récentes d'abord). */
export function useLikedOutfitItems() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["outfit-liked", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<string[][]> => {
      const { data, error } = await supabase
        .from("outfit_feedback")
        .select("outfits(outfit_items(wardrobe_item_id))")
        .eq("user_id", user!.id)
        .eq("liked", true)
        .order("updated_at", { ascending: false })
        .order("id")
        .limit(LIKED_MAX_ROWS);
      if (error) throw error;
      return ((data ?? []) as unknown as LikedRow[])
        .map((row) => (row.outfits?.outfit_items ?? []).map((i) => i.wardrobe_item_id))
        .filter((ids) => ids.length > 1);
    },
  });
}

export interface WardrobePersonalization {
  today: string;
  season: WardrobeSeason;
  items: WardrobeItemView[];
  scoringItems: OutfitScoringItem[];
  history: WornOutfit[];
  /** Options du moteur : saison, rotation, goûts, oubliées. */
  engineOptions: GenerateOutfitsOptions;
  forgottenItemIds: string[];
  suggestions: MissingPieceSuggestion[];
  isLoading: boolean;
  isError: boolean;
}

/**
 * Point d'entrée unique de la personnalisation : dressing + historique + 👍.
 * Si l'historique ou les avis ne se chargent pas, on génère quand même
 * (sans rotation/goûts) — ce sont des bonus, jamais une condition.
 */
export function useWardrobePersonalization(): WardrobePersonalization {
  const today = useLocalToday();
  const wardrobe = useWardrobeItems();
  const history = useOutfitHistory();
  const liked = useLikedOutfitItems();

  const items = useMemo(() => wardrobe.data ?? [], [wardrobe.data]);
  const historyData = useMemo(() => history.data ?? [], [history.data]);

  return useMemo(() => {
    const season = seasonForDate(today);
    const scoringItems = items
      .map(mapWardrobeItemToScoringItem)
      .filter((i): i is OutfitScoringItem => i !== null);
    const forgottenItemIds = findForgottenItems(items, historyData, today);
    const engineOptions: GenerateOutfitsOptions = {
      currentSeason: season,
      daysSinceWorn: daysSinceWornMap(historyData, today),
      likedPairs: likedPairsFrom(liked.data ?? []),
      forgottenItemIds: new Set(forgottenItemIds),
    };
    return {
      today,
      season,
      items,
      scoringItems,
      history: historyData,
      engineOptions,
      forgottenItemIds,
      suggestions: suggestMissingPieces(scoringItems, season),
      isLoading: wardrobe.isLoading,
      isError: wardrobe.isError,
    };
  }, [today, items, historyData, liked.data, wardrobe.isLoading, wardrobe.isError]);
}

// ─── Mes tenues de la semaine ───────────────────────────────────────────────

const PREFS_KEY_PREFIX = "cortex:dressing-week:";

function readPreferences(weekStart: string): Record<string, WeekDayPreference> {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY_PREFIX + weekStart);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, WeekDayPreference>)
      : {};
  } catch {
    return {};
  }
}

function writePreferences(weekStart: string, prefs: Record<string, WeekDayPreference>) {
  try {
    window.localStorage.setItem(PREFS_KEY_PREFIX + weekStart, JSON.stringify(prefs));
  } catch {
    // Navigation privée / stockage plein : la préférence vit le temps de la session.
  }
}

/**
 * Préférences de la semaine (contexte du jour, « Autre tenue ») — confort
 * local à l'appareil, jamais une donnée métier : perdues, le planning reste
 * valide (contexte Quotidien, première tenue du réservoir).
 */
function useWeekPreferences(weekStart: string) {
  const [state, setState] = useState(() => ({ weekStart, prefs: readPreferences(weekStart) }));
  const prefs = state.weekStart === weekStart ? state.prefs : readPreferences(weekStart);

  const update = useCallback(
    (date: string, patch: WeekDayPreference) => {
      setState((prev) => {
        const base = prev.weekStart === weekStart ? prev.prefs : readPreferences(weekStart);
        const next = { ...base, [date]: { ...base[date], ...patch } };
        writePreferences(weekStart, next);
        return { weekStart, prefs: next };
      });
    },
    [weekStart],
  );

  return { prefs, update };
}

export interface WeeklyOutfits {
  weekStart: string;
  today: string;
  days: WeekDayPlan[];
  personalization: WardrobePersonalization;
  setDayContext: (date: string, context: WeekDayPreference["context"]) => void;
  rerollDay: (date: string) => void;
}

export function useWeeklyOutfits(): WeeklyOutfits {
  const personalization = useWardrobePersonalization();
  const { today, scoringItems, history, engineOptions } = personalization;
  const weekStart = localWeekStartYMD(new Date(`${today}T12:00:00`));
  const { prefs, update } = useWeekPreferences(weekStart);

  const days = useMemo(
    () =>
      planWeek({
        weekStart,
        today,
        items: scoringItems,
        history,
        preferences: prefs,
        engineOptions,
      }),
    [weekStart, today, scoringItems, history, prefs, engineOptions],
  );

  const setDayContext = useCallback(
    (date: string, context: WeekDayPreference["context"]) => update(date, { context, reroll: 0 }),
    [update],
  );
  const rerollDay = useCallback(
    (date: string) => update(date, { reroll: (prefs[date]?.reroll ?? 0) + 1 }),
    [update, prefs],
  );

  return { weekStart, today, days, personalization, setDayContext, rerollDay };
}
