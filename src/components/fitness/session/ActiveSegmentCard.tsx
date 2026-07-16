// ============================================================
// Carte d'UNE répétition, en séance active — pendant générique de la
// ligne de série musculation (SetRow, exerciseCard/ActiveExerciseCard.tsx),
// regroupée par exercice dans ActiveExerciseCard (kind="generic").
//
// Phase C, lot V3 (2026-07-15, "la carte Exercice") : alignée sur la
// hiérarchie et les interactions de la ligne de série musculation, avec
// les MÊMES primitives (ExerciseCardSetIndex/ExerciseCardSetRow-like,
// ExerciseCardStatField) — jamais une copie du vocabulaire muscu :
// - capsule numérotée + flèche de tendance vs la même répétition de la
//   DERNIÈRE séance (direction déclarée par SEGMENT_METRIC_CONFIG :
//   une allure plus basse est une progression) ;
// - les métriques "primary" deviennent les grands champs tactiles de la
//   ligne (placeholder = valeur de la dernière séance, comme les kg/reps
//   muscu) ; les métriques secondaires + le libellé passent sur une
//   ligne compacte en dessous — densité et lisibilité d'abord ;
// - gros bouton de validation rond (glow succès) au lieu de la case à
//   cocher 16px ; suppression avec confirmation inline (comme SetRow).
// Le réordonnancement flèches haut/bas (pas de dnd-kit, retiré du projet
// le 2026-07-05) et l'édition du libellé restent disponibles — aucune
// capacité retirée, seulement re-hiérarchisée.
//
// Vocabulaire utilisateur : "répétition" (jamais "segment", qui reste un
// mot de code — voir docs/architecture/phase-a-nouvelle-seance.md).
// ============================================================

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Minus, Trash2 } from "lucide-react";
import type { ActiveGenericSegment } from "@/hooks/useGenericActiveSession";
import { SEGMENT_METRIC_CONFIG } from "@/lib/fitness/segmentStats";
import {
  ExerciseCardSetIndex,
  ExerciseCardStatField,
} from "../exerciseCard/ExerciseCardPrimitives";

const DISPLAY_TRANSFORMS: Record<
  string,
  { toDisplay: (v: number) => number; toStorage: (v: number) => number }
> = {
  distance_m: { toDisplay: (v) => v / 1000, toStorage: (v) => Math.round(v * 1000) },
};

// Unité courte affichée sous le champ tactile (pendant de "kg"/"reps") —
// pure présentation de saisie, le libellé long reste SEGMENT_METRIC_CONFIG.
const INPUT_UNITS: Record<string, string> = {
  distance_m: "km",
  pace_min_per_km: "min/km",
  speed_kmh: "km/h",
  incline_pct: "%",
  escalier_level: "niveau",
  resistance: "résist.",
  cadence_rpm: "rpm",
  charge_kg: "kg",
  reps: "reps",
  rounds: "tours",
  duration_min: "min",
  calories_estimate: "kcal",
  duration_s: "sec",
  pace_per_500m: "min/500m",
  watts: "W",
  stroke_rate_spm: "spm",
  heart_rate_bpm: "bpm",
};

function metricLabel(key: string): string {
  return SEGMENT_METRIC_CONFIG[key]?.label ?? key;
}

function inputUnit(key: string): string {
  return INPUT_UNITS[key] ?? metricLabel(key).toLowerCase().slice(0, 7);
}

function toDisplayString(key: string, value: number | string | undefined | null): string {
  if (typeof value !== "number") return "";
  const transform = DISPLAY_TRANSFORMS[key];
  const displayed = transform ? transform.toDisplay(value) : value;
  // Jamais de traîne flottante dans un placeholder (2.0000000000000004).
  return String(Math.round(displayed * 100) / 100);
}

/** Tendance vs la même répétition de la dernière séance, sur la 1re
 *  métrique primary renseignée — "up" = progression au sens de la
 *  direction déclarée (une allure PLUS BASSE progresse). */
function compareToLast(
  keys: string[],
  metrics: Record<string, number | string>,
  lastMetrics: Record<string, number | string> | null,
): "up" | "down" | "equal" | null {
  if (!lastMetrics) return null;
  for (const key of keys) {
    const config = SEGMENT_METRIC_CONFIG[key];
    if (!config || config.importance !== "primary") continue;
    const cur = metrics[key];
    const last = lastMetrics[key];
    if (typeof cur !== "number" || typeof last !== "number") continue;
    if (cur === last) return "equal";
    const better = config.direction === "min" ? cur < last : cur > last;
    return better ? "up" : "down";
  }
  return null;
}

function TrendIcon({ trend }: { trend: "up" | "down" | "equal" | null }) {
  if (!trend) return null;
  if (trend === "up") return <ArrowUp className="h-3 w-3 text-success" aria-label="Progression" />;
  if (trend === "down")
    return <ArrowDown className="h-3 w-3 text-destructive" aria-label="Régression" />;
  return <Minus className="h-3 w-3 text-muted-foreground/50" aria-label="Identique" />;
}

export function ActiveSegmentCard({
  segment,
  knownKeys,
  index,
  lastRepMetrics = null,
  isFirst,
  isLast,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  segment: ActiveGenericSegment;
  /** Union des clés de métriques utilisées par les répétitions sœurs du
   *  même exercice (voir exerciseCard/ActiveExerciseCard.tsx (kind="generic")) — permet à une
   *  répétition fraîchement ajoutée (metrics vide) d'afficher les mêmes
   *  champs éditables que ses sœurs. Défaut : clés de cette répétition
   *  seule. */
  knownKeys?: string[];
  /** Numéro d'affichage de la répétition dans son exercice (1-based). */
  index: number;
  /** Métriques de la répétition de MÊME rang de la dernière séance —
   *  alimente placeholders et flèche de tendance (le duel, lot V3). */
  lastRepMetrics?: Record<string, number | string> | null;
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
  const [confirmDel, setConfirmDel] = useState(false);

  const fieldKeys = knownKeys && knownKeys.length > 0 ? knownKeys : Object.keys(segment.metrics);
  // Grands champs de la ligne : métriques primary (max 2, ordonnées par la
  // config) — le reste passe en ligne secondaire compacte.
  const orderedKeys = [...fieldKeys].sort(
    (a, b) => (SEGMENT_METRIC_CONFIG[a]?.order ?? 99) - (SEGMENT_METRIC_CONFIG[b]?.order ?? 99),
  );
  const primaryKeys = orderedKeys
    .filter((k) => SEGMENT_METRIC_CONFIG[k]?.importance === "primary")
    .slice(0, 2);
  const secondaryKeys = orderedKeys.filter((k) => !primaryKeys.includes(k));

  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const key of fieldKeys) {
      const value = segment.metrics[key];
      if (typeof value !== "number") continue;
      initial[key] = toDisplayString(key, value);
    }
    return initial;
  });

  // Reflète une mise à jour externe ("Reprendre les valeurs précédentes",
  // lot V3) dans les champs — même principe que les useEffect de SetRow.
  useEffect(() => {
    setInputs((prev) => {
      const next = { ...prev };
      for (const key of fieldKeys) {
        const value = segment.metrics[key];
        next[key] = typeof value === "number" ? toDisplayString(key, value) : "";
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment.metrics]);

  const commitMetric = (key: string, raw: string) => {
    const n = parseFloat(raw.replace(",", "."));
    if (Number.isNaN(n)) return;
    const transform = DISPLAY_TRANSFORMS[key];
    onUpdate({ metrics: { ...segment.metrics, [key]: transform ? transform.toStorage(n) : n } });
  };

  // Valeurs textuelles (rares) : affichées en lecture seule, jamais
  // éditées ici (pas de vocabulaire générique de saisie texte par clé).
  const textOnlyEntries = Object.entries(segment.metrics).filter(([, v]) => typeof v !== "number");

  const done = segment.completed;
  const trend = compareToLast(orderedKeys, segment.metrics, lastRepMetrics);

  if (confirmDel) {
    return (
      <li className="flex items-center justify-between gap-2 rounded-2xl bg-destructive/10 px-4 py-3 animate-in fade-in zoom-in-95 duration-150">
        <span className="text-xs font-medium text-muted-foreground">
          Supprimer la répétition {index} ?
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmDel(false)}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground"
          >
            Non
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg bg-destructive/20 px-2.5 py-1 text-xs font-bold text-destructive"
          >
            Oui
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`group rounded-2xl py-1 pl-1 pr-1 transition-colors ${
        done ? "bg-success/[0.07]" : ""
      }`}
    >
      {/* Ligne principale — même gabarit que la ligne de série muscu. */}
      <div className="flex items-center gap-1.5">
        <ExerciseCardSetIndex>
          <span
            className={`text-sm font-extrabold tabular-nums leading-none ${
              done ? "text-success" : "text-foreground"
            }`}
          >
            {index}
          </span>
          {trend && (
            <span className="absolute -right-1 -top-1 rounded-full bg-background p-px">
              <TrendIcon trend={trend} />
            </span>
          )}
        </ExerciseCardSetIndex>

        {primaryKeys.length > 0 ? (
          primaryKeys.map((key) => (
            <ExerciseCardStatField
              key={key}
              value={inputs[key] ?? ""}
              onChange={(v) => setInputs((prev) => ({ ...prev, [key]: v }))}
              onCommit={(v) => commitMetric(key, v)}
              placeholder={toDisplayString(key, lastRepMetrics?.[key])}
              unit={inputUnit(key)}
              step="0.1"
            />
          ))
        ) : (
          <div className="flex h-12 flex-1 items-center rounded-[14px] bg-white/[0.03] px-3">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                if (label.trim() && label.trim() !== segment.label)
                  onUpdate({ label: label.trim() });
              }}
              className="w-full truncate bg-transparent text-sm font-semibold text-foreground outline-none"
              aria-label="Libellé de la répétition"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => onUpdate({ completed: !done })}
          aria-label={done ? "Répétition validée" : "Valider la répétition"}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-90 ${
            done
              ? "bg-success text-success-foreground shadow-[0_0_0_4px_rgba(34,197,94,0.12)]"
              : "bg-white/[0.06] text-muted-foreground/40 hover:text-muted-foreground"
          }`}
        >
          <Check
            className={`h-5 w-5 transition-transform duration-200 ${done ? "scale-100" : "scale-90"}`}
            strokeWidth={done ? 3 : 2.5}
          />
        </button>

        <div className="flex shrink-0 flex-col items-center">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label="Monter"
            className="flex h-5 w-6 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:text-foreground disabled:opacity-20"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="Descendre"
            className="flex h-5 w-6 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:text-foreground disabled:opacity-20"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setConfirmDel(true)}
          className="flex h-11 w-8 shrink-0 items-center justify-center text-muted-foreground/25 transition-colors hover:text-destructive"
          aria-label="Supprimer la répétition"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Ligne secondaire — libellé éditable (quand les grands champs
          occupent la ligne) + métriques secondaires + valeurs texte. */}
      {(primaryKeys.length > 0 || secondaryKeys.length > 0 || textOnlyEntries.length > 0) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-[46px] pr-1 pb-1">
          {primaryKeys.length > 0 && (
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                if (label.trim() && label.trim() !== segment.label)
                  onUpdate({ label: label.trim() });
              }}
              className="min-w-0 flex-1 basis-24 truncate bg-transparent text-[11px] text-muted-foreground/70 outline-none focus:text-foreground focus:underline"
              aria-label="Libellé de la répétition"
            />
          )}
          {secondaryKeys.map((key) => (
            <label
              key={key}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/70"
            >
              {metricLabel(key)}
              <input
                type="number"
                step="0.1"
                inputMode="decimal"
                value={inputs[key] ?? ""}
                placeholder={toDisplayString(key, lastRepMetrics?.[key])}
                onChange={(e) => setInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                onBlur={() => commitMetric(key, inputs[key] ?? "")}
                className="w-14 rounded-lg border border-border bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/30"
              />
            </label>
          ))}
          {textOnlyEntries.map(([k, v]) => (
            <span key={k} className="text-[11px] text-muted-foreground/70">
              <span className="text-muted-foreground/50">{metricLabel(k)} </span>
              <span className="font-semibold text-foreground/80">{v}</span>
            </span>
          ))}
        </div>
      )}
    </li>
  );
}
