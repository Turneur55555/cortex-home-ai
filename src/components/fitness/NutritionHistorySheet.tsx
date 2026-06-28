import { useMemo, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Sheet } from "@/components/shared/FormComponents";
import { useNutritionGoals } from "@/hooks/use-fitness";
import {
  averageOverTrackedDays,
  useNutritionHistory,
} from "@/hooks/use-nutrition-history";

type Metric = "kcal" | "proteins" | "carbs" | "fats";

const METRICS: { key: Metric; label: string; color: string; unit: string }[] = [
  { key: "kcal",     label: "Calories", color: "hsl(var(--primary))",    unit: "kcal" },
  { key: "proteins", label: "Protéines", color: "hsl(142 76% 36%)",      unit: "g" },
  { key: "carbs",    label: "Glucides",  color: "hsl(38 92% 50%)",       unit: "g" },
  { key: "fats",     label: "Lipides",   color: "hsl(0 84% 60%)",        unit: "g" },
];

interface Props {
  onClose: () => void;
}

function AvgCard({
  title,
  avg,
  goalCal,
}: {
  title: string;
  avg: { calories: number; proteins: number; carbs: number; fats: number; trackedDays: number };
  goalCal: number | null | undefined;
}) {
  return (
    <div className="flex-1 rounded-2xl border border-border bg-surface p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <p className="mt-1 text-xl font-bold text-primary">
        {avg.calories}
        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
          kcal/j{goalCal ? ` · cible ${goalCal}` : ""}
        </span>
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        P{avg.proteins} · G{avg.carbs} · L{avg.fats}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {avg.trackedDays} jour{avg.trackedDays > 1 ? "s" : ""} suivi
        {avg.trackedDays > 1 ? "s" : ""}
      </p>
    </div>
  );
}

export function NutritionHistorySheet({ onClose }: Props) {
  const { data: series, isLoading } = useNutritionHistory(30);
  const { data: goals } = useNutritionGoals();
  const [metric, setMetric] = useState<Metric>("kcal");

  const avg7 = useMemo(() => averageOverTrackedDays(series ?? [], 7), [series]);
  const avg30 = useMemo(() => averageOverTrackedDays(series ?? [], 30), [series]);

  const chartData = useMemo(
    () =>
      (series ?? []).map((d) => ({
        date: d.date,
        label: format(parseISO(d.date), "dd/MM", { locale: fr }),
        kcal: Math.round(d.calories),
        proteins: Math.round(d.proteins * 10) / 10,
        carbs: Math.round(d.carbs * 10) / 10,
        fats: Math.round(d.fats * 10) / 10,
      })),
    [series],
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
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      interval={4}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      width={36}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      labelFormatter={(l) => `Le ${l}`}
                      formatter={(v: number) => [`${v} ${activeMetric.unit}`, activeMetric.label]}
                    />
                    {metric === "kcal" && goals?.calories ? (
                      <ReferenceLine
                        y={goals.calories}
                        stroke="hsl(var(--primary))"
                        strokeDasharray="4 4"
                      />
                    ) : null}
                    <Bar dataKey={metric} fill={activeMetric.color} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {metric === "kcal" && goals?.calories ? (
                <p className="mt-1 text-center text-[10px] text-muted-foreground">
                  Ligne pointillée = objectif ({goals.calories} kcal)
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
