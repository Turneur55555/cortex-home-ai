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
import { RecipeImportError, type RecipeExtraction, type SourceHandler } from "./recipe-import.ts";
import { findNonFrenchTerms } from "./recipe-language.ts";

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
      const signals = {
        hasTranscript: !!content.transcript,
        hasCaption: !!content.caption,
        hasImage: !!content.imageB64,
      };
      const passthrough = { originalCaption: content.caption, authorHandle: content.authorHandle };

      const extract = async (reinforceFrench: boolean): Promise<RecipeExtraction> => {
        const raw = await parseRecipeFromContent(env.geminiApiKey, content, { reinforceFrench });
        return computeRecipeExtraction(raw, content.imageUrl, signals, passthrough);
      };

      const first = await extract(false);
      // Garantie de RÉSULTAT (pas seulement de consigne) : si la fiche produite
      // contient encore du texte source non traduit, la MÊME extraction est
      // rejouée une fois avec une consigne durcie. Jamais d'appel dédié à la
      // traduction, jamais plus d'une reprise.
      const leftovers = findNonFrenchTerms(first);
      if (leftovers.length === 0) return first;

      console.warn("[recipe-import-instagram] fiche non française, ré-extraction renforcée:", leftovers.slice(0, 10));
      try {
        const second = await extract(true);
        return findNonFrenchTerms(second).length <= leftovers.length ? second : first;
      } catch (e) {
        console.error("[recipe-import-instagram] ré-extraction renforcée échouée, fiche initiale conservée:", e);
        return first;
      }
    },

  };
}

export const instagramSourceHandler: SourceHandler = makeInstagramHandler(instagramScraperProvider);
