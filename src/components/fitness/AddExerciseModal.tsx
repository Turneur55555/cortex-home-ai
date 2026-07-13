import { type FormEvent, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useWorkouts, useAddExerciseToWorkout } from "@/hooks/use-fitness";
import { computeRecentExercises } from "@/lib/fitness/recentExercises";
import {
  ExercisePickerSheet,
  type PickedExercise,
  type RecentExercise,
} from "./ExercisePickerSheet";

export function AddExerciseModal({
  workoutId,
  onClose,
}: {
  workoutId: string;
  onClose: () => void;
}) {
  const { data: workouts } = useWorkouts();
  const addEx = useAddExerciseToWorkout();
  const [step, setStep] = useState<"pick" | "fill">("pick");
  const [picked, setPicked] = useState<PickedExercise | null>(null);
  const [form, setForm] = useState({ sets: "", reps: "", weight: "" });

  // Etape 4.6c (2026-07-13) : reutilise la logique partagee
  // computeRecentExercises (identite par exercise_reference_id en
  // priorite, repli nom documente) au lieu d'un dedoublonnage local par
  // normalize(name) - meme fonction que ActiveWorkoutView/TemplateEditorSheet,
  // evite une 2e implementation divergente de "exercices recents".
  const recentExercises = useMemo<RecentExercise[]>(
    () => computeRecentExercises(workouts, 25),
    [workouts],
  );

  const handlePick = (ex: PickedExercise) => {
    setPicked(ex);
    setForm({ sets: ex.sets, reps: ex.reps, weight: ex.weight });
    setStep("fill");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!picked) return;
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    await addEx.mutateAsync({
      workoutId,
      exercise: {
        name: picked.name,
        sets: num(form.sets),
        reps: num(form.reps),
        weight: num(form.weight),
      },
    });
    onClose();
  };

  if (step === "pick") {
    return (
      <ExercisePickerSheet
        recentExercises={recentExercises}
        onSelect={handlePick}
        onClose={onClose}
      />
    );
  }

  const inputCls =
    "w-full rounded-xl border border-border bg-surface px-2 py-3 text-center text-sm font-medium outline-none focus:border-primary";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <form
        className="relative w-full max-w-[430px] rounded-t-3xl border-t border-border bg-card p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="mb-4 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">Ajouter à la séance</p>
            <h3 className="text-base font-bold leading-tight">{picked?.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted-foreground"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-3">
          {(
            [
              { key: "sets", label: "Séries" },
              { key: "reps", label: "Reps" },
              { key: "weight", label: "Poids (kg)", step: "0.5" },
            ] as const
          ).map((item) => {
            const { key, label } = item;
            const step = "step" in item ? item.step : undefined;
            return (
              <div key={key} className="flex flex-col gap-1.5">
                <label className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step={step}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder="—"
                  className={inputCls}
                />
              </div>
            );
          })}
        </div>

        <button
          type="submit"
          disabled={addEx.isPending}
          className="mb-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
        >
          {addEx.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Ajouter l'exercice
        </button>

        <button
          type="button"
          onClick={() => setStep("pick")}
          className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          ← Changer d'exercice
        </button>
      </form>
    </div>
  );
}
