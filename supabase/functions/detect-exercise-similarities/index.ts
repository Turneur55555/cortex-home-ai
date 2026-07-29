// Calcule des suggestions de similarité entre exercices Cortex existants
// (voir docs/architecture/exercises-dataset-integration.md §14). Job batch
// (auth CRON_SECRET/service role, même pattern que cleanup-pdfs /
// import-exercises-dataset) — jamais déclenché par un utilisateur final,
// jamais automatique dans son EFFET : il ne fait qu'alimenter
// `exercise_similarity_pairs` en status 'suggested', une liste que
// l'interface d'administration présente pour une décision manuelle. Aucune
// fusion n'est jamais appliquée ici.
//
// Réutilise `scoreExercisePair` (voir `_shared/exerciseDatasetMatching.ts`)
// — même moteur à 5 signaux que l'import dataset, aucune logique dupliquée.
import { createClient } from "@supabase/supabase-js";
import {
  scoreExercisePair,
  type ExistingExerciseForMatch,
} from "../_shared/exerciseDatasetMatching.ts";
import { requireAdminOrCron } from "../_shared/adminAuth.ts";

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

const DEFAULT_MIN_SCORE = 0.5;
const DISCIPLINE = "muscu";

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAdminOrCron(req);
    if (!auth.ok) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: "Service indisponible" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const dryRun = body?.dry_run !== false;
    const minScore = typeof body?.min_score === "number" ? body.min_score : DEFAULT_MIN_SCORE;

    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: rows, error: rowsErr } = await supa
      .from("exercise_reference")
      .select("id, name, category, aliases, config")
      .eq("discipline_id", DISCIPLINE)
      .eq("is_active", true);
    if (rowsErr) throw rowsErr;
    const exercises = (rows ?? []) as ExistingExerciseForMatch[];

    const pairs: Array<{ exercise_id_a: string; exercise_id_b: string; score: number; reasons: string[] }> = [];
    for (let i = 0; i < exercises.length; i++) {
      for (let j = i + 1; j < exercises.length; j++) {
        const result = scoreExercisePair(exercises[i], exercises[j]);
        if (result.score >= minScore) {
          const [a, b] = [exercises[i].id, exercises[j].id].sort();
          pairs.push({ exercise_id_a: a, exercise_id_b: b, score: result.score, reasons: result.reasons });
        }
      }
    }

    const summary = {
      exercisesAnalyzed: exercises.length,
      pairsFound: pairs.length,
      dryRun,
      written: 0,
      skippedAlreadyDecided: 0,
      errors: [] as string[],
    };

    if (!dryRun && pairs.length > 0) {
      // Ne jamais réécrire une paire déjà tranchée manuellement (dismissed/merged) —
      // seule une paire encore 'suggested' peut être recalculée.
      const { data: decided, error: decidedErr } = await supa
        .from("exercise_similarity_pairs")
        .select("exercise_id_a, exercise_id_b")
        .neq("status", "suggested");
      if (decidedErr) throw decidedErr;
      const decidedKeys = new Set((decided ?? []).map((d) => `${d.exercise_id_a}:${d.exercise_id_b}`));

      const toWrite = pairs
        .filter((p) => !decidedKeys.has(`${p.exercise_id_a}:${p.exercise_id_b}`))
        .map((p) => ({ ...p, status: "suggested", computed_at: new Date().toISOString() }));
      summary.skippedAlreadyDecided = pairs.length - toWrite.length;

      const CHUNK = 500;
      for (let i = 0; i < toWrite.length; i += CHUNK) {
        const chunk = toWrite.slice(i, i + CHUNK);
        const { error: upsertErr } = await supa
          .from("exercise_similarity_pairs")
          .upsert(chunk, { onConflict: "exercise_id_a,exercise_id_b", ignoreDuplicates: false });
        if (upsertErr) summary.errors.push(upsertErr.message);
        else summary.written += chunk.length;
      }
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[detect-exercise-similarities] erreur:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
