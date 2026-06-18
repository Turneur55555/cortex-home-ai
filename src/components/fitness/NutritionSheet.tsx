import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useAddNutrition } from "@/hooks/use-fitness";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import { FoodAutocomplete } from "@/components/FoodAutocomplete";
import type { FoodSuggestion } from "@/services/foodSuggestion";
import type { MealPrefill } from "@/lib/nutrition/utils";
import { PortionSelector } from "@/components/fitness/PortionSelector";
import {
  parseDecimal,
  formatDecimal,
  saveLastPortion,
  type PortionUnit,
} from "@/lib/nutrition/portions";

// PantryPicker removed: Maison/stocks module deleted.


// ─── NutritionSheet ───────────────────────────────────────────────────────────

interface NutritionSheetProps {
  date: string;
  onClose: () => void;
  prefill?: MealPrefill | null;
}

export function NutritionSheet({ date, onClose, prefill }: NutritionSheetProps) {
  const add = useAddNutrition();
  const deduct = useDeductFromStock();
  const [pantryOpen, setPantryOpen] = useState(false);
  const [pantryItem, setPantryItem] = useState<PantryItem | null>(null);
  const [pantryQty, setPantryQty] = useState("1");

  // Aliment de référence sélectionné (autocomplete / pantry).
  const [baseFood, setBaseFood] = useState<FoodSuggestion | null>(null);
  // État courant de la portion (renseigné par PortionSelector).
  const [portion, setPortion] = useState<{
    quantity: number;
    unit: PortionUnit;
    grams: number;
  } | null>(null);

  const [form, setForm] = useState({
    name: prefill?.name ?? "",
    meal: prefill?.meal ?? "petit-dej",
    calories: prefill?.calories ?? "",
    proteins: prefill?.proteins ?? "",
    carbs: prefill?.carbs ?? "",
    fats: prefill?.fats ?? "",
  });

  const selectBaseFood = useCallback((food: FoodSuggestion) => {
    setBaseFood(food);
    setForm((f) => ({ ...f, name: food.name }));
  }, []);

  // Callback stable consommé par PortionSelector — met à jour le form.
  const handlePortionChange = useCallback(
    (r: { quantity: number; unit: PortionUnit; grams: number;
          calories: number | null; proteins: number | null;
          carbs: number | null; fats: number | null }) => {
      setPortion({ quantity: r.quantity, unit: r.unit, grams: r.grams });
      setForm((f) => ({
        ...f,
        calories: r.calories != null ? String(r.calories) : "",
        proteins: r.proteins != null ? formatDecimal(r.proteins) : "",
        carbs:    r.carbs    != null ? formatDecimal(r.carbs)    : "",
        fats:     r.fats     != null ? formatDecimal(r.fats)     : "",
      }));
    },
    [],
  );

  const handlePantrySelect = (it: PantryItem) => {
    setPantryItem(it);
    setPantryQty("1");
    if (it.calories_per_100g != null) {
      const food: FoodSuggestion = {
        id: it.id,
        name: it.name,
        calories: it.calories_per_100g,
        proteins: it.protein_per_100g,
        carbs: it.carbs_per_100g,
        fats: it.fat_per_100g,
        source: "local",
      };
      selectBaseFood(food);
    } else {
      setForm((f) => ({ ...f, name: it.name }));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    if (pantryItem) {
      const qty = Number(pantryQty) || 1;
      try {
        await deduct.mutateAsync({
          itemId: pantryItem.id,
          quantityUsed: qty,
          mealName: form.name.trim(),
        });
      } catch {
        return;
      }
    }

    // Parsing tolérant (accepte « 33,5 » et « 33.5 »).
    const calories = parseDecimal(form.calories);
    const proteins = parseDecimal(form.proteins);
    const carbs    = parseDecimal(form.carbs);
    const fats     = parseDecimal(form.fats);

    // Validation des bornes AVANT insert (évite l'écran d'erreur générique).
    const outOfRange = (v: number | null, max: number) =>
      v != null && (v < 0 || v > max);
    if (
      outOfRange(calories, 10000) ||
      outOfRange(proteins, 1000) ||
      outOfRange(carbs, 1000) ||
      outOfRange(fats, 1000)
    ) {
      toast.error("Valeurs hors limites : kcal ≤ 10000, macros ≤ 1000 g, et aucune valeur négative.");
      return;
    }

    // Mémoriser la portion choisie pour cet aliment.
    if (baseFood && portion) {
      saveLastPortion(baseFood, { quantity: portion.quantity, unit: portion.unit });
    }

    try {
      await add.mutateAsync({
        date,
        name: form.name.trim(),
        meal: form.meal,
        calories,
        proteins,
        carbs,
        fats,
        base_calories: calories,
        base_proteins: proteins,
        base_carbs: carbs,
        base_fats: fats,
        serving_count: 1,
        percentage_consumed: 100,
        ...(baseFood && portion
          ? {
              consumed_quantity: portion.grams || null,
              consumed_unit: "g",
            }
          : {}),
      });
      onClose();
    } catch {
      // L'erreur est déjà signalée par la mutation (toast). On évite
      // l'« unhandled rejection » qui déclenchait l'écran générique.
    }
  };

  const busy = add.isPending || deduct.isPending;

  return (
    <Sheet title={prefill ? "Confirmer le repas" : "Nouveau repas"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">

        {/* Pantry picker section */}
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <button
            type="button"
            onClick={() => setPantryOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold"
          >
            <span className="flex items-center gap-2 text-primary">
              <ChefHat className="h-3.5 w-3.5" />
              Depuis ma cuisine
              {pantryItem && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
                  {pantryItem.name}
                </span>
              )}
            </span>
            {pantryOpen ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>

          {pantryOpen && (
            <div className="border-t border-border px-3 pb-3 pt-2">
              <PantryPicker
                selected={pantryItem}
                onSelect={handlePantrySelect}
                onClear={() => { setPantryItem(null); setBaseFood(null); }}
              />
              {pantryItem && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Qté utilisée
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max={pantryItem.quantity}
                    value={pantryQty}
                    onChange={(e) => setPantryQty(e.target.value)}
                    className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-center text-sm outline-none focus:border-primary"
                  />
                  <span className="text-xs text-muted-foreground">
                    / {pantryItem.quantity} {pantryItem.unit ?? ""}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <FoodAutocomplete
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          onSelect={(f) => selectBaseFood(f)}
          required
        />

        {/* Sélecteur de portion intelligent (presets + grammes libres) */}
        {baseFood && (
          <PortionSelector food={baseFood} onChange={handlePortionChange} />
        )}



        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Repas
          </label>
          <select
            value={form.meal}
            onChange={(e) => setForm({ ...form, meal: e.target.value })}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="petit-dej">Petit-déjeuner</option>
            <option value="dejeuner">Déjeuner</option>
            <option value="diner">Dîner</option>
            <option value="collation">Collation</option>
          </select>
        </div>
        <Field
          label={baseFood ? "Calories (kcal, auto)" : "Calories (kcal)"}
          type="text"
          value={form.calories}
          onChange={(v) => setForm({ ...form, calories: v })}
        />
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Prot. (g)"
            type="text"
            value={form.proteins}
            onChange={(v) => setForm({ ...form, proteins: v })}
          />
          <Field
            label="Gluc. (g)"
            type="text"
            value={form.carbs}
            onChange={(v) => setForm({ ...form, carbs: v })}
          />
          <Field
            label="Lip. (g)"
            type="text"
            value={form.fats}
            onChange={(v) => setForm({ ...form, fats: v })}
          />
        </div>
        <SubmitButton pending={busy}>Ajouter le repas</SubmitButton>
      </form>
    </Sheet>
  );
}
