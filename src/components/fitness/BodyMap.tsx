import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
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
  chest: ["chest"],
  waist: ["abs", "obliques"],
  hips: ["gluteal", "lower-back"],
  right_arm: ["biceps", "triceps", "forearm"],
  right_thigh: ["quadriceps", "hamstring"],
};

// Reverse: lib slug → MeasurementField (for onClick)
const SLUG_TO_ZONE: Partial<Record<string, MeasurementField>> = {
  chest: "chest",
  abs: "waist",
  obliques: "waist",
  gluteal: "hips",
  "lower-back": "hips",
  biceps: "right_arm",
  triceps: "right_arm",
  forearm: "right_arm",
  quadriceps: "right_thigh",
  hamstring: "right_thigh",
};

// Labels shown in the tap hint
const ZONE_LABELS: Partial<Record<MeasurementField, string>> = {
  chest: "Poitrine",
  waist: "Taille",
  hips: "Hanches",
  right_arm: "Bras",
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
  bodyColor = "#1F2937",
  maxWidthPx = 400,
  labelClassName = "mb-1 text-[9px] font-semibold uppercase tracking-wider text-white/30",
}: {
  data: Array<{ name: string; muscles: Muscle[]; frequency: number }>;
  highlightedColors: readonly string[];
  onClick: (stats: IMuscleStats) => void;
  bodyColor?: string;
  maxWidthPx?: number;
  labelClassName?: string;
}) {
  const modelProps = {
    data,
    highlightedColors: [...highlightedColors],
    bodyColor,
    onClick,
    svgStyle: { width: "100%", height: "auto" } as React.CSSProperties,
  };

  return (
    <div className="mx-auto flex justify-center gap-1" style={{ maxWidth: maxWidthPx }}>
      <div className="flex flex-1 flex-col items-center">
        <span className={labelClassName}>Face</span>
        <Model {...modelProps} type="anterior" />
      </div>
      <div className="flex flex-1 flex-col items-center">
        <span className={labelClassName}>Dos</span>
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
    <div
      className="relative overflow-hidden rounded-3xl border p-3 shadow-card"
      style={{
        borderColor: "rgba(103,232,249,0.14)",
        background:
          "radial-gradient(120% 70% at 50% 0%, rgba(56,189,248,0.10) 0%, transparent 55%), radial-gradient(90% 60% at 100% 100%, rgba(167,139,250,0.10) 0%, transparent 60%), linear-gradient(180deg,#0b0f18 0%,#05070c 100%)",
      }}
    >
      {/* Trame divine — grille fine évoquant un scanner */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(103,232,249,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.6) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />

      {/* Balayage de scan — respiration lente, non intrusive */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 h-16"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, rgba(103,232,249,0.10) 50%, transparent 100%)",
        }}
        animate={{ top: ["-8%", "104%"] }}
        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
      />

      {/* Réticules d'angle — évoque une analyse instrumentée, pas un schéma anatomique */}
      {[
        "left-2 top-2 border-l border-t",
        "right-2 top-2 border-r border-t",
        "left-2 bottom-2 border-l border-b",
        "right-2 bottom-2 border-r border-b",
      ].map((pos) => (
        <span
          key={pos}
          aria-hidden
          className={`pointer-events-none absolute h-3 w-3 rounded-[2px] ${pos}`}
          style={{ borderColor: "rgba(103,232,249,0.35)" }}
        />
      ))}

      <div className="relative mb-2 flex items-center justify-between">
        <h3 className="font-serif text-[13px] font-semibold italic text-cyan-100/90">
          Scan des Titans
        </h3>
        <span className="text-[9.5px] font-medium uppercase tracking-wider text-white/35">
          basé sur tes séances
        </span>
      </div>

      <div className="relative">
        <ModelViews
          data={data}
          highlightedColors={RECOVERY_HIGHLIGHTED}
          onClick={handleClick}
          bodyColor="#151a26"
          maxWidthPx={290}
          labelClassName="mb-0.5 text-[8.5px] font-semibold uppercase tracking-wider text-cyan-100/25"
        />
      </div>

      <div className="relative mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {RECOVERY_LEGEND.map((l) => (
          <div key={l.status} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: l.color, boxShadow: `0 0 6px ${l.color}` }}
            />
            <span className="text-[9.5px] font-medium text-white/50">{l.label}</span>
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
      (Object.entries(ZONE_SLUGS) as Array<[MeasurementField, string[]]>).map(([field, slugs]) => ({
        name: field,
        muscles: slugs as Muscle[],
        frequency: field === activeZone ? 2 : 1,
      })),
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
