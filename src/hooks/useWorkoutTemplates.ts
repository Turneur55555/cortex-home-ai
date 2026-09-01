import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/db";
import { useAuth } from "@/hooks/use-auth";
import { getIsOnline } from "@/lib/offline/networkStatus";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";
import { localDateYMD } from "@/lib/dates";

import { resolveExerciseIdsByLabel } from "@/services/exerciseResolution";
import type { DisciplineId } from "@/lib/fitness/engines/types";
import { HYBRID_BLOCKS_KEY } from "@/hooks/useGenericActiveSession";
import { orderedTemplateItems as orderedTemplateItemsPure } from "@/lib/fitness/workoutTemplates";
import { ACTIVE_WORKOUT_CONFLICT_MESSAGE } from "@/lib/fitness/activeWorkoutGuard";
import {
  workoutsRepo,
  exercisesRepo,
  exerciseSetsRepo,
  workoutSegmentsRepo,
} from "@/hooks/use-fitness";
import { OFFLINE_FIRST_QUERY_OPTIONS } from "@/lib/offline/offlineQuery";

// ============================================================
// Modèles de séance ("Utiliser une séance sauvegardée") — module Nouvelle
// séance / Choisir une épreuve. SANS LIEN avec Sensei (moteur d'IA, voir
// src/lib/fitness/engines/) : un modèle est uniquement une structure de
// séance réutilisable (exercices, ordre, supersets, notes, paramètres par
// défaut) pour démarrer rapidement. Distinct de useStartWorkoutFromTemplate
// (use-fitness.ts) qui est "Refaire en live" — rejoue une séance PASSÉE par
// son id, pas un modèle nommé par l'utilisateur.
//
// Offline-first (CLAUDE.md) — `workout_templates` / `workout_template_exercises`
// / `workout_template_segments` migrées vers `createOfflineRepository`, même
// pattern que use-fitness.ts / useRecipes.ts. Démarrer une séance depuis un
// modèle déjà synchronisé localement fonctionne hors connexion (la séance
// créée réutilise workoutsRepo/exercisesRepo/exerciseSetsRepo du module
// Cœur Fitness). Les blocs métriques (`workout_segments`, seedés par un
// modèle hybride) sont offline-first via `workoutSegmentsRepo` (audit
// offline 28/08/2026) — même garantie que useGenericActiveSession.ts.
// ============================================================

const TEMPLATES_KEY = ["fitness", "workout_templates"];
const ACTIVE_KEY = ["fitness", "active_workout"];

export interface WorkoutTemplateExerciseRow {
  id: string;
  user_id: string;
  template_id: string;
  name: string;
  position: number;
  superset_group: number | null;
  default_sets: number | null;
  default_reps: number | null;
  default_weight: number | null;
  notes: string | null;
  /** Musculation hybride (2026-08-19) — identité Exercise-Central, absente
   *  jusqu'ici de cette table (résolution par nom seul). Nullable/additif :
   *  `null` pour tout exercice de modèle créé avant cette migration. */
  exercise_reference_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Musculation hybride (2026-08-19) — bloc métrique (course/HYROX/cardio)
 *  d'un modèle, pendant de `WorkoutTemplateExerciseRow` pour les blocs.
 *  `position` partage le même espace de valeurs que celui des exercices du
 *  même modèle (voir migration `20260819090000_hybrid_workout_templates.sql`)
 *  — c'est ce qui permet de reconstruire l'ordre RÉEL (force + blocs
 *  entremêlés) en fusionnant les deux listes, voir `orderedTemplateItems`
 *  (lib/fitness/workoutTemplates.ts). */
export interface WorkoutTemplateSegmentRow {
  id: string;
  user_id: string;
  template_id: string;
  position: number;
  label: string;
  discipline: DisciplineId | null;
  metric_key: string | null;
  metrics: Record<string, number | string>;
  exercise_reference_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkoutTemplateRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
  exercises: WorkoutTemplateExerciseRow[];
  /** Vide pour tout modèle force-only classique — comportement 100%
   *  inchangé pour les templates existants (aucune ligne en base). */
  segments: WorkoutTemplateSegmentRow[];
}

export interface TemplateRow {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  color: string;
  source_document_id: string | null;
  created_at: string;
  updated_at: string;
}

interface TemplateExerciseInsert {
  template_id: string;
  name: string;
  position: number;
  superset_group: number | null;
  default_sets: number | null;
  default_reps: number | null;
  default_weight: number | null;
  notes: string | null;
  exercise_reference_id: string | null;
}

interface TemplateSegmentInsert {
  template_id: string;
  position: number;
  label: string;
  discipline: DisciplineId;
  metric_key: string | null;
  metrics: Record<string, number | string>;
  exercise_reference_id: string | null;
}

/** Entrée éditable d'un exercice de modèle — utilisée pour créer/mettre à
 *  jour un modèle depuis l'éditeur (position dérivée de l'ordre du tableau). */
export interface TemplateExerciseInput {
  name: string;
  superset_group?: number | null;
  default_sets?: number | null;
  default_reps?: number | null;
  default_weight?: number | null;
  notes?: string | null;
}

/** Musculation hybride (2026-08-19) — entrée éditable d'un bloc métrique de
 *  modèle (voir WorkoutTemplateSegmentRow). */
export interface TemplateSegmentInput {
  label: string;
  discipline: DisciplineId;
  metricKey?: string | null;
  metrics?: Record<string, number | string>;
}

/** Musculation hybride (2026-08-19) — un modèle est désormais une liste
 *  ORDONNÉE d'items hétérogènes (force ou bloc), discriminée par `kind` —
 *  c'est cet ordre unique qui porte la position réelle "Bench Press, Course
 *  1000m, Sled Push, Pull-ups, Row 1000m" au lieu de deux listes séparées
 *  sans relation d'ordre. `useCreateWorkoutTemplate`/`useUpdateWorkoutTemplate`
 *  éclatent ce tableau vers les deux tables, `position` = index dans CE
 *  tableau (voir replaceTemplateItems). Un modèle force-only classique n'a
 *  que des items `kind: "exercise"` — strictement le même appel qu'avant
 *  l'ajout des blocs (TemplateEditorSheet ne change rien à ce chemin). */
export type TemplateItemInput =
  | ({ kind: "exercise" } & TemplateExerciseInput)
  | ({ kind: "segment" } & TemplateSegmentInput);

/** Reconstruit la liste ordonnée `TemplateItemInput[]` d'un modèle déjà
 *  chargé — utilisée pour dupliquer un modèle (position réelle préservée)
 *  et par TemplateEditorSheet pour initialiser l'éditeur en mode édition.
 *  Fine couche d'adaptation au-dessus de `orderedTemplateItems` (domaine
 *  pur, lib/fitness/workoutTemplates.ts) vers la forme attendue par
 *  replaceTemplateItems. */
export function orderedTemplateItems(template: WorkoutTemplateRow): TemplateItemInput[] {
  return orderedTemplateItemsPure(template).map((item) =>
    item.kind === "exercise"
      ? {
          kind: "exercise",
          name: item.name,
          superset_group: item.superset_group,
          default_sets: item.default_sets,
          default_reps: item.default_reps,
          default_weight: item.default_weight,
          notes: item.notes,
        }
      : {
          kind: "segment",
          label: item.label,
          discipline: item.discipline as DisciplineId,
          metricKey: item.metric_key,
          metrics: item.metrics,
        },
  );
}

export const templatesRepo = createOfflineRepository<TemplateRow>("workout_templates");
export const templateExercisesRepo = createOfflineRepository<WorkoutTemplateExerciseRow>(
  "workout_template_exercises",
);
export const templateSegmentsRepo = createOfflineRepository<WorkoutTemplateSegmentRow>(
  "workout_template_segments",
);

async function refreshTemplatesFromServer(userId: string): Promise<void> {
  if (!getIsOnline()) return;
  try {
    const { data: templates, error } = await supabase
      .from("workout_templates")
      .select("*")
      .eq("user_id", userId);
    if (!error && templates) {
      await hydrateEntitiesFromServer(
        "workout_templates",
        userId,
        templates as unknown as TemplateRow[],
      );
    }
    const { data: exercises, error: exErr } = await supabase
      .from("workout_template_exercises")
      .select("*")
      .eq("user_id", userId);
    if (!exErr && exercises) {
      await hydrateEntitiesFromServer(
        "workout_template_exercises",
        userId,
        exercises as unknown as WorkoutTemplateExerciseRow[],
      );
    }
    const { data: segments, error: segErr } = await db
      .from("workout_template_segments")
      .select("*")
      .eq("user_id", userId);
    if (!segErr && segments) {
      await hydrateEntitiesFromServer(
        "workout_template_segments",
        userId,
        segments as unknown as WorkoutTemplateSegmentRow[],
      );
    }
  } catch {
    // Hors ligne ou erreur réseau : on continue avec le store local.
  }
}

function groupByField<T, K extends keyof T>(rows: T[], key: K): Map<T[K], T[]> {
  const map = new Map<T[K], T[]>();
  for (const row of rows) {
    const list = map.get(row[key]) ?? [];
    list.push(row);
    map.set(row[key], list);
  }
  return map;
}

export function useWorkoutTemplates() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    ...OFFLINE_FIRST_QUERY_OPTIONS,
    queryKey: TEMPLATES_KEY,
    enabled: !!userId,
    queryFn: async (): Promise<WorkoutTemplateRow[]> => {
      if (!userId) return [];
      await refreshTemplatesFromServer(userId);
      const [templates, exercises, segments] = await Promise.all([
        templatesRepo.list(userId),
        templateExercisesRepo.list(userId),
        templateSegmentsRepo.list(userId),
      ]);
      const exercisesByTemplate = groupByField(exercises, "template_id");
      const segmentsByTemplate = groupByField(segments, "template_id");
      return [...templates]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((t) => ({
          id: t.id,
          name: t.name,
          icon: t.icon,
          color: t.color,
          created_at: t.created_at,
          updated_at: t.updated_at,
          exercises: [...(exercisesByTemplate.get(t.id) ?? [])].sort(
            (a, b) => a.position - b.position,
          ),
          segments: [...(segmentsByTemplate.get(t.id) ?? [])]
            .sort((a, b) => a.position - b.position)
            .map((s) => ({
              ...s,
              discipline: (s.discipline as DisciplineId | null) ?? null,
              metrics: (s.metrics ?? {}) as Record<string, number | string>,
            })),
        }));
    },
  });
}

/** Musculation hybride (2026-08-19) — remplace intégralement le contenu
 *  (exercices + blocs) d'un modèle depuis une liste ORDONNÉE unique, en
 *  éclatant vers les deux repositories tout en préservant `position` =
 *  index dans `items` (voir TemplateItemInput). Offline-first : remplace
 *  chaque enfant existant en local puis recrée depuis `items`. */
async function replaceTemplateItems(
  templateId: string,
  userId: string,
  items: TemplateItemInput[],
) {
  const existingExercises = (await templateExercisesRepo.list(userId)).filter(
    (e) => e.template_id === templateId,
  );
  for (const e of existingExercises) await templateExercisesRepo.remove(e.id, userId);
  const existingSegments = (await templateSegmentsRepo.list(userId)).filter(
    (s) => s.template_id === templateId,
  );
  for (const s of existingSegments) await templateSegmentsRepo.remove(s.id, userId);

  if (items.length === 0) return;

  const exerciseItems = items
    .map((item, position) => ({ item, position }))
    .filter(
      (x): x is { item: TemplateExerciseInput & { kind: "exercise" }; position: number } =>
        x.item.kind === "exercise",
    );
  const segmentItems = items
    .map((item, position) => ({ item, position }))
    .filter(
      (x): x is { item: TemplateSegmentInput & { kind: "segment" }; position: number } =>
        x.item.kind === "segment",
    );

  if (exerciseItems.length > 0) {
    const idsByName = await resolveExerciseIdsByLabel(
      "muscu",
      exerciseItems.map((x) => x.item.name),
    );
    const rows: TemplateExerciseInsert[] = exerciseItems.map(({ item, position }) => ({
      template_id: templateId,
      name: item.name,
      position,
      superset_group: item.superset_group ?? null,
      default_sets: item.default_sets ?? null,
      default_reps: item.default_reps ?? null,
      default_weight: item.default_weight ?? null,
      notes: item.notes ?? null,
      exercise_reference_id: idsByName.get(item.name) ?? null,
    }));
    for (const row of rows) await templateExercisesRepo.create(userId, row);
  }

  if (segmentItems.length > 0) {
    // Résolution groupée par discipline (un item = une seule discipline,
    // mais un modèle peut mélanger plusieurs disciplines de bloc).
    const byDiscipline = new Map<DisciplineId, string[]>();
    for (const { item } of segmentItems) {
      const list = byDiscipline.get(item.discipline) ?? [];
      list.push(item.label);
      byDiscipline.set(item.discipline, list);
    }
    const idsByDiscipline = new Map<DisciplineId, Map<string, string | null>>();
    for (const [discipline, labels] of byDiscipline) {
      idsByDiscipline.set(discipline, await resolveExerciseIdsByLabel(discipline, labels));
    }
    const rows: TemplateSegmentInsert[] = segmentItems.map(({ item, position }) => ({
      template_id: templateId,
      position,
      label: item.label,
      discipline: item.discipline,
      metric_key: item.metricKey ?? null,
      metrics: item.metrics ?? {},
      exercise_reference_id: idsByDiscipline.get(item.discipline)?.get(item.label) ?? null,
    }));
    for (const row of rows) await templateSegmentsRepo.create(userId, row);
  }
}

export function useCreateWorkoutTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      icon: string;
      color: string;
      items: TemplateItemInput[];
    }) => {
      if (!user) throw new Error("Non authentifié");
      if (!input.name.trim()) throw new Error("Le modèle doit avoir un nom");

      const template = await templatesRepo.create(user.id, {
        name: input.name.trim(),
        icon: input.icon,
        color: input.color,
        source_document_id: null,
      });

      await replaceTemplateItems(template.id, user.id, input.items);
      return template.id;
    },
    onSuccess: () => {
      toast.success("Modèle créé");
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateWorkoutTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name: string;
      icon: string;
      color: string;
      items: TemplateItemInput[];
    }) => {
      if (!user) throw new Error("Non authentifié");
      if (!input.name.trim()) throw new Error("Le modèle doit avoir un nom");

      await templatesRepo.update(input.id, user.id, {
        name: input.name.trim(),
        icon: input.icon,
        color: input.color,
      });

      await replaceTemplateItems(input.id, user.id, input.items);
    },
    onSuccess: () => {
      toast.success("Modèle mis à jour");
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteWorkoutTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (templateId: string) => {
      if (!user) throw new Error("Non authentifié");
      // Cascade locale des exercices/blocs — le serveur le fait déjà via
      // ON DELETE CASCADE (même pattern que useRecipes.useDeleteRecipe /
      // use-fitness.cascadeDeleteWorkoutChildren).
      const existingExercises = (await templateExercisesRepo.list(user.id)).filter(
        (e) => e.template_id === templateId,
      );
      for (const e of existingExercises) await templateExercisesRepo.remove(e.id, user.id);
      const existingSegments = (await templateSegmentsRepo.list(user.id)).filter(
        (s) => s.template_id === templateId,
      );
      for (const s of existingSegments) await templateSegmentsRepo.remove(s.id, user.id);
      await templatesRepo.remove(templateId, user.id);
    },
    onSuccess: () => {
      toast.success("Modèle supprimé");
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDuplicateWorkoutTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (source: WorkoutTemplateRow) => {
      if (!user) throw new Error("Non authentifié");

      const copy = await templatesRepo.create(user.id, {
        name: `${source.name} (copie)`,
        icon: source.icon,
        color: source.color,
        source_document_id: null,
      });

      await replaceTemplateItems(copy.id, user.id, orderedTemplateItems(source));
      return copy.id;
    },
    onSuccess: () => {
      toast.success("Modèle dupliqué");
      qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Démarre une séance ACTIVE depuis un modèle : structure complète reprise
 * (exercices, ordre, supersets, notes, paramètres par défaut). Offline-first
 * dès lors que le modèle est déjà synchronisé localement : réutilise
 * workoutsRepo/exercisesRepo/exerciseSetsRepo/workoutSegmentsRepo
 * (use-fitness.ts, même garantie "une seule séance active" — voir
 * assertNoActiveWorkout). Les blocs métriques du modèle (`workout_segments`)
 * sont désormais offline-first eux aussi (voir doc en tête de fichier).
 */
export function useStartWorkoutFromSavedTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (template: WorkoutTemplateRow) => {
      if (!user) throw new Error("Non authentifié");

      // Garde : une seule séance active à la fois (même convention que
      // useStartWorkoutFromTemplate / "Refaire en live").
      const localWorkouts = await workoutsRepo.list(user.id);
      if (localWorkouts.some((w) => w.status === "active")) {
        throw new Error(ACTIVE_WORKOUT_CONFLICT_MESSAGE);
      }

      const today = localDateYMD();
      const workout = await workoutsRepo.create(user.id, {
        name: template.name,
        date: today,
        gym_location: "Salle inconnue",
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

      const orderedExercises = [...template.exercises].sort((a, b) => a.position - b.position);
      if (orderedExercises.length > 0) {
        const exerciseIdsByName = await resolveExerciseIdsByLabel(
          "muscu",
          orderedExercises.map((e) => e.name),
        );
        for (const e of orderedExercises) {
          const createdEx = await exercisesRepo.create(user.id, {
            workout_id: workout.id,
            name: e.name,
            notes: e.notes,
            superset_group: e.superset_group,
            sets: null,
            reps: null,
            weight: null,
            image_path: null,
            exercise_reference_id: exerciseIdsByName.get(e.name) ?? null,
            position: e.position,
            muscle_groups: null,
          });
          // Séries non validées, pré-remplies avec les valeurs par défaut
          // du modèle (placeholders) — l'utilisateur les ajuste.
          const count = Math.max(1, e.default_sets ?? 1);
          for (let j = 0; j < count; j++) {
            await exerciseSetsRepo.create(user.id, {
              exercise_id: createdEx.id,
              set_number: j + 1,
              reps: e.default_reps,
              weight: e.default_weight,
              completed: false,
              rest_seconds: null,
              notes: null,
              tempo: null,
            });
          }
        }
      }

      // Musculation hybride (2026-08-19) — blocs métriques du modèle,
      // offline-first via workoutSegmentsRepo (audit offline 28/08/2026).
      const orderedSegments = [...template.segments].sort((a, b) => a.position - b.position);
      if (orderedSegments.length > 0) {
        const byDiscipline = new Map<DisciplineId, string[]>();
        for (const s of orderedSegments) {
          const discipline = s.discipline ?? "autre";
          const list = byDiscipline.get(discipline) ?? [];
          list.push(s.label);
          byDiscipline.set(discipline, list);
        }
        const idsByDisciplineAndLabel = new Map<DisciplineId, Map<string, string | null>>();
        for (const [discipline, labels] of byDiscipline) {
          idsByDisciplineAndLabel.set(
            discipline,
            await resolveExerciseIdsByLabel(discipline, labels),
          );
        }
        let segPosition = 0;
        for (const s of orderedSegments) {
          const discipline = s.discipline ?? "autre";
          await workoutSegmentsRepo.create(user.id, {
            workout_id: workout.id,
            position: segPosition++,
            label: s.label,
            metric_key: s.metric_key,
            metrics: s.metrics,
            completed: false,
            discipline,
            exercise_id: idsByDisciplineAndLabel.get(discipline)?.get(s.label) ?? null,
          });
        }
      }

      return workout.id;
    },
    onSuccess: () => {
      toast.success("Séance démarrée depuis le modèle 💪");
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
      qc.invalidateQueries({ queryKey: HYBRID_BLOCKS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
