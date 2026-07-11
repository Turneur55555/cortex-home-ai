import { useMemo, useState } from "react";
import type { SessionView } from "@/lib/fitness/engines/types";
import { groupByExerciseLabel } from "@/lib/fitness/segmentStats";
import { SessionSummaryCard } from "./SessionSummaryCard";
import { SegmentAnalysisSheet } from "./SegmentAnalysisSheet";

// ============================================================
// Rendu d'historique spécifique à la discipline Course à pied — utilise
// le point d'extension HISTORY_CONTENT_RENDERERS (voir
// historyContentRenderers.tsx, prévu pour exactement ce cas d'usage) pour
// afficher une carte PAR EXERCICE (pas par répétition) et ouvrir sa fiche
// détaillée (SegmentAnalysisSheet), SANS toucher à GenericHistoryCard.tsx
// ni à SessionSegmentList.tsx — qui restent utilisés tels quels par
// HYROX/Cardio/mobilité/récupération (aucune entrée dans le registre pour
// ces disciplines ⇒ zéro changement de comportement pour elles, et zéro
// changement pour la musculation qui a sa propre carte WorkoutCard).
//
// CORRECTION 2026-07-11 (retour de Nathan) : la V1 affichait une carte
// PAR SEGMENT BRUT (donc une carte par répétition — 8 lignes pour un
// fractionné à 8 répétitions de "400m"). Nathan veut le même modèle
// qu'en musculation : séance > exercice > répétitions, une seule carte
// par exercice avec ses répétitions groupées à l'intérieur (cf.
// buildGroups() dans WorkoutCard.tsx, qui fait exactement ça pour les
// séries). `groupByExerciseLabel` (segmentStats.ts) reproduit ce
// regroupement pour la course, en restant purement présentationnel :
// SegmentAnalysisSheet (la fiche) n'a besoin d'aucune modification pour
// cette partie, elle agrège déjà par TYPE de segment sur toutes les
// séances (voir useSegmentHistory.ts) — seule la liste de CETTE séance
// avait besoin d'être groupée.
// ============================================================

export function CourseHistoryContent({ view }: { view: SessionView }) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const groups = useMemo(() => groupByExerciseLabel(view.segments), [view.segments]);

  return (
    <>
      <SessionSummaryCard view={view} />

      {groups.length > 0 && (
        <ul className="space-y-2">
          {groups.map((g) => {
            const repCount = g.instances.length;
            const doneCount = g.instances.filter((seg) =>
              seg.stats.some((s) => s.label === "Statut" && s.value === "Réalisé"),
            ).length;
            return (
              <li key={g.key}>
                <button
                  type="button"
                  onClick={() => setSelectedLabel(g.instances[0].label)}
                  className="w-full rounded-2xl border border-border bg-surface/60 p-3 text-left transition-colors hover:bg-surface active:scale-[0.99]"
                >
                  <p className="text-sm font-semibold text-foreground">{g.displayLabel}</p>
                  <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                    {repCount} répétition{repCount > 1 ? "s" : ""}
                    {doneCount > 0 && doneCount < repCount && (
                      <>
                        {" "}
                        · {doneCount} réalisée{doneCount > 1 ? "s" : ""}
                      </>
                    )}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selectedLabel && (
        <SegmentAnalysisSheet rawLabel={selectedLabel} onClose={() => setSelectedLabel(null)} />
      )}
    </>
  );
}
