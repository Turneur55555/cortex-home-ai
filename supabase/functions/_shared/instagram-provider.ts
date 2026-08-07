// Étape "Content Extraction" du pipeline Instagram : InstagramProvider ->
// Recipe Parser (recipe-parser.ts) -> Nutrition Engine (nutrition-engine.ts)
// -> Database (recipe-db.ts).
//
// `InstagramProvider` isole COMMENT on récupère le contenu d'un post
// Instagram (scraping public aujourd'hui) du reste du pipeline (analyse IA,
// persistance). Ajouter demain un provider basé sur une API officielle ou un
// service tiers payant = implémenter cette interface et le brancher dans
// recipe-import-instagram.ts — aucune autre ligne du pipeline à toucher.
import { RecipeImportError, toBase64 } from "./recipe-import.ts";

export interface InstagramContent {
  caption: string | null;
  imageUrl: string | null;
  imageB64: string | null;
  imageMime: string | null;
  transcript: string | null;
  /** @handle de l'auteur — best-effort (regex sur og:title/og:description), `null` si non détectable. */
  authorHandle: string | null;
}

export interface InstagramProvider {
  fetchContent(url: string, env: { openaiApiKey: string | null }): Promise<InstagramContent>;
}

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

function isTimeout(e: unknown): boolean {
  return e instanceof DOMException && e.name === "TimeoutError";
}

interface PageContent {
  caption: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  authorHandle: string | null;
}

/**
 * Best-effort : Instagram n'expose pas l'auteur via une balise dédiée sur
 * une page publique non authentifiée. Deux formats og:* courants suffisent
 * dans la majorité des cas : "Nom (@handle) • Instagram ..." et
 * "1,234 likes, 56 comments - handle on Instagram: ...". `null` sinon —
 * jamais bloquant, l'UI masque simplement l'auteur si absent.
 */
function extractAuthorHandle(title: string | null, description: string | null): string | null {
  const fromParens = title?.match(/\(@([\w.]+)\)/);
  if (fromParens) return fromParens[1];
  const fromDash = description?.match(/-\s*([\w.]+)\s+on Instagram/i);
  if (fromDash) return fromDash[1];
  const fromOn = title?.match(/^([\w.]+)\s+on Instagram/i);
  if (fromOn) return fromOn[1];
  return null;
}

async function fetchInstagramPage(url: string): Promise<PageContent> {
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CortexRecipeBot/1.0; +https://cortex-home-ai.lovable.app)",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });
  } catch (e) {
    if (isTimeout(e)) {
      throw new RecipeImportError("timeout", "Le téléchargement du post Instagram a pris trop de temps. Réessaie.");
    }
    throw new RecipeImportError("content_unavailable", "Impossible de contacter Instagram. Réessaie plus tard.");
  }

  if (res.status === 404) {
    throw new RecipeImportError(
      "deleted_post",
      "Cette publication Instagram est introuvable (supprimée ou lien incorrect).",
    );
  }
  if (res.status === 429) {
    throw new RecipeImportError(
      "instagram_rate_limited",
      "Instagram limite temporairement les accès automatisés. Réessaie dans quelques minutes.",
    );
  }
  if (!res.ok) {
    throw new RecipeImportError(
      "content_unavailable",
      `Instagram a répondu ${res.status} — contenu temporairement inaccessible. Réessaie plus tard.`,
    );
  }

  const html = await res.text();

  // Instagram redirige (ou affiche un mur de connexion) un fetch non
  // authentifié pour un compte privé — heuristique best-effort, la seule
  // disponible sans session connectée (pas d'API officielle gratuite pour
  // détecter la confidentialité d'un post grand public).
  const loginWall =
    /\/accounts\/login/i.test(res.url ?? "") ||
    /log in to see photos and videos/i.test(html) ||
    /this account is private/i.test(html) ||
    /ce compte est priv[ée]/i.test(html);
  if (loginWall) {
    throw new RecipeImportError(
      "private_post",
      "Ce compte est privé — impossible d'analyser cette publication sans y avoir accès.",
    );
  }

  const title = extractMeta(html, "og:title");
  const description = extractMeta(html, "og:description");
  const imageUrl = extractMeta(html, "og:image");
  const videoUrl = extractMeta(html, "og:video:secure_url") ?? extractMeta(html, "og:video");

  if (!title && !description && !imageUrl) {
    throw new RecipeImportError(
      "content_unavailable",
      "Impossible de lire ce post Instagram (contenu supprimé ou blocage anti-robot). Réessaie avec un autre lien ou plus tard.",
    );
  }
  return { caption: description ?? title, imageUrl, videoUrl, authorHandle: extractAuthorHandle(title, description) };
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
    console.warn("[instagram-provider] miniature illisible:", e instanceof Error ? e.message : e);
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
      console.warn("[instagram-provider] Whisper status:", wres.status);
      return null;
    }
    const j = await wres.json();
    return typeof j?.text === "string" && j.text.trim() ? j.text.trim().slice(0, 4000) : null;
  } catch (e) {
    // Best-effort : jamais fatal, la Nutrition Engine baisse simplement la confiance.
    console.warn("[instagram-provider] transcription échouée:", e instanceof Error ? e.message : e);
    return null;
  }
}

class InstagramScraperProviderImpl implements InstagramProvider {
  async fetchContent(url: string, env: { openaiApiKey: string | null }): Promise<InstagramContent> {
    const page = await fetchInstagramPage(url);
    const image = page.imageUrl ? await fetchImageAsBase64(page.imageUrl) : null;
    const transcript =
      page.videoUrl && env.openaiApiKey ? await transcribeVideo(page.videoUrl, env.openaiApiKey) : null;
    return {
      caption: page.caption,
      imageUrl: page.imageUrl,
      imageB64: image?.b64 ?? null,
      imageMime: image?.mime ?? null,
      transcript,
      authorHandle: page.authorHandle,
    };
  }
}

/** Provider par défaut — scraping public. Le seul implémenté pour l'instant. */
export const instagramScraperProvider: InstagramProvider = new InstagramScraperProviderImpl();
