// Adapte le pipeline Instagram (InstagramProvider -> Recipe Parser ->
// Nutrition Engine) au contrat générique `SourceHandler` consommé par
// recipe-import/index.ts. Ce fichier ne contient AUCUNE logique métier — il
// compose les 3 étapes et gère la validation d'URL (anti-SSRF).
//
// Changer de fournisseur de contenu Instagram (scraping -> API officielle ou
// service tiers) = implémenter `InstagramProvider` ailleurs et changer
// l'argument de `makeInstagramHandler()` ci-dessous, rien d'autre.
import { instagramScraperProvider, type InstagramProvider } from "./instagram-provider.ts";
import { parseRecipeFromContent } from "./recipe-parser.ts";
import { computeRecipeExtraction } from "./nutrition-engine.ts";
import { RecipeImportError, type SourceHandler } from "./recipe-import.ts";

const INSTAGRAM_URL_RE = /^\/(reel|reels|p|tv)\/[\w-]+\/?$/;

function makeInstagramHandler(provider: InstagramProvider): SourceHandler {
  return {
    kind: "instagram",

    validate(rawValue: string): string {
      let u: URL;
      try {
        u = new URL(rawValue.trim());
      } catch {
        throw new RecipeImportError("invalid_url", "Lien invalide.");
      }
      if (u.protocol !== "https:") {
        throw new RecipeImportError("invalid_url", "Le lien doit être en https.");
      }
      const host = u.hostname.toLowerCase();
      if (host !== "instagram.com" && host !== "www.instagram.com") {
        throw new RecipeImportError("invalid_url", "Seuls les liens instagram.com sont acceptés.");
      }
      if (!INSTAGRAM_URL_RE.test(u.pathname)) {
        throw new RecipeImportError(
          "invalid_url",
          "Ce lien n'est pas reconnu. Colle un lien Instagram (Reel ou publication).",
        );
      }
      // URL normalisée (sans query/tracking) — clé de cache/dédoublonnage stable.
      return `https://${host}${u.pathname}`;
    },

    async run(value, env) {
      const content = await provider.fetchContent(value, { openaiApiKey: env.openaiApiKey });
      const raw = await parseRecipeFromContent(env.geminiApiKey, content);
      return computeRecipeExtraction(raw, content.imageUrl, {
        hasTranscript: !!content.transcript,
        hasCaption: !!content.caption,
        hasImage: !!content.imageB64,
      });
    },
  };
}

export const instagramSourceHandler: SourceHandler = makeInstagramHandler(instagramScraperProvider);
