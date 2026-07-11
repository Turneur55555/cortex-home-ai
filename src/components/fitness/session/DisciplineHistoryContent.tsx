import { useMemo, useState } from "react";
import type { DisciplineId, SessionView } from "@/lib/fitness/engines/types";
import { groupByExerciseLabel } from "@/lib/fitness/segmentStats";
import { SessionSummaryCard } from "./SessionSummaryCard";
import { SegmentAnalysisSheet } from "./SegmentAnalysisSheet";
import type { HistoryContentRenderer } from "./historyContentRenderers";

// ============================================================
// Généralisation multi-discipline (Phase 1, 2026-07-11) de
// CourseHistoryContent.tsx : MÊME rendu (une carte par exercice,
// répétitions/occurrences groupées à l'intérieur, clic → fiche
// détaillée), mais paramétré par discipline au lieu d'être câblé en dur
// sur Course. `createDisciplineHistoryContent("cardio")` produit un
// composant HistoryContentRenderer prêt à être enregistré dans
// HISTORY_CONTENT_RENDERERS (voir historyContentRenderers.tsx) — une
// ligne par discipline, exactement le mécanisme d'extension déjà prévu.
//
// CourseHistoryContent.tsx N'EST PAS supprimé/remplacé : Course garde
// son fichier dédié (et sa fiche câblée sur workout_segments) intact,
// conformément à la consigne de Nathan de ne pas toucher au pilote
// Course validé. Ce fichier sert les disciplines qui lisent
// `workouts.metadata.segments` (solution transitoire — voir
// useDisciplineSegmentHistory.ts) : Cardio, HYROX, Guided aujourd'hui.
// ============================================================

function DisciplineHistoryContentImpl({
  discipline,
  view,
}: {
  discipline: DisciplineId;
  view: SessionView;
}) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const groups = useMemo(() => groupByExerciseLabel(view.segments), [view.segments]);

  return (
    <>
      <SessionSummaryCard view={view} />

      {groups.length > 0 && (
        <ul className="space-y-2">
          {groups.map((g) => {
            const repCount = g.instances.length;
            return (
              <li key={g.key}>
                <button
                  type="button"
                  onClick={() => setSelectedLabel(g.instances[0].label)}
                  className="w-full rounded-2xl border border-border bg-surface/60 p-3 text-left transition-colors hover:bg-surface active:scale-[0.99]"
                >
                  <p className="text-sm font-semibold text-foreground">{g.displayLabel}</p>
                  {repCount > 1 && (
                    <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                      {repCount} occurrences
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selectedLabel && (
        <SegmentAnalysisSheet
          rawLabel={selectedLabel}
          discipline={discipline}
          onClose={() => setSelectedLabel(null)}
        />
      )}
    </>
  );
}

/** Fabrique un HistoryContentRenderer lié à une discipline donnée — voir
 *  en-tête de fichier. */
export function createDisciplineHistoryContent(discipline: DisciplineId): HistoryContentRenderer {
  return function DisciplineHistoryContent({ view }: { view: SessionView }) {
    return <DisciplineHistoryContentImpl discipline={discipline} view={view} />;
  };
}
