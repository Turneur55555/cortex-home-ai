import { useState } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";
import { WeekStrip } from "@/components/fitness/plan/WeekStrip";
import { WeeklyPlanSheet } from "@/components/fitness/plan/WeeklyPlanSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useWeekPlanView } from "@/hooks/useWeekPlanView";
import type { WeekSummary } from "@/lib/fitness/weeklyPlan";

/** « 2 / 5 faites », avec les séances en plus mentionnées comme un bonus — jamais comme un manque. */
function describeProgress(summary: WeekSummary): string {
  if (summary.plannedDays === 0) return "Semaine de repos";
  const base = `${summary.doneDays} / ${summary.plannedDays} faites`;
  return summary.extraDays > 0 ? `${base} · +${summary.extraDays} en plus` : base;
}

/**
 * Entrée du plan de la semaine, sur l'écran Séances.
 *
 * - Sans plan : une invitation qui PROMET (« CORTEX te dit chaque jour quoi
 *   faire »), pas un écran vide.
 * - Avec un plan : la semaine en cours d'un coup d'œil, et l'accès pour la
 *   modifier.
 *
 * Elle porte son propre état d'ouverture : l'écran qui la monte n'a rien à
 * gérer.
 */
export function WeekPlanCard() {
  const view = useWeekPlanView();
  const [open, setOpen] = useState(false);

  if (view.isLoading) {
    return <Skeleton className="h-[116px] w-full rounded-2xl" aria-busy="true" />;
  }

  return (
    <>
      {view.hasPlan ? (
        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3.5">
          <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
            <div className="flex items-center gap-1.5">
              <CalendarDays aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Ton rythme
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {describeProgress(view.summary)}
              </span>
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex min-h-[32px] items-center rounded-full bg-white/[0.06] px-3 text-[11px] font-semibold text-foreground active:scale-95"
              >
                Modifier
              </button>
            </div>
          </div>
          <WeekStrip week={view.week} templatesById={view.templatesById} />
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-left active:scale-[0.99]"
        >
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"
          >
            <CalendarDays className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Planifie ta semaine</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Choisis tes jours, tes séances sauvegardées ou tes groupes musculaires. CORTEX te dit
              chaque jour quoi faire.
            </span>
          </span>
          <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      {open && <WeeklyPlanSheet onClose={() => setOpen(false)} />}
    </>
  );
}
