import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { addDaysYMD, localDateYMD } from "@/lib/dates";
import { createExclusiveRunner } from "@/lib/exclusiveByKey";
import { getIsOnline } from "@/lib/offline/networkStatus";
import { OFFLINE_FIRST_QUERY_OPTIONS } from "@/lib/offline/offlineQuery";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";

// ============================================================
// Nutrition — la « journée bouclée », offline-first.
//
// Table `nutrition_day_closures` (migration 20261101120000) : une ligne = la
// journée `date` est bouclée (« j'ai fini pour aujourd'hui »). Rouvrir la
// journée = supprimer ses lignes. La complétude d'une journée (bouclée OU
// dîner saisi) se dérive à la lecture, dans `lib/nutrition/dayCompletion.ts`.
//
// Aucune contrainte UNIQUE (user_id, date) en base, volontairement (voir la
// migration) : un doublon entre deux appareils est sans conséquence, « au
// moins une ligne » suffit. L'écriture ci-dessous n'en crée pas quand une
// ligne existe déjà localement.
// ============================================================

export interface NutritionDayClosureRow {
  id: string;
  user_id: string;
  date: string;
  created_at: string;
  updated_at: string;
}

const closuresRepo = createOfflineRepository<NutritionDayClosureRow>("nutrition_day_closures");

export const NUTRITION_DAY_CLOSURES_KEY = ["nutrition_day_closures"] as const;

/** Fenêtre relue au serveur : bien plus que ce qu'affiche l'app (30 j d'historique, 90 j de TDEE). */
const CLOSURE_WINDOW_DAYS = 400;
/** Plafond de lecture (invariant 4.1) — au plus une ligne par jour de la fenêtre, doublons compris. */
const CLOSURE_READ_LIMIT = 1000;

async function refreshClosuresFromServer(userId: string): Promise<void> {
  if (!getIsOnline()) return;
  const from = addDaysYMD(localDateYMD(), -CLOSURE_WINDOW_DAYS);
  try {
    const { data, error, count } = await supabase
      .from("nutrition_day_closures")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .gte("date", from)
      .order("date", { ascending: false })
      .order("id")
      .limit(CLOSURE_READ_LIMIT);
    if (error || !data) return;
    // Réconciliation (une journée rouverte sur un autre appareil doit le
    // rester ici) UNIQUEMENT si la lecture est prouvée complète : jamais
    // déduite d'une page plus courte que demandée (invariant 4.1).
    const complete = count != null && count === data.length;
    await hydrateEntitiesFromServer(
      "nutrition_day_closures",
      userId,
      data as NutritionDayClosureRow[],
      complete ? { reconcileWithin: (row) => row.date >= from } : undefined,
    );
  } catch {
    // Hors ligne ou erreur réseau : on continue avec le store local.
  }
}

/** Les dates bouclées, triées (les plus récentes d'abord). */
export function useNutritionDayClosures() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    ...OFFLINE_FIRST_QUERY_OPTIONS,
    queryKey: [...NUTRITION_DAY_CLOSURES_KEY, userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      if (!userId) return [];
      await refreshClosuresFromServer(userId);
      const rows = await closuresRepo.list(userId);
      return [...new Set(rows.map((r) => r.date))].sort().reverse();
    },
  });
}

/** Les dates bouclées, en ensemble — pour `completeDates`/`dayCompletion`. */
export function useClosedNutritionDates(): {
  closedDates: ReadonlySet<string>;
  isLoading: boolean;
} {
  const { data, isLoading } = useNutritionDayClosures();
  const closedDates = useMemo(() => new Set(data ?? []), [data]);
  return { closedDates, isLoading };
}

/**
 * Une écriture de clôture à la fois, par utilisateur : « lire les lignes du
 * jour, décider, écrire » sans exclusion laisserait deux appuis rapprochés
 * créer deux lignes. Le doublon serait toléré, mais autant ne pas le fabriquer.
 */
const runClosureWriteExclusively = createExclusiveRunner();

/** Boucle (`closed = true`) ou rouvre une journée. Toujours locale d'abord. */
export async function writeNutritionDayClosure(
  userId: string,
  date: string,
  closed: boolean,
): Promise<"created" | "removed" | "noop"> {
  return runClosureWriteExclusively(userId, async () => {
    const rows = (await closuresRepo.list(userId)).filter((r) => r.date === date);
    if (closed) {
      if (rows.length > 0) return "noop";
      await closuresRepo.create(userId, { date });
      return "created";
    }
    if (rows.length === 0) return "noop";
    for (const r of rows) await closuresRepo.remove(r.id, userId);
    return "removed";
  });
}

export function useSetNutritionDayClosed() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ date, closed }: { date: string; closed: boolean }) => {
      if (!user) throw new Error("Non authentifié");
      return writeNutritionDayClosure(user.id, date, closed);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NUTRITION_DAY_CLOSURES_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
