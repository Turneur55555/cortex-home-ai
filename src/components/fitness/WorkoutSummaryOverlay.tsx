import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import type { ActiveWorkout } from "@/hooks/use-fitness";
import { estimate1RM, workoutTonnage, formatTonnage } from "@/lib/fitness/strength";
// Addendum 3 (2026-07-15, audit convergence UX) : Confetti + la tuile de stats
// de cet écran sont désormais partagées avec GenericWorkoutSummaryOverlay (5
// autres disciplines), pour que la clôture de séance soit VISUELLEMENT
// identique partout — seul le contenu des tuiles (1RM/tonnage ici, métrique
// phare ailleurs) reste propre à chaque moteur. Voir WorkoutCelebration.tsx.
import { Confetti, SummaryStatTile as StatTile } from "./session/WorkoutCelebration";

// ── Main overlay ──────────────────────────────────────────────────────────────

export function WorkoutSummaryOverlay({
  workout,
  onConfirm,
  onCancel,
  isPending,
}: {
  workout: ActiveWorkout;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const durationMin = Math.max(
    1,
    Math.round((Date.now() - new Date(workout.created_at).getTime()) / 60_000),
  );

  const allSets = (workout.exercises ?? []).flatMap((ex) => ex.exercise_sets ?? []);
  const completedSets = allSets.filter((s) => s.completed).length;
  const tonnage = workoutTonnage(workout.exercises ?? []);

  const top1RM = useMemo(() => {
    let best: { name: string; value: number } | null = null;
    for (const ex of workout.exercises ?? []) {
      for (const s of ex.exercise_sets ?? []) {
        const e = estimate1RM(s.weight, s.reps);
        if (e != null && e > (best?.value ?? 0)) best = { name: ex.name, value: e };
      }
    }
    return best;
  }, [workout]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-safe-or-6">
      <Confetti />

      <div className="w-full max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300 rounded-3xl border border-white/8 bg-card shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)] p-6">
        {/* Header */}
        <div className="text-center">
          <div className="text-5xl">💪</div>
          <h2 className="mt-3 text-xl font-bold tracking-tight">Séance terminée !</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{workout.name}</p>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <StatTile label="Durée" value={`${durationMin} min`} />
          <StatTile
            label="Séries"
            value={`${completedSets}`}
            sub={allSets.length > completedSets ? `${allSets.length - completedSets} non validées` : "toutes validées"}
          />
          <StatTile label="Tonnage" value={formatTonnage(tonnage)} />
          {top1RM ? (
            <StatTile
              label="Meilleur 1RM"
              value={`${Math.round(top1RM.value)} kg`}
              sub={top1RM.name}
            />
          ) : (
            <StatTile label="Exercices" value={`${(workout.exercises ?? []).length}`} />
          )}
        </div>

        {/* CTAs */}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Continuer
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 rounded-xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              "Clore 🏆"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
