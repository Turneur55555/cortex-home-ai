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
    if (internal) console.error("[chat]", publicMsg, internal);
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

    const rl = await checkRateLimit(supa, userData.user.id, "chat", 60);
    if (!rl.ok) return fail("Limite atteinte (60 messages/h). Réessaie plus tard.", 429);

    const body = await req.json();
    const rawMessages: unknown = body.messages;
    if (!Array.isArray(rawMessages) || rawMessages.length === 0 || rawMessages.length > 50) {
      return fail("Historique invalide", 400);
    }

    const messages: Array<{ role: string; content: string }> = [];
    for (const m of rawMessages) {
      if (
        typeof m !== "object" ||
        m === null ||
        typeof (m as Record<string, unknown>).role !== "string" ||
        typeof (m as Record<string, unknown>).content !== "string"
      ) {
        return fail("Message invalide", 400);
      }
      const role = (m as Record<string, string>).role;
      const content = (m as Record<string, string>).content.slice(0, 2000);
      if (role !== "user" && role !== "assistant") continue;
      messages.push({ role, content });
    }

    if (messages.length === 0) return fail("Aucun message", 400);

    const systemPrompt = `Tu es l'assistant intelligent ICORTEX, intégré dans une application de maison connectée.

L'application aide l'utilisateur à :
- Gérer ses stocks (frigo, armoire, pharmacie) avec scan IA
- Suivre sa forme physique (poids, mensurations, séances, nutrition)
- Analyser des documents PDF par IA

Règles :
- Réponds toujours en français, de façon concise et amicale
- Sois utile et proactif : suggère des actions concrètes dans l'app
- Si l'utilisateur demande quelque chose hors périmètre, redirige poliment
- Reste bref : 2-4 phrases max sauf si on te demande plus de détails
- Utilise un ton décontracté mais professionnel`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      if (aiRes.status === 429) return fail("Limite de requêtes atteinte.", 429);
      if (aiRes.status === 402) return fail("Crédits IA épuisés.", 402);
      return fail("Erreur IA", 502, `${aiRes.status} ${txt.slice(0, 500)}`);
    }

    const aiJson = await aiRes.json();
    const reply = aiJson.choices?.[0]?.message?.content ?? "";

    await recordRateLimit(supa, userData.user.id, "chat");

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return fail("Erreur interne", 500, err);
  }
});
