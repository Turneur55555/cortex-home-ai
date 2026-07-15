// ============================================================
// Liste d'exercices d'une séance passée, pour TOUTE discipline non-muscu
// (Cardio/HYROX/Course/Guidé/Autre) — pendant de la liste d'exercices de
// WorkoutCard.tsx (musculation) pour l'historique. Fusion de
// CourseHistoryContent.tsx + DisciplineHistoryContent.tsx (Addendum Phase B,
// 2026-07-15, retour de Nathan : plus de rendu par discipline, un seul
// composant pour toutes, "Autre" inclus désormais — ses segments ont un
// label groupable comme les autres, voir freeformEngine.ts).
//
// Même ligne exercice que WorkoutCard : icône, méta "N répétitions",
// chevron, accordéon des répétitions (métriques via SessionStatChip),
// bouton Statistiques → SegmentAnalysisSheet. Seule différence "capacité" :
// pas de photo (pas de notion de photo d'exercice hors musculation) ni de
// badge PR (pas de système de records générique — voir addendum 6.4).
// ============================================================

import { useMemo, useState } from "react";
import { BarChart3, ChevronRight, Repeat } from "lucide-react";
import type { DisciplineId, SessionView } from "@/lib/fitness/engines/types";
import { groupByExerciseLabel } from "@/lib/fitness/segmentStats";
import { SessionStatChip } from "./SessionStatChip";
import { SegmentAnalysisSheet } from "./SegmentAnalysisSheet";

export function GenericHistoryExerciseList({
  view,
  discipline,
}: {
  view: SessionView;
  discipline: DisciplineId;
}) {
  const [statsLabel, setStatsLabel] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const groups = useMemo(() => groupByExerciseLabel(view.segments), [view.segments]);

  if (groups.length === 0) return null;

  return (
    <>
      <ul className="space-y-3">
        {groups.map((g) => {
          const repCount = g.instances.length;
          const doneCount = g.instances.filter((seg) =>
            seg.stats.some((s) => s.label === "Statut" && s.value === "Réalisé"),
          ).length;
          const isOpen = expandedKeys.has(g.key);
          return (
            <li
              key={g.key}
              className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03]"
            >
              <div
                className="flex cursor-pointer select-none items-center gap-3 p-3"
                onClick={() =>
                  setExpandedKeys((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.key)) next.delete(g.key);
                    else next.add(g.key);
                    return next;
                  })
                }
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary/70">
                  <Repeat className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-bold leading-tight tracking-tight break-words">
                    {g.displayLabel}
                  </h3>
                  <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                    {repCount} répétition{repCount > 1 ? "s" : ""}
                    {doneCount > 0 && doneCount < repCount && (
                      <>
                        {" "}
                        · {doneCount} réalisée{doneCount > 1 ? "s" : ""}
                      </>
                    )}
                  </p>
                </div>

                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-90" : ""}`}
                />

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setStatsLabel(g.instances[0].label);
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-all active:scale-90"
                  aria-label="Statistiques"
                >
                  <BarChart3 className="h-4 w-4" />
                </button>
              </div>

              <div
                className="overflow-hidden transition-all duration-300 ease-out"
                style={{ maxHeight: isOpen ? "800px" : "0px", opacity: isOpen ? 1 : 0 }}
              >
                <div className="mx-3 mb-3 space-y-2">
                  {g.instances.map((seg, i) => (
                    <div
                      key={`${g.key}-${i}`}
                      className="rounded-xl border border-white/5 bg-black/20 p-2.5"
                    >
                      {seg.stats.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {seg.stats.map((s, j) => (
                            <SessionStatChip key={`${s.label}-${j}`} stat={s} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground/60">Répétition {i + 1}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {statsLabel && (
        <SegmentAnalysisSheet
          rawLabel={statsLabel}
          discipline={discipline}
          onClose={() => setStatsLabel(null)}
        />
      )}
    </>
  );
}
