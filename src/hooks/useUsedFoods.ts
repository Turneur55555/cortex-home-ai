import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FoodSuggestion } from "@/services/foodSuggestion";

interface UsedEntry {
  name: string;
  lastUsed: string;
  count: number;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
}

/**
 * Aliments déjà journalisés au moins une fois, triés par usage le plus
 * récent puis par fréquence — alimente l'onglet "Tous" de la bibliothèque
 * avant toute recherche (jamais de page vide, aucune saisie requise).
 *
 * N'inclut que les lignes avec un `base_*` /100g valide (seule référence
 * exploitable par WeightSelector/calculateNutritionFromGrams — cf.
 * lib/nutrition/weight.ts) : les entrées favoris/manuelles sans grammage
 * (base_* NULL) n'ont pas de quantité éditable et restent réservées à
 * l'onglet "Mes favoris".
 *
 * Agrégation côté client sur une fenêtre bornée (mêmes principes que
 * useNutritionHistory) plutôt qu'un chargement illimité de l'historique.
 */
type UsedRow = {
  name: string | null;
  base_calories: number | null;
  base_proteins: number | null;
  base_carbs: number | null;
  base_fats: number | null;
  created_at: string;
};

const USED_COLUMNS = "name, base_calories, base_proteins, base_carbs, base_fats, created_at";

/** Agrège des lignes `nutrition` (récentes d'abord) en aliments /100g uniques. */
function aggregateUsedFoods(rows: UsedRow[], resultLimit: number): FoodSuggestion[] {
  const map = new Map<string, UsedEntry>();
  for (const row of rows) {
    const name = (row.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    // Première occurrence rencontrée = la plus récente (tri desc côté requête).
    map.set(key, {
      name,
      lastUsed: row.created_at,
      count: 1,
      calories: row.base_calories,
      proteins: row.base_proteins,
      carbs: row.base_carbs,
      fats: row.base_fats,
    });
  }

  return Array.from(map.values())
    .sort((a, b) => {
      if (a.lastUsed !== b.lastUsed) return a.lastUsed > b.lastUsed ? -1 : 1;
      return b.count - a.count;
    })
    .slice(0, resultLimit)
    .map((e) => ({
      id: `used:${e.name.toLowerCase()}`,
      name: e.name,
      calories: e.calories,
      proteins: e.proteins,
      carbs: e.carbs,
      fats: e.fats,
      source: "custom" as const,
    }));
}

export function useUsedFoods(rowLimit = 1000, resultLimit = 60) {
  return useQuery({
    queryKey: ["used_foods", rowLimit, resultLimit],
    staleTime: 60_000,
    queryFn: async (): Promise<FoodSuggestion[]> => {
      const { data, error } = await supabase
        .from("nutrition")
        .select(USED_COLUMNS)
        .not("name", "is", null)
        .not("base_calories", "is", null)
        .order("created_at", { ascending: false })
        .limit(rowLimit);
      if (error) throw error;
      return aggregateUsedFoods(data ?? [], resultLimit);
    },
  });
}

/**
 * Recherche par nom dans TOUT l'historique (pas seulement la fenêtre récente
 * de `useUsedFoods`) : un aliment saisi il y a des mois reste retrouvable.
 * Requête bornée (200 lignes) filtrée côté base.
 */
export function useUsedFoodsSearch(query: string) {
  // On retire les caractères spéciaux du filtre ilike (%, _, virgule, parenthèses).
  const q = query
    .trim()
    .replace(/[%_,()\\]/g, " ")
    .trim();
  return useQuery({
    queryKey: ["used_foods_search", q.toLowerCase()],
    enabled: q.length >= 2,
    staleTime: 60_000,
    queryFn: async (): Promise<FoodSuggestion[]> => {
      const { data, error } = await supabase
        .from("nutrition")
        .select(USED_COLUMNS)
        .not("name", "is", null)
        .not("base_calories", "is", null)
        .ilike("name", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return aggregateUsedFoods(data ?? [], 30);
    },
  });
}
