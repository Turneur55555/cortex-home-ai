import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getIsOnline } from "@/lib/offline/networkStatus";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";
import { logActivity } from "@/lib/activity";
import { localDateYMD } from "@/lib/dates";
import type { DisciplineId, SessionSegment } from "@/lib/fitness/engines/types";
import { isReadyEngine } from "@/lib/fitness/engines/types";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import { resolveExerciseId, resolveExerciseIdsByLabel } from "@/services/exerciseResolution";
import { identityKey } from "@/lib/fitness/recentExercises";
import { verifyExerciseRanksForSession } from "@/hooks/useVerifyExerciseRanksForSession";
import type { ActiveGenericSegment } from "@/hooks/useGenericActiveSession";
import { HYBRID_BLOCKS_KEY } from "@/hooks/useGenericActiveSession";
import { ACTIVE_WORKOUT_CONFLICT_MESSAGE } from "@/lib/fitness/activeWorkoutGuard";

/**
 * Offline-first (cf. src/lib/offline/, CLAUDE.md) — Cœur Fitness (vague
 * finale). Tables `workouts` / `exercises` / `exercise_sets` migrées vers
 * `createOfflineRepository`, même pattern que `useRecipes.ts`/
 * `usePhysicalGoal.ts` : toute écriture est TOUJOURS locale d'abord
 * (IndexedDB, reflétée instantanément), mise en queue de sync, lecture avec
 * hydratation en ligne + fallback local hors connexion.
 *
 * RPG (piliers permanents, CLAUDE.md) — l'attribution d'XP à la clôture
 * d'une séance (`useFinishWorkout`) est un TRIGGER SQL SERVEUR
 * (`award_xp_on_workout_complete`) déclenché quand `workouts.status` passe
 * à `'completed'` EN BASE : cette mutation reste une écriture de donnée pure
 * (désormais offline-first via `workoutsRepo.update`), la séance peut donc
 * être terminée hors connexion, et l'XP est versée naturellement dès que la
 * sync queue pousse cette mise à jour au retour du réseau — aucune logique
 * de récompense dupliquée côté client. `verifyExerciseRanksForSession`
 * (montée de Rang par exercice) reste explicitement HORS PÉRIMÈTRE offline
 * (lecture/RPC arbitrée serveur, cf. brief) : appelée en best-effort
 * (fire-and-forget, déjà tolérante à l'échec réseau) à la clôture, sans
 * retry côté client si hors connexion — comportement assumé, documenté ici.
 */

// Phase 3 (exercice-central) — Étape 2, double écriture : résout/crée
// exercise_reference_id en plus du libellé existant. Ne doit jamais
// bloquer l'écriture principale de l'exercice (voir
// services/exerciseResolution.ts). Best-effort, sûr hors connexion (la
// fonction attrape déjà toute erreur réseau et retombe sur `null`).
async function resolveMuscuExerciseReferenceId(name: string): Promise<string | null> {
  try {
    return await resolveExerciseId("muscu", name);
  } catch (e) {
    console.error(
      "[Phase3] resolveExerciseId(muscu) a échoué — écriture principale non bloquée",
      e,
    );
    return null;
  }
}

// ---------- Domaines extraits (re-exports pour rétro-compat) ----------
export type { NutritionGoals } from "./useNutritionGoals";
export { useNutritionGoals, useUpsertNutritionGoals } from "./useNutritionGoals";
export {
  useBodyMeasurements,
  useAddBodyMeasurement,
  useDeleteBodyMeasurement,
  useUpdateBodyMeasurement,
} from "./useBodyTracking";

// ---------- Offline repositories (workouts / exercises / exercise_sets) ----------

export interface WorkoutRow {
  id: string;
  user_id: string;
  name: string;
  date: string;
  gym_location: string;
  status: string;
  discipline: string;
  duration_minutes: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  level_before: number | null;
  level_after: number | null;
  xp_before: number | null;
  xp_after: number | null;
  created_at: string;
  updated_at: string;
}

export interface ExerciseRow {
  id: string;
  user_id: string;
  workout_id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  image_path: string | null;
  exercise_reference_id: string | null;
  position: number;
  notes: string | null;
  superset_group: number | null;
  muscle_groups: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface ExerciseSetRow {
  id: string;
  user_id: string;
  exercise_id: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  completed: boolean;
  rest_seconds: number | null;
  notes: string | null;
  tempo: string | null;
  created_at: string;
  updated_at: string;
}

export const workoutsRepo = createOfflineRepository<WorkoutRow>("workouts");
export const exercisesRepo = createOfflineRepository<ExerciseRow>("exercises");
export const exerciseSetsRepo = createOfflineRepository<ExerciseSetRow>("exercise_sets");

/** Hydrate le store local depuis le serveur (workouts + exercises +
 *  exercise_sets de l'utilisateur) — no-op silencieux hors connexion. Les
 *  200 séances les plus récentes suffisent très largement à couvrir toute
 *  séance active + l'historique affiché (useWorkouts en garde 60). */
async function refreshWorkoutsFromServer(userId: string): Promise<void> {
  if (!getIsOnline()) return;
  try {
    const { data: workouts, error } = await supabase
      .from("workouts")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(200);
    if (!error && workouts) {
      await hydrateEntitiesFromServer("workouts", userId, workouts as unknown as WorkoutRow[]);
    }
    const { data: exercises, error: exErr } = await supabase
      .from("exercises")
      .select("*")
      .eq("user_id", userId);
    if (!exErr && exercises) {
      await hydrateEntitiesFromServer("exercises", userId, exercises as unknown as ExerciseRow[]);
    }
    const { data: sets, error: setErr } = await supabase
      .from("exercise_sets")
      .select("*")
      .eq("user_id", userId);
    if (!setErr && sets) {
      await hydrateEntitiesFromServer("exercise_sets", userId, sets as unknown as ExerciseSetRow[]);
    }
  } catch {
    // Hors ligne ou erreur réseau : on continue avec le store local.
  }
}

/** Regroupe une liste de lignes par une clé de champ — utilitaire local aux
 *  jointures client (exercises par workout_id, sets par exercise_id). */
function groupByField<T, K extends keyof T>(rows: T[], key: K): Map<T[K], T[]> {
  const map = new Map<T[K], T[]>();
  for (const row of rows) {
    const list = map.get(row[key]) ?? [];
    list.push(row);
    map.set(row[key], list);
  }
  return map;
}

/** Contrainte "une seule séance active" (migration
 *  20260714150000_workouts_one_active_per_user.sql) respectée EN LOCAL
 *  avant toute création — même stratégie que `usePhysicalGoal.ts` pour "au
 *  plus un objectif actif" : vérification locale, sans appel réseau.
 *  L'index unique reste le garde-fou final côté serveur pour une éventuelle
 *  course entre deux appareils qui créeraient chacun une séance active hors
 *  connexion (edge case rare, assumé — cf. limite déjà documentée pour
 *  physical_goals). */
async function assertNoActiveWorkout(userId: string): Promise<void> {
  const local = await workoutsRepo.list(userId);
  if (local.some((w) => w.status === "active")) {
    throw new Error(ACTIVE_WORKOUT_CONFLICT_MESSAGE);
  }
}

/** Cascade locale des enfants d'une séance (exercises + exercise_sets) —
 *  le serveur le fait déjà via ON DELETE CASCADE, ici on nettoie juste le
 *  store local (même pattern que `useRecipes.useDeleteRecipe` pour les
 *  ingrédients) pour ne pas laisser d'entités orphelines. `repo.remove`
 *  annule proprement toute création encore en attente (jamais de sync
 *  orpheline) et enfile un `delete` idempotent sinon. */
async function cascadeDeleteWorkoutChildren(userId: string, workoutId: string): Promise<void> {
  const localExercises = (await exercisesRepo.list(userId)).filter(
    (e) => e.workout_id === workoutId,
  );
  const localSets = await exerciseSetsRepo.list(userId);
  for (const ex of localExercises) {
    for (const s of localSets.filter((st) => st.exercise_id === ex.id)) {
      await exerciseSetsRepo.remove(s.id, userId);
    }
    await exercisesRepo.remove(ex.id, userId);
  }
}

// ---------- Workouts ----------
const WORKOUTS_KEY = ["fitness", "workouts"] as const;
const ACTIVE_KEY = ["fitness", "active_workout"] as const;

export function useWorkouts() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: WORKOUTS_KEY,
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [];
      await refreshWorkoutsFromServer(userId);
      const [workouts, exercises, sets] = await Promise.all([
        workoutsRepo.list(userId),
        exercisesRepo.list(userId),
        exerciseSetsRepo.list(userId),
      ]);
      const setsByExercise = groupByField(sets, "exercise_id");
      const exercisesByWorkout = groupByField(exercises, "workout_id");
      return [...workouts]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 60)
        .map((w) => ({
          ...w,
          exercises: (exercisesByWorkout.get(w.id) ?? []).map((ex) => ({
            ...ex,
            exercise_sets: (setsByExercise.get(ex.id) ?? []).map((s) => ({
              id: s.id,
              set_number: s.set_number,
              reps: s.reps,
              weight: s.weight,
              completed: s.completed,
              rest_seconds: s.rest_seconds,
            })),
          })),
        }));
    },
  });
}

export function useAddWorkout() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      date: string;
      duration_minutes?: number | null;
      notes?: string | null;
      gym_location?: string;
      // Fondation moteurs (phase 1) : discipline + metadata sont additifs,
      // par défaut 'muscu'/{} pour tout appelant existant. Réservé aux
      // futurs moteurs (HYROX, Course, Cardio...) qui n'écrivent jamais
      // dans exercises/exercise_sets — voir src/lib/fitness/engines/types.ts.
      discipline?: DisciplineId;
      metadata?: Record<string, unknown>;
      exercises: Array<{
        name: string;
        sets?: number | null;
        reps?: number | null;
        weight?: number | null;
        image_path?: string | null;
        // Séries détaillées optionnelles (set-by-set).
        setDetails?: Array<{
          reps: number | null;
          weight: number | null;
        }> | null;
      }>;
    }) => {
      if (!user) throw new Error("Non authentifié");
      const discipline = input.discipline ?? "muscu";

      // Phase 3, Étape 4 (centralisation, 2026-07-12) — résolution
      // exercise_id pour les segments génériques, AVANT l'insertion.
      // Best-effort (jamais bloquant, y compris hors connexion — voir
      // resolveExerciseIdsByLabel).
      const rawSegments = Array.isArray(
        (input.metadata as { segments?: unknown } | undefined)?.segments,
      )
        ? (input.metadata as { segments: SessionSegment[] }).segments
        : null;
      let enrichedSegments: SessionSegment[] | null = null;
      if (rawSegments && rawSegments.length > 0) {
        const idsByLabel = await resolveExerciseIdsByLabel(
          discipline,
          rawSegments.map((s) => s.label),
        );
        enrichedSegments = rawSegments.map((s) => ({
          ...s,
          exerciseId: idsByLabel.get(s.label) ?? null,
        }));
      }

      // `status` n'est jamais passé explicitement ici — colonne DB par
      // défaut 'completed' (une séance enregistrée directement, pas une
      // séance active). Offline-first : on doit le fixer nous-mêmes pour
      // que le store local soit immédiatement cohérent, le repository
      // n'ayant aucune connaissance des défauts de colonne serveur.
      const workout = await workoutsRepo.create(user.id, {
        name: input.name,
        date: input.date,
        duration_minutes: input.duration_minutes ?? null,
        notes: input.notes ?? null,
        gym_location: input.gym_location ?? "Salle inconnue",
        status: "completed",
        discipline,
        metadata: {
          ...(input.metadata ?? {}),
          ...(enrichedSegments ? { segments: enrichedSegments } : {}),
        },
        level_before: null,
        level_after: null,
        xp_before: null,
        xp_after: null,
      });

      if (input.exercises.length > 0) {
        const exerciseIdsByName = await resolveExerciseIdsByLabel(
          "muscu",
          input.exercises.map((e) => e.name),
        );
        let position = 0;
        for (const e of input.exercises) {
          const valid = (e.setDetails ?? []).filter(
            (d) => d.reps != null && d.weight != null && d.reps > 0 && d.weight > 0,
          );
          const top = valid.reduce<{ reps: number; weight: number } | null>(
            (best, d) =>
              best == null ||
              (d.weight as number) > best.weight ||
              ((d.weight as number) === best.weight && (d.reps as number) > best.reps)
                ? { reps: d.reps as number, weight: d.weight as number }
                : best,
            null,
          );
          const createdEx = await exercisesRepo.create(user.id, {
            workout_id: workout.id,
            name: e.name,
            sets: valid.length > 0 ? valid.length : (e.sets ?? null),
            reps: top ? top.reps : (e.reps ?? null),
            weight: top ? top.weight : (e.weight ?? null),
            image_path: e.image_path ?? null,
            exercise_reference_id: exerciseIdsByName.get(e.name) ?? null,
            position: position++,
            notes: null,
            superset_group: null,
            muscle_groups: null,
          });
          for (let j = 0; j < valid.length; j++) {
            const d = valid[j];
            await exerciseSetsRepo.create(user.id, {
              exercise_id: createdEx.id,
              set_number: j + 1,
              reps: d.reps,
              weight: d.weight,
              completed: true,
              rest_seconds: null,
              notes: null,
              tempo: null,
            });
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("Séance enregistrée");
      qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteWorkout() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Non authentifié");
      // L'XP éventuellement versée est retirée côté serveur avant la
      // suppression (trigger `trg_reverse_xp_before_workout_delete`) une
      // fois la suppression synchronisée — inchangé, arbitré serveur.
      await cascadeDeleteWorkoutChildren(user.id, id);
      await workoutsRepo.remove(id, user.id);
    },
    onSuccess: () => {
      toast.success("Séance supprimée");
      qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
      qc.invalidateQueries({ queryKey: ["user_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------- Nutrition journalière (re-export) ----------
export {
  useNutrition,
  useAddNutrition,
  useAddNutritionBatch,
  useDeleteNutrition,
  useDeleteNutritionMeal,
  useUpdateNutrition,
  useCopyNutritionDay,
  useCopyNutritionMeal,
} from "./useNutritionData";

// ---------- Workout / exercise mutations ----------
export function useUpdateWorkoutName() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!user) throw new Error("Non authentifié");
      await workoutsRepo.update(id, user.id, { name });
    },
    onSuccess: () => {
      toast.success("Nom modifié");
      qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Validation partagée hook/UI : durée entière strictement positive (minutes). */
export function isValidWorkoutDurationMinutes(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Corrige la date et/ou la durée d'une séance déjà terminée — cas d'usage :
 * séance validée en oubliant de la clôturer, `duration_minutes` alors
 * incohérent (ex. 187 min au lieu de 62). Met à jour la ligne EN PLACE
 * (même id, mêmes exercices/séries/performances) — ne duplique jamais.
 *
 * IMPORTANT (musculation) : changer `duration_minutes` ne modifie JAMAIS les
 * calories affichées — le moteur calorique musculation (voir
 * src/lib/fitness/eat.ts → estimateSessionCalories) ne dépend que des séries
 * validées, jamais de la durée. La durée reste ici une information purement
 * descriptive/statistique.
 */
export function useUpdateWorkoutSchedule() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      date,
      durationMinutes,
    }: {
      id: string;
      date: string;
      durationMinutes: number;
    }) => {
      if (!isValidWorkoutDurationMinutes(durationMinutes)) {
        throw new Error("La durée doit être un nombre entier de minutes strictement positif.");
      }
      if (!user) throw new Error("Non authentifié");
      await workoutsRepo.update(id, user.id, { date, duration_minutes: durationMinutes });
    },
    onSuccess: () => {
      toast.success("Séance mise à jour");
      // Une correction de date/durée impacte l'historique, le calendrier,
      // l'activité du jour/de la semaine, l'EAT et la Santé nutritionnelle —
      // même périmètre d'invalidation que la clôture d'une séance
      // (useFinishWorkout) : tout le domaine fitness + activité/streaks.
      qc.invalidateQueries({ queryKey: ["fitness"] });
      qc.invalidateQueries({ queryKey: ["user_activity"] });
      qc.invalidateQueries({ queryKey: ["activity_streak"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Type alias pour le cache `workouts` (incluant les exercices imbriqués).
type WorkoutsCache = Array<{
  id: string;
  exercises?: Array<{
    id: string;
    workout_id: string;
    user_id: string;
    name: string;
    sets: number | null;
    reps: number | null;
    weight: number | null;
    image_path: string | null;
    muscle_groups: string[] | null;
  }> | null;
  [k: string]: unknown;
}>;

function patchWorkoutsCache(
  qc: ReturnType<typeof useQueryClient>,
  updater: (rows: WorkoutsCache) => WorkoutsCache,
) {
  const prev = qc.getQueryData<WorkoutsCache>(WORKOUTS_KEY);
  if (!prev) return prev;
  qc.setQueryData<WorkoutsCache>(WORKOUTS_KEY, updater(prev));
  return prev;
}

export function useUpdateExercise() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      ...fields
    }: {
      id: string;
      name?: string;
      image_path?: string | null;
      sets?: number | null;
      reps?: number | null;
      weight?: number | null;
    }) => {
      if (!user) throw new Error("Non authentifié");
      await exercisesRepo.update(id, user.id, fields);
    },
    onMutate: async ({ id, ...fields }) => {
      await qc.cancelQueries({ queryKey: WORKOUTS_KEY });
      const prev = patchWorkoutsCache(qc, (rows) =>
        rows.map((w) => ({
          ...w,
          exercises: (w.exercises ?? []).map((ex) => (ex.id === id ? { ...ex, ...fields } : ex)),
        })),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(WORKOUTS_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
    },
  });
}

// Suppression batchée : cascade locale des séries + suppressions offline-first.
export function useDeleteExercises() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      if (!user) throw new Error("Non authentifié");
      const localSets = await exerciseSetsRepo.list(user.id);
      for (const id of ids) {
        for (const s of localSets.filter((st) => st.exercise_id === id)) {
          await exerciseSetsRepo.remove(s.id, user.id);
        }
        await exercisesRepo.remove(id, user.id);
      }
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: WORKOUTS_KEY });
      const set = new Set(ids);
      const prev = patchWorkoutsCache(qc, (rows) =>
        rows.map((w) => ({
          ...w,
          exercises: (w.exercises ?? []).filter((ex) => !set.has(ex.id)),
        })),
      );
      return { prev };
    },
    onSuccess: () => toast.success("Exercice supprimé"),
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(WORKOUTS_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
  });
}

export function useAddExerciseToWorkout() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      workoutId,
      exercise,
    }: {
      workoutId: string;
      exercise: {
        name: string;
        sets?: number | null;
        reps?: number | null;
        weight?: number | null;
      };
    }) => {
      if (!user) throw new Error("Non authentifié");
      const exerciseReferenceId = await resolveMuscuExerciseReferenceId(exercise.name);
      const localExercises = (await exercisesRepo.list(user.id)).filter(
        (e) => e.workout_id === workoutId,
      );
      const nextPosition =
        localExercises.length > 0 ? Math.max(...localExercises.map((e) => e.position)) + 1 : 0;
      await exercisesRepo.create(user.id, {
        workout_id: workoutId,
        name: exercise.name,
        sets: exercise.sets ?? null,
        reps: exercise.reps ?? null,
        weight: exercise.weight ?? null,
        image_path: null,
        exercise_reference_id: exerciseReferenceId,
        position: nextPosition,
        notes: null,
        superset_group: null,
        muscle_groups: null,
      });
    },
    onMutate: async ({ workoutId, exercise }) => {
      await qc.cancelQueries({ queryKey: WORKOUTS_KEY });
      const tempId = `optimistic-${crypto.randomUUID()}`;
      const prev = patchWorkoutsCache(qc, (rows) =>
        rows.map((w) =>
          w.id === workoutId
            ? {
                ...w,
                exercises: [
                  ...(w.exercises ?? []),
                  {
                    id: tempId,
                    workout_id: workoutId,
                    user_id: "optimistic",
                    name: exercise.name,
                    sets: exercise.sets ?? null,
                    reps: exercise.reps ?? null,
                    weight: exercise.weight ?? null,
                    image_path: null,
                    muscle_groups: null,
                  },
                ],
              }
            : w,
        ),
      );
      return { prev };
    },
    onSuccess: () => toast.success("Exercice ajouté"),
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(WORKOUTS_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: WORKOUTS_KEY });
    },
  });
}

// ---------- Active Workout types ----------
export type ActiveSet = {
  id: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  completed: boolean;
};

export type ActiveExercise = {
  id: string;
  name: string;
  image_path: string | null;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  /** Étape 4.5 — identité métier résolue (voir ExerciseResolutionService).
   *  Additif : peut être `null` pour un exercice créé avant le câblage de
   *  la résolution, ou si la résolution a échoué sans bloquer l'écriture. */
  exercise_reference_id: string | null;
  /** Réordonnancement manuel (drag-and-drop) — voir useReorderActiveExercises.
   *  Migration `20260819090000_exercises_manual_reorder_position.sql`. */
  position: number;
  exercise_sets: ActiveSet[];
};

export type ActiveWorkout = {
  id: string;
  name: string;
  gym_location: string;
  created_at: string;
  exercises: ActiveExercise[];
};

function toActiveExercise(ex: ExerciseRow, sets: ExerciseSetRow[]): ActiveExercise {
  return {
    id: ex.id,
    name: ex.name,
    image_path: ex.image_path ?? null,
    sets: ex.sets ?? null,
    reps: ex.reps ?? null,
    weight: ex.weight ?? null,
    exercise_reference_id: ex.exercise_reference_id ?? null,
    position: ex.position ?? 0,
    exercise_sets: [...sets]
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => ({
        id: s.id,
        set_number: s.set_number,
        reps: s.reps ?? null,
        weight: s.weight ?? null,
        completed: s.completed ?? false,
      })),
  };
}

// ---------- Active Workout hooks ----------

/** Retourne la séance commencée aujourd'hui non encore terminée, ou null.
 *  C3 : la séance active est identifiée par status='active' (colonne
 *  dédiée). Phase pilote Course (2026-07-09) : filtre explicite sur
 *  discipline 'muscu' — sans ça, une séance active générique (course,
 *  HYROX... voir useGenericActiveSession.ts) serait AUSSI remontée ici et
 *  rendue par erreur avec des exercises vides. */
export function useActiveWorkout() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: ACTIVE_KEY,
    enabled: !!userId,
    queryFn: async (): Promise<ActiveWorkout | null> => {
      if (!userId) return null;
      await refreshWorkoutsFromServer(userId);
      const workouts = await workoutsRepo.list(userId);
      const candidates = workouts.filter((w) => w.status === "active" && w.discipline === "muscu");
      const active = [...candidates].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!active) return null;

      const exercises = (await exercisesRepo.list(userId)).filter(
        (e) => e.workout_id === active.id,
      );
      const allSets = await exerciseSetsRepo.list(userId);
      const setsByExercise = groupByField(allSets, "exercise_id");

      return {
        id: active.id,
        name: active.name,
        gym_location: active.gym_location,
        created_at: active.created_at,
        // Tri explicite par `position` — départage stable par id pour les
        // rares lignes à position égale.
        exercises: exercises
          .map((ex) => toActiveExercise(ex, setsByExercise.get(ex.id) ?? []))
          .sort((a, b) =>
            a.position !== b.position ? a.position - b.position : a.id.localeCompare(b.id),
          ),
      };
    },
  });
}

/** Crée une nouvelle séance active (sans duration_minutes = non terminée). */
export function useStartWorkout() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ name, gym_location }: { name: string; gym_location: string }) => {
      if (!user) throw new Error("Non authentifié");
      // Étape 0.1 : garde — même convention que les autres points de
      // démarrage. L'index unique `workouts_one_active_per_user` reste le
      // garde-fou final côté serveur (edge case course multi-appareils hors
      // connexion, assumé — voir assertNoActiveWorkout).
      await assertNoActiveWorkout(user.id);

      const today = localDateYMD();
      await workoutsRepo.create(user.id, {
        name,
        date: today,
        gym_location,
        status: "active",
        discipline: "muscu",
        metadata: {},
        duration_minutes: null,
        notes: null,
        level_before: null,
        level_after: null,
        xp_before: null,
        xp_after: null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Musculation hybride générée par le Sensei (2026-08-05) — démarre une
 *  séance active "muscu" directement seedée avec force ET blocs métriques.
 *  Partie force (exercises/exercise_sets) offline-first via les repos —
 *  partie blocs (workout_segments) reste ONLINE-ONLY pour cette vague, au
 *  même titre que useGenericActiveSession.ts (déféré, voir doc en tête de
 *  useGenericActiveSession.ts) : non bloquante pour la partie musculation
 *  (try/catch dédié), seulement best-effort si le réseau est disponible. */
export function useStartHybridStrengthWorkout() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      name,
      gym_location,
      exercises,
      segments,
      blockDiscipline,
    }: {
      name: string;
      gym_location?: string;
      exercises: Array<{ name: string; sets: string; reps: string; weight: string }>;
      segments: SessionSegment[];
      blockDiscipline: DisciplineId;
    }) => {
      if (!user) throw new Error("Non authentifié");
      await assertNoActiveWorkout(user.id);

      const today = localDateYMD();
      const workout = await workoutsRepo.create(user.id, {
        name,
        date: today,
        gym_location: gym_location ?? "Salle inconnue",
        discipline: "muscu",
        status: "active",
        metadata: {},
        duration_minutes: null,
        notes: null,
        level_before: null,
        level_after: null,
        xp_before: null,
        xp_after: null,
      });

      // Exercices de force — mêmes colonnes/résolution que useAddWorkout,
      // séries détaillées expansées depuis sets×{reps,weight}, non validées
      // par défaut.
      const validExercises = exercises.filter((e) => e.name.trim());
      if (validExercises.length > 0) {
        const exerciseIdsByName = await resolveExerciseIdsByLabel(
          "muscu",
          validExercises.map((e) => e.name),
        );
        let position = 0;
        for (const e of validExercises) {
          const createdEx = await exercisesRepo.create(user.id, {
            workout_id: workout.id,
            name: e.name,
            sets: e.sets ? Number(e.sets) : null,
            reps: e.reps ? Number(e.reps) : null,
            weight: e.weight ? Number(e.weight) : null,
            image_path: null,
            exercise_reference_id: exerciseIdsByName.get(e.name) ?? null,
            position: position++,
            notes: null,
            superset_group: null,
            muscle_groups: null,
          });
          const n = e.sets ? Math.max(1, Math.round(Number(e.sets))) : 0;
          for (let j = 0; j < n; j++) {
            await exerciseSetsRepo.create(user.id, {
              exercise_id: createdEx.id,
              set_number: j + 1,
              reps: e.reps ? Number(e.reps) : null,
              weight: e.weight ? Number(e.weight) : null,
              completed: false,
              rest_seconds: null,
              notes: null,
              tempo: null,
            });
          }
        }
      }

      // Blocs métriques — workout_segments, en ligne uniquement pour cette
      // vague (voir doc en tête de fonction) : jamais bloquant pour le
      // reste de la séance.
      if (segments.length > 0) {
        try {
          const idsByLabel = await resolveExerciseIdsByLabel(
            blockDiscipline,
            segments.map((s) => s.label),
          );
          const { error: segErr } = await supabase.from("workout_segments").insert(
            segments.map((s, i) => ({
              workout_id: workout.id,
              user_id: user.id,
              position: i,
              label: s.label,
              metric_key: null,
              metrics: (s.metrics ?? {}) as never,
              completed: false,
              discipline: blockDiscipline,
              exercise_id: idsByLabel.get(s.label) ?? null,
            })),
          );
          if (segErr) throw segErr;
        } catch (e) {
          console.error(
            "[useStartHybridStrengthWorkout] blocs métriques non enregistrés (workout_segments nécessite une connexion — hors périmètre offline de cette vague, voir useGenericActiveSession.ts)",
            e,
          );
        }
      }

      return workout.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
      qc.invalidateQueries({ queryKey: HYBRID_BLOCKS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Termine la séance active : calcule la durée et la sauvegarde — écriture
 *  de donnée pure, offline-first (voir doc en tête de fichier pour le
 *  trigger XP serveur). */
export function useFinishWorkout() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (workout: ActiveWorkout & { segments?: ActiveGenericSegment[] }) => {
      if (!user) throw new Error("Non authentifié");
      const durationMs = Date.now() - new Date(workout.created_at).getTime();
      const durationMin = Math.min(600, Math.max(1, Math.round(durationMs / 60_000)));

      const segments = workout.segments ?? [];
      let metadataUpdate: Record<string, unknown> | undefined;
      if (segments.length > 0) {
        // Lecture de metadata existante — locale (offline-first) : le store
        // local est déjà à jour, pas besoin d'aller en ligne.
        const localWorkout = await workoutsRepo.get(workout.id);
        const existingMetadata = (localWorkout?.metadata ?? {}) as Record<string, unknown>;

        const formattedSegments = [...segments]
          .sort((a, b) => a.position - b.position)
          .map((seg) => {
            const disciplineId = seg.discipline ?? "autre";
            const entry = ENGINE_REGISTRY[disciplineId];
            const engine = entry && isReadyEngine(entry) ? entry : null;
            const formatted = engine?.formatLiveSegment
              ? engine.formatLiveSegment({
                  id: seg.id,
                  label: seg.label,
                  metrics: seg.metrics,
                  metricKey: seg.metricKey,
                  completed: seg.completed,
                  position: seg.position,
                })
              : { label: seg.label, stats: [], metrics: seg.metrics };
            return { ...formatted, exerciseId: seg.exerciseId };
          });

        metadataUpdate = {
          ...existingMetadata,
          segments: formattedSegments,
          sessionType: "hybrid",
        };
      }

      await workoutsRepo.update(workout.id, user.id, {
        duration_minutes: durationMin,
        status: "completed",
        ...(metadataUpdate ? { metadata: metadataUpdate } : {}),
      });

      // H2 : synchronise les colonnes résumé `exercises.sets/reps/weight`
      // depuis les séries réelles — offline-first au même titre que tout
      // le reste (exercisesRepo.update écrit local + enfile la sync, aucune
      // dépendance réseau nécessaire ici).
      for (const ex of workout.exercises ?? []) {
        const filled = (ex.exercise_sets ?? []).filter(
          (st) => st.reps != null && st.weight != null && st.reps > 0 && st.weight > 0,
        );
        const done = filled.filter((st) => st.completed);
        const source = done.length > 0 ? done : filled;
        if (source.length === 0) continue;
        const top = source.reduce((best, st) =>
          (st.weight as number) > (best.weight as number) ||
          ((st.weight as number) === (best.weight as number) &&
            (st.reps as number) > (best.reps as number))
            ? st
            : best,
        );
        try {
          await exercisesRepo.update(ex.id, user.id, {
            sets: source.length,
            reps: top.reps,
            weight: top.weight,
          });
        } catch (e) {
          console.error("[finishWorkout] sync résumé échoué", ex.name, e);
        }
      }
    },
    onSuccess: (_d, workout) => {
      // Pas de toast ici : l'écran de récompense (SessionRewardScreen)
      // s'affiche systématiquement à la clôture et suffit à informer
      // l'utilisateur — un toast en plus serait redondant.
      logActivity("workout", `Séance terminée : ${workout.name}`, { workout_id: workout.id });
      // Étape 0.2 (INV-4 fraîcheur) : invalidation par préfixe — couvre
      // tout le domaine fitness (historiques, catalogue, photos...).
      qc.invalidateQueries({ queryKey: ["fitness"] });
      qc.invalidateQueries({ queryKey: ["user_activity"] });
      qc.invalidateQueries({ queryKey: ["activity_streak"] });
      // RPG : la clôture verse de l'XP côté serveur (trigger
      // `award_xp_on_workout_complete`, déclenché dès que la sync queue
      // pousse cette mise à jour) — invalider le cache Niveau/Rang pour ne
      // jamais afficher un XP/niveau périmé.
      qc.invalidateQueries({ queryKey: ["user_stats"] });
      // RPG : montée de Rang par exercice — hors périmètre offline (lecture
      // arbitrée serveur, cf. doc en tête de fichier), fire-and-forget déjà
      // tolérant à l'échec réseau.
      verifyExerciseRanksForSession(workout.exercises);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Annule (supprime) la séance active et tout son contenu. */
export function useCancelWorkout() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (workoutId: string) => {
      if (!user) throw new Error("Non authentifié");
      // L'XP éventuellement versée est retirée côté serveur avant la
      // suppression (trigger `trg_reverse_xp_before_workout_delete`).
      await cascadeDeleteWorkoutChildren(user.id, workoutId);
      await workoutsRepo.remove(workoutId, user.id);
    },
    onSuccess: () => {
      toast.success("Séance annulée");
      qc.invalidateQueries({ queryKey: ["fitness"] });
      qc.invalidateQueries({ queryKey: ["user_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Source pour « Refaire en live » : une séance passée avec ses exercices/séries. */
export type RepeatSourceWorkout = {
  name: string | null;
  gym_location?: string | null;
  exercises?: Array<{
    name: string;
    image_path?: string | null;
    sets?: number | null;
    reps?: number | null;
    weight?: number | null;
    /** Etape 4.6c (2026-07-13) : deja porte par les lignes source
     *  (`useWorkouts()` selectionne `exercises(*)`) - additif, permet au
     *  regroupement ci-dessous de fusionner par identite reelle plutot
     *  que par nom quand elle est disponible. */
    exercise_reference_id?: string | null;
    exercise_sets?: Array<{
      set_number: number | null;
      reps: number | null;
      weight: number | null;
    }> | null;
  }> | null;
};

/**
 * H1 — « Refaire en live » : crée une séance ACTIVE pré-remplie depuis une
 * séance passée (exercices + séries copiées, non validées). Convention legacy
 * gérée : si un exercice n'a pas de séries détaillées, on dérive depuis les
 * colonnes résumé (weight NULL → `sets` = reps et `reps` = charge).
 */
export function useStartWorkoutFromTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (source: RepeatSourceWorkout) => {
      if (!user) throw new Error("Non authentifié");
      await assertNoActiveWorkout(user.id);

      const today = localDateYMD();
      const workout = await workoutsRepo.create(user.id, {
        name: source.name || "Séance",
        date: today,
        gym_location: source.gym_location ?? "Salle inconnue",
        status: "active",
        discipline: "muscu",
        metadata: {},
        duration_minutes: null,
        notes: null,
        level_before: null,
        level_after: null,
        xp_before: null,
        xp_after: null,
      });

      // Etape 4.6c (2026-07-13) : deduplique par identite (identityKey -
      // exercise_reference_id en priorite, repli nom normalise documente).
      const groups = new Map<
        string,
        {
          name: string;
          image_path: string | null;
          exerciseReferenceId: string | null;
          setRows: Array<{ reps: number | null; weight: number | null }>;
        }
      >();
      for (const ex of source.exercises ?? []) {
        if (!ex.name.trim()) continue;
        const key = identityKey({ name: ex.name, exercise_reference_id: ex.exercise_reference_id });
        if (!groups.has(key)) {
          groups.set(key, {
            name: ex.name,
            image_path: ex.image_path ?? null,
            exerciseReferenceId: ex.exercise_reference_id ?? null,
            setRows: [],
          });
        }
        const g = groups.get(key)!;
        if (!g.image_path && ex.image_path) g.image_path = ex.image_path;
        if (!g.exerciseReferenceId && ex.exercise_reference_id) {
          g.exerciseReferenceId = ex.exercise_reference_id;
        }
        const detailed = [...(ex.exercise_sets ?? [])].sort(
          (a, b) => (a.set_number ?? 0) - (b.set_number ?? 0),
        );
        if (detailed.length > 0) {
          for (const d of detailed) g.setRows.push({ reps: d.reps, weight: d.weight });
        } else if (ex.weight != null) {
          const n = Math.max(1, ex.sets ?? 1);
          for (let i = 0; i < n; i++) g.setRows.push({ reps: ex.reps ?? null, weight: ex.weight });
        } else if (ex.sets != null || ex.reps != null) {
          g.setRows.push({ reps: ex.sets ?? null, weight: ex.reps ?? null });
        }
      }

      const groupList = Array.from(groups.values());
      if (groupList.length > 0) {
        const groupReferenceIds = await Promise.all(
          groupList.map((g) =>
            g.exerciseReferenceId
              ? Promise.resolve(g.exerciseReferenceId)
              : resolveMuscuExerciseReferenceId(g.name),
          ),
        );
        for (let i = 0; i < groupList.length; i++) {
          const g = groupList[i];
          const createdEx = await exercisesRepo.create(user.id, {
            workout_id: workout.id,
            name: g.name,
            sets: null,
            reps: null,
            weight: null,
            image_path: g.image_path,
            exercise_reference_id: groupReferenceIds[i],
            position: i,
            notes: null,
            superset_group: null,
            muscle_groups: null,
          });
          for (let j = 0; j < g.setRows.length; j++) {
            const r = g.setRows[j];
            await exerciseSetsRepo.create(user.id, {
              exercise_id: createdEx.id,
              set_number: j + 1,
              reps: r.reps,
              weight: r.weight,
              completed: false,
              rest_seconds: null,
              notes: null,
              tempo: null,
            });
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("Séance relancée — bonnes séries 💪");
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Ajoute un exercice (vide) à la séance active. */
export function useAddExerciseToActiveWorkout() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ workoutId, name }: { workoutId: string; name: string }) => {
      if (!user) throw new Error("Non authentifié");
      const exerciseReferenceId = await resolveMuscuExerciseReferenceId(name);
      // Nouvel exercice = toujours en dernière position de la séance.
      const cached = qc.getQueryData<ActiveWorkout | null>(ACTIVE_KEY);
      let nextPosition: number;
      if (cached && cached.id === workoutId) {
        nextPosition = Math.max(-1, ...cached.exercises.map((e) => e.position)) + 1;
      } else {
        const localExercises = (await exercisesRepo.list(user.id)).filter(
          (e) => e.workout_id === workoutId,
        );
        nextPosition =
          localExercises.length > 0 ? Math.max(...localExercises.map((e) => e.position)) + 1 : 0;
      }
      await exercisesRepo.create(user.id, {
        workout_id: workoutId,
        name,
        sets: null,
        reps: null,
        weight: null,
        image_path: null,
        exercise_reference_id: exerciseReferenceId,
        position: nextPosition,
        notes: null,
        superset_group: null,
        muscle_groups: null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ---------- Exercise set mutations ----------

/** Patch optimiste du cache de la séance active. Retourne l'état précédent. */
function patchActiveCache(
  qc: ReturnType<typeof useQueryClient>,
  updater: (w: ActiveWorkout) => ActiveWorkout,
) {
  const prev = qc.getQueryData<ActiveWorkout | null>(ACTIVE_KEY);
  if (!prev) return prev;
  qc.setQueryData<ActiveWorkout | null>(ACTIVE_KEY, updater(prev));
  return prev;
}

/** Réordonnancement manuel (drag-and-drop) des exercices de la séance active.
 *  `orderedIds` = tous les ids de `workout.exercises` dans le nouvel ordre
 *  voulu ; chaque exercice reçoit `position` = son index. Optimiste (l'ordre
 *  est appliqué immédiatement au relâcher du doigt) — ne touche à aucune
 *  série/rep/charge, uniquement la colonne `position`. */
export function useReorderActiveExercises() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (!user) throw new Error("Non authentifié");
      for (let position = 0; position < orderedIds.length; position++) {
        await exercisesRepo.update(orderedIds[position], user.id, { position });
      }
    },
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: ACTIVE_KEY });
      const prev = patchActiveCache(qc, (w) => {
        const byId = new Map(w.exercises.map((ex) => [ex.id, ex]));
        return {
          ...w,
          exercises: orderedIds
            .map((id, position) => {
              const ex = byId.get(id);
              return ex ? { ...ex, position } : null;
            })
            .filter((ex): ex is ActiveExercise => ex !== null),
        };
      });
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ACTIVE_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
  });
}

/** Ajoute une série à un exercice de la séance active. Offline-first : le
 *  numéro de série est assigné DÉTERMINISTE à partir du store LOCAL
 *  (max existant + 1) — plus besoin du retry serveur sur conflit 23505
 *  (pensé pour des courses entre onglets EN LIGNE) : hors ligne, le store
 *  local est la seule source de vérité, et l'id client-généré + l'upsert
 *  `onConflict: id` du sync engine garantissent qu'un retry réseau après
 *  coupure ne crée jamais deux fois la même série. */
export function useAddExerciseSet() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      exerciseId,
      setNumber,
      reps,
      weight,
    }: {
      exerciseId: string;
      setNumber: number;
      reps: number | null;
      weight: number | null;
    }) => {
      if (!user) throw new Error("Non authentifié");
      const localSets = (await exerciseSetsRepo.list(user.id)).filter(
        (s) => s.exercise_id === exerciseId,
      );
      const n =
        localSets.length > 0 ? Math.max(...localSets.map((s) => s.set_number)) + 1 : setNumber;
      await exerciseSetsRepo.create(user.id, {
        exercise_id: exerciseId,
        set_number: n,
        reps,
        weight,
        completed: false,
        rest_seconds: null,
        notes: null,
        tempo: null,
      });
    },
    onMutate: async ({ exerciseId, setNumber, reps, weight }) => {
      await qc.cancelQueries({ queryKey: ACTIVE_KEY });
      const prev = patchActiveCache(qc, (w) => ({
        ...w,
        exercises: w.exercises.map((ex) =>
          ex.id === exerciseId
            ? {
                ...ex,
                exercise_sets: [
                  ...ex.exercise_sets,
                  {
                    id: `tmp-${Date.now()}`,
                    set_number: setNumber,
                    reps,
                    weight,
                    completed: false,
                  },
                ],
              }
            : ex,
        ),
      }));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ACTIVE_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
  });
}

/** Met à jour reps / weight / completed d'une série. */
export function useUpdateExerciseSet() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      ...fields
    }: {
      id: string;
      reps?: number | null;
      weight?: number | null;
      completed?: boolean;
    }) => {
      // #1 : `completed` ne doit PAS être retiré — sinon la validation des séries n'est jamais enregistrée.
      if (Object.keys(fields).length === 0) return;
      // Garde : série optimiste pas encore confirmée par le repository local.
      if (id.startsWith("tmp-")) return;
      if (!user) throw new Error("Non authentifié");
      await exerciseSetsRepo.update(id, user.id, fields);
    },
    onMutate: async ({ id, ...fields }) => {
      await qc.cancelQueries({ queryKey: ACTIVE_KEY });
      const prev = patchActiveCache(qc, (w) => ({
        ...w,
        exercises: w.exercises.map((ex) => ({
          ...ex,
          exercise_sets: ex.exercise_sets.map((set) =>
            set.id === id ? { ...set, ...fields } : set,
          ),
        })),
      }));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ACTIVE_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
  });
}

/** Supprime une série par son id. */
export function useDeleteExerciseSet() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (id.startsWith("tmp-")) return;
      if (!user) throw new Error("Non authentifié");
      await exerciseSetsRepo.remove(id, user.id);
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ACTIVE_KEY });
      const prev = patchActiveCache(qc, (w) => ({
        ...w,
        exercises: w.exercises.map((ex) => ({
          ...ex,
          exercise_sets: ex.exercise_sets.filter((set) => set.id !== id),
        })),
      }));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ACTIVE_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
  });
}

// ---------- Exercise images ----------
// Stockage Supabase (signed URLs) — reste online-only par nature : une URL
// signée n'a aucun sens hors connexion et expire de toute façon.
export function useExerciseImageUrls(paths: Array<string | null | undefined>) {
  const key = paths.filter(Boolean).sort().join("|");
  return useQuery({
    queryKey: ["fitness", "exercise-image-urls", key],
    enabled: key.length > 0,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const unique = Array.from(new Set(paths.filter((p): p is string => !!p)));
      const map = new Map<string, string>();
      const { data, error } = await supabase.storage
        .from("exercise-images")
        .createSignedUrls(unique, 60 * 60);
      if (error) throw error;
      for (const item of data ?? []) {
        if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
      }
      return map;
    },
  });
}
