// ─── StatChip ─────────────────────────────────────────────────────────────────

interface StatChipProps {
  label: string;
  value: number;
  tone: "default" | "warning" | "danger";
}

export function StatChip({ label, value, tone }: StatChipProps) {
  const color =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-warning"
        : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
