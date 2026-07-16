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
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Flame,
  Loader2,
  MoreVertical,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { ActiveGenericSegment, ActiveGenericWorkout } from "@/hooks/useGenericActiveSession";
import {
  useAddGenericSegment,
  useCancelGenericActiveWorkout,
  useFinishGenericActiveWorkout,
  useUpdateGenericSegment,
} from "@/hooks/useGenericActiveSession";
import { useRecentSegmentLabels } from "@/hooks/useRecentSegmentLabels";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import {
  groupByExerciseLabel,
  SEGMENT_METRIC_CONFIG,
  type LabelGroup,
} from "@/lib/fitness/segmentStats";
import { WorkoutTimer } from "../WorkoutTimer";
import { RestTimerBar } from "../RestTimerBar";
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
  /** Phase C, lot V2 (P0-2) : reçoit le snapshot de la séance clôturée —
   *  même contrat que ActiveWorkoutView (muscu), pour que la fiche de
   *  bilan IA survive au démontage de cette vue (voir SeancesTab). */
  onFinished: (finished: ActiveGenericWorkout) => void;
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

  // Lot V8 — HYROX raconte une ÉPREUVE : l'en-tête et la liste ne parlent
  // plus d'exercices/répétitions mais d'ateliers franchis, en cours, à
  // venir (voir HyroxEpreuve en bas de fichier).
  const isEpreuve = workout.discipline === "hyrox";
  const ateliersDone = groups.filter(isAtelierDone).length;
  const currentAtelier = groups.find((g) => !isAtelierDone(g)) ?? null;
  const ateliersLeft = groups.length - ateliersDone - (currentAtelier ? 1 : 0);
  const epreuvePct =
    sortedSegments.length > 0 ? Math.round((completedCount / sortedSegments.length) * 100) : 0;

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
    onFinished(workout);
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

          {isEpreuve && groups.length > 0 ? (
            // L'en-tête raconte l'épreuve, jamais "N répétitions".
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              {currentAtelier ? (
                <>
                  <span>
                    <strong className="text-foreground">{ateliersDone}</strong> atelier
                    {ateliersDone > 1 ? "s" : ""} terminé{ateliersDone > 1 ? "s" : ""}
                  </span>
                  <span>·</span>
                  <span>
                    <strong className="text-foreground">{currentAtelier.displayLabel}</strong> en
                    cours
                  </span>
                  {ateliersLeft > 0 && (
                    <>
                      <span>·</span>
                      <span>
                        {ateliersLeft} restant{ateliersLeft > 1 ? "s" : ""}
                      </span>
                    </>
                  )}
                  <span>·</span>
                  <span className="tabular-nums">{epreuvePct} %</span>
                </>
              ) : (
                <span className="font-semibold text-foreground">
                  🏁 Ligne d'arrivée — {groups.length} ateliers franchis
                </span>
              )}
            </div>
          ) : (
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
          )}

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
      ) : isEpreuve ? (
        <HyroxEpreuve
          groups={groups}
          workoutId={workout.id}
          discipline={workout.discipline}
          nextPosition={sortedSegments.length}
          onOpenStats={setStatsLabel}
        />
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

      {/* Lot V3 : minuteur de repos — même barre que la séance musculation
          (ActiveWorkoutView), déclenchée à la validation d'une répétition
          d'un exercice à répétitions multiples (fractionné/circuit), voir
          exerciseCard/ActiveExerciseCard.tsx (kind="generic"). */}
      <RestTimerBar />

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

// ─── Lot V8 — L'épreuve HYROX ────────────────────────────────────────────
// Même philosophie que le voyage kilomètre (exerciseCard/ActiveExerciseCard,
// lots V5-V7) mais à l'échelle de la SÉANCE : chaque atelier est une étape
// de l'épreuve — ✓ franchis (résumé une ligne), ● en cours (la carte
// exercice existante devient le héros, grand CTA "Terminer l'atelier"),
// ○ à venir (annoncés avec leur objectif), reliés par le même rail
// vertical. Mêmes cartes, mêmes mutations, aucun nouveau moteur —
// uniquement la mise en scène de la compétition.

/** Un atelier est franchi quand TOUTES ses répétitions/passages le sont
 *  (un "Running" de simulation groupe les 8 footings sous une carte). */
function isAtelierDone(group: LabelGroup<ActiveGenericSegment>): boolean {
  return group.instances.length > 0 && group.instances.every((s) => s.completed);
}

/** Résumé une ligne d'un atelier, dans le vocabulaire déclaré par la
 *  discipline (SEGMENT_METRIC_CONFIG) : "1.00 km · 3:42 · 1:51 /500 m".
 *  Chaque poste garde SES métriques — jamais uniformisé. */
function atelierSummary(group: LabelGroup<ActiveGenericSegment>): string {
  const first = group.instances[0];
  if (!first) return "";
  const parts = Object.keys(first.metrics)
    .filter((k) => typeof first.metrics[k] === "number" && SEGMENT_METRIC_CONFIG[k])
    .sort((a, b) => SEGMENT_METRIC_CONFIG[a].order - SEGMENT_METRIC_CONFIG[b].order)
    .slice(0, 4)
    .map((k) => {
      const v = first.metrics[k] as number;
      // Les postes HYROX se jouent sur 50-200 m : "50 m" et jamais
      // "0.05 km" (le format global reste pensé pour la course).
      return k === "distance_m" && v < 1000
        ? `${Math.round(v)} m`
        : SEGMENT_METRIC_CONFIG[k].format(v);
    });
  const prefix = group.instances.length > 1 ? [`${group.instances.length} passages`] : [];
  return [...prefix, ...parts].join(" · ");
}

function HyroxEpreuve({
  groups,
  workoutId,
  discipline,
  nextPosition,
  onOpenStats,
}: {
  groups: LabelGroup<ActiveGenericSegment>[];
  workoutId: string;
  discipline: ActiveGenericWorkout["discipline"];
  nextPosition: number;
  onOpenStats: (label: string) => void;
}) {
  const updateSegment = useUpdateGenericSegment();
  // L'atelier "focalisé" : par défaut le premier non franchi (l'atelier en
  // cours) ; taper un atelier franchi/à venir le rouvre en héros.
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const currentIdx = groups.findIndex((g) => !isAtelierDone(g));
  const allDone = currentIdx === -1;

  const finishAtelier = (group: LabelGroup<ActiveGenericSegment>, idx: number) => {
    for (const s of group.instances) {
      if (!s.completed) updateSegment.mutate({ id: s.id, completed: true });
    }
    setFocusedKey(null);
    try {
      navigator.vibrate?.(50);
    } catch {
      // Vibration API non supportée — dégradation silencieuse.
    }
    // La récompense : chaque atelier franchi rapproche de la ligne d'arrivée.
    const next = groups.find((g, i) => i !== idx && !isAtelierDone(g));
    toast.success(`${group.displayLabel} terminé 💪`, {
      description: next
        ? `Commencer le ${next.displayLabel} →`
        : "Ligne d'arrivée — tous les ateliers sont franchis 🏁",
    });
  };

  return (
    <div className="relative">
      {/* Rail de progression — le fil conducteur de l'épreuve. */}
      <div
        aria-hidden
        className="absolute bottom-6 left-[13px] top-2 w-[2px] rounded-full bg-white/[0.07]"
      />

      <ol className="flex flex-col gap-1.5">
        {groups.map((group, i) => {
          const done = isAtelierDone(group);
          const isCurrent = i === currentIdx;
          const isFocused = focusedKey ? focusedKey === group.key : isCurrent;

          if (isFocused) {
            return (
              <li key={group.key} className="relative animate-in fade-in zoom-in-95 duration-300">
                {/* Nœud du rail — pulse tant que l'atelier est en cours. */}
                <span className="absolute left-0 top-6 z-[1] flex h-[26px] w-[26px] items-center justify-center">
                  {!done && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-25" />
                  )}
                  <span
                    className={`relative flex h-[26px] w-[26px] items-center justify-center rounded-full text-[12px] font-extrabold ${
                      done
                        ? "bg-success text-success-foreground"
                        : "bg-primary text-primary-foreground shadow-glow"
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" strokeWidth={3.5} /> : i + 1}
                  </span>
                </span>

                <div className="ml-9 flex flex-col gap-2">
                  <ActiveExerciseCard
                    kind="generic"
                    group={group}
                    workoutId={workoutId}
                    discipline={discipline}
                    nextPosition={nextPosition}
                    onOpenStats={onOpenStats}
                  />
                  {!done && (
                    <button
                      type="button"
                      onClick={() => finishAtelier(group, i)}
                      disabled={updateSegment.isPending}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary text-sm font-bold text-primary-foreground shadow-glow transition-transform active:scale-[0.98] disabled:opacity-50"
                    >
                      <Check className="h-5 w-5" strokeWidth={3} />
                      Terminer l'atelier
                    </button>
                  )}
                  {focusedKey === group.key && (
                    <button
                      type="button"
                      onClick={() => setFocusedKey(null)}
                      className="self-center text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Refermer
                    </button>
                  )}
                </div>
              </li>
            );
          }

          if (done) {
            const summary = atelierSummary(group);
            return (
              <li
                key={group.key}
                className="animate-in fade-in slide-in-from-bottom-1 duration-300"
              >
                <button
                  type="button"
                  onClick={() => setFocusedKey(group.key)}
                  className="group/atelier flex w-full items-center gap-3 rounded-2xl py-2 pl-0.5 pr-2 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <span className="z-[1] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-success text-success-foreground shadow-[0_0_0_4px_rgba(34,197,94,0.14)] animate-in zoom-in-50 duration-300">
                    <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-[13px] font-bold">{group.displayLabel}</span>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-success/90">
                        franchi
                      </span>
                    </span>
                    {summary && (
                      <span className="block truncate text-[12px] tabular-nums text-muted-foreground">
                        {summary}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-transform group-hover/atelier:translate-x-0.5" />
                </button>
              </li>
            );
          }

          const target = atelierSummary(group);
          return (
            <li key={group.key} className="animate-in fade-in duration-300">
              <button
                type="button"
                onClick={() => setFocusedKey(group.key)}
                className="flex w-full items-center gap-3 rounded-2xl py-2 pl-0.5 pr-2 text-left opacity-55 transition-opacity hover:opacity-100"
              >
                <span className="z-[1] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 border-dashed border-white/20 bg-surface text-[11px] font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-muted-foreground">
                    {group.displayLabel} · à venir
                  </span>
                  {target && (
                    <span className="block truncate text-[11px] tabular-nums text-muted-foreground/60">
                      objectif {target}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {allDone && groups.length > 0 && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-success/10 py-3 text-[13px] font-bold text-success animate-in fade-in zoom-in-95 duration-300">
          🏁 Ligne d'arrivée — {groups.length} atelier{groups.length > 1 ? "s" : ""} franchi
          {groups.length > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
