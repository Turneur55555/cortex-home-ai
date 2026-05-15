import { useCallback, useMemo, useState } from "react";
import Model from "react-body-highlighter";
import type { IMuscleStats, Muscle } from "react-body-highlighter";
import type { MuscleId } from "@/lib/fitness/muscleMapping";
import type { MuscleRecovery } from "@/lib/fitness/recovery";
import { RECOVERY_COLORS, RECOVERY_LEGEND } from "@/lib/fitness/recovery";
import {
  LIB_SLUG_TO_MUSCLE,
  recoveryMapToLibData,
} from "@/lib/fitness/mapping/reactBodyHighlighter.map";

// ─── Shared type (re-exported so CorpsTab doesn't define its own) ─────────────

export type MeasurementField =
  | "weight"
  | "muscle_mass"
  | "body_fat"
  | "chest"
  | "waist"
  | "hips"
  | "left_arm"
  | "right_arm"
  | "left_thigh"
  | "right_thigh";

// ─── Recovery mode ────────────────────────────────────────────────────────────

// Indexed by (frequency - 1): ready=0, recovering=1, fatigued=2
const RECOVERY_HIGHLIGHTED = [
  RECOVERY_COLORS.ready.stroke,
  RECOVERY_COLORS.recovering.stroke,
  RECOVERY_COLORS.fatigued.stroke,
] as const;

// ─── Measurement mode ─────────────────────────────────────────────────────────

// frequency=1 → subtle primary tint; frequency=2 → bright active zone
const MEASURE_HIGHLIGHTED = ["#6366F15C", "#6366F1EE"] as const;

// Which lib slugs belong to each measurement zone
const ZONE_SLUGS: Partial<Record<MeasurementField, string[]>> = {
  chest:       ["chest"],
  waist:       ["abs", "obliques"],
  hips:        ["gluteal", "lower-back"],
  right_arm:   ["biceps", "triceps", "forearm"],
  right_thigh: ["quadriceps", "hamstring"],
};

// Reverse: lib slug → MeasurementField (for onClick)
const SLUG_TO_ZONE: Partial<Record<string, MeasurementField>> = {
  chest:        "chest",
  abs:          "waist",
  obliques:     "waist",
  gluteal:      "hips",
  "lower-back": "hips",
  biceps:       "right_arm",
  triceps:      "right_arm",
  forearm:      "right_arm",
  quadriceps:   "right_thigh",
  hamstring:    "right_thigh",
};

// Labels shown in the tap hint
const ZONE_LABELS: Partial<Record<MeasurementField, string>> = {
  chest:       "Poitrine",
  waist:       "Taille",
  hips:        "Hanches",
  right_arm:   "Bras",
  right_thigh: "Cuisse",
};

// ─── Props ────────────────────────────────────────────────────────────────────

type RecoveryProps = {
  mode: "recovery";
  recoveryMap: Map<MuscleId, MuscleRecovery>;
  onMuscleClick?: (id: MuscleId) => void;
};

type MeasurementProps = {
  mode: "measurement";
  /** Latest body measurement row (values shown in tap hint) */
  latest?: Partial<Record<MeasurementField, number | null>> | null;
  onZoneClick: (field: MeasurementField) => void;
};

export type BodyMapProps = RecoveryProps | MeasurementProps;

// ─── Shared two-view renderer ─────────────────────────────────────────────────

function ModelViews({
  data,
  highlightedColors,
  onClick,
}: {
  data: Array<{ name: string; muscles: Muscle[]; frequency: number }>;
  highlightedColors: readonly string[];
  onClick: (stats: IMuscleStats) => void;
}) {
  const modelProps = {
    data,
    highlightedColors: [...highlightedColors],
    bodyColor: "#1F2937",
    onClick,
    svgStyle: { width: "100%", height: "auto" } as React.CSSProperties,
  };

  return (
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
  );
}

// ─── Recovery sub-component ───────────────────────────────────────────────────

function RecoveryBodyMap({ recoveryMap, onMuscleClick }: RecoveryProps) {
  const data = useMemo(
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
      const id = LIB_SLUG_TO_MUSCLE[stats.muscle];
      if (id) onMuscleClick(id);
    },
    [onMuscleClick],
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1A202C] p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90">Récupération musculaire</h3>
        <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">
          basé sur vos séances
        </span>
      </div>

      <ModelViews data={data} highlightedColors={RECOVERY_HIGHLIGHTED} onClick={handleClick} />

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

// ─── Measurement sub-component ────────────────────────────────────────────────

function MeasurementBodyMap({ latest, onZoneClick }: MeasurementProps) {
  const [activeZone, setActiveZone] = useState<MeasurementField | null>(null);

  const data = useMemo(
    () =>
      (Object.entries(ZONE_SLUGS) as Array<[MeasurementField, string[]]>).map(
        ([field, slugs]) => ({
          name: field,
          muscles: slugs as Muscle[],
          frequency: field === activeZone ? 2 : 1,
        }),
      ),
    [activeZone],
  );

  const handleClick = useCallback(
    (stats: IMuscleStats) => {
      const field = SLUG_TO_ZONE[stats.muscle];
      if (!field) return;
      setActiveZone(field);
      onZoneClick(field);
      setTimeout(() => setActiveZone(null), 450);
    },
    [onZoneClick],
  );

  const hint = useMemo(() => {
    if (!activeZone) return "Touchez une zone pour mesurer";
    const label = ZONE_LABELS[activeZone] ?? activeZone;
    const val = latest?.[activeZone];
    return `${label} · ${val != null ? `${val} cm` : "—"}`;
  }, [activeZone, latest]);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1A202C] p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/90">Silhouette interactive</h3>
        <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">
          Tap pour ajouter
        </span>
      </div>

      <ModelViews data={data} highlightedColors={MEASURE_HIGHLIGHTED} onClick={handleClick} />

      <p className="mt-3 text-center text-[11px] font-medium text-white/50 transition-all">
        {hint}
      </p>
    </div>
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function BodyMap(props: BodyMapProps) {
  if (props.mode === "recovery") return <RecoveryBodyMap {...props} />;
  return <MeasurementBodyMap {...props} />;
}
