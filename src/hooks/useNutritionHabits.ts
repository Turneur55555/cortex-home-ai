import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { addDaysYMD, localDateYMD } from "@/lib/dates";
import {
  computeHabitualMeals,
  computeTypicalGrams,
  NUTRITION_HISTORY_COLUMNS,
  type HabitualMeals,
  type NutritionHistoryRow,
} from "@/lib/nutrition/habits";

/**
 * Habitudes alimentaires (repas habituel par créneau, quantité habituelle par
 * aliment), dérivées de l'historique récent du journal — voir
 * `lib/nutrition/habits.ts`. Rien n'est stocké : tout se recalcule à la
 * lecture.
 *
 * Lecture serveur, comme `useUsedFoods` : le store local ne contient que les
 * journées déjà ouvertes sur l'appareil, pas l'historique. Hors connexion, la
 * dernière réponse reste en cache ; sans elle, l'app propose simplement
 * l'ajout manuel (aucune suggestion inventée).
 */

/** Fenêtre d'historique : assez large pour un repas peu saisi (le dîner : 7 jours sur 60). */
export const HABITS_WINDOW_DAYS = 90;
/**
 * Plafond de lecture (invariant 4.1). Tri du plus récent au plus ancien : un
 * historique plus dense que le plafond perd ses jours les PLUS ANCIENS, jamais
 * l'habitude récente — c'est elle seule que le calcul regarde.
 */
const HABITS_READ_LIMIT = 1000;

export const NUTRITION_HABITS_KEY = ["nutrition_habits"] as const;

export function useNutritionHabitsHistory() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: [...NUTRITION_HABITS_KEY, userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<NutritionHistoryRow[]> => {
      if (!userId) return [];
      const from = addDaysYMD(localDateYMD(), -HABITS_WINDOW_DAYS);
      const { data, error } = await supabase
        .from("nutrition")
        .select(NUTRITION_HISTORY_COLUMNS)
        .eq("user_id", userId)
        .gte("date", from)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(HABITS_READ_LIMIT);
      if (error) throw error;
      return (data ?? []) as unknown as NutritionHistoryRow[];
    },
  });
}

/**
 * Repas habituels pour la journée `date` (cette journée est exclue du calcul :
 * ce qu'on y a déjà saisi n'est pas une habitude pour elle-même) et quantités
 * habituelles des aliments.
 */
export function useNutritionHabits(date: string): {
  habitualMeals: HabitualMeals;
  typicalGrams: ReadonlyMap<string, number>;
} {
  const { data } = useNutritionHabitsHistory();
  const habitualMeals = useMemo(
    () => computeHabitualMeals(data ?? [], { excludeDate: date }),
    [data, date],
  );
  const typicalGrams = useMemo(() => computeTypicalGrams(data ?? []), [data]);
  return { habitualMeals, typicalGrams };
}

/** Quantités habituelles seules (bibliothèque d'aliments, saisie manuelle). */
export function useTypicalGrams(): ReadonlyMap<string, number> {
  const { data } = useNutritionHabitsHistory();
  return useMemo(() => computeTypicalGrams(data ?? []), [data]);
}
