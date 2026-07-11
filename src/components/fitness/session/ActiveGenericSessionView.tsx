// ============================================================
// Vue "séance en cours" GÉNÉRIQUE — pendant de ActiveWorkoutView
// (musculation) pour toute discipline Sensei avec supportsLiveTracking=true
// (phase pilote : Course à pied, 2026-07-09). Timer, liste d'exercices
// (regroupés par type — voir ActiveCourseExerciseCard.tsx) avec leurs
// répétitions éditables (ActiveSegmentCard), ajout d'un segment
// personnalisé, menu Terminer/Annuler — même charte visuelle que la
// séance active musculation, sans dépendre de son vocabulaire
// exercices/séries.
//
// CORRECTION 2026-07-11 (retour de Nathan) : la liste de segments était
// affichée à plat (une carte par répétition — jusqu'à 17 lignes pour un
// fractionné à 8x400m). Nathan veut le même modèle qu'en musculation :
// séance > exercice > répétitions, une seule carte par exercice avec ses
// répétitions groupées à l'intérieur (cf. ActiveExerciseCard qui groupe
// les séries). `groupByExerciseLabel` (segmentStats.ts) fait ce
// regroupement ; `ActiveCourseExerciseCard` (nouveau) affiche chaque
// groupe et réutilise ActiveSegmentCard tel quel pour chaque répétition
// — aucune modification de ce composant. Le bouton "Ajouter un segment"
// en bas reste inchangé (ajout d'un exercice entièrement nouveau, non
// prévu par Sensei) ; chaque carte d'exercice a en plus son propre
// "Ajouter une répétition".
// ============================================================

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, MoreVertical, Plus, XCircle } from "lucide-react";
import type { ActiveGenericWorkout } from "@/hooks/useGenericActiveSession";
import {
  useAddGenericSegment,
  useCancelGenericActiveWorkout,
  useFinishGenericActiveWorkout,
} from "@/hooks/useGenericActiveSession";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import { groupByExerciseLabel } from "@/lib/fitness/segmentStats";
import { WorkoutTimer } from "../WorkoutTimer";
import { ActiveCourseExerciseCard } from "./ActiveCourseExerciseCard";
import { SegmentAnalysisSheet } from "./SegmentAnalysisSheet";
import { DisciplineIcon } from "./DisciplineIcon";

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

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [addingOpen, setAddingOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDistance, setNewDistance] = useState("");
  const [newPace, setNewPace] = useState("");
  const [statsLabel, setStatsLabel] = useState<string | null>(null);

  const sortedSegments = useMemo(
    () => [...workout.segments].sort((a, b) => a.position - b.position),
    [workout.segments],
  );
  const completedCount = sortedSegments.filter((s) => s.completed).length;
  const groups = useMemo(() => groupByExerciseLabel(sortedSegments), [sortedSegments]);

  const handleAddSegment = async () => {
    const label = newLabel.trim();
    if (!label) return;
    const metrics: Record<string, number | string> = {};
    const distanceKm = parseFloat(newDistance.replace(",", "."));
    if (!Number.isNaN(distanceKm) && distanceKm > 0)
      metrics.distance_m = Math.round(distanceKm * 1000);
    const pace = parseFloat(newPace.replace(",", "."));
    if (!Number.isNaN(pace) && pace > 0) metrics.pace_min_per_km = pace;

    await addSegment.mutateAsync({
      workoutId: workout.id,
      label,
      metrics,
      position: sortedSegments.length,
    });
    setNewLabel("");
    setNewDistance("");
    setNewPace("");
    setAddingOpen(false);
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
              <strong className="text-foreground">{sortedSegments.length}</strong> segment
              {sortedSegments.length > 1 ? "s" : ""}
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

      {/* ── Confirm finish ── */}
      {confirmFinish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg">
            <h3 className="text-lg font-bold">Terminer la séance ?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {completedCount}/{sortedSegments.length} segment(s) marqué(s) réalisé(s).
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmFinish(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium"
              >
                Continuer
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={finish.isPending}
                className="flex-1 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Terminer
              </button>
            </div>
          </div>
        </div>
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
            Aucun segment — ajoutez-en un ci-dessous
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <ActiveCourseExerciseCard
              key={g.key}
              group={g}
              workoutId={workout.id}
              nextPosition={sortedSegments.length}
              onOpenStats={setStatsLabel}
            />
          ))}
        </div>
      )}

      {/* ── Add segment ── */}
      {addingOpen ? (
        <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-3">
          <input
            autoFocus
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Nom du segment (ex: Sprint côte)"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="number"
              step="0.1"
              min="0"
              value={newDistance}
              onChange={(e) => setNewDistance(e.target.value)}
              placeholder="Distance (km)"
              className="w-32 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
            />
            <input
              type="number"
              step="0.1"
              min="0"
              value={newPace}
              onChange={(e) => setNewPace(e.target.value)}
              placeholder="Allure (min/km)"
              className="w-32 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setAddingOpen(false)}
              className="flex-1 rounded-xl border border-border py-2 text-xs font-medium"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleAddSegment}
              disabled={addSegment.isPending || !newLabel.trim()}
              className="flex-1 rounded-xl bg-gradient-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {addSegment.isPending ? "Ajout…" : "Ajouter"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingOpen(true)}
          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-4 text-sm font-semibold text-primary transition-all active:scale-[0.99] hover:border-primary/40 hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" />
          Ajouter un segment
        </button>
      )}

      {statsLabel && (
        <SegmentAnalysisSheet rawLabel={statsLabel} onClose={() => setStatsLabel(null)} />
      )}
    </div>
  );
}
