import { useMemo, useState, useCallback } from "react";
import { Dumbbell, Loader2, Sparkles, AlertCircle } from "lucide-react";
import { BodyMap } from "@/components/fitness/BodyMap";
import { WorkoutCard, type WorkoutRow } from "@/components/fitness/WorkoutCard";
import { WorkoutSheet } from "@/components/fitness/WorkoutSheet";
import { WorkoutProgressCharts } from "@/components/fitness/WorkoutProgressCharts";
import { StartWorkoutSheet } from "@/components/fitness/StartWorkoutSheet";
import { ActiveWorkoutView } from "@/components/fitness/ActiveWorkoutView";
import {
  useExerciseImageUrls,
  useWorkouts,
  useActiveWorkout,
} from "@/hooks/use-fitness";
import { useRecoveryMap } from "@/hooks/useRecoveryMap";
import { useFitnessStreak } from "@/hooks/useFitnessStreak";
import { FabAdd } from "@/components/shared/FormComponents";
import { formatTonnage, workoutTonnage } from "@/lib/fitness/strength";
import { CoachSheet, type WorkoutTemplate } from "./CoachSheet";
import { computePRs } from "@/utils/fitness/exercise-stats";

export function SeancesTab() {
  // === Données ===
  const { data, isLoading, error } = useWorkouts();
  const { data: activeWorkout, isLoading: activeLoading } = useActiveWorkout();
  const recoveryMap = useRecoveryMap(data);
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
  const [startOpen, setStartOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachInitialMuscles, setCoachInitialMuscles] = useState<string[] | undefined>(undefined);

  // === Calculs ===
  const { prByName, histByName, volByName, prByGym, histByGym, topExercises } = useMemo(
    () => computePRs(data ?? []),
    [data],
  );

  const allImagePaths = useMemo(
    () => (data ?? []).flatMap((w) => (w.exercises ?? []).map((ex) => ex.image_path)),
    [data],
  );
  const { data: listImageUrls } = useExerciseImageUrls(allImagePaths);
  const latestDate = useMemo(() => data?.[0]?.date ?? "", [data]);

  // === Callbacks ===
  const openFromTemplate = useCallback((w: WorkoutRow) => {
    if (!w.id || !w.exercises) return;
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

  // Chargement initial combiné
  if (activeLoading && isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── VUE SÉANCE ACTIVE ──────────────────────────────────────────────────────
  // Quand une séance est en cours, on masque tout l'historique.
  if (activeWorkout) {
    return (
      <section className="flex flex-col gap-4">
        <ActiveWorkoutView workout={activeWorkout} />
      </section>
    );
  }

  // ── VUE HISTORIQUE ─────────────────────────────────────────────────────────
  return (
    <section className="flex flex-col gap-4">
      {data && <BodyMap mode="recovery" recoveryMap={recoveryMap} />}

      {/* Coach IA */}
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

      {/* KPIs */}
      {data && data.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <KpiTile label="Streak" value={`${streak.current}`} sub={`sem. ≥ ${streak.threshold}/sem`} />
          <KpiTile
            label="Cette semaine"
            value={`${streak.thisWeekCount}`}
            sub={
              streak.thisWeekCount >= streak.threshold
                ? "Objectif ✓"
                : `${streak.threshold - streak.thisWeekCount} restantes`
            }
          />
          <KpiTile label="Tonnage 7j" value={formatTonnage(weekTonnage)} sub="volume total" />
        </div>
      )}

      {/* Erreur */}
      {error && !isLoading && (
        <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
            <div>
              <h3 className="font-semibold text-destructive">Erreur de chargement</h3>
              <p className="mt-1 text-sm text-destructive/80">
                {error instanceof Error ? error.message : "Une erreur est survenue"}
              </p>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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

      {/* Liste séances historiques — WorkoutCard gère sa propre suppression */}
      {data && data.length > 0 && !isLoading && (
        <ul className="space-y-3">
          {data.map((w) => (
            <WorkoutCard
              key={w.id}
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
          ))}
        </ul>
      )}

      {/* FAB → démarre une séance live */}
      <FabAdd onClick={() => setStartOpen(true)} label="Nouvelle séance" />

      {startOpen && <StartWorkoutSheet onClose={() => setStartOpen(false)} />}

      {/* WorkoutSheet = seulement pour "Refaire" / Coach */}
      {open && (
        <WorkoutSheet
          template={template}
          priorPRs={prByName}
          onClose={() => { setOpen(false); setTemplate(null); }}
        />
      )}

      {coachOpen && (
        <CoachSheet
          onClose={() => setCoachOpen(false)}
          onResult={handleCoachResult}
          initialMuscles={coachInitialMuscles}
        />
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
