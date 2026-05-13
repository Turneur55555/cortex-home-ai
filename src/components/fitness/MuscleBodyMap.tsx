import { useState, useCallback, useMemo } from "react";
import { useWorkouts } from "@/hooks/use-fitness";
import {
  computeRecovery,
  STATUS_LABELS,
  type MuscleRecovery,
  type RecoveryStatus,
} from "@/lib/fitness/recovery";
import { Loader2 } from "lucide-react";

const MUSCLE_ID_MAP: Record<string, string> = {
  pec_l: "pectoraux", pec_r: "pectoraux",
  delt_fl: "epaules", delt_fr: "epaules",
  rdel_l: "epaules", rdel_r: "epaules",
  bic_l: "biceps", bic_r: "biceps",
  tri_l: "triceps", tri_r: "triceps",
  fore_l: "avant-bras", fore_r: "avant-bras",
  fare_l: "avant-bras", fare_r: "avant-bras",
  abs_1l: "abdos", abs_1r: "abdos",
  abs_2l: "abdos", abs_2r: "abdos",
  abs_3l: "abdos", abs_3r: "abdos",
  obl_l: "obliques", obl_r: "obliques",
  quad_l: "quadriceps", quad_r: "quadriceps",
  tib_l: "mollets", tib_r: "mollets",
  calf_fl: "mollets", calf_fr: "mollets",
  trap: "trapeze", trap_l: "trapeze", trap_r: "trapeze",
  lat_l: "dos", lat_r: "dos",
  lb: "lombaires",
  glu_l: "fessiers", glu_r: "fessiers",
  ham_l: "ischio", ham_r: "ischio",
  calf_bl: "mollets", calf_br: "mollets",
};

const STATE_COLORS: Record<RecoveryStatus, { fill: string; stroke: string }> = {
  fatigued: { fill: "#ef444428", stroke: "#ef4444" },
  recovering: { fill: "#f9731628", stroke: "#f97316" },
  ready: { fill: "#22c55e28", stroke: "#22c55e" },
  unknown: { fill: "#ffffff06", stroke: "#374151" },
};

const LEGEND = [
  { status: "fatigued" as RecoveryStatus, label: "Fatigué", color: "#ef4444" },
  { status: "recovering" as RecoveryStatus, label: "En récup.", color: "#f97316" },
  { status: "ready" as RecoveryStatus, label: "Prêt", color: "#22c55e" },
  { status: "unknown" as RecoveryStatus, label: "Inconnu", color: "#374151" },
];

type Tooltip = { x: number; y: number; recovery: MuscleRecovery };

interface MusclePathData {
  id: string;
  name: string;
  d: string;
}

interface BodyData {
  front: { silhouette: string; muscles: MusclePathData[] };
  back: { silhouette: string; muscles: MusclePathData[] };
}

function MuscleView({
  view,
  data,
  getColors,
  onMuscle,
  onLeave,
}: {
  view: "FACE" | "DOS";
  data: BodyData["front"] | BodyData["back"];
  getColors: (svgId: string) => { fill: string; stroke: string };
  onMuscle: (svgId: string, e: React.MouseEvent) => void;
  onLeave: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center">
      <span className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-white/30">
        {view}
      </span>
      <svg viewBox="0 0 200 500" width="100%" style={{ overflow: "visible" }}>
        <path
          d={data.silhouette}
          fill="#111827"
          stroke="#4b5563"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {data.muscles.map((m) => {
          const c = getColors(m.id);
          return (
            <path
              key={m.id}
              d={m.d}
              fill={c.fill}
              stroke={c.stroke}
              strokeWidth="0.8"
              strokeLinejoin="round"
              style={{ cursor: "pointer", transition: "fill 0.25s, stroke 0.25s" }}
              onClick={(e) => onMuscle(m.id, e)}
              onMouseMove={(e) => onMuscle(m.id, e)}
              onMouseLeave={onLeave}
            />
          );
        })}
      </svg>
    </div>
  );
}

export function MuscleBodyMap() {
  const { data: workouts, isLoading } = useWorkouts();
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [bodyData, setBodyData] = useState<BodyData | null>(null);
  const [loadError, setLoadError] = useState(false);

  useMemo(() => {
    import("@/data/bodymap-paths.json")
      .then((m) => setBodyData(m.default as BodyData))
      .catch(() => setLoadError(true));
  }, []);

  const recoveryMap = useMemo(() => {
    if (!workouts) return new Map<string, MuscleRecovery>();
    return computeRecovery(
      workouts.map((w) => ({
        date: w.date,
        exercises: w.exercises?.map((ex) => ({ name: ex.name })) ?? null,
      }))
    );
  }, [workouts]);

  const getColors = useCallback(
    (svgId: string) => {
      const muscleId = MUSCLE_ID_MAP[svgId];
      if (!muscleId) return STATE_COLORS.unknown;
      const r = recoveryMap.get(muscleId as never);
      return STATE_COLORS[r?.status ?? "unknown"];
    },
    [recoveryMap]
  );

  const handleMuscle = useCallback(
    (svgId: string, e: React.MouseEvent) => {
      const muscleId = MUSCLE_ID_MAP[svgId];
      if (!muscleId) return;
      const r = recoveryMap.get(muscleId as never);
      if (!r) return;
      const rect = (e.currentTarget as SVGElement)
        .closest(".muscle-body-map")
        ?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 48, recovery: r });
    },
    [recoveryMap]
  );

  const hideTooltip = useCallback(() => setTooltip(null), []);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-white/10 bg-[#13151a]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !bodyData) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-white/10 bg-[#13151a] text-xs text-white/40">
        Carte musculaire indisponible
      </div>
    );
  }

  return (
    <div className="muscle-body-map relative rounded-2xl border border-white/10 bg-[#13151a] p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90">Récupération musculaire</h3>
        <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">
          basé sur vos séances
        </span>
      </div>

      <div className="mx-auto flex max-w-[420px] justify-center gap-2">
        <MuscleView
          view="FACE"
          data={bodyData.front}
          getColors={getColors}
          onMuscle={handleMuscle}
          onLeave={hideTooltip}
        />
        <MuscleView
          view="DOS"
          data={bodyData.back}
          getColors={getColors}
          onMuscle={handleMuscle}
          onLeave={hideTooltip}
        />
      </div>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-white/10 bg-[#0f1419] px-3 py-2 shadow-lg"
          style={{
            left: Math.min(tooltip.x, 220),
            top: Math.max(tooltip.y, 0),
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: STATE_COLORS[tooltip.recovery.status].stroke }}
            />
            <span className="text-xs font-semibold text-white/90">{tooltip.recovery.label}</span>
          </div>
          <p className="mt-0.5 text-[10px] text-white/50">
            {tooltip.recovery.status === "unknown"
              ? "Aucune donnée récente"
              : tooltip.recovery.hoursSinceLast != null
                ? `${STATUS_LABELS[tooltip.recovery.status]} · il y a ${fmtHours(tooltip.recovery.hoursSinceLast)}`
                : STATUS_LABELS[tooltip.recovery.status]}
            {tooltip.recovery.hoursRemaining != null &&
              tooltip.recovery.hoursRemaining > 0 &&
              ` · encore ${fmtHours(tooltip.recovery.hoursRemaining)}`}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1.5 border-t border-white/5 pt-3">
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
