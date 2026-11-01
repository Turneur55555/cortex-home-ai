import { useMemo, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { FullscreenSheet as Sheet } from "@/components/shared/FormComponents";
import { useNutritionGoals } from "@/hooks/use-fitness";
import { useNutritionHistory } from "@/hooks/use-nutrition-history";
import { useClosedNutritionDates } from "@/hooks/useNutritionDayClosures";
import {
  averageOverCompleteDays,
  completeDatesFromSeries,
  type CompleteDaysAverage,
} from "@/lib/nutrition/dayCompletion";

type Metric = "kcal" | "proteins" | "carbs" | "fats";

const METRICS: { key: Metric; label: string; color: string; unit: string }[] = [
  { key: "kcal", label: "Calories", color: "var(--primary)", unit: "kcal" },
  { key: "fats", label: "Lipides", color: "hsl(0 84% 60%)", unit: "g" },
  { key: "carbs", label: "Glucides", color: "hsl(38 92% 50%)", unit: "g" },
  { key: "proteins", label: "Protéines", color: "hsl(142 76% 36%)", unit: "g" },
];

interface Props {
  onClose: () => void;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

function AvgCard({
  title,
  avg,
  goalCal,
}: {
  title: string;
  avg: CompleteDaysAverage;
  goalCal: number | null | undefined;
}) {
  const hasAverage = avg.completeDays > 0;
  return (
    <div className="flex-1 rounded-2xl border border-border bg-surface p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <p className="mt-1 text-xl font-bold text-primary">
        {hasAverage ? avg.calories.toLocaleString("fr-FR") : "—"}
        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
          kcal/j{goalCal ? ` · cible ${goalCal.toLocaleString("fr-FR")}` : ""}
        </span>
      </p>
      {hasAverage && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          L {avg.fats} g · G {avg.carbs} g · P {avg.proteins} g
        </p>
      )}
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {hasAverage
          ? `${plural(avg.completeDays, "journée")} complète${avg.completeDays > 1 ? "s" : ""}`
          : "Aucune journée complète"}
      </p>
      {avg.excludedDays > 0 && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {plural(avg.excludedDays, "journée")} incomplète{avg.excludedDays > 1 ? "s" : ""} exclue
          {avg.excludedDays > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

export function NutritionHistorySheet({ onClose }: Props) {
  const { data: series, isLoading } = useNutritionHistory(30);
  const { data: goals } = useNutritionGoals();
  const [metric, setMetric] = useState<Metric>("kcal");

  const { closedDates } = useClosedNutritionDates();
  // Seules les journées complètes (bouclées, ou dîner saisi) comptent dans les
  // moyennes : une journée sans dîner n'est pas un déficit, c'est un repas non noté.
  const completeDays = useMemo(
    () => completeDatesFromSeries(series ?? [], closedDates),
    [series, closedDates],
  );
  const avg7 = useMemo(
    () => averageOverCompleteDays(series ?? [], 7, completeDays),
    [series, completeDays],
  );
  const avg30 = useMemo(
    () => averageOverCompleteDays(series ?? [], 30, completeDays),
    [series, completeDays],
  );

  const chartData = useMemo(
    () =>
      (series ?? []).map((d) => ({
        date: d.date,
        label: format(parseISO(d.date), "dd/MM", { locale: fr }),
        kcal: Math.round(d.calories),
        proteins: Math.round(d.proteins * 10) / 10,
        carbs: Math.round(d.carbs * 10) / 10,
        fats: Math.round(d.fats * 10) / 10,
        complete: completeDays.has(d.date),
      })),
    [series, completeDays],
  );

  const hasData = (series ?? []).some((d) => d.calories > 0);
  const activeMetric = METRICS.find((m) => m.key === metric)!;

  return (
    <Sheet title="Historique nutritionnel" onClose={onClose}>
      <div className="space-y-4">
        {isLoading && (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && !hasData && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Pas encore d'historique</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Enregistre tes repas pour suivre tes tendances sur 7 et 30 jours.
            </p>
          </div>
        )}

        {!isLoading && hasData && (
          <>
            <div className="flex gap-2">
              <AvgCard title="Moyenne 7 j" avg={avg7} goalCal={goals?.calories} />
              <AvgCard title="Moyenne 30 j" avg={avg30} goalCal={goals?.calories} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  30 jours
                </p>
                <div className="flex gap-1">
                  {METRICS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMetric(m.key)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                        metric === m.key
                          ? "bg-primary text-primary-foreground"
                          : "bg-surface text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-48 w-full rounded-2xl border border-border bg-surface p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      interval={4}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      // L'objectif reste toujours visible, même au-dessus de la plus haute barre.
                      domain={[
                        0,
                        (dataMax: number) =>
                          metric === "kcal" && goals?.calories
                            ? Math.max(dataMax, Number(goals.calories))
                            : dataMax,
                      ]}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      labelFormatter={(l) => `Le ${l}`}
                      formatter={(v: number) => [`${v} ${activeMetric.unit}`, activeMetric.label]}
                    />
                    {metric === "kcal" && goals?.calories ? (
                      <ReferenceLine
                        y={goals.calories}
                        stroke="var(--primary)"
                        strokeDasharray="4 4"
                        ifOverflow="extendDomain"
                      />
                    ) : null}
                    <Bar dataKey={metric} fill={activeMetric.color} radius={[3, 3, 0, 0]}>
                      {chartData.map((d) => (
                        <Cell
                          key={d.date}
                          fill={activeMetric.color}
                          fillOpacity={d.complete ? 1 : 0.3}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-center text-[11px] text-muted-foreground">
                {metric === "kcal" && goals?.calories
                  ? `Ligne pointillée = objectif (${goals.calories.toLocaleString("fr-FR")} kcal). `
                  : ""}
                Barres pâles = journées incomplètes, hors moyennes.
              </p>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
