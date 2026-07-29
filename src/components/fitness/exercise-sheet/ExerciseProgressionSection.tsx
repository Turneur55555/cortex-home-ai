import { useMemo, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Dumbbell, Scale, TrendingDown, TrendingUp, Trophy } from "lucide-react";
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
import { SectionCard, StatTileMini, TrendIcon } from "../ExerciseAnalysisPrimitives";
import { ExerciseRankCard } from "../ExerciseRankCard";
import type { ExerciseAnalysis } from "@/lib/fitness/analysis";

// ============================================================
// Progression personnelle — rang RPG, maîtrise, graphiques, records,
// comparaison à la séance précédente, historique de séries. Reprend le
// moteur existant (buildSessionStats/currentBests, ExerciseRankCard) sans
// changement de logique, uniquement une présentation cohérente avec le
// reste de la nouvelle fiche.
// ============================================================

type Tab = "weight" | "volume" | "1rm";

export function ExerciseProgressionSection({
  exerciseName,
  weightHistory,
  volumeHistory,
  pr,
  analysis,
}: {
  exerciseName: string;
  weightHistory: Array<{ date: string; weight: number }>;
  volumeHistory: Array<{ date: string; volume: number }>;
  pr: number | undefined;
  analysis: ExerciseAnalysis | null;
}) {
  const [tab, setTab] = useState<Tab>("weight");
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
  const avg30 = last30.length > 0 ? last30.reduce((s, p) => s + p.value, 0) / last30.length : null;
  const firstVal = rawData[0]?.value ?? 0;
  const lastVal = rawData[rawData.length - 1]?.value ?? 0;
  const progression =
    rawData.length >= 2 && firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : null;

  const tabs: Tab[] = hasReal ? ["weight", "volume", "1rm"] : ["weight", "volume"];
  const tabLabel: Record<Tab, string> = {
    weight: "Poids (kg)",
    volume: "Volume",
    "1rm": "1RM est.",
  };
  const sessionsDesc = useMemo(() => [...stats].reverse(), [stats]);

  return (
    <div className="space-y-4">
      <ExerciseRankCard exerciseName={exerciseName} />

      <div className="flex gap-1 rounded-xl bg-surface p-1">
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

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
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
        <p className="py-6 text-center text-[11px] text-muted-foreground">
          Pas encore de données pour cette vue.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        {tab === "weight" && pr != null && (
          <StatTileMini
            icon={<Trophy className="h-3 w-3 text-warning" />}
            label="PR"
            value={`${pr} kg`}
            highlight
          />
        )}
        {tab === "1rm" && bests.best1RM != null && (
          <StatTileMini
            icon={<Trophy className="h-3 w-3 text-warning" />}
            label="1RM max"
            value={`${bests.best1RM} kg`}
            highlight
          />
        )}
        {avg30 != null && <StatTileMini label="Moy. 30j" value={`${avg30.toFixed(1)} ${unit}`} />}
        {progression != null && (
          <StatTileMini
            icon={
              progression >= 0 ? (
                <TrendingUp className="h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive" />
              )
            }
            label="Prog."
            value={`${progression >= 0 ? "+" : ""}${progression.toFixed(1)}%`}
            valueClass={progression >= 0 ? "text-green-500" : "text-destructive"}
          />
        )}
      </div>

      {analysis && analysis.comparison.metrics.length > 0 && (
        <SectionCard
          icon={<Scale className="h-3.5 w-3.5" />}
          title="Évolution vs séance précédente"
        >
          <div className="grid grid-cols-2 gap-2">
            {analysis.comparison.metrics.map((m) => (
              <div key={m.key} className="rounded-xl bg-surface p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {m.label}
                  </span>
                  <TrendIcon trend={m.trend} />
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-sm font-bold">{m.current ?? "—"}</span>
                  {m.deltaPct != null && (
                    <span
                      className={`text-[10px] font-semibold ${m.trend === "up" ? "text-green-500" : m.trend === "down" ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {m.deltaPct >= 0 ? "+" : ""}
                      {m.deltaPct}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {analysis.comparison.prsBroken.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {analysis.comparison.prsBroken.map((p, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-0.5 text-[10px] font-bold text-warning"
                >
                  <Trophy className="h-3 w-3" /> {p}
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11.5px] leading-relaxed text-foreground/80">
            {analysis.comparison.explanation}
          </p>
        </SectionCard>
      )}

      {hasReal && (
        <div>
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
                      {s.isPR1RM && <Trophy className="h-3 w-3 text-warning" aria-label="Record" />}
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
  );
}
