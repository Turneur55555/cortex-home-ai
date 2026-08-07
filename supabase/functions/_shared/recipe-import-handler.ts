// Orchestration de POST /recipe-import — extrait de recipe-import/index.ts
// pour être testable directement (aucune dépendance à `Deno.serve`/`Deno.env`
// ici, uniquement des dépendances injectées) : voir
// recipe-import.e2e.test.ts pour la campagne de validation qui l'exerce avec
// un client Supabase et un `fetch` simulés (pas de session Deno disponible
// dans ce sandbox pour un vrai test HTTP bout en bout).
//
// Pipeline :
//   SOURCE_HANDLERS[source].validate()
//     -> findUserRecipe()          (déjà associée à CET utilisateur ?)
//     -> findCachedRecipe()        (déjà analysée par N'IMPORTE QUEL utilisateur ?)
//     -> handler.run()             (cache miss uniquement : Provider -> Parser -> Engine)
//     -> saveCachedRecipe()        (cache miss uniquement)
//     -> createUserRecipeFromExtraction()
//
// Sources : seul "instagram" a un pipeline réel aujourd'hui
// (recipe-import-instagram.ts). Les autres sont déclarées avec `null` dans
// SOURCE_HANDLERS — ajouter une source future = une entrée ici, rien d'autre.
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit, recordRateLimit } from "./rate-limit.ts";
import { RecipeImportError, type RecipeExtraction, type RecipeSourceKind, type SourceHandler } from "./recipe-import.ts";
import { instagramSourceHandler } from "./recipe-import-instagram.ts";
import { createUserRecipeFromExtraction, findCachedRecipe, findUserRecipe, saveCachedRecipe } from "./recipe-db.ts";

export const SOURCE_HANDLERS: Record<RecipeSourceKind, SourceHandler | null> = {
  instagram: instagramSourceHandler,
  tiktok: null,
  "youtube-shorts": null,
  "local-video": null,
  photo: null,
  "recipe-url": null,
};

export const SOURCE_LABELS: Record<RecipeSourceKind, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  "youtube-shorts": "YouTube Shorts",
  "local-video": "Vidéo locale",
  photo: "Photo",
  "recipe-url": "Site de recettes",
};

export function isRecipeSourceKind(v: unknown): v is RecipeSourceKind {
  return (
    typeof v === "string" &&
    (["instagram", "tiktok", "youtube-shorts", "local-video", "photo", "recipe-url"] as const).includes(
      v as RecipeSourceKind,
    )
  );
}

export interface RecipeImportDeps {
  /** Client Supabase authentifié comme l'utilisateur courant (RLS active). */
  userSupa: SupabaseClient;
  /** Client service_role (bypass RLS) pour le cache global — `null` si la clé n'est pas configurée (dégrade sans cache global). */
  admin: SupabaseClient | null;
  userId: string;
  geminiApiKey: string | null;
  openaiApiKey: string | null;
}

function errorBody(message: string): Record<string, unknown> {
  return { error: message, code: "server_error" };
}

function errorFromException(
  err: unknown,
  fallback = "Erreur inattendue lors de l'import. Réessaie.",
): Record<string, unknown> {
  if (err instanceof RecipeImportError) return { error: err.message, code: err.code };
  return { error: fallback, code: "server_error" };
}

/** Toujours HTTP 200 côté appelant — le corps distingue succès (`recipe`) et échec (`error`/`code`). */
export async function handleRecipeImport(rawBody: unknown, deps: RecipeImportDeps): Promise<Record<string, unknown>> {
  if (!deps.geminiApiKey) return errorBody("Service IA indisponible (aucune clé API configurée).");

  const { source, input } = (rawBody ?? {}) as { source?: unknown; input?: { kind?: unknown; value?: unknown } };
  if (!isRecipeSourceKind(source)) return errorBody("Source inconnue.");
  if (!input || input.kind !== "url" || typeof input.value !== "string" || !input.value.trim()) {
    return errorBody("Entrée invalide (lien attendu).");
  }

  const handler = SOURCE_HANDLERS[source];
  if (!handler) {
    return errorBody(`${SOURCE_LABELS[source]} arrive bientôt. Pour l'instant, seul Instagram est disponible.`);
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = handler.validate(input.value);
  } catch (e) {
    return errorFromException(e);
  }

  const { userSupa, admin, userId } = deps;

  // 1) Déjà associée à CET utilisateur ? Aucun coût, aucun risque de doublon.
  const mine = await findUserRecipe(userSupa, userId, normalizedUrl);
  if (mine) {
    return {
      recipe: { ...mine.extraction, sourceKind: source, sourceUrl: normalizedUrl, recipeId: mine.id },
      cached: true,
    };
  }

  // 2) Déjà analysée par N'IMPORTE QUEL utilisateur ? Réutilise sans jamais
  // rappeler l'IA ni recalculer les macros — seule une association DB pour
  // cet utilisateur est créée (étape 4 ci-dessous).
  let extraction: RecipeExtraction | null = admin ? await findCachedRecipe(admin, source, normalizedUrl) : null;
  const fromGlobalCache = extraction != null;

  if (!extraction) {
    const rl = await checkRateLimit(userSupa, userId, "recipe_import", 10);
    if (!rl.ok) return errorBody(`Limite atteinte (${rl.count}/10 imports par heure). Réessaie plus tard.`);

    try {
      extraction = await handler.run(normalizedUrl, {
        geminiApiKey: deps.geminiApiKey,
        openaiApiKey: deps.openaiApiKey,
      });
    } catch (e) {
      return errorFromException(e);
    }

    if (admin) {
      extraction = await saveCachedRecipe(admin, source, normalizedUrl, extraction);
    }
    await recordRateLimit(userSupa, userId, "recipe_import");
  }

  // 4) Association DB pour cet utilisateur — jamais d'appel IA ici, que ce
  // soit une extraction fraîche ou tirée du cache.
  let recipeId: string;
  try {
    recipeId = await createUserRecipeFromExtraction(userSupa, userId, source, normalizedUrl, extraction);
  } catch (e) {
    return errorFromException(e, "Impossible d'enregistrer la recette.");
  }

  return {
    recipe: { ...extraction, sourceKind: source, sourceUrl: normalizedUrl, recipeId },
    cached: fromGlobalCache,
  };
}
