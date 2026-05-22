// Parses natural language into a structured reminder via Lovable AI.
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

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const fail = (msg: string, status = 400, internal?: unknown) => {
    if (internal) console.error("[parse-reminder]", msg, internal);
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return fail("Service indisponible", 500, "LOVABLE_API_KEY manquant");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return fail("Non authentifié", 401, userErr);

    const rl = await checkRateLimit(supa, userData.user.id, "parse_reminder", 60);
    if (!rl.ok) return fail("Limite atteinte (60/h).", 429);

    const { text } = (await req.json()) as { text?: string };
    if (typeof text !== "string" || !text.trim()) return fail("Texte requis", 400);
    if (text.length > 300) return fail("Texte trop long (max 300)", 400);
    const safeText = text.replace(/[\u0000-\u001F\u007F]/g, " ").trim();

    const now = new Date();
    const sys = `Tu convertis une phrase courte en français en rappel structuré.
Date/heure courante: ${now.toISOString()} (fuseau Europe/Paris).
Réponds UNIQUEMENT en JSON valide avec exactement ces clés:
{"title": string, "due_at": string|null (ISO 8601 ou null), "priority": "low"|"medium"|"high"|"urgent", "category": string|null, "recurrence": "none"|"daily"|"weekly"|"monthly"|"yearly"}
Règles:
- title: court, sans la date ni la priorité
- due_at: extrait expressions comme "demain 18h", "vendredi", "dans 2h", "le 15"; sinon null
- priority: "urgent" si "urgent/asap/vite", "high" si "important", sinon "medium"
- category: ex "Maison", "Santé", "Travail", "Courses" si évident, sinon null
- recurrence: détecte "tous les jours", "chaque semaine", etc.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `<input>${safeText}</input>` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (aiRes.status === 429) return fail("Trop de requêtes. Réessaie.", 429);
    if (aiRes.status === 402) return fail("Crédits IA épuisés.", 402);
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return fail("Erreur IA", 502, t.slice(0, 300));
    }
    const data = await aiRes.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return fail("Réponse IA invalide", 502);
    }

    // Sanitize
    const allowedPrio = ["low", "medium", "high", "urgent"];
    const allowedRec = ["none", "daily", "weekly", "monthly", "yearly"];
    const title = typeof parsed.title === "string" && parsed.title.trim()
      ? parsed.title.trim().slice(0, 200)
      : safeText.slice(0, 200);
    const due_at = typeof parsed.due_at === "string" && !isNaN(Date.parse(parsed.due_at))
      ? new Date(parsed.due_at).toISOString()
      : null;
    const priority = allowedPrio.includes(parsed.priority as string)
      ? (parsed.priority as string)
      : "medium";
    const category = typeof parsed.category === "string" && parsed.category.trim()
      ? parsed.category.trim().slice(0, 60)
      : null;
    const recurrence = allowedRec.includes(parsed.recurrence as string)
      ? (parsed.recurrence as string)
      : "none";

    await recordRateLimit(supa, userData.user.id, "parse_reminder");

    return new Response(
      JSON.stringify({ title, due_at, priority, category, recurrence }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return fail("Erreur lors de l'analyse", 500, e);
  }
});
