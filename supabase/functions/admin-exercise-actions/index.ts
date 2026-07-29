// Actions manuelles de la bibliothèque d'exercices — fusion, annulation de
// fusion, archivage, restauration, suppression (voir
// docs/architecture/exercises-dataset-integration.md §14). Appelée depuis
// l'interface d'administration par un utilisateur Cortex authentifié
// (voir `_shared/adminAuth.ts`) — jamais automatique, jamais par un job batch.
//
// Chaque action délègue toute la logique transactionnelle à une fonction
// Postgres SECURITY DEFINER (voir migration
// 20260731120000_exercise_library_admin.sql) : cette edge function ne fait
// que vérifier l'identité de l'appelant puis relayer l'appel via un client
// service_role — aucune logique de fusion/suppression n'est dupliquée ici.
import { createClient } from "@supabase/supabase-js";
import { requireAdminUser } from "../_shared/adminAuth.ts";

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

type Action =
  | "merge"
  | "undo_merge"
  | "archive"
  | "restore"
  | "delete"
  | "dismiss_pair"
  | "usage_stats";

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const auth = await requireAdminUser(req);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SERVICE_ROLE_KEY) return jsonResponse({ error: "Service indisponible" }, 500);
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body?.action as Action | undefined;

    switch (action) {
      case "merge": {
        const keepId = body?.keep_id as string | undefined;
        const archiveId = body?.archive_id as string | undefined;
        if (!keepId || !archiveId) return jsonResponse({ error: "keep_id et archive_id requis" }, 400);
        const { data, error } = await supa
          .rpc("merge_exercise_references", { p_keep_id: keepId, p_archive_id: archiveId })
          .single();
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ mergeLogId: data });
      }
      case "undo_merge": {
        const mergeLogId = body?.merge_log_id as string | undefined;
        if (!mergeLogId) return jsonResponse({ error: "merge_log_id requis" }, 400);
        const { error } = await supa.rpc("undo_exercise_merge", { p_merge_log_id: mergeLogId });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ undone: true });
      }
      case "archive": {
        const id = body?.id as string | undefined;
        if (!id) return jsonResponse({ error: "id requis" }, 400);
        const { error } = await supa.rpc("archive_exercise_reference", { p_id: id });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ archived: true });
      }
      case "restore": {
        const id = body?.id as string | undefined;
        if (!id) return jsonResponse({ error: "id requis" }, 400);
        const { error } = await supa.rpc("restore_exercise_reference", { p_id: id });
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ restored: true });
      }
      case "delete": {
        const id = body?.id as string | undefined;
        if (!id) return jsonResponse({ error: "id requis" }, 400);
        const { data, error } = await supa
          .rpc("delete_exercise_reference_if_unused", { p_id: id })
          .single();
        if (error) return jsonResponse({ error: error.message }, 400);
        if (!data) {
          return jsonResponse({
            deleted: false,
            reason: "Cet exercice est encore référencé (séances, segments, photos, ou fusion) — propose une fusion plutôt qu'une suppression.",
          });
        }
        return jsonResponse({ deleted: true });
      }
      case "dismiss_pair": {
        const pairId = body?.pair_id as string | undefined;
        if (!pairId) return jsonResponse({ error: "pair_id requis" }, 400);
        const { error } = await supa
          .from("exercise_similarity_pairs")
          .update({ status: "dismissed" })
          .eq("id", pairId);
        if (error) return jsonResponse({ error: error.message }, 400);
        return jsonResponse({ dismissed: true });
      }
      // Lecture seule — nombre de séances distinctes et d'utilisations
      // totales par exercice. Passe par le service_role car `exercises` est
      // protégé par une RLS "propriétaire uniquement" (voir docs/architecture/
      // exercises-dataset-integration.md §14) : depuis le client, seule la
      // personne connectée verrait ses propres séances, jamais l'usage réel
      // agrégé de tout Cortex. (La provenance "Fusionné" ne passe plus par
      // ici : `exercise_reference.merged_at` — colonne lisible par tous — la
      // porte directement, voir `deriveExerciseOrigin`.)
      case "usage_stats": {
        const ids = (body?.ids as string[] | undefined) ?? [];
        if (!Array.isArray(ids) || ids.length === 0) return jsonResponse({ stats: {} });

        const stats: Record<string, { sessionCount: number; totalUses: number }> = {};
        for (const id of ids) stats[id] = { sessionCount: 0, totalUses: 0 };

        const { data: usageRows, error: usageError } = await supa
          .from("exercises")
          .select("exercise_reference_id, workout_id")
          .in("exercise_reference_id", ids);
        if (usageError) return jsonResponse({ error: usageError.message }, 400);

        const sessionsByExercise: Record<string, Set<string>> = {};
        for (const row of usageRows ?? []) {
          const id = row.exercise_reference_id as string;
          if (!stats[id]) continue;
          stats[id].totalUses += 1;
          (sessionsByExercise[id] ??= new Set()).add(row.workout_id as string);
        }
        for (const [id, sessions] of Object.entries(sessionsByExercise)) {
          stats[id].sessionCount = sessions.size;
        }

        return jsonResponse({ stats });
      }
      default:
        return jsonResponse({ error: "action inconnue (merge|undo_merge|archive|restore|delete|dismiss_pair|usage_stats)" }, 400);
    }
  } catch (e) {
    console.error("[admin-exercise-actions] erreur:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erreur inconnue" }, 500);
  }
});
