import { useMemo, useRef, useState } from "react";
import { BookOpen, CheckCircle2, Loader2, MoreVertical, XCircle } from "lucide-react";
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
import { WorkoutTimer } from "./WorkoutTimer";
import { ActiveExerciseCard } from "./exerciseCard/ActiveExerciseCard";
import { AddExerciseButton } from "./exerciseCard/ExerciseCardPrimitives";
import { exerciseIllustration } from "@/lib/fitness/exerciseIllustrations";
import { computePRs, computeRanksByName } from "@/utils/fitness/exercise-stats";
import { ExercisePickerSheet, type PickedExercise } from "./ExercisePickerSheet";
import { computeRecentExercises, identityKey } from "@/lib/fitness/recentExercises";
import { useLastExerciseSessions } from "@/hooks/useLastExerciseSession";
import { ExerciseSheet } from "./ExerciseSheet";
import { Portal } from "@/components/Portal";
import { useUserExercisePhotos, resolveCustomExerciseMuscles } from "@/hooks/useUserExercisePhotos";
import { useExerciseCatalogMedia } from "@/hooks/useExerciseCatalogEntry";
import { useBodyMeasurements } from "@/hooks/useBodyTracking";

const DEFAULT_BODYWEIGHT_KG = 75;

// ─── Main view ───────────────────────────────────────────────────────────────

export function ActiveWorkoutView({
  workout,
  recoveryMap,
  onFinished,
  onOpenCatalog,
}: {
  workout: ActiveWorkout;
  recoveryMap?: Map<MuscleId, MuscleRecovery>;
  /** C2 : remonte le snapshot au parent — la fiche d'analyse IA doit survivre
   *  au démontage de cette vue (déclenché par le refetch post-clôture). */
  onFinished: (finished: ActiveWorkout) => void;
  /** Ouvre le Catalogue d'exercices (bibliothèque de référence) — optionnel,
   *  fourni par SeancesTab pour le rendre accessible même en séance active. */
  onOpenCatalog?: () => void;
}) {
  const finish = useFinishWorkout();
  const cancel = useCancelWorkout();
  const addExercise = useAddExerciseToActiveWorkout();
  const { data: allWorkouts } = useWorkouts();

  const { data: userPhotos } = useUserExercisePhotos();

  // Carte de séance V3 (2026-07-29) — deux requêtes batchées (une pour
  // toute la bibliothèque/l'utilisateur, jamais une par carte) : médias du
  // dataset (photo/GIF, seule information "catalogue" encore affichée sur
  // la carte — le reste vit exclusivement dans la fiche détaillée) et poids
  // de corps pour le rang RPG. Le rang lui-même est calculé en mémoire à
  // partir de `allWorkouts` (déjà chargé), voir computeRanksByName.
  const { data: catalogMedia } = useExerciseCatalogMedia();
  const { data: measurements } = useBodyMeasurements();

  // Menu "..." — le bandeau a `backdrop-blur-xl` + `overflow-hidden`, ce qui
  // fait de lui le containing block de tout descendant `position: fixed`
  // (spec CSS Filter Effects) : un menu fixed à l'intérieur serait rogné au
  // cadre du bandeau. Portal (voir Portal.tsx) fait sortir le menu de cet
  // arbre ; sa position est mesurée depuis le bouton pour rester ancrée.
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const toggleMenu = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuAnchor({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setMenuOpen(true);
  };

  // PRs from history (excluding the active workout itself)
  const { prByName, histByName, volByName } = useMemo(
    () => computePRs((allWorkouts ?? []).filter((w) => w.id !== workout.id)),
    [allWorkouts, workout.id],
  );

  const bodyweightKg = measurements?.find((m) => m.weight != null)?.weight ?? DEFAULT_BODYWEIGHT_KG;
  const ranksByName = useMemo(
    () => computeRanksByName(allWorkouts, bodyweightKg),
    [allWorkouts, bodyweightKg],
  );

  // Dernières séances de TOUS les exercices (groupé : fin du N+1).
  // Étape 4.5 : identité (exercise_reference_id) transmise en plus du nom,
  // pour une correspondance par id en priorité côté hook.
  const lastSessions = useLastExerciseSessions(
    (workout.exercises ?? []).map((e) => ({
      name: e.name,
      exerciseReferenceId: e.exercise_reference_id,
    })),
    workout.id,
  );

  // Fiche détaillée d'un exercice (au tap sur la carte)
  const [statsTarget, setStatsTarget] = useState<{
    key: string;
    name: string;
    imageUrl: string | null;
  } | null>(null);

  // Image URLs for all exercises in this workout
  const allImagePaths = (workout.exercises ?? []).map((ex) => ex.image_path);
  const { data: imageUrls } = useExerciseImageUrls(allImagePaths);

  // Recent exercises for picker
  const recentExercises = useMemo(() => computeRecentExercises(allWorkouts), [allWorkouts]);

  const handlePickExercise = async (picked: PickedExercise) => {
    setPickerOpen(false);
    await addExercise.mutateAsync({
      workoutId: workout.id,
      name: picked.name,
    });
  };

  const handleFinish = async () => {
    // Capture snapshot before invalidation
    const snapshot = workout;
    await finish.mutateAsync(workout);
    // Analyse muscles des exercices personnalisés en arrière-plan (silent)
    const toResolve = (snapshot.exercises ?? []).map((ex) => ({
      id: ex.id,
      name: ex.name,
      muscle_groups: null as string[] | null,
    }));
    resolveCustomExerciseMuscles(toResolve).catch(() => {});
    // C2 : l'analyse IA est affichée par SeancesTab (survit au démontage).
    onFinished(snapshot);
  };

  const handleCancel = async () => {
    setConfirmCancel(false);
    await cancel.mutateAsync(workout.id);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Bandeau de séance — V2 (2026-07-29) : ~45% plus bas qu'avant.
          Uniquement statut, nom, timer, bouton Terminer, menu — les
          cartes d'exercices doivent commencer beaucoup plus haut. ── */}
      <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 shadow-[0_6px_24px_-14px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="relative flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-green-400">
                Séance en cours
              </span>
            </div>
            <h2 className="mt-0.5 truncate text-[15px] font-bold leading-tight tracking-tight">
              {workout.name}
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <WorkoutTimer createdAt={workout.created_at} />
            <button
              type="button"
              onClick={handleFinish}
              disabled={finish.isPending}
              className="flex h-8 items-center gap-1.5 rounded-full bg-gradient-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
            >
              {finish.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Terminer
            </button>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={toggleMenu}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90"
              aria-label="Menu séance"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {menuOpen && menuAnchor && (
        <Portal>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div
            className="fixed z-50 min-w-[180px] overflow-hidden rounded-2xl border border-border bg-card shadow-elevated animate-in fade-in zoom-in-95 duration-150"
            style={{ top: menuAnchor.top, right: menuAnchor.right }}
          >
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setConfirmCancel(true);
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <XCircle className="h-4 w-4" />
              Annuler la séance
            </button>
          </div>
        </Portal>
      )}

      {/* ── Confirm cancel ── */}
      {confirmCancel && (
        <Portal>
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
        </Portal>
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
              userPhotos?.get(identityKey(ex)) ??
              exerciseIllustration(ex.name);
            const datasetEntry = ex.exercise_reference_id
              ? catalogMedia?.get(ex.exercise_reference_id)
              : undefined;
            return (
              <ActiveExerciseCard
                kind="muscu"
                key={ex.id}
                exercise={ex}
                imageUrl={exImage}
                datasetPhotoUrl={datasetEntry?.primaryPhotoUrl ?? null}
                datasetGifUrl={datasetEntry?.primaryGifUrl ?? null}
                rank={ranksByName.get(identityKey(ex)) ?? null}
                lastSession={lastSessions.get(identityKey(ex)) ?? null}
                pr={prByName.get(identityKey(ex)) ?? null}
                recoveryMap={recoveryMap}
                onOpenStats={() =>
                  setStatsTarget({
                    key: identityKey(ex),
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
      <div className="flex gap-2">
        <AddExerciseButton onClick={() => setPickerOpen(true)} disabled={addExercise.isPending} />
        {onOpenCatalog && (
          <button
            type="button"
            onClick={onOpenCatalog}
            aria-label="Ouvrir le catalogue d'exercices"
            className="flex shrink-0 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 text-primary transition-all active:scale-[0.99] hover:border-primary/40 hover:bg-primary/5"
          >
            <BookOpen className="h-4 w-4" />
          </button>
        )}
      </div>

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
        <ExerciseSheet
          exerciseName={statsTarget.name}
          weightHistory={histByName.get(statsTarget.key) ?? []}
          volumeHistory={volByName.get(statsTarget.key) ?? []}
          pr={prByName.get(statsTarget.key)}
          imageUrl={statsTarget.imageUrl}
          onClose={() => setStatsTarget(null)}
        />
      )}
    </div>
  );
}
