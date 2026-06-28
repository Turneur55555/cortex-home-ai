import { useMemo, useState } from "react";
import { CheckCircle2, Flame, Loader2, MoreVertical, Plus, XCircle } from "lucide-react";
import type { ActiveWorkout } from "@/hooks/use-fitness";
import {
  useAddExerciseToActiveWorkout,
  useCancelWorkout,
  useExerciseImageUrls,
  useFinishWorkout,
  useWorkouts,
} from "@/hooks/use-fitness";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import type { MuscleRecovery } from "@/lib/fitness/recovery";
import { useFitnessStreak } from "@/hooks/useFitnessStreak";
import { WorkoutTimer } from "./WorkoutTimer";
import { WorkoutSummaryOverlay } from "./WorkoutSummaryOverlay";
import { ActiveExerciseCard } from "./ActiveExerciseCard";
import { exerciseIllustration } from "@/lib/fitness/exerciseIllustrations";
import { computePRs } from "@/utils/fitness/exercise-stats";
import {
  ExercisePickerSheet,
  type PickedExercise,
  type RecentExercise,
} from "./ExercisePickerSheet";
import { normalize } from "@/lib/fitness/exerciseCatalog";
import { useLastExerciseSessions } from "@/hooks/useLastExerciseSession";
import { RestTimerBar } from "./RestTimerBar";
import { ExerciseStatsSheet } from "./ExerciseStatsSheet";

// ─── Main view ───────────────────────────────────────────────────────────────

export function ActiveWorkoutView({
  workout,
  recoveryMap,
}: {
  workout: ActiveWorkout;
  recoveryMap?: Map<MuscleId, MuscleRecovery>;
}) {
  const finish = useFinishWorkout();
  const cancel = useCancelWorkout();
  const addExercise = useAddExerciseToActiveWorkout();
  const { data: allWorkouts } = useWorkouts();

  const streak = useFitnessStreak(allWorkouts);

  const [menuOpen, setMenuOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // PRs from history (excluding the active workout itself)
  const { prByName, histByName, volByName } = useMemo(
    () => computePRs((allWorkouts ?? []).filter((w) => w.id !== workout.id)),
    [allWorkouts, workout.id],
  );

  // Dernières séances de TOUS les exercices (groupé : fin du N+1).
  const lastSessions = useLastExerciseSessions(
    (workout.exercises ?? []).map((e) => e.name),
    workout.id,
  );

  // Fiche détaillée d'un exercice (au tap sur la carte)
  const [statsTarget, setStatsTarget] = useState<
    { key: string; name: string; imageUrl: string | null } | null
  >(null);

  // Image URLs for all exercises in this workout
  const allImagePaths = (workout.exercises ?? []).map((ex) => ex.image_path);
  const { data: imageUrls } = useExerciseImageUrls(allImagePaths);

  // Recent exercises for picker
  const recentExercises = useMemo<RecentExercise[]>(() => {
    if (!allWorkouts) return [];
    const seen = new Map<string, RecentExercise>();
    for (const w of allWorkouts) {
      for (const ex of w.exercises ?? []) {
        if (!ex.name.trim()) continue;
        const key = normalize(ex.name);
        if (!seen.has(key)) {
          seen.set(key, {
            name: ex.name,
            lastSets: ex.sets ?? null,
            lastReps: ex.reps ?? null,
            lastWeight: ex.weight ?? null,
          });
        }
      }
    }
    return Array.from(seen.values()).slice(0, 30);
  }, [allWorkouts]);

  const handlePickExercise = async (picked: PickedExercise) => {
    setPickerOpen(false);
    await addExercise.mutateAsync({
      workoutId: workout.id,
      name: picked.name,
    });
  };

  const handleFinish = async () => {
    setShowSummary(false);
    await finish.mutateAsync(workout);
  };

  const handleCancel = async () => {
    setConfirmCancel(false);
    await cancel.mutateAsync(workout.id);
  };

  const totalSeries = (workout.exercises ?? []).reduce(
    (acc, ex) => acc + (ex.exercise_sets?.length ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header card ── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/12 to-transparent"
        />

        <div className="relative px-5 pt-5 pb-4">
          {/* Top row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {/* Live pulse */}
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-green-400">
                  Séance en cours
                </span>
                {/* Streak badge motivationnel */}
                {streak.current > 0 && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-400">
                    <Flame className="h-3 w-3" />
                    {streak.current} sem.
                  </span>
                )}
              </div>
              <h2 className="mt-1 text-xl font-bold leading-tight tracking-tight">
                {workout.name}
              </h2>
              {workout.gym_location && workout.gym_location !== "Salle inconnue" && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {workout.gym_location}
                </p>
              )}
            </div>

            {/* Timer + menu */}
            <div className="flex shrink-0 items-center gap-2">
              <WorkoutTimer createdAt={workout.created_at} />
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90"
                aria-label="Menu séance"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Stats mini */}
          <div className="mt-3 flex gap-3 text-[11px] text-muted-foreground">
            <span>
              <strong className="text-foreground">{(workout.exercises ?? []).length}</strong>{" "}
              exercice{(workout.exercises ?? []).length > 1 ? "s" : ""}
            </span>
            <span>·</span>
            <span>
              <strong className="text-foreground">{totalSeries}</strong>{" "}
              série{totalSeries > 1 ? "s" : ""}
            </span>
          </div>

          {/* Dropdown menu */}
          {menuOpen && (
            <div
              className="absolute right-4 top-14 z-20 min-w-[180px] overflow-hidden rounded-2xl border border-border bg-card shadow-elevated"
              onBlur={() => setMenuOpen(false)}
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setShowSummary(true);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-primary/10"
              >
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                Terminer la séance
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmCancel(true);
                }}
                className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <XCircle className="h-4 w-4" />
                Annuler la séance
              </button>
            </div>
          )}
        </div>

        {/* Primary CTA */}
        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={() => setShowSummary(true)}
            disabled={finish.isPending}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
          >
            {finish.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Terminer la séance
          </button>
        </div>
      </div>

      {/* ── Résumé post-séance ── */}
      {showSummary && (
        <WorkoutSummaryOverlay
          workout={workout}
          onConfirm={handleFinish}
          onCancel={() => setShowSummary(false)}
          isPending={finish.isPending}
        />
      )}

      {/* ── Confirm cancel ── */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg">
            <h3 className="text-lg font-bold text-destructive">Annuler la séance ?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Toutes les données seront perdues. Cette action est irréversible.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium"
              >
                Garder
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Exercise cards ── */}
      {(workout.exercises ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Aucun exercice — ajoutez-en un ci-dessous
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(workout.exercises ?? []).map((ex) => {
            const exImage =
              (ex.image_path ? imageUrls?.get(ex.image_path) : null) ??
              exerciseIllustration(ex.name);
            return (
              <ActiveExerciseCard
                key={ex.id}
                exercise={ex}
                imageUrl={exImage}
                lastSession={lastSessions.get(normalize(ex.name)) ?? null}
                pr={prByName.get(normalize(ex.name)) ?? null}
                recoveryMap={recoveryMap}
                onOpenStats={() =>
                  setStatsTarget({
                    key: normalize(ex.name),
                    name: ex.name,
                    imageUrl: exImage,
                  })
                }
              />
            );
          })}
        </div>
      )}

      {/* ── Add exercise ── */}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={addExercise.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-4 text-sm font-semibold text-primary transition-all active:scale-[0.99] hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
      >
        {addExercise.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        Ajouter un exercice
      </button>

      {/* Exercise picker */}
      {pickerOpen && (
        <ExercisePickerSheet
          recentExercises={recentExercises}
          onSelect={handlePickExercise}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* Fiche détaillée exercice */}
      {statsTarget && (
        <ExerciseStatsSheet
          exerciseName={statsTarget.name}
          weightHistory={histByName.get(statsTarget.key) ?? []}
          volumeHistory={volByName.get(statsTarget.key) ?? []}
          pr={prByName.get(statsTarget.key)}
          imageUrl={statsTarget.imageUrl}
          onClose={() => setStatsTarget(null)}
        />
      )}

      {/* Floating rest timer (above bottom nav) */}
      <RestTimerBar />
    </div>
  );
}
