// ============================================================
// Carte d'UNE répétition, en séance active — pendant générique de
// ActiveSet (musculation), regroupée par exercice dans
// exerciseCard/ActiveExerciseCard.tsx (kind="generic"). Édition inline (label + toutes les
// métriques de la répétition), case "réalisée", réordonnancement flèches
// haut/bas (pas de dnd-kit, retiré du projet le 2026-07-05) et
// suppression.
//
// GÉNÉRALISATION (15/07/2026, retour de Nathan) : ce composant était
// écrit pour le seul pilote Course (2 champs codés en dur distance/allure
// + une mini-table de 3 libellés pour le reste, toute autre clé
// s'affichait en snake_case brut). Il est maintenant 100% générique :
// CHAQUE métrique de la répétition devient un champ éditable, avec son
// vrai libellé via SEGMENT_METRIC_CONFIG (segmentStats.ts — déjà la
// table déclarative labels/formats partagée par toutes les disciplines).
// `DISPLAY_TRANSFORMS` reste le seul point de connaissance spécifique
// (aujourd'hui : distance_m stocké en mètres mais plus naturel à éditer
// en km) — toute autre métrique s'édite directement dans son unité de
// stockage. `knownKeys` (fourni par ActiveExerciseCard) permet à
// une répétition nouvellement ajoutée (metrics vide) d'afficher les
// mêmes champs que ses répétitions sœurs, prêts à remplir.
//
// Vocabulaire utilisateur : "répétition" (jamais "segment", qui reste un
// mot de code — voir docs/architecture/phase-a-nouvelle-seance.md).
// ============================================================

import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { ActiveGenericSegment } from "@/hooks/useGenericActiveSession";
import { SEGMENT_METRIC_CONFIG } from "@/lib/fitness/segmentStats";

const DISPLAY_TRANSFORMS: Record<
  string,
  { toDisplay: (v: number) => number; toStorage: (v: number) => number }
> = {
  distance_m: { toDisplay: (v) => v / 1000, toStorage: (v) => Math.round(v * 1000) },
};

function metricLabel(key: string): string {
  return SEGMENT_METRIC_CONFIG[key]?.label ?? key;
}

export function ActiveSegmentCard({
  segment,
  knownKeys,
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

  const fieldKeys = knownKeys && knownKeys.length > 0 ? knownKeys : Object.keys(segment.metrics);

  const [inputs, setInputs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const key of fieldKeys) {
      const value = segment.metrics[key];
      if (typeof value !== "number") continue;
      const transform = DISPLAY_TRANSFORMS[key];
      initial[key] = String(transform ? transform.toDisplay(value) : value);
    }
    return initial;
  });

  const commitMetric = (key: string, raw: string) => {
    const n = parseFloat(raw.replace(",", "."));
    if (Number.isNaN(n)) return;
    const transform = DISPLAY_TRANSFORMS[key];
    onUpdate({ metrics: { ...segment.metrics, [key]: transform ? transform.toStorage(n) : n } });
  };

  // Valeurs textuelles (rares) : affichées en lecture seule, jamais
  // éditées ici (pas de vocabulaire générique de saisie texte par clé).
  const textOnlyEntries = Object.entries(segment.metrics).filter(([, v]) => typeof v !== "number");

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
            aria-label="Répétition réalisée"
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

          {fieldKeys.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {fieldKeys.map((key) => (
                <label key={key} className="flex items-center gap-1 text-xs text-muted-foreground">
                  {metricLabel(key)}
                  <input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                    value={inputs[key] ?? ""}
                    onChange={(e) => setInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                    onBlur={() => commitMetric(key, inputs[key] ?? "")}
                    className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-xs font-semibold text-foreground outline-none focus:border-primary"
                  />
                </label>
              ))}
            </div>
          )}

          {textOnlyEntries.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {textOnlyEntries.map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground"
                >
                  <span className="text-muted-foreground">{metricLabel(k)}</span>
                  <span>{v}</span>
                </span>
              ))}
            </div>
          )}
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
            aria-label="Supprimer la répétition"
            className="flex h-6 w-6 items-center justify-center rounded-full text-destructive/80 transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}
