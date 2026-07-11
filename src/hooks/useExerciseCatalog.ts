import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EXERCISE_CATALOG, type CatalogExercise } from "@/lib/fitness/exerciseCatalog";

export type DbCatalogRow = {
  id: string;
  name: string;
  group_name: string;
  sort_order: number;
  created_at: string;
};

const CACHE_KEY = ["exercise-catalog"] as const;
const FULL_CACHE_KEY = ["exercise-catalog-full"] as const;

// ── Catalogue DB (pour le picker) ─────────────────────────────────────────────
export function useExerciseCatalog() {
  return useQuery({
    queryKey: CACHE_KEY,
    queryFn: async (): Promise<DbCatalogRow[]> => {
      const { data, error } = await supabase
        .from("exercise_reference")
        .select("*")
        .order("group_name")
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []) as DbCatalogRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ── Catalogue complet = DB + exercices custom (pour la sheet de gestion) ─────
export function useFullExerciseCatalog() {
  return useQuery({
    queryKey: FULL_CACHE_KEY,
    queryFn: async (): Promise<DbCatalogRow[]> => {
      const [catalogResult, customResult] = await Promise.all([
        supabase
          .from("exercise_reference")
          .select("*")
          .order("group_name")
          .order("sort_order")
          .order("name"),
        supabase.from("exercises").select("name").order("name"),
      ]);

      if (catalogResult.error) throw catalogResult.error;

      const rows = (catalogResult.data ?? []) as DbCatalogRow[];
      const catalogNames = new Set(rows.map((r) => r.name.toLowerCase()));

      // Ajoute les exercices créés par l'utilisateur non encore dans le catalogue
      const seen = new Set<string>();
      for (const ex of customResult.data ?? []) {
        const key = ex.name.toLowerCase();
        if (!catalogNames.has(key) && !seen.has(key)) {
          seen.add(key);
          rows.push({
            id: `custom__${ex.name}`,
            name: ex.name,
            group_name: "Mes exercices",
            sort_order: 999,
            created_at: "",
          });
        }
      }

      return rows;
    },
    staleTime: 2 * 60 * 1000,
  });
}

// ── Convertit les lignes DB en CatalogExercise (pour ExercisePicker) ────────
export function dbRowsToCatalog(rows: DbCatalogRow[]): CatalogExercise[] {
  return rows.map((r) => ({ name: r.name, group: r.group_name }));
}

// ── Mutations ─────────────────────────────────────────────────────────────────
export function useAddExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, group_name }: { name: string; group_name: string }) => {
      const { error } = await supabase
        .from("exercise_reference")
        .insert({ name: name.trim(), group_name });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: FULL_CACHE_KEY });
    },
  });
}

export function useDeleteExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exercise_reference").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: FULL_CACHE_KEY });
    },
  });
}

export function useUpdateExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      group_name,
    }: {
      id: string;
      name: string;
      group_name: string;
    }) => {
      const { error } = await supabase
        .from("exercise_reference")
        .update({ name: name.trim(), group_name })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: FULL_CACHE_KEY });
    },
  });
}

// ── Ajouter un exercice custom au catalogue officiel ─────────────────────────
export function usePromoteExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, group_name }: { name: string; group_name: string }) => {
      const { error } = await supabase
        .from("exercise_reference")
        .insert({ name: name.trim(), group_name });
      if (error && !error.message.includes("duplicate")) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CACHE_KEY });
      qc.invalidateQueries({ queryKey: FULL_CACHE_KEY });
    },
  });
}
