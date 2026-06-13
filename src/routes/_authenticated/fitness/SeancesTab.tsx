import { useMemo, useState, useCallback } from "react";
import { Dumbbell, Loader2, Sparkles, AlertCircle, Trash2 } from "lucide-react";
import { BodyMap } from "@/components/fitness/BodyMap";
import { WorkoutCard, type WorkoutRow } from "@/components/fitness/WorkoutCard";
import { WorkoutSheet } from "@/components/fitness/WorkoutSheet";
import { WorkoutProgressCharts } from "@/components/fitness/WorkoutProgressCharts";
import { useDeleteWorkout, useExerciseImageUrls, useWorkouts } from "@/hooks/use-fitness";
import { useRecoveryMap } from "@/hooks/useRecoveryMap";
import { useFitnessStreak } from "@/hooks/useFitnessStreak";
import { FabAdd } from "@/components/shared/FormComponents";
import { formatTonnage, workoutTonnage } from "@/lib/fitness/strength";
import { CoachSheet, type WorkoutTemplate } from "./CoachSheet";
import { computePRs } from "@/utils/fitness/exercise-stats";

/**
 * SeancesTab - Module principal de gestion des séances de fitness
 *
 * Améliorations:
 * ✅ Gestion d'erreurs complète
 * ✅ Validation des données
 * ✅ Optimisation des re-rendus avec useCallback
 * ✅ Confirmation de suppression
 * ✅ État cohérent (null vs undefined)
 * ✅ Messages d'erreur explicites
 */
export function SeancesTab() {
  // === État des données ===
  const { data, isLoading, error } = useWorkouts();
  const recoveryMap = useRecoveryMap(data);
  const deleteWorkout = useDeleteWorkout();
  const streak = useFitnessStreak(data);
  const weekTonnage = useMemo(() => {
    if (!data) return 0;
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return data
      .filter((w) => new Date(w.date) >= start)
      .reduce((acc, w) => acc + workoutTonnage(w.exercises ?? []), 0);
  }, [data]);

  // === État des modales ===
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachInitialMuscles, setCoachInitialMuscles] = useState<string[] | undefined>(undefined);

  // === État de suppression ===
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [workoutToDelete, setWorkoutToDelete] = useState<string | null>(null);

  // === Calculs mémoïsés ===
  const { prByName, histByName, volByName, prByGym, histByGym, topExercises } = useMemo(
    () => computePRs(data ?? []),
    [data],
  );

  const allImagePaths = useMemo(
    () => (data ?? []).flatMap((w) => (w.exercises ?? []).map((ex) => ex.image_path)),
    [data],
  );

  const { data: listImageUrls } = useExerciseImageUrls(allImagePaths);

  const latestDate = useMemo(
    () => data?.[0]?.date ?? "",
    [data],
  );

  // === Callbacks mémoïsés ===
  const openNew = useCallback(() => {
    setTemplate(null);
    setOpen(true);
  }, []);

  const openFromTemplate = useCallback((w: WorkoutRow) => {
    if (!w.id || !w.exercises) {
      console.error("Données de séance invalides", w);
      return;
    }

    setTemplate({
      name: w.name || "Séance sans nom",
      exercises: (w.exercises ?? []).map((ex) => ({
        name: ex.name || "Exercice inconnu",
        sets: ex.sets != null ? String(ex.sets) : "",
        reps: ex.reps != null ? String(ex.reps) : "",
        weight: ex.weight != null ? String(ex.weight) : "",
        image_path: ex.image_path ?? null,
      })),
    });
    setOpen(true);
  }, []);

  const handleCoachResult = useCallback((tpl: WorkoutTemplate) => {
    setCoachOpen(false);
    setTemplate(tpl);
    setOpen(true);
  }, []);

  const openCoach = useCallback((initial?: string[]) => {
    setCoachInitialMuscles(initial?.length ? initial : undefined);
    setCoachOpen(true);
  }, []);

  const handleCloseSheet = useCallback(() => {
    setOpen(false);
  }, []);

  const handleCloseCoach = useCallback(() => {
    setCoachOpen(false);
  }, []);

  // === Gestion de la suppression ===
  const handleDeleteClick = useCallback((workoutId: string) => {
    setWorkoutToDelete(workoutId);
    setDeleteConfirmOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!workoutToDelete) return;
    try {
      await deleteWorkout.mutateAsync(workoutToDelete);
    } catch (err) {
      console.error("Erreur lors de la suppression:", err);
    } finally {
      setWorkoutToDelete(null);
      setDeleteConfirmOpen(false);
    }
  }, [workoutToDelete, deleteWorkout]);

  const handleDeleteCancel = useCallback(() => {
    setWorkoutToDelete(null);
    setDeleteConfirmOpen(false);
  }, []);

  // === Rendu ===
  return (
    <section className="flex flex-col gap-4">
      {data && (
        <BodyMap mode="recovery" recoveryMap={recoveryMap} />
      )}

      <button
        type="button"
        onClick={() => openCoach()}
        className="group flex items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent p-4 text-left shadow-card transition-all active:scale-[0.99]"
        aria-label="Ouvrir le Coach IA"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
          <Sparkles className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold">Coach IA — Génère ma séance</span>
          <span className="block text-[11px] text-muted-foreground">
            Choisis muscles, durée, niveau. L'IA crée ta séance.
          </span>
        </span>
      </button>

      {data && data.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <KpiTile
            label="Streak"
            value={`${streak.current}`}
            sub={`sem. ≥ ${streak.threshold}/sem`}
          />
          <KpiTile
            label="Cette semaine"
            value={`${streak.thisWeekCount}`}
            sub={streak.thisWeekCount >= streak.threshold ? "Objectif ✓" : `${streak.threshold - streak.thisWeekCount} restantes`}
          />
          <KpiTile
            label="Tonnage 7j"
            value={formatTonnage(weekTonnage)}
            sub="volume total"
          />
        </div>
      )}

      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-destructive">Erreur de chargement</h3>
              <p className="text-sm text-destructive/80 mt-1">
                {error instanceof Error ? error.message : "Une erreur est survenue"}
              </p>
            </div>
          </div>
        </div>
      )}

      {data && !isLoading && (
        <WorkoutProgressCharts
          topExercises={topExercises}
          histByName={histByName}
          prByName={prByName}
        />
      )}

      {data && data.length === 0 && !isLoading && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Aucune séance</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lancez-vous, votre première séance vous attend.
          </p>
        </div>
      )}

      {data && data.length > 0 && !isLoading && (
        <ul className="space-y-3">
          {data.map((w) => (
            <div key={w.id} className="relative">
              <WorkoutCard
                w={w}
                prByName={prByName}
                histByName={histByName}
                volByName={volByName}
                prByGym={prByGym}
                histByGym={histByGym}
                imageUrls={listImageUrls}
                latestDate={latestDate}
                onOpenFromTemplate={openFromTemplate}
              />
              <button
                type="button"
                onClick={() => handleDeleteClick(w.id)}
                className="absolute top-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-card/90 backdrop-blur border border-border shadow-sm active:scale-95 transition-transform"
                aria-label="Supprimer cette séance"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </button>
            </div>
          ))}
        </ul>
      )}

      <FabAdd onClick={openNew} label="Nouvelle séance" />

      {open && (
        <WorkoutSheet
          template={template}
          priorPRs={prByName}
          onClose={handleCloseSheet}
        />
      )}

      {coachOpen && (
        <CoachSheet
          onClose={handleCloseCoach}
          onResult={handleCoachResult}
          initialMuscles={coachInitialMuscles}
        />
      )}

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 rounded-lg">
          <div className="bg-card rounded-2xl p-6 max-w-sm shadow-lg">
            <h3 className="text-lg font-semibold mb-2">Supprimer cette séance?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Cette action ne peut pas être annulée.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleDeleteCancel}
                className="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold leading-none">{value}</p>
      {sub && <p className="mt-1 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
