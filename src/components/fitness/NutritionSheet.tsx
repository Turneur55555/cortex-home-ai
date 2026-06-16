import { useCallback, useMemo, useState } from "react";
import { ChefHat, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useAddNutrition } from "@/hooks/use-fitness";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import { FoodAutocomplete } from "@/components/FoodAutocomplete";
import { usePantryItems, useDeductFromStock } from "@/hooks/use-pantry";
import type { PantryItem } from "@/hooks/use-pantry";
import type { FoodSuggestion } from "@/services/openFoodFacts";
import type { MealPrefill } from "@/lib/nutrition/utils";
import { PortionSelector } from "@/components/fitness/PortionSelector";
import {
  parseDecimal,
  formatDecimal,
  saveLastPortion,
  type PortionUnit,
} from "@/lib/nutrition/portions";

// ─── PantryPicker ─────────────────────────────────────────────────────────────

interface PantryPickerProps {
  selected: PantryItem | null;
  onSelect: (item: PantryItem) => void;
  onClear: () => void;
}

function PantryPicker({ selected, onSelect, onClear }: PantryPickerProps) {
  const { data: items, isLoading } = usePantryItems();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return (items ?? []).slice(0, 12);
    return (items ?? []).filter((it) => it.name.toLowerCase().includes(needle)).slice(0, 12);
  }, [items, q]);

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher dans ma cuisine…"
        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
      />
      {isLoading && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {!isLoading && filtered.length === 0 && (
        <p className="py-2 text-center text-xs text-muted-foreground">
          Aucun aliment dans la cuisine
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {filtered.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => (selected?.id === it.id ? onClear() : onSelect(it))}
            className={
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors " +
              (selected?.id === it.id
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-foreground hover:border-primary/50")
            }
          >
            {it.name}
            <span className="text-[10px] text-muted-foreground">
              {it.quantity}{it.unit ? ` ${it.unit}` : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

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

  // Per-100g reference when a known food is selected (from autocomplete or pantry)
  const [baseFood, setBaseFood] = useState<FoodSuggestion | null>(null);
  const [gramQty, setGramQty] = useState("100");

  const [form, setForm] = useState({
    name: prefill?.name ?? "",
    meal: prefill?.meal ?? "petit-dej",
    calories: prefill?.calories ?? "",
    proteins: prefill?.proteins ?? "",
    carbs: prefill?.carbs ?? "",
    fats: prefill?.fats ?? "",
  });

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  // Auto-recompute macros whenever gram quantity changes
  useEffect(() => {
    if (!baseFood) return;
    const grams = Number(gramQty) || 0;
    if (grams <= 0) return;
    setForm((f) => ({ ...f, ...computeMacrosFor(baseFood, grams) }));
  }, [gramQty, baseFood]);

  const selectBaseFood = useCallback((food: FoodSuggestion, grams = 100) => {
    setBaseFood(food);
    setGramQty(String(grams));
    setForm((f) => ({ ...f, name: food.name, ...computeMacrosFor(food, grams) }));
  }, []);

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
      selectBaseFood(food, 100);
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

    const calories = num(form.calories) as number | null;
    const proteins = num(form.proteins);
    const carbs = num(form.carbs);
    const fats = num(form.fats);

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
      ...(baseFood
        ? {
            consumed_quantity: Number(gramQty) || null,
            consumed_unit: "g",
          }
        : {}),
    });
    onClose();
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
          onSelect={(f) => selectBaseFood(f, 100)}
          required
        />

        {/* Gram portion stepper — shown when a food with known per-100g values is selected */}
        {baseFood && (
          <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
            <Scale className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1 text-xs font-semibold text-primary">Portion</span>
            <input
              type="number"
              min="1"
              step="5"
              value={gramQty}
              onChange={(e) => setGramQty(e.target.value)}
              className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-center text-sm font-semibold outline-none focus:border-primary"
            />
            <span className="text-xs text-muted-foreground">g</span>
          </div>
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
          type="number"
          value={form.calories}
          onChange={(v) => setForm({ ...form, calories: v })}
        />
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Prot. (g)"
            type="number"
            step="0.1"
            value={form.proteins}
            onChange={(v) => setForm({ ...form, proteins: v })}
          />
          <Field
            label="Gluc. (g)"
            type="number"
            step="0.1"
            value={form.carbs}
            onChange={(v) => setForm({ ...form, carbs: v })}
          />
          <Field
            label="Lip. (g)"
            type="number"
            step="0.1"
            value={form.fats}
            onChange={(v) => setForm({ ...form, fats: v })}
          />
        </div>
        <SubmitButton pending={busy}>Ajouter le repas</SubmitButton>
      </form>
    </Sheet>
  );
}
