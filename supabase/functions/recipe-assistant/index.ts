// Suggests recipes from user's food stocks while respecting their food preferences.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Item = { name: string; quantity?: number | null; unit?: string | null; expiration_date?: string | null };
type Prefs = {
  allergies: string[];
  foods_to_avoid: string[];
  goal: string | null;
  no_meat_dairy_mix: boolean;
  other_rules: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { items, preferences, prompt } = (await req.json()) as {
      items: Item[];
      preferences: Prefs;
      prompt?: string;
    };

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

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

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Trop de requêtes. Réessaie dans un instant." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "Crédits IA épuisés. Recharge ton workspace Lovable." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) throw new Error(`AI gateway: ${resp.status}`);

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
