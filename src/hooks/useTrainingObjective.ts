import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { TrainingObjective } from "@/lib/fitness/analysis";

/**
 * Objectif d'entraînement explicite de l'utilisateur, stocké dans le champ
 * JSON `user_preferences.ai_preferences` (aucune migration nécessaire).
 * `null` = laisser le moteur inférer automatiquement l'objectif.
 */

const VALID: TrainingObjective[] = [
  "force",
  "hypertrophie",
  "seche",
  "endurance",
  "posture",
  "general",
];

function readObjective(ai: unknown): TrainingObjective | null {
  if (ai && typeof ai === "object") {
    const v = (ai as Record<string, unknown>).training_objective;
    if (typeof v === "string" && (VALID as string[]).includes(v)) {
      return v as TrainingObjective;
    }
  }
  return null;
}

export function useTrainingObjective() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const qk = ["training_objective", user?.id] as const;

  const query = useQuery({
    queryKey: qk,
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<TrainingObjective | null> => {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("ai_preferences")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return readObjective(data?.ai_preferences);
    },
  });

  const update = useMutation({
    mutationFn: async (objective: TrainingObjective | null) => {
      // Lecture-fusion pour ne pas écraser les autres clés de ai_preferences.
      const { data: current } = await supabase
        .from("user_preferences")
        .select("ai_preferences")
        .eq("user_id", user!.id)
        .maybeSingle();
      const ai = (current?.ai_preferences ?? {}) as Record<string, unknown>;
      if (objective) ai.training_objective = objective;
      else delete ai.training_objective;

      const { error } = await supabase
        .from("user_preferences")
        .upsert({ user_id: user!.id, ai_preferences: ai }, { onConflict: "user_id" });
      if (error) throw error;
      return objective;
    },
    onSuccess: (objective) => {
      qc.setQueryData(qk, objective);
      qc.invalidateQueries({ queryKey: ["user_preferences", user?.id] });
    },
    onError: () => toast.error("Impossible de mettre à jour l'objectif"),
  });

  return {
    objective: query.data ?? null,
    isLoading: query.isLoading,
    setObjective: (o: TrainingObjective | null) =>
      update.mutateAsync(o).catch(() => {}),
  };
}
