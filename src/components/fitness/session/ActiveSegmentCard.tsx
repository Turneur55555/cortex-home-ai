// ============================================================
// Carte d'un segment EN COURS (pendant générique de ActiveExerciseCard,
// côté musculation) — édition inline (label, distance, allure), case
// "réalisé", réordonnancement flèches haut/bas (pas de dnd-kit, retiré du
// projet le 2026-07-05) et suppression. Phase pilote : Course à pied.
//
// Ne connaît QUE le vocabulaire de métriques posé par
// src/lib/fitness/engines/courseEngine.ts (distance_m, pace_min_per_km,
// zone, elevation_m, max_heart_rate) ; toute autre clé est affichée en
// lecture seule sous forme de puce générique — reste robuste si un futur
// moteur (HYROX, Cardio...) réutilise cette même carte avec d'autres
// métriques, sans modification nécessaire ici.
// ============================================================

import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { ActiveGenericSegment } from "@/hooks/useGenericActiveSession";

const KNOWN_EDITABLE = new Set(["distance_m", "pace_min_per_km"]);

function readOnlyChips(metrics: Record<string, number | string>) {
  const entries = Object.entries(metrics).filter(([k]) => !KNOWN_EDITABLE.has(k));
  if (entries.length === 0) return null;
  const LABELS: Record<string, string> = {
    zone: "Zone FC",
    elevation_m: "Dénivelé+",
    max_heart_rate: "FC max",
  };
  const UNITS: Record<string, string> = { elevation_m: " m" };
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground"
        >
          <span className="text-muted-foreground">{LABELS[k] ?? k}</span>
          <span>
            {v}
            {UNITS[k] ?? ""}
          </span>
        </span>
      ))}
    </div>
  );
}

export function ActiveSegmentCard({
  segment,
  isFirst,
  isLast,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  segment: ActiveGenericSegment;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (fields: {
    label?: string;
    metrics?: Record<string, number | string>;
    completed?: boolean;
  }) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [label, setLabel] = useState(segment.label);
  const distanceKm =
    typeof segment.metrics.distance_m === "number" ? segment.metrics.distance_m / 1000 : undefined;
  const paceMinPerKm =
    typeof segment.metrics.pace_min_per_km === "number"
      ? segment.metrics.pace_min_per_km
      : undefined;
  const [distanceInput, setDistanceInput] = useState(distanceKm != null ? String(distanceKm) : "");
  const [paceInput, setPaceInput] = useState(paceMinPerKm != null ? String(paceMinPerKm) : "");

  return (
    <li
      className={`rounded-2xl border p-3 transition-colors ${
        segment.completed ? "border-primary/40 bg-primary/5" : "border-border bg-surface/60"
      }`}
    >
      <div className="flex items-start gap-2">
        <label className="mt-1 flex shrink-0 items-center">
          <input
            type="checkbox"
            checked={segment.completed}
            onChange={(e) => onUpdate({ completed: e.target.checked })}
            className="h-4 w-4 rounded border-border accent-primary"
            aria-label="Segment réalisé"
          />
        </label>

        <div className="min-w-0 flex-1">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => {
              if (label.trim() && label.trim() !== segment.label) onUpdate({ label: label.trim() });
            }}
            className="w-full truncate bg-transparent text-sm font-semibold text-foreground outline-none focus:underline"
          />

          <div className="mt-2 flex flex-wrap gap-2">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Distance (km)
              <input
                type="number"
                step="0.1"
                min="0"
                inputMode="decimal"
                value={distanceInput}
                onChange={(e) => setDistanceInput(e.target.value)}
                onBlur={() => {
                  const n = parseFloat(distanceInput.replace(",", "."));
                  if (!Number.isNaN(n) && n >= 0) {
                    onUpdate({ metrics: { ...segment.metrics, distance_m: Math.round(n * 1000) } });
                  }
                }}
                className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-xs font-semibold text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Allure (min/km)
              <input
                type="number"
                step="0.1"
                min="0"
                inputMode="decimal"
                value={paceInput}
                onChange={(e) => setPaceInput(e.target.value)}
                onBlur={() => {
                  const n = parseFloat(paceInput.replace(",", "."));
                  if (!Number.isNaN(n) && n >= 0) {
                    onUpdate({ metrics: { ...segment.metrics, pace_min_per_km: n } });
                  }
                }}
                className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-xs font-semibold text-foreground outline-none focus:border-primary"
              />
            </label>
          </div>

          {readOnlyChips(segment.metrics)}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label="Monter"
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 disabled:opacity-30"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="Descendre"
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 disabled:opacity-30"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Supprimer le segment"
            className="flex h-6 w-6 items-center justify-center rounded-full text-destructive/80 transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}
