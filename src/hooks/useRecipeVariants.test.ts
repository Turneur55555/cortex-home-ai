import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Proposer des variantes" — vérifie que la génération/sauvegarde reste
 * strictement en ligne (endpoint stateless + insert direct), que la recette
 * originale n'est JAMAIS modifiée (aucun `.update(...)` sur `recipes`), et
 * qu'une variante sauvegardée devient une recette indépendante liée via
 * `source_recipe_id`. Même convention de mock que
 * useUserExercisePhotos.test.ts (mock `@/integrations/supabase/client`,
 * fonctions de mutation testées directement — pas de hook React à monter).
 */

const AUTH_USER = { id: "user-1" };

interface InsertedRecipe extends Record<string, unknown> {
  id: string;
}

let insertedRecipes: InsertedRecipe[] = [];
let insertedIngredients: Record<string, unknown>[] = [];
let recipeIdCounter = 0;
let updateCalledOnRecipes = false;

const fromSpy = vi.fn((table: string) => {
  if (table === "recipes") {
    return {
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            const id = `recipe-${++recipeIdCounter}`;
            insertedRecipes.push({ id, ...row });
            return { data: { id }, error: null };
          },
        }),
      }),
      update: () => {
        updateCalledOnRecipes = true;
        return { eq: () => Promise.resolve({ error: null }) };
      },
    };
  }
  if (table === "recipe_ingredients") {
    return {
      insert: (rows: Record<string, unknown>[]) => {
        insertedIngredients.push(...rows);
        return Promise.resolve({ error: null });
      },
    };
  }
  throw new Error(`Appel Supabase inattendu sur la table "${table}"`);
});

const functionsInvokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: AUTH_USER } })) },
    functions: { invoke: (...args: unknown[]) => functionsInvokeMock(...args) },
    from: (table: string) => fromSpy(table),
  },
}));

// Import après le mock (obligatoire avec vi.mock hoisté).
import { generateRecipeVariants, saveRecipeVariantAsRecipe } from "./useRecipeVariants";
import type { RecipeVariant } from "@/lib/nutrition/recipeVariants/types";
import type { RecipeWithMacros } from "./useRecipes";

beforeEach(() => {
  insertedRecipes = [];
  insertedIngredients = [];
  updateCalledOnRecipes = false;
  recipeIdCounter = 0;
  fromSpy.mockClear();
  functionsInvokeMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SAMPLE_VARIANT: RecipeVariant = {
  name: "Poulet crémeux (thon)",
  explanation: "Le poulet est remplacé par du thon en boîte.",
  servings: 4,
  instructions: "Émiette le thon, fais réduire la crème, sers.",
  ingredients: [
    { name: "Thon en boîte", quantity: 400, unit: "g", grams: 400, category: "Poissons" },
    { name: "Crème entière", quantity: 20, unit: "cl", grams: 200, category: "Produits laitiers" },
  ],
  perServing: { calories: 410, proteins: 38, carbs: 6, fats: 24, fiber: 2 },
};

describe("saveRecipeVariantAsRecipe — enregistrement en nouvelle recette indépendante", () => {
  it("crée une nouvelle recette liée via source_recipe_id, sans jamais toucher la recette originale", async () => {
    const originalRecipeId = "recipe-original-42";
    const newId = await saveRecipeVariantAsRecipe({
      sourceRecipeId: originalRecipeId,
      variant: SAMPLE_VARIANT,
    });

    expect(newId).toBe("recipe-1");
    expect(insertedRecipes).toHaveLength(1);
    expect(insertedRecipes[0].source_recipe_id).toBe(originalRecipeId);
    expect(insertedRecipes[0].name).toBe(SAMPLE_VARIANT.name);
    expect(insertedRecipes[0].notes).toBe(SAMPLE_VARIANT.explanation);
    expect(insertedRecipes[0].instructions).toBe(SAMPLE_VARIANT.instructions);
    expect(insertedRecipes[0].source_url).toBeNull();
    expect(insertedRecipes[0].per_serving_calories).toBe(410);

    expect(insertedIngredients).toHaveLength(2);
    expect(insertedIngredients.every((i) => i.recipe_id === "recipe-1")).toBe(true);

    // Recette originale : aucun update, et l'unique insert crée un NOUVEL id (jamais celui de l'originale).
    expect(updateCalledOnRecipes).toBe(false);
    expect(insertedRecipes[0].id).not.toBe(originalRecipeId);
  });

  it("refuse hors connexion, sans aucun appel Supabase", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(
      saveRecipeVariantAsRecipe({ sourceRecipeId: "recipe-original-42", variant: SAMPLE_VARIANT }),
    ).rejects.toThrow(/connexion/i);
    expect(fromSpy).not.toHaveBeenCalled();
  });
});

const SOURCE_RECIPE = {
  id: "recipe-original-42",
  name: "Poulet crémeux au parmesan",
  servings: 4,
  instructions: null,
  ingredients: [],
  totalMacros: { calories: 2048, protein: 186, carbs: 36.8, fat: 128.4 },
  perServingMacros: { calories: 512, protein: 46.5, carbs: 9.2, fat: 32.1 },
  totalGrams: null,
  per_serving_fiber: 2.3,
} as unknown as RecipeWithMacros;

describe("generateRecipeVariants — un seul appel edge function par demande", () => {
  it("retourne exactement 3 variantes en cas de succès", async () => {
    functionsInvokeMock.mockResolvedValue({
      data: { variants: [SAMPLE_VARIANT, SAMPLE_VARIANT, SAMPLE_VARIANT] },
      error: null,
    });
    const result = await generateRecipeVariants({
      recipe: SOURCE_RECIPE,
      requestType: "more_protein",
    });
    expect(result).toHaveLength(3);
    expect(functionsInvokeMock).toHaveBeenCalledTimes(1);
    expect(functionsInvokeMock).toHaveBeenCalledWith("recipe-variants", expect.any(Object));
  });

  it("rejette si la réponse ne contient pas exactement 3 variantes", async () => {
    functionsInvokeMock.mockResolvedValue({
      data: { variants: [SAMPLE_VARIANT, SAMPLE_VARIANT] },
      error: null,
    });
    await expect(
      generateRecipeVariants({ recipe: SOURCE_RECIPE, requestType: "more_protein" }),
    ).rejects.toThrow(/incorrect/i);
  });

  it("rejette proprement une réponse d'erreur du serveur (ex. limite atteinte)", async () => {
    functionsInvokeMock.mockResolvedValue({
      data: { error: "Limite atteinte (15/15 demandes par heure). Réessaie plus tard." },
      error: null,
    });
    await expect(
      generateRecipeVariants({ recipe: SOURCE_RECIPE, requestType: "more_protein" }),
    ).rejects.toThrow(/Limite atteinte/i);
  });

  it("refuse hors connexion, sans appeler l'edge function", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(
      generateRecipeVariants({ recipe: SOURCE_RECIPE, requestType: "more_protein" }),
    ).rejects.toThrow(/connexion/i);
    expect(functionsInvokeMock).not.toHaveBeenCalled();
  });

  it("transmet la demande personnalisée dans le corps de l'appel", async () => {
    functionsInvokeMock.mockResolvedValue({
      data: { variants: [SAMPLE_VARIANT, SAMPLE_VARIANT, SAMPLE_VARIANT] },
      error: null,
    });
    await generateRecipeVariants({
      recipe: SOURCE_RECIPE,
      requestType: "custom",
      customPrompt: "Remplace le poulet par du saumon",
    });
    const [, invokeArgs] = functionsInvokeMock.mock.calls[0] as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(invokeArgs.body.requestType).toBe("custom");
    expect(invokeArgs.body.customPrompt).toBe("Remplace le poulet par du saumon");
  });
});
