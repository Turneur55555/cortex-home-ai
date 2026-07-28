// Restauration exacte d'un run réel de import-exercises-dataset (voir
// docs/architecture/exercises-dataset-integration.md §12 et migration
// 20260729120000_exercises_dataset_import_snapshot.sql).
//
// N'appelle que la fonction Postgres `restore_exercise_reference_import`
// (SECURITY DEFINER) via RPC — toute la logique de restauration vit en base,
// dans une transaction unique, pour éviter tout état intermédiaire
// incohérent. Cette edge function ne fait que vérifier l'authentification et
// relayer l'appel.
//
// Effet : supprime les lignes `exercise_reference` créées par le run
// (aucune casse de FK — voir commentaire de la migration) et restaure l'état
// exact (row_data) des lignes enrichies par ce run. Ne touche jamais une
// ligne qui n'a pas été journalisée par CE run_id précis.
import { createClient } from "@supabase/supabase-js";

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

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    const cronSecret = Deno.env.get("CRON_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SERVICE_ROLE_KEY || !cronSecret) {
      return new Response(JSON.stringify({ error: "Service indisponible" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (provided !== cronSecret && provided !== SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const runId: string | undefined = body?.run_id;
    if (!runId) {
      return new Response(JSON.stringify({ error: "run_id requis" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await supa
      .rpc("restore_exercise_reference_import", { p_run_id: runId })
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ runId, ...data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[restore-exercises-dataset-import] erreur:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
