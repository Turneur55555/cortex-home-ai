import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
const supabase = supabaseTyped as any;
import { recipeMacros, perServing, scaleServings, type MacroTotals } from "@/lib/nutrition/recipes";
import type { ImportedRecipe, RecipeSourceKind } from "@/lib/nutrition/recipeImport";
import { entityKey, getOfflineDb } from "@/lib/offline/db";
import { getIsOnline } from "@/lib/offline/networkStatus";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";

/**
 * CRUD des recettes Nutrition V2 (react-query) — offline-first (cf.
 * src/lib/offline/) pour `recipes` + `recipe_ingredients` : lecture/écriture
 * toujours locales (IndexedDB) d'abord, synchronisation vers Supabase en
 * arrière-plan via la sync queue. La duplication et la réanalyse IA
 * (`useDuplicateRecipe`/`useReanalyzeRecipe`) nécessitent Internet (edge
 * function / lecture serveur fraîche) et restent en ligne uniquement, avec
 * un message clair si utilisées hors connexion.
 */
const db = supabase;

export interface Recipe {
  id: string;
  user_id: string | null;
  name: string;
  servings: number;
  prep_minutes: number | null;
  instructions: string | null;
  image_path: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  /** Recette importée par IA (recipeImport V2) — non-null seulement pour ces recettes. */
  source_kind: string | null;
  source_url: string | null;
  source_image_url: string | null;
  /** Légende/description ORIGINALE du post source — distincte de `notes` (hypothèses de l'IA). */
  source_description: string | null;
  /** Résumé structuré généré par l'IA (principe, ingrédients clés, cuisson, points importants). */
  ai_summary: string | null;
  /** @handle Instagram de l'auteur — best-effort, peut être `null`. */
  source_author: string | null;
  cook_minutes: number | null;
  last_reanalyzed_at: string | null;
  reanalysis_count: number;
  confidence: number | null;
  notes: string | null;
  is_favorite: boolean;
  per_serving_calories: number | null;
  per_serving_proteins: number | null;
  per_serving_carbs: number | null;
  per_serving_fats: number | null;
  per_serving_fiber: number | null;
}

/** Ligne locale (sans jointure `items` — disponible seulement en ligne). */
interface RecipeIngredientRow {
  id: string;
  recipe_id: string;
  user_id: string;
  item_id: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  grams: number | null;
  category: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient extends RecipeIngredientRow {
  /** Macros per_100g héritées de l'item lié (jointure) — présent seulement quand récupéré en ligne. */
  items?: {
    calories_per_100g: number | null;
    protein_per_100g: number | null;
    carbs_per_100g: number | null;
    fat_per_100g: number | null;
  } | null;
}

export interface RecipeWithMacros extends Recipe {
  ingredients: RecipeIngredient[];
  totalMacros: MacroTotals;
  perServingMacros: MacroTotals;
  /** Somme des grammages d'ingrédients (null si un ingrédient n'a pas de grammage connu). */
  totalGrams: number | null;
}

export const RECIPES_KEY = ["recipes"] as const;
const recipeKey = (id: string) => ["recipe", id] as const;

const toMacroInput = (ing: RecipeIngredient) => ({
  grams: ing.grams,
  caloriesPer100g: ing.items?.calories_per_100g,
  proteinPer100g: ing.items?.protein_per_100g,
  carbsPer100g: ing.items?.carbs_per_100g,
  fatPer100g: ing.items?.fat_per_100g,
});

const recipesRepo = createOfflineRepository<Recipe>("recipes");
const ingredientsRepo = createOfflineRepository<RecipeIngredientRow>("recipe_ingredients");

function computeMacros(r: Recipe, ingredients: RecipeIngredient[]): RecipeWithMacros {
  const totalGrams = ingredients.every((ing) => ing.grams != null && ing.grams > 0)
    ? ingredients.reduce((sum, ing) => sum + (ing.grams ?? 0), 0)
    : null;

  // Recette importée (V2 recipeImport) : ses ingrédients ont des noms
  // libres sans item_id fiable vers le catalogue `items` — recipeMacros()
  // renverrait 0. Ses macros/portion ont été figées à l'import
  // (recipes.per_serving_*) : c'est cette valeur qui fait foi.
  if (r.per_serving_calories != null) {
    const perS = {
      calories: r.per_serving_calories,
      protein: r.per_serving_proteins ?? 0,
      carbs: r.per_serving_carbs ?? 0,
      fat: r.per_serving_fats ?? 0,
    };
    return {
      ...r,
      ingredients,
      totalMacros: scaleServings(perS, r.servings),
      perServingMacros: perS,
      totalGrams,
    };
  }

  const total = recipeMacros(ingredients.map(toMacroInput));
  return {
    ...r,
    ingredients,
    totalMacros: total,
    perServingMacros: perServing(total, r.servings),
    totalGrams,
  };
}

export function useRecipes() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: [...RECIPES_KEY, userId],
    enabled: !!userId,
    queryFn: async (): Promise<Recipe[]> => {
      if (!userId) return [];
      if (getIsOnline()) {
        try {
          const { data, error } = await db
            .from("recipes")
            .select("*")
            .eq("user_id", userId)
            .order("is_favorite", { ascending: false })
            .order("name", { ascending: true });
          if (!error && data) {
            await hydrateEntitiesFromServer("recipes", userId, data as Recipe[]);
          }
        } catch {
          // Hors ligne ou erreur réseau : on continue avec le store local.
        }
      }
      const local = await recipesRepo.list(userId);
      return [...local].sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    },
  });
}

async function ingredientsForRecipe(
  userId: string,
  recipeId: string,
): Promise<RecipeIngredientRow[]> {
  const all = await ingredientsRepo.list(userId);
  return all
    .filter((ing) => ing.recipe_id === recipeId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

async function fetchRecipeWithMacros(id: string, userId: string): Promise<RecipeWithMacros> {
  if (getIsOnline()) {
    try {
      const { data: recipe, error } = await db.from("recipes").select("*").eq("id", id).single();
      if (error) throw error;
      const { data: ings, error: ingErr } = await db
        .from("recipe_ingredients")
        .select("*, items(calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)")
        .eq("recipe_id", id)
        .order("sort_order", { ascending: true });
      if (ingErr) throw ingErr;
      const ingredients = (ings ?? []) as unknown as RecipeIngredient[];
      const r = recipe as Recipe;
      await hydrateEntitiesFromServer("recipes", userId, [r]);
      await hydrateEntitiesFromServer(
        "recipe_ingredients",
        userId,
        ingredients.map(({ items: _items, ...rest }) => rest) as RecipeIngredientRow[],
      );
      return computeMacros(r, ingredients);
    } catch {
      // Hors ligne ou erreur réseau : on continue avec le store local.
    }
  }
  const r = await recipesRepo.get(id);
  if (!r) throw new Error("Recette introuvable (hors connexion et jamais synchronisée)");
  const ingredients = await ingredientsForRecipe(userId, id);
  return computeMacros(r, ingredients);
}

/** Recette complète avec ingrédients (jointure macros items si en ligne) + macros calculées. */
export function useRecipe(id: string | null | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: recipeKey(id ?? "none"),
    enabled: !!id && !!userId,
    queryFn: () => fetchRecipeWithMacros(id as string, userId as string),
  });
}

export interface RecipeIngredientPatch {
  name: string;
  quantity: number | null;
  unit: string | null;
  grams: number | null;
  category?: string | null;
}

export interface RecipeUpdatePatch {
  id: string;
  name?: string;
  servings?: number;
  per_serving_calories?: number;
  per_serving_proteins?: number;
  per_serving_carbs?: number;
  per_serving_fats?: number;
  per_serving_fiber?: number;
  tags?: string[];
  ai_summary?: string | null;
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  /** Si fourni, remplace intégralement les ingrédients existants (delete + insert). */
  ingredients?: RecipeIngredientPatch[];
}

/** Modifie une recette (titre/portions/macros/ingrédients) — pour la fiche recette (module Recettes). */
export function useUpdateRecipe() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ingredients, ...patch }: RecipeUpdatePatch) => {
      if (!user) throw new Error("Non authentifié");
      if (Object.keys(patch).length > 0) {
        await recipesRepo.update(id, user.id, patch as Partial<Recipe>);
      }
      if (ingredients) {
        const existing = await ingredientsForRecipe(user.id, id);
        for (const ing of existing) {
          await ingredientsRepo.remove(ing.id, user.id);
        }
        for (let idx = 0; idx < ingredients.length; idx += 1) {
          const ing = ingredients[idx];
          await ingredientsRepo.create(user.id, {
            recipe_id: id,
            item_id: null,
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            grams: ing.grams,
            category: ing.category ?? null,
            sort_order: idx,
          });
        }
      }
      return id;
    },
    onSuccess: (id) => {
      toast.success("Recette mise à jour");
      qc.invalidateQueries({ queryKey: RECIPES_KEY });
      qc.invalidateQueries({ queryKey: recipeKey(id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleRecipeFavorite() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      if (!user) throw new Error("Non authentifié");
      await recipesRepo.update(id, user.id, { is_favorite: isFavorite });
      return { id, isFavorite };
    },
    onSuccess: ({ id, isFavorite }) => {
      toast.success(isFavorite ? "Ajoutée aux favoris" : "Retirée des favoris");
      qc.invalidateQueries({ queryKey: RECIPES_KEY });
      qc.invalidateQueries({ queryKey: recipeKey(id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Non authentifié");
      // Cascade locale des ingrédients : le serveur le fait déjà via
      // ON DELETE CASCADE, ici on nettoie juste le store local pour ne pas
      // laisser des entités orphelines (pas d'opération de sync séparée
      // nécessaire pour elles).
      const existing = await ingredientsForRecipe(user.id, id);
      const idbDb = await getOfflineDb();
      for (const ing of existing) {
        await idbDb.delete("entities", entityKey("recipe_ingredients", ing.id));
      }
      await recipesRepo.remove(id, user.id);
      return id;
    },
    onSuccess: () => {
      toast.success("Recette supprimée");
      qc.invalidateQueries({ queryKey: RECIPES_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Duplique une recette (nouvelle ligne `recipes` + copie des ingrédients) — jamais de source_url (évite un doublon de dédoublonnage import). Nécessite une connexion (lecture serveur fraîche + insertion immédiate). */
export function useDuplicateRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      if (!getIsOnline()) {
        throw new Error("Dupliquer une recette nécessite une connexion Internet.");
      }
      const {
        data: { user },
      } = await supabaseTyped.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const original = await fetchRecipeWithMacros(id, user.id);

      const { data: inserted, error: insErr } = await db
        .from("recipes")
        .insert({
          user_id: user.id,
          name: `${original.name} (copie)`,
          servings: original.servings,
          prep_minutes: original.prep_minutes,
          cook_minutes: original.cook_minutes,
          instructions: original.instructions,
          tags: original.tags,
          source_kind: null,
          source_url: null,
          source_image_url: original.source_image_url,
          source_description: original.source_description,
          ai_summary: original.ai_summary,
          source_author: original.source_author,
          confidence: original.confidence,
          notes: original.notes,
          per_serving_calories: original.per_serving_calories,
          per_serving_proteins: original.per_serving_proteins,
          per_serving_carbs: original.per_serving_carbs,
          per_serving_fats: original.per_serving_fats,
          per_serving_fiber: original.per_serving_fiber,
        })
        .select("id")
        .single();
      if (insErr || !inserted) throw insErr ?? new Error("Duplication impossible");
      const newId = (inserted as { id: string }).id;

      if (original.ingredients.length > 0) {
        const rows = original.ingredients.map((ing) => ({
          recipe_id: newId,
          user_id: user.id,
          item_id: ing.item_id,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          grams: ing.grams,
          category: ing.category,
          sort_order: ing.sort_order,
        }));
        const { error: ingErr } = await db.from("recipe_ingredients").insert(rows);
        if (ingErr) throw ingErr;
      }
      return newId;
    },
    onSuccess: () => {
      toast.success("Recette dupliquée");
      qc.invalidateQueries({ queryKey: RECIPES_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

interface ReanalyzeArgs {
  recipeId: string;
  sourceKind: RecipeSourceKind;
  sourceUrl: string;
}

interface RecipeReanalyzeEdgeResponse {
  recipe?: ImportedRecipe;
  error?: string;
}

/**
 * "Réanalyser la recette" — repart du lien Instagram enregistré et relance
 * tout le pipeline (edge function `recipe-import`, `reanalyze: true` :
 * ignore le cache/l'association existante, voir recipe-import-handler.ts).
 * Nécessite une connexion (appel edge function IA) — message clair sinon.
 * Ne modifie PAS `recipes` — retourne la fiche fraîche pour que l'appelant
 * (RecipeDetailSheet) l'affiche en comparaison et laisse l'utilisateur
 * décider via `useUpdateRecipe` de l'appliquer ou non. L'historique de
 * réanalyse (compteur + date), lui, est mis à jour côté serveur à chaque
 * appel, qu'elle soit appliquée ou non — d'où l'invalidation de la recette.
 */
export function useReanalyzeRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recipeId,
      sourceKind,
      sourceUrl,
    }: ReanalyzeArgs): Promise<ImportedRecipe> => {
      if (!getIsOnline()) {
        throw new Error("Réanalyser une recette nécessite une connexion Internet.");
      }
      const { data, error } = await supabaseTyped.functions.invoke<RecipeReanalyzeEdgeResponse>(
        "recipe-import",
        {
          body: {
            source: sourceKind,
            input: { kind: "url", value: sourceUrl },
            reanalyze: true,
            recipeId,
          },
        },
      );
      if (error) throw new Error(error.message);
      if (!data || data.error || !data.recipe)
        throw new Error(data?.error ?? "La réanalyse a échoué.");
      return data.recipe;
    },
    onSuccess: (_result, { recipeId }) => {
      qc.invalidateQueries({ queryKey: recipeKey(recipeId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
