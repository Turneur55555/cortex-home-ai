// ============================================================
// Résumé de clôture de séance — pendant générique de WorkoutSummaryOverlay
// (musculation) pour les 5 autres disciplines. Addendum 3 (2026-07-15,
// audit convergence UX) : avant ce composant, ActiveGenericSessionView
// clôturait une séance avec un simple "Terminer la séance ? X/Y réalisé(s)"
// (aucune tuile, aucune animation) puis un toast — le plus gros écart de
// "finition perçue" trouvé dans l'audit. Même écran que muscu (confetti,
// tuiles, CTA "Clore"), seul le contenu des tuiles change : la discipline
// fournit ses données (segments/metrics déjà déclarés), ce composant ne
// connaît AUCUN vocabulaire propre à une discipline particulière.
// ============================================================

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import type { ActiveGenericWorkout } from "@/hooks/useGenericActiveSession";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import {
  bestMetricValue,
  groupByExerciseLabel,
  primaryColumnsForInstances,
} from "@/lib/fitness/segmentStats";
import { Confetti, SummaryStatTile as StatTile } from "./WorkoutCelebration";

export function GenericWorkoutSummaryOverlay({
  workout,
  onConfirm,
  onCancel,
  isPending,
}: {
  workout: ActiveGenericWorkout;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const durationMin = Math.max(
    1,
    Math.round((Date.now() - new Date(workout.created_at).getTime()) / 60_000),
  );

  const groups = useMemo(() => groupByExerciseLabel(workout.segments), [workout.segments]);
  const completedCount = workout.segments.filter((s) => s.completed).length;

  // Métrique phare : la 1re colonne "primary" présente, meilleure valeur
  // toutes répétitions confondues — même mécanisme que l'historique
  // (bestMetricValue, addendum 2), pas une nouvelle logique.
  const topMetric = useMemo(() => {
    const numericInstances = workout.segments.map((s) => ({
      metrics: Object.fromEntries(
        Object.entries(s.metrics).filter((e): e is [string, number] => typeof e[1] === "number"),
      ),
    }));
    const columns = primaryColumnsForInstances(numericInstances);
    if (columns.length === 0) return null;
    const best = bestMetricValue(numericInstances, columns[0].key);
    return best ? { label: columns[0].label, formatted: best.formatted } : null;
  }, [workout.segments]);

  const engineLabel = ENGINE_REGISTRY[workout.discipline]?.label ?? workout.discipline;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-safe-or-6">
      <Confetti />

      <div className="w-full max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300 rounded-3xl border border-white/8 bg-card shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)] p-6">
        <div className="text-center">
          <div className="text-5xl">💪</div>
          <h2 className="mt-3 text-xl font-bold tracking-tight">Séance terminée !</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{workout.name}</p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <StatTile label="Durée" value={`${durationMin} min`} />
          <StatTile
            label="Réalisé"
            value={`${completedCount}`}
            sub={
              workout.segments.length > completedCount
                ? `${workout.segments.length - completedCount} non validé(s)`
                : "tout validé"
            }
          />
          <StatTile label="Exercices" value={`${groups.length}`} />
          {topMetric ? (
            <StatTile label={topMetric.label} value={topMetric.formatted} sub="meilleure valeur" />
          ) : (
            <StatTile label="Discipline" value={engineLabel} />
          )}
        </div>

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
            {isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Clore 🏆"}
          </button>
        </div>
      </div>
    </div>
  );
}
