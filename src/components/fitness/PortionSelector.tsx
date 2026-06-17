import { useEffect, useMemo, useState } from "react";
import { Scale } from "lucide-react";
import {
  buildPresets,
  calculateNutritionFromPortion,
  detectDefaultPortion,
  formatDecimal,
  loadSavedPortion,
  parseDecimal,
  per100FromFood,
  type PortionPreset,
  type PortionReference,
  type PortionUnit,
} from "@/lib/nutrition/portions";
import type { FoodSuggestion } from "@/services/foodSuggestion";

interface Props {
  food: FoodSuggestion;
  /** Notifie le parent du résultat (macros + portion choisie). */
  onChange: (result: {
    quantity: number;
    unit: PortionUnit;
    grams: number;
    calories: number | null;
    proteins: number | null;
    carbs: number | null;
    fats: number | null;
  }) => void;
}

/**
 * Sélecteur de portion intelligent :
 *  - presets (½, 1, 2 scoops, ou 50/100/150 g par défaut)
 *  - saisie libre en grammes (virgule ou point)
 *  - macros recalculés en direct
 *  - dernier choix mémorisé par aliment (localStorage)
 */
export function PortionSelector({ food, onChange }: Props) {
  const KNOWN_UNITS = ["g", "ml", "scoop", "unite", "pot", "tranche", "sachet", "cas", "cac"];
  const reference: PortionReference | null = useMemo(() => {
    const ds = food.default_serving;
    if (ds && ds.grams > 0 && ds.quantity > 0 && KNOWN_UNITS.includes(ds.unit)) {
      return { unitLabel: ds.unit as PortionUnit, gramsPerUnit: ds.grams / ds.quantity };
    }
    return detectDefaultPortion(food.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [food.name, food.default_serving]);
  const presets = useMemo(() => buildPresets(reference), [reference]);

  // Restaurer le dernier choix s'il existe, sinon fallback : 1 unité de la
  // référence ou 100 g.
  const initial = useMemo(() => {
    const saved = loadSavedPortion(food);
    if (saved) {
      return { quantity: saved.quantity, unit: saved.unit };
    }
    if (reference) return { quantity: 1, unit: reference.unitLabel };
    return { quantity: 100, unit: "g" as PortionUnit };
  }, [food, reference]);

  const [unit, setUnit] = useState<PortionUnit>(initial.unit);
  const [qtyInput, setQtyInput] = useState<string>(formatDecimal(initial.quantity));

  // Recalcule et propage au parent à chaque changement.
  useEffect(() => {
    const calc = calculateNutritionFromPortion({
      quantity: qtyInput,
      unit,
      reference,
      per100g: per100FromFood(food),
    });
    if (calc.error) return; // ne pas propager une saisie invalide
    onChange({
      quantity: parseDecimal(qtyInput) ?? 0,
      unit,
      grams: calc.totalGrams,
      calories: calc.calories,
      proteins: calc.proteins,
      carbs: calc.carbs,
      fats: calc.fats,
    });
  }, [qtyInput, unit, reference, food, onChange]);

  const parsed = parseDecimal(qtyInput);
  const errorMsg =
    qtyInput.trim() === ""
      ? null
      : parsed == null
        ? "Saisissez un nombre (ex. 33 ou 33,5)"
        : parsed <= 0
          ? "La quantité doit être supérieure à 0"
          : null;

  const calc = calculateNutritionFromPortion({
    quantity: qtyInput,
    unit,
    reference,
    per100g: per100FromFood(food),
  });

  const applyPreset = (p: PortionPreset) => {
    setUnit(p.unit);
    setQtyInput(formatDecimal(p.quantity));
  };

  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          Portion
        </span>
        {reference && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            1 {reference.unitLabel} ≈ {reference.gramsPerUnit} g
          </span>
        )}
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const active = unit === p.unit && parseDecimal(qtyInput) === p.quantity;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              className={
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors " +
                (active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/50")
              }
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Saisie libre */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          aria-label="Quantité"
          value={qtyInput}
          onChange={(e) => setQtyInput(e.target.value)}
          placeholder="ex. 33"
          className={
            "w-24 rounded-lg border bg-card px-2 py-1.5 text-center text-sm font-semibold outline-none focus:border-primary " +
            (errorMsg ? "border-destructive" : "border-border")
          }
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value as PortionUnit)}
          className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="g">g</option>
          <option value="ml">ml</option>
          {reference && reference.unitLabel !== "g" && reference.unitLabel !== "ml" && (
            <option value={reference.unitLabel}>{reference.unitLabel}</option>
          )}
        </select>
        {!errorMsg && calc.totalGrams > 0 && (
          <span className="text-[11px] text-muted-foreground">
            = {formatDecimal(calc.totalGrams)} g · {calc.calories ?? "?"} kcal
          </span>
        )}
      </div>

      {errorMsg && (
        <p role="alert" className="text-[11px] text-destructive">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
