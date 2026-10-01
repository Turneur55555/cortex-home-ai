import { Check, Moon, Swords } from "lucide-react";
import {
  DAY_INITIALS,
  DAY_NAMES,
  describePlanDay,
  type DayState,
  type TemplateSummary,
  type WeekDayView,
} from "@/lib/fitness/weeklyPlan";
import { cn } from "@/lib/utils";

/** Dit à voix haute l'état d'un jour — la couleur seule ne se lit pas. */
const STATE_SPOKEN: Record<DayState, string> = {
  done: "fait",
  today: "aujourd'hui",
  upcoming: "à venir",
  missed: "manqué",
  rest: "repos",
  unplanned: "libre",
};

/**
 * Chaque état a sa propre silhouette, uniquement à partir des jetons du thème
 * (`primary` suit le rang courant via RankTheme, `success` est le vert de
 * validation) : la bande se recolore seule à chaque montée de Rang.
 *
 * « Manqué » reste volontairement sobre — atténué, jamais rouge vif : on
 * informe, on ne punit pas.
 */
const CELL_STYLE: Record<DayState, string> = {
  done: "bg-success/10 text-success ring-success/35",
  today:
    "bg-primary/25 text-foreground ring-primary/60 shadow-[0_0_18px_-4px_var(--primary-glow-soft)]",
  upcoming: "bg-white/[0.035] text-foreground ring-white/5",
  missed: "bg-white/[0.02] text-muted-foreground ring-white/5 opacity-60",
  rest: "bg-white/[0.02] text-muted-foreground ring-white/5 opacity-70",
  unplanned: "bg-transparent text-muted-foreground ring-white/5 opacity-50",
};

function StateMark({ state }: { state: DayState }) {
  if (state === "done") return <Check className="h-3 w-3" strokeWidth={3} aria-hidden />;
  if (state === "today") return <Swords className="h-3 w-3 text-primary" aria-hidden />;
  if (state === "rest") return <Moon className="h-3 w-3" aria-hidden />;
  return null;
}

/**
 * La semaine en cours, lundi → dimanche : ce qui était prévu, ce qui est fait,
 * ce qui reste. Purement présentationnelle : l'état de chaque jour est dérivé
 * en amont (`buildWeekView`), jamais ici.
 *
 * `templatesById = null` : modèles pas encore chargés — une séance sauvegardée
 * s'affiche « … » plutôt que « supprimée » (voir `describePlanDay`).
 */
export function WeekStrip({
  week,
  templatesById,
  className,
}: {
  week: readonly WeekDayView[];
  templatesById: ReadonlyMap<string, TemplateSummary> | null;
  className?: string;
}) {
  return (
    <ol aria-label="Ta semaine" className={cn("grid grid-cols-7 gap-1.5", className)}>
      {week.map((day) => {
        const description = describePlanDay(day.plan, templatesById);
        // Un jour sans plan où l'on s'est quand même entraîné : on le dit.
        const full =
          day.state === "done" && !day.isTrainingPlanned && day.plan === null
            ? "séance libre"
            : description.full;
        return (
          <li
            key={day.dayOfWeek}
            aria-current={day.isToday ? "date" : undefined}
            aria-label={`${DAY_NAMES[day.dayOfWeek]} : ${full}, ${STATE_SPOKEN[day.state]}`}
            data-state={day.state}
            className={cn(
              "flex min-w-0 flex-col items-center rounded-xl px-0.5 py-2 text-center ring-1",
              CELL_STYLE[day.state],
              // Aujourd'hui reste repérable même une fois « fait » ou en repos.
              day.isToday && day.state !== "today" && "ring-2 ring-primary/70",
            )}
          >
            <span
              aria-hidden
              className="text-[8.5px] font-bold tracking-wider text-muted-foreground"
            >
              {DAY_INITIALS[day.dayOfWeek]}
            </span>
            <span
              aria-hidden
              className={cn(
                "mt-1 block w-full truncate text-[9px] font-bold leading-tight",
                day.state === "missed" && "line-through",
              )}
            >
              {description.short}
            </span>
            <span aria-hidden className="mt-0.5 flex h-4 items-center justify-center">
              <StateMark state={day.state} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
