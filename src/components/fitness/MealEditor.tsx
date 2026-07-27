import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { FullscreenSheet as Sheet, Field, SubmitButton } from "@/components/shared/FormComponents";
import { FoodAutocomplete } from "@/components/FoodAutocomplete";
import { scalePer100, isMealSlug, type MealSlug } from "@/lib/nutrition/meals";
import { formatDecimal, parseDecimal } from "@/lib/nutrition/weight";
import type { FoodSuggestion } from "@/services/foodSuggestion";
import { MealSelect } from "@/components/fitness/MealSelect";
import { WeightSelector } from "@/components/fitness/WeightSelector";
import { useCreateSavedMeal, useUpdateSavedMeal, type SavedMeal } from "@/hooks/use-saved-meals";

type BuilderItem = {
  key: string;
  food_id: string | null;
  name: string;
  grams: number;
  per100: {
    calories: number | null;
    proteins: number | null;
    carbs: number | null;
    fats: number | null;
  };
};

const scale = scalePer100;

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/**
 * Éditeur de repas enregistré — composant unique pour la création et la
 * modification (mode "create" | "edit"), pour ne jamais dupliquer la logique
 * de composition d'un repas (voir refactor bibliothèque des repas).
 */
export function MealEditor({
  mode,
  meal: existingMeal,
  onClose,
}: {
  mode: "create" | "edit";
  meal?: SavedMeal | null;
  onClose: () => void;
}) {
  const create = useCreateSavedMeal();
  const update = useUpdateSavedMeal();

  const existingMealSlug = existingMeal?.meal ?? "";
  const [name, setName] = useState(existingMeal?.name ?? "");
  const [meal, setMeal] = useState<MealSlug>(
    isMealSlug(existingMealSlug) ? (existingMealSlug as MealSlug) : "dejeuner",
  );
  const [items, setItems] = useState<BuilderItem[]>(() =>
    (existingMeal?.saved_meal_items ?? []).map((it) => ({
      key: it.id,
      food_id: it.food_id,
      name: it.name,
      grams: it.consumed_quantity ?? 100,
      per100: {
        calories: it.base_calories,
        proteins: it.base_proteins,
        carbs: it.base_carbs,
        fats: it.base_fats,
      },
    })),
  );
  const [search, setSearch] = useState("");

  const addFood = (f: FoodSuggestion) => {
    setItems((prev) => [
      ...prev,
      {
        key: `${f.id}-${Date.now()}`,
        food_id: typeof f.id === "string" && isUuid(f.id) ? f.id : null,
        name: f.name,
        grams: 100,
        per100: {
          calories: f.calories,
          proteins: f.proteins,
          carbs: f.carbs,
          fats: f.fats,
        },
      },
    ]);
    setSearch("");
  };

  const setGrams = (key: string, grams: number) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, grams } : it)));
  const removeItem = (key: string) => setItems((prev) => prev.filter((it) => it.key !== key));

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, it) => ({
          calories: acc.calories + (scale(it.per100.calories, it.grams) ?? 0),
          proteins: acc.proteins + (scale(it.per100.proteins, it.grams) ?? 0),
          carbs: acc.carbs + (scale(it.per100.carbs, it.grams) ?? 0),
          fats: acc.fats + (scale(it.per100.fats, it.grams) ?? 0),
        }),
        { calories: 0, proteins: 0, carbs: 0, fats: 0 },
      ),
    [items],
  );

  const pending = create.isPending || update.isPending;

  const saveMeal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || items.length === 0) return;
    const payload = {
      name: name.trim(),
      meal,
      items: items.map((it) => {
        const kcal = scale(it.per100.calories, it.grams);
        const kcalInt = kcal == null ? null : Math.round(kcal);
        return {
          food_id: it.food_id,
          name: it.name,
          calories: kcalInt,
          proteins: scale(it.per100.proteins, it.grams),
          carbs: scale(it.per100.carbs, it.grams),
          fats: scale(it.per100.fats, it.grams),
          // Convention : base_* = valeurs pour 100 g (bug B1 corrigé).
          base_calories: it.per100.calories,
          base_proteins: it.per100.proteins,
          base_carbs: it.per100.carbs,
          base_fats: it.per100.fats,
          serving_count: 1,
          consumed_quantity: it.grams,
          consumed_unit: "g",
          consumed_grams_per_unit: 1,
        };
      }),
    };

    if (mode === "edit" && existingMeal) {
      update.mutate({ id: existingMeal.id, ...payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Sheet title={mode === "edit" ? "Modifier le repas" : "Composer un repas"} onClose={onClose}>
      <form onSubmit={saveMeal} className="space-y-4">
        <Field
          label="Nom du repas"
          value={name}
          onChange={setName}
          placeholder="Ex : Mon petit-déj"
          required
        />

        <MealSelect value={meal} onChange={setMeal} label="Moment par défaut" />

        <FoodAutocomplete
          value={search}
          onChange={setSearch}
          onSelect={addFood}
          placeholder="Ajouter un aliment…"
        />

        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((it) => (
              <li
                key={it.key}
                className="space-y-2 rounded-xl border border-border bg-surface p-2.5"
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{it.name}</p>
                  <button
                    type="button"
                    onClick={() => removeItem(it.key)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground active:bg-destructive/10 active:text-destructive"
                    aria-label="Retirer l'aliment"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <WeightSelector
                  food={{
                    id: it.key,
                    name: it.name,
                    calories: it.per100.calories,
                    proteins: it.per100.proteins,
                    carbs: it.per100.carbs,
                    fats: it.per100.fats,
                  }}
                  value={formatDecimal(it.grams)}
                  onChange={(text) => setGrams(it.key, parseDecimal(text) ?? 0)}
                />
                <p className="text-[11px] text-muted-foreground">
                  {Math.round(scale(it.per100.calories, it.grams) ?? 0)} kcal · L
                  {scale(it.per100.fats, it.grams) ?? 0} G{scale(it.per100.carbs, it.grams) ?? 0} P
                  {scale(it.per100.proteins, it.grams) ?? 0}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-xl bg-surface px-3 py-2 text-center text-xs">
          <span className="font-bold text-primary">{Math.round(totals.calories)}</span> kcal · L
          {Math.round(totals.fats)} G{Math.round(totals.carbs)} P{Math.round(totals.proteins)}
        </div>

        <SubmitButton pending={pending}>
          {mode === "edit" ? "Enregistrer les modifications" : "Enregistrer le repas"}
        </SubmitButton>
      </form>
    </Sheet>
  );
}
