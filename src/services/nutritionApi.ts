// Couche API Nutrition (catalogue propriétaire CIQUAL/USDA, recettes, journal, objectifs).
// Utilise les RPC search_foods / search_foods_advanced et les tables foods, recipes,
// recipe_ingredients, food_logs, favorite_recipes, nutrition_goals.
// NB : cast `as any` volontaire — tables récentes pas encore dans les types générés (cf. reminders.ts).
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

export interface Food {
  id: string;
  name: string;
  normalized_name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  barcode: string | null;
  serving_type: string | null;
  source: "ciqual" | "usda" | "icortex" | "custom";
  verified: boolean;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  sugars_g: number | null;
  fiber_g: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  // micronutriments
  sodium_mg: number | null; magnesium_mg: number | null; phosphorus_mg: number | null;
  potassium_mg: number | null; calcium_mg: number | null; manganese_mg: number | null;
  iron_mg: number | null; copper_mg: number | null; zinc_mg: number | null; selenium_ug: number | null;
  vitamin_a_ug: number | null; vitamin_d_ug: number | null; vitamin_e_mg: number | null;
  vitamin_k_ug: number | null; vitamin_c_mg: number | null; vitamin_b1_mg: number | null;
  vitamin_b2_mg: number | null; vitamin_b3_mg: number | null; vitamin_b5_mg: number | null;
  vitamin_b6_mg: number | null; vitamin_b9_ug: number | null; vitamin_b12_ug: number | null;
  water_g: number | null;
}

export type MealType = "petit-dej" | "dejeuner" | "diner" | "collation" | "autre";

export interface AdvancedFilters {
  category?: string;
  minProtein?: number;
  maxCalories?: number;
  verifiedOnly?: boolean;
}

async function uid(): Promise<string> {
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("Non authentifié");
  return data.user.id;
}

/** Recherche rapide (<100 ms) tolérante aux fautes/accents/phonétique via RPC. */
export async function searchFoods(query: string, limit = 30): Promise<Food[]> {
  if (!query || query.trim().length < 2) return [];
  const { data, error } = await sb.rpc("search_foods", { q: query, max_results: limit });
  if (error) throw error;
  return (data ?? []) as Food[];
}

/** Recherche avancée avec filtres (catégorie, protéines mini, calories maxi, vérifiés). */
export async function searchFoodsAdvanced(query: string | null, f: AdvancedFilters = {}, limit = 50): Promise<Food[]> {
  const { data, error } = await sb.rpc("search_foods_advanced", {
    q: query, p_category: f.category ?? null, min_protein: f.minProtein ?? null,
    max_calories: f.maxCalories ?? null, p_verified: f.verifiedOnly ?? null, max_results: limit,
  });
  if (error) throw error;
  return (data ?? []) as Food[];
}

export async function getFood(id: string): Promise<Food | null> {
  const { data, error } = await sb.from("foods").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Food | null;
}

export async function getFoodByName(name: string): Promise<Food | null> {
  const res = await searchFoods(name, 1);
  return res[0] ?? null;
}

export async function getFoodsByCategory(category: string, limit = 100): Promise<Food[]> {
  const { data, error } = await sb.from("foods").select("*").eq("category", category).order("name").limit(limit);
  if (error) throw error;
  return (data ?? []) as Food[];
}

// ─── Aliments personnalisés ───────────────────────────────────────────────
export type CustomFoodInput = Partial<Food> & { name: string };
export async function createCustomFood(input: CustomFoodInput): Promise<Food> {
  const user_id = await uid();
  const payload = { ...input, source: "custom", verified: false, user_id,
    normalized_name: input.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") };
  const { data, error } = await sb.from("foods").insert(payload).select().single();
  if (error) throw error;
  return data as Food;
}
export async function updateCustomFood(id: string, patch: Partial<Food>): Promise<Food> {
  const { data, error } = await sb.from("foods").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as Food;
}
export async function deleteCustomFood(id: string): Promise<void> {
  const { error } = await sb.from("foods").delete().eq("id", id);
  if (error) throw error;
}
export async function duplicateCustomFood(id: string): Promise<Food> {
  const f = await getFood(id);
  if (!f) throw new Error("Aliment introuvable");
  const { id: _omit, ...rest } = f;
  return createCustomFood({ ...rest, name: `${f.name} (copie)` });
}

// ─── Recettes ──────────────────────────────────────────────────────────────
export interface RecipeIngredientInput { food_id: string; name: string; grams: number; quantity?: number; unit?: string; }
export interface RecipeInput { name: string; servings: number; instructions?: string; category?: string; tags?: string[]; ingredients: RecipeIngredientInput[]; }

export async function createRecipe(input: RecipeInput): Promise<string> {
  const user_id = await uid();
  const { data: recipe, error } = await sb.from("recipes")
    .insert({ user_id, name: input.name, servings: input.servings, instructions: input.instructions ?? null,
      category: input.category ?? null, tags: input.tags ?? null, source: "user" })
    .select().single();
  if (error) throw error;
  const rows = input.ingredients.map((ing, i) => ({
    recipe_id: recipe.id, user_id, food_id: ing.food_id, name: ing.name,
    grams: ing.grams, quantity: ing.quantity ?? null, unit: ing.unit ?? null, sort_order: i,
  }));
  if (rows.length) {
    const { error: e2 } = await sb.from("recipe_ingredients").insert(rows); // trigger recompute auto
    if (e2) throw e2;
  }
  return recipe.id as string;
}

export async function updateRecipe(id: string, input: Partial<RecipeInput>): Promise<void> {
  const user_id = await uid();
  const { error } = await sb.from("recipes").update({
    name: input.name, servings: input.servings, instructions: input.instructions,
    category: input.category, tags: input.tags,
  }).eq("id", id);
  if (error) throw error;
  if (input.ingredients) {
    await sb.from("recipe_ingredients").delete().eq("recipe_id", id);
    const rows = input.ingredients.map((ing, i) => ({
      recipe_id: id, user_id, food_id: ing.food_id, name: ing.name, grams: ing.grams,
      quantity: ing.quantity ?? null, unit: ing.unit ?? null, sort_order: i }));
    if (rows.length) { const { error: e2 } = await sb.from("recipe_ingredients").insert(rows); if (e2) throw e2; }
  }
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await sb.from("recipes").delete().eq("id", id);
  if (error) throw error;
}

export async function getRecipe(id: string): Promise<any> {
  const { data, error } = await sb.from("recipes").select("*, recipe_ingredients(*)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listRecipes(opts: { publicOnly?: boolean } = {}): Promise<any[]> {
  let q = sb.from("recipes").select("*").order("name");
  if (opts.publicOnly) q = q.eq("is_public", true);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function toggleFavoriteRecipe(recipeId: string, fav: boolean): Promise<void> {
  const user_id = await uid();
  if (fav) {
    const { error } = await sb.from("favorite_recipes").upsert({ user_id, recipe_id: recipeId }, { onConflict: "user_id,recipe_id" });
    if (error) throw error;
  } else {
    const { error } = await sb.from("favorite_recipes").delete().eq("user_id", user_id).eq("recipe_id", recipeId);
    if (error) throw error;
  }
}

// ─── Repas types / favoris ───────────────────────────────────────────────
export async function saveFavoriteMeal(name: string, meal: MealType, items: { food_id?: string; recipe_id?: string; custom_name?: string; grams?: number; servings?: number }[]): Promise<string> {
  const user_id = await uid();
  const { data: tpl, error } = await sb.from("meal_templates").insert({ user_id, name, meal }).select().single();
  if (error) throw error;
  const rows = items.map((it, i) => ({ template_id: tpl.id, user_id, food_id: it.food_id ?? null,
    recipe_id: it.recipe_id ?? null, custom_name: it.custom_name ?? null, grams: it.grams ?? null,
    servings: it.servings ?? 1, sort_order: i }));
  if (rows.length) { const { error: e2 } = await sb.from("meal_template_items").insert(rows); if (e2) throw e2; }
  return tpl.id as string;
}

// ─── Journal alimentaire ────────────────────────────────────────────────
export interface LogMealInput { food_id?: string; recipe_id?: string; custom_name?: string; meal?: MealType; date?: string; grams?: number; servings?: number; }
export async function logMeal(input: LogMealInput): Promise<void> {
  const user_id = await uid();
  const { error } = await sb.from("food_logs").insert({
    user_id, food_id: input.food_id ?? null, recipe_id: input.recipe_id ?? null,
    custom_name: input.custom_name ?? null, meal: input.meal ?? "autre",
    date: input.date ?? new Date().toISOString().slice(0, 10),
    grams: input.grams ?? null, servings: input.servings ?? null, source: "manual",
  }); // trigger remplit calories/macros depuis foods
  if (error) throw error;
}

export async function deleteFoodLog(id: string): Promise<void> {
  const { error } = await sb.from("food_logs").delete().eq("id", id);
  if (error) throw error;
}

export async function getFoodLogs(date: string): Promise<any[]> {
  const user_id = await uid();
  const { data, error } = await sb.from("food_logs").select("*").eq("user_id", user_id).eq("date", date).order("created_at");
  if (error) throw error;
  return data ?? [];
}

export interface DailyNutrition { date: string; calories: number; protein_g: number; carbs_g: number; sugars_g: number; fiber_g: number; fat_g: number; saturated_fat_g: number; items: number; }
export async function getDailyNutrition(date: string): Promise<DailyNutrition | null> {
  const user_id = await uid();
  const { data, error } = await sb.from("daily_nutrition").select("*").eq("user_id", user_id).eq("date", date).maybeSingle();
  if (error) throw error;
  return data as DailyNutrition | null;
}

// ─── Objectifs nutritionnels (liés au poids/objectif) ────────────────────
export type Objective = "maintenance" | "bulk" | "cut" | "recomp";
export async function computeNutritionTargets(objective: Objective): Promise<any> {
  const { data, error } = await sb.rpc("compute_nutrition_targets", { p_objective: objective });
  if (error) throw error;
  return data;
}
export async function getNutritionGoals(): Promise<any> {
  const user_id = await uid();
  const { data, error } = await sb.from("nutrition_goals").select("*").eq("user_id", user_id).maybeSingle();
  if (error) throw error;
  return data;
}
