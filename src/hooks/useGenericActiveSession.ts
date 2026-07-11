import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { localDateYMD } from "@/lib/dates";
import { logActivity } from "@/lib/activity";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import { isReadyEngine } from "@/lib/fitness/engines/types";
import type {
  DisciplineId,
  LiveSegmentSeed,
  WorkoutRecordDraft,
} from "@/lib/fitness/engines/types";
import type { Tables } from "@/integrations/supabase/types";
import { resolveExerciseId } from "@/services/exerciseResolution";

// Phase 3 (exercice-central) — Étape 2, double écriture : résout/crée
// exercise_id en plus du libellé existant sur workout_segments. Ne doit
// jamais bloquer l'écriture principale du segment (voir
// services/exerciseResolution.ts).
async function resolveSegmentExerciseId(
  discipline: DisciplineId,
  label: string,
): Promise<string | null> {
  try {
    return await resolveExerciseId(discipline, label);
  } catch (e) {
    console.error(
      `[Phase3] resolveExerciseId(${discipline}) a échoué — écriture principale non bloquée`,
      e,
    );
    return null;
  }
}

// ============================================================
// Séance active GÉNÉRIQUE — pendant de use-fitness.ts (useActiveWorkout /
// useStartWorkout / useAddExerciseSet / useUpdateExerciseSet /
// useDeleteExerciseSet / useFinishWorkout / useCancelWorkout) pour toute
// discipline Sensei avec `supportsLiveTracking=true` sur son moteur (voir
// src/lib/fitness/engines/types.ts). Phase pilote : Course à pied
// uniquement (2026-07-09) — CourseWorkoutEngine est le seul moteur qui
// déclare ce flag et implémente buildLiveSegments()/formatLiveSegment().
//
// Musculation N'EST PAS TOUCHÉE : use-fitness.ts, ActiveWorkoutView,
// ActiveExerciseCard restent strictement inchangés. `useActiveWorkout()`
// (musculation) est explicitement filtré sur discipline='muscu' (un seul
// changement d'une ligne dans use-fitness.ts, additif et sans risque
// puisque toute séance existante a déjà discipline='muscu' par défaut
// depuis la migration ..._workout_engine_foundation.sql) pour ne jamais
// confondre une séance active muscu et une séance active générique.
//
// Persistance : contrairement à musculation (exercises/exercise_sets),
// les segments vivent dans `workout_segments` (voir migration
// ..._generic_workout_segments.sql) — table générique, réutilisable par
// toute discipline future SANS nouvelle migration. Le résumé d'affichage
// (workouts.metadata.segments) est resynchronisé à la clôture de la
// séance via `engine.formatLiveSegment()` — même pattern que la synchro
// exercises.sets/reps/weight côté musculation (useFinishWorkout) — pour
// ne rien changer au kit UI générique existant (toSessionView,
// GenericHistoryCard, SessionSegmentList).
// ============================================================

export type ActiveGenericSegment = {
  id: string;
  label: string;
  metrics: Record<string, number | string>;
  metricKey: string | null;
  completed: boolean;
  position: number;
};

export type ActiveGenericWorkout = {
  id: string;
  name: string;
  discipline: DisciplineId;
  created_at: string;
  segments: ActiveGenericSegment[];
};

const GENERIC_ACTIVE_KEY = ["active_generic_workout"] as const;

type SegmentRowDb = Tables<"workout_segments">;

function toActiveSegment(row: SegmentRowDb): ActiveGenericSegment {
  return {
    id: row.id,
    label: row.label,
    metrics: (row.metrics ?? {}) as Record<string, number | string>,
    metricKey: row.metric_key,
    completed: row.completed,
    position: row.position,
  };
}

/** Retourne la séance active NON-musculation en cours (ou null). Une seule
 *  séance active tous types confondus est autorisée (voir garde dans
 *  useStartGenericActiveWorkout) — musculation et générique ne peuvent
 *  donc jamais être actives simultanément. */
export function useActiveGenericWorkout() {
  return useQuery({
    queryKey: GENERIC_ACTIVE_KEY,
    queryFn: async (): Promise<ActiveGenericWorkout | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: workout, error } = await supabase
        .from("workouts")
        .select("id, name, discipline, created_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .neq("discipline", "muscu")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!workout) return null;

      const { data: segments, error: segErr } = await supabase
        .from("workout_segments")
        .select("*")
        .eq("workout_id", workout.id)
        .order("position", { ascending: true });
      if (segErr) throw segErr;

      return {
        id: workout.id,
        name: workout.name,
        discipline: workout.discipline as DisciplineId,
        created_at: workout.created_at,
        segments: (segments ?? []).map(toActiveSegment),
      };
    },
  });
}

/** Démarre une séance active générique à partir d'un brouillon Sensei
 *  (draft + segments seedés par engine.buildLiveSegments()). Garde : une
 *  seule séance active à la fois, tous types confondus (muscu inclus) —
 *  cohérent avec l'intention produit (une séance en cours à l'écran). */
export function useStartGenericActiveWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      draft,
      seedSegments,
    }: {
      draft: WorkoutRecordDraft;
      seedSegments: LiveSegmentSeed[];
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const { data: existing, error: existingErr } = await supabase
        .from("workouts")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (existingErr) throw existingErr;
      if (existing) throw new Error("Une séance est déjà en cours.");

      const today = localDateYMD();
      // metadata sans `segments` : les segments live vivent dans
      // workout_segments pendant la séance, `metadata.segments` n'est
      // resynchronisé (résumé d'affichage) qu'à la clôture — voir
      // useFinishGenericActiveWorkout.
      const { segments: _ignored, ...metadataWithoutSegments } = (draft.metadata ?? {}) as Record<
        string,
        unknown
      >;

      const { data: workout, error } = await supabase
        .from("workouts")
        .insert({
          user_id: user.id,
          name: draft.name,
          date: today,
          duration_minutes: null,
          notes: draft.notes ?? null,
          // Même valeur par défaut que useAddWorkout (use-fitness.ts) pour
          // toute discipline qui ne pose pas de lieu (course, notamment —
          // voir commentaire d'en-tête de courseEngine.ts) : la colonne
          // `gym_location` est NOT NULL en base, comportement déjà existant
          // pour le parcours non-live (GenericSessionReviewSheet), pas une
          // régression introduite ici.
          gym_location: draft.gym_location ?? "Salle inconnue",
          discipline: draft.discipline,
          metadata: metadataWithoutSegments as never,
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw error;

      if (seedSegments.length > 0) {
        const seedExerciseIds = await Promise.all(
          seedSegments.map((seg) => resolveSegmentExerciseId(draft.discipline, seg.label)),
        );
        const { error: segErr } = await supabase.from("workout_segments").insert(
          seedSegments.map((seg, i) => ({
            workout_id: workout.id,
            user_id: user.id,
            position: i,
            label: seg.label,
            metric_key: seg.metricKey ?? null,
            metrics: seg.metrics as never,
            completed: false,
            discipline: draft.discipline,
            exercise_id: seedExerciseIds[i],
          })),
        );
        if (segErr) throw segErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GENERIC_ACTIVE_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Patch optimiste du cache de la séance active générique. */
function patchGenericActiveCache(
  qc: ReturnType<typeof useQueryClient>,
  updater: (w: ActiveGenericWorkout) => ActiveGenericWorkout,
) {
  const prev = qc.getQueryData<ActiveGenericWorkout | null>(GENERIC_ACTIVE_KEY);
  if (!prev) return prev;
  qc.setQueryData<ActiveGenericWorkout | null>(GENERIC_ACTIVE_KEY, updater(prev));
  return prev;
}

/** Ajoute un segment personnalisé à la séance active (bouton "+ Ajouter"). */
export function useAddGenericSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workoutId,
      label,
      metrics = {},
      metricKey,
      position,
      discipline,
    }: {
      workoutId: string;
      label: string;
      metrics?: Record<string, number | string>;
      metricKey?: string | null;
      position: number;
      discipline: DisciplineId;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const exerciseId = await resolveSegmentExerciseId(discipline, label);
      const { error } = await supabase.from("workout_segments").insert({
        workout_id: workoutId,
        user_id: user.id,
        position,
        label,
        metric_key: metricKey ?? null,
        metrics: metrics as never,
        completed: false,
        discipline,
        exercise_id: exerciseId,
      });
      if (error) throw error;
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: GENERIC_ACTIVE_KEY });
    },
  });
}

/** Modifie label / metrics / completed d'un segment (édition inline). */
export function useUpdateGenericSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...fields
    }: {
      id: string;
      label?: string;
      metrics?: Record<string, number | string>;
      completed?: boolean;
    }) => {
      if (Object.keys(fields).length === 0) return;
      const { error } = await supabase
        .from("workout_segments")
        .update({
          ...fields,
          metrics: fields.metrics as never,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...fields }) => {
      await qc.cancelQueries({ queryKey: GENERIC_ACTIVE_KEY });
      const prev = patchGenericActiveCache(qc, (w) => ({
        ...w,
        segments: w.segments.map((seg) =>
          seg.id === id
            ? { ...seg, ...fields, metrics: { ...seg.metrics, ...(fields.metrics ?? {}) } }
            : seg,
        ),
      }));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(GENERIC_ACTIVE_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: GENERIC_ACTIVE_KEY });
    },
  });
}

/** Supprime un segment de la séance active. */
export function useDeleteGenericSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workout_segments").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: GENERIC_ACTIVE_KEY });
      const prev = patchGenericActiveCache(qc, (w) => ({
        ...w,
        segments: w.segments.filter((seg) => seg.id !== id),
      }));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(GENERIC_ACTIVE_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: GENERIC_ACTIVE_KEY });
    },
  });
}

/** Réordonne un segment (flèche haut/bas — pas de dnd-kit, retiré du
 *  projet le 2026-07-05, voir MEMORY.md). Échange la position avec le
 *  voisin immédiat plutôt que de renuméroter toute la liste. */
export function useReorderGenericSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      segments,
      id,
      direction,
    }: {
      segments: ActiveGenericSegment[];
      id: string;
      direction: "up" | "down";
    }) => {
      const sorted = [...segments].sort((a, b) => a.position - b.position);
      const idx = sorted.findIndex((s) => s.id === id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
      const a = sorted[idx];
      const b = sorted[swapIdx];
      const { error: e1 } = await supabase
        .from("workout_segments")
        .update({ position: b.position })
        .eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("workout_segments")
        .update({ position: a.position })
        .eq("id", b.id);
      if (e2) throw e2;
    },
    onMutate: async ({ segments, id, direction }) => {
      await qc.cancelQueries({ queryKey: GENERIC_ACTIVE_KEY });
      const sorted = [...segments].sort((a, b) => a.position - b.position);
      const idx = sorted.findIndex((s) => s.id === id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      const prev = patchGenericActiveCache(qc, (w) => {
        if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return w;
        const a = sorted[idx];
        const b = sorted[swapIdx];
        return {
          ...w,
          segments: w.segments.map((seg) => {
            if (seg.id === a.id) return { ...seg, position: b.position };
            if (seg.id === b.id) return { ...seg, position: a.position };
            return seg;
          }),
        };
      });
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(GENERIC_ACTIVE_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: GENERIC_ACTIVE_KEY });
    },
  });
}

/** Termine la séance active générique : calcule la durée, resynchronise le
 *  résumé d'affichage (workouts.metadata.segments) via
 *  engine.formatLiveSegment(), même pattern que la synchro
 *  exercises.sets/reps/weight côté musculation (useFinishWorkout). */
export function useFinishGenericActiveWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (workout: ActiveGenericWorkout) => {
      const durationMs = Date.now() - new Date(workout.created_at).getTime();
      const durationMin = Math.min(600, Math.max(1, Math.round(durationMs / 60_000)));

      const entry = ENGINE_REGISTRY[workout.discipline];
      const engine = entry && isReadyEngine(entry) ? entry : null;

      const { data: current, error: readErr } = await supabase
        .from("workouts")
        .select("metadata")
        .eq("id", workout.id)
        .single();
      if (readErr) throw readErr;
      const existingMetadata = (current?.metadata ?? {}) as Record<string, unknown>;

      const formattedSegments =
        engine?.formatLiveSegment != null
          ? workout.segments
              .sort((a, b) => a.position - b.position)
              .map((seg) =>
                engine.formatLiveSegment!({
                  id: seg.id,
                  label: seg.label,
                  metrics: seg.metrics,
                  metricKey: seg.metricKey,
                  completed: seg.completed,
                  position: seg.position,
                }),
              )
          : [];

      const { error } = await supabase
        .from("workouts")
        .update({
          duration_minutes: durationMin,
          status: "completed",
          metadata: { ...existingMetadata, segments: formattedSegments } as never,
        })
        .eq("id", workout.id);
      if (error) throw error;
    },
    onSuccess: (_d, workout) => {
      toast.success("Séance terminée 💪");
      logActivity("workout", `Séance terminée : ${workout.name}`, { workout_id: workout.id });
      qc.invalidateQueries({ queryKey: GENERIC_ACTIVE_KEY });
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["user_activity"] });
      qc.invalidateQueries({ queryKey: ["activity_streak"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Annule (supprime) la séance active générique et ses segments (cascade). */
export function useCancelGenericActiveWorkout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (workoutId: string) => {
      const { error } = await supabase.from("workouts").delete().eq("id", workoutId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Séance annulée");
      qc.invalidateQueries({ queryKey: GENERIC_ACTIVE_KEY });
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
