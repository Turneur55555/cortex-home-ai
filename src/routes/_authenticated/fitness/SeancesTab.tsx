import { useMemo, useState, useCallback } from "react";
import {
  BookOpen,
  Dumbbell,
  Loader2,
  Sparkles,
  AlertCircle,
  ChevronDown,
  CalendarDays,
  History,
  Repeat,
} from "lucide-react";
import { BodyMap } from "@/components/fitness/BodyMap";
import { WorkoutCard, type WorkoutRow } from "@/components/fitness/WorkoutCard";
import { WorkoutSheet } from "@/components/fitness/WorkoutSheet";
import { WorkoutProgressCharts } from "@/components/fitness/WorkoutProgressCharts";
import { StartWorkoutSheet } from "@/components/fitness/StartWorkoutSheet";
import { ActiveWorkoutView } from "@/components/fitness/ActiveWorkoutView";
import { ExerciseCatalogSheet } from "@/components/fitness/ExerciseCatalogSheet";
import { PostWorkoutAnalysisSheet } from "@/components/fitness/PostWorkoutAnalysisSheet";
import { ExerciseRankStrip } from "@/components/fitness/ExerciseRankStrip";
import {
  useExerciseImageUrls,
  useWorkouts,
  useActiveWorkout,
  useStartWorkoutFromTemplate,
  type ActiveWorkout,
} from "@/hooks/use-fitness";
import { useRecoveryMap } from "@/hooks/useRecoveryMap";
import { useFitnessStreak } from "@/hooks/useFitnessStreak";
import { FabAdd } from "@/components/shared/FormComponents";
import { formatTonnage, workoutTonnage } from "@/lib/fitness/strength";
import { exerciseToMuscles, MUSCLE_META, type MuscleId } from "@/lib/fitness/muscleMapping";
import { CoachSheet, type WorkoutTemplate } from "./CoachSheet";
import { computePRs } from "@/utils/fitness/exercise-stats";

// ── Helpers ───────────────────────────────────────────────────────────────────

function workoutMuscleLabels(w: { exercises?: Array<{ name: string }> | null }): string[] {
  const ids = new Set<MuscleId>();
  for (const ex of w.exercises ?? []) {
    for (const m of exerciseToMuscles(ex.name ?? "")) ids.add(m);
  }
  return [...ids].map((id) => MUSCLE_META[id]?.label).filter(Boolean) as string[];
}

function weekdayLabel(iso: string) {
  return new Date(iso + "T00:00:00")
    .toLocaleDateString("fr-FR", { weekday: "short" })
    .replace(".", "");
}

// ── Composant principal ─────────────────────────────────────────────────────────

export function SeancesTab() {
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

  const weekWorkouts = useMemo(() => {
    if (!data) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 6);
    cutoff.setHours(0, 0, 0, 0);
    return data.filter((w) => new Date(w.date + "T00:00:00") >= cutoff);
  }, [data]);

  const [startOpen, setStartOpen] = useState(false);
  const [open, setOpen] = useState(false);
  // C2 : le snapshot de la séance clôturée vit ici pour que la fiche d'analyse
  // IA survive au démontage d'ActiveWorkoutView.
  const [finishedSnapshot, setFinishedSnapshot] = useState<ActiveWorkout | null>(null);
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachInitialMuscles, setCoachInitialMuscles] = useState<string[] | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const { prByName, histByName, volByName, prByGym, histByGym, nameByKey, topExercises } = useMemo(
    () => computePRs(data ?? []),
    [data],
  );

  const allImagePaths = useMemo(
    () =>
      historyOpen
        ? (data ?? []).flatMap((w) => (w.exercises ?? []).map((ex) => ex.image_path))
        : [],
    [data, historyOpen],
  );
  const { data: listImageUrls } = useExerciseImageUrls(allImagePaths);
  const latestDate = useMemo(() => data?.[0]?.date ?? "", [data]);

  // H1 : « Refaire » démarre une séance LIVE pré-remplie.
  const startFromTemplate = useStartWorkoutFromTemplate();
  const repeatLive = useCallback(
    (w: WorkoutRow) => {
      if (startFromTemplate.isPending) return;
      startFromTemplate.mutate({
        name: w.name,
        gym_location: (w as { gym_location?: string | null }).gym_location ?? null,
        exercises: w.exercises ?? [],
      });
    },
    [startFromTemplate],
  );

  // Saisie rétroactive (ancien « Refaire ») — accessible via le menu ⋮ d'une séance.
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

  if (activeLoading && isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── VUE SÉANCE ACTIVE ──────────────────────────────────────────────────────
  if (activeWorkout) {
    return (
      <section className="flex flex-col gap-4">
        <ActiveWorkoutView
          workout={activeWorkout}
          recoveryMap={recoveryMap}
          onFinished={setFinishedSnapshot}
          onOpenCatalog={() => setCatalogOpen(true)}
        />
        {finishedSnapshot && (
          <PostWorkoutAnalysisSheet
            workout={finishedSnapshot}
            workoutId={finishedSnapshot.id}
            previousWorkouts={data ?? []}
            recoveryMap={recoveryMap}
            onClose={() => setFinishedSnapshot(null)}
          />
        )}
        {/* Catalogue accessible aussi pendant une séance active — bibliothèque
            de référence du module Exercices, atteignable partout dans l'app. */}
        {catalogOpen && (
          <ExerciseCatalogSheet
            onClose={() => setCatalogOpen(false)}
            histByName={histByName}
            volByName={volByName}
            prByName={prByName}
          />
        )}
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

      {/* Catalogue d'exercices */}
      <button
        type="button"
        onClick={() => setCatalogOpen(true)}
        className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 p-4 text-left shadow-card transition-all active:scale-[0.99]"
        aria-label="Voir le catalogue d'exercices"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-muted-foreground">
          <BookOpen className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold">Exercices</span>
          <span className="block text-[11px] text-muted-foreground">
            Voir et modifier le catalogue complet
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

      {/* Séances de la semaine */}
      {data && !isLoading && (
        <WeekSessions workouts={weekWorkouts} onRefaire={repeatLive} />
      )}

      {data && data.length === 0 && !isLoading && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Aucune séance</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lance-toi, ta première séance t'attend.
          </p>
        </div>
      )}

      {/* Progression RPG par exercice */}
      {data && data.length > 0 && topExercises.length > 0 && !isLoading && (
        <ExerciseRankStrip
          topExercises={topExercises}
          nameByKey={nameByKey}
          histByName={histByName}
          volByName={volByName}
          prByName={prByName}
        />
      )}


      {/* Historique complet (repliable) */}
      {data && data.length > 0 && !isLoading && (
        <div className="overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 shadow-card backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
            aria-expanded={historyOpen}
          >
            <span className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Historique complet</span>
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {data.length}
              </span>
            </span>
            <ChevronDown
              className={
                "h-4 w-4 text-muted-foreground transition-transform " +
                (historyOpen ? "rotate-180" : "")
              }
            />
          </button>

          {historyOpen && (
            <div className="px-3 pb-4">
              <WorkoutProgressCharts
                topExercises={topExercises}
                histByName={histByName}
                prByName={prByName}
                nameByKey={nameByKey}
              />
              <ul className="mt-3 space-y-3">
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
                    onRepeatLive={repeatLive}
                    onOpenFromTemplate={openFromTemplate}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* FAB → démarre une séance live */}
      <FabAdd onClick={() => setStartOpen(true)} label="Nouvelle séance" />

      {startOpen && <StartWorkoutSheet onClose={() => setStartOpen(false)} />}

      {open && (
        <WorkoutSheet
          template={template}
          priorPRs={prByName}
          onClose={() => {
            setOpen(false);
            setTemplate(null);
          }}
        />
      )}

      {coachOpen && (
        <CoachSheet
          onClose={() => setCoachOpen(false)}
          onResult={handleCoachResult}
          initialMuscles={coachInitialMuscles}
        />
      )}

      {catalogOpen && (
        <ExerciseCatalogSheet
          onClose={() => setCatalogOpen(false)}
          histByName={histByName}
          volByName={volByName}
          prByName={prByName}
        />
      )}

      {/* C2 : fiche d'analyse IA — rendue aussi hors séance active */}
      {finishedSnapshot && (
        <PostWorkoutAnalysisSheet
          workout={finishedSnapshot}
          workoutId={finishedSnapshot.id}
          previousWorkouts={data ?? []}
          recoveryMap={recoveryMap}
          onClose={() => setFinishedSnapshot(null)}
        />
      )}
    </section>
  );
}

// ── Séances de la semaine (repliable + encoche détails) ───────────────────────

function WeekSessions({
  workouts,
  onRefaire,
}: {
  workouts: WorkoutRow[];
  onRefaire: (w: WorkoutRow) => void;
}) {
  const [detailed, setDetailed] = useState(false);
  const [weekOpen, setWeekOpen] = useState(true);

  return (
    <div className="overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 shadow-card backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setWeekOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
        aria-expanded={weekOpen}
      >
        <span className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Séances de la semaine</span>
          {workouts.length > 0 && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {workouts.length}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDetailed((v) => !v);
            }}
            aria-pressed={detailed}
            className={
              "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors " +
              (detailed
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card/50 text-muted-foreground hover:text-foreground")
            }
          >
            <span
              className={
                "flex h-3 w-3 items-center justify-center rounded-[3px] border text-[8px] " +
                (detailed ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50")
              }
            >
              {detailed ? "✓" : ""}
            </span>
            Détails
          </button>
          <ChevronDown
            className={
              "h-4 w-4 text-muted-foreground transition-transform " +
              (weekOpen ? "rotate-180" : "")
            }
          />
        </div>
      </button>

      {weekOpen && (
        <div className="px-5 pb-5">
          {workouts.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Aucune séance cette semaine. Lance-toi !
            </p>
          ) : (
            <ul className="space-y-2">
              {workouts.map((w) => {
                const muscles = detailed ? workoutMuscleLabels(w) : [];
                const volume = detailed ? Math.round(workoutTonnage(w.exercises ?? [])) : 0;
                return (
                  <li
                    key={w.id}
                    className="rounded-xl border border-border bg-card/50 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-9 shrink-0 text-center text-[10px] font-semibold uppercase tracking-wide text-primary">
                          {weekdayLabel(w.date)}
                        </span>
                        <span className="truncate text-xs font-semibold">{w.name || "Séance"}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRefaire(w)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90 hover:bg-primary/15 hover:text-primary"
                        title="Refaire cette séance"
                        aria-label="Refaire cette séance"
                      >
                        <Repeat className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {detailed && (
                      <div className="mt-2 pl-12">
                        <p className="text-[10px] text-muted-foreground">
                          {w.duration_minutes ? `${w.duration_minutes} min` : "durée —"}
                          {` · ${formatTonnage(volume)}`}
                          {` · ${(w.exercises ?? []).length} exos`}
                        </p>
                        {muscles.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {muscles.map((m) => (
                              <span
                                key={m}
                                className="rounded-full border border-white/8 bg-white/5 px-2 py-0.5 text-[9px] font-medium text-muted-foreground"
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
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
