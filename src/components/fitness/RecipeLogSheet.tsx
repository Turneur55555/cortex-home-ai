import { useState } from "react";
import { Loader2, Utensils } from "lucide-react";
import { FullscreenSheet as Sheet } from "@/components/shared/FormComponents";
import { MEAL_LABELS, per100FromTotal } from "@/lib/nutrition/meals";
import { useRecipes, useRecipe } from "@/hooks/useRecipes";
import { useAddNutritionBatch } from "@/hooks/use-fitness";
import { scaleServings, totalRecipeGrams } from "@/lib/nutrition/recipes";

interface Props {
  date: string;
  onClose: () => void;
}

export function RecipeLogSheet({ date, onClose }: Props) {
  const { data: recipes, isLoading: recipesLoading } = useRecipes();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState("dejeuner");
  const addBatch = useAddNutritionBatch();
  const { data: recipeDetail, isLoading: detailLoading } = useRecipe(selectedId);

  const perS = recipeDetail?.perServingMacros;
  const scaled = perS ? scaleServings(perS, servings) : null;

  // Masse totale de la recette (g), uniquement si tous les ingrédients ont une
  // masse connue — sinon `null` (jamais un poids inventé). Voir totalRecipeGrams().
  const recipeGrams = recipeDetail ? totalRecipeGrams(recipeDetail.ingredients) : null;
  const gramsPerServing =
    recipeGrams != null && recipeDetail && recipeDetail.servings > 0
      ? recipeGrams / recipeDetail.servings
      : null;
  const gramsConsumed = gramsPerServing != null ? gramsPerServing * servings : null;

  const confirm = () => {
    if (!recipeDetail || !scaled) return;
    const calories = Math.round(scaled.calories);
    const proteins = Math.round(scaled.protein * 10) / 10;
    const carbs = Math.round(scaled.carbs * 10) / 10;
    const fats = Math.round(scaled.fat * 10) / 10;
    const fiber = Math.round(scaled.fiber * 10) / 10;
    const grams =
      gramsConsumed != null && gramsConsumed > 0 ? Math.round(gramsConsumed * 10) / 10 : null;
    addBatch.mutate(
      [
        {
          date,
          meal,
          name: recipeDetail.name + (servings !== 1 ? ` ×${servings}` : ""),
          calories,
          proteins,
          carbs,
          fats,
          fiber,
          // Quand la masse de la recette est connue avec certitude (tous les
          // ingrédients ont un poids) : base_* redevient des valeurs /100 g,
          // comme partout ailleurs dans l'app (scan IA, code-barres, manuel,
          // repas enregistrés). Sinon comportement inchangé (base_* = par portion).
          base_calories: grams ? per100FromTotal(calories, grams) : Math.round(perS!.calories),
          base_proteins: grams
            ? per100FromTotal(proteins, grams)
            : Math.round(perS!.protein * 10) / 10,
          base_carbs: grams ? per100FromTotal(carbs, grams) : Math.round(perS!.carbs * 10) / 10,
          base_fats: grams ? per100FromTotal(fats, grams) : Math.round(perS!.fat * 10) / 10,
          base_fiber: grams ? per100FromTotal(fiber, grams) : Math.round(perS!.fiber * 10) / 10,
          serving_count: servings,
          percentage_consumed: 100,
          // B3 : sans ces champs, l'édition de portion retombait sur 1 portion
          // et écrasait les macros réelles (÷N). Grammes quand fiables, sinon
          // portions comme avant.
          consumed_quantity: grams ?? servings,
          consumed_unit: grams ? "g" : "portion",
          consumed_grams_per_unit: grams ? 1 : null,
        },
      ],
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Sheet title="Ajouter une recette" onClose={onClose}>
      <div className="space-y-4">
        {recipesLoading && (
          <div className="flex h-20 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!recipesLoading && (recipes ?? []).length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <Utensils className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Aucune recette</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Crée d'abord des recettes dans l'onglet Recettes.
            </p>
          </div>
        )}

        {!recipesLoading && (recipes ?? []).length > 0 && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recette
              </label>
              <select
                value={selectedId ?? ""}
                onChange={(e) => { setSelectedId(e.target.value || null); setServings(1); }}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="">Choisir une recette…</option>
                {(recipes ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.servings} portion{r.servings > 1 ? "s" : ""})
                  </option>
                ))}
              </select>
            </div>

            {selectedId && (
              <>
                {detailLoading && (
                  <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
                  </div>
                )}

                {!detailLoading && recipeDetail && (
                  <>
                    <div className="rounded-xl bg-surface px-3 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Par portion
                      </p>
                      <p className="mt-1 text-sm font-bold text-primary">
                        {Math.round(perS?.calories ?? 0)} kcal
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        P{Math.round((perS?.protein ?? 0) * 10) / 10} · G
                        {Math.round((perS?.carbs ?? 0) * 10) / 10} · L
                        {Math.round((perS?.fat ?? 0) * 10) / 10}
                      </p>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Nombre de portions
                      </label>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setServings((s) => Math.max(0.5, s - 0.5))}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-lg font-bold text-muted-foreground hover:text-foreground"
                        >
                          −
                        </button>
                        <span className="min-w-[2rem] text-center text-base font-semibold">{servings}</span>
                        <button
                          type="button"
                          onClick={() => setServings((s) => s + 0.5)}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-lg font-bold text-muted-foreground hover:text-foreground"
                        >
                          +
                        </button>
                        {scaled && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            = {Math.round(scaled.calories)} kcal
                            {gramsConsumed != null ? ` · ${Math.round(gramsConsumed)} g` : ""}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Repas
                      </label>
                      <select
                        value={meal}
                        onChange={(e) => setMeal(e.target.value)}
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
                      >
                        {Object.entries(MEAL_LABELS).map(([slug, label]) => (
                          <option key={slug} value={slug}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={confirm}
                      disabled={addBatch.isPending}
                      className="inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
                    >
                      {addBatch.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Ajouter au journal
                    </button>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
