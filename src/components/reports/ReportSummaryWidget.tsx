import { Link } from "@tanstack/react-router";
import { FileText, ChevronRight, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { useWeeklyReports } from "@/hooks/useWeeklyReports";

function formatWeekRange(weekStart: string, weekEnd: string) {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(weekEnd + "T00:00:00");
  return `${start.getDate()} – ${end.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
}

export function ReportSummaryWidget() {
  const { data: reports, isLoading } = useWeeklyReports();
  const latest = reports?.[0];

  return (
    <Link
      to="/rapports"
      className="mt-4 block overflow-hidden rounded-3xl border border-border bg-gradient-surface p-5 shadow-elevated transition-all hover:border-primary/30"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold">Rapport hebdo</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>

      {isLoading ? (
        <div className="flex h-12 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : !latest || latest.status !== "ready" ? (
        <div>
          <p className="text-xs text-muted-foreground">Aucun rapport disponible</p>
          <p className="mt-1 text-[11px] text-primary">Générer mon premier rapport →</p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Semaine du {formatWeekRange(latest.week_start, latest.week_end)}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <MiniKpi label="Séances" value={String(latest.summary.sessions_count ?? 0)} />
            <MiniKpi label="Calories" value={`${latest.summary.avg_calories ?? 0}`} />
            <MiniKpi
              label="Poids Δ"
              value={
                latest.summary.weight_evolution != null
                  ? `${latest.summary.weight_evolution > 0 ? "+" : ""}${latest.summary.weight_evolution} kg`
                  : "—"
              }
              delta={latest.summary.weight_evolution}
            />
          </div>
        </>
      )}
    </Link>
  );
}

function MiniKpi({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 px-2 py-2 text-center">
      <div className="flex items-center justify-center gap-0.5">
        {delta != null &&
          (delta < 0 ? (
            <TrendingDown className="h-3 w-3 text-emerald-400" />
          ) : delta > 0 ? (
            <TrendingUp className="h-3 w-3 text-amber-400" />
          ) : null)}
        <p className="text-sm font-bold">{value}</p>
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
