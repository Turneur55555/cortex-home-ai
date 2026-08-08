// Étape "Recipe Parser" du pipeline : reçoit le contenu extrait par un
// provider (InstagramContent — ou un futur équivalent TikTok/YouTube), fait
// l'appel IA multimodal (tool calling) et retourne le JSON brut du modèle,
// AVANT sanitation. La sanitation/bornage + score de confiance final sont la
// responsabilité de la Nutrition Engine (nutrition-engine.ts) — ce module ne
// fait que parler à l'IA et parser sa réponse.
import { INGREDIENT_CATEGORIES, RECIPE_TAGS, RecipeImportError } from "./recipe-import.ts";
import type { InstagramContent } from "./instagram-provider.ts";
import { buildLanguageDirective, detectLanguage } from "./recipe-language.ts";

export const RECIPE_TOOL = {
  type: "function",
  function: {
    name: "save_recipe",
    description: "Enregistrer la fiche recette reconstituée à partir du contenu analysé",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Nom du plat" },
        servings: { type: "number", description: "Nombre de portions du plat" },
        confidence: { type: "number", description: "Confiance globale de l'analyse, entre 0 et 1" },
        notes: {
          type: "string",
          description: "Hypothèses/approximations faites (quantités estimées, ingrédient incertain, etc.)",
        },
        ai_summary: {
          type: "string",
          description:
            "Résumé clair de la recette en 3-5 phrases : principe du plat, ingrédients principaux, mode de cuisson, points importants (ex. temps de repos, technique clé). Ne répète pas mot pour mot la légende du post.",
        },
        prep_minutes: {
          type: "number",
          description: "Temps de préparation en minutes, si détectable dans le contenu — 0 si non détectable.",
        },
        cook_minutes: {
          type: "number",
          description: "Temps de cuisson en minutes, si détectable dans le contenu — 0 si non détectable.",
        },
        tags: {
          type: "array",
          description: "1 à 5 tags parmi la liste fermée fournie, les plus pertinents pour cette recette.",
          items: { type: "string", enum: [...RECIPE_TAGS] },
          maxItems: 5,
        },
        ingredients: {
          type: "array",
          description: "Chaque ingrédient identifié séparément, avec sa quantité et sa masse estimée.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number", description: "Quantité dans l'unité affichée" },
              unit: { type: "string", description: "Unité affichée (g, cl, pièce, c. à soupe, ...)" },
              grams: { type: "number", description: "Masse normalisée en grammes (0 si non estimable)" },
              category: {
                type: "string",
                description: "Rayon de courses le plus adapté pour cet ingrédient.",
                enum: [...INGREDIENT_CATEGORIES],
              },
            },
            required: ["name", "quantity", "unit", "grams", "category"],
            additionalProperties: false,
          },
          minItems: 1,
        },
        per_serving: {
          type: "object",
          description: "Macros pour UNE SEULE portion",
          properties: {
            calories: { type: "number" },
            proteins: { type: "number", description: "Protéines en g" },
            carbs: { type: "number", description: "Glucides en g" },
            fats: { type: "number", description: "Lipides en g" },
            fiber: { type: "number", description: "Fibres en g" },
          },
          required: ["calories", "proteins", "carbs", "fats", "fiber"],
          additionalProperties: false,
        },
      },
      required: ["title", "servings", "ingredients", "per_serving"],
      additionalProperties: false,
    },
  },
} as const;

export const RECIPE_SYSTEM_PROMPT = `Tu es un nutritionniste expert qui reconstitue une fiche recette complète à partir du contenu d'un post de réseau social (image/miniature, légende, transcription audio si disponible).

Méthode :
1. Identifie le plat et son nombre de portions probable.
2. Liste CHAQUE ingrédient séparément (jamais un plat entier comme une seule entrée), avec sa quantité dans une unité naturelle (g, cl, pièce, c. à soupe...), sa masse estimée en grammes, et son rayon de courses ("category", liste fermée).
3. Calcule les macros (kcal, protéines, glucides, lipides, fibres) pour UNE SEULE portion, cohérentes avec la somme des ingrédients divisée par le nombre de portions.
4. Si une source d'information manque (pas de transcription audio, légende vague), fais une estimation raisonnable à partir de ce qui est disponible et BAISSE le niveau de confiance en conséquence. N'invente jamais un ingrédient qui ne serait ni visible ni mentionné.
5. Résume dans "notes" les principales hypothèses ou approximations faites (distinct de "ai_summary" ci-dessous).
6. Rédige "ai_summary" : un résumé autonome de la recette (principe du plat, ingrédients principaux, mode de cuisson, points importants) — quelqu'un doit pouvoir cuisiner le plat en le lisant, sans jamais avoir besoin de retourner voir le post original.
7. Estime "prep_minutes"/"cook_minutes" UNIQUEMENT s'ils sont raisonnablement déductibles (légende, transcription, étapes visibles) — 0 sinon, ne devine jamais un chiffre arbitraire.
8. Choisis "tags" parmi la liste fermée fournie par le schéma — uniquement ceux clairement justifiés par la recette (macros, ingrédients, contexte du repas).

Retourne STRICTEMENT du JSON via tool calling. Tout le texte en FRANÇAIS.`;

interface ToolCallResponse {
  choices?: Array<{
    message?: { tool_calls?: Array<{ function: { arguments: string } }> };
  }>;
}

function parseToolCall(aiJson: unknown): Record<string, unknown> | null {
  const calls = (aiJson as ToolCallResponse)?.choices?.[0]?.message?.tool_calls;
  if (!calls || calls.length === 0) return null;
  try {
    const parsed = JSON.parse(calls[0].function.arguments);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isTimeout(e: unknown): boolean {
  return e instanceof DOMException && e.name === "TimeoutError";
}

/** Appelle Gemini 2.5 Flash (multimodal, tool calling) et retourne le JSON brut — non sanitisé. */
export async function parseRecipeFromContent(
  geminiApiKey: string,
  content: InstagramContent,
): Promise<Record<string, unknown>> {
  const textLines = [
    content.caption ? `Légende du post : « ${content.caption} »` : "Aucune légende disponible.",
    content.transcript
      ? `Transcription audio : « ${content.transcript} »`
      : "Transcription audio indisponible pour ce post.",
    "Reconstitue la fiche recette complète à partir de ces éléments et de la miniature ci-jointe (si présente).",
    // Règle de langue — même pipeline IA : la traduction éventuelle est faite
    // par cet appel, jamais par un second passage (voir recipe-language.ts).
    buildLanguageDirective(detectLanguage(content.caption, content.transcript)),
  ];
  const messageContent: unknown[] = [{ type: "text", text: textLines.join("\n\n") }];
  if (content.imageB64 && content.imageMime) {
    messageContent.push({ type: "image_url", image_url: { url: `data:${content.imageMime};base64,${content.imageB64}` } });
  }

  let res: Response;
  try {
    res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${geminiApiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: RECIPE_SYSTEM_PROMPT },
          { role: "user", content: messageContent },
        ],
        tools: [RECIPE_TOOL],
        tool_choice: { type: "function", function: { name: "save_recipe" } },
      }),
    });
  } catch (e) {
    if (isTimeout(e)) throw new RecipeImportError("timeout", "L'analyse IA a pris trop de temps. Réessaie.");
    throw new RecipeImportError("ai_error", "Le service d'analyse IA est temporairement indisponible.");
  }

  if (!res.ok) {
    const body = await res.text();
    console.error("[recipe-parser] Gemini error:", res.status, body.slice(0, 500));
    if (res.status === 429) throw new RecipeImportError("ai_error", "Limite Gemini atteinte, réessaie dans quelques instants.");
    if (res.status === 402) throw new RecipeImportError("ai_error", "Crédits Gemini épuisés.");
    if (res.status === 401) throw new RecipeImportError("ai_error", "Clé Gemini invalide.");
    throw new RecipeImportError("ai_error", "Le service d'analyse IA est temporairement indisponible.");
  }

  const json = await res.json();
  const raw = parseToolCall(json);
  if (!raw) {
    throw new RecipeImportError("ai_error", "L'IA n'a pas pu reconstituer cette recette. Réessaie avec un autre post.");
  }
  return raw;
}
