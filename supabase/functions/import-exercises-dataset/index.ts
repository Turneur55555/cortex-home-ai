// Import du dataset externe hasaneyldrm/exercises-dataset — philosophie
// "bibliothèque complète" (révisée le 2026-07-31, voir
// docs/architecture/exercises-dataset-integration.md §14, décision de Nathan) :
//
// - Cortex reste TOUJOURS la source de vérité. Ce job ne modifie, n'enrichit
//   ni ne touche JAMAIS une ligne `exercise_reference` existante.
// - Chaque enregistrement du dataset devient une fiche `exercise_reference`
//   INDÉPENDANTE, à l'exception des "doublons techniques évidents" (même
//   exercice répété avec un simple marqueur de démonstration différent —
//   voir `_shared/exerciseDatasetDedup.ts`). Aucune fusion n'est jamais
//   automatique : la détection de similarité avec l'existant est un job
//   séparé (`detect-exercise-similarities`) qui ne fait que proposer des
//   suggestions consultées et validées manuellement depuis l'interface
//   d'administration.
// - Médias multiples : chaque fiche importée reçoit ses photo/GIF dans la
//   table `exercise_media` (source='dataset'), jamais dans une colonne
//   unique — une fiche peut ensuite recevoir d'autres médias (Cortex ou
//   fusion) sans rien écraser.
//
// Garanties inchangées : `dry_run: true` par défaut (aucune écriture), un
// run réel journalise chaque ligne créée (`exercise_reference_import_created`)
// pour une restauration exacte via `restore-exercises-dataset-import` — ce
// job n'a plus besoin de sauvegarder de lignes existantes (il n'en modifie
// aucune), seulement de journaliser ce qu'il crée.
import { createClient } from "@supabase/supabase-js";
import {
  exactTranslateExerciseName,
  translateExerciseNameToFrench,
  translateMuscleToFrench,
  translateEquipmentToFrench,
} from "../_shared/exerciseTranslations.ts";
import { deduplicateDatasetRecords, type DedupInput } from "../_shared/exerciseDatasetDedup.ts";
import { normalizeForMatch } from "../_shared/textNormalize.ts";

const DATASET_SOURCE = "hasaneyldrm/exercises-dataset";
const DATASET_JSON_URL =
  "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json";
const DISCIPLINE = "muscu";

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

interface RawDatasetRecord extends DedupInput {
  name: string;
  category?: string | null;
  body_part?: string | null;
  target?: string | null;
  muscle_group?: string | null;
  secondary_muscles?: string[] | null;
  equipment?: string | null;
  instructions?: Record<string, string | string[]> | null;
  instruction_steps?: Record<string, string[]> | null;
  image?: string | null;
  gif_url?: string | null;
  media_id?: string | null;
  attribution?: string | null;
}

interface ImportSummary {
  datasetRecords: number;
  technicalDuplicatesSkipped: number;
  skippedNoName: number;
  createdIndependentFiches: number;
  dryRun: boolean;
  runId: string | null;
  errors: string[];
}

function toMuscleGroup(record: RawDatasetRecord): string | null {
  return record.muscle_group ?? record.target ?? record.body_part ?? null;
}

function frenchInstructions(record: RawDatasetRecord): string | null {
  const fr = record.instructions?.fr;
  if (!fr) return null;
  return Array.isArray(fr) ? fr.join("\n") : fr;
}

function buildConfigPayload(record: RawDatasetRecord) {
  const muscleGroupEn = toMuscleGroup(record);
  return {
    dataset_category: record.category ?? null,
    body_part: record.body_part ?? null,
    muscle_group: translateMuscleToFrench(muscleGroupEn) ?? muscleGroupEn,
    muscle_group_en: muscleGroupEn,
    secondary_muscles: (record.secondary_muscles ?? []).map((m) => translateMuscleToFrench(m) ?? m),
    secondary_muscles_en: record.secondary_muscles ?? [],
    equipment: translateEquipmentToFrench(record.equipment ?? null) ?? record.equipment ?? null,
    equipment_en: record.equipment ?? null,
    instructions_en: Array.isArray(record.instructions?.en)
      ? (record.instructions?.en as string[]).join("\n")
      : record.instructions?.en ?? null,
    instruction_steps_fr: record.instruction_steps?.fr ?? null,
  };
}

function bestFrenchName(record: RawDatasetRecord): string {
  return exactTranslateExerciseName(record.name) ?? translateExerciseNameToFrench(record.name);
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
    // dry_run par défaut TRUE : aucune écriture (ni création, ni run
    // journalisé) tant que dry_run:false n'est pas explicitement demandé.
    const dryRun = body?.dry_run !== false;
    const limit: number | undefined = typeof body?.limit === "number" ? body.limit : undefined;

    const supa = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const datasetResponse = await fetch(DATASET_JSON_URL);
    if (!datasetResponse.ok) {
      throw new Error(`Échec de récupération du dataset: HTTP ${datasetResponse.status}`);
    }
    const allRecords = ((await datasetResponse.json()) as RawDatasetRecord[]).map((r) => ({
      ...r,
      id: String(r.id),
    }));
    const records = typeof limit === "number" ? allRecords.slice(0, limit) : allRecords;
    const withName = records.filter((r) => (r.name ?? "").trim().length > 0);
    const skippedNoName = records.length - withName.length;

    const { kept, skipped: technicalDuplicates } = deduplicateDatasetRecords(withName);

    // Noms déjà pris (Cortex existant + dataset déjà inséré dans ce run) —
    // garantit qu'aucune fiche indépendante ne viole la contrainte unique
    // (discipline_id, name) : en cas de collision de traduction, le nom
    // anglais d'origine est ajouté entre parenthèses pour désambiguïser
    // plutôt que de fusionner silencieusement deux exercices différents.
    const { data: existingNames, error: namesErr } = await supa
      .from("exercise_reference")
      .select("name")
      .eq("discipline_id", DISCIPLINE);
    if (namesErr) throw namesErr;
    const takenNames = new Set((existingNames ?? []).map((r) => normalizeForMatch(r.name)));

    let runId: string | null = null;
    if (!dryRun) {
      runId = crypto.randomUUID();
      const { error: runErr } = await supa
        .from("exercise_reference_import_runs")
        .insert({ id: runId, dataset_source: DATASET_SOURCE });
      if (runErr) throw new Error(`Échec création du run: ${runErr.message}`);
    }

    const summary: ImportSummary = {
      datasetRecords: records.length,
      technicalDuplicatesSkipped: technicalDuplicates.length,
      skippedNoName,
      createdIndependentFiches: 0,
      dryRun,
      runId,
      errors: [],
    };

    for (const record of kept) {
      const frName = bestFrenchName(record);
      let canonicalName = frName;
      if (takenNames.has(normalizeForMatch(canonicalName))) {
        canonicalName = `${frName} (${record.name})`;
      }
      takenNames.add(normalizeForMatch(canonicalName));

      summary.createdIndependentFiches += 1;
      if (dryRun) continue;

      const description = frenchInstructions(record);
      const config = buildConfigPayload(record);
      const media = {
        source: "gymvisual",
        attribution: record.attribution ?? "© Gym visual — https://gymvisual.com/",
        thumbnail_url: record.image ?? null,
        gif_url: record.gif_url ?? null,
        media_id: record.media_id ?? null,
      };

      const { data: insertedRow, error: insertErr } = await supa
        .from("exercise_reference")
        .insert({
          discipline_id: DISCIPLINE,
          name: canonicalName,
          category:
            translateMuscleToFrench(record.category ?? toMuscleGroup(record)) ??
            record.category ??
            toMuscleGroup(record),
          description,
          media,
          config,
          aliases: [record.name].filter((n) => normalizeForMatch(n) !== normalizeForMatch(canonicalName)),
          dataset_source: DATASET_SOURCE,
          dataset_exercise_id: record.id,
          dataset_synced_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertErr) {
        summary.errors.push(`création "${canonicalName}": ${insertErr.message}`);
        continue;
      }

      if (runId && insertedRow?.id) {
        const { error: createdLogErr } = await supa
          .from("exercise_reference_import_created")
          .insert({ run_id: runId, exercise_reference_id: insertedRow.id });
        if (createdLogErr) summary.errors.push(`journal création ${insertedRow.id}: ${createdLogErr.message}`);
      }

      const mediaRows = [
        record.image
          ? {
              exercise_reference_id: insertedRow?.id,
              media_type: "image" as const,
              url: record.image,
              source: "dataset" as const,
              attribution: media.attribution,
              is_primary: true,
              sort_order: 0,
            }
          : null,
        record.gif_url
          ? {
              exercise_reference_id: insertedRow?.id,
              media_type: "gif" as const,
              url: record.gif_url,
              source: "dataset" as const,
              attribution: media.attribution,
              is_primary: true,
              sort_order: 0,
            }
          : null,
      ].filter((r): r is NonNullable<typeof r> => r !== null);

      if (mediaRows.length > 0 && insertedRow?.id) {
        const { error: mediaErr } = await supa.from("exercise_media").insert(mediaRows);
        if (mediaErr) summary.errors.push(`médias ${insertedRow.id}: ${mediaErr.message}`);
      }
    }

    if (!dryRun && runId) {
      const { error: completeErr } = await supa
        .from("exercise_reference_import_runs")
        .update({
          completed_at: new Date().toISOString(),
          records_total: summary.datasetRecords,
          records_created: summary.createdIndependentFiches,
        })
        .eq("id", runId);
      if (completeErr) summary.errors.push(`clôture run ${runId}: ${completeErr.message}`);
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[import-exercises-dataset] erreur:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erreur inconnue" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
