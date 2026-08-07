// Point d'entrée unique de l'import de recettes — POST /recipe-import.
// Le frontend ne connaît jamais l'implémentation propre à une source : il
// envoie { source, input } et reçoit toujours la même forme de réponse.
//
// Ce fichier ne fait que : CORS, auth Supabase, lecture des secrets d'env,
// parsing du corps HTTP. Toute la logique métier (dédoublonnage, cache
// global, dispatch par source, persistance) vit dans
// ../_shared/recipe-import-handler.ts — testable sans `Deno.serve`/`Deno.env`
// (voir recipe-import.e2e.test.ts).
import { createClient } from "@supabase/supabase-js";
import { handleRecipeImport } from "../_shared/recipe-import-handler.ts";

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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? null;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const userSupa = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { data: userData, error: userErr } = await userSupa.auth.getUser();
    if (userErr || !userData.user) {
      return json200({ error: "Non authentifié — reconnecte-toi.", code: "server_error" });
    }

    // Client service_role : SEUL moyen d'écrire/lire le cache global partagé
    // entre utilisateurs (recipe_import_cache n'a pas de policy insert/update,
    // volontairement — bypass RLS uniquement depuis ce serveur, jamais un
    // utilisateur final). Sans cette clé, on dégrade au comportement V2
    // (dédoublonnage par utilisateur uniquement, pas de cache global).
    const admin = SUPABASE_SERVICE_ROLE ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE) : null;

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return json200({ error: "Corps invalide (JSON attendu).", code: "server_error" });
    }

    const responseBody = await handleRecipeImport(rawBody, {
      userSupa,
      admin,
      userId: userData.user.id,
      geminiApiKey: GEMINI_API_KEY,
      openaiApiKey: OPENAI_API_KEY,
    });
    return json200(responseBody);
  } catch (e) {
    console.error("[recipe-import] unhandled exception:", e);
    return json200({ error: "Erreur inattendue lors de l'import. Réessaie.", code: "server_error" });
  }
});
