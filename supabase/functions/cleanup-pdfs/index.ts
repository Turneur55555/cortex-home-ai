// Nettoyage automatique des PDFs > 90 jours
// Appelée via webhook externe ou cron Supabase
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
    // Vérifier le secret de déclenchement (pour appels cron externes)
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

    // Authentification : accepter le CRON_SECRET OU le service role key
    if (provided !== cronSecret && provided !== SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Utiliser le service role pour bypasser RLS (nécessaire pour cleanup)
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const cutoff = cutoffDate.toISOString();

    // Supprimer depuis user_pdfs
    const { count: pdfCount, error: pdfErr } = await supa
      .from("user_pdfs")
      .delete({ count: "exact" })
      .lt("created_at", cutoff);

    if (pdfErr) console.error("[cleanup-pdfs] user_pdfs error:", pdfErr.message);

    // Supprimer les fichiers storage orphelins
    const { data: oldFiles, error: storageErr } = await supa.storage
      .from("pdfs")
      .list("", { limit: 1000 });

    let storageDeleted = 0;
    if (!storageErr && oldFiles) {
      const toDelete = oldFiles
        .filter((f) => f.created_at && f.created_at < cutoff)
        .map((f) => f.name);

      if (toDelete.length > 0) {
        await supa.storage.from("pdfs").remove(toDelete);
        storageDeleted = toDelete.length;
      }
    }

    console.log(`[cleanup-pdfs] Supprimé: ${pdfCount ?? 0} user_pdfs, ${storageDeleted} fichiers storage`);

    return new Response(
      JSON.stringify({
        success: true,
        deleted: { user_pdfs: pdfCount ?? 0, storage_files: storageDeleted },
        cutoff_date: cutoff,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[cleanup-pdfs] Erreur:", e);
    return new Response(JSON.stringify({ error: "Erreur lors du nettoyage" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
