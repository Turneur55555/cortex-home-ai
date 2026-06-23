import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { FileText, CheckCircle, Loader2, AlertCircle, Download } from "lucide-react";
import type { WeeklyReport } from "@/types/weekly-report";

function formatWeekRange(weekStart: string, weekEnd: string) {
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(weekEnd + "T00:00:00");
  const startDay = start.getDate();
  const endStr = end.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  return `${startDay} – ${endStr}`;
}

export function ReportCard({
  report,
  onExportPdf,
}: {
  report: WeeklyReport;
  onExportPdf?: (report: WeeklyReport) => void;
}) {
  const { summary, status } = report;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-card"
    >
      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">
              {formatWeekRange(report.week_start, report.week_end)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {new Date(report.week_start + "T00:00:00").toLocaleDateString("fr-FR", {
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <StatusBadge status={status} />
        </div>

        {status === "ready" && (
          <div className="mb-4 grid grid-cols-3 gap-2">
            <MetricChip label="Séances" value={String(summary.sessions_count ?? 0)} />
            <MetricChip
              label="Cal. moy."
              value={`${summary.avg_calories ?? 0} kcal`}
            />
            <MetricChip
              label="Poids"
              value={
                summary.current_weight != null ? `${summary.current_weight} kg` : "—"
              }
            />
          </div>
        )}

        {status === "generating" && (
          <div className="mb-4 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Génération en cours…</span>
          </div>
        )}

        {status === "error" && (
          <p className="mb-4 text-xs text-destructive">Erreur lors de la génération</p>
        )}

        {status === "ready" && (
          <div className="flex gap-2">
            <Link
              to="/rapports/$id"
              params={{ id: report.id }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface py-2 text-xs font-semibold transition-colors hover:border-primary/40"
            >
              <FileText className="h-3.5 w-3.5" />
              Consulter
            </Link>
            {onExportPdf && (
              <button
                onClick={() => onExportPdf(report)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs transition-colors hover:border-primary/40"
                title="Exporter en PDF"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: WeeklyReport["status"] }) {
  if (status === "ready")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
        <CheckCircle className="h-3 w-3" />
        Prêt
      </span>
    );
  if (status === "generating")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Génération
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
      <AlertCircle className="h-3 w-3" />
      Erreur
    </span>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/50 px-2 py-2 text-center">
      <p className="text-sm font-bold">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
