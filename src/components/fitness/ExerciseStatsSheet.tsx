import { useMemo, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { BarChart3, Dumbbell, TrendingDown, TrendingUp, Trophy, X } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useExerciseSetHistory } from "@/hooks/useExerciseSetHistory";
import { buildSessionStats, currentBests } from "@/lib/fitness/progression";
import { formatTonnage } from "@/lib/fitness/strength";

type Tab = "weight" | "volume" | "1rm";

export function ExerciseStatsSheet({
  exerciseName,
  weightHistory,
  volumeHistory,
  pr,
  imageUrl,
  onClose,
}: {
  exerciseName: string;
  weightHistory: Array<{ date: string; weight: number }>;
  volumeHistory: Array<{ date: string; volume: number }>;
  pr: number | undefined;
  imageUrl?: string | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("weight");

  // Historique réel série-par-série (exercise_sets)
  const { data: history } = useExerciseSetHistory(exerciseName);
  const stats = useMemo(
    () =>
      buildSessionStats(
        (history ?? []).map((h) => ({
          date: h.date,
          workoutId: h.workoutId,
          sets: h.sets.map((s) => ({ reps: s.reps, weight: s.weight })),
        })),
      ),
    [history],
  );
  const hasReal = stats.some((s) => s.setCount > 0 && s.best1RM != null);
  const bests = useMemo(() => currentBests(stats), [stats]);

  // Séries réelles dérivées de exercise_sets (repli colonnes legacy si vide).
  // Aucune donnée simulée.
  const realSeries = useMemo(
    () =>
      stats
        .filter((s) => s.best1RM != null)
        .map((s) => ({ date: s.date, value: s.best1RM as number })),
    [stats],
  );
  const weightSeries = useMemo(
    () =>
      stats
        .filter((s) => s.topWeight != null)
        .map((s) => ({ date: s.date, value: s.topWeight as number })),
    [stats],
  );
  const volumeSeries = useMemo(
    () => stats.filter((s) => s.tonnage > 0).map((s) => ({ date: s.date, value: s.tonnage })),
    [stats],
  );

  const rawData =
    tab === "weight"
      ? weightSeries.length > 0
        ? weightSeries
        : weightHistory.map((p) => ({ date: p.date, value: p.weight }))
      : tab === "volume"
        ? volumeSeries.length > 0
          ? volumeSeries
          : volumeHistory.map((p) => ({ date: p.date, value: p.volume }))
        : realSeries;

  const chartData = rawData.map((p) => ({
    date: format(parseISO(p.date), "d MMM", { locale: fr }),
    value: p.value,
  }));

  const unit = tab === "volume" ? "vol." : "kg";

  const cutoff30 = subDays(new Date(), 30);
  const last30 = rawData.filter((p) => parseISO(p.date) >= cutoff30);
  const avg30 =
    last30.length > 0 ? last30.reduce((s, p) => s + p.value, 0) / last30.length : null;

  const firstVal = rawData[0]?.value ?? 0;
  const lastVal = rawData[rawData.length - 1]?.value ?? 0;
  // Progression seulement si au moins 2 séances réelles.
  const progression =
    rawData.length >= 2 && firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : null;

  const isCurrentPR =
    tab === "weight" &&
    pr != null &&
    weightSeries.length > 0 &&
    weightSeries[weightSeries.length - 1]?.value === pr;

  const tabs: Tab[] = hasReal ? ["weight", "volume", "1rm"] : ["weight", "volume"];
  const tabLabel: Record<Tab, string> = {
    weight: "Poids (kg)",
    volume: "Volume",
    "1rm": "1RM est.",
  };

  // Détail des séries, plus récent en premier
  const sessionsDesc = useMemo(() => [...stats].reverse(), [stats]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-[430px] flex-col rounded-t-3xl border-t border-border bg-card p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold capitalize">{exerciseName}</h3>
              <p className="text-[11px] text-muted-foreground">Évolution sur le temps</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="-mx-1 overflow-y-auto px-1">
          {/* Photo de l'exercice */}
          {imageUrl && (
            <div className="mb-4 flex items-center justify-center overflow-hidden rounded-2xl bg-black/30 ring-1 ring-white/5">
              <img
                src={imageUrl}
                alt={exerciseName}
                className="max-h-56 w-full object-contain"
                loading="lazy"
              />
            </div>
          )}

          {/* Toggle poids / volume / 1RM */}
          <div className="mb-4 flex gap-1 rounded-xl bg-surface p-1">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                  tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {tabLabel[t]}
              </button>
            ))}
          </div>

          {/* Graphique */}
          {chartData.length > 0 ? (
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
                  domain={["dataMin - 5", "dataMax + 5"]}
                  width={32}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(v: number) => [
                    `${v} ${unit}`,
                    tab === "weight" ? "Poids" : tab === "volume" ? "Volume" : "1RM est.",
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
            <p className="py-10 text-center text-[11px] text-muted-foreground">
              Pas encore de données pour cette vue.
            </p>
          )}

          {/* Cartes de stats */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {tab === "weight" && pr != null && (
              <div
                className={`rounded-xl bg-warning/10 p-3 text-center ${isCurrentPR ? "ring-1 ring-warning/60" : ""}`}
              >
                <div className="mb-1 flex items-center justify-center gap-1">
                  <Trophy
                    className={`h-3 w-3 text-warning ${isCurrentPR ? "animate-pulse" : ""}`}
                  />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-warning">
                    PR
                  </span>
                </div>
                <p className="text-sm font-bold">{pr} kg</p>
                {isCurrentPR && (
                  <p className="text-[9px] font-semibold text-warning">Nouveau !</p>
                )}
              </div>
            )}

            {tab === "1rm" && bests.best1RM != null && (
              <div className="rounded-xl bg-warning/10 p-3 text-center">
                <div className="mb-1 flex items-center justify-center gap-1">
                  <Trophy className="h-3 w-3 text-warning" />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-warning">
                    1RM max
                  </span>
                </div>
                <p className="text-sm font-bold">{bests.best1RM} kg</p>
              </div>
            )}

            {avg30 != null && (
              <div className="rounded-xl bg-surface p-3 text-center">
                <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  Moy. 30j
                </p>
                <p className="text-sm font-bold">
                  {avg30.toFixed(1)}
                  <span className="ml-0.5 text-[9px] font-normal text-muted-foreground">
                    {unit}
                  </span>
                </p>
              </div>
            )}

            {progression != null && (
              <div className="rounded-xl bg-surface p-3 text-center">
                <div className="mb-1 flex items-center justify-center gap-1">
                  {progression >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    Prog.
                  </span>
                </div>
                <p
                  className={`text-sm font-bold ${progression >= 0 ? "text-green-500" : "text-destructive"}`}
                >
                  {progression >= 0 ? "+" : ""}
                  {progression.toFixed(1)}%
                </p>
              </div>
            )}
          </div>

          {/* Détail des séries (données réelles exercise_sets) */}
          {hasReal && (
            <div className="mt-5">
              <div className="mb-2 flex items-center gap-1.5">
                <Dumbbell className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Détail des séries
                </span>
              </div>
              <div className="space-y-2">
                {sessionsDesc.map((s) => {
                  const session = history?.find((h) => h.workoutId === s.workoutId);
                  return (
                    <div
                      key={s.workoutId ?? s.date}
                      className="rounded-xl border border-border bg-surface p-3"
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-semibold capitalize text-foreground">
                          {format(parseISO(s.date), "EEE d MMM yyyy", { locale: fr })}
                        </span>
                        <span className="flex items-center gap-1.5">
                          {s.best1RM != null && (
                            <span className="text-[10px] font-medium text-muted-foreground">
                              1RM {s.best1RM} kg
                            </span>
                          )}
                          {s.isPR1RM && (
                            <Trophy className="h-3 w-3 text-warning" aria-label="Record" />
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(session?.sets ?? []).map((row, idx) => (
                          <span
                            key={idx}
                            className="rounded-lg bg-card px-2 py-1 text-[10px] font-medium text-foreground/80"
                          >
                            {row.reps ?? "—"}×{row.weight ?? "—"}
                            <span className="text-muted-foreground/70"> kg</span>
                          </span>
                        ))}
                      </div>
                      <div className="mt-1.5 text-[9px] uppercase tracking-wider text-muted-foreground/60">
                        Tonnage {formatTonnage(s.tonnage)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
