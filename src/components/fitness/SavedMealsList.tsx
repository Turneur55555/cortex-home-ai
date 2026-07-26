import { useState } from "react";
import { Bookmark, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";
import { MealSelect } from "@/components/fitness/MealSelect";
import { useLogSavedMeal, useDeleteSavedMeal, type SavedMeal } from "@/hooks/use-saved-meals";
import { isMealSlug, type MealSlug } from "@/lib/nutrition/meals";

/**
 * Liste "Mes repas enregistrés" — unique implémentation partagée, utilisée à
 * la fois par FoodLibrarySheet (onglet "Repas") et SavedMealsSheet (mode
 * liste), pour qu'un même repas se journalise toujours avec le même
 * comportement (sélecteur Repas inclus) quel que soit le point d'entrée.
 */
export function SavedMealsList({
  date,
  meals,
  loading,
}: {
  date: string;
  meals: SavedMeal[];
  loading: boolean;
}) {
  const logMeal = useLogSavedMeal();
  const delMeal = useDeleteSavedMeal();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mealByMeal, setMealByMeal] = useState<Record<string, MealSlug>>({});

  const mealFor = (m: SavedMeal): MealSlug =>
    mealByMeal[m.id] ?? (isMealSlug(m.meal ?? "") ? (m.meal as MealSlug) : "dejeuner");

  if (loading && meals.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (meals.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center">
        <Bookmark className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Aucun repas enregistré</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {meals.map((meal) => {
        const kcal = meal.saved_meal_items.reduce(
          (sum, i) => sum + (i.calories ?? 0) * (i.serving_count ?? 1),
          0,
        );
        const expanded = expandedId === meal.id;
        return (
          <li key={meal.id} className="rounded-xl border border-border bg-card p-3">
            <button
              type="button"
              onClick={() => setExpandedId(expanded ? null : meal.id)}
              className="flex w-full items-center gap-3 text-left"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                <Bookmark className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{meal.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {Math.round(kcal)} kcal · {meal.saved_meal_items.length} aliment
                  {meal.saved_meal_items.length > 1 ? "s" : ""}
                </p>
              </div>
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </button>

            {expanded && meal.saved_meal_items.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-border/50 pt-2">
                {meal.saved_meal_items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between text-xs text-muted-foreground"
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0">{item.calories ?? 0} kcal</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-2 flex items-center gap-2">
              <MealSelect
                value={mealFor(meal)}
                onChange={(m) => setMealByMeal((prev) => ({ ...prev, [meal.id]: m }))}
                label={null}
                className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => logMeal.mutate({ id: meal.id, date, meal: mealFor(meal) })}
                disabled={logMeal.isPending}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </button>
              <button
                type="button"
                onClick={() => delMeal.mutate(meal.id)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:text-destructive"
                aria-label="Supprimer le repas"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
