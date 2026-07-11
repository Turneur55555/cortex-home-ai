import { useState } from "react";
import type { SessionView } from "@/lib/fitness/engines/types";
import { SessionSummaryCard } from "./SessionSummaryCard";
import { SessionStatChip } from "./SessionStatChip";
import { SegmentAnalysisSheet } from "./SegmentAnalysisSheet";

// ============================================================
// Rendu d'historique spécifique à la discipline Course à pied — utilise
// le point d'extension HISTORY_CONTENT_RENDERERS (voir
// historyContentRenderers.tsx, prévu pour exactement ce cas d'usage) pour
// rendre chaque segment cliquable et ouvrir sa fiche détaillée
// (SegmentAnalysisSheet), SANS toucher à GenericHistoryCard.tsx ni à
// SessionSegmentList.tsx — qui restent utilisés tels quels par
// HYROX/Cardio/mobilité/récupération (aucune entrée dans le registre pour
// ces disciplines ⇒ zéro changement de comportement pour elles, et zéro
// changement pour la musculation qui a sa propre carte WorkoutCard).
//
// Reprend SessionSummaryCard tel quel (résumé de la séance, inchangé) et
// remplace uniquement la liste de segments par une variante cliquable
// (markup volontairement proche de SessionSegmentList.tsx — une quinzaine
// de lignes — plutôt que d'ajouter une prop onClick au composant partagé,
// pour garantir un risque de régression nul sur les autres disciplines
// qui utilisent SessionSegmentList tel quel).
// ============================================================

export function CourseHistoryContent({ view }: { view: SessionView }) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  return (
    <>
      <SessionSummaryCard view={view} />

      {view.segments.length > 0 && (
        <ul className="space-y-2">
          {view.segments.map((seg, i) => (
            <li key={`${seg.label}-${i}`}>
              <button
                type="button"
                onClick={() => setSelectedLabel(seg.label)}
                className="w-full rounded-2xl border border-border bg-surface/60 p-3 text-left transition-colors hover:bg-surface active:scale-[0.99]"
              >
                <p className="text-sm font-semibold text-foreground">{seg.label}</p>
                {seg.stats.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {seg.stats.map((s, j) => (
                      <SessionStatChip key={`${s.label}-${j}`} stat={s} />
                    ))}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedLabel && (
        <SegmentAnalysisSheet rawLabel={selectedLabel} onClose={() => setSelectedLabel(null)} />
      )}
    </>
  );
}
