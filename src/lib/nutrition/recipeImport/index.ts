/**
 * Registre des importeurs de recettes.
 *
 * V1 : seul Instagram est actif, avec des données simulées. Les autres sources
 * sont déclarées mais indisponibles — elles réutiliseront exactement le même
 * pipeline (`RecipeImporter`) et la même UI le jour où leur backend existera.
 */

import type {
  ImportInput,
  ImportStage,
  ImportedRecipe,
  RecipeImporter,
  RecipeSourceKind,
} from "./types";

const STAGES: ImportStage[] = [
  { key: "download", label: "Téléchargement", durationMs: 900 },
  { key: "transcribe", label: "Transcription", durationMs: 1100 },
  { key: "vision", label: "Analyse des images", durationMs: 1200 },
  { key: "ingredients", label: "Détection des ingrédients", durationMs: 1000 },
  { key: "quantities", label: "Estimation des quantités", durationMs: 900 },
  { key: "nutrition", label: "Calcul nutritionnel", durationMs: 800 },
  { key: "card", label: "Création de la fiche", durationMs: 600 },
];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const INSTAGRAM_RE = /^https?:\/\/(www\.)?instagram\.com\/(reel|reels|p|tv)\/[\w-]+/i;

/** Jeu de fiches simulées — la fiche renvoyée dépend de l'URL (déterministe). */
const MOCK_RECIPES: Array<Omit<ImportedRecipe, "sourceKind" | "sourceUrl">> = [
  {
    title: "Poulet crémeux au parmesan & épinards",
    imageUrl:
      "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=1200&q=80",
    servings: 4,
    confidence: 0.86,
    perServing: { calories: 512, proteins: 46.5, carbs: 9.2, fats: 32.1, fiber: 2.3 },
    ingredients: [
      { name: "Filets de poulet", quantity: 600, unit: "g", grams: 600 },
      { name: "Crème entière", quantity: 20, unit: "cl", grams: 200 },
      { name: "Parmesan râpé", quantity: 60, unit: "g", grams: 60 },
      { name: "Épinards frais", quantity: 200, unit: "g", grams: 200 },
      { name: "Ail", quantity: 3, unit: "gousses", grams: 12 },
      { name: "Huile d'olive", quantity: 2, unit: "c. à soupe", grams: 24 },
    ],
    notes: "Quantités estimées depuis la vidéo : la crème et l'huile sont approximatives.",
  },
  {
    title: "Bowl saumon avocat & riz vinaigré",
    imageUrl:
      "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=1200&q=80",
    servings: 2,
    confidence: 0.74,
    perServing: { calories: 638, proteins: 34.8, carbs: 61.4, fats: 26.9, fiber: 6.1 },
    ingredients: [
      { name: "Pavé de saumon", quantity: 260, unit: "g", grams: 260 },
      { name: "Riz sushi cuit", quantity: 300, unit: "g", grams: 300 },
      { name: "Avocat", quantity: 1, unit: "pièce", grams: 150 },
      { name: "Concombre", quantity: 0.5, unit: "pièce", grams: 100 },
      { name: "Sauce soja", quantity: 2, unit: "c. à soupe", grams: 30 },
      { name: "Graines de sésame", quantity: 1, unit: "c. à café", grams: 8 },
    ],
    notes: "Le saumon est supposé cru ; la portion de riz est estimée au visuel du bol.",
  },
  {
    title: "Pancakes protéinés banane & flocons d'avoine",
    imageUrl:
      "https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=1200&q=80",
    servings: 3,
    confidence: 0.62,
    perServing: { calories: 371, proteins: 28.4, carbs: 44.2, fats: 8.6, fiber: 5.4 },
    ingredients: [
      { name: "Flocons d'avoine", quantity: 150, unit: "g", grams: 150 },
      { name: "Banane mûre", quantity: 2, unit: "pièces", grams: 240 },
      { name: "Blancs d'œufs", quantity: 4, unit: "pièces", grams: 132 },
      { name: "Whey vanille", quantity: 30, unit: "g", grams: 30 },
      { name: "Levure chimique", quantity: 1, unit: "c. à café", grams: 5 },
    ],
    notes: "Confiance limitée : la marque de whey n'est pas identifiable dans la vidéo.",
  },
];

function pickMock(seed: string): Omit<ImportedRecipe, "sourceKind" | "sourceUrl"> {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return MOCK_RECIPES[h % MOCK_RECIPES.length];
}

/** Importeur simulé — utilisé par toutes les sources tant que le backend n'existe pas. */
function createMockImporter(config: {
  kind: RecipeSourceKind;
  label: string;
  available: boolean;
  canHandle: (input: ImportInput) => boolean;
}): RecipeImporter {
  return {
    kind: config.kind,
    label: config.label,
    available: config.available,
    canHandle: config.canHandle,
    stages: () => STAGES,
    async run(input, onStage) {
      for (const stage of STAGES) {
        onStage(stage.key);
        await wait(stage.durationMs);
      }
      const seed = input.kind === "url" ? input.value : input.value.name;
      return {
        ...pickMock(seed),
        sourceKind: config.kind,
        sourceUrl: input.kind === "url" ? input.value : null,
      };
    },
  };
}

export const instagramImporter = createMockImporter({
  kind: "instagram",
  label: "Instagram",
  available: true,
  canHandle: (input) => input.kind === "url" && INSTAGRAM_RE.test(input.value.trim()),
});

export const RECIPE_IMPORTERS: RecipeImporter[] = [
  instagramImporter,
  createMockImporter({
    kind: "tiktok",
    label: "TikTok",
    available: false,
    canHandle: (input) => input.kind === "url" && /tiktok\.com/i.test(input.value),
  }),
  createMockImporter({
    kind: "youtube-shorts",
    label: "YouTube Shorts",
    available: false,
    canHandle: (input) =>
      input.kind === "url" && /(youtube\.com\/shorts|youtu\.be)/i.test(input.value),
  }),
  createMockImporter({
    kind: "local-video",
    label: "Vidéo locale",
    available: false,
    canHandle: (input) => input.kind === "file" && input.value.type.startsWith("video/"),
  }),
  createMockImporter({
    kind: "photo",
    label: "Photo",
    available: false,
    canHandle: (input) => input.kind === "file" && input.value.type.startsWith("image/"),
  }),
  createMockImporter({
    kind: "recipe-url",
    label: "Site de recettes",
    available: false,
    canHandle: (input) => input.kind === "url" && /^https?:\/\//i.test(input.value),
  }),
];

/** Trouve l'importeur capable de traiter l'entrée (le premier qui matche gagne). */
export function resolveImporter(input: ImportInput): RecipeImporter | null {
  return RECIPE_IMPORTERS.find((imp) => imp.canHandle(input)) ?? null;
}

export const IMPORT_STAGES = STAGES;
export * from "./types";
