import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useLocalToday } from "@/hooks/useLocalToday";
import {
  exerciseSetsRepo,
  exercisesRepo,
  refreshWorkoutsFromServer,
  workoutsRepo,
} from "@/hooks/use-fitness";
import { getIsOnline } from "@/lib/offline/networkStatus";
import { OFFLINE_FIRST_QUERY_OPTIONS } from "@/lib/offline/offlineQuery";
import { fetchAllRowsForIds } from "@/lib/supabase/pagedRead";
import {
  buildStrengthCard,
  strengthWindowStart,
  type StrengthCard,
} from "@/lib/fitness/rpg/strengthCard";

const CATEGORY_CACHE_PREFIX = "cortex.referenceCategories.v1:";

function readCategoryCache(userId: string): Record<string, string | null> {
  try {
    const raw = localStorage.getItem(CATEGORY_CACHE_PREFIX + userId);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string | null>) : {};
  } catch {
    return {};
  }
}

function writeCategoryCache(userId: string, map: Record<string, string | null>) {
  try {
    localStorage.setItem(CATEGORY_CACHE_PREFIX + userId, JSON.stringify(map));
  } catch {
    // Stockage indisponible : la carte retombe sur le classement par nom hors ligne.
  }
}

interface LocalStrengthData {
  workouts: Awaited<ReturnType<typeof workoutsRepo.list>>;
  exercises: Awaited<ReturnType<typeof exercisesRepo.list>>;
  sets: Awaited<ReturnType<typeof exerciseSetsRepo.list>>;
}

/**
 * La carte de force de l'Accueil (`lib/fitness/rpg/strengthCard.ts`).
 *
 * - Les séances viennent du STORE LOCAL (offline-first) : les 200 séances les plus récentes y sont
 *   hydratées avec leurs exercices et séries, ce qui couvre la fenêtre de 6 mois de la carte. La
 *   carte s'affiche donc hors connexion, en salle.
 * - Le groupe musculaire vient du référentiel (`exercise_reference.category`), lu UNE fois pour les
 *   seules références que le joueur utilise (lecture paginée bornée, INVARIANTS §4.1) et gardé en
 *   cache local : hors connexion, le dernier classement connu sert ; sans aucun cache, la règle
 *   retombe sur les mots-clés du nom.
 */
export function useStrengthCard(): { isLoading: boolean; card: StrengthCard | null } {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const today = useLocalToday();

  const local = useQuery({
    ...OFFLINE_FIRST_QUERY_OPTIONS,
    queryKey: ["fitness", "strength_card", userId],
    enabled: !!userId,
    queryFn: async (): Promise<LocalStrengthData> => {
      await refreshWorkoutsFromServer(userId!);
      const [workouts, exercises, sets] = await Promise.all([
        workoutsRepo.list(userId!),
        exercisesRepo.list(userId!),
        exerciseSetsRepo.list(userId!),
      ]);
      return { workouts, exercises, sets };
    },
  });

  const referenceIds = useMemo(() => {
    if (!local.data) return [] as string[];
    const from = strengthWindowStart(today);
    const inWindow = new Set(
      local.data.workouts.filter((w) => w.date >= from && w.date <= today).map((w) => w.id),
    );
    const ids = new Set<string>();
    for (const ex of local.data.exercises) {
      if (inWindow.has(ex.workout_id) && ex.exercise_reference_id) {
        ids.add(ex.exercise_reference_id);
      }
    }
    return [...ids].sort();
  }, [local.data, today]);

  const categories = useQuery({
    queryKey: ["fitness", "reference_categories", userId, referenceIds.join(",")],
    enabled: !!userId && referenceIds.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
    networkMode: "always",
    queryFn: async (): Promise<Record<string, string | null>> => {
      const cached = readCategoryCache(userId!);
      if (!getIsOnline()) return cached;
      try {
        const rows = await fetchAllRowsForIds<{ id: string; category: string | null }>(
          referenceIds,
          (chunk) =>
            supabase
              .from("exercise_reference")
              .select("id, category", { count: "exact" })
              .in("id", chunk)
              .order("id"),
          { label: "exercise_reference (catégories de la carte)" },
        );
        const merged = { ...cached };
        for (const r of rows) merged[r.id] = r.category;
        writeCategoryCache(userId!, merged);
        return merged;
      } catch {
        return cached;
      }
    },
  });

  const card = useMemo(() => {
    if (!local.data) return null;
    const categoryMap = new Map<string, string | null>(
      Object.entries(categories.data ?? (userId ? readCategoryCache(userId) : {})),
    );
    return buildStrengthCard({
      workouts: local.data.workouts,
      exercises: local.data.exercises,
      sets: local.data.sets,
      categoryByReferenceId: categoryMap,
      todayDate: today,
    });
  }, [local.data, categories.data, userId, today]);

  return { isLoading: local.isLoading, card };
}
