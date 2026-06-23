import { createFileRoute } from "@tanstack/react-router";
import { ReportDetail } from "@/components/reports/ReportDetail";

export const Route = createFileRoute("/_authenticated/rapports/$id")({
  head: () => ({
    meta: [{ title: "ICORTEX — Rapport détaillé" }],
  }),
  component: ReportDetailPage,
});

function ReportDetailPage() {
  const { id } = Route.useParams();
  return (
    <main className="flex flex-1 flex-col">
      <ReportDetail id={id} />
    </main>
  );
}
