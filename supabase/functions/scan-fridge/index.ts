// Scanne une photo (frigo, placard, etc.) via IA.
// Tente LOVABLE_API_KEY (Gemini 2.5 Pro) puis OPENAI_API_KEY (GPT-4o) en fallback.
// Retourne TOUJOURS HTTP 200 — les erreurs sont dans { error: "..." }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { checkRateLimit, recordRateLimit } from "../_shared/rate-limit.ts";

const ALLOWED_ORIGINS = [
  "https://id-preview--2c9444e5-f2d2-4c68-9566-e9e8569dc37a.lovable.app",
  "https://2c9444e5-f2d2-4c68-9566-e9e8569dc37a.lovableproject.com",
  "https://project--2c9444e5-f2d2-4c68-9566-e9e8569dc37a.lovable.app",
  "https://cortex-home-ai.lovable.app",
  "http://localhost:8080",
  "http://localhost:5173",
];

function buildCors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
}

const MODULE_HINTS: Record<string, string> = {
  alimentation:
    "Inventaire alimentaire (frigo, garde-manger). Identifie chaque produit visible : name (FR), category (produit_laitier, viande, légume, fruit, boisson, conserve, sauce, féculent, surgelé, autre), quantity (entier estimé), unit (ex: bouteille, pot, paquet), location (Frigo / Congélateur / Placard si déductible), expiration_date YYYY-MM-DD UNIQUEMENT si la date est lisible sur l'étiquette.",
  pharmacie:
    "Médicaments/produits pharmaceutiques. name (marque + dosage si lisible), category (antalgique, antibiotique, vitamine, sirop, autre), quantity, unit (boîte, comprimé, ml), expiration_date si lisible.",
  habits:
    "Vêtements. name (ex: T-shirt blanc), category (haut, bas, chaussure, accessoire, sous-vêtement), quantity, location si déductible.",
  menager:
    "Produits ménagers. name, category (entretien, hygiène, papier, lessive), quantity, unit.",
};

// ─── Parser robuste ───────────────────────────────────────────────────────────

interface ScanResult {
  summary: string;
  extracted_items: unknown[];
}

function extractScanFromAiResponse(aiJson: unknown): ScanResult | null {
  // Chemin 1 : tool_calls standard
  const calls = (aiJson as { choices?: Array<{ message?: { tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> })
    ?.choices?.[0]?.message?.tool_calls;
  if (calls && calls.length > 0) {
    try {
      const p = JSON.parse(calls[0].function.arguments);
      if (Array.isArray(p?.extracted_items)) {
        console.log("[scan-fridge] parsed via tool_call, items:", p.extracted_items.length);
        return { summary: p.summary ?? "", extracted_items: p.extracted_items };
      }
    } catch (e) {
      console.warn("[scan-fridge] tool_call JSON parse failed:", e);
    }
  }

  // Chemin 2 : contenu textuel
  const rawContent = (aiJson as { choices?: Array<{ message?: { content?: string | unknown[] } }> })
    ?.choices?.[0]?.message?.content;
  const text =
    typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
      ? (rawContent as Array<{ text?: string }>).map((c) => c?.text ?? "").join("")
      : "";

  if (text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const p = JSON.parse(match[0]);
        if (Array.isArray(p?.extracted_items)) {
          console.log("[scan-fridge] parsed via content fallback");
          return { summary: p.summary ?? "", extracted_items: p.extracted_items };
        }
      } catch {/* ignore */}
    }
  }

  console.error("[scan-fridge] extractScanFromAiResponse: échec, raw:", JSON.stringify(aiJson).slice(0, 600));
  return null;
}

// ─── Appels IA ────────────────────────────────────────────────────────────────

async function callLovable(
  apiKey: string,
  b64: string,
  mt: string,
  systemPrompt: string,
  userText: string,
  tool: unknown
): Promise<unknown> {
  console.log("[scan-fridge] → Lovable gateway (Gemini 2.5 Pro)");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Lovable-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: `data:${mt};base64,${b64}` } },
          ],
        },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "save_scan" } },
    }),
  });
  console.log("[scan-fridge] Lovable status:", res.status);
  if (!res.ok) {
    const body = await res.text();
    console.error("[scan-fridge] Lovable error:", body.slice(0, 400));
    if (res.status === 429) throw new Error("Limite Lovable atteinte");
    if (res.status === 402) throw new Error("Crédits Lovable épuisés");
    throw new Error(`Lovable ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  console.log("[scan-fridge] Lovable response:", JSON.stringify(json).slice(0, 400));
  return json;
}

async function callOpenAI(
  apiKey: string,
  b64: string,
  mt: string,
  systemPrompt: string,
  userText: string,
  tool: unknown
): Promise<unknown> {
  console.log("[scan-fridge] → OpenAI GPT-4o");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: `data:${mt};base64,${b64}`, detail: "high" } },
          ],
        },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "save_scan" } },
      max_tokens: 4096,
    }),
  });
  console.log("[scan-fridge] OpenAI status:", res.status);
  if (!res.ok) {
    const body = await res.text();
    console.error("[scan-fridge] OpenAI error:", body.slice(0, 400));
    if (res.status === 429) throw new Error("Limite OpenAI atteinte");
    if (res.status === 402) throw new Error("Crédits OpenAI épuisés");
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  console.log("[scan-fridge] OpenAI response:", JSON.stringify(json).slice(0, 400));
  return json;
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json200 = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const fail = (userMsg: string, internalDetails?: unknown) => {
    if (internalDetails !== undefined) console.error("[scan-fridge] FAIL:", userMsg, internalDetails);
    else console.warn("[scan-fridge] FAIL:", userMsg);
    return json200({ error: userMsg });
  };

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    console.log("[scan-fridge] START — keys:", { lovable: !!LOVABLE_API_KEY, openai: !!OPENAI_API_KEY });

    if (!LOVABLE_API_KEY && !OPENAI_API_KEY) {
      return fail("Service IA indisponible (aucune clé API configurée).", "No keys");
    }

    // ── Auth ──
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié.", userErr?.message);
    console.log("[scan-fridge] auth ok:", userData.user.id);

    // ── Rate limit ──
    const rl = await checkRateLimit(supa, userData.user.id, "scan_fridge", 20);
    if (!rl.ok) return fail(`Limite atteinte (${rl.count}/20 scans/h). Réessaie plus tard.`);

    // ── Parsing du body ──
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch (e) {
      return fail("Corps de requête invalide.", e instanceof Error ? e.message : String(e));
    }

    const { image_base64, mime_type, module } = body;
    if (!image_base64 || typeof image_base64 !== "string" || image_base64.length < 100) {
      return fail("image_base64 manquant ou invalide.");
    }
    if (!module || !MODULE_HINTS[module as string]) {
      return fail("Module invalide. Valeurs acceptées : alimentation, pharmacie, habits, menager.");
    }
    if (image_base64.length > 12_000_000) return fail("Image trop volumineuse (max ~9 Mo).");
    console.log("[scan-fridge] image length:", image_base64.length, "module:", module);

    const mt = typeof mime_type === "string" && mime_type.startsWith("image/") ? mime_type : "image/jpeg";

    // ── Schéma outil ──
    const itemSchema = {
      type: "object",
      properties: {
        name: { type: "string" },
        category: { type: "string" },
        quantity: { type: "number" },
        unit: { type: "string" },
        location: { type: "string" },
        expiration_date: {
          type: "string",
          description:
            "YYYY-MM-DD. PRIORITÉ 1 : date lue sur l'étiquette. PRIORITÉ 2 : estimation par catégorie si rien de lisible.",
        },
        expiration_source: {
          type: "string",
          enum: ["label", "estimated"],
        },
        expiration_raw: { type: "string" },
        confidence: { type: "number" },
      },
      required: ["name", "expiration_date", "expiration_source"],
    };

    const tool = {
      type: "function",
      function: {
        name: "save_scan",
        description: "Enregistrer la liste d'items détectés sur la photo",
        parameters: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Résumé court (1 phrase)" },
            extracted_items: {
              type: "array",
              description: "Items détectés. Si rien d'identifiable, []",
              items: itemSchema,
            },
          },
          required: ["summary", "extracted_items"],
          additionalProperties: false,
        },
      },
    };

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = `Tu es un expert en reconnaissance visuelle d'inventaire ET en OCR de dates de péremption. Module cible: "${module}". Date du jour: ${today}.
${MODULE_HINTS[module as string]}

=== EXTRACTION DATE DE PÉREMPTION (priorité absolue) ===
1) Cherche AGRESSIVEMENT la date sur chaque emballage. Mots-clés FR/EN : DLC, DLUO, DDM, "À consommer avant", EXP, "Best before", "Use by", "BB", "BBE".
2) Normalise en YYYY-MM-DD. Exemples : 12/06/26 → 2026-06-12, 06/2026 → 2026-06-30.
3) Mets le texte brut dans expiration_raw + expiration_source = "label".
4) Si illisible → estime par catégorie (expiration_source = "estimated").

=== RÈGLES ===
- Retourne STRICTEMENT du JSON via tool calling. Tout en FRANÇAIS.
- Ne liste que ce qui est clairement visible. N'invente pas de produits.
- confidence ≥ 0.6 requis pour inclure un item.`;

    const userText = `Identifie tous les items visibles pour le module "${module}". Pour CHAQUE item, renseigne expiration_date (lue ou estimée selon les règles).`;

    // ── Appel IA avec fallback ──
    let aiJson: unknown = null;
    const aiErrors: string[] = [];

    if (LOVABLE_API_KEY) {
      try {
        const t0 = Date.now();
        aiJson = await callLovable(LOVABLE_API_KEY, image_base64 as string, mt, systemPrompt, userText, tool);
        console.log("[scan-fridge] Lovable ok, ms:", Date.now() - t0);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        aiErrors.push(msg);
        aiJson = null;
      }
    }

    if (!aiJson && OPENAI_API_KEY) {
      try {
        const t0 = Date.now();
        aiJson = await callOpenAI(OPENAI_API_KEY, image_base64 as string, mt, systemPrompt, userText, tool);
        console.log("[scan-fridge] OpenAI ok, ms:", Date.now() - t0);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        aiErrors.push(msg);
        aiJson = null;
      }
    }

    if (!aiJson) {
      return fail(
        "Le service d'analyse IA est temporairement indisponible. Réessaie dans un instant.",
        aiErrors
      );
    }

    const parsed = extractScanFromAiResponse(aiJson);
    if (!parsed) {
      return fail("L'IA n'a pas pu analyser cette image. Essaie avec une photo plus nette et mieux éclairée.");
    }

    console.log("[scan-fridge] SUCCESS, items:", parsed.extracted_items.length);
    await recordRateLimit(supa, userData.user.id, "scan_fridge");

    return json200({
      summary: parsed.summary,
      extracted_items: Array.isArray(parsed.extracted_items) ? parsed.extracted_items : [],
    });

  } catch (e) {
    console.error("[scan-fridge] unhandled exception:", e);
    return json200({ error: "Erreur inattendue lors du scan. Réessaie." });
  }
});
