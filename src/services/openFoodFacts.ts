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
  nova_group?: number;
  nutriments?: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
}

const round = (v: number | undefined | null, d = 1) =>
  v == null ? null : Math.round(v * 10 ** d) / 10 ** d;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Mots qui indiquent un produit transformé / industriel à pénaliser
const PROCESSED_PENALTY_WORDS = [
  "brioche",
  "gateau",
  "madeleine",
  "viennoiserie",
  "biscuit",
  "cookie",
  "bonbon",
  "chocolat",
  "barre",
  "cereales",
  "muesli",
  "tarte",
  "quiche",
  "pizza",
  "sauce",
  "soupe",
  "plat",
  "preparation",
  "mix",
  "pain au",
  "croissant",
  "gaufre",
  "crepe",
  "pancake",
  "glace",
  "yaourt aromatise",
  "boisson",
  "sirop",
  "nappage",
];

// Aliments simples / bruts à favoriser
const SIMPLE_FOODS = new Set([
  "oeuf",
  "oeufs",
  "riz",
  "poulet",
  "banane",
  "pomme",
  "saumon",
  "avoine",
  "boeuf",
  "porc",
  "thon",
  "lait",
  "fromage",
  "yaourt",
  "pain",
  "pates",
  "patate",
  "tomate",
  "carotte",
  "salade",
  "epinard",
  "brocoli",
  "haricot",
  "lentille",
  "amande",
  "noix",
  "beurre",
  "huile",
  "miel",
  "cafe",
  "the",
]);

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

function scoreProduct(name: string, query: string, novaGroup?: number): number {
  const n = normalize(name);
  const q = normalize(query);
  if (!n || !q) return -Infinity;

  const words = n.split(" ");
  const firstWord = words[0] ?? "";

  let score = 0;

  // Le premier mot est exactement la requête (ou son pluriel)
  if (firstWord === q || firstWord === q + "s" || firstWord + "s" === q) score += 200;
  // Le nom commence par la requête
  else if (n.startsWith(q)) score += 120;

  // Mot exact présent dans le nom
  if (words.includes(q) || words.includes(q + "s")) score += 60;

  // Inclus quelque part
  if (n.includes(q)) score += 20;
  else return -Infinity; // pas pertinent du tout

  // Bonus aliments simples
  if (SIMPLE_FOODS.has(q) && (firstWord === q || firstWord === q + "s")) score += 80;

  // Pénalité produits transformés
  for (const w of PROCESSED_PENALTY_WORDS) {
    if (n.includes(w)) {
      score -= 150;
      break;
    }
  }

  // Pénalité NOVA (4 = ultra-transformé)
  if (novaGroup === 4) score -= 40;
  else if (novaGroup === 3) score -= 15;
  else if (novaGroup === 1) score += 20;

  // Pénalité noms longs (souvent industriels)
  if (name.length > 50) score -= 20;
  if (name.length > 80) score -= 30;

  return score;
}

export async function searchFoods(query: string, signal?: AbortSignal): Promise<FoodSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
    q,
  )}&search_simple=1&action=process&json=1&page_size=50&fields=code,product_name,product_name_fr,brands,image_front_small_url,image_small_url,nutriments,nova_group`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Erreur de récupération");
  const data = (await res.json()) as { products?: OFFProduct[] };

  const scored = (data.products ?? [])
    .map((p) => {
      const name = p.product_name_fr || p.product_name || "";
      const score = scoreProduct(name, q, p.nova_group);
      return { p, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ p }) => mapProduct(p))
    .filter((p) => p.name && (p.calories != null || p.proteins != null));

  return scored;
}
