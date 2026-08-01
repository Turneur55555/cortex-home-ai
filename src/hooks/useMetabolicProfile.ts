import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isBiologicalSex, type BiologicalSex } from "@/lib/fitness/metabolism";

export interface MetabolicProfile {
  sex: BiologicalSex | null;
  age: number | null;
  activity_level: number | null;
}

/**
 * Profil métabolique (âge/sexe/niveau d'activité) — table `metabolic_profile`.
 * Ne stocke ni poids ni taille : réutilisés depuis `body_tracking` /
 * `user_preferences.height_cm`, déjà disponibles ailleurs dans Cortex.
 */
export function useMetabolicProfile() {
  return useQuery({
    queryKey: ["metabolic_profile"],
    staleTime: 60_000,
    queryFn: async (): Promise<MetabolicProfile | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("metabolic_profile")
        .select("sex, age, activity_level")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        sex: isBiologicalSex(data.sex) ? data.sex : null,
        age: data.age,
        activity_level: data.activity_level,
      };
    },
  });
}

export interface MetabolicProfileInput {
  sex: BiologicalSex;
  age: number;
}

export function useUpsertMetabolicProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MetabolicProfileInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("metabolic_profile")
        .upsert({ user_id: user.id, sex: input.sex, age: input.age }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profil métabolique enregistré");
      qc.invalidateQueries({ queryKey: ["metabolic_profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
