// ============================================================
// Liste générique des segments d'une séance (un exercice en musculation,
// une station HYROX, un fractionné en course, l'activité unique en
// cardio...). Alimentée par SessionView.segments — zéro connaissance de
// discipline, réutilisée par toutes les phases à venir.
// ============================================================

import type { SessionSegment } from "@/lib/fitness/engines/types";
import { SessionStatChip } from "./SessionStatChip";

export function SessionSegmentList({ segments }: { segments: SessionSegment[] }) {
  if (segments.length === 0) return null;

  return (
    <ul className="space-y-2">
      {segments.map((seg, i) => (
        <li
          key={`${seg.label}-${i}`}
          className="rounded-2xl border border-border bg-surface/60 p-3"
        >
          <p className="text-sm font-semibold text-foreground">{seg.label}</p>
          {seg.stats.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {seg.stats.map((s, j) => (
                <SessionStatChip key={`${s.label}-${j}`} stat={s} />
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
