import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { localDateYMD } from "@/lib/dates";
import type { TablesInsert } from "@/integrations/supabase/types";

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
// ============================================================

const TEMPLATES_KEY = ["workout_templates"];
const ACTIVE_KEY = ["active_workout"];

export interface WorkoutTemplateExerciseRow {
  id: string;
  name: string;
  position: number;
  superset_group: number | null;
  default_sets: number | null;
  default_reps: number | null;
  default_weight: number | null;
  notes: string | null;
}

export interface WorkoutTemplateRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  created_at: string;
  updated_at: string;
  exercises: WorkoutTemplateExerciseRow[];
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

export function useWorkoutTemplates() {
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: async (): Promise<WorkoutTemplateRow[]> => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select(
          "id, name, icon, color, created_at, updated_at, workout_template_exercises(id, name, position, superset_group, default_sets, default_reps, default_weight, notes)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        icon: t.icon,
        color: t.color,
        created_at: t.created_at,
        updated_at: t.updated_at,
        exercises: [...(t.workout_template_exercises ?? [])].sort(
          (a, b) => a.position - b.position,
        ),
      }));
    },
  });
}

async function replaceTemplateExercises(
  templateId: string,
  userId: string,
  exercises: TemplateExerciseInput[],
) {
  const { error: delErr } = await supabase
    .from("workout_template_exercises")
    .delete()
    .eq("template_id", templateId);
  if (delErr) throw delErr;

  if (exercises.length === 0) return;
  const rows: TablesInsert<"workout_template_exercises">[] = exercises.map((e, i) => ({
    template_id: templateId,
    user_id: userId,
    name: e.name,
    position: i,
    superset_group: e.superset_group ?? null,
    default_sets: e.default_sets ?? null,
    default_reps: e.default_reps ?? null,
    default_weight: e.default_weight ?? null,
    notes: e.notes ?? null,
  }));
  const { error: insErr } = await supabase.from("workout_template_exercises").insert(rows);
  if (insErr) throw insErr;
}

export function useCreateWorkoutTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      icon: string;
      color: string;
      exercises: TemplateExerciseInput[];
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

      await replaceTemplateExercises(template.id, user.id, input.exercises);
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
      exercises: TemplateExerciseInput[];
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

      await replaceTemplateExercises(input.id, user.id, input.exercises);
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

      await replaceTemplateExercises(
        copy.id,
        user.id,
        source.exercises.map((e) => ({
          name: e.name,
          superset_group: e.superset_group,
          default_sets: e.default_sets,
          default_reps: e.default_reps,
          default_weight: e.default_weight,
          notes: e.notes,
        })),
      );
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
      if (existing) throw new Error("Une séance est déjà en cours.");

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
      if (error) throw error;

      const orderedExercises = [...template.exercises].sort((a, b) => a.position - b.position);
      if (orderedExercises.length === 0) return workout.id;

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

      return workout.id;
    },
    onSuccess: () => {
      toast.success("Séance démarrée depuis le modèle 💪");
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
