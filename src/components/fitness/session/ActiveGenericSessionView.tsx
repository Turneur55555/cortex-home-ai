// ============================================================
// Vue "séance en cours" GÉNÉRIQUE — pendant de ActiveWorkoutView
// (musculation) pour toute discipline Sensei avec supportsLiveTracking=true.
// Timer, liste d'exercices (regroupés par type — voir groupByExerciseLabel,
// segmentStats.ts) avec leurs répétitions éditables, ajout d'exercice via
// picker, menu Terminer/Annuler — même charte visuelle que la séance
// active musculation, sans dépendre de son vocabulaire exercices/séries.
//
// Phase B (2026-07-15, retour de Nathan — voir
// docs/architecture/phase-b-carte-exercice-unique.md) : la carte exercice
// (ActiveExerciseCard, kind="generic") est désormais le MÊME composant de
// haut niveau que la musculation — plus de ActiveCourseExerciseCard
// séparé. L'ajout d'exercice ouvre le même picker (récents/catalogue/
// recherche/création libre) que la musculation et crée immédiatement une
// carte vide — plus de formulaire Distance/Allure codé en dur.
// ============================================================

import { useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Flame, Loader2, MoreVertical, XCircle } from "lucide-react";
import type { ActiveGenericWorkout } from "@/hooks/useGenericActiveSession";
import {
  useAddGenericSegment,
  useCancelGenericActiveWorkout,
  useFinishGenericActiveWorkout,
} from "@/hooks/useGenericActiveSession";
import { useRecentSegmentLabels } from "@/hooks/useRecentSegmentLabels";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import { groupByExerciseLabel } from "@/lib/fitness/segmentStats";
import { WorkoutTimer } from "../WorkoutTimer";
import { ActiveExerciseCard } from "../exerciseCard/ActiveExerciseCard";
import { AddExerciseButton } from "../exerciseCard/ExerciseCardPrimitives";
import { ExercisePickerSheet, type PickedExercise } from "../ExercisePickerSheet";
import { SegmentAnalysisSheet } from "./SegmentAnalysisSheet";
import { DisciplineIcon } from "./DisciplineIcon";
// Addendum 3 (2026-07-15) : résumé de clôture générique (confetti + tuiles),
// remplace le confirm() nu qui laissait cette séance sans aucune célébration
// contrairement à la musculation (WorkoutSummaryOverlay) — voir doc §8.5.
import { GenericWorkoutSummaryOverlay } from "./GenericWorkoutSummaryOverlay";
import { useFitnessStreak } from "@/hooks/useFitnessStreak";
import { useWorkouts } from "@/hooks/use-fitness";
import { DisciplineExerciseLibrarySheet } from "../DisciplineExerciseLibrarySheet";

export function ActiveGenericSessionView({
  workout,
  onFinished,
}: {
  workout: ActiveGenericWorkout;
  onFinished: () => void;
}) {
  const entry = ENGINE_REGISTRY[workout.discipline];

  const addSegment = useAddGenericSegment();
  const finish = useFinishGenericActiveWorkout();
  const cancel = useCancelGenericActiveWorkout();
  const { data: recentLabels } = useRecentSegmentLabels(workout.discipline);
  // Addendum 3 (2026-07-15) : streak déjà 100% générique (useFitnessStreak ne
  // regarde que `date`, toutes disciplines confondues) — simplement jamais
  // affiché ici jusqu'à présent, contrairement à ActiveWorkoutView (muscu).
  const { data: allWorkouts } = useWorkouts();
  const streak = useFitnessStreak(allWorkouts);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [statsLabel, setStatsLabel] = useState<string | null>(null);

  const sortedSegments = useMemo(
    () => [...workout.segments].sort((a, b) => a.position - b.position),
    [workout.segments],
  );
  const completedCount = sortedSegments.filter((s) => s.completed).length;
  const groups = useMemo(() => groupByExerciseLabel(sortedSegments), [sortedSegments]);

  const recentExercises = useMemo(
    () =>
      (recentLabels ?? []).map((name) => ({
        name,
        lastSets: null,
        lastReps: null,
        lastWeight: null,
      })),
    [recentLabels],
  );

  const handlePickExercise = async (picked: PickedExercise) => {
    setPickerOpen(false);
    const label = picked.name.trim();
    if (!label) return;
    await addSegment.mutateAsync({
      workoutId: workout.id,
      label,
      metrics: {},
      position: sortedSegments.length,
      discipline: workout.discipline,
    });
  };

  const handleFinish = async () => {
    setConfirmFinish(false);
    await finish.mutateAsync(workout);
    onFinished();
  };

  const handleCancel = async () => {
    setConfirmCancel(false);
    await cancel.mutateAsync(workout.id);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header card ── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-primary/12 to-transparent"
        />
        <div className="relative px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-400" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-green-400">
                  Séance en cours
                </span>
                {entry && (
                  <DisciplineIcon icon={entry.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                {/* Addendum 3 : streak déjà générique, alignée sur ActiveWorkoutView (muscu). */}
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
            </div>
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

          <div className="mt-3 flex gap-3 text-[11px] text-muted-foreground">
            <span>
              <strong className="text-foreground">{groups.length}</strong> exercice
              {groups.length > 1 ? "s" : ""}
            </span>
            <span>·</span>
            <span>
              <strong className="text-foreground">{completedCount}</strong> réalisé
              {completedCount > 1 ? "s" : ""}
            </span>
          </div>

          {menuOpen && (
            <div className="absolute right-4 top-14 z-20 min-w-[180px] overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmFinish(true);
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

        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={() => setConfirmFinish(true)}
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

      {/* ── Résumé de clôture (Addendum 3) — remplace l'ancien confirm() nu,
          même écran (confetti + tuiles) que WorkoutSummaryOverlay (muscu). ── */}
      {confirmFinish && (
        <GenericWorkoutSummaryOverlay
          workout={workout}
          onConfirm={handleFinish}
          onCancel={() => setConfirmFinish(false)}
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

      {/* ── Cartes exercice (une par type de segment, répétitions groupées) ── */}
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Aucun exercice — ajoutez-en un ci-dessous
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <ActiveExerciseCard
              kind="generic"
              key={g.key}
              group={g}
              workoutId={workout.id}
              discipline={workout.discipline}
              nextPosition={sortedSegments.length}
              onOpenStats={setStatsLabel}
            />
          ))}
        </div>
      )}

      {/* ── Ajouter un exercice — même picker (récents/catalogue/recherche/
          création libre) que la musculation, création immédiate d'une
          carte vide, aucun formulaire séparé (Phase B). Bouton bibliothèque
          (Addendum 3) : même capacité que le bouton Catalogue de
          ActiveWorkoutView (muscu) — consultation de référence, pas un
          chemin d'ajout (DisciplineExerciseLibrarySheet est déjà 100%
          générique et déjà utilisée ailleurs, simplement pas câblée ici). ── */}
      <div className="flex gap-2">
        <AddExerciseButton onClick={() => setPickerOpen(true)} disabled={addSegment.isPending} />
        <button
          type="button"
          onClick={() => setCatalogOpen(true)}
          aria-label="Ouvrir la bibliothèque d'exercices"
          className="flex shrink-0 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 text-primary transition-all active:scale-[0.99] hover:border-primary/40 hover:bg-primary/5"
        >
          <BookOpen className="h-4 w-4" />
        </button>
      </div>

      {pickerOpen && (
        <ExercisePickerSheet
          discipline={workout.discipline}
          recentExercises={recentExercises}
          onSelect={handlePickExercise}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {catalogOpen && (
        <DisciplineExerciseLibrarySheet
          discipline={workout.discipline}
          onClose={() => setCatalogOpen(false)}
        />
      )}

      {statsLabel && (
        // Phase C, lot V1 (P0-1) : sans `discipline`, la fiche retombait sur
        // sa valeur par défaut "course" et lisait le mauvais historique pour
        // toute séance active Cardio/HYROX/Guidé/Autre ("Pas encore réalisé"
        // mensonger sur un exercice pratiqué). Même transmission que
        // GenericHistoryExerciseList/DisciplineExerciseLibrarySheet.
        <SegmentAnalysisSheet
          rawLabel={statsLabel}
          discipline={workout.discipline}
          onClose={() => setStatsLabel(null)}
        />
      )}
    </div>
  );
}
