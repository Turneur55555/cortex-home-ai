import { useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { BarChart3, TrendingDown, TrendingUp, Trophy, X } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Déterministe à partir du nom : évite les valeurs aléatoires à chaque rendu
function simpleHash(s: string): number {
  let h = 0;
  for (const c of s) h = ((h * 31) + c.charCodeAt(0)) >>> 0;
  return h;
}

function mockWeightHistory(
  exerciseName: string,
  pr?: number,
): Array<{ date: string; weight: number }> {
  const seed = simpleHash(exerciseName);
  const base = pr ?? (30 + (seed % 60));
  const today = new Date();
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (7 - i) * 7);
    const ratio = 0.82 + (i / 7) * 0.18;
    const noise = (((seed >> i) & 7) / 50) - 0.07;
    return {
      date: format(d, "yyyy-MM-dd"),
      weight: Math.max(5, Math.round((base * (ratio + noise)) * 2) / 2),
    };
  });
}

export function ExerciseStatsSheet({
  exerciseName,
  weightHistory,
  volumeHistory,
  pr,
  onClose,
}: {
  exerciseName: string;
  weightHistory: Array<{ date: string; weight: number }>;
  volumeHistory: Array<{ date: string; volume: number }>;
  pr: number | undefined;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"weight" | "volume">("weight");

  const isMock = weightHistory.length < 2;

  const resolvedWeight = isMock ? mockWeightHistory(exerciseName, pr) : weightHistory;
  const resolvedVolume =
    volumeHistory.length >= 2
      ? volumeHistory
      : resolvedWeight.map((p) => ({ date: p.date, volume: Math.round(p.weight * 3 * 10) }));

  const rawData =
    tab === "weight"
      ? resolvedWeight.map((p) => ({ date: p.date, value: p.weight }))
      : resolvedVolume.map((p) => ({ date: p.date, value: p.volume }));

  const chartData = rawData.map((p) => ({
    date: format(parseISO(p.date), "d MMM", { locale: fr }),
    value: p.value,
  }));

  const unit = tab === "weight" ? "kg" : "vol.";

  const cutoff30 = subDays(new Date(), 30);
  const last30 = rawData.filter((p) => parseISO(p.date) >= cutoff30);
  const avg30 =
    last30.length > 0 ? last30.reduce((s, p) => s + p.value, 0) / last30.length : null;

  const firstVal = rawData[0]?.value ?? 0;
  const lastVal = rawData[rawData.length - 1]?.value ?? 0;
  const progression = firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;

  const isCurrentPR =
    tab === "weight" &&
    pr != null &&
    !isMock &&
    weightHistory[weightHistory.length - 1]?.weight === pr;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] rounded-t-3xl border-t border-border bg-card p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-elevated"
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

        {/* Toggle poids / volume */}
        <div className="mb-4 flex gap-1 rounded-xl bg-surface p-1">
          {(["weight", "volume"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t === "weight" ? "Poids (kg)" : "Volume"}
            </button>
          ))}
        </div>

        {/* Graphique */}
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
                tab === "weight" ? "Poids" : "Volume",
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
        </div>

        {isMock && (
          <p className="mt-3 text-center text-[10px] text-muted-foreground/60">
            Aperçu simulé — enregistre plus de séances pour voir ta vraie progression.
          </p>
        )}
      </div>
    </div>
  );
}
