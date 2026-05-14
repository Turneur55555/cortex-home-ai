import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { Dumbbell, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import { MUSCLE_META, type MuscleId } from "@/lib/fitness/muscleMapping";

export type WorkoutTemplate = {
  name: string;
  exercises: Array<{
    name: string;
    sets: string;
    reps: string;
    weight: string;
    image_path: string | null;
  }>;
  notes?: string;
};

// ─── Muscle option types ──────────────────────────────────────────────────────

type MuscleDomainOption = { id: MuscleId; label: string };
type MuscleAliasOption  = { id: "jambes"; label: string; isAlias: true;  resolves: MuscleId[] };
type MuscleCardioOption = { id: "cardio"; label: string; isCardio: true };
type MuscleOption = MuscleDomainOption | MuscleAliasOption | MuscleCardioOption;

// Only the major groups shown in the coach UI — not all 14 MUSCLE_META entries.
// Labels are sourced from MUSCLE_META so they stay in sync with the domain.
export const MUSCLE_OPTIONS: MuscleOption[] = [
  { id: "pectoraux", label: MUSCLE_META.pectoraux.label },
  { id: "dos",       label: MUSCLE_META.dos.label },
  { id: "epaules",   label: MUSCLE_META.epaules.label },
  { id: "biceps",    label: MUSCLE_META.biceps.label },
  { id: "triceps",   label: MUSCLE_META.triceps.label },
  { id: "fessiers",  label: MUSCLE_META.fessiers.label },
  { id: "abdos",     label: MUSCLE_META.abdos.label },
  { id: "jambes",  label: "Jambes",  isAlias: true, resolves: ["quadriceps", "ischio", "fessiers"] },
  { id: "cardio",  label: "Cardio",  isCardio: true },
];

// Resolves UI selections → domain MuscleId[] (cardio bypassed, aliases expanded)
function resolveMuscleSlugs(selected: string[]): MuscleId[] {
  return selected.flatMap((id) => {
    const opt = MUSCLE_OPTIONS.find((o) => o.id === id);
    if (!opt) return [];
    if ("isCardio" in opt) return [];
    if ("isAlias"  in opt) return opt.resolves;
    return [opt.id];
  });
}

function hasCardio(selected: string[]): boolean {
  return selected.some((id) => {
    const opt = MUSCLE_OPTIONS.find((o) => o.id === id);
    return opt != null && "isCardio" in opt;
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

type Mode = "muscu" | "autre";

const ACTIVITY_SUGGESTIONS = [
  "Pilates Lagree",
  "Natation",
  "Yoga",
  "Course à pied",
  "Vélo",
  "Boxe",
  "CrossFit",
  "HIIT",
  "Escalade",
  "Danse",
];

export function CoachSheet({
  onClose,
  onResult,
  initialMuscles,
}: {
  onClose: () => void;
  onResult: (tpl: WorkoutTemplate) => void;
  initialMuscles?: string[];
}) {
  const [mode, setMode] = useState<Mode>("muscu");
  const [muscles, setMuscles] = useState<string[]>(
    initialMuscles && initialMuscles.length > 0 ? initialMuscles : ["pectoraux"],
  );
  const [duration, setDuration] = useState("45");
  const [equipment, setEquipment] = useState("salle complète");
  const [level, setLevel] = useState("intermédiaire");
  const [goal, setGoal] = useState("hypertrophie");

  const [activity, setActivity] = useState("");
  const [intensity, setIntensity] = useState("modérée");

  const toggleMuscle = (id: string) =>
    setMuscles((arr) => (arr.includes(id) ? arr.filter((m) => m !== id) : [...arr, id]));

  const generate = useMutation({
    mutationFn: async () => {
      const payload =
        mode === "muscu"
          ? {
              mode: "muscu",
              muscles: resolveMuscleSlugs(muscles).map((id) => MUSCLE_META[id].label),
              has_cardio: hasCardio(muscles),
              duration_minutes: Number(duration) || 45,
              equipment,
              level,
              goal,
            }
          : {
              mode: "autre",
              activity: activity.trim(),
              duration_minutes: Number(duration) || 45,
              level,
              intensity,
            };

      const { data, error } = await supabase.functions.invoke("coach-workout", { body: payload });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as {
        name: string;
        notes?: string;
        muscles_worked?: string[];
        exercises: Array<{ name: string; sets: number; reps: number; weight?: number }>;
      };
    },
    onSuccess: (data) => {
      const musclesLine =
        data.muscles_worked && data.muscles_worked.length > 0
          ? `Muscles sollicités : ${data.muscles_worked.join(", ")}.`
          : "";
      const notes = [musclesLine, data.notes].filter(Boolean).join("\n").trim();

      const tpl: WorkoutTemplate = {
        name: data.name,
        notes: notes || undefined,
        exercises: (data.exercises ?? []).map((ex) => ({
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
    if (mode === "muscu" && muscles.length === 0) {
      toast.error("Sélectionne au moins un groupe musculaire");
      return;
    }
    if (mode === "autre" && activity.trim().length < 2) {
      toast.error("Décris l'activité (ex: Pilates Lagree, natation…)");
      return;
    }
    generate.mutate();
  };

  return (
    <Sheet title="Coach IA — Génère ma séance" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface p-1">
          <button
            type="button"
            onClick={() => setMode("muscu")}
            className={
              "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all " +
              (mode === "muscu"
                ? "bg-gradient-primary text-primary-foreground shadow-glow"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            <Dumbbell className="h-3.5 w-3.5" />
            Musculation
          </button>
          <button
            type="button"
            onClick={() => setMode("autre")}
            className={
              "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all " +
              (mode === "autre"
                ? "bg-gradient-primary text-primary-foreground shadow-glow"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            <Sparkles className="h-3.5 w-3.5" />
            Autre activité
          </button>
        </div>

        {mode === "muscu" ? (
          <>
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
                  <option value="haltères">Haltères + banc</option>
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
                  <option value="perte de poids">Perte de gras</option>
                </select>
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quelle activité ?
              </label>
              <input
                type="text"
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                placeholder="Ex: Pilates Lagree, natation crawl, yoga vinyasa…"
                maxLength={120}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ACTIVITY_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setActivity(s)}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                L'IA structurera la séance et déduira les muscles sollicités.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
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
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Intensité
                </label>
                <select
                  value={intensity}
                  onChange={(e) => setIntensity(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
                >
                  <option value="légère">Légère</option>
                  <option value="modérée">Modérée</option>
                  <option value="intense">Intense</option>
                </select>
              </div>
            </div>
          </>
        )}

        <SubmitButton pending={generate.isPending}>
          {generate.isPending ? "Génération…" : "Générer la séance"}
        </SubmitButton>
      </form>
    </Sheet>
  );
}
