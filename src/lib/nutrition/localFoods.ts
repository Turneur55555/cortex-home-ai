import type { FoodSuggestion } from "@/services/openFoodFacts";

// ~50 common French / fitness foods, values per 100 g
const LOCAL_FOODS: FoodSuggestion[] = [
  // ── Protéines animales ────────────────────────────────────────────────────
  { id: "local-poulet",        name: "Poulet (blanc cuit)",      calories: 165, proteins: 31,   carbs: 0,    fats: 3.6,  source: "local" },
  { id: "local-saumon",        name: "Saumon (cuit)",            calories: 208, proteins: 20,   carbs: 0,    fats: 13,   source: "local" },
  { id: "local-thon",          name: "Thon (boîte, eau)",        calories: 116, proteins: 25.5, carbs: 0,    fats: 0.5,  source: "local" },
  { id: "local-boeuf",         name: "Bœuf haché (5% MG)",      calories: 137, proteins: 21,   carbs: 0,    fats: 5,    source: "local" },
  { id: "local-porc",          name: "Porc (filet cuit)",        calories: 143, proteins: 22,   carbs: 0,    fats: 6,    source: "local" },
  { id: "local-oeuf",          name: "Œuf entier",               calories: 155, proteins: 12.6, carbs: 1.1,  fats: 10.6, source: "local" },
  { id: "local-blanc-oeuf",    name: "Blanc d'œuf",              calories: 52,  proteins: 10.9, carbs: 0.7,  fats: 0.2,  source: "local" },
  { id: "local-crevettes",     name: "Crevettes cuites",         calories: 99,  proteins: 20,   carbs: 0.9,  fats: 1.7,  source: "local" },
  { id: "local-dinde",         name: "Dinde (blanc cuit)",       calories: 158, proteins: 30,   carbs: 0,    fats: 3.4,  source: "local" },
  { id: "local-jambon",        name: "Jambon blanc (tranches)",  calories: 107, proteins: 18,   carbs: 1.5,  fats: 3.3,  source: "local" },
  { id: "local-sardine",       name: "Sardines (boîte, huile)",  calories: 208, proteins: 24,   carbs: 0,    fats: 11.5, source: "local" },

  // ── Produits laitiers ─────────────────────────────────────────────────────
  { id: "local-lait-entier",   name: "Lait entier",              calories: 61,  proteins: 3.2,  carbs: 4.8,  fats: 3.3,  source: "local" },
  { id: "local-lait-demi",     name: "Lait demi-écrémé",         calories: 46,  proteins: 3.3,  carbs: 4.7,  fats: 1.5,  source: "local" },
  { id: "local-yaourt-0",      name: "Yaourt nature 0%",         calories: 36,  proteins: 4.3,  carbs: 4.6,  fats: 0.1,  source: "local" },
  { id: "local-yaourt-entier", name: "Yaourt nature entier",     calories: 58,  proteins: 3.5,  carbs: 4.5,  fats: 3,    source: "local" },
  { id: "local-fromage-blanc", name: "Fromage blanc 0%",         calories: 45,  proteins: 8,    carbs: 3.5,  fats: 0.1,  source: "local" },
  { id: "local-skyr",          name: "Skyr nature",              calories: 57,  proteins: 11,   carbs: 4,    fats: 0.2,  source: "local" },
  { id: "local-gruyere",       name: "Gruyère",                  calories: 413, proteins: 29,   carbs: 0.4,  fats: 32,   source: "local" },
  { id: "local-mozzarella",    name: "Mozzarella",               calories: 280, proteins: 18,   carbs: 2.2,  fats: 22,   source: "local" },
  { id: "local-cottage",       name: "Fromage cottage",          calories: 97,  proteins: 11,   carbs: 3.4,  fats: 4.3,  source: "local" },
  { id: "local-beurre",        name: "Beurre",                   calories: 717, proteins: 0.9,  carbs: 0.1,  fats: 80,   source: "local" },

  // ── Féculents / céréales ──────────────────────────────────────────────────
  { id: "local-riz-blanc",     name: "Riz blanc (cuit)",         calories: 130, proteins: 2.7,  carbs: 28,   fats: 0.3,  source: "local" },
  { id: "local-riz-brun",      name: "Riz brun (cuit)",          calories: 111, proteins: 2.6,  carbs: 23,   fats: 0.9,  source: "local" },
  { id: "local-pates",         name: "Pâtes (cuites)",           calories: 131, proteins: 5,    carbs: 25,   fats: 1.1,  source: "local" },
  { id: "local-pain-complet",  name: "Pain complet",             calories: 247, proteins: 9,    carbs: 41,   fats: 3.5,  source: "local" },
  { id: "local-pain-blanc",    name: "Pain blanc",               calories: 265, proteins: 8,    carbs: 51,   fats: 2.5,  source: "local" },
  { id: "local-quinoa",        name: "Quinoa (cuit)",            calories: 120, proteins: 4.4,  carbs: 21.3, fats: 1.9,  source: "local" },
  { id: "local-avoine",        name: "Flocons d'avoine",         calories: 389, proteins: 17,   carbs: 66,   fats: 7,    source: "local" },
  { id: "local-patate",        name: "Pomme de terre (cuite)",   calories: 77,  proteins: 2,    carbs: 17,   fats: 0.1,  source: "local" },
  { id: "local-patate-douce",  name: "Patate douce (cuite)",     calories: 86,  proteins: 1.6,  carbs: 20,   fats: 0.1,  source: "local" },

  // ── Fruits ────────────────────────────────────────────────────────────────
  { id: "local-banane",        name: "Banane",                   calories: 89,  proteins: 1.1,  carbs: 23,   fats: 0.3,  source: "local" },
  { id: "local-pomme",         name: "Pomme",                    calories: 52,  proteins: 0.3,  carbs: 14,   fats: 0.2,  source: "local" },
  { id: "local-orange",        name: "Orange",                   calories: 47,  proteins: 0.9,  carbs: 12,   fats: 0.1,  source: "local" },
  { id: "local-mangue",        name: "Mangue",                   calories: 65,  proteins: 0.5,  carbs: 17,   fats: 0.3,  source: "local" },
  { id: "local-myrtilles",     name: "Myrtilles",                calories: 57,  proteins: 0.7,  carbs: 14,   fats: 0.3,  source: "local" },
  { id: "local-fraises",       name: "Fraises",                  calories: 32,  proteins: 0.7,  carbs: 8,    fats: 0.3,  source: "local" },
  { id: "local-avocat",        name: "Avocat",                   calories: 160, proteins: 2,    carbs: 9,    fats: 15,   source: "local" },

  // ── Légumes ───────────────────────────────────────────────────────────────
  { id: "local-epinards",      name: "Épinards (crus)",          calories: 23,  proteins: 2.9,  carbs: 3.6,  fats: 0.4,  source: "local" },
  { id: "local-brocoli",       name: "Brocoli (cuit)",           calories: 34,  proteins: 2.8,  carbs: 7,    fats: 0.4,  source: "local" },
  { id: "local-carotte",       name: "Carotte (crue)",           calories: 41,  proteins: 0.9,  carbs: 10,   fats: 0.2,  source: "local" },
  { id: "local-tomate",        name: "Tomate",                   calories: 18,  proteins: 0.9,  carbs: 3.9,  fats: 0.2,  source: "local" },
  { id: "local-courgette",     name: "Courgette (cuite)",        calories: 17,  proteins: 1.2,  carbs: 3.1,  fats: 0.3,  source: "local" },
  { id: "local-salade",        name: "Salade verte",             calories: 15,  proteins: 1.4,  carbs: 2.9,  fats: 0.2,  source: "local" },

  // ── Matières grasses / oléagineux ─────────────────────────────────────────
  { id: "local-huile-olive",   name: "Huile d'olive",            calories: 884, proteins: 0,    carbs: 0,    fats: 100,  source: "local" },
  { id: "local-amandes",       name: "Amandes",                  calories: 579, proteins: 21,   carbs: 22,   fats: 50,   source: "local" },
  { id: "local-noix",          name: "Noix",                     calories: 654, proteins: 15,   carbs: 14,   fats: 65,   source: "local" },
  { id: "local-pb",            name: "Beurre de cacahuète",      calories: 588, proteins: 25,   carbs: 20,   fats: 50,   source: "local" },

  // ── Fitness / suppléments ─────────────────────────────────────────────────
  { id: "local-whey",          name: "Whey protéine (nature)",   calories: 370, proteins: 80,   carbs: 5,    fats: 4,    source: "local" },
  { id: "local-miel",          name: "Miel",                     calories: 304, proteins: 0.3,  carbs: 82,   fats: 0,    source: "local" },
];

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function searchLocalFoods(query: string): FoodSuggestion[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  return LOCAL_FOODS.filter((f) => normalize(f.name).includes(q)).slice(0, 6);
}
