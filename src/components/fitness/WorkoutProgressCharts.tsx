import { BarChart3, Trophy } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export function WorkoutProgressCharts({
  topExercises,
  histByName,
  prByName,
}: {
  topExercises: string[];
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  prByName: Map<string, number>;
}) {
  if (topExercises.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Progression — top exercices</h3>
      </div>
      <div className="space-y-4">
        {topExercises.map((key) => {
          const hist = histByName.get(key) ?? [];
          const chart = hist.map((p) => ({
            date: format(parseISO(p.date), "d MMM", { locale: fr }),
            weight: p.weight,
          }));
          const pr = prByName.get(key);
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-semibold capitalize">{key}</p>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning">
                  <Trophy className="h-3 w-3" />
                  PR {pr} kg
                </span>
              </div>
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={chart} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
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
                    domain={["dataMin - 2", "dataMax + 2"]}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
}
