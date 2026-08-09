// Étape "Database" du pipeline — toute la persistance de recipe-import en un
// seul endroit, en deux couches :
//
// 1. Cache GLOBAL (`recipe_import_cache`, tous utilisateurs confondus, clé =
//    (source_kind, source_url)) — écrit avec la clé service_role (bypass RLS,
//    voir migration). Une publication n'est analysée par l'IA qu'UNE SEULE
//    FOIS, jamais par utilisateur.
// 2. Association PAR UTILISATEUR (`recipes`/`recipe_ingredients`, RLS
//    user_id = auth.uid(), inchangé depuis la V2) — chaque utilisateur garde
//    sa propre ligne `recipes` (consommée telle quelle par useRecipes.ts,
//    RecipesListSheet, RecipeDetailSheet). Quand la recette est déjà en
//    cache global, cette association est une copie DB pure depuis le cache :
//    aucun appel IA, aucun recalcul de macros, aucune recréation
//    d'ingrédients par l'IA (seulement des lignes `recipe_ingredients`
//    propres à l'utilisateur, copiées depuis le cache — nécessaires pour que
//    ses propres écrans fonctionnent sans changement).
import type { SupabaseClient } from "@supabase/supabase-js";
import { RecipeImportError, type RecipeExtraction, type RecipeSourceKind } from "./recipe-import.ts";
import { LANGUAGE_RULE_VERSION } from "./recipe-language.ts";

const RECIPE_COLUMNS =
  "id, name, servings, source_image_url, source_description, ai_summary, source_author, prep_minutes, cook_minutes, tags, confidence, notes, per_serving_calories, per_serving_proteins, per_serving_carbs, per_serving_fats, per_serving_fiber";

// ─── Association par utilisateur (recipes / recipe_ingredients) ──────────────

interface RecipeRow {
  id: string;
  name: string;
  servings: number;
  confidence: number | null;
  notes: string | null;
  source_image_url: string | null;
  source_description: string | null;
  ai_summary: string | null;
  source_author: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  tags: string[] | null;
  per_serving_calories: number | null;
  per_serving_proteins: number | null;
  per_serving_carbs: number | null;
  per_serving_fats: number | null;
  per_serving_fiber: number | null;
}

interface RecipeIngredientRow {
  name: string;
  quantity: number | null;
  unit: string | null;
  grams: number | null;
  category: string | null;
}

function userRowToExtraction(row: RecipeRow, ingredients: RecipeIngredientRow[]): RecipeExtraction {
  return {
    title: row.name,
    imageUrl: row.source_image_url,
    servings: row.servings,
    confidence: row.confidence ?? 0.5,
    perServing: {
      calories: row.per_serving_calories ?? 0,
      proteins: row.per_serving_proteins ?? 0,
      carbs: row.per_serving_carbs ?? 0,
      fats: row.per_serving_fats ?? 0,
      fiber: row.per_serving_fiber ?? 0,
    },
    ingredients: ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity ?? 0,
      unit: i.unit ?? "pièce",
      grams: i.grams,
      category: (i.category as RecipeExtraction["ingredients"][number]["category"]) ?? null,
    })),
    notes: row.notes ?? "",
    originalCaption: row.source_description,
    aiSummary: row.ai_summary,
    authorHandle: row.source_author,
    prepMinutes: row.prep_minutes,
    cookMinutes: row.cook_minutes,
    tags: row.tags ?? [],
  };
}

/** Recette déjà importée par CET utilisateur pour ce lien exact — évite de recréer une association en double. */
export async function findUserRecipe(
  supa: SupabaseClient,
  userId: string,
  sourceUrl: string,
): Promise<{ id: string; extraction: RecipeExtraction } | null> {
  const { data: recipe, error } = await supa
    .from("recipes")
    .select(RECIPE_COLUMNS)
    .eq("user_id", userId)
    .eq("source_url", sourceUrl)
    .maybeSingle();
  if (error || !recipe) return null;

  const { data: ingredients } = await supa
    .from("recipe_ingredients")
    .select("name, quantity, unit, grams, category")
    .eq("recipe_id", (recipe as RecipeRow).id)
    .order("sort_order", { ascending: true });

  return {
    id: (recipe as RecipeRow).id,
    extraction: userRowToExtraction(recipe as RecipeRow, (ingredients ?? []) as RecipeIngredientRow[]),
  };
}

function extractionToRecipeRow(extraction: RecipeExtraction) {
  return {
    name: extraction.title,
    servings: extraction.servings,
    source_image_url: extraction.imageUrl,
    source_description: extraction.originalCaption,
    ai_summary: extraction.aiSummary,
    source_author: extraction.authorHandle,
    prep_minutes: extraction.prepMinutes,
    cook_minutes: extraction.cookMinutes,
    tags: extraction.tags.length > 0 ? extraction.tags : null,
    confidence: extraction.confidence,
    notes: extraction.notes || null,
    per_serving_calories: extraction.perServing.calories,
    per_serving_proteins: extraction.perServing.proteins,
    per_serving_carbs: extraction.perServing.carbs,
    per_serving_fats: extraction.perServing.fats,
    per_serving_fiber: extraction.perServing.fiber,
  };
}

/**
 * Crée la recette + ses ingrédients POUR CET UTILISATEUR à partir d'une
 * `RecipeExtraction` déjà calculée (fraîche ou depuis le cache global) — pure
 * écriture DB, jamais d'appel IA ici. Aucun enregistrement incomplet : si les
 * ingrédients échouent, la recette orpheline est retirée avant de relancer
 * l'erreur.
 */
export async function createUserRecipeFromExtraction(
  supa: SupabaseClient,
  userId: string,
  source: RecipeSourceKind,
  sourceUrl: string,
  extraction: RecipeExtraction,
): Promise<string> {
  const { data: inserted, error: insertErr } = await supa
    .from("recipes")
    .insert({
      user_id: userId,
      source_kind: source,
      source_url: sourceUrl,
      ...extractionToRecipeRow(extraction),
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    // 23505 = violation de la contrainte unique (user_id, source_url) — un import
    // concurrent (double clic, deux onglets) a déjà créé l'association : on la
    // réutilise plutôt que d'échouer.
    if ((insertErr as { code?: string } | null)?.code === "23505") {
      const existing = await findUserRecipe(supa, userId, sourceUrl);
      if (existing) return existing.id;
    }
    throw new RecipeImportError("server_error", "Recette analysée mais impossible à enregistrer. Réessaie.");
  }

  const recipeId = (inserted as { id: string }).id;

  if (extraction.ingredients.length > 0) {
    const rows = extraction.ingredients.map((ing, idx) => ({
      recipe_id: recipeId,
      user_id: userId,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      grams: ing.grams,
      category: ing.category,
      sort_order: idx,
    }));
    const { error: ingErr } = await supa.from("recipe_ingredients").insert(rows);
    if (ingErr) {
      console.error("[recipe-db] recipe_ingredients insert failed, rolling back recipe:", ingErr);
      await supa.from("recipes").delete().eq("id", recipeId);
      throw new RecipeImportError(
        "server_error",
        "Recette analysée mais impossible à enregistrer complètement. Réessaie.",
      );
    }
  }

  return recipeId;
}

/**
 * Historique de réanalyse — incrémenté à CHAQUE relance du pipeline pour une
 * recette existante (indépendamment du fait que l'utilisateur applique ou
 * non le résultat ensuite). Lecture-puis-écriture (pas d'atomicité forte :
 * usage mono-utilisateur, clic manuel — un compteur légèrement sous-estimé
 * en cas de double-clic simultané est un risque acceptable).
 */
export async function bumpReanalysisHistory(supa: SupabaseClient, recipeId: string): Promise<void> {
  const { data } = await supa.from("recipes").select("reanalysis_count").eq("id", recipeId).maybeSingle();
  const count = (data as { reanalysis_count?: number } | null)?.reanalysis_count ?? 0;
  const { error } = await supa
    .from("recipes")
    .update({ reanalysis_count: count + 1, last_reanalyzed_at: new Date().toISOString() })
    .eq("id", recipeId);
  if (error) console.error("[recipe-db] bumpReanalysisHistory failed (non-fatal):", error);
}

// ─── Cache global (service_role, tous utilisateurs) ───────────────────────────

interface CacheRow {
  title: string;
  servings: number;
  confidence: number | null;
  notes: string | null;
  source_image_url: string | null;
  source_description: string | null;
  ai_summary: string | null;
  source_author: string | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  tags: string[] | null;
  per_serving_calories: number;
  per_serving_proteins: number;
  per_serving_carbs: number;
  per_serving_fats: number;
  per_serving_fiber: number;
  ingredients: unknown;
}

const CACHE_SELECT =
  "title, servings, confidence, notes, source_image_url, source_description, ai_summary, source_author, prep_minutes, cook_minutes, tags, per_serving_calories, per_serving_proteins, per_serving_carbs, per_serving_fats, per_serving_fiber, ingredients";

function cacheRowToExtraction(row: CacheRow): RecipeExtraction {
  const ingredients = Array.isArray(row.ingredients) ? (row.ingredients as RecipeExtraction["ingredients"]) : [];
  return {
    title: row.title,
    imageUrl: row.source_image_url,
    servings: row.servings,
    confidence: row.confidence ?? 0.5,
    perServing: {
      calories: row.per_serving_calories,
      proteins: row.per_serving_proteins,
      carbs: row.per_serving_carbs,
      fats: row.per_serving_fats,
      fiber: row.per_serving_fiber,
    },
    ingredients,
    notes: row.notes ?? "",
    originalCaption: row.source_description,
    aiSummary: row.ai_summary,
    authorHandle: row.source_author,
    prepMinutes: row.prep_minutes,
    cookMinutes: row.cook_minutes,
    tags: row.tags ?? [],
  };
}

/** Recette déjà analysée par n'importe quel utilisateur pour ce lien — évite de rappeler l'IA. */
export async function findCachedRecipe(
  admin: SupabaseClient,
  source: RecipeSourceKind,
  sourceUrl: string,
): Promise<RecipeExtraction | null> {
  const { data, error } = await admin
    .from("recipe_import_cache")
    .select(CACHE_SELECT)
    .eq("source_kind", source)
    .eq("source_url", sourceUrl)
    .maybeSingle();
  if (error || !data) return null;
  return cacheRowToExtraction(data as CacheRow);
}

function extractionToCacheRow(source: RecipeSourceKind, sourceUrl: string, extraction: RecipeExtraction) {
  return {
    source_kind: source,
    source_url: sourceUrl,
    title: extraction.title,
    servings: extraction.servings,
    confidence: extraction.confidence,
    notes: extraction.notes || null,
    source_image_url: extraction.imageUrl,
    source_description: extraction.originalCaption,
    ai_summary: extraction.aiSummary,
    source_author: extraction.authorHandle,
    prep_minutes: extraction.prepMinutes,
    cook_minutes: extraction.cookMinutes,
    tags: extraction.tags.length > 0 ? extraction.tags : null,
    per_serving_calories: extraction.perServing.calories,
    per_serving_proteins: extraction.perServing.proteins,
    per_serving_carbs: extraction.perServing.carbs,
    per_serving_fats: extraction.perServing.fats,
    per_serving_fiber: extraction.perServing.fiber,
    ingredients: extraction.ingredients,
  };
}

/**
 * Écrit le résultat d'une analyse fraîche dans le cache global. Non-fatal :
 * si l'écriture échoue pour une raison autre qu'une course (23505), on
 * continue avec l'extraction déjà calculée plutôt que de faire échouer tout
 * l'import pour un problème de cache. Sur une course, on réutilise la version
 * du gagnant plutôt que d'en garder deux différentes en cache.
 */
export async function saveCachedRecipe(
  admin: SupabaseClient,
  source: RecipeSourceKind,
  sourceUrl: string,
  extraction: RecipeExtraction,
): Promise<RecipeExtraction> {
  const { error } = await admin.from("recipe_import_cache").insert(extractionToCacheRow(source, sourceUrl, extraction));
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      const existing = await findCachedRecipe(admin, source, sourceUrl);
      if (existing) return existing;
    }
    console.error("[recipe-db] cache insert failed (non-fatal):", error);
  }
  return extraction;
}

/**
 * Réanalyse ("Réanalyser la recette") : remplace l'entrée de cache existante
 * par l'analyse fraîche — contrairement à `saveCachedRecipe`, on VEUT ici
 * écraser une entrée déjà présente (c'est tout le sens de la réanalyse).
 * Non-fatal comme `saveCachedRecipe` : un échec d'écriture cache ne doit
 * jamais faire échouer la réanalyse elle-même.
 */
export async function refreshCachedRecipe(
  admin: SupabaseClient,
  source: RecipeSourceKind,
  sourceUrl: string,
  extraction: RecipeExtraction,
): Promise<RecipeExtraction> {
  const { error } = await admin
    .from("recipe_import_cache")
    .upsert(extractionToCacheRow(source, sourceUrl, extraction), { onConflict: "source_kind,source_url" });
  if (error) console.error("[recipe-db] cache refresh failed (non-fatal):", error);
  return extraction;
}
