import { createFileRoute } from "@tanstack/react-router";
import { WeekReportPage } from "@/components/week/WeekReportPage";

export const Route = createFileRoute("/_authenticated/semaine/$weekStart")({
  head: () => ({
    meta: [{ title: "ICORTEX — Ta semaine" }],
  }),
  component: WeekRoute,
});

function WeekRoute() {
  const { weekStart } = Route.useParams();
  return <WeekReportPage weekStart={weekStart} />;
}
