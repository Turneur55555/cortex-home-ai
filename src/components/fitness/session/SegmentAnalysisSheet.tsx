import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarClock, Repeat, Sparkles, Target, TrendingUp, Trophy, X } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSegmentHistory } from "@/hooks/useSegmentHistory";
import {
  buildSegmentNarrative,
  computeSegmentStats,
  segmentBaseLabel,
} from "@/lib/fitness/segmentStats";
import { SectionCard, StatTileMini, TrendIcon } from "../ExerciseAnalysisPrimitives";

// ============================================================
// Fiche détaillée d'un segment Course à pied (ex. "400m allure 5 km",
// "Récupération trottinée", "Tempo") — pendant de ExerciseAnalysisSheet
// pour la musculation, ouverte en cliquant un segment dans l'historique
// des séances Course (voir CourseHistoryContent.tsx). Réutilise les
// primitives visuelles génériques (SectionCard/StatTileMini/TrendIcon)
// pour rester cohérente avec la fiche exercice, SANS réutiliser les
// sections propres à la musculation (muscles sollicités, impact
// physique, rang RPG) qui n'ont pas d'équivalent ici.
//
// Sections volontairement absentes de cette v1 (voir rapport de
// livraison) :
// - Niveau/Maîtrise/Rang : le système de Rang actuel (lib/fitness/rank/)
//   est scopé musculation et ne doit pas être modifié (consigne
//   explicite) ; aucun système de rang équivalent n'existe pour la
//   course. Ajouter cette section nécessiterait soit d'étendre le
//   moteur de Rang existant, soit d'en construire un nouveau — hors
//   périmètre "enrichir simplement le pilote".
// - Recommandation de surcharge progressive : algorithme non encore
//   écrit pour la course (existe pour la musculation via
//   loadRecommendation.ts, mais basé sur RPE/1RM, non transposable tel
//   quel). Affichée ci-dessous comme un emplacement réservé explicite
//   ("Bientôt disponible"), jamais avec un chiffre inventé.
// - "Analyse" : contrairement à ExerciseAnalysisSheet (analyse IA à la
//   demande via useDeepExerciseAI + edge function), la section Analyse
//   ici est un texte 100% calculé côté client à partir des vraies
//   valeurs historiques (buildSegmentNarrative) — pas d'appel IA, pour
//   rester strictement dans le périmètre "pilote Course" sans toucher
//   au backend Sensei.
// ============================================================

export function SegmentAnalysisSheet({
  rawLabel,
  onClose,
}: {
  rawLabel: string;
  onClose: () => void;
}) {
  const displayLabel = segmentBaseLabel(rawLabel);
  const { data: instances } = useSegmentHistory(rawLabel);
  const stats = useMemo(
    () => computeSegmentStats(displayLabel, instances ?? []),
    [displayLabel, instances],
  );
  const narrative = useMemo(() => buildSegmentNarrative(stats), [stats]);

  const chartableMetrics = stats.metrics.filter((m) => m.history.length > 0);
  const [metricKey, setMetricKey] = useState<string | undefined>(chartableMetrics[0]?.key);
  const activeMetric = chartableMetrics.find((m) => m.key === metricKey) ?? chartableMetrics[0];

  const chartData = (activeMetric?.history ?? []).map((p) => ({
    date: format(parseISO(p.date), "d MMM", { locale: fr }),
    value: p.value,
  }));

  const sessionsDesc = useMemo(() => [...(instances ?? [])].reverse(), [instances]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[430px] flex-col rounded-t-3xl border-t border-border bg-card p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Repeat className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{displayLabel}</h3>
              <p className="text-[11px] text-muted-foreground">
                {stats.occurrences > 0 ? "Fiche segment" : "Pas encore réalisé"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="-mx-1 space-y-4 overflow-y-auto px-1">
          {stats.occurrences === 0 ? (
            <p className="py-10 text-center text-[12px] leading-relaxed text-muted-foreground">
              {narrative}
            </p>
          ) : (
            <>
              {/* Analyse (calculée, pas d'IA) */}
              <SectionCard icon={<Sparkles className="h-3.5 w-3.5" />} title="Analyse">
                <p className="text-[12px] leading-relaxed text-foreground/85">{narrative}</p>
              </SectionCard>

              {/* Toggle métrique (si plusieurs) */}
              {chartableMetrics.length > 1 && (
                <div className="flex gap-1 rounded-xl bg-surface p-1">
                  {chartableMetrics.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setMetricKey(m.key)}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                        activeMetric?.key === m.key
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Graphique */}
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid
                      stroke="var(--color-border)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "var(--color-muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      domain={["dataMin", "dataMax"]}
                      width={32}
                      reversed={activeMetric?.key === "pace_min_per_km"}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      formatter={(v: number) => [
                        activeMetric ? formatForTooltip(activeMetric.key, v) : v,
                        activeMetric?.label ?? "",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--color-primary)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "var(--color-primary)" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-4 text-center text-[11px] text-muted-foreground">
                  Encore trop peu de séances pour un graphique — reviens après ta prochaine
                  réalisation.
                </p>
              )}

              {/* Stat tiles */}
              <div className="grid grid-cols-3 gap-2">
                <StatTileMini
                  icon={<Repeat className="h-3 w-3 text-primary" />}
                  label="Réalisations"
                  value={String(stats.occurrences)}
                />
                {stats.metrics.map((m) => (
                  <StatTileMini
                    key={m.key}
                    icon={<Trophy className="h-3 w-3 text-warning" />}
                    label={`Meilleure ${m.label.toLowerCase()}`}
                    value={m.bestFormatted}
                    highlight
                  />
                ))}
                {stats.estimatedDuration && (
                  <StatTileMini
                    icon={<CalendarClock className="h-3 w-3 text-muted-foreground" />}
                    label="Durée estimée"
                    value={stats.estimatedDuration.latestFormatted}
                  />
                )}
              </div>

              {/* Progression / tendance par métrique */}
              {stats.metrics.some((m) => m.progressionPct != null) && (
                <SectionCard icon={<TrendingUp className="h-3.5 w-3.5" />} title="Progression">
                  <div className="grid grid-cols-2 gap-2">
                    {stats.metrics
                      .filter((m) => m.progressionPct != null)
                      .map((m) => (
                        <div key={m.key} className="rounded-xl bg-surface p-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {m.label}
                            </span>
                            <TrendIcon trend={m.trend} />
                          </div>
                          <div className="mt-1 flex items-baseline gap-1.5">
                            <span className="text-sm font-bold">{m.latestFormatted}</span>
                            <span
                              className={`text-[10px] font-semibold ${
                                m.trend === "up"
                                  ? "text-green-500"
                                  : m.trend === "down"
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {m.progressionPct! >= 0 ? "+" : ""}
                              {m.progressionPct!.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </SectionCard>
              )}

              {/* Recommandation de surcharge progressive — emplacement réservé */}
              <SectionCard
                icon={<Target className="h-3.5 w-3.5" />}
                title="Recommandation de surcharge progressive"
              >
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Bientôt disponible. Cette fiche est prête à l'accueillir dès qu'un algorithme de
                  recommandation sera construit pour la course à pied.
                </p>
              </SectionCard>

              {/* Historique */}
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Historique
                  </span>
                </div>
                <div className="space-y-2">
                  {sessionsDesc
                    .filter((s) => s.completed)
                    .map((s, idx) => (
                      <div
                        key={`${s.workoutId}-${idx}`}
                        className="rounded-xl border border-border bg-surface p-3"
                      >
                        <p className="mb-1.5 text-[11px] font-semibold capitalize text-foreground">
                          {s.date
                            ? format(parseISO(s.date), "EEE d MMM yyyy", { locale: fr })
                            : "Date inconnue"}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(s.metrics)
                            .filter(([k]) => SEGMENT_METRIC_LABELS[k])
                            .map(([k, v]) => (
                              <span
                                key={k}
                                className="rounded-lg bg-card px-2 py-1 text-[10px] font-medium text-foreground/80"
                              >
                                {SEGMENT_METRIC_LABELS[k]}: {typeof v === "number" ? v : String(v)}
                              </span>
                            ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const SEGMENT_METRIC_LABELS: Record<string, string> = {
  distance_m: "Distance (m)",
  pace_min_per_km: "Allure",
  elevation_m: "Dénivelé+ (m)",
};

function formatForTooltip(key: string, v: number): string {
  if (key === "distance_m") return `${(v / 1000).toFixed(2)} km`;
  if (key === "pace_min_per_km") {
    const totalSeconds = Math.round(v * 60);
    const min = Math.floor(totalSeconds / 60);
    const sec = totalSeconds % 60;
    return `${min}:${String(sec).padStart(2, "0")} min/km`;
  }
  if (key === "elevation_m") return `${Math.round(v)} m`;
  return String(v);
}
