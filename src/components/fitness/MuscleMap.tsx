import { useState, useMemo, useCallback } from "react";
import { useWorkouts } from "@/hooks/use-fitness";
import {
  computeRecovery,
  STATUS_LABELS,
  type MuscleRecovery,
  type RecoveryStatus,
} from "@/lib/fitness/recovery";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import { FrontView } from "./muscles/front";
import { BackView } from "./muscles/back";
import { Loader2 } from "lucide-react";

const FILL_COLORS: Record<RecoveryStatus, string> = {
  fatigued: "#EF444433",
  recovering: "#F9731633",
  ready: "#22C55E33",
  unknown: "#1F293700",
};

const STROKE_COLORS: Record<RecoveryStatus, string> = {
  fatigued: "#EF4444",
  recovering: "#F97316",
  ready: "#22C55E",
  unknown: "#374151",
};

const LEGEND: Array<{ status: RecoveryStatus; label: string; color: string }> = [
  { status: "fatigued", label: "Fatigué", color: "#EF4444" },
  { status: "recovering", label: "En récup.", color: "#F97316" },
  { status: "ready", label: "Prêt", color: "#22C55E" },
  { status: "unknown", label: "Inconnu", color: "#374151" },
];

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
      const r = recoveryMap.get(id);
      const status: RecoveryStatus = r?.status ?? "unknown";
      return { fill: FILL_COLORS[status], stroke: STROKE_COLORS[status] };
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
              style={{ backgroundColor: STROKE_COLORS[tooltip.muscle.status] }}
            />
            <span className="text-xs font-semibold text-white/90">{tooltip.muscle.label}</span>
          </div>
          <p className="mt-0.5 text-[10px] text-white/50">
            {tooltip.muscle.status === "unknown"
              ? "Aucune donnée récente"
              : tooltip.muscle.hoursSinceLast != null
                ? `${STATUS_LABELS[tooltip.muscle.status]} · il y a ${fmtHours(tooltip.muscle.hoursSinceLast)}`
                : STATUS_LABELS[tooltip.muscle.status]}
            {tooltip.muscle.hoursRemaining != null &&
              tooltip.muscle.hoursRemaining > 0 &&
              ` · encore ${fmtHours(tooltip.muscle.hoursRemaining)}`}
          </p>
        </div>
      )}

      {/* Légende */}
      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
        {LEGEND.map((l) => (
          <div key={l.status} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="text-[10px] font-medium text-white/50">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtHours(h: number): string {
  if (h < 1) return "<1h";
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}j`;
}
