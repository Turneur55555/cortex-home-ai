// Source Instagram du pipeline `recipe-import` (voir recipe-import.ts pour le
// contrat commun à toutes les sources).
//
// Étapes réelles :
//  1. récupération du contenu Instagram — scraping des balises <meta og:*>
//     de la page publique du post (pas d'API officielle gratuite pour du
//     contenu grand public ; documenté comme limite connue, cf. README/MEMORY).
//  2. extraction vidéo — l'URL og:video, quand présente, pointe directement
//     vers le mp4 du Reel.
//  3. transcription audio — envoi du mp4 à Whisper (OpenAI) si OPENAI_API_KEY
//     est configurée ; best-effort, jamais bloquant.
//  4. récupération du texte du post — og:description / og:title.
//  5-8. analyse multimodale + ingrédients + quantités + macros — un seul appel
//     Gemini 2.5 Flash (tool calling), cf. RECIPE_TOOL dans recipe-import.ts.
//  9. score de confiance — confiance IA pondérée par la qualité des signaux
//     disponibles (transcription/légende/image).
//  10. retour d'une `RecipeExtraction` complète.

import {
  RECIPE_SYSTEM_PROMPT,
  RECIPE_TOOL,
  parseRecipeToolCall,
  sanitizeRecipeExtraction,
  toBase64,
  type RecipeExtraction,
  type SourceHandler,
} from "./recipe-import.ts";

const INSTAGRAM_URL_RE = /^\/(reel|reels|p|tv)\/[\w-]+\/?$/;

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMeta(html: string, property: string): string | null {
  const re1 = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, "i");
  const m1 = html.match(re1);
  if (m1) return decodeHtmlEntities(m1[1]);
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, "i");
  const m2 = html.match(re2);
  return m2 ? decodeHtmlEntities(m2[1]) : null;
}

interface InstagramContent {
  caption: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
}

async function fetchInstagramContent(url: string): Promise<InstagramContent> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(12_000),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CortexRecipeBot/1.0; +https://cortex-home-ai.lovable.app)",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "Ce post Instagram est introuvable (supprimé ou lien incorrect)."
        : `Instagram a répondu ${res.status} — le post est peut-être privé ou temporairement inaccessible.`,
    );
  }
  const html = await res.text();
  const title = extractMeta(html, "og:title");
  const description = extractMeta(html, "og:description");
  const imageUrl = extractMeta(html, "og:image");
  const videoUrl = extractMeta(html, "og:video:secure_url") ?? extractMeta(html, "og:video");

  if (!title && !description && !imageUrl) {
    throw new Error(
      "Impossible de lire ce post Instagram (compte privé, contenu supprimé, ou blocage anti-robot). Réessaie avec un post public ou plus tard.",
    );
  }
  return { caption: description ?? title, imageUrl, videoUrl };
}

async function fetchImageAsBase64(imageUrl: string): Promise<{ b64: string; mime: string } | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 8_000_000) return null;
    return { b64: toBase64(buf), mime };
  } catch (e) {
    console.warn("[recipe-import/instagram] miniature illisible:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function transcribeVideo(videoUrl: string, openaiApiKey: string): Promise<string | null> {
  try {
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 24_000_000) return null; // limite Whisper ~25 Mo
    const form = new FormData();
    form.append("file", new Blob([buf], { type: "video/mp4" }), "reel.mp4");
    form.append("model", "whisper-1");
    form.append("language", "fr");
    const wres = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}` },
      body: form,
      signal: AbortSignal.timeout(40_000),
    });
    if (!wres.ok) {
      console.warn("[recipe-import/instagram] Whisper status:", wres.status);
      return null;
    }
    const j = await wres.json();
    return typeof j?.text === "string" && j.text.trim() ? j.text.trim().slice(0, 4000) : null;
  } catch (e) {
    console.warn("[recipe-import/instagram] transcription échouée:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function callGemini(
  geminiApiKey: string,
  ctx: { imageB64: string | null; imageMime: string | null; caption: string | null; transcript: string | null },
): Promise<unknown> {
  const textLines = [
    ctx.caption ? `Légende du post : « ${ctx.caption} »` : "Aucune légende disponible.",
    ctx.transcript ? `Transcription audio : « ${ctx.transcript} »` : "Transcription audio indisponible pour ce post.",
    "Reconstitue la fiche recette complète à partir de ces éléments et de la miniature ci-jointe (si présente).",
  ];
  const content: unknown[] = [{ type: "text", text: textLines.join("\n\n") }];
  if (ctx.imageB64 && ctx.imageMime) {
    content.push({ type: "image_url", image_url: { url: `data:${ctx.imageMime};base64,${ctx.imageB64}` } });
  }

  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${geminiApiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: RECIPE_SYSTEM_PROMPT },
        { role: "user", content },
      ],
      tools: [RECIPE_TOOL],
      tool_choice: { type: "function", function: { name: "save_recipe" } },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[recipe-import/instagram] Gemini error:", res.status, body.slice(0, 500));
    if (res.status === 429) throw new Error("Limite Gemini atteinte, réessaie dans quelques instants.");
    if (res.status === 402) throw new Error("Crédits Gemini épuisés.");
    if (res.status === 401) throw new Error("Clé Gemini invalide.");
    throw new Error("Le service d'analyse IA est temporairement indisponible.");
  }
  return res.json();
}

export const instagramSourceHandler: SourceHandler = {
  kind: "instagram",

  validate(rawValue: string): string {
    let u: URL;
    try {
      u = new URL(rawValue.trim());
    } catch {
      throw new Error("Lien invalide.");
    }
    if (u.protocol !== "https:") throw new Error("Le lien doit être en https.");
    const host = u.hostname.toLowerCase();
    if (host !== "instagram.com" && host !== "www.instagram.com") {
      throw new Error("Seuls les liens instagram.com sont acceptés.");
    }
    if (!INSTAGRAM_URL_RE.test(u.pathname)) {
      throw new Error("Ce lien n'est pas reconnu. Colle un lien Instagram (Reel ou publication).");
    }
    // URL normalisée (sans query/tracking) — clé de dédoublonnage stable.
    return `https://${host}${u.pathname}`;
  },

  async run(value, env): Promise<RecipeExtraction> {
    const content = await fetchInstagramContent(value);
    const image = content.imageUrl ? await fetchImageAsBase64(content.imageUrl) : null;
    const transcript =
      content.videoUrl && env.openaiApiKey ? await transcribeVideo(content.videoUrl, env.openaiApiKey) : null;

    const aiJson = await callGemini(env.geminiApiKey, {
      imageB64: image?.b64 ?? null,
      imageMime: image?.mime ?? null,
      caption: content.caption,
      transcript,
    });

    const raw = parseRecipeToolCall(aiJson);
    if (!raw) {
      throw new Error("L'IA n'a pas pu reconstituer cette recette. Réessaie avec un autre post.");
    }

    // Pénalité de confiance selon les signaux manquants (pas de transcription
    // audio, pas de légende, pas d'image analysable).
    let penalty = 0;
    if (!transcript) penalty += 0.15;
    if (!content.caption) penalty += 0.1;
    if (!image) penalty += 0.25;

    return sanitizeRecipeExtraction(raw, content.imageUrl, penalty);
  },
};
