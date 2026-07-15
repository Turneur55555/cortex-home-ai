// ============================================================
// Carte d'historique — pour toute discipline dont
// historyPresentation.cardVariant !== 'strength'. La musculation garde
// WorkoutCard tel quel (intouché) ; cette carte sert Cardio/HYROX/
// Course/Guidé/Autre sans qu'aucune de ces disciplines n'ait à créer sa
// propre carte.
//
// ADDENDUM PHASE B (2026-07-15, retour de Nathan) : convergence complète
// avec WorkoutCard — titre éditable dans le header (même mécanisme
// générique useUpdateWorkoutName), grille de tuiles de stats (StatTile,
// alimentée par Exos calculé + view.summaryStats déclarés par la
// discipline — c'est la discipline qui injecte ses capacités dans la
// même architecture, pas un module à part), liste d'exercices au même
// gabarit visuel (GenericHistoryExerciseList, pendant direct de la
// liste d'exercices de WorkoutCard), et "Refaire en live" ajouté au menu
// (nouvelle capacité générique, voir docs/architecture/
// phase-b-carte-exercice-unique.md section 6.3 — équivalent exact du
// repeatLive musculation, mêmes garde-fous).
// ============================================================

import { useState } from "react";
import { Clock, Layers, MoreVertical, Repeat, Sparkles, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useDeleteWorkout, useUpdateWorkoutName } from "@/hooks/use-fitness";
import { useStartGenericActiveWorkout } from "@/hooks/useGenericActiveSession";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import {
  isReadyEngine,
  type DisciplineId,
  type LiveSegmentSeed,
} from "@/lib/fitness/engines/types";
import { adaptWorkoutRow, type PersistedWorkoutRow } from "@/lib/fitness/engines/adaptRow";
import { groupByExerciseLabel } from "@/lib/fitness/segmentStats";
import { WorkoutDeleteDialog } from "@/components/fitness/WorkoutDeleteDialog";
import { RepeatLiveConfirmDialog } from "@/components/fitness/RepeatLiveConfirmDialog";
import { useWorkoutAnalysisIndex } from "@/hooks/useWorkoutAnalyses";
import { StoredWorkoutAnalysisSheet } from "@/components/fitness/StoredWorkoutAnalysisSheet";
import { EditableText } from "@/components/fitness/EditableText";
import { StatTileRow, type StatTileSpec } from "@/components/fitness/StatTileRow";
import { GenericHistoryExerciseList } from "./GenericHistoryExerciseList";
import { DisciplineBadge } from "./DisciplineIcon";

export function GenericHistoryCard({
  workout,
}: {
  workout: PersistedWorkoutRow & { id: string; date: string; discipline: string };
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRepeat, setConfirmRepeat] = useState(false);
  // Phase C, lot V2 : "Revoir le bilan" — même mécanisme (et même index
  // partagé) que WorkoutCard côté musculation, voir useWorkoutAnalyses.ts.
  const { data: analysisIndex } = useWorkoutAnalysisIndex();
  const hasAnalysis = !!analysisIndex?.has(workout.id);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const del = useDeleteWorkout();
  const updateName = useUpdateWorkoutName();
  const repeatLive = useStartGenericActiveWorkout();

  const entry = ENGINE_REGISTRY[workout.discipline as DisciplineId];
  const engine = entry && isReadyEngine(entry) ? entry : null;
  // Discipline inconnue ou pas encore branchée — filet de sécurité, ne
  // devrait pas arriver puisque SeancesTab route déjà sur cardVariant.
  if (!engine) return null;

  const draft = adaptWorkoutRow(workout, engine.id);
  const view = engine.toSessionView(draft);
  const dateLabel = format(parseISO(workout.date), "EEEE d MMMM • HH'h'mm", { locale: fr });
  const gymLocation = workout.gym_location || "Salle inconnue";
  const exoCount = groupByExerciseLabel(view.segments).length;

  // Phase C, lot V1 (P1-6) : confirmation via le dialogue custom partagé
  // (RepeatLiveConfirmDialog, même composant que le chemin musculation) —
  // plus de window.confirm() natif, hors charte et bloquant en test.
  const handleRepeatLive = () => {
    if (repeatLive.isPending) return;
    setConfirmRepeat(true);
  };
  const confirmRepeatLive = () => {
    setConfirmRepeat(false);
    if (repeatLive.isPending) return;
    const seedSegments: LiveSegmentSeed[] = view.segments.map((seg) => ({
      label: seg.label,
      metrics: seg.metrics ?? {},
    }));
    repeatLive.mutate({ draft, seedSegments });
  };

  return (
    <li className="overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      <div className="relative px-5 pb-4 pt-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/10 to-transparent"
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
              {dateLabel}
              {gymLocation !== "Salle inconnue" && (
                <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tracking-normal text-primary">
                  {gymLocation}
                </span>
              )}
              <DisciplineBadge
                icon={engine.icon}
                label={engine.label}
                accentClassName={engine.accentClassName}
              />
            </p>
            <EditableText
              value={workout.name}
              onSave={(name) => updateName.mutate({ id: workout.id, name })}
              className="mt-1 text-xl font-bold leading-tight tracking-tight"
            />
          </div>
          <div className="relative flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleRepeatLive}
              disabled={repeatLive.isPending}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90 hover:bg-primary/15 hover:text-primary disabled:opacity-50"
              title="Refaire cette séance (live)"
              aria-label="Refaire cette séance (live)"
            >
              <Repeat className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90 hover:bg-white/10"
              aria-label="Options de la séance"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 z-20 min-w-[180px] overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
                {hasAnalysis && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setAnalysisOpen(true);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-white/5"
                  >
                    <Sparkles className="h-4 w-4 text-primary" />
                    Revoir le bilan
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    handleRepeatLive();
                  }}
                  className={
                    "flex w-full items-center gap-3 px-4 py-3 text-sm font-medium transition-colors hover:bg-white/5" +
                    (hasAnalysis ? " border-t border-border" : "")
                  }
                >
                  <Repeat className="h-4 w-4 text-muted-foreground" />
                  Refaire en live
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  className="flex w-full items-center gap-3 border-t border-border px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer la séance
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tuiles de stats — Exos calculé + capacités déclarées par la discipline
            (view.summaryStats), layout auto-adaptatif (StatTileRow) : plus jamais
            de case vide (Cardio n'a que 3 tuiles réelles) ni de 2e ligne quasi
            vide (Guided peut en déclarer jusqu'à 5) — voir addendum 2, §7.1/7.3. */}
        <div className="relative mt-4">
          <StatTileRow
            tiles={
              [
                {
                  key: "exos",
                  icon: <Layers className="h-3.5 w-3.5" />,
                  label: "Exos",
                  value: `${exoCount}`,
                },
                ...view.summaryStats.map(
                  (s, i): StatTileSpec => ({
                    key: `${s.label}-${i}`,
                    icon:
                      i === 0 ? (
                        <Clock className="h-3.5 w-3.5" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      ),
                    label: s.label,
                    value: s.value,
                  }),
                ),
              ] satisfies StatTileSpec[]
            }
          />
        </div>

        <div className="relative mt-4">
          <GenericHistoryExerciseList
            view={view}
            discipline={engine.id}
            sessionDate={workout.date}
          />
        </div>
      </div>

      {analysisOpen && (
        <StoredWorkoutAnalysisSheet
          workoutId={workout.id}
          workoutName={workout.name || "Séance"}
          variant="generic"
          onClose={() => setAnalysisOpen(false)}
        />
      )}

      {confirmRepeat && (
        <RepeatLiveConfirmDialog
          workoutName={workout.name || "cette séance"}
          onConfirm={confirmRepeatLive}
          onCancel={() => setConfirmRepeat(false)}
        />
      )}

      {confirmDelete && (
        <WorkoutDeleteDialog
          workoutName={workout.name}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            del.mutate(workout.id);
          }}
        />
      )}
    </li>
  );
}
