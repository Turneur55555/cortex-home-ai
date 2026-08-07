/**
 * Repli client de catégorisation d'ingrédient — domaine pur (zéro React).
 *
 * La catégorie est normalement fournie par l'IA à l'analyse (voir
 * `RECIPE_TOOL` dans supabase/functions/_shared/recipe-parser.ts). Ce module
 * ne sert que pour les ingrédients qui n'en ont pas encore (recettes
 * importées avant l'ajout du champ, recettes créées/éditées manuellement) —
 * un classement par mot-clé, volontairement simple.
 */
import { INGREDIENT_CATEGORIES, type IngredientCategory } from "./recipeImport/types";

const KEYWORD_RULES: Array<{ category: IngredientCategory; keywords: string[] }> = [
  {
    category: "Poissons",
    keywords: [
      "saumon",
      "thon",
      "cabillaud",
      "poisson",
      "crevette",
      "gambas",
      "moule",
      "cabillaud",
      "truite",
      "sardine",
      "maquereau",
      "colin",
      "dorade",
      "bar",
      "fruits de mer",
      "calamar",
      "crabe",
      "coquille",
    ],
  },
  {
    category: "Viandes",
    keywords: [
      "poulet",
      "boeuf",
      "bœuf",
      "porc",
      "veau",
      "agneau",
      "dinde",
      "canard",
      "jambon",
      "steak",
      "lardons",
      "saucisse",
      "chorizo",
      "bacon",
      "viande",
      "merguez",
      "escalope",
    ],
  },
  {
    category: "Produits laitiers",
    keywords: [
      "lait",
      "crème",
      "fromage",
      "yaourt",
      "beurre",
      "parmesan",
      "mozzarella",
      "cheddar",
      "chèvre",
      "ricotta",
      "mascarpone",
      "feta",
      "gruyère",
      "œuf",
      "oeuf",
      "blanc d'œuf",
      "blanc d'oeuf",
    ],
  },
  {
    category: "Fruits et légumes",
    keywords: [
      "pomme",
      "banane",
      "orange",
      "citron",
      "avocat",
      "tomate",
      "salade",
      "épinard",
      "epinard",
      "carotte",
      "oignon",
      "ail",
      "poivron",
      "courgette",
      "concombre",
      "brocoli",
      "champignon",
      "herbe",
      "basilic",
      "persil",
      "coriandre",
      "fraise",
      "framboise",
      "mangue",
      "poire",
      "raisin",
      "pomme de terre",
      "patate",
    ],
  },
  {
    category: "Surgelés",
    keywords: ["surgelé", "surgelée", "glace", "sorbet"],
  },
  {
    category: "Boissons",
    keywords: ["eau", "jus", "soda", "vin", "bière", "café", "thé", "lait végétal", "boisson"],
  },
  {
    category: "Épicerie",
    keywords: [
      "riz",
      "pâte",
      "farine",
      "sucre",
      "sel",
      "poivre",
      "huile",
      "vinaigre",
      "sauce soja",
      "miel",
      "levure",
      "flocon d'avoine",
      "avoine",
      "quinoa",
      "lentille",
      "pois chiche",
      "haricot",
      "épice",
      "epice",
      "chocolat",
      "whey",
      "protéine",
      "cannelle",
      "vanille",
      "moutarde",
      "bouillon",
      "pain",
      "biscuit",
      "graine",
      "sésame",
      "amande",
      "noix",
    ],
  },
];

/** Devine une catégorie à partir du nom de l'ingrédient — `"Divers"` par défaut. */
export function guessIngredientCategory(name: string | null | undefined): IngredientCategory {
  const n = (name ?? "").toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((kw) => n.includes(kw))) return rule.category;
  }
  return "Divers";
}

/** Catégorie effective : celle stockée si connue, sinon le repli par mot-clé. */
export function resolveIngredientCategory(
  name: string,
  category: IngredientCategory | null | undefined,
): IngredientCategory {
  return category ?? guessIngredientCategory(name);
}

export { INGREDIENT_CATEGORIES };
