// Analyse les séances récentes et conseille muscles fatigués + à travailler.
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

const MUSCLES = [
  "pectoraux", "dos", "épaules", "biceps", "triceps",
  "jambes", "fessiers", "abdos", "cardio",
];

Deno.serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const fail = (msg: string, status = 400, internal?: unknown) => {
    if (internal) console.error("[muscle-readiness]", msg, internal);
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...cors, "Content-Type": "application/json" },
    });
  };

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return fail("Service indisponible", 500);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié", 401, userErr);

    // Fetch last 10 days of workouts with exercises
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 10);
    const sinceStr = sinceDate.toISOString().slice(0, 10);

    const { data: workouts, error: wErr } = await supa
      .from("workouts")
      .select("name, date, notes, exercises(name, sets, reps, weight)")
      .gte("date", sinceStr)
      .order("date", { ascending: false });
    if (wErr) return fail("Lecture séances impossible", 500, wErr);

    const summary = (workouts ?? []).map((w) => ({
      date: w.date,
      name: w.name,
      exercises: (w.exercises ?? []).map((ex: { name: string; sets: number | null; reps: number | null; weight: number | null }) => ({
        name: ex.name, sets: ex.sets, reps: ex.reps, weight: ex.weight,
      })),
    }));

    const today = new Date().toISOString().slice(0, 10);

    const tool = {
      type: "function",
      function: {
        name: "report_readiness",
        description: "Diagnostic de récupération musculaire",
        parameters: {
          type: "object",
          properties: {
            fatigued: {
              type: "array",
              description: "Muscles encore fatigués (récupération incomplète)",
              items: {
                type: "object",
                properties: {
                  muscle: { type: "string", enum: MUSCLES },
                  last_trained: { type: "string", description: "Date YYYY-MM-DD de dernière sollicitation" },
                  reason: { type: "string", description: "Court (1 phrase) en français" },
                },
                required: ["muscle", "reason"],
              },
            },
            recommended: {
              type: "array",
              description: "Muscles recommandés à travailler aujourd'hui",
              items: {
                type: "object",
                properties: {
                  muscle: { type: "string", enum: MUSCLES },
                  reason: { type: "string", description: "Court (1 phrase) en français" },
                },
                required: ["muscle", "reason"],
              },
            },
            advice: { type: "string", description: "Conseil global court (1-2 phrases) en français" },
          },
          required: ["fatigued", "recommended", "advice"],
          additionalProperties: false,
        },
      },
    };

    const systemPrompt = `Tu es un coach sportif. Analyse les séances récentes d'un utilisateur et détermine :
1) Quels groupes musculaires sont encore en récupération (fatigués) — règle générale : 48h pour petits muscles (biceps, triceps, abdos, mollets), 72h pour gros (pectoraux, dos, jambes, fessiers, épaules).
2) Quels groupes musculaires l'utilisateur devrait travailler aujourd'hui (${today}) pour équilibrer son volume hebdomadaire et respecter la récupération.

Reste FACTUEL et CONCIS. Réponds en FRANÇAIS via tool calling uniquement.
Si aucune séance récente : recommended = priorités équilibrées, fatigued = vide.`;

    const userPrompt = `Aujourd'hui : ${today}
Séances des 10 derniers jours :
${JSON.stringify(summary, null, 2)}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Lovable-API-Key": LOVABLE_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "report_readiness" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      if (aiRes.status === 429) return fail("Limite de requêtes atteinte.", 429);
      if (aiRes.status === 402) return fail("Crédits IA épuisés.", 402);
      return fail("Erreur d'analyse IA", 502, `${aiRes.status} ${txt.slice(0, 500)}`);
    }

    const aiJson = await aiRes.json();
    const call = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return fail("Réponse IA invalide", 502);
    const parsed = JSON.parse(call.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return fail("Erreur lors de l'analyse", 500, e);
  }
});
