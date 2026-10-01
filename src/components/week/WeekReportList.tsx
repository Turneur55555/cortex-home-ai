import { Link } from "@tanstack/react-router";
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useWeekReportList } from "@/hooks/useWeekReport";
import { formatKg } from "@/lib/fitness/todayCard";
import type { WeeklyReportSummary } from "@/lib/fitness/weeklyReport";

function describe(week: WeeklyReportSummary): string {
  const parts = [`${week.sessions} séance${week.sessions > 1 ? "s" : ""}`];
  if (week.volumeKg > 0) parts.push(`${formatKg(week.volumeKg)} kg`);
  if (week.recordCount > 0) {
    parts.push(`${week.recordCount} record${week.recordCount > 1 ? "s" : ""}`);
  }
  return parts.join(" · ");
}

/**
 * L'archive des semaines : chaque semaine passée qui compte au moins une séance, de la plus
 * récente à la plus ancienne. Une semaine vide n'y figure pas (rien à célébrer, rien à
 * reprocher). La semaine en cours n'y est pas non plus : un bilan se lit quand elle est finie.
 */
export function WeekReportList() {
  const { isLoading, weeks } = useWeekReportList();

  return (
    <main className="flex flex-1 flex-col px-5 pb-8 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.375rem))]">
      <Link
        to="/chroniques"
        search={{ module: "progression" }}
        className="mb-4 flex w-fit items-center gap-1.5 rounded-full bg-white/[0.06] py-2 pl-2.5 pr-4 text-sm font-semibold text-white/90 active:scale-95"
      >
        <ChevronLeft aria-hidden className="h-4 w-4" />
        Chroniques
      </Link>

      <header className="mb-4">
        <h1 className="font-serif text-[26px] font-semibold italic tracking-wide">Tes semaines</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Le bilan de chaque semaine d'entraînement.
        </p>
      </header>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" aria-busy="true" />
      ) : weeks.length === 0 ? (
        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 text-center">
          <p className="font-serif text-lg font-semibold italic">Ton premier bilan arrive</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Il apparaîtra ici dès la fin de la première semaine où tu auras terminé une séance.
          </p>
        </section>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {weeks.map((week) => (
            <li key={week.weekStart}>
              <Link
                to="/semaine/$weekStart"
                params={{ weekStart: week.weekStart }}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{week.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {describe(week)}
                  </span>
                </span>
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Le bilan IA hebdomadaire (nutrition, corps — à la demande) n'est plus dans « Mes espaces » de
          Profil : tous les bilans de semaine ont la même porte. Rien n'est supprimé. */}
      <Link
        to="/rapports"
        className="mt-5 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 active:scale-[0.99]"
      >
        <BarChart3 aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Bilan IA de la semaine</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Analyse détaillée avec nutrition et corps, générée à la demande.
          </span>
        </span>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </main>
  );
}
