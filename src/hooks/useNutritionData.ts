import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { logActivity } from "@/lib/activity";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";
import { getIsOnline } from "@/lib/offline/networkStatus";

const supabase = supabaseTyped as any;

/**
 * CRUD du Journal Nutrition (react-query) — offline-first (cf.
 * src/lib/offline/), même pattern que `useRecipes.ts`/`use-nutrition-
 * favorites.ts` : lecture/écriture toujours locales (IndexedDB) d'abord,
 * synchronisation vers Supabase en arrière-plan via la sync queue. Le champ
 * `recipe_id` (FK vers `recipes`, elle-même offline) est conservé tel quel
 * dans le patch/insert sans résolution bloquante côté client — une entrée
 * journal référençant une recette pas encore synchronisée reste cohérente
 * localement, la FK réelle se vérifie côté serveur à la synchronisation.
 */

/**
 * Colonnes présentes en base (projet bcwfvpwxzlmkxobvbtzp) mais absentes du
 * `types.ts` généré (dérive documentée, cf. src/integrations/supabase/db.ts).
 */
export type NutritionRow = Tables<"nutrition"> & {
  updated_at?: string | null;
  recipe_id?: string | null;
};

/** Insert journal nutrition — `recipe_id` inclus (voir NutritionRow). */
export type NutritionInsert = Omit<TablesInsert<"nutrition">, "user_id"> & {
  recipe_id?: string | null;
};

const nutritionRepo = createOfflineRepository<NutritionRow>("nutrition");

export function useNutrition(date: string) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["nutrition", date],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<NutritionRow[]> => {
      if (!userId) return [];
      if (getIsOnline()) {
        try {
          const { data, error } = await supabase
            .from("nutrition")
            .select("*")
            .eq("user_id", userId)
            .eq("date", date)
            .order("created_at", { ascending: true });
          if (!error && data) {
            await hydrateEntitiesFromServer("nutrition", userId, data as NutritionRow[]);
          }
        } catch {
          // Hors ligne ou erreur réseau : on continue avec le store local.
        }
      }
      const local = await nutritionRepo.list(userId);
      return local
        .filter((r) => r.date === date)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
  });
}

/**
 * Journaux nutrition sur une plage de dates (inclusive) — utilisé par le
 * moteur TDEE observé (lib/fitness/adaptiveTdee.ts) pour mesurer la
 * couverture nutritionnelle sur plusieurs semaines. Laissée volontairement
 * en ligne uniquement (pas de repository offline) : ce moteur analyse des
 * tendances sur plusieurs semaines et n'a de sens qu'avec les données
 * effectivement synchronisées côté serveur — un calcul TDEE sur un sous-
 * ensemble local partiel/pas encore réconcilié serait trompeur. Ne réutilise
 * pas `useNutrition` (une seule date) : une requête par plage évite N
 * allers-retours. Ne récupère que les colonnes nécessaires au moteur.
 */
export function useNutritionRange(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["nutrition_range", startDate, endDate],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition")
        .select("date, calories")
        .gte("date", startDate)
        .lte("date", endDate);
      if (error) throw error;
      return data;
    },
  });
}

export function useAddNutrition() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: NutritionInsert) => {
      if (!user) throw new Error("Non authentifié");
      return nutritionRepo.create(
        user.id,
        input as unknown as Omit<NutritionRow, "id" | "user_id" | "created_at" | "updated_at">,
      );
    },
    onSuccess: (_d, vars) => {
      toast.success("Repas ajouté");
      logActivity("meal", `Repas ajouté : ${vars.name ?? "aliment"}`, { date: vars.date });
      qc.invalidateQueries({ queryKey: ["nutrition", vars.date] });
      qc.invalidateQueries({ queryKey: ["user_activity"] });
      qc.invalidateQueries({ queryKey: ["activity_streak"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAddNutritionBatch() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (inputs: Array<Omit<TablesInsert<"nutrition">, "user_id">>) => {
      if (inputs.length === 0) return;
      if (!user) throw new Error("Non authentifié");
      for (const input of inputs) {
        await nutritionRepo.create(
          user.id,
          input as unknown as Omit<NutritionRow, "id" | "user_id" | "created_at" | "updated_at">,
        );
      }
    },
    onSuccess: (_d, vars) => {
      const n = vars.length;
      toast.success(`${n} aliment${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""}`);
      const date = vars[0]?.date as string | undefined;
      if (date) qc.invalidateQueries({ queryKey: ["nutrition", date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteNutrition() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Non authentifié");
      await nutritionRepo.remove(id, user.id);
    },
    onSuccess: () => {
      // Pas de toast ici : l'appelant affiche le toast avec action « Annuler ».
      qc.invalidateQueries({ queryKey: ["nutrition"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateNutrition() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: TablesUpdate<"nutrition">;
      date: string;
    }) => {
      if (!user) throw new Error("Non authentifié");
      await nutritionRepo.update(id, user.id, patch as Partial<NutritionRow>);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["nutrition", vars.date] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCopyNutritionDay() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      if (!user) throw new Error("Non authentifié");
      if (from === to) throw new Error("Choisis un autre jour à copier");
      const all = await nutritionRepo.list(user.id);
      const rows = all.filter((r) => r.date === from);
      if (rows.length === 0) throw new Error("Aucun repas à copier ce jour-là");
      for (const r of rows) {
        const { id: _id, user_id: _uid, created_at: _ca, updated_at: _ua, ...rest } = r;
        await nutritionRepo.create(user.id, { ...rest, date: to } as Omit<
          NutritionRow,
          "id" | "user_id" | "created_at" | "updated_at"
        >);
      }
      return rows.length;
    },
    onSuccess: (n, vars) => {
      toast.success(`${n} repas copiés`);
      qc.invalidateQueries({ queryKey: ["nutrition", vars.to] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Supprime tous les aliments d'un repas (date + slug) d'un coup. */
export function useDeleteNutritionMeal() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ date, meal }: { date: string; meal: string }) => {
      if (!user) throw new Error("Non authentifié");
      const all = await nutritionRepo.list(user.id);
      const rows = all.filter((r) => r.date === date && r.meal === meal);
      for (const r of rows) {
        await nutritionRepo.remove(r.id, user.id);
      }
      return rows.length;
    },
    onSuccess: (n, vars) => {
      toast.success(`Repas supprimé (${n} aliment${n > 1 ? "s" : ""})`);
      qc.invalidateQueries({ queryKey: ["nutrition", vars.date] });
      qc.invalidateQueries({ queryKey: ["nutrition"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Copie uniquement le repas correspondant (petit-dej, déjeuner…) d'un autre jour. */
export function useCopyNutritionMeal() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ from, to, meal }: { from: string; to: string; meal: string }) => {
      if (!user) throw new Error("Non authentifié");
      const all = await nutritionRepo.list(user.id);
      const rows = all.filter((r) => r.date === from && r.meal === meal);
      if (rows.length === 0) throw new Error("Aucun aliment à copier pour ce repas");
      for (const r of rows) {
        const { id: _id, user_id: _uid, created_at: _ca, updated_at: _ua, ...rest } = r;
        await nutritionRepo.create(user.id, { ...rest, date: to } as Omit<
          NutritionRow,
          "id" | "user_id" | "created_at" | "updated_at"
        >);
      }
      return rows.length;
    },
    onSuccess: (n, vars) => {
      toast.success(`${n} aliment${n > 1 ? "s" : ""} copié${n > 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["nutrition", vars.to] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
