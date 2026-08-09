// Orchestration de POST /recipe-variants — extrait de recipe-variants/index.ts
// pour être testable directement (aucune dépendance à `Deno.serve`/`Deno.env`
// ici, uniquement des dépendances injectées), même pattern que
// recipe-import-handler.ts. Endpoint STATELESS (comme recipe-assistant) : le
// client envoie un snapshot de la recette déjà chargée, aucune lecture DB
// serveur, aucune écriture ici — la persistance ("Enregistrer comme nouvelle
// recette") est un insert direct côté client (useSaveRecipeVariantAsRecipe),
// hors du périmètre de cet endpoint.
//
// Pipeline : validation entrée -> rate limit -> UN appel Gemini (tool calling
// forcé) -> validation stricte de la sortie -> réponse.
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit, recordRateLimit } from "./rate-limit.ts";
import { safeNum } from "./recipe-import.ts";
import { sanitizeCategory } from "./nutrition-engine.ts";
import {
  isRecipeVariantRequestType,
  RecipeVariantError,
  type RecipeVariantIngredient,
  type RecipeVariantRequestType,
  type RecipeVariantSourceSnapshot,
} from "./recipe-variants.ts";
import { buildVariantSystemPrompt, callGeminiForVariants } from "./recipe-variant-tool.ts";
import { sanitizeRecipeVariants } from "./recipe-variant-engine.ts";

export interface RecipeVariantsDeps {
  /** Client Supabase authentifié comme l'utilisateur courant (RLS active) — utilisé uniquement pour le rate-limit. */
  userSupa: SupabaseClient;
  userId: string;
  geminiApiKey: string | null;
}

const MAX_PER_HOUR = 15;

function errorBody(message: string, code = "server_error"): Record<string, unknown> {
  return { error: message, code };
}

function errorFromException(err: unknown, fallback = "Erreur inattendue. Réessaie."): Record<string, unknown> {
  if (err instanceof RecipeVariantError) return { error: err.message, code: err.code };
  console.error("[recipe-variants] unexpected error:", err);
  return { error: fallback, code: "server_error" };
}

function sanitizeSourceIngredients(raw: unknown): RecipeVariantIngredient[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 60).map((it) => {
    const i = (it ?? {}) as Record<string, unknown>;
    return {
      name: typeof i.name === "string" ? i.name.trim().slice(0, 150) : "Ingrédient",
      quantity: safeNum(i.quantity, 1),
      unit: typeof i.unit === "string" ? i.unit.trim().slice(0, 30) : "pièce",
      grams: (() => {
        const g = safeNum(i.grams, 0);
        return g > 0 ? g : null;
      })(),
      category: sanitizeCategory(i.category),
    };
  });
}

function sanitizeSourceRecipe(raw: unknown): RecipeVariantSourceSnapshot | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 120) : "";
  if (!name) return null;

  const ingredients = sanitizeSourceIngredients(r.ingredients);
  if (ingredients.length === 0) return null;

  const ps = (r.perServing ?? {}) as Record<string, unknown>;
  return {
    name,
    servings: Math.max(1, Math.round(safeNum(r.servings, 1)) || 1),
    perServing: {
      calories: safeNum(ps.calories, 0),
      proteins: safeNum(ps.proteins, 0),
      carbs: safeNum(ps.carbs, 0),
      fats: safeNum(ps.fats, 0),
      fiber: safeNum(ps.fiber, 0),
    },
    ingredients,
    instructions: typeof r.instructions === "string" && r.instructions.trim() ? r.instructions.trim().slice(0, 4000) : null,
  };
}

/** Toujours HTTP 200 côté appelant — le corps distingue succès (`variants`) et échec (`error`/`code`), même convention que recipe-import. */
export async function handleRecipeVariants(rawBody: unknown, deps: RecipeVariantsDeps): Promise<Record<string, unknown>> {
  if (!deps.geminiApiKey) return errorBody("Service IA indisponible (aucune clé API configurée).");

  const body = (rawBody ?? {}) as {
    requestType?: unknown;
    customPrompt?: unknown;
    recipe?: unknown;
  };

  if (!isRecipeVariantRequestType(body.requestType)) {
    return errorBody("Type de demande invalide.", "invalid_input");
  }
  const requestType: RecipeVariantRequestType = body.requestType;

  let customPrompt: string | null = null;
  if (requestType === "custom") {
    const raw = typeof body.customPrompt === "string" ? body.customPrompt.trim() : "";
    if (!raw) return errorBody("Décris ta demande personnalisée.", "invalid_input");
    if (raw.length > 500) return errorBody("Demande trop longue (max 500 caractères).", "invalid_input");
    customPrompt = raw;
  }

  const recipe = sanitizeSourceRecipe(body.recipe);
  if (!recipe) {
    return errorBody("Recette invalide (nom et ingrédients requis).", "invalid_input");
  }

  const { userSupa, userId } = deps;

  const rl = await checkRateLimit(userSupa, userId, "recipe_variants", MAX_PER_HOUR);
  if (!rl.ok) return errorBody(`Limite atteinte (${rl.count}/${MAX_PER_HOUR} demandes par heure). Réessaie plus tard.`, "server_error");

  const systemPrompt = buildVariantSystemPrompt(requestType, customPrompt, recipe);

  try {
    const raw = await callGeminiForVariants(deps.geminiApiKey, systemPrompt);
    const variants = sanitizeRecipeVariants(raw);
    await recordRateLimit(userSupa, userId, "recipe_variants");
    return { variants };
  } catch (e) {
    return errorFromException(e, "Impossible de générer des variantes pour cette recette. Réessaie.");
  }
}
