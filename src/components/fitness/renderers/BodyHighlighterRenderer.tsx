import { useMemo, useCallback } from "react";
import Model from "react-body-highlighter";
import type { IMuscleStats, Muscle } from "react-body-highlighter";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import type { MuscleRecovery } from "@/lib/fitness/recovery";
import { RECOVERY_COLORS, RECOVERY_LEGEND } from "@/lib/fitness/recovery";
import {
  recoveryMapToLibData,
  LIB_SLUG_TO_MUSCLE,
} from "@/lib/fitness/mapping/reactBodyHighlighter.map";

// Indexed by (frequency - 1): ready=0, recovering=1, fatigued=2
const HIGHLIGHTED_COLORS = [
  RECOVERY_COLORS.ready.stroke,
  RECOVERY_COLORS.recovering.stroke,
  RECOVERY_COLORS.fatigued.stroke,
];

interface Props {
  recoveryMap: Map<MuscleId, MuscleRecovery>;
  onMuscleClick?: (muscle: MuscleId) => void;
}

export function BodyHighlighterRenderer({ recoveryMap, onMuscleClick }: Props) {
  const libData = useMemo(
    () =>
      recoveryMapToLibData(recoveryMap).map((d) => ({
        ...d,
        muscles: d.muscles as Muscle[],
      })),
    [recoveryMap],
  );

  const handleClick = useCallback(
    (stats: IMuscleStats) => {
      if (!onMuscleClick) return;
      const muscleId = LIB_SLUG_TO_MUSCLE[stats.muscle];
      if (muscleId) onMuscleClick(muscleId);
    },
    [onMuscleClick],
  );

  const modelProps = {
    data: libData,
    highlightedColors: HIGHLIGHTED_COLORS,
    bodyColor: "#1F2937",
    onClick: handleClick,
    svgStyle: { width: "100%", height: "auto" } as React.CSSProperties,
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1A202C] p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90">Récupération musculaire</h3>
        <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">
          basé sur vos séances
        </span>
      </div>

      <div className="mx-auto flex max-w-[400px] justify-center gap-1">
        <div className="flex flex-1 flex-col items-center">
          <span className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-white/30">
            Face
          </span>
          <Model {...modelProps} type="anterior" />
        </div>
        <div className="flex flex-1 flex-col items-center">
          <span className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-white/30">
            Dos
          </span>
          <Model {...modelProps} type="posterior" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
        {RECOVERY_LEGEND.map((l) => (
          <div key={l.status} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="text-[10px] font-medium text-white/50">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
