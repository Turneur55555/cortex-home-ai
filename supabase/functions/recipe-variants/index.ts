// Point d'entrée de POST /recipe-variants — "Proposer des variantes" (module
// Recettes). Ce fichier ne fait que : CORS, auth Supabase, lecture des
// secrets d'env, parsing du corps HTTP. Toute la logique métier (validation,
// rate limit, appel Gemini, sanitation stricte) vit dans
// ../_shared/recipe-variants-handler.ts — testable sans `Deno.serve`/`Deno.env`
// (voir recipe-variants.e2e.test.ts). Même convention que recipe-import.
import { createClient } from "@supabase/supabase-js";
import { handleRecipeVariants } from "../_shared/recipe-variants-handler.ts";

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

  const json200 = (body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? null;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const userSupa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { data: userData, error: userErr } = await userSupa.auth.getUser();
    if (userErr || !userData.user) {
      return json200({ error: "Non authentifié — reconnecte-toi.", code: "server_error" });
    }

    const rawBody = await req.json().catch(() => ({}));
    const result = await handleRecipeVariants(rawBody, {
      userSupa,
      userId: userData.user.id,
      geminiApiKey: GEMINI_API_KEY,
    });
    return json200(result);
  } catch (e) {
    console.error("[recipe-variants] fatal:", e);
    return json200({ error: "Erreur inattendue lors de la génération des variantes. Réessaie.", code: "server_error" });
  }
});
