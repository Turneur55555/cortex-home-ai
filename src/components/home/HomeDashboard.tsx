import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Loader2, UtensilsCrossed } from "lucide-react";
import { useNutrition, useNutritionGoals } from "@/hooks/use-fitness";

/**
 * Widgets cross-domaine du tableau de bord d'accueil — Nutrition du jour.
 */
export function HomeDashboard() {
  return <NutritionTodayCard />;
}

function NutritionTodayCard() {
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: rows, isLoading } = useNutrition(today);
  const { data: goals } = useNutritionGoals();

  const totals = useMemo(() => {
    const acc = { calories: 0, proteins: 0 };
    for (const r of rows ?? []) {
      acc.calories += r.calories ?? 0;
      acc.proteins += r.proteins ?? 0;
    }
    return {
      calories: Math.round(acc.calories),
      proteins: Math.round(acc.proteins),
    };
  }, [rows]);

  const calGoal = goals?.calories ?? null;
  const protGoal = goals?.proteins ?? null;
  const calPct =
    calGoal && calGoal > 0 ? Math.min(100, Math.round((totals.calories / calGoal) * 100)) : null;
  const hasData = (rows?.length ?? 0) > 0;

  return (
    <section className="mt-4 overflow-hidden rounded-3xl border border-border bg-gradient-surface p-5 shadow-elevated">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="h-4 w-4 text-lime-400" />
          <span className="text-sm font-semibold">Nutrition du jour</span>
        </div>
        <Link
          to="/fitness"
          className="text-[11px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          Voir tout →
        </Link>
      </div>

      {isLoading ? (
        <div className="flex h-16 items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : hasData ? (
        <>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-2xl font-bold leading-none">
                {totals.calories}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  {calGoal ? `/ ${calGoal} kcal` : "kcal"}
                </span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Protéines {totals.proteins} g
                {protGoal ? ` / ${protGoal} g` : ""}
              </p>
            </div>
          </div>
          {calPct != null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-gradient-to-r from-lime-500 to-emerald-400 transition-all duration-700"
                style={{ width: `${calPct}%` }}
              />
            </div>
          )}
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Aucun repas enregistré aujourd'hui. Ajoute ton premier.
        </p>
      )}
    </section>
  );
}
