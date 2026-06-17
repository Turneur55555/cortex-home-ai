// Façade unifiée pour la recherche d'aliments.
// Remplace Open Food Facts. Pipeline : edge function `food-lookup` → cache Supabase + USDA.

import { supabase } from "@/integrations/supabase/client";

export interface FoodResult {
  id: string;
  source: "icortex" | "usda" | "custom";
  source_id?: string;
  name: string;
  brand?: string;
  category?: string;
  image_url?: string;
  /** /100g */
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  fiber?: number | null;
  barcode?: string;
  /** Compat OFF (BarcodeScannerSheet, computeMacros) */
  nutriments?: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    fiber_100g?: number;
  };
  quality_score?: number;
  confidence_score?: number;
  default_serving?: { label: string; unit: string; quantity: number; grams: number } | null;
}

interface EdgeResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export async function searchFoodCatalog(query: string, signal?: AbortSignal): Promise<FoodResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase.functions.invoke<EdgeResponse<FoodResult[]>>("food-lookup", {
    body: { type: "search", query: q },
  });
  if (signal?.aborted) return [];
  if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? "search failed");
  return data.data ?? [];
}

export async function lookupBarcode(code: string): Promise<FoodResult | null> {
  const { data, error } = await supabase.functions.invoke<EdgeResponse<FoodResult>>("food-lookup", {
    body: { type: "barcode", code },
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) return null;
  return data.data ?? null;
}
