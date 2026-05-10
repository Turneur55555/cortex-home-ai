// Génère une séance de musculation personnalisée via Lovable AI Gateway.
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

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const fail = (publicMsg: string, status = 400, internal?: unknown) => {
    if (internal) console.error("[coach-workout]", publicMsg, internal);
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

    const rl = await checkRateLimit(supa, userData.user.id, "coach_workout", 20);
    if (!rl.ok) return fail("Limite atteinte (20 séances/h). Réessaie plus tard.", 429);

    const body = await req.json();
    const muscles: string[] = Array.isArray(body.muscles) ? body.muscles : [];
    const duration: number = Number(body.duration_minutes) || 45;
    const equipment: string = typeof body.equipment === "string" ? body.equipment : "salle complète";
    const level: string = typeof body.level === "string" ? body.level : "intermédiaire";
    const goal: string = typeof body.goal === "string" ? body.goal : "hypertrophie";

    if (muscles.length === 0) return fail("Sélectionne au moins un groupe musculaire", 400);

    const tool = {
      type: "function",
      function: {
        name: "save_workout",
        description: "Enregistrer la séance générée",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nom court et accrocheur de la séance, en français" },
            duration_minutes: { type: "number" },
            notes: { type: "string", description: "Conseils brefs (1-2 phrases) : échauffement, tempo, repos" },
            exercises: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Nom de l'exercice en français" },
                  sets: { type: "number" },
                  reps: { type: "number" },
                  weight: { type: "number", description: "Charge suggérée en kg, ou 0 pour poids du corps" },
                },
                required: ["name", "sets", "reps"],
              },
            },
          },
          required: ["name", "duration_minutes", "exercises"],
          additionalProperties: false,
        },
      },
    };

    const systemPrompt = `Tu es un coach sportif expert. Génère une séance de musculation personnalisée en FRANÇAIS.

Contraintes :
- Groupes musculaires ciblés : ${muscles.join(", ")}
- Durée totale : ~${duration} minutes (compte ~2-3 min par série incluant repos)
- Matériel : ${equipment}
- Niveau : ${level}
- Objectif : ${goal}

Règles :
- 4 à 7 exercices, du plus polyarticulaire au plus isolé
- Sets : 3-5, Reps : adaptées à l'objectif (force 4-6, hypertrophie 8-12, endurance 12-20)
- Charge en kg réaliste pour le niveau (0 si poids du corps)
- Nom de séance court et motivant (ex: "Push intense", "Jambes power")
- Notes : 1-2 phrases avec échauffement et conseil clé
- Retourne STRICTEMENT du JSON via tool calling.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Génère la séance maintenant." },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "save_workout" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      if (aiRes.status === 429) return fail("Limite de requêtes atteinte. Réessayez dans un instant.", 429);
      if (aiRes.status === 402) return fail("Crédits IA épuisés.", 402);
      return fail("Erreur d'analyse IA", 502, `${aiRes.status} ${txt.slice(0, 500)}`);
    }

    const aiJson = await aiRes.json();
    const call = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return fail("Réponse IA invalide", 502);
    const parsed = JSON.parse(call.function.arguments);

    await recordRateLimit(supa, userData.user.id, "coach_workout");

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return fail("Erreur lors de la génération", 500, e);
  }
});
