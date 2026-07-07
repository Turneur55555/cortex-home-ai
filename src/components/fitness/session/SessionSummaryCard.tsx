// ============================================================
// Carte de résumé générique d'une séance (titre + stats clés + notes).
// Alimentée par SessionView — zéro connaissance de discipline. Utilisée
// à la fois par l'écran de relecture avant sauvegarde et par la carte
// d'historique (GenericHistoryCard).
// ============================================================

import type { SessionView } from "@/lib/fitness/engines/types";
import { SessionStatChip } from "./SessionStatChip";

export function SessionSummaryCard({ view }: { view: SessionView }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-lg font-bold leading-tight tracking-tight text-foreground">{view.title}</p>
      {view.summaryStats.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {view.summaryStats.map((s, i) => (
            <SessionStatChip key={`${s.label}-${i}`} stat={s} />
          ))}
        </div>
      )}
      {view.notes && (
        <p className="mt-3 whitespace-pre-line text-xs text-muted-foreground">{view.notes}</p>
      )}
    </div>
  );
}
