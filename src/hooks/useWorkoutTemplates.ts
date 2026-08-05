import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/db";
import { localDateYMD } from "@/lib/dates";

import { resolveExerciseIdsByLabel } from "@/services/exerciseResolution";
import type { DisciplineId } from "@/lib/fitness/engines/types";
import { HYBRID_BLOCKS_KEY } from "@/hooks/useGenericActiveSession";
import { orderedTemplateItems as orderedTemplateItemsPure } from "@/lib/fitness/workoutTemplates";
import {
  ACTIVE_WORKOUT_CONFLICT_MESSAGE,
  isActiveWorkoutConflict,
} from "@/lib/fitness/activeWorkoutGuard";

// ============================================================
// Modèles de séance ("Utiliser une séance sauvegardée") — module Nouvelle
// séance / Choisir une épreuve. SANS LIEN avec Sensei (moteur d'IA, voir
// src/lib/fitness/engines/) : un modèle est uniquement une structure de
// séance réutilisable (exercices, ordre, supersets, notes, paramètres par
// défaut) pour démarrer rapidement. Distinct de useStartWorkoutFromTemplate
// (use-fitness.ts) qui est "Refaire en live" — rejoue une séance PASSÉE par
// son id, pas un modèle nommé par l'utilisateur.
//
// Démarrer depuis un modèle insère des `exercises` par NOM, exactement comme
// l'ajout manuel (useAddExerciseToActiveWorkout) — toute l'intelligence déjà
// présente (reprise des charges précédentes, charge suggérée, PR,
// recommandations) est keyée par nom normalisé et s'applique donc
// automatiquement, sans aucun câblage supplémentaire ici.
//
// Étape 4.5 (2026-07-12) — gap identifié lors de l'audit architectural :
// ce chemin n'appelait jusqu'ici aucune résolution `exercise_reference_id`,
// contrairement aux 6 autres chemins d'écriture muscu déjà câblés
// (Étape 2b/Étape 4 centralisation useAddWorkout). Corrigé en réutilisant
// `resolveExerciseIdsByLabel` (désormais centralisé dans
// services/exerciseResolution.ts, partagé avec use-fitness.ts).
// ============================================================

const TEMPLATES_KEY = ["fitness", "workout_templates"];
const ACTIVE_KEY = ["fitness", "active_workout"];

export interface WorkoutTemplateExerciseRow {
  id: string;
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
  position: number;
  label: string;
  discipline: DisciplineId | null;
  metric_key: string | null;
  metrics: Record<string, number | string>;
  exercise_reference_id: string | null;
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

/** Formes de lignes locales : `workout_template_segments` et la colonne
 *  `exercise_reference_id` existent en base (projet bcwfvpwxzlmkxobvbtzp) mais
 *  pas encore dans `types.ts` (généré, jamais édité à la main). Ces types
 *  restaurent la vérification statique en attendant `npm run gen:types`. */
interface TemplateQueryRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
  workout_template_exercises: WorkoutTemplateExerciseRow[] | null;
  workout_template_segments:
    | (Omit<WorkoutTemplateSegmentRow, "metrics" | "discipline"> & {
        discipline: string | null;
        metrics: Record<string, number | string> | null;
      })[]
    | null;
}

interface TemplateExerciseInsert {
  template_id: string;
  user_id: string;
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
  user_id: string;
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

export function useWorkoutTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: async (): Promise<WorkoutTemplateRow[]> => {
      // `db` : `workout_template_segments` / colonne `exercise_reference_id`
      // existent en base (bcwfvpwxzlmkxobvbtzp) mais pas encore dans types.ts.
      const { data, error } = await db
        .from("workout_templates")
        .select(
          "id, name, icon, color, created_at, updated_at, workout_template_exercises(id, name, position, superset_group, default_sets, default_reps, default_weight, notes, exercise_reference_id), workout_template_segments(id, position, label, discipline, metric_key, metrics, exercise_reference_id)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      const templates = (data ?? []) as TemplateQueryRow[];
      return templates.map((t) => ({
        id: t.id,
        name: t.name,
        icon: t.icon,
        color: t.color,
        created_at: t.created_at,
        updated_at: t.updated_at,
        exercises: [...(t.workout_template_exercises ?? [])].sort(
          (a, b) => a.position - b.position,
        ),
        segments: [...(t.workout_template_segments ?? [])]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            id: s.id,
            position: s.position,
            label: s.label,
            discipline: (s.discipline as DisciplineId | null) ?? null,
            metric_key: s.metric_key,
            metrics: (s.metrics ?? {}) as Record<string, number | string>,
            exercise_reference_id: s.exercise_reference_id,
          })),
      }));

    },
  });
}

/** Musculation hybride (2026-08-19) — remplace intégralement le contenu
 *  (exercices + blocs) d'un modèle depuis une liste ORDONNÉE unique, en
 *  éclatant vers les deux tables tout en préservant `position` = index dans
 *  `items` (voir TemplateItemInput). Un template force-only (aucun item
 *  `kind: "segment"`) produit exactement les mêmes lignes qu'avant cette
 *  évolution — `workout_template_segments` reste vide, comportement
 *  identique. Résolution Exercise-Central non bloquante (même pattern que
 *  tout autre chemin d'écriture, voir services/exerciseResolution.ts). */
async function replaceTemplateItems(
  templateId: string,
  userId: string,
  items: TemplateItemInput[],
) {
  const { error: delExErr } = await supabase
    .from("workout_template_exercises")
    .delete()
    .eq("template_id", templateId);
  if (delExErr) throw delExErr;
  const { error: delSegErr } = await db
    .from("workout_template_segments")
    .delete()
    .eq("template_id", templateId);
  if (delSegErr) throw delSegErr;

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
    const rows: TemplateExerciseInsert[] = exerciseItems.map(
      ({ item, position }) => ({
        template_id: templateId,
        user_id: userId,
        name: item.name,
        position,
        superset_group: item.superset_group ?? null,
        default_sets: item.default_sets ?? null,
        default_reps: item.default_reps ?? null,
        default_weight: item.default_weight ?? null,
        notes: item.notes ?? null,
        exercise_reference_id: idsByName.get(item.name) ?? null,
      }),
    );
    const { error: insExErr } = await supabase.from("workout_template_exercises").insert(rows);
    if (insExErr) throw insExErr;
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
    const rows: TemplateSegmentInsert[] = segmentItems.map(
      ({ item, position }) => ({
        template_id: templateId,
        user_id: userId,
        position,
        label: item.label,
        discipline: item.discipline,
        metric_key: item.metricKey ?? null,
        metrics: item.metrics ?? {},
        exercise_reference_id: idsByDiscipline.get(item.discipline)?.get(item.label) ?? null,
      }),
    );
    const { error: insSegErr } = await db.from("workout_template_segments").insert(rows);
    if (insSegErr) throw insSegErr;
  }
}

export function useCreateWorkoutTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      icon: string;
      color: string;
      items: TemplateItemInput[];
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      if (!input.name.trim()) throw new Error("Le modèle doit avoir un nom");

      const { data: template, error } = await supabase
        .from("workout_templates")
        .insert({ user_id: user.id, name: input.name.trim(), icon: input.icon, color: input.color })
        .select("id")
        .single();
      if (error) throw error;

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
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name: string;
      icon: string;
      color: string;
      items: TemplateItemInput[];
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      if (!input.name.trim()) throw new Error("Le modèle doit avoir un nom");

      const { error } = await supabase
        .from("workout_templates")
        .update({
          name: input.name.trim(),
          icon: input.icon,
          color: input.color,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;

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
  return useMutation({
    mutationFn: async (templateId: string) => {
      // Exercices supprimés par cascade FK (ON DELETE CASCADE).
      const { error } = await supabase.from("workout_templates").delete().eq("id", templateId);
      if (error) throw error;
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
  return useMutation({
    mutationFn: async (source: WorkoutTemplateRow) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const { data: copy, error } = await supabase
        .from("workout_templates")
        .insert({
          user_id: user.id,
          name: `${source.name} (copie)`,
          icon: source.icon,
          color: source.color,
        })
        .select("id")
        .single();
      if (error) throw error;

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
 * (exercices, ordre, supersets, notes, paramètres par défaut). Les
 * paramètres par défaut ne sont que des PLACEHOLDERS de départ — exactement
 * comme un exercice ajouté manuellement à une séance, ActiveExerciseCard
 * calcule ensuite ses propres suggestions (charges précédentes, charge
 * suggérée, PR) depuis l'historique réel keyé par nom, indépendamment de la
 * provenance de l'exercice. Le modèle ne remplace jamais ce calcul.
 */
export function useStartWorkoutFromSavedTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: WorkoutTemplateRow) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      // Garde : une seule séance active à la fois (même convention que
      // useStartWorkoutFromTemplate / "Refaire en live").
      const { data: existing } = await supabase
        .from("workouts")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (existing) throw new Error(ACTIVE_WORKOUT_CONFLICT_MESSAGE);

      const today = localDateYMD();
      const { data: workout, error } = await supabase
        .from("workouts")
        .insert({
          user_id: user.id,
          name: template.name,
          date: today,
          gym_location: "Salle inconnue",
          status: "active",
        })
        .select("id")
        .single();
      if (error) {
        if (isActiveWorkoutConflict(error)) throw new Error(ACTIVE_WORKOUT_CONFLICT_MESSAGE);
        throw error;
      }

      const orderedExercises = [...template.exercises].sort((a, b) => a.position - b.position);
      if (orderedExercises.length > 0) {
        const exerciseIdsByName = await resolveExerciseIdsByLabel(
          "muscu",
          orderedExercises.map((e) => e.name),
        );
        const { data: insertedExs, error: exErr } = await supabase
          .from("exercises")
          .insert(
            orderedExercises.map((e) => ({
              user_id: user.id,
              workout_id: workout.id,
              name: e.name,
              notes: e.notes,
              superset_group: e.superset_group,
              sets: null,
              reps: null,
              weight: null,
              exercise_reference_id: exerciseIdsByName.get(e.name) ?? null,
            })),
          )
          .select("id");
        if (exErr) throw exErr;

        // Séries non validées, pré-remplies avec les valeurs par défaut du
        // modèle (placeholders) — l'utilisateur les ajuste, et la suggestion
        // intelligente (basée sur l'historique réel de l'exercice) reste
        // affichée à côté exactement comme pour un ajout manuel.
        const setRows = orderedExercises.flatMap((e, i) => {
          const exerciseId = insertedExs?.[i]?.id;
          if (!exerciseId) return [];
          const count = Math.max(1, e.default_sets ?? 1);
          return Array.from({ length: count }, (_, j) => ({
            exercise_id: exerciseId,
            user_id: user.id,
            set_number: j + 1,
            reps: e.default_reps,
            weight: e.default_weight,
            completed: false,
          }));
        });
        if (setRows.length > 0) {
          const { error: setErr } = await supabase.from("exercise_sets").insert(setRows);
          if (setErr) throw setErr;
        }
      }

      // Musculation hybride (2026-08-19) — blocs métriques du modèle,
      // seedés en workout_segments SOUS LEUR PROPRE discipline (jamais
      // "muscu", jamais exercises/exercise_sets) — même mécanisme que
      // useStartHybridStrengthWorkout (use-fitness.ts) et l'ajout manuel de
      // bloc en séance active (ActiveWorkoutView). Un template force-only
      // (segments vides) ne change rien ici.
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
        const { error: segErr } = await supabase.from("workout_segments").insert(
          orderedSegments.map((s, i) => {
            const discipline = s.discipline ?? "autre";
            return {
              workout_id: workout.id,
              user_id: user.id,
              position: i,
              label: s.label,
              metric_key: s.metric_key,
              metrics: s.metrics as never,
              completed: false,
              discipline,
              exercise_id: idsByDisciplineAndLabel.get(discipline)?.get(s.label) ?? null,
            };
          }),
        );
        if (segErr) throw segErr;
      }

      return workout.id;
    },
    onSuccess: () => {
      toast.success("Séance démarrée depuis le modèle 💪");
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
      // Blocs lus par ActiveWorkoutView via useActiveWorkoutSegments
      // (HYBRID_BLOCKS_KEY, Part 1) — invalider pour ne jamais afficher un
      // état périmé d'une précédente séance hybride.
      qc.invalidateQueries({ queryKey: HYBRID_BLOCKS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
