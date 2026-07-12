import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalize } from "@/lib/fitness/exerciseCatalog";
import { exerciseToMuscles } from "@/lib/fitness/muscleMapping";
import { resolveExerciseId } from "@/services/exerciseResolution";
import { identityKey } from "@/lib/fitness/recentExercises";

const PHOTOS_KEY = ["user-exercise-photos"] as const;

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Retourne un Map<clé d'identité, signedUrl> des photos personnalisées.
 *
 * Étape 4.5 (2026-07-12) — bascule identité : `exercise_reference_id`
 * (colonne additive, backfillée le 2026-07-12, voir
 * docs/phase3-backfill-log.md) sert désormais de clé en priorité
 * (`identityKey`, même fonction que les autres hooks migrés). Filet de
 * compatibilité : une ligne sans référence résolue reste indexée par nom
 * normalisé, comportement identique à avant cette étape.
 */
export function useUserExercisePhotos() {
  return useQuery({
    queryKey: PHOTOS_KEY,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return new Map<string, string>();

      const { data, error } = await supabase
        .from("user_exercise_illustrations")
        .select("exercise_name, storage_path, exercise_reference_id");
      if (error) throw error;

      if (!data || data.length === 0) return new Map<string, string>();

      const paths = (
        data as Array<{
          storage_path: string;
          exercise_name: string;
          exercise_reference_id: string | null;
        }>
      ).map((r) => r.storage_path);
      const { data: signed, error: signErr } = await supabase.storage
        .from("exercise-images")
        .createSignedUrls(paths, 60 * 60);
      if (signErr) throw signErr;

      const map = new Map<string, string>();
      for (const row of data) {
        const entry = (signed ?? []).find((s) => s.path === row.storage_path);
        if (entry?.signedUrl) {
          map.set(
            identityKey({
              name: row.exercise_name,
              exercise_reference_id: row.exercise_reference_id,
            }),
            entry.signedUrl,
          );
        }
      }
      return map;
    },
  });
}

// ── Write ─────────────────────────────────────────────────────────────────────

/** Upload une photo et la lie à un exercice (persist inter-séances). */
export function useUpsertExercisePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      exerciseName,
      file,
      exerciseId,
    }: {
      exerciseName: string;
      file: File;
      exerciseId?: string;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const safeKey = normalize(exerciseName).replace(/\s+/g, "-").slice(0, 80);
      const path = `user-exercise/${user.id}/${safeKey}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("exercise-images")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      // Étape 4.5 — résolution non-bloquante de l'identité métier (table
      // exclusivement musculation) : un échec ne doit jamais empêcher la
      // persistance de la photo elle-même (voir services/exerciseResolution.ts).
      let exerciseReferenceId: string | null = null;
      try {
        exerciseReferenceId = await resolveExerciseId("muscu", exerciseName);
      } catch (e) {
        console.error(
          "[Phase3] resolveExerciseId(muscu) a échoué pour une photo d'exercice — écriture principale non bloquée",
          e,
        );
      }

      // Persiste le lien exercice → photo pour les futures séances
      const { error: upsErr } = await supabase.from("user_exercise_illustrations").upsert(
        {
          user_id: user.id,
          exercise_name: exerciseName,
          storage_path: path,
          exercise_reference_id: exerciseReferenceId,
        },
        { onConflict: "user_id,exercise_name" },
      );
      if (upsErr) throw upsErr;

      // Met aussi à jour image_path de l'instance en cours si fourni
      if (exerciseId) {
        await supabase
          .from("exercises")
          .update({ image_path: path })
          .eq("id", exerciseId)
          .eq("user_id", user.id);
      }

      return path;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PHOTOS_KEY });
      qc.invalidateQueries({ queryKey: ["exercise-image-urls"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["active_workout"] });
    },
    onError: (e: Error) => toast.error(`Erreur upload : ${e.message}`),
  });
}

// ── AI muscle resolution ──────────────────────────────────────────────────────

/** Pour les exercices personnalisés (regex retourne []), appelle l'IA et met à jour muscle_groups en BDD. */
export async function resolveCustomExerciseMuscles(
  exercises: Array<{ id: string; name: string; muscle_groups: string[] | null }>,
): Promise<void> {
  // Filtre : exercices sans mapping regex ET sans muscle_groups déjà enregistrés
  const toAnalyze = exercises.filter(
    (ex) =>
      exerciseToMuscles(ex.name).length === 0 &&
      (!ex.muscle_groups || ex.muscle_groups.length === 0),
  );

  if (toAnalyze.length === 0) return;

  try {
    const { data, error } = await supabase.functions.invoke("analyze-exercise-muscles", {
      body: { exercises: toAnalyze.map((e) => e.name) },
    });
    if (error) {
      console.warn("[resolveCustomExerciseMuscles] edge function error:", error);
      return;
    }

    const results =
      (data as { results: Array<{ name: string; muscles: string[] }> })?.results ?? [];

    for (const result of results) {
      const muscles = result.muscles.filter((m) => m !== "cardio_skip");
      if (muscles.length === 0) continue;

      const match = toAnalyze.find((ex) => ex.name.toLowerCase() === result.name.toLowerCase());
      if (!match) continue;

      await supabase.from("exercises").update({ muscle_groups: muscles }).eq("id", match.id);
    }
  } catch (err) {
    console.warn("[resolveCustomExerciseMuscles] failed silently:", err);
  }
}
