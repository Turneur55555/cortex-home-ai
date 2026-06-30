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

export function useExerciseCatalog() {
  return useQuery({
    queryKey: CACHE_KEY,
    queryFn: async (): Promise<DbCatalogRow[]> => {
      const { data, error } = await (supabase as any)
        .from("exercise_catalog")
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

export function dbRowsToCatalog(rows: DbCatalogRow[]): CatalogExercise[] {
  return rows.map((r) => ({ name: r.name, group: r.group_name }));
}

export function useAddExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, group_name }: { name: string; group_name: string }) => {
      const { error } = await (supabase as any)
        .from("exercise_catalog")
        .insert({ name: name.trim(), group_name });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CACHE_KEY }),
  });
}

export function useDeleteExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("exercise_catalog")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CACHE_KEY }),
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
      const { error } = await (supabase as any)
        .from("exercise_catalog")
        .update({ name: name.trim(), group_name })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CACHE_KEY }),
  });
}
