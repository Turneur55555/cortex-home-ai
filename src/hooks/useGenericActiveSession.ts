import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getIsOnline } from "@/lib/offline/networkStatus";
import {
  cascadeDeleteWorkoutChildren,
  refreshWorkoutsFromServer,
  workoutSegmentsRepo,
  workoutsRepo,
  type WorkoutSegmentRow,
} from "@/hooks/use-fitness";
import { localDateYMD } from "@/lib/dates";
import { logActivity } from "@/lib/activity";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import { isReadyEngine } from "@/lib/fitness/engines/types";
import type {
  DisciplineId,
  LiveSegmentSeed,
  WorkoutRecordDraft,
} from "@/lib/fitness/engines/types";
import { resolveExerciseId } from "@/services/exerciseResolution";
import {
  ACTIVE_WORKOUT_CONFLICT_MESSAGE,
  isActiveWorkoutConflict,
} from "@/lib/fitness/activeWorkoutGuard";

// Phase 3 (exercice-central) — Étape 2, double écriture : résout/crée
// exercise_id en plus du libellé existant sur workout_segments. Ne doit
// jamais bloquer l'écriture principale du segment (voir
// services/exerciseResolution.ts).
async function resolveSegmentExerciseId(
  discipline: DisciplineId,
  label: string,
): Promise<string | null> {
  // Hors connexion : aucune tentative réseau (le segment est créé avec
  // `exercise_id: null`, exactement comme lors d'un échec de résolution en
  // ligne — la double écriture Phase 3 est best-effort par contrat).
  if (!getIsOnline()) return null;
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
  /** Étape 0.4 (refonte Séances — Phase 0) : identité métier du segment
   *  (résolue à l'écriture, voir resolveSegmentExerciseId ci-dessus),
   *  relue depuis `workout_segments.exercise_id` pour être propagée dans
   *  le snapshot de clôture (`metadata.segments[].exerciseId`, voir
   *  useFinishGenericActiveWorkout) — contrat du moteur (LiveSegmentRow /
   *  formatLiveSegment) inchangé (RA-1), le spread se fait après l'appel. */
  exerciseId: string | null;
  /** Musculation hybride (2026-08-04) — additif : discipline PROPRE à ce
   *  bloc (ex. "course"/"hyrox"), distincte de `ActiveGenericWorkout.discipline`
   *  (qui reste "muscu" pour une séance hôte hybride, voir
   *  useActiveWorkoutSegments ci-dessous). Absente/null pour tout segment
   *  d'une séance générique classique — un seul discipline vaut alors pour
   *  toute la séance, comportement 100% inchangé. */
  discipline: DisciplineId | null;
};

export type ActiveGenericWorkout = {
  id: string;
  name: string;
  discipline: DisciplineId;
  created_at: string;
  segments: ActiveGenericSegment[];
};

const GENERIC_ACTIVE_KEY = ["fitness", "active_generic_workout"] as const;
/** Musculation hybride (2026-08-04) — clé de cache DÉDIÉE des blocs d'une
 *  séance muscu (voir useActiveWorkoutSegments), volontairement DISTINCTE
 *  de `GENERIC_ACTIVE_KEY` : `SeancesTab.tsx` monte `useActiveGenericWorkout()`
 *  (clé `GENERIC_ACTIVE_KEY`) EN PERMANENCE pour décider quelle vue de
 *  séance active afficher — un cache partagé y ferait fuiter un faux
 *  "workout générique actif" et basculerait l'écran par erreur pendant une
 *  séance muscu. Les mutations de segment acceptent un `cacheKey` optionnel
 *  (défaut `GENERIC_ACTIVE_KEY`, comportement 100% inchangé pour
 *  ActiveGenericSessionView) pour cibler celle-ci à la place quand elles
 *  sont invoquées pour un bloc muscu (voir ActiveWorkoutView.tsx /
 *  ActiveExerciseCard.tsx `cacheKey` prop). */
export const HYBRID_BLOCKS_KEY = ["fitness", "active_workout_segments"] as const;

type SegmentRowDb = WorkoutSegmentRow;

function toActiveSegment(row: SegmentRowDb): ActiveGenericSegment {
  return {
    id: row.id,
    label: row.label,
    metrics: (row.metrics ?? {}) as Record<string, number | string>,
    metricKey: row.metric_key,
    completed: row.completed,
    position: row.position,
    exerciseId: row.exercise_id ?? null,
    discipline: (row.discipline as DisciplineId | null) ?? null,
  };
}

/** Retourne la séance active NON-musculation en cours (ou null). Une seule
 *  séance active tous types confondus est autorisée (voir garde dans
 *  useStartGenericActiveWorkout) — musculation et générique ne peuvent
 *  donc jamais être actives simultanément. */
export function useActiveGenericWorkout() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: GENERIC_ACTIVE_KEY,
    enabled: !!userId,
    queryFn: async (): Promise<ActiveGenericWorkout | null> => {
      if (!userId) return null;
      // Hydratation en ligne puis lecture LOCALE — même pattern que
      // `useActiveWorkout()` (use-fitness.ts) : hors connexion, la séance et
      // ses segments viennent d'IndexedDB, jamais du réseau.
      await refreshWorkoutsFromServer(userId);
      const workouts = await workoutsRepo.list(userId);
      const active = workouts
        .filter((w) => w.status === "active" && w.discipline !== "muscu")
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!active) return null;

      const segments = (await workoutSegmentsRepo.list(userId))
        .filter((seg) => seg.workout_id === active.id)
        .sort((a, b) =>
          a.position !== b.position ? a.position - b.position : a.id.localeCompare(b.id),
        );

      return {
        id: active.id,
        name: active.name,
        discipline: active.discipline as DisciplineId,
        created_at: active.created_at,
        segments: segments.map(toActiveSegment),
      };
    },
  });
}

/** Musculation hybride (2026-08-04) — blocs métriques (course/cardio/HYROX/
 *  autre) ajoutés à L'INTÉRIEUR d'une séance active Musculation. Mêmes
 *  lignes `workout_segments` que toute discipline générique, mais rattachées
 *  à un `workout_id` dont `discipline='muscu'` (voir ActiveWorkoutView.tsx) —
 *  ce n'est PAS un troisième système de persistance, seulement une lecture
 *  ciblée par id plutôt que par discipline (cf. useActiveGenericWorkout, qui
 *  exclut explicitement muscu). Utilise sa propre clé de cache
 *  (`HYBRID_BLOCKS_KEY`, voir plus bas) plutôt que `GENERIC_ACTIVE_KEY` :
 *  `SeancesTab.tsx` monte `useActiveGenericWorkout()` EN PERMANENCE pour
 *  décider quelle vue de séance active afficher — partager la clé y
 *  ferait fuiter un faux "workout générique actif" pendant une séance
 *  muscu et basculerait l'écran par erreur. Les mutations génériques
 *  (`useAddGenericSegment` etc.) reçoivent explicitement `cacheKey:
 *  HYBRID_BLOCKS_KEY` au point d'appel (ActiveWorkoutView.tsx,
 *  ActiveExerciseCard.tsx) pour cibler la bonne entrée de cache. */
export function useActiveWorkoutSegments(
  workout: { id: string; discipline: DisciplineId } | null | undefined,
) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: HYBRID_BLOCKS_KEY,
    queryFn: async (): Promise<ActiveGenericWorkout | null> => {
      if (!workout || !userId) return null;
      // Lecture LOCALE (voir useActiveGenericWorkout) : l'hydratation est
      // déjà faite par `useActiveWorkout()` monté sur le même écran.
      const segments = (await workoutSegmentsRepo.list(userId))
        .filter((seg) => seg.workout_id === workout.id)
        .sort((a, b) =>
          a.position !== b.position ? a.position - b.position : a.id.localeCompare(b.id),
        );
      return {
        id: workout.id,
        name: "",
        discipline: workout.discipline,
        created_at: new Date().toISOString(),
        segments: segments.map(toActiveSegment),
      };
    },
    enabled: !!workout && !!userId,
  });
}

/** Démarre une séance active générique à partir d'un brouillon Sensei
 *  (draft + segments seedés par engine.buildLiveSegments()). Garde : une
 *  seule séance active à la fois, tous types confondus (muscu inclus) —
 *  cohérent avec l'intention produit (une séance en cours à l'écran). */
export function useStartGenericActiveWorkout() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      draft,
      seedSegments,
    }: {
      draft: WorkoutRecordDraft;
      seedSegments: LiveSegmentSeed[];
    }) => {
      if (!user) throw new Error("Non authentifié");

      // Garde "une seule séance active" vérifiée EN LOCAL (aucun appel
      // réseau) — même stratégie que `assertNoActiveWorkout` côté
      // musculation ; l'index unique serveur reste le garde-fou final.
      const localWorkouts = await workoutsRepo.list(user.id);
      if (localWorkouts.some((w) => w.status === "active")) {
        throw new Error(ACTIVE_WORKOUT_CONFLICT_MESSAGE);
      }

      const today = localDateYMD();
      // metadata sans `segments` : les segments live vivent dans
      // workout_segments pendant la séance, `metadata.segments` n'est
      // resynchronisé (résumé d'affichage) qu'à la clôture — voir
      // useFinishGenericActiveWorkout.
      const { segments: _ignored, ...metadataWithoutSegments } = (draft.metadata ?? {}) as Record<
        string,
        unknown
      >;

      let workout;
      try {
        workout = await workoutsRepo.create(user.id, {
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
          metadata: metadataWithoutSegments,
          status: "active",
          level_before: null,
          level_after: null,
          xp_before: null,
          xp_after: null,
        });
      } catch (e) {
        if (isActiveWorkoutConflict(e)) throw new Error(ACTIVE_WORKOUT_CONFLICT_MESSAGE);
        throw e;
      }

      if (seedSegments.length > 0) {
        const seedExerciseIds = await Promise.all(
          seedSegments.map((seg) => resolveSegmentExerciseId(draft.discipline, seg.label)),
        );
        let i = 0;
        for (const seg of seedSegments) {
          await workoutSegmentsRepo.create(user.id, {
            workout_id: workout.id,
            position: i,
            label: seg.label,
            metric_key: seg.metricKey ?? null,
            metrics: seg.metrics as Record<string, number | string>,
            completed: false,
            discipline: draft.discipline,
            exercise_id: seedExerciseIds[i],
          });
          i++;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GENERIC_ACTIVE_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Patch optimiste du cache de la séance active générique (ou, musculation
 *  hybride, du cache dédié `HYBRID_BLOCKS_KEY` — voir `cacheKey` ci-dessous). */
function patchGenericActiveCache(
  qc: ReturnType<typeof useQueryClient>,
  updater: (w: ActiveGenericWorkout) => ActiveGenericWorkout,
  cacheKey: readonly unknown[] = GENERIC_ACTIVE_KEY,
) {
  const prev = qc.getQueryData<ActiveGenericWorkout | null>(cacheKey);
  if (!prev) return prev;
  qc.setQueryData<ActiveGenericWorkout | null>(cacheKey, updater(prev));
  return prev;
}

/** Ajoute un segment personnalisé à la séance active (bouton "+ Ajouter"). */
export function useAddGenericSegment() {
  const qc = useQueryClient();
  const { user } = useAuth();
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
      /** Défaut GENERIC_ACTIVE_KEY — voir HYBRID_BLOCKS_KEY ci-dessus. */
      cacheKey?: readonly unknown[];
    }) => {
      if (!user) throw new Error("Non authentifié");
      const exerciseId = await resolveSegmentExerciseId(discipline, label);
      await workoutSegmentsRepo.create(user.id, {
        workout_id: workoutId,
        position,
        label,
        metric_key: metricKey ?? null,
        metrics,
        completed: false,
        discipline,
        exercise_id: exerciseId,
      });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: (_d, _e, variables) => {
      qc.invalidateQueries({ queryKey: variables?.cacheKey ?? GENERIC_ACTIVE_KEY });
    },
  });
}

/** Modifie label / metrics / completed d'un segment (édition inline). */
export function useUpdateGenericSegment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      cacheKey: _cacheKey,
      ...fields
    }: {
      id: string;
      label?: string;
      metrics?: Record<string, number | string>;
      completed?: boolean;
      /** Défaut GENERIC_ACTIVE_KEY — voir HYBRID_BLOCKS_KEY ci-dessus. */
      cacheKey?: readonly unknown[];
    }) => {
      if (Object.keys(fields).length === 0) return;
      if (!user) throw new Error("Non authentifié");
      // `repo.update` fusionne le patch dans la création encore en attente
      // s'il y en a une (jamais d'`update` orphelin sur une ligne qui
      // n'existe pas encore côté serveur) — voir repository.ts.
      await workoutSegmentsRepo.update(id, user.id, {
        ...fields,
        ...(fields.metrics ? { metrics: fields.metrics } : {}),
      });
    },
    onMutate: async ({ id, cacheKey = GENERIC_ACTIVE_KEY, ...fields }) => {
      await qc.cancelQueries({ queryKey: cacheKey });
      const prev = patchGenericActiveCache(
        qc,
        (w) => ({
          ...w,
          segments: w.segments.map((seg) =>
            seg.id === id
              ? { ...seg, ...fields, metrics: { ...seg.metrics, ...(fields.metrics ?? {}) } }
              : seg,
          ),
        }),
        cacheKey,
      );
      return { prev, cacheKey };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.cacheKey ?? GENERIC_ACTIVE_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: (_d, _e, variables) => {
      qc.invalidateQueries({ queryKey: variables?.cacheKey ?? GENERIC_ACTIVE_KEY });
    },
  });
}

/** Supprime un segment de la séance active. */
export function useDeleteGenericSegment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: string | { id: string; cacheKey?: readonly unknown[] }) => {
      const id = typeof input === "string" ? input : input.id;
      if (!user) throw new Error("Non authentifié");
      await workoutSegmentsRepo.remove(id, user.id);
    },
    onMutate: async (input: string | { id: string; cacheKey?: readonly unknown[] }) => {
      const id = typeof input === "string" ? input : input.id;
      const cacheKey =
        typeof input === "string" ? GENERIC_ACTIVE_KEY : (input.cacheKey ?? GENERIC_ACTIVE_KEY);
      await qc.cancelQueries({ queryKey: cacheKey });
      const prev = patchGenericActiveCache(
        qc,
        (w) => ({
          ...w,
          segments: w.segments.filter((seg) => seg.id !== id),
        }),
        cacheKey,
      );
      return { prev, cacheKey };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.cacheKey ?? GENERIC_ACTIVE_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: (_d, _e, input) => {
      const cacheKey =
        typeof input === "string" ? GENERIC_ACTIVE_KEY : (input?.cacheKey ?? GENERIC_ACTIVE_KEY);
      qc.invalidateQueries({ queryKey: cacheKey });
    },
  });
}

/** Réordonne un segment (flèche haut/bas — pas de dnd-kit, retiré du
 *  projet le 2026-07-05, voir MEMORY.md). Échange la position avec le
 *  voisin immédiat plutôt que de renuméroter toute la liste. */
export function useReorderGenericSegment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      segments,
      id,
      direction,
    }: {
      segments: ActiveGenericSegment[];
      id: string;
      direction: "up" | "down";
      /** Défaut GENERIC_ACTIVE_KEY — voir HYBRID_BLOCKS_KEY ci-dessus. */
      cacheKey?: readonly unknown[];
    }) => {
      const sorted = [...segments].sort((a, b) => a.position - b.position);
      const idx = sorted.findIndex((s) => s.id === id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
      if (!user) throw new Error("Non authentifié");
      const a = sorted[idx];
      const b = sorted[swapIdx];
      await workoutSegmentsRepo.update(a.id, user.id, { position: b.position });
      await workoutSegmentsRepo.update(b.id, user.id, { position: a.position });
    },
    onMutate: async ({ segments, id, direction, cacheKey = GENERIC_ACTIVE_KEY }) => {
      await qc.cancelQueries({ queryKey: cacheKey });
      const sorted = [...segments].sort((a, b) => a.position - b.position);
      const idx = sorted.findIndex((s) => s.id === id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      const prev = patchGenericActiveCache(
        qc,
        (w) => {
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
        },
        cacheKey,
      );
      return { prev, cacheKey };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.cacheKey ?? GENERIC_ACTIVE_KEY, ctx.prev);
      toast.error(e.message);
    },
    onSettled: (_d, _e, variables) => {
      qc.invalidateQueries({ queryKey: variables?.cacheKey ?? GENERIC_ACTIVE_KEY });
    },
  });
}

/** Termine la séance active générique : calcule la durée, resynchronise le
 *  résumé d'affichage (workouts.metadata.segments) via
 *  engine.formatLiveSegment(), même pattern que la synchro
 *  exercises.sets/reps/weight côté musculation (useFinishWorkout). */
export function useFinishGenericActiveWorkout() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (workout: ActiveGenericWorkout) => {
      const durationMs = Date.now() - new Date(workout.created_at).getTime();
      const durationMin = Math.min(600, Math.max(1, Math.round(durationMs / 60_000)));

      const entry = ENGINE_REGISTRY[workout.discipline];
      const engine = entry && isReadyEngine(entry) ? entry : null;

      if (!user) throw new Error("Non authentifié");
      const current = await workoutsRepo.get(workout.id);
      const existingMetadata = (current?.metadata ?? {}) as Record<string, unknown>;

      const formattedSegments =
        engine?.formatLiveSegment != null
          ? // Étape 0.4 (F4) : `[...segments].sort(...)` — copie avant tri,
            // `.sort()` mute le tableau en place et `workout.segments`
            // référence potentiellement le cache React Query (ne jamais
            // muter une donnée de cache directement).
            [...workout.segments]
              .sort((a, b) => a.position - b.position)
              .map((seg) => ({
                // Étape 0.4 : contrat du moteur inchangé (RA-1) —
                // `formatLiveSegment` ne connaît toujours pas exerciseId ;
                // on le propage après coup dans le snapshot de clôture
                // (metadata.segments[].exerciseId), SessionSegment le
                // supporte déjà en optionnel (voir engines/types.ts).
                ...engine.formatLiveSegment!({
                  id: seg.id,
                  label: seg.label,
                  metrics: seg.metrics,
                  metricKey: seg.metricKey,
                  completed: seg.completed,
                  position: seg.position,
                }),
                exerciseId: seg.exerciseId,
              }))
          : [];

      // Écriture LOCALE : le trigger serveur `award_xp_on_workout_complete`
      // se déclenche naturellement quand la sync queue pousse ce passage à
      // `completed` (même raisonnement que useFinishWorkout côté muscu).
      await workoutsRepo.update(workout.id, user.id, {
        duration_minutes: durationMin,
        status: "completed",
        metadata: { ...existingMetadata, segments: formattedSegments },
      });
    },
    onSuccess: (_d, workout) => {
      // Pas de toast ici : l'écran de récompense (SessionRewardScreen)
      // s'affiche systématiquement à la clôture et suffit à informer
      // l'utilisateur — un toast en plus serait redondant.
      logActivity("workout", `Séance terminée : ${workout.name}`, { workout_id: workout.id });
      // Étape 0.2 (INV-4 fraîcheur) : invalidation par préfixe fitness —
      // voir commentaire équivalent dans use-fitness.ts (useFinishWorkout).
      qc.invalidateQueries({ queryKey: ["fitness"] });
      qc.invalidateQueries({ queryKey: ["user_activity"] });
      qc.invalidateQueries({ queryKey: ["activity_streak"] });
      // RPG : la clôture verse de l'XP côté serveur (trigger
      // `award_xp_on_workout_complete`) — invalider le cache Niveau/Rang.
      qc.invalidateQueries({ queryKey: ["user_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Annule (supprime) la séance active générique et ses segments (cascade). */
export function useCancelGenericActiveWorkout() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (workoutId: string) => {
      // L'XP éventuellement versée est retirée côté serveur avant la
      // suppression (trigger `trg_reverse_xp_before_workout_delete`), au
      // moment où la sync queue pousse ce delete.
      if (!user) throw new Error("Non authentifié");
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
