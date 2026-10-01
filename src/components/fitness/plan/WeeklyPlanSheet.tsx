import { useState } from "react";
import { Check, ChevronDown, Moon } from "lucide-react";
import { Sheet } from "@/components/shared/FormComponents";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetPlanDay } from "@/hooks/useWeeklyPlan";
import { useWeekPlanView } from "@/hooks/useWeekPlanView";
import {
  DAY_NAMES,
  ISO_DAYS,
  PLAN_GROUP_IDS,
  PLAN_GROUP_LABELS,
  describePlanDay,
  describePlannedWeek,
  describeTemplateLoad,
  type IsoDay,
  type PlanDay,
  type PlanDayInput,
  type PlanGroupId,
} from "@/lib/fitness/weeklyPlan";
import { cn } from "@/lib/utils";

const CHOICE_ON = "border-primary/50 bg-primary/15 text-foreground";
const CHOICE_OFF = "border-border bg-surface text-muted-foreground";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * « Mon rythme » — le plan de la semaine.
 *
 * Sept jours. Pour chacun : une de ses séances sauvegardées (avec son nombre de
 * séries), de simples groupes musculaires, ou repos. Le plan est récurrent : on
 * le règle une fois, il se rejoue chaque semaine.
 *
 * Les séances sauvegardées passent EN PREMIER : on ne choisit pas un nom, on
 * choisit une charge de travail.
 *
 * Chaque choix s'enregistre tout seul (séance, repos, libre) — sauf les groupes
 * musculaires, qui demandent d'en cocher plusieurs avant de valider. Les
 * boutons se désactivent pendant l'écriture ; c'est le verrou INTERNE de
 * `writePlanDay` qui garantit l'unicité, pas l'attribut `disabled`.
 */
export function WeeklyPlanSheet({ onClose }: { onClose: () => void }) {
  const view = useWeekPlanView();
  const setDay = useSetPlanDay();
  const [openDay, setOpenDay] = useState<IsoDay | null>(null);
  const [draftGroups, setDraftGroups] = useState<PlanGroupId[]>([]);

  const busy = setDay.isPending;

  const toggleDay = (day: IsoDay) => {
    if (openDay === day) {
      setOpenDay(null);
      return;
    }
    const current = view.plan[day];
    setDraftGroups(current?.kind === "muscles" ? current.groups : []);
    setOpenDay(day);
  };

  const save = (day: IsoDay, input: PlanDayInput | null) => {
    if (busy) return;
    setDay.mutate({ dayOfWeek: day, input }, { onSuccess: () => setOpenDay(null) });
  };

  const toggleGroup = (group: PlanGroupId) =>
    setDraftGroups((previous) =>
      previous.includes(group) ? previous.filter((g) => g !== group) : [...previous, group],
    );

  return (
    <Sheet title="Mon rythme" onClose={onClose}>
      <p className="-mt-2 mb-4 text-xs text-muted-foreground">
        {view.isLoading ? "…" : describePlannedWeek(view.summary.plannedDays, view.load)}
      </p>

      {view.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {ISO_DAYS.map((day) => (
            <Skeleton key={day} className="h-12 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {ISO_DAYS.map((day) => {
            const plan = view.plan[day];
            const description = describePlanDay(plan, view.templatesById);
            const open = openDay === day;
            return (
              <li key={day}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`plan-day-${day}`}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "flex min-h-[48px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                    open ? CHOICE_ON : "border-border bg-surface",
                  )}
                >
                  <span className="w-[4.5rem] shrink-0 text-sm font-bold">{DAY_NAMES[day]}</span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm font-semibold",
                      (plan === null || plan.kind === "rest") &&
                        "font-medium text-muted-foreground",
                      description.ref === "deleted" && "text-warning",
                    )}
                  >
                    {description.full}
                    {description.detail && (
                      <span className="font-medium text-muted-foreground">
                        {" "}
                        · {description.detail}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      open && "rotate-180",
                    )}
                  />
                </button>

                {open && (
                  <div
                    id={`plan-day-${day}`}
                    className="mt-2 rounded-2xl border border-primary/30 bg-primary/[0.06] p-3"
                  >
                    <SectionLabel>Mes séances sauvegardées</SectionLabel>
                    {view.templatesById === null ? (
                      <Skeleton className="mb-4 h-11 w-full rounded-xl" />
                    ) : view.templates.length === 0 ? (
                      <p className="mb-4 text-xs text-muted-foreground">
                        Aucune séance sauvegardée pour l&apos;instant. Enregistres-en une depuis une
                        séance terminée.
                      </p>
                    ) : (
                      <ul className="mb-4 flex flex-col gap-1.5">
                        {view.templates.map((template) => {
                          const selected = isTemplateDay(plan, template.id);
                          return (
                            <li key={template.id}>
                              <button
                                type="button"
                                aria-pressed={selected}
                                disabled={busy}
                                onClick={() =>
                                  save(day, { kind: "template", templateId: template.id })
                                }
                                className={cn(
                                  "flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm disabled:opacity-60",
                                  selected ? CHOICE_ON : CHOICE_OFF,
                                )}
                              >
                                {selected && <Check aria-hidden className="h-4 w-4 shrink-0" />}
                                <span className="min-w-0 flex-1 truncate font-semibold">
                                  {template.name}
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {describeTemplateLoad(template)}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <SectionLabel>Ou juste des groupes musculaires</SectionLabel>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {PLAN_GROUP_IDS.map((group) => {
                        const selected = draftGroups.includes(group);
                        return (
                          <button
                            key={group}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleGroup(group)}
                            className={cn(
                              "min-h-[40px] rounded-full border px-3.5 text-xs font-semibold",
                              selected ? CHOICE_ON : CHOICE_OFF,
                            )}
                          >
                            {PLAN_GROUP_LABELS[group]}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      disabled={draftGroups.length === 0 || busy}
                      onClick={() => save(day, { kind: "muscles", groups: draftGroups })}
                      className="mb-4 min-h-[44px] w-full rounded-xl bg-gradient-primary px-4 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-40 disabled:shadow-none"
                    >
                      Enregistrer
                    </button>

                    <SectionLabel>Ou rien</SectionLabel>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        aria-pressed={plan?.kind === "rest"}
                        disabled={busy}
                        onClick={() => save(day, { kind: "rest" })}
                        className={cn(
                          "inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold disabled:opacity-60",
                          plan?.kind === "rest" ? CHOICE_ON : CHOICE_OFF,
                        )}
                      >
                        <Moon aria-hidden className="h-4 w-4" />
                        Jour de repos
                      </button>
                      {plan !== null && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => save(day, null)}
                          className="min-h-[44px] px-2 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
                        >
                          Laisser ce jour libre
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        Ton rythme est un guide, pas un contrat.
        <br />
        Un jour manqué reste rattrapable.
      </p>
    </Sheet>
  );
}

function isTemplateDay(plan: PlanDay | null, templateId: string): boolean {
  return plan?.kind === "template" && plan.templateId === templateId;
}
