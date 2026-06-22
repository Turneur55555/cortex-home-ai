import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Dernier poids corporel enregistré dans body_tracking pour l'utilisateur,
 * utilisé notamment pour estimer les calories brûlées par séance.
 * Retourne null s'il n'existe aucune mesure.
 */
export function useLatestBodyWeight() {
  return useQuery({
    queryKey: ["latest_body_weight"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<number | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("body_tracking")
        .select("weight")
        .eq("user_id", user.id)
        .not("weight", "is", null)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      const w = data?.weight;
      return typeof w === "number" && w > 0 ? w : null;
    },
  });
}
