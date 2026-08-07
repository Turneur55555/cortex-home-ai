// Point d'entrée unique de l'import de recettes — POST /recipe-import.
// Le frontend ne connaît jamais l'implémentation propre à une source : il
// envoie { source, input } et reçoit toujours la même forme de réponse
// (voir _shared/recipe-import.ts pour le contrat `RecipeExtraction`).
//
// Sources : seul "instagram" a un pipeline réel aujourd'hui
// (_shared/recipe-import-instagram.ts). Les autres sont déclarées dans
// SOURCE_HANDLERS avec `null` — ajouter une source future = ajouter une
// entrée ici, rien d'autre à changer dans ce fichier.
//
// Persistance : chaque import réussi crée une `recipes` + ses
// `recipe_ingredients` (dédoublonné par (user_id, source_url) — un import
// répété du même lien réutilise la recette déjà créée sans relancer le
// pipeline IA). Le frontend reçoit `recipeId` et le renvoie tel quel lors de
// l'ajout au journal (aucune recette dupliquée).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit, recordRateLimit } from "../_shared/rate-limit.ts";
import type { RecipeExtraction, RecipeSourceKind, SourceHandler } from "../_shared/recipe-import.ts";
import { instagramSourceHandler } from "../_shared/recipe-import-instagram.ts";

const SOURCE_HANDLERS: Record<RecipeSourceKind, SourceHandler | null> = {
  instagram: instagramSourceHandler,
  tiktok: null,
  "youtube-shorts": null,
  "local-video": null,
  photo: null,
  "recipe-url": null,
};

const SOURCE_LABELS: Record<RecipeSourceKind, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  "youtube-shorts": "YouTube Shorts",
  "local-video": "Vidéo locale",
  photo: "Photo",
  "recipe-url": "Site de recettes",
};

function buildCors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const isAllowed =
    /^https:\/\/[a-z0-9-]+\.lovable\.app$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/.test(origin);
  const allow = isAllowed ? origin : "https://cortex-home-ai.lovable.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
}

function isRecipeSourceKind(v: unknown): v is RecipeSourceKind {
  return (
    typeof v === "string" &&
    (["instagram", "tiktok", "youtube-shorts", "local-video", "photo", "recipe-url"] as const).includes(
      v as RecipeSourceKind,
    )
  );
}

interface RecipeRow {
  id: string;
  name: string;
  servings: number;
  source_kind: string | null;
  source_url: string | null;
  source_image_url: string | null;
  confidence: number | null;
  notes: string | null;
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
}

function recipeRowToExtraction(row: RecipeRow, ingredients: RecipeIngredientRow[]): RecipeExtraction {
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
    })),
    notes: row.notes ?? "",
  };
}

/** Recherche une recette déjà importée par cet utilisateur pour ce lien exact. */
async function findExistingRecipe(
  supa: SupabaseClient,
  userId: string,
  sourceUrl: string,
): Promise<{ id: string; extraction: RecipeExtraction } | null> {
  const { data: recipe, error } = await supa
    .from("recipes")
    .select(
      "id, name, servings, source_kind, source_url, source_image_url, confidence, notes, per_serving_calories, per_serving_proteins, per_serving_carbs, per_serving_fats, per_serving_fiber",
    )
    .eq("user_id", userId)
    .eq("source_url", sourceUrl)
    .maybeSingle();
  if (error || !recipe) return null;

  const { data: ingredients } = await supa
    .from("recipe_ingredients")
    .select("name, quantity, unit, grams")
    .eq("recipe_id", (recipe as RecipeRow).id)
    .order("sort_order", { ascending: true });

  return {
    id: (recipe as RecipeRow).id,
    extraction: recipeRowToExtraction(recipe as RecipeRow, (ingredients ?? []) as RecipeIngredientRow[]),
  };
}

/** Crée la recette + ses ingrédients. En cas de course (double import simultané), réutilise l'existante. */
async function persistRecipe(
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
      name: extraction.title,
      servings: extraction.servings,
      source_kind: source,
      source_url: sourceUrl,
      source_image_url: extraction.imageUrl,
      confidence: extraction.confidence,
      notes: extraction.notes || null,
      per_serving_calories: extraction.perServing.calories,
      per_serving_proteins: extraction.perServing.proteins,
      per_serving_carbs: extraction.perServing.carbs,
      per_serving_fats: extraction.perServing.fats,
      per_serving_fiber: extraction.perServing.fiber,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    // 23505 = violation de la contrainte unique (user_id, source_url) — un import
    // concurrent a déjà créé la recette : on la réutilise plutôt que d'échouer.
    if ((insertErr as { code?: string } | null)?.code === "23505") {
      const existing = await findExistingRecipe(supa, userId, sourceUrl);
      if (existing) return existing.id;
    }
    throw new Error("Recette analysée mais impossible à enregistrer. Réessaie.");
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
      sort_order: idx,
    }));
    const { error: ingErr } = await supa.from("recipe_ingredients").insert(rows);
    if (ingErr) console.error("[recipe-import] recipe_ingredients insert failed:", ingErr);
  }

  return recipeId;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json200 = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const fail = (userMsg: string, internalDetails?: unknown) => {
    if (internalDetails !== undefined) console.error("[recipe-import] FAIL:", userMsg, internalDetails);
    else console.warn("[recipe-import] FAIL:", userMsg);
    return json200({ error: userMsg });
  };

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? null;
    if (!GEMINI_API_KEY) return fail("Service IA indisponible (aucune clé API configurée).", "GEMINI_API_KEY absent");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié — reconnecte-toi.", userErr?.message);
    const userId = userData.user.id;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (e) {
      return fail("Corps invalide (JSON attendu).", e instanceof Error ? e.message : String(e));
    }

    const { source, input } = body as { source?: unknown; input?: { kind?: unknown; value?: unknown } };
    if (!isRecipeSourceKind(source)) return fail("Source inconnue.");
    if (!input || input.kind !== "url" || typeof input.value !== "string" || !input.value.trim()) {
      return fail("Entrée invalide (lien attendu).");
    }

    const handler = SOURCE_HANDLERS[source];
    if (!handler) {
      return fail(`${SOURCE_LABELS[source]} arrive bientôt. Pour l'instant, seul Instagram est disponible.`);
    }

    let normalizedUrl: string;
    try {
      normalizedUrl = handler.validate(input.value);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Lien invalide.");
    }

    // Dédoublonnage : réutilise la recette déjà importée pour ce lien, sans
    // relancer le pipeline IA ni consommer de quota.
    const existing = await findExistingRecipe(supa, userId, normalizedUrl);
    if (existing) {
      console.log("[recipe-import] cache hit:", source, normalizedUrl);
      return json200({ recipe: { ...existing.extraction, sourceKind: source, sourceUrl: normalizedUrl, recipeId: existing.id } });
    }

    const rl = await checkRateLimit(supa, userId, "recipe_import", 10);
    if (!rl.ok) return fail(`Limite atteinte (${rl.count}/10 imports par heure). Réessaie plus tard.`);

    let extraction: RecipeExtraction;
    try {
      extraction = await handler.run(normalizedUrl, { geminiApiKey: GEMINI_API_KEY, openaiApiKey: OPENAI_API_KEY });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "L'analyse a échoué. Réessaie dans un instant.", e);
    }

    let recipeId: string;
    try {
      recipeId = await persistRecipe(supa, userId, source, normalizedUrl, extraction);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Impossible d'enregistrer la recette.", e);
    }

    await recordRateLimit(supa, userId, "recipe_import");

    console.log("[recipe-import] SUCCESS:", source, normalizedUrl, "recipeId:", recipeId);
    return json200({ recipe: { ...extraction, sourceKind: source, sourceUrl: normalizedUrl, recipeId } });
  } catch (e) {
    console.error("[recipe-import] unhandled exception:", e);
    return json200({ error: "Erreur inattendue lors de l'import. Réessaie." });
  }
});
