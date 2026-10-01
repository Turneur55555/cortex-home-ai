import { createFileRoute } from "@tanstack/react-router";
import { WeekReportList } from "@/components/week/WeekReportList";

export const Route = createFileRoute("/_authenticated/semaine/")({
  head: () => ({
    meta: [{ title: "ICORTEX — Tes semaines" }],
  }),
  component: WeekReportList,
});
