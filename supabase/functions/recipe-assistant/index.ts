// Suggests recipes from user's food stocks while respecting their food preferences.
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

type Item = { name: string; quantity?: number | null; unit?: string | null; expiration_date?: string | null };
type Prefs = {
  allergies: string[];
  foods_to_avoid: string[];
  goal: string | null;
  no_meat_dairy_mix: boolean;
  other_rules: string | null;
};

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const fail = (msg: string, status = 400, internal?: unknown) => {
    if (internal) console.error("[recipe-assistant]", msg, internal);
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return fail("Service indisponible", 500, "LOVABLE_API_KEY missing");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié", 401, userErr);

    const rl = await checkRateLimit(supa, userData.user.id, "recipe_assistant", 20);
    if (!rl.ok) return fail("Limite atteinte (20 demandes/h). Réessaie plus tard.", 429);

    const { items, preferences, prompt } = (await req.json()) as {
      items: Item[];
      preferences: Prefs;
      prompt?: string;
    };

    if (typeof prompt === "string" && prompt.length > 500) {
      return fail("Demande trop longue (max 500 caractères).", 400);
    }

    const sys = `Tu es un chef-assistant. Tu proposes 3 recettes RÉALISABLES principalement avec les ingrédients en stock fournis.
Tu DOIS respecter STRICTEMENT les règles alimentaires de l'utilisateur :
- Allergies : ${preferences.allergies.join(", ") || "aucune"}
- Aliments à éviter : ${preferences.foods_to_avoid.join(", ") || "aucun"}
- Objectif nutritionnel : ${preferences.goal || "aucun"}
- ${preferences.no_meat_dairy_mix ? "INTERDICTION ABSOLUE de mélanger viande et produits laitiers dans une même recette (règle casher). Une recette ne peut contenir QUE l'un OU l'autre." : ""}
- Règles supplémentaires : ${preferences.other_rules || "aucune"}

Privilégie les ingrédients qui expirent bientôt. Réponds en JSON valide uniquement :
{"recipes":[{"title":"...","time_minutes":number,"difficulty":"facile|moyen|difficile","ingredients_used":["..."],"missing_ingredients":["..."],"steps":["..."],"why_fits":"..."}]}`;

    const stockList = items.length
      ? items.map((i) => `- ${i.name}${i.quantity ? ` (${i.quantity}${i.unit ? " " + i.unit : ""})` : ""}${i.expiration_date ? ` [exp: ${i.expiration_date.slice(0, 10)}]` : ""}`).join("\n")
      : "(aucun ingrédient en stock)";

    const userMsg = `Stocks actuels :\n${stockList}\n\nDemande utilisateur : ${prompt || "Propose-moi 3 recettes."}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (resp.status === 429) return fail("Trop de requêtes. Réessaie dans un instant.", 429);
    if (resp.status === 402) return fail("Crédits IA épuisés.", 402);
    if (!resp.ok) {
      const txt = await resp.text();
      return fail("Erreur d'analyse IA", 502, `${resp.status} ${txt.slice(0, 300)}`);
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return fail("Erreur lors de la génération", 500, e);
  }
});
