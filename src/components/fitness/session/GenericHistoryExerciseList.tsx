// ============================================================
// Liste d'exercices d'une séance passée, pour TOUTE discipline non-muscu
// (Cardio/HYROX/Course/Guidé/Autre) — pendant de la liste d'exercices de
// WorkoutCard.tsx (musculation) pour l'historique. Fusion de
// CourseHistoryContent.tsx + DisciplineHistoryContent.tsx (Addendum Phase B,
// 2026-07-15, retour de Nathan : plus de rendu par discipline, un seul
// composant pour toutes, "Autre" inclus désormais — ses segments ont un
// label groupable comme les autres, voir freeformEngine.ts).
//
// ADDENDUM 2 (2026-07-15, retour de Nathan) : le rendu en puces
// (SessionStatChip, flex-wrap) laissait une boîte quasi vide dès qu'une
// répétition n'avait qu'1-2 métriques — écart de densité avec le vrai
// TABLEAU de WorkoutCard (grid Série/Reps/Kg, toujours plein largeur).
// Ici : dès qu'au moins une métrique "primary" (SEGMENT_METRIC_CONFIG,
// voir segmentStats.ts) est présente dans le groupe, on rend un tableau
// dense (colonnes = métriques primary présentes, ordonnées par `order`
// déclaré) — même principe visuel que Série/Reps/Kg, piloté par les
// données plutôt que codé en dur. Les groupes sans métrique primary
// (ex. "Autre", blocs texte libre) gardent le rendu en puces d'origine —
// dégradation explicite et déjà actée (§6.4/§7.2 du document), pas une
// régression.
//
// ADDENDUM 3 (2026-07-15, audit convergence UX) : badge "Record" par
// exercice, pendant du badge Trophy de WorkoutCard (isPR/isNewPR, alimenté
// par `prByName` précalculé une fois dans SeancesTab). Ici, chaque groupe
// est extrait dans un sous-composant `GenericHistoryExerciseRow` qui
// appelle lui-même `useDisciplineSegmentHistory` — légal (un hook appelé
// une fois par instance de composant, jamais dans le corps d'un `.map`
// brut) et cohérent avec le badge déjà posé sur la carte de séance ACTIVE
// (voir ActiveExerciseCard.tsx, même hook, même logique de comparaison
// direction-aware via SEGMENT_METRIC_CONFIG). "Nouveau record" seulement
// si cette séance est la plus récente occurrence de ce libellé dans
// l'historique — analogue à `w.date === latestDate` en musculation.
// ============================================================

import { useMemo, useState } from "react";
import { BarChart3, ChevronRight, Repeat, Trophy } from "lucide-react";
import type { DisciplineId, SessionSegment, SessionView } from "@/lib/fitness/engines/types";
import {
  bestMetricValue,
  groupByExerciseLabel,
  primaryColumnsForInstances,
  type LabelGroup,
  type PrimaryColumn,
} from "@/lib/fitness/segmentStats";
import { useDisciplineSegmentHistory } from "@/hooks/useDisciplineSegmentHistory";
import { SessionStatChip } from "./SessionStatChip";
import { SegmentAnalysisSheet } from "./SegmentAnalysisSheet";

/** Ligne "méta" enrichie sous le titre de chaque exercice — même esprit
 *  que "N séries · max X kg · Y kg total" en musculation : le nombre de
 *  répétitions puis, pour les 1-2 premières colonnes primary, la
 *  meilleure valeur atteinte (direction déjà déclarée dans
 *  SEGMENT_METRIC_CONFIG, jamais recalculée ici). */
function buildMetaLine(
  repCount: number,
  doneCount: number,
  instances: SessionSegment[],
  columns: PrimaryColumn[],
): string {
  const parts = [`${repCount} répétition${repCount > 1 ? "s" : ""}`];
  if (doneCount > 0 && doneCount < repCount) {
    parts.push(`${doneCount} réalisée${doneCount > 1 ? "s" : ""}`);
  }
  for (const col of columns.slice(0, 2)) {
    const best = bestMetricValue(instances, col.key);
    if (best) parts.push(`${col.label} : ${best.formatted}`);
  }
  return parts.join(" · ");
}

/** Libellés déjà représentés par une colonne "primary" (+ "Statut", géré
 *  séparément via l'opacité de la ligne) — le reste des `stats` textuels
 *  d'une répétition devient la note secondaire compacte, uniquement
 *  quand non vide (aucun espace réservé sinon). */
function secondaryNote(seg: SessionSegment, columnLabels: Set<string>): string | null {
  const rest = seg.stats.filter((s) => s.label !== "Statut" && !columnLabels.has(s.label));
  if (rest.length === 0) return null;
  return rest.map((s) => `${s.label} ${s.value}`).join(" · ");
}

function isNotCompleted(seg: SessionSegment): boolean {
  return seg.stats.some((s) => s.label === "Statut" && s.value !== "Réalisé");
}

/** Une ligne = un exercice groupé. Sous-composant dédié pour pouvoir
 *  appeler `useDisciplineSegmentHistory` légalement (règle des Hooks —
 *  un appel par instance de composant, jamais dans le corps brut d'un
 *  `.map`). Même logique de comparaison direction-aware que le badge
 *  Record de la carte séance ACTIVE (ActiveExerciseCard.tsx). */
function GenericHistoryExerciseRow({
  g,
  discipline,
  sessionDate,
  isOpen,
  onToggle,
  onOpenStats,
}: {
  g: LabelGroup<SessionSegment>;
  discipline: DisciplineId;
  sessionDate: string;
  isOpen: boolean;
  onToggle: () => void;
  onOpenStats: (label: string) => void;
}) {
  const repCount = g.instances.length;
  const doneCount = g.instances.filter((seg) =>
    seg.stats.some((s) => s.label === "Statut" && s.value === "Réalisé"),
  ).length;
  const columns = primaryColumnsForInstances(g.instances);
  const columnLabels = new Set(columns.map((c) => c.label));
  const metaLine = buildMetaLine(repCount, doneCount, g.instances, columns);

  const primaryColumn = columns[0] ?? null;
  const { data: historyInstances } = useDisciplineSegmentHistory(discipline, g.displayLabel);
  const currentBest = primaryColumn ? bestMetricValue(g.instances, primaryColumn.key) : null;
  const allTimeBest =
    primaryColumn && historyInstances ? bestMetricValue(historyInstances, primaryColumn.key) : null;
  const isRecord =
    primaryColumn != null &&
    currentBest != null &&
    allTimeBest != null &&
    currentBest.value === allTimeBest.value;
  const latestOccurrenceDate =
    historyInstances && historyInstances.length > 0
      ? historyInstances.reduce(
          (max, inst) => (inst.date > max ? inst.date : max),
          historyInstances[0].date,
        )
      : null;
  const isNewRecord = isRecord && latestOccurrenceDate === sessionDate;

  return (
    <li className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03]">
      <div className="flex cursor-pointer select-none items-center gap-3 p-3" onClick={onToggle}>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary/70">
          <Repeat className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold leading-tight tracking-tight break-words">
            {g.displayLabel}
          </h3>
          <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
            {metaLine}
          </p>
          {isRecord && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-bold text-warning">
              <Trophy className="h-3 w-3" />
              {isNewRecord ? "Nouveau record" : `Record ${currentBest!.formatted}`}
            </span>
          )}
        </div>

        <ChevronRight
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-90" : ""}`}
        />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenStats(g.instances[0].label);
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
        {columns.length > 0 ? (
          // Tableau dense — colonnes pilotées par les données (voir
          // primaryColumnsForInstances), même gabarit que le tableau
          // Série/Reps/Kg de WorkoutCard.
          <div className="mx-3 mb-3 overflow-hidden rounded-xl border border-white/5 bg-black/20">
            <div
              className="grid border-b border-white/5 bg-white/[0.02] py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80"
              style={{ gridTemplateColumns: `48px repeat(${columns.length}, 1fr)` }}
            >
              <div className="text-center">Rép.</div>
              {columns.map((c) => (
                <div key={c.key} className="text-center">
                  {c.label}
                </div>
              ))}
            </div>
            <ul className="divide-y divide-white/5">
              {g.instances.map((seg, i) => {
                const note = secondaryNote(seg, columnLabels);
                const dimmed = isNotCompleted(seg);
                return (
                  <li key={`${g.key}-${i}`} className={dimmed ? "opacity-60" : undefined}>
                    <div
                      className="grid items-center py-2.5 text-sm tabular-nums"
                      style={{ gridTemplateColumns: `48px repeat(${columns.length}, 1fr)` }}
                    >
                      <div className="flex items-center justify-center">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                          {i + 1}
                        </span>
                      </div>
                      {columns.map((c) => {
                        const raw = seg.metrics?.[c.key];
                        return (
                          <div key={c.key} className="text-center font-semibold">
                            {typeof raw === "number" ? c.format(raw) : "—"}
                          </div>
                        );
                      })}
                    </div>
                    {note && (
                      <p className="px-3 pb-2 text-[11px] text-muted-foreground/70">{note}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          // Fallback puces — aucune métrique primary déclarée pour ce
          // groupe (ex. "Autre", blocs texte libre : voir freeformEngine.ts).
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
        )}
      </div>
    </li>
  );
}

export function GenericHistoryExerciseList({
  view,
  discipline,
  sessionDate,
}: {
  view: SessionView;
  discipline: DisciplineId;
  sessionDate: string;
}) {
  const [statsLabel, setStatsLabel] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const groups = useMemo(() => groupByExerciseLabel(view.segments), [view.segments]);

  if (groups.length === 0) return null;

  return (
    <>
      <ul className="space-y-3">
        {groups.map((g) => (
          <GenericHistoryExerciseRow
            key={g.key}
            g={g}
            discipline={discipline}
            sessionDate={sessionDate}
            isOpen={expandedKeys.has(g.key)}
            onToggle={() =>
              setExpandedKeys((prev) => {
                const next = new Set(prev);
                if (next.has(g.key)) next.delete(g.key);
                else next.add(g.key);
                return next;
              })
            }
            onOpenStats={setStatsLabel}
          />
        ))}
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
