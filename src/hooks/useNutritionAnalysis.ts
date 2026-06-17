import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AnalysisNutrient {
  key: string;
  label: string;
  unit: string;
  rda: number;
  intake: number;
  intake_from_supplements: number;
  pct: number;
  status: "ok" | "low" | "deficient" | "unknown";
}

export interface NutritionAnalysisResult {
  ok: boolean;
  period_days: number;
  meals_analyzed: number;
  coverage: number;
  nutrients: AnalysisNutrient[];
  signals: AnalysisNutrient[];
  supplements_considered: Array<{ name: string; nutrient: string; daily: number; unit: string }>;
  ai_summary: string | null;
  disclaimer: string;
  error?: string;
}

export function useNutritionAnalysis() {
  return useMutation({
    mutationFn: async (days: number): Promise<NutritionAnalysisResult> => {
      const { data, error } = await supabase.functions.invoke<NutritionAnalysisResult>(
        "nutrition-analysis",
        { body: { days } },
      );
      if (error) throw error;
      if (!data) throw new Error("Réponse vide");
      return data;
    },
  });
}
