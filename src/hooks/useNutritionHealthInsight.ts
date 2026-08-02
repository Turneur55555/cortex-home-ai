import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  parseNutritionHealthAnalysisResult,
  type NutritionHealthAnalysisContext,
  type NutritionHealthAnalysisResult,
} from "@/lib/fitness/nutritionHealthContext";

/**
 * Analyse intelligente Santé nutritionnelle (Phase 9A) — déclenchée
 * UNIQUEMENT à la demande (CTA "Analyser ma situation", §21 du brief),
 * jamais automatiquement à chaque render. Envoie exclusivement le
 * contexte déterministe déjà construit (`buildNutritionHealthAnalysisContext`)
 * — jamais un dump Supabase brut (§8/§22). Ne modifie jamais
 * `nutrition_goals`/`physical_goals` — c'est une lecture/explication pure.
 */
export function useNutritionHealthInsight() {
  return useMutation({
    mutationFn: async (
      context: NutritionHealthAnalysisContext,
    ): Promise<NutritionHealthAnalysisResult> => {
      const { data, error } = await supabase.functions.invoke("nutrition-health-insight", {
        body: { context },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const parsed = parseNutritionHealthAnalysisResult(data);
      if (!parsed) throw new Error("Réponse d'analyse invalide — réessaie plus tard.");
      return parsed;
    },
  });
}
