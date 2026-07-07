// ============================================================
// Puce de statistique générique ("Durée" / "45 min") — brique de base
// du kit UI de séance. Utilisée par SessionSummaryCard et
// SessionSegmentList, jamais par une discipline directement.
// ============================================================

import type { SessionStat } from "@/lib/fitness/engines/types";

export function SessionStatChip({ stat }: { stat: SessionStat }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground">
      <span className="text-muted-foreground">{stat.label}</span>
      <span>{stat.value}</span>
    </span>
  );
}
