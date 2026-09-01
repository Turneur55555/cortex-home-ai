import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
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
  assertNoActiveWorkout,
  cascadeDeleteWorkoutChildren,
  refreshWorkoutsFromServer,
  exerciseSetsRepo,
  exercisesRepo,
  workoutSegmentsRepo,
  workoutsRepo,
  type WorkoutSegmentRow,
} from "@/hooks/use-fitness";
import { OFFLINE_FIRST_QUERY_OPTIONS } from "@/lib/offline/offlineQuery";
import { requestSyncFlush } from "@/lib/offline/syncFlush";
import { collectWorkoutSyncDependencies } from "@/lib/fitness/workoutSyncDependencies";

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
// src/lib/fitness/engines/types.ts).
//
// Musculation N'EST PAS TOUCHÉE : use-fitness.ts, ActiveWorkoutView,
// ActiveExerciseCard restent strictement inchangés. `useActiveWorkout()`
// (musculation) est explicitement filtré sur discipline='muscu' pour ne
// jamais confondre une séance active muscu et une séance active générique.
//
// Offline-first (audit offline 28/08/2026, CLAUDE.md) — `workouts` (via
// `workoutsRepo`, réutilisé de use-fitness.ts) et `workout_segments` (via
// `workoutSegmentsRepo`) passent TOUS DEUX par le même repository/queue/
// sync engine que le module musculation : plus de moteur parallèle
// online-only. Toute écriture est locale d'abord (IndexedDB), mise en
// queue de sync, avec hydratation en ligne + fallback local hors
// connexion (`refreshWorkoutsFromServer`, partagée avec use-fitness.ts).
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

function toActiveSegment(row: WorkoutSegmentRow): ActiveGenericSegment {
  return {
    id: row.id,
    label: row.label,
    metrics: row.metrics ?? {},
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
    // Offline-first (test terrain réel 28/08/2026, voir use-fitness.ts
    // useActiveWorkout) : évite qu'un refetch après mutation offline reste
    // en pause hors connexion alors que la donnée est déjà écrite localement.
    ...OFFLINE_FIRST_QUERY_OPTIONS,
    queryFn: async (): Promise<ActiveGenericWorkout | null> => {
      if (!userId) return null;
      await refreshWorkoutsFromServer(userId);

      const workouts = await workoutsRepo.list(userId);
      const candidates = workouts.filter((w) => w.status === "active" && w.discipline !== "muscu");
      const active = [...candidates].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!active) return null;

      const segments = (await workoutSegmentsRepo.list(userId))
        .filter((s) => s.workout_id === active.id)
        .sort((a, b) => a.position - b.position);

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
    // Offline-first (test terrain réel 28/08/2026, voir use-fitness.ts
    // useActiveWorkout) : mêmes garanties que GENERIC_ACTIVE_KEY ci-dessus.
    ...OFFLINE_FIRST_QUERY_OPTIONS,
    queryFn: async (): Promise<ActiveGenericWorkout | null> => {
      if (!workout || !userId) return null;
      await refreshWorkoutsFromServer(userId);
      const segments = (await workoutSegmentsRepo.list(userId))
        .filter((s) => s.workout_id === workout.id)
        .sort((a, b) => a.position - b.position);
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
 *  vérification LOCALE (offline-first, voir `assertNoActiveWorkout` dans
 *  use-fitness.ts, même garantie que musculation), l'index unique
 *  `workouts_one_active_per_user` restant le garde-fou final côté serveur
 *  pour une course entre appareils. */
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
      await assertNoActiveWorkout(user.id);

      const today = localDateYMD();
      // metadata sans `segments` : les segments live vivent dans
      // workout_segments pendant la séance, `metadata.segments` n'est
      // resynchronisé (résumé d'affichage) qu'à la clôture — voir
      // useFinishGenericActiveWorkout.
      const { segments: _ignored, ...metadataWithoutSegments } = (draft.metadata ?? {}) as Record<
        string,
        unknown
      >;

      const workout = await workoutsRepo.create(user.id, {
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

      if (seedSegments.length > 0) {
        const seedExerciseIds = await Promise.all(
          seedSegments.map((seg) => resolveSegmentExerciseId(draft.discipline, seg.label)),
        );
        let position = 0;
        for (const seg of seedSegments) {
          await workoutSegmentsRepo.create(user.id, {
            workout_id: workout.id,
            position: position,
            label: seg.label,
            metric_key: seg.metricKey ?? null,
            metrics: seg.metrics,
            completed: false,
            discipline: draft.discipline,
            exercise_id: seedExerciseIds[position],
          });
          position += 1;
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

/** Ajoute un segment personnalisé à la séance active (bouton "+ Ajouter").
 *  Offline-first : écrit d'abord dans `workoutSegmentsRepo` (IndexedDB +
 *  sync queue) — aucun appel réseau direct. */
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

/** Modifie label / metrics / completed d'un segment (édition inline).
 *  Offline-first : `workoutSegmentsRepo.update` remplace le champ `metrics`
 *  par la valeur fournie (pas de fusion profonde), exactement le
 *  comportement de l'ancien `.update()` Supabase direct — la fusion locale
 *  visible dans `onMutate` reste un aperçu optimiste immédiat. */
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
      await workoutSegmentsRepo.update(id, user.id, fields);
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

/** Supprime un segment de la séance active. Offline-first :
 *  `workoutSegmentsRepo.remove` annule proprement une création encore en
 *  attente (jamais de sync orpheline) et enfile un `delete` idempotent
 *  sinon — même garantie que `useDeleteExerciseSet` (use-fitness.ts). */
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
 *  voisin immédiat plutôt que de renuméroter toute la liste. Offline-first :
 *  deux `workoutSegmentsRepo.update` locaux, mis en queue dans l'ordre. */
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
      if (!user) throw new Error("Non authentifié");
      const sorted = [...segments].sort((a, b) => a.position - b.position);
      const idx = sorted.findIndex((s) => s.id === id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
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
 *  exercises.sets/reps/weight côté musculation (useFinishWorkout).
 *  Offline-first : lecture de la metadata existante et écriture du statut
 *  `completed` sont toutes deux locales (workoutsRepo) — l'XP est versée
 *  côté serveur par le trigger `award_xp_on_workout_complete` dès que la
 *  sync queue pousse cette mise à jour au retour du réseau (même garantie
 *  que useFinishWorkout, cf. doc en tête de use-fitness.ts). */
export function useFinishGenericActiveWorkout() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (workout: ActiveGenericWorkout) => {
      if (!user) throw new Error("Non authentifié");
      const durationMs = Date.now() - new Date(workout.created_at).getTime();
      const durationMin = Math.min(600, Math.max(1, Math.round(durationMs / 60_000)));

      const entry = ENGINE_REGISTRY[workout.discipline];
      const engine = entry && isReadyEngine(entry) ? entry : null;

      const localWorkout = await workoutsRepo.get(workout.id);
      const existingMetadata = (localWorkout?.metadata ?? {}) as Record<string, unknown>;

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

      // CHANTIER 4 (DISC-01) + CHANTIER 1 BIS (DISC-01b) — même raison que
      // `useFinishWorkout` : la clôture ne doit jamais être fusionnée dans un
      // `create` encore en attente (sinon le trigger d'XP serveur s'exécute
      // avant l'arrivée des lignes liées), et `dependsOnRecords` la retient
      // tant que ces lignes n'ont pas RÉUSSI — un échec n'interrompant pas la
      // file. Dépendances construites depuis le STORE LOCAL (jamais depuis le
      // cache React, qui peut porter des ids optimistes `tmp-*`).
      const [localExercises, localSets, localSegments] = await Promise.all([
        exercisesRepo.list(user.id),
        exerciseSetsRepo.list(user.id),
        workoutSegmentsRepo.list(user.id),
      ]);
      const dependsOnRecords = collectWorkoutSyncDependencies(workout.id, {
        exercises: localExercises,
        exerciseSets: localSets,
        workoutSegments: localSegments,
      });

      await workoutsRepo.update(
        workout.id,
        user.id,
        {
          duration_minutes: durationMin,
          status: "completed",
          metadata: { ...existingMetadata, segments: formattedSegments },
        },
        { neverMergeIntoPendingCreate: true, dependsOnRecords },
      );
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
      // CHANTIER 4 (CRIT-03) — même raison que useFinishWorkout : la
      // récompense n'existe qu'une fois `status='completed'` arrivé en base.
      requestSyncFlush(user?.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Annule (supprime) la séance active générique et ses segments (cascade
 *  locale, offline-first — même helper que useCancelWorkout côté
 *  musculation, voir cascadeDeleteWorkoutChildren dans use-fitness.ts). */
export function useCancelGenericActiveWorkout() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (workoutId: string) => {
      if (!user) throw new Error("Non authentifié");
      // L'XP éventuellement versée est retirée côté serveur avant la
      // suppression (trigger `trg_reverse_xp_before_workout_delete`), dès
      // que la sync queue pousse ce `delete` au retour du réseau.
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
