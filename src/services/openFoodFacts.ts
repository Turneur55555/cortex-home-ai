// ⚠️ Module conservé pour compatibilité de type uniquement.
// L'implémentation Open Food Facts a été supprimée.
// Toute nouvelle utilisation doit passer par `@/services/foodCatalog`.

import { searchFoodCatalog, type FoodResult } from "@/services/foodCatalog";

export interface FoodSuggestion {
  id: string;
  name: string;
  brand?: string;
  image?: string;
  /** Values per 100 g */
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
  source?: "local" | "off" | "usda" | "icortex" | "custom";
  quality_score?: number;
  default_serving?: { label: string; unit: string; quantity: number; grams: number } | null;
}

function toSuggestion(r: FoodResult): FoodSuggestion {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    image: r.image_url,
    calories: r.calories,
    proteins: r.proteins,
    carbs: r.carbs,
    fats: r.fats,
    source: r.source,
    quality_score: r.quality_score,
    default_serving: r.default_serving ?? null,
  };
}

export async function searchFoods(query: string, signal?: AbortSignal): Promise<FoodSuggestion[]> {
  const results = await searchFoodCatalog(query, signal);
  return results.map(toSuggestion);
}
