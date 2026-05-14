import { useState, useMemo, useCallback } from "react";
import { useWorkouts } from "@/hooks/use-fitness";
import {
  computeRecovery,
  RECOVERY_COLORS,
  RECOVERY_LABELS,
  RECOVERY_LEGEND,
  type MuscleRecovery,
  type RecoveryStatus,
} from "@/lib/fitness/recovery";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import { FrontView } from "./muscles/front";
import { BackView } from "./muscles/back";
import { fmtHours } from "@/utils/fitness/formatting";
import { Loader2 } from "lucide-react";

type Tooltip = {
  x: number;
  y: number;
  muscle: MuscleRecovery;
};

export function MuscleMap() {
  const { data: workouts, isLoading } = useWorkouts();
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const recoveryMap = useMemo(() => {
    if (!workouts) return new Map<MuscleId, MuscleRecovery>();
    const mapped = workouts.map((w) => ({
      date: w.date,
      exercises: w.exercises?.map((ex) => ({ name: ex.name })) ?? null,
    }));
    return computeRecovery(mapped);
  }, [workouts]);

  const getColor = useCallback(
    (id: MuscleId) => {
      const status: RecoveryStatus = recoveryMap.get(id)?.status ?? "unknown";
      return RECOVERY_COLORS[status];
    },
    [recoveryMap],
  );

  const handleMuscle = useCallback(
    (id: MuscleId, e: React.MouseEvent) => {
      const r = recoveryMap.get(id);
      if (!r) return;
      const rect = (e.currentTarget as SVGElement).closest(".muscle-map")?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 48,
        muscle: r,
      });
    },
    [recoveryMap],
  );

  const hideTooltip = useCallback(() => setTooltip(null), []);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-white/10 bg-[#1A202C]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="muscle-map relative rounded-2xl border border-white/10 bg-[#1A202C] p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90">Récupération musculaire</h3>
        <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">
          basé sur vos séances
        </span>
      </div>

      {/* Silhouettes côte à côte */}
      <div className="mx-auto flex max-w-[400px] justify-center gap-1">
        <div className="flex flex-1 flex-col items-center">
          <span className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-white/30">
            Face
          </span>
          <FrontView getColor={getColor} onMuscle={handleMuscle} onLeave={hideTooltip} />
        </div>
        <div className="flex flex-1 flex-col items-center">
          <span className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-white/30">
            Dos
          </span>
          <BackView getColor={getColor} onMuscle={handleMuscle} onLeave={hideTooltip} />
        </div>
      </div>

      {/* Tooltip flottant */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-white/10 bg-[#0f1419] px-3 py-2 shadow-lg"
          style={{
            left: Math.min(tooltip.x, 200),
            top: Math.max(tooltip.y, 0),
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: RECOVERY_COLORS[tooltip.muscle.status].stroke }}
            />
            <span className="text-xs font-semibold text-white/90">{tooltip.muscle.label}</span>
          </div>
          <p className="mt-0.5 text-[10px] text-white/50">
            {tooltip.muscle.status === "unknown"
              ? "Aucune donnée récente"
              : tooltip.muscle.hoursSinceLast != null
                ? `${RECOVERY_LABELS[tooltip.muscle.status]} · il y a ${fmtHours(tooltip.muscle.hoursSinceLast)}`
                : RECOVERY_LABELS[tooltip.muscle.status]}
            {tooltip.muscle.hoursRemaining != null &&
              tooltip.muscle.hoursRemaining > 0 &&
              ` · encore ${fmtHours(tooltip.muscle.hoursRemaining)}`}
          </p>
        </div>
      )}

      {/* Légende */}
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

