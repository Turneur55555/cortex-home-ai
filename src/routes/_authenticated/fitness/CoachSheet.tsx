import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";

export type WorkoutTemplate = {
  name: string;
  exercises: Array<{
    name: string;
    sets: string;
    reps: string;
    weight: string;
    image_path: string | null;
  }>;
};

export const MUSCLE_OPTIONS = [
  { id: "pectoraux", label: "Pectoraux" },
  { id: "dos", label: "Dos" },
  { id: "epaules", label: "Épaules" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "jambes", label: "Jambes" },
  { id: "fessiers", label: "Fessiers" },
  { id: "abdos", label: "Abdos" },
  { id: "cardio", label: "Cardio" },
];

export function normalizeMuscleId(label: string): string | null {
  const norm = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
  const match = MUSCLE_OPTIONS.find((m) => m.id === norm);
  return match ? match.id : null;
}

export function CoachSheet({
  onClose,
  onResult,
  initialMuscles,
}: {
  onClose: () => void;
  onResult: (tpl: WorkoutTemplate) => void;
  initialMuscles?: string[];
}) {
  const [muscles, setMuscles] = useState<string[]>(
    initialMuscles && initialMuscles.length > 0 ? initialMuscles : ["pectoraux"],
  );
  const [duration, setDuration] = useState("45");
  const [equipment, setEquipment] = useState("salle complète");
  const [level, setLevel] = useState("intermédiaire");
  const [goal, setGoal] = useState("hypertrophie");

  const toggleMuscle = (id: string) =>
    setMuscles((arr) => (arr.includes(id) ? arr.filter((m) => m !== id) : [...arr, id]));

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("coach-workout", {
        body: {
          muscles: muscles.map((m) => MUSCLE_OPTIONS.find((o) => o.id === m)?.label ?? m),
          duration_minutes: Number(duration) || 45,
          equipment,
          level,
          goal,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as {
        name: string;
        exercises: Array<{ name: string; sets: number; reps: number; weight?: number }>;
      };
    },
    onSuccess: (data) => {
      const tpl: WorkoutTemplate = {
        name: data.name,
        exercises: data.exercises.map((ex) => ({
          name: ex.name,
          sets: String(ex.sets ?? ""),
          reps: String(ex.reps ?? ""),
          weight: ex.weight != null && ex.weight > 0 ? String(ex.weight) : "",
          image_path: null,
        })),
      };
      toast.success("Séance générée — ajuste-la avant d'enregistrer");
      onResult(tpl);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (muscles.length === 0) {
      toast.error("Sélectionne au moins un groupe musculaire");
      return;
    }
    generate.mutate();
  };

  return (
    <Sheet title="Coach IA — Génère ma séance" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Groupes musculaires
          </label>
          <div className="flex flex-wrap gap-2">
            {MUSCLE_OPTIONS.map((m) => {
              const active = muscles.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMuscle(m.id)}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all " +
                    (active
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground")
                  }
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Durée (min)" type="number" value={duration} onChange={setDuration} />
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Niveau
            </label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="débutant">Débutant</option>
              <option value="intermédiaire">Intermédiaire</option>
              <option value="avancé">Avancé</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Matériel
            </label>
            <select
              value={equipment}
              onChange={(e) => setEquipment(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="salle complète">Salle complète</option>
              <option value="haltères + banc">Haltères + banc</option>
              <option value="élastiques">Élastiques</option>
              <option value="poids du corps">Poids du corps</option>
              <option value="kettlebell">Kettlebell</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Objectif
            </label>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="hypertrophie">Hypertrophie</option>
              <option value="force">Force</option>
              <option value="endurance">Endurance</option>
              <option value="perte de gras">Perte de gras</option>
            </select>
          </div>
        </div>

        <SubmitButton pending={generate.isPending}>
          {generate.isPending ? "Génération…" : "Générer la séance"}
        </SubmitButton>
      </form>
    </Sheet>
  );
}
