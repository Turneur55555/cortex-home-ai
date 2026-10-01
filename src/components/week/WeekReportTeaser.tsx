import { Link } from "@tanstack/react-router";
import { BookOpen, ChevronRight } from "lucide-react";
import { useWeekReportTeaser } from "@/hooks/useWeekReport";

/**
 * « Ta semaine est prête » — sur l'Accueil le lundi et le mardi, quand la semaine qui vient
 * de finir compte au moins une séance. Sinon, rien : ni célébration, ni reproche.
 */
export function WeekReportTeaser() {
  const { isLoading, teaser } = useWeekReportTeaser();
  if (isLoading || teaser === null) return null;

  return (
    <Link
      to="/semaine/$weekStart"
      params={{ weekStart: teaser.weekStart }}
      className="mb-4 flex items-center gap-3 rounded-[18px] border border-primary/40 bg-gradient-to-r from-primary/20 to-primary/[0.04] px-3.5 py-3 active:scale-[0.99]"
    >
      <BookOpen aria-hidden className="h-5 w-5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-extrabold">{teaser.title}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">{teaser.subtitle}</span>
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-primary" />
    </Link>
  );
}
