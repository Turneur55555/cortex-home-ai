import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { DisciplineId } from "@/lib/fitness/engines/types";
import { computeRecentSegmentLabels } from "@/lib/fitness/recentSegmentLabels";

// ============================================================
// Labels d'exercices "récents" pour le picker générique d'ajout
// d'exercice (Phase B, 2026-07-15) — voir recentSegmentLabels.ts pour le
// principe et les limites connues (Course non couverte).
// ============================================================

export function useRecentSegmentLabels(discipline: DisciplineId) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["fitness", "recent_segment_labels", discipline, user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("workouts")
        .select("date, metadata")
        .eq("user_id", user!.id)
        .eq("discipline", discipline)
        .eq("status", "completed")
        .order("date", { ascending: false })
        .limit(40);
      if (error) throw error;
      return computeRecentSegmentLabels(
        (data ?? []) as Array<{
          metadata: { segments?: Array<{ label?: string | null }> } | null;
        }>,
      );
    },
  });
}
