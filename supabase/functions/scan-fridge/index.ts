// Scanne une photo (frigo, placard, armoire, etc.) via Lovable AI Gateway
// Renvoie une liste d'items détectés au format du module cible.
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
    "Identifie chaque médicament/produit pharmaceutique visible : name (marque + dosage si lisible), category (antalgique, antibiotique, vitamine, sirop, autre), quantity, unit (boîte, comprimé, ml), expiration_date si lisible.",
  habits:
    "Identifie chaque vêtement visible : name (ex: T-shirt blanc), category (haut, bas, chaussure, accessoire, sous-vêtement), quantity, location si déductible.",
  menager:
    "Identifie chaque produit ménager visible : name, category (entretien, hygiène, papier, lessive), quantity, unit.",
};

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const fail = (publicMsg: string, status = 400, internal?: unknown) => {
    if (internal) console.error("[scan-fridge]", publicMsg, internal);
    return new Response(JSON.stringify({ error: publicMsg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return fail("Service indisponible", 500, "LOVABLE_API_KEY manquant");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });

    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié", 401, userErr);

    const rl = await checkRateLimit(supa, userData.user.id, "scan_fridge", 20);
    if (!rl.ok) return fail("Limite atteinte (20 scans/h). Réessaie plus tard.", 429);

    const { image_base64, mime_type, module } = await req.json();
    if (!image_base64 || typeof image_base64 !== "string") return fail("Image manquante", 400);
    if (!module || !MODULE_HINTS[module]) return fail("Module invalide", 400);
    if (image_base64.length > 12_000_000) return fail("Image trop volumineuse", 413);

    const mt =
      typeof mime_type === "string" && mime_type.startsWith("image/") ? mime_type : "image/jpeg";

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
            "Date au format YYYY-MM-DD. PRIORITÉ 1 : la date lue sur l'étiquette. PRIORITÉ 2 (si rien n'est lisible) : une estimation raisonnable basée sur la catégorie du produit et la date du jour fournie. Toujours renseigner ce champ.",
        },
        expiration_source: {
          type: "string",
          enum: ["label", "estimated"],
          description:
            "'label' si la date a été lue sur l'emballage, 'estimated' si déduite de la catégorie.",
        },
        expiration_raw: {
          type: "string",
          description:
            "Texte exact lu sur l'étiquette (ex: 'DLC 12/06/2026', 'EXP 06.2026', 'BB 2026-06-12'). Vide si estimée.",
        },
        confidence: {
          type: "number",
          description: "0..1 confiance dans l'identification du produit",
        },
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
${MODULE_HINTS[module]}

=== EXTRACTION DE LA DATE DE PÉREMPTION (priorité absolue) ===
1) Cherche AGRESSIVEMENT la date sur chaque emballage. Mots-clés FR/EN à repérer (zoome mentalement) :
   - DLC, DLUO, DDM, "À consommer avant", "À consommer jusqu'au", "À consommer de préférence avant"
   - EXP, EXP.DATE, EXPIRY, "Best before", "BB", "BBE", "Use by", "Mfg/Exp"
   - Lot + date imprimée à côté
2) Formats à reconnaître et NORMALISER en YYYY-MM-DD :
   - JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA, JJ MM AAAA
   - JJ/MM/AA → 20AA. Ex : 12/06/26 → 2026-06-12
   - MM/AAAA ou MM-AAAA (mois seul) → dernier jour du mois (ex : 06/2026 → 2026-06-30)
   - AAAA-MM-JJ déjà bon
   - Si l'année a 2 chiffres et < 50 → 20XX, sinon 19XX
3) Mets le texte BRUT lu dans expiration_raw + expiration_source = "label".
4) Si la date est PARTIELLEMENT lisible (ex: "..06/26"), tente la meilleure interprétation et baisse confidence.

=== FALLBACK : ESTIMATION PAR CATÉGORIE (si AUCUNE date n'est lisible) ===
Calcule expiration_date = date du jour + durée typique selon la nature du produit, puis expiration_source = "estimated".
Durées indicatives à partir d'aujourd'hui (${today}) :
- Produits laitiers frais (yaourt, crème, lait ouvert) : +10 jours
- Lait UHT non ouvert : +90 jours
- Fromage frais : +14 jours / fromage à pâte dure : +60 jours
- Viande / poisson frais : +3 jours
- Viande / poisson surgelé : +180 jours
- Charcuterie sous vide : +21 jours
- Œufs : +21 jours
- Légumes frais : +7 jours / fruits frais : +7 jours
- Surgelés : +180 jours
- Conserves, bocaux, pâtes sèches, riz, café : +730 jours
- Boissons (jus ouvert) : +5 jours / non ouvert : +180 jours / sodas, eau : +365 jours
- Sauces ouvertes : +30 jours / non ouvertes : +365 jours
- Pain : +3 jours / pâtisseries : +5 jours
- Médicaments génériques sans date lisible : +365 jours
- Produits ménagers : +730 jours
- Vêtements : +3650 jours (purement formel)
Si tu hésites entre deux catégories, prends la plus COURTE durée (sécurité alimentaire).

=== RÈGLES GÉNÉRALES ===
- Liste UNIQUEMENT ce que tu vois clairement sur la photo, en FRANÇAIS.
- N'invente JAMAIS le nom d'un produit. Mieux vaut omettre.
- Si plusieurs exemplaires identiques : UNE ligne, quantity = nombre estimé.
- confidence : 0.9+ certain, 0.6-0.9 probable, <0.6 ne pas inclure.
- expiration_date est OBLIGATOIRE pour chaque item retourné (lue ou estimée).
- Retourne STRICTEMENT du JSON via tool calling.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Identifie tous les items visibles sur cette photo pour le module "${module}". Pour CHAQUE item, renseigne expiration_date (lue OU estimée selon les règles).`,
              },
              { type: "image_url", image_url: { url: `data:${mt};base64,${image_base64}` } },
            ],
          },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "save_scan" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      if (aiRes.status === 429)
        return fail("Limite de requêtes atteinte. Réessayez dans un instant.", 429);
      if (aiRes.status === 402) return fail("Crédits IA épuisés.", 402);
      return fail("Erreur d'analyse IA", 502, `${aiRes.status} ${txt.slice(0, 500)}`);
    }

    const aiJson = await aiRes.json();
    const call = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return fail("Réponse IA invalide", 502);
    const parsed = JSON.parse(call.function.arguments);

    await recordRateLimit(supa, userData.user.id, "scan_fridge");

    return new Response(
      JSON.stringify({
        summary: parsed.summary ?? "",
        extracted_items: Array.isArray(parsed.extracted_items) ? parsed.extracted_items : [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return fail("Erreur lors du scan", 500, e);
  }
});
