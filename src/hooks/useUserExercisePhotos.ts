import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { normalize } from "@/lib/fitness/exerciseCatalog";
import { exerciseToMuscles } from "@/lib/fitness/muscleMapping";

const PHOTOS_KEY = ["user-exercise-photos"] as const;

// ── Read ──────────────────────────────────────────────────────────────────────

/** Retourne un Map<exerciseName_normalisé, signedUrl> des photos personnalisées. */
export function useUserExercisePhotos() {
  return useQuery({
    queryKey: PHOTOS_KEY,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return new Map<string, string>();

      const { data, error } = await (supabase as any)
        .from("user_exercise_illustrations")
        .select("exercise_name, storage_path");
      if (error) throw error;

      if (!data || data.length === 0) return new Map<string, string>();

      const paths = data.map((r) => r.storage_path);
      const { data: signed, error: signErr } = await supabase.storage
        .from("exercise-images")
        .createSignedUrls(paths, 60 * 60);
      if (signErr) throw signErr;

      const map = new Map<string, string>();
      for (const row of data) {
        const entry = (signed ?? []).find((s) => s.path === row.storage_path);
        if (entry?.signedUrl) {
          map.set(normalize(row.exercise_name), entry.signedUrl);
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

      // Persiste le lien exercice → photo pour les futures séances
      const { error: upsErr } = await (supabase as any)
        .from("user_exercise_illustrations")
        .upsert(
          { user_id: user.id, exercise_name: exerciseName, storage_path: path },
          { onConflict: "user_id,exercise_name" },
        );
      if (upsErr) throw upsErr;

      // Met aussi à jour image_path de l'instance en cours si fourni
      if (exerciseId) {
        await (supabase as any)
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

    const results = (data as { results: Array<{ name: string; muscles: string[] }> })?.results ?? [];

    for (const result of results) {
      const muscles = result.muscles.filter((m) => m !== "cardio_skip");
      if (muscles.length === 0) continue;

      const match = toAnalyze.find(
        (ex) => ex.name.toLowerCase() === result.name.toLowerCase(),
      );
      if (!match) continue;

      await (supabase as any)
        .from("exercises")
        .update({ muscle_groups: muscles })
        .eq("id", match.id);
    }
  } catch (err) {
    console.warn("[resolveCustomExerciseMuscles] failed silently:", err);
  }
}
