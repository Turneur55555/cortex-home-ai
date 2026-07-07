// ============================================================
// Carte d'historique générique — pour toute discipline dont
// historyPresentation.cardVariant !== 'strength'. La musculation garde
// WorkoutCard tel quel (intouché) ; cette carte sert HYROX, Course,
// Cardio et Activités accompagnées sans qu'aucune de ces phases n'ait
// à créer sa propre carte.
//
// Même charte visuelle que WorkoutCard (surface, rayon, ombre) pour ne
// pas introduire de rupture de cohérence dans l'historique.
// ============================================================

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useDeleteWorkout } from "@/hooks/use-fitness";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import { isReadyEngine, type DisciplineId } from "@/lib/fitness/engines/types";
import { adaptWorkoutRow, type PersistedWorkoutRow } from "@/lib/fitness/engines/adaptRow";
import { WorkoutDeleteDialog } from "@/components/fitness/WorkoutDeleteDialog";
import { SessionSummaryCard } from "./SessionSummaryCard";
import { SessionSegmentList } from "./SessionSegmentList";
import { DisciplineBadge } from "./DisciplineIcon";
import { HISTORY_CONTENT_RENDERERS } from "./historyContentRenderers";

export function GenericHistoryCard({
  workout,
}: {
  workout: PersistedWorkoutRow & { id: string; date: string; discipline: string };
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const del = useDeleteWorkout();

  const entry = ENGINE_REGISTRY[workout.discipline as DisciplineId];
  const engine = entry && isReadyEngine(entry) ? entry : null;
  // Discipline inconnue ou pas encore branchée — filet de sécurité, ne
  // devrait pas arriver puisque SeancesTab route déjà sur cardVariant.
  if (!engine) return null;

  const draft = adaptWorkoutRow(workout, engine.id);
  const view = engine.toSessionView(draft);
  const dateLabel = format(parseISO(workout.date), "EEEE d MMMM • HH'h'mm", { locale: fr });
  const gymLocation = workout.gym_location || "Salle inconnue";

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
          </div>
          <div className="relative flex shrink-0 items-center gap-1.5">
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
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="relative mt-3 space-y-3">
          {(() => {
            const Custom = HISTORY_CONTENT_RENDERERS[engine.id];
            if (Custom) return <Custom view={view} />;
            return (
              <>
                <SessionSummaryCard view={view} />
                <SessionSegmentList segments={view.segments} />
              </>
            );
          })()}
        </div>
      </div>

      {confirmDelete && (
        <WorkoutDeleteDialog
          workoutName={workout.name}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            del.mutate(workout.id, {
              onError: () => toast.error("Suppression impossible"),
            });
          }}
        />
      )}
    </li>
  );
}
