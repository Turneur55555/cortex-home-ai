import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAddNutrition } from "@/hooks/use-fitness";
import { supabase } from "@/integrations/supabase/client";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import { FoodAutocomplete } from "@/components/FoodAutocomplete";
import type { FoodSuggestion } from "@/services/foodSuggestion";
import type { MealPrefill } from "@/lib/nutrition/utils";
import { WeightSelector } from "@/components/fitness/WeightSelector";
import {
  parseDecimal,
  formatDecimal,
  saveLastWeight,
  loadSavedWeight,
  buildGramPresets,
  calculateNutritionFromGrams,
  per100FromFood,
} from "@/lib/nutrition/weight";

import { MEAL_OPTIONS, type MealSlug } from "@/lib/nutrition/meals";

// Détecte le repas selon l'heure courante pour pré-remplir le sélecteur.
function detectMealFromHour(): MealSlug {
  const h = new Date().getHours();
  if (h >= 6 && h < 11) return "petit-dej";
  if (h >= 11 && h < 15) return "dejeuner";
  if (h >= 15 && h < 18) return "gouter";
  if (h >= 18 && h < 23) return "diner";
  return "collation";
}

// Normalisation identique au catalogue (food-lookup) pour que l'aliment soit retrouvable.
const normalizeFoodName = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0153/g, "oe")
    .replace(/\u00e6/g, "ae")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Enregistre un aliment perso dans le catalogue `foods` (RLS: user_id = auth.uid()).
// Best-effort : ne bloque jamais le log du repas.
async function saveCustomFood(
  name: string,
  per100: {
    calories: number | null;
    proteins: number | null;
    carbs: number | null;
    fats: number | null;
  },
) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const normalized = normalizeFoodName(name);
    if (normalized.length < 2) return;
    await supabase.from("foods").upsert(
      {
        source: "custom",
        source_id: `user:${user.id}:${normalized}`,
        name,
        normalized_name: normalized,
        calories: per100.calories,
        protein_g: per100.proteins,
        carbs_g: per100.carbs,
        fat_g: per100.fats,
        language: "fr",
      },
      { onConflict: "source,source_id" },
    );
  } catch {
    /* best-effort */
  }
}

// PantryPicker removed: Maison/stocks module deleted.

// ─── NutritionSheet ───────────────────────────────────────────────────────────

interface NutritionSheetProps {
  date: string;
  onClose: () => void;
  prefill?: MealPrefill | null;
}

export function NutritionSheet({ date, onClose, prefill }: NutritionSheetProps) {
  const add = useAddNutrition();

  // Aliment de référence sélectionné (autocomplete).
  const [baseFood, setBaseFood] = useState<FoodSuggestion | null>(null);
  // Poids courant — unique source de vérité pour la quantité de baseFood.
  const [weightText, setWeightText] = useState("");

  const [form, setForm] = useState({
    name: prefill?.name ?? "",
    meal: prefill?.meal ?? detectMealFromHour(),
    calories: prefill?.calories ?? "",
    proteins: prefill?.proteins ?? "",
    carbs: prefill?.carbs ?? "",
    fats: prefill?.fats ?? "",
  });
  // Poids total optionnel pour une saisie manuelle (permet d'enregistrer l'aliment /100 g).
  const [manualGrams, setManualGrams] = useState("");

  // Applique un poids saisi : met à jour la source de vérité (weightText) et
  // dérive systématiquement les macros affichées — jamais l'inverse.
  const applyWeightText = useCallback((text: string, food: FoodSuggestion | null) => {
    setWeightText(text);
    if (!food) return;
    const calc = calculateNutritionFromGrams(text, per100FromFood(food));
    if (calc.error) return;
    setForm((f) => ({
      ...f,
      calories: calc.calories != null ? String(calc.calories) : "",
      proteins: calc.proteins != null ? formatDecimal(calc.proteins) : "",
      carbs: calc.carbs != null ? formatDecimal(calc.carbs) : "",
      fats: calc.fats != null ? formatDecimal(calc.fats) : "",
    }));
  }, []);

  const selectBaseFood = useCallback(
    (food: FoodSuggestion) => {
      setBaseFood(food);
      setForm((f) => ({ ...f, name: food.name }));
      const saved = loadSavedWeight(food);
      const presets = buildGramPresets(food);
      const startGrams = saved ?? presets[1]?.grams ?? 100;
      applyWeightText(formatDecimal(startGrams), food);
    },
    [applyWeightText],
  );

  // Poids courant dérivé du texte saisi — jamais stocké séparément.
  const weightCalc = baseFood
    ? calculateNutritionFromGrams(weightText, per100FromFood(baseFood))
    : null;
  const grams = weightCalc && !weightCalc.error ? weightCalc.totalGrams : null;

  // Logique d'insertion pure — retourne true si l'ajout a réussi.
  const doAdd = async (): Promise<boolean> => {
    if (!form.name.trim()) return false;

    const calories = parseDecimal(form.calories);
    const proteins = parseDecimal(form.proteins);
    const carbs = parseDecimal(form.carbs);
    const fats = parseDecimal(form.fats);

    const outOfRange = (v: number | null, max: number) => v != null && (v < 0 || v > max);
    if (
      outOfRange(calories, 10000) ||
      outOfRange(proteins, 1000) ||
      outOfRange(carbs, 1000) ||
      outOfRange(fats, 1000)
    ) {
      toast.error(
        "Valeurs hors limites : kcal ≤ 10000, macros ≤ 1000 g, et aucune valeur négative.",
      );
      return false;
    }

    if (baseFood && grams != null) {
      saveLastWeight(baseFood, grams);
    }

    const mGrams = parseDecimal(manualGrams);
    const manualWithGrams = !baseFood && mGrams != null && mGrams > 0;
    const per100 = manualWithGrams
      ? {
          calories: calories != null ? Math.round((calories / mGrams!) * 100) : null,
          proteins: proteins != null ? Math.round((proteins / mGrams!) * 1000) / 10 : null,
          carbs: carbs != null ? Math.round((carbs / mGrams!) * 1000) / 10 : null,
          fats: fats != null ? Math.round((fats / mGrams!) * 1000) / 10 : null,
        }
      : null;

    try {
      const isFood = !!(baseFood && grams != null);
      await add.mutateAsync({
        date,
        name: form.name.trim(),
        meal: form.meal,
        calories,
        proteins,
        carbs,
        fats,
        base_calories: isFood ? baseFood!.calories : per100 ? per100.calories : calories,
        base_proteins: isFood ? baseFood!.proteins : per100 ? per100.proteins : proteins,
        base_carbs: isFood ? baseFood!.carbs : per100 ? per100.carbs : carbs,
        base_fats: isFood ? baseFood!.fats : per100 ? per100.fats : fats,
        serving_count: 1,
        percentage_consumed: 100,
        consumed_quantity: isFood ? grams! : manualWithGrams ? mGrams! : null,
        consumed_unit: "g",
        consumed_grams_per_unit: null,
      });
      if (manualWithGrams && per100) void saveCustomFood(form.name.trim(), per100);
      return true;
    } catch {
      return false;
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await doAdd();
    if (ok) onClose();
  };

  // Ajoute l'aliment et réinitialise le formulaire pour en saisir un autre
  // sans fermer la sheet (utile pour les repas multi-aliments).
  const submitAndContinue = async () => {
    const currentMeal = form.meal;
    const ok = await doAdd();
    if (ok) {
      setBaseFood(null);
      setWeightText("");
      setManualGrams("");
      setForm({ name: "", meal: currentMeal, calories: "", proteins: "", carbs: "", fats: "" });
    }
  };

  const busy = add.isPending;

  return (
    <Sheet title={prefill ? "Confirmer l'aliment" : "Nouvel aliment"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <FoodAutocomplete
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          onSelect={(f) => selectBaseFood(f)}
          onCreateCustom={(name) => {
            setBaseFood(null);
            setForm((f) => ({ ...f, name }));
          }}
          required
        />

        {/* Sélecteur de poids intelligent (presets + grammes libres) */}
        {baseFood && (
          <WeightSelector
            food={baseFood}
            value={weightText}
            onChange={(text) => applyWeightText(text, baseFood)}
          />
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
            {MEAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {!baseFood && (
          <Field
            label="Poids total (g) — optionnel, pour enregistrer l'aliment"
            type="text"
            value={manualGrams}
            onChange={(v) => setManualGrams(v)}
          />
        )}
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={submitAndContinue}
            disabled={busy}
            className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border text-sm font-semibold transition-opacity disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}+ Continuer
          </button>
          <SubmitButton pending={busy}>Ajouter</SubmitButton>
        </div>
      </form>
    </Sheet>
  );
}
