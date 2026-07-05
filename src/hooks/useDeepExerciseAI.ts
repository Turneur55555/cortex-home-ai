import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalize } from "@/lib/fitness/exerciseCatalog";
import { OBJECTIVE_LABELS, ROLE_LABELS, type ExerciseAnalysis } from "@/lib/fitness/analysis";

/**
 * Analyse IA approfondie « à la demande » (hybride).
 * Le moteur déterministe reste la source par défaut, instantanée et hors-ligne.
 * Ce hook n'appelle l'edge function Gemini que lorsque `run()` est déclenché,
 * et met le résultat en cache (react-query, staleTime infini) : rouvrir la
 * fiche ou revenir sur l'exercice ne relance PAS d'appel réseau.
 */

export interface DeepAIResult {
  text: string | null;
  isLoading: boolean;
  error: string | null;
  hasRun: boolean;
  run: () => void;
}

function buildPayload(a: ExerciseAnalysis) {
  return {
    exercise: a.exerciseName,
    objective: OBJECTIVE_LABELS[a.objective],
    generic_model: a.isGenericModel,
    muscles: a.muscles.map((m) => ({
      name: m.label,
      role: ROLE_LABELS[m.role],
      solicitation: m.solicitation,
      recovery: m.recovery,
    })),
    physical_impact: a.physicalImpact.map((t) => ({ trait: t.label, score: t.score })),
    comparison: {
      state: a.comparison.state,
      prs: a.comparison.prsBroken,
      metrics: a.comparison.metrics.map((mt) => ({
        key: mt.key,
        current: mt.current,
        previous: mt.previous,
        delta_pct: mt.deltaPct,
      })),
    },
    recommendations: a.recommendations.map((r) => r.text),
    imbalances: a.imbalances.map((i) => i.text),
    relevance: { stars: a.relevance.stars, label: a.relevance.label },
  };
}

/** Signature courte du contenu : change quand l'analyse change matériellement. */
function signature(a: ExerciseAnalysis): string {
  return [
    a.comparison.state,
    a.comparison.prsBroken.length,
    a.objective,
    a.relevance.stars,
    a.muscles.length,
  ].join(":");
}

export function useDeepExerciseAI(
  analysis: ExerciseAnalysis | null,
): DeepAIResult {
  const key = analysis ? normalize(analysis.exerciseName) : "";
  const sig = analysis ? signature(analysis) : "";

  const query = useQuery({
    queryKey: ["deep_exercise_ai", key, sig],
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: async (): Promise<string> => {
      if (!analysis) throw new Error("Analyse indisponible");
      const { data, error } = await supabase.functions.invoke("analyze-exercise", {
        body: buildPayload(analysis),
      });
      if (error) throw new Error(error.message);
      const text = (data as { text?: string } | null)?.text;
      if (!text) throw new Error("Réponse vide");
      return text;
    },
  });

  return {
    text: query.data ?? null,
    isLoading: query.isFetching,
    error: query.error ? (query.error as Error).message : null,
    hasRun: query.isFetched,
    run: () => {
      if (!query.isFetching) void query.refetch();
    },
  };
}
