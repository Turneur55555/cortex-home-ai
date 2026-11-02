import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Courbe d'une métrique de bloc (un point par séance) — sortie de `SegmentAnalysisSheet` pour
 * être chargée À LA DEMANDE (recharts ne part plus avec l'écran de séance). Rendu inchangé.
 */
export function SegmentMetricChart({
  data,
  reversed,
  label,
  formatValue,
}: {
  data: Array<{ date: string; value: number }>;
  reversed: boolean;
  label: string;
  formatValue: (v: number) => string | number;
}) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
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
          domain={["dataMin", "dataMax"]}
          width={32}
          reversed={reversed}
        />
        <Tooltip
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 11,
          }}
          formatter={(v: number) => [formatValue(v), label]}
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
  );
}
