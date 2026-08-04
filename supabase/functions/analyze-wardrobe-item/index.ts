// Analyse Vision d'une photo de vêtement pour préremplir la fiche d'ajout
// du Dressing (formulaire adaptatif Phase 4.1). Réutilise EXACTEMENT le
// pattern IA déjà en production (scan-exercise / estimate-body-fat-photo) :
// Gemini 2.5 Flash (GEMINI_API_KEY) en priorité, GPT-4o (OPENAI_API_KEY) en
// fallback — aucun nouveau fournisseur externe, aucune clé côté client.
//
// Contrat : l'IA PROPOSE, l'utilisateur VALIDE (cf. Phase 4 — règle
// fondamentale). Chaque propriété est retournée avec une confiance 0..1 ;
// le seuillage (préremplir / signaler / laisser vide) est appliqué côté
// client (src/hooks/useWardrobe.ts). Cette fonction ne fait que produire
// une proposition validée structurellement — jamais une valeur hors des
// listes autorisées (anti-hallucination), jamais hors de la contrainte DB
// wardrobe_items.category_check. La TAILLE n'est jamais demandée à l'IA —
// elle reste une saisie 100% utilisateur (cf. §4 de la mission).
//
// Vocabulaire aligné sur src/lib/wardrobe/taxonomy.ts (dupliqué ici car
// cette fonction tourne en Deno, runtime séparé du bundle frontend — même
// convention que les autres Edge Functions du repo).
//
// Retourne TOUJOURS HTTP 200 — les erreurs sont dans { error: "..." }
// (jamais de fiche inventée dans ce cas ; le client bascule sur l'ajout
// manuel Phase 3, intégralement fonctionnel sans IA).
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, recordRateLimit } from "../_shared/rate-limit.ts";

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

// ─── Listes autorisées (anti-hallucination) ─────────────────────────────────
// `category` DOIT correspondre exactement à wardrobe_items_category_check.

const CATEGORIES = ["top", "bottom", "outerwear", "shoes", "accessory"] as const;

// Miroir de src/lib/wardrobe/taxonomy.ts WARDROBE_SUBCATEGORIES (valeurs uniquement).
const SUBCATEGORIES = [
  "tshirt",
  "polo",
  "chemise",
  "sweat",
  "pull",
  "cardigan",
  "debardeur",
  "haut_bikini",
  "maillot_une_piece",
  "jean",
  "pantalon",
  "chino",
  "jogging",
  "jupe",
  "legging",
  "short",
  "short_bain",
  "boxer_bain",
  "slip_bain",
  "bas_bikini",
  "veste",
  "blouson",
  "manteau",
  "parka",
  "doudoune",
  "sneakers",
  "running",
  "mocassins",
  "bottines",
  "sandales",
  "ville",
  "casquette",
  "bonnet",
  "ceinture",
  "montre",
  "sac",
  "echarpe",
] as const;

const PATTERNS = ["uni", "rayures", "carreaux", "imprime", "logo", "graphique", "texture"] as const;
const FITS = ["slim", "ajustee", "droite", "regular", "oversize", "ample"] as const;
const FORMALITIES = ["casual", "smart_casual", "formal", "sport"] as const;
const SEASONS = ["printemps", "ete", "automne", "hiver"] as const;
const SLEEVE_LENGTHS = ["sans_manches", "courtes", "longues"] as const;
const USAGES = ["quotidien", "sport", "habille", "baignade"] as const;

// Vocabulaire couleur canonique — DOIT être le même mot que celui utilisé
// dans `description` (cf. SYSTEM_PROMPT règle 7 + incohérence corrigée en
// Phase 4.1 : "Shorts gris foncé unis" vs primary_color "noir").
const COLORS = [
  "noir",
  "blanc",
  "gris",
  "gris foncé",
  "gris clair",
  "bleu marine",
  "bleu clair",
  "bleu",
  "beige",
  "marron",
  "vert",
  "rouge",
  "jaune",
  "orange",
  "rose",
  "violet",
  "bordeaux",
] as const;

type Category = (typeof CATEGORIES)[number];

// ─── Tool definition — sortie structurée, une propriété = une confiance ────

const ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "save_wardrobe_analysis",
    description:
      "Enregistrer l'analyse visuelle d'une pièce de dressing (vêtement, chaussure ou accessoire) à partir d'une photo, avec un niveau de confiance par propriété.",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: [...CATEGORIES], description: "Catégorie DB exacte." },
        category_confidence: { type: "number", description: "0..1" },
        subcategory: {
          type: "string",
          enum: [...SUBCATEGORIES],
          description: "Type précis EXACT parmi la liste fournie. Omettre si aucun ne correspond raisonnablement.",
        },
        subcategory_confidence: { type: "number", description: "0..1" },
        primary_color: {
          type: "string",
          enum: [...COLORS],
          description:
            "Couleur principale — DOIT être exactement le même mot que celui utilisé dans `description` si une couleur y est mentionnée.",
        },
        primary_color_confidence: { type: "number", description: "0..1" },
        secondary_colors: {
          type: "array",
          items: { type: "string", enum: [...COLORS] },
          description: "Couleurs secondaires visibles. Tableau vide si aucune.",
        },
        pattern: { type: "string", enum: [...PATTERNS], description: "Motif dominant." },
        pattern_confidence: { type: "number", description: "0..1" },
        material: {
          type: "string",
          description:
            "Matière la plus probable (ex: coton, denim, laine, cuir, polyester, maille). Estimation visuelle uniquement — jamais certaine.",
        },
        material_confidence: {
          type: "number",
          description: "0..1 — une photo ne permet quasiment jamais de dépasser une confiance modérée pour la matière.",
        },
        fit: {
          type: "string",
          enum: [...FITS],
          description: "Coupe si raisonnablement visible sur la photo, sinon omettre.",
        },
        fit_confidence: { type: "number", description: "0..1" },
        sleeve_length: {
          type: "string",
          enum: [...SLEEVE_LENGTHS],
          description: "Longueur de manches — UNIQUEMENT pertinent pour un haut (category=top). Omettre sinon.",
        },
        sleeve_length_confidence: { type: "number", description: "0..1" },
        formality: { type: "string", enum: [...FORMALITIES], description: "Registre vestimentaire dominant." },
        formality_confidence: { type: "number", description: "0..1" },
        seasons: {
          type: "array",
          items: { type: "string", enum: [...SEASONS] },
          description: "Saisons plausibles pour cette pièce (peut en contenir plusieurs).",
        },
        usage: {
          type: "array",
          items: { type: "string", enum: [...USAGES] },
          description:
            "Usage(s) probable(s) — jamais une catégorie, un attribut. 'baignade' pour tout maillot de bain/bikini.",
        },
        usage_confidence: { type: "number", description: "0..1" },
        description: {
          type: "string",
          description: "Une phrase courte et factuelle décrivant la pièce, sans texte marketing.",
        },
      },
      required: ["category", "category_confidence", "description"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `Tu es un assistant d'analyse VISUELLE d'une pièce de dressing (vêtement, chaussure ou accessoire) à partir d'une seule photo.

RÈGLES ABSOLUES :
1. Réponds STRICTEMENT via l'outil fourni, en français.
2. "category" DOIT être exactement une des valeurs autorisées — n'invente jamais de catégorie. "Sport" n'est JAMAIS une catégorie : c'est une valeur possible de "usage" uniquement.
3. Chaque propriété doit être accompagnée d'une confiance 0..1 honnête. Une photo ne permet PAS toujours d'identifier la matière, la coupe ou le sous-type avec certitude : dans ce cas, indique une confiance basse plutôt que d'inventer une valeur précise.
4. Si une propriété n'est pas raisonnablement déterminable, omets-la plutôt que de deviner. "sleeve_length" (manches) ne concerne QUE les hauts (category=top) — ne le renseigne jamais pour un bas, une veste, une chaussure ou un accessoire.
5. Ne devine JAMAIS une taille — cette fonction n'a pas de champ taille, ne mentionne aucune taille dans "description".
6. La description est une seule phrase factuelle (ex: "Chemise Oxford bleu clair à coupe ajustée."), jamais de ton publicitaire.
7. RÈGLE DE COHÉRENCE COULEUR (important) : si "description" mentionne une couleur, "primary_color" DOIT être exactement ce même mot de couleur (parmi la liste autorisée). N'utilise jamais deux couleurs différentes entre "description" et "primary_color" pour la même pièce.
8. N'identifie jamais une personne, un visage, ou tout élément hors du vêtement photographié.`;

interface RawAnalysis {
  category?: unknown;
  category_confidence?: unknown;
  subcategory?: unknown;
  subcategory_confidence?: unknown;
  primary_color?: unknown;
  primary_color_confidence?: unknown;
  secondary_colors?: unknown;
  pattern?: unknown;
  pattern_confidence?: unknown;
  material?: unknown;
  material_confidence?: unknown;
  fit?: unknown;
  fit_confidence?: unknown;
  sleeve_length?: unknown;
  sleeve_length_confidence?: unknown;
  formality?: unknown;
  formality_confidence?: unknown;
  seasons?: unknown;
  usage?: unknown;
  usage_confidence?: unknown;
  description?: unknown;
}

export interface WardrobeAnalysisResult {
  category: Category;
  category_confidence: number;
  subcategory: (typeof SUBCATEGORIES)[number] | null;
  subcategory_confidence: number;
  primary_color: (typeof COLORS)[number] | null;
  primary_color_confidence: number;
  secondary_colors: string[];
  pattern: (typeof PATTERNS)[number] | null;
  pattern_confidence: number;
  material: string | null;
  material_confidence: number;
  fit: (typeof FITS)[number] | null;
  fit_confidence: number;
  sleeve_length: (typeof SLEEVE_LENGTHS)[number] | null;
  sleeve_length_confidence: number;
  formality: (typeof FORMALITIES)[number] | null;
  formality_confidence: number;
  seasons: (typeof SEASONS)[number][];
  usage: (typeof USAGES)[number][];
  usage_confidence: number;
  description: string;
}

function clampConfidence(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

function cleanString(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLen) : null;
}

function normalizeFr(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Filet de sécurité serveur pour l'incohérence description/primary_color :
 * même si le prompt (règle 7) demande la cohérence, un modèle peut encore
 * s'écarter. Si `description` mentionne explicitement une couleur autorisée
 * différente de `primary_color`, on fait confiance à la description (c'est
 * elle que lit l'utilisateur) et on plafonne la confiance associée.
 */
function reconcileColor(
  primaryColor: (typeof COLORS)[number] | null,
  confidence: number,
  description: string,
): { color: (typeof COLORS)[number] | null; confidence: number } {
  const normalizedDescription = normalizeFr(description);
  const mentioned = COLORS.find((c) => normalizedDescription.includes(normalizeFr(c)));
  if (!mentioned) return { color: primaryColor, confidence };
  if (primaryColor && normalizeFr(primaryColor) === normalizeFr(mentioned)) {
    return { color: primaryColor, confidence };
  }
  return { color: mentioned, confidence: Math.min(confidence, 0.6) };
}

/** Valide strictement la réponse IA : anti-hallucination, jamais de valeur hors liste. */
function validateAnalysis(raw: unknown): WardrobeAnalysisResult | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as RawAnalysis;

  if (typeof r.category !== "string" || !CATEGORIES.includes(r.category as Category)) return null;
  if (typeof r.description !== "string" || r.description.trim().length === 0) return null;

  const description = r.description.trim().slice(0, 200);

  const subcategory =
    typeof r.subcategory === "string" && SUBCATEGORIES.includes(r.subcategory as never)
      ? (r.subcategory as (typeof SUBCATEGORIES)[number])
      : null;
  const pattern =
    typeof r.pattern === "string" && PATTERNS.includes(r.pattern as never) ? (r.pattern as never) : null;
  const fit = typeof r.fit === "string" && FITS.includes(r.fit as never) ? (r.fit as never) : null;
  // sleeve_length n'a de sens que pour un haut — anti-hallucination structurelle.
  const sleeveLength =
    r.category === "top" &&
    typeof r.sleeve_length === "string" &&
    SLEEVE_LENGTHS.includes(r.sleeve_length as never)
      ? (r.sleeve_length as (typeof SLEEVE_LENGTHS)[number])
      : null;
  const formality =
    typeof r.formality === "string" && FORMALITIES.includes(r.formality as never)
      ? (r.formality as never)
      : null;
  const seasons = Array.isArray(r.seasons)
    ? r.seasons.filter((s): s is (typeof SEASONS)[number] => typeof s === "string" && SEASONS.includes(s as never))
    : [];
  const usage = Array.isArray(r.usage)
    ? r.usage.filter((u): u is (typeof USAGES)[number] => typeof u === "string" && USAGES.includes(u as never))
    : [];
  const secondaryColors = Array.isArray(r.secondary_colors)
    ? r.secondary_colors
        .filter((c): c is string => typeof c === "string" && COLORS.includes(normalizeFr(c) as never))
        .slice(0, 4)
    : [];

  const rawPrimaryColor =
    typeof r.primary_color === "string" && COLORS.includes(normalizeFr(r.primary_color) as never)
      ? (normalizeFr(r.primary_color) as (typeof COLORS)[number])
      : null;
  const { color: primaryColor, confidence: primaryColorConfidence } = reconcileColor(
    rawPrimaryColor,
    clampConfidence(r.primary_color_confidence),
    description,
  );

  return {
    category: r.category as Category,
    category_confidence: clampConfidence(r.category_confidence),
    subcategory,
    subcategory_confidence: clampConfidence(r.subcategory_confidence),
    primary_color: primaryColor,
    primary_color_confidence: primaryColorConfidence,
    secondary_colors: secondaryColors,
    pattern,
    pattern_confidence: clampConfidence(r.pattern_confidence),
    material: cleanString(r.material, 60),
    material_confidence: clampConfidence(r.material_confidence),
    fit,
    fit_confidence: clampConfidence(r.fit_confidence),
    sleeve_length: sleeveLength,
    sleeve_length_confidence: sleeveLength ? clampConfidence(r.sleeve_length_confidence) : 0,
    formality,
    formality_confidence: clampConfidence(r.formality_confidence),
    seasons,
    usage,
    usage_confidence: clampConfidence(r.usage_confidence),
    description,
  };
}

function extractFromAiResponse(aiJson: unknown): WardrobeAnalysisResult | null {
  const calls = (
    aiJson as { choices?: Array<{ message?: { tool_calls?: Array<{ function: { arguments: string } }> } }> }
  )?.choices?.[0]?.message?.tool_calls;
  if (!calls || calls.length === 0) return null;
  try {
    const parsed = JSON.parse(calls[0].function.arguments);
    return validateAnalysis(parsed);
  } catch {
    return null;
  }
}

// ─── Appels IA (pattern identique à scan-exercise / estimate-body-fat-photo) ─

async function callGemini(apiKey: string, b64: string, mime: string): Promise<unknown> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyse cette pièce de dressing et préremplis sa fiche." },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
          ],
        },
      ],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "function", function: { name: "save_wardrobe_analysis" } },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Limite Gemini atteinte");
    if (res.status === 402) throw new Error("Crédits Gemini épuisés");
    if (res.status === 401) throw new Error("Clé Gemini invalide");
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function callOpenAI(apiKey: string, b64: string, mime: string): Promise<unknown> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyse cette pièce de dressing et préremplis sa fiche." },
            { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
          ],
        },
      ],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "function", function: { name: "save_wardrobe_analysis" } },
      max_tokens: 512,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) throw new Error("Limite OpenAI atteinte");
    if (res.status === 402) throw new Error("Crédits OpenAI épuisés");
    if (res.status === 401) throw new Error("Clé OpenAI invalide");
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ─── Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json200 = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const fail = (userMsg: string, internalDetails?: unknown) => {
    if (internalDetails !== undefined) console.error("[analyze-wardrobe-item] FAIL:", userMsg, internalDetails);
    return json200({ error: userMsg });
  };

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
      return fail("Service IA indisponible.", "both keys absent");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié — reconnecte-toi.", userErr?.message);

    // Limite volontairement généreuse mais bornée : un appel auto par photo
    // + retries explicites côté client (pas d'appel en boucle).
    const rl = await checkRateLimit(supa, userData.user.id, "analyze_wardrobe_item", 20);
    if (!rl.ok) return fail(`Limite atteinte (${rl.count}/20 analyses par heure). Tu peux compléter manuellement.`);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (e) {
      return fail("Corps de requête invalide.", e instanceof Error ? e.message : String(e));
    }

    const { image_base64, mime_type } = body;
    if (!image_base64 || typeof image_base64 !== "string" || image_base64.length < 100) {
      return fail("Image manquante ou invalide.");
    }
    if (image_base64.length > 12_000_000) {
      return fail("Image trop volumineuse (max ~9 Mo). Réduis la qualité.");
    }
    const mime = typeof mime_type === "string" && mime_type.startsWith("image/") ? mime_type : "image/jpeg";

    let aiJson: unknown = null;
    const aiErrors: string[] = [];

    if (GEMINI_API_KEY) {
      try {
        aiJson = await callGemini(GEMINI_API_KEY, image_base64, mime);
      } catch (e) {
        aiErrors.push(`Gemini: ${e instanceof Error ? e.message : String(e)}`);
        aiJson = null;
      }
    }
    if (!aiJson && OPENAI_API_KEY) {
      try {
        aiJson = await callOpenAI(OPENAI_API_KEY, image_base64, mime);
      } catch (e) {
        aiErrors.push(`OpenAI: ${e instanceof Error ? e.message : String(e)}`);
        aiJson = null;
      }
    }
    if (!aiJson) {
      return fail(
        aiErrors.some((e) => e.includes("Limite") || e.includes("épuisés"))
          ? "Limite d'utilisation IA atteinte. Tu peux compléter manuellement."
          : "Analyse impossible pour le moment. Tu peux compléter manuellement.",
        aiErrors,
      );
    }

    const parsed = extractFromAiResponse(aiJson);
    if (!parsed) {
      return fail("Analyse impossible. Tu peux compléter les informations manuellement.");
    }

    await recordRateLimit(supa, userData.user.id, "analyze_wardrobe_item");

    return json200({ analysis: parsed });
  } catch (e) {
    console.error("[analyze-wardrobe-item] unhandled exception:", e);
    return json200({ error: "Erreur inattendue lors de l'analyse. Tu peux compléter manuellement." });
  }
});
