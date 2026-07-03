import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type NutritionGoals = {
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
};

export function useNutritionGoals() {
  return useQuery({
    queryKey: ["nutrition_goals"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<NutritionGoals | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("nutrition_goals")
        .select("calories, proteins, carbs, fats")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertNutritionGoals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NutritionGoals) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("nutrition_goals")
        .upsert({ user_id: user.id, ...input }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Objectifs enregistrés");
      qc.invalidateQueries({ queryKey: ["nutrition_goals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
