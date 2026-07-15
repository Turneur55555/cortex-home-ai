import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { FileText, Loader2, Plus, AlertCircle } from "lucide-react";
import { useWeeklyReports, useGenerateReport } from "@/hooks/useWeeklyReports";
import { ReportCard } from "@/components/reports/ReportCard";
import type { WeeklyReport } from "@/types/weekly-report";

export const Route = createFileRoute("/_authenticated/rapports/")({
  head: () => ({
    meta: [{ title: "ICORTEX — Rapports" }],
  }),
  component: RapportsPage,
});

async function exportReportPdf(report: WeeklyReport) {
  const { default: html2canvas } = await import("html2canvas");
  const { jsPDF } = await import("jspdf");
  const el = document.getElementById(`report-preview-${report.id}`);
  if (!el) return;
  const canvas = await html2canvas(el, { backgroundColor: "#0f0f13", scale: 2 });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
  pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
  pdf.save(`rapport-semaine-${report.week_start}.pdf`);
}

function RapportsPage() {
  const { data: reports, isLoading, error } = useWeeklyReports();
  const { mutate: generate, isPending } = useGenerateReport();

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-[max(2.75rem,calc(env(safe-area-inset-top)+0.75rem))]">
      {/* Header */}
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Rapports</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Bilan hebdomadaire IA</p>
        </div>
        <button
          onClick={() => generate(undefined)}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Générer
        </button>
      </header>

      {/* States */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">Impossible de charger les rapports</p>
        </div>
      ) : !reports?.length ? (
        <EmptyState onGenerate={() => generate(undefined)} isPending={isPending} />
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-3"
        >
          {reports.map((report, i) => (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              id={`report-preview-${report.id}`}
            >
              <ReportCard report={report} onExportPdf={exportReportPdf} />
            </motion.div>
          ))}

          <p className="pt-2 text-center text-[11px] text-muted-foreground">
            {reports.length} rapport{reports.length > 1 ? "s" : ""} · 3 mois d'historique
          </p>
        </motion.div>
      )}
    </main>
  );
}

function EmptyState({
  onGenerate,
  isPending,
}: {
  onGenerate: () => void;
  isPending: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card">
        <FileText className="h-7 w-7 text-muted-foreground/40" />
      </div>
      <h2 className="mb-1 text-base font-semibold">Aucun rapport</h2>
      <p className="mb-6 max-w-[240px] text-xs leading-relaxed text-muted-foreground">
        Génère ton premier rapport hebdomadaire pour voir une analyse complète de tes entraînements, nutrition et évolution corporelle.
      </p>
      <button
        onClick={onGenerate}
        disabled={isPending}
        className="flex items-center gap-2 rounded-xl bg-gradient-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        Générer mon rapport
      </button>
    </div>
  );
}
