export interface FoodSuggestion {
  id: string;
  name: string;
  brand?: string;
  image?: string;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
}

interface OFFProduct {
  code?: string;
  _id?: string;
  product_name?: string;
  product_name_fr?: string;
  brands?: string;
  image_front_small_url?: string;
  image_small_url?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
}

const round = (v: number | undefined | null, d = 1) =>
  v == null ? null : Math.round(v * 10 ** d) / 10 ** d;

export function mapProduct(p: OFFProduct): FoodSuggestion {
  const n = p.nutriments ?? {};
  return {
    id: p.code ?? p._id ?? Math.random().toString(36).slice(2),
    name: p.product_name_fr || p.product_name || "Produit",
    brand: p.brands?.split(",")[0]?.trim(),
    image: p.image_front_small_url || p.image_small_url,
    calories: n["energy-kcal_100g"] != null ? Math.round(n["energy-kcal_100g"]) : null,
    proteins: round(n.proteins_100g),
    carbs: round(n.carbohydrates_100g),
    fats: round(n.fat_100g),
  };
}

export async function searchFoods(query: string, signal?: AbortSignal): Promise<FoodSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
    q,
  )}&search_simple=1&action=process&json=1&page_size=15&fields=code,product_name,product_name_fr,brands,image_front_small_url,image_small_url,nutriments`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Erreur de récupération");
  const data = (await res.json()) as { products?: OFFProduct[] };
  return (data.products ?? [])
    .map(mapProduct)
    .filter((p) => p.name && (p.calories != null || p.proteins != null));
}
