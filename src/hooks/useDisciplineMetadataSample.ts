import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { DisciplineId } from "@/lib/fitness/engines/types";

/**
 * Lit UNIQUEMENT la colonne `metadata` de toutes les séances d'une
 * discipline donnée (pas de plafond — colonne étroite, requête légère).
 * Nouveau hook (Phase 8) : sert à évaluer des succès qui ont besoin de
 * regarder DANS le contenu structuré d'une séance (ex: le type exact de
 * séance HYROX/Course), pas seulement d'en compter le nombre — voir
 * useDisciplineWorkoutCount pour le simple comptage. N'importe quelle
 * discipline peut s'en servir, aujourd'hui HYROX et Course.
 */
export function useDisciplineMetadataSample(discipline: DisciplineId) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["discipline_metadata_sample", user?.id, discipline],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, unknown>[]> => {
      const { data, error } = await supabase
        .from("workouts")
        .select("metadata")
        .eq("user_id", user!.id)
        .eq("discipline", discipline);
      if (error) throw error;
      return (data ?? []).map((row) => (row.metadata as Record<string, unknown>) ?? {});
    },
  });
}
