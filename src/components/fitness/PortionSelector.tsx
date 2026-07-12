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

export interface PortionChange {
  quantity: number;
  unit: PortionUnit;
  grams: number;
  /** Grammes pour 1 unité (1 pour g/ml, sinon la référence). */
  gramsPerUnit: number | null;
  calories: number | null;
  proteins: number | null;
  carbs: number | null;
  fats: number | null;
}

interface Props {
  food: FoodSuggestion;
  /** Notifie le parent du résultat (macros + portion choisie). */
  onChange: (result: PortionChange) => void;
  /** Portion initiale imposée (édition d'un repas déjà loggé). Prioritaire sur localStorage. */
  initial?: { quantity: number; unit: PortionUnit; gramsPerUnit?: number | null } | null;
  /** Afficher les raccourcis ½ / ¾ / ×2 (défaut : true). */
  quickScale?: boolean;
}

/**
 * Sélecteur de portion intelligent — source de vérité unique = quantité + unité.
 *  - presets (½, 1, 2 scoops, ou 50/100/150 g par défaut)
 *  - saisie libre (virgule ou point)
 *  - raccourcis ½ / ¾ / ×2 qui ajustent la quantité
 *  - macros recalculés en direct via calculateNutritionFromPortion
 */
export function PortionSelector({ food, onChange, initial, quickScale = true }: Props) {
  const KNOWN_UNITS = [
    "g",
    "ml",
    "scoop",
    "unite",
    "pot",
    "tranche",
    "sachet",
    "cas",
    "cac",
    "bouteille",
    "canette",
  ];

  const reference: PortionReference | null = useMemo(() => {
    // Édition : si une référence (grammes/unité) est fournie, elle prime.
    if (initial?.gramsPerUnit && initial.unit !== "g" && initial.unit !== "ml") {
      return { unitLabel: initial.unit, gramsPerUnit: initial.gramsPerUnit };
    }
    const ds = food.default_serving;
    if (ds && ds.grams > 0 && ds.quantity > 0 && KNOWN_UNITS.includes(ds.unit)) {
      return { unitLabel: ds.unit as PortionUnit, gramsPerUnit: ds.grams / ds.quantity };
    }
    return detectDefaultPortion(food.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [food.name, food.default_serving, initial]);

  const presets = useMemo(() => buildPresets(reference), [reference]);

  // Portion initiale : imposée (édition) > dernier choix mémorisé > 1 unité réf > 100 g.
  const init = useMemo(() => {
    if (initial) return { quantity: initial.quantity, unit: initial.unit };
    const saved = loadSavedPortion(food);
    if (saved) return { quantity: saved.quantity, unit: saved.unit };
    if (reference) return { quantity: 1, unit: reference.unitLabel };
    return { quantity: 100, unit: "g" as PortionUnit };
  }, [food, reference, initial]);

  const [unit, setUnit] = useState<PortionUnit>(init.unit);
  const [qtyInput, setQtyInput] = useState<string>(formatDecimal(init.quantity));

  const gramsPerUnit = unit === "g" || unit === "ml" ? 1 : reference?.gramsPerUnit ?? null;

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
      gramsPerUnit,
      calories: calc.calories,
      proteins: calc.proteins,
      carbs: calc.carbs,
      fats: calc.fats,
    });
  }, [qtyInput, unit, reference, food, onChange, gramsPerUnit]);

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

  const scaleBy = (factor: number) => {
    const cur = parseDecimal(qtyInput);
    if (cur == null || cur <= 0) return;
    setQtyInput(formatDecimal(Math.round(cur * factor * 100) / 100));
  };

  // Pas du stepper : 10g pour g/ml, 0.5 unité sinon.
  const stepSize = unit === "g" || unit === "ml" ? 10 : 0.5;

  const adjustBy = (delta: number) => {
    const cur = parseDecimal(qtyInput) ?? 0;
    const next = Math.max(stepSize, Math.round((cur + delta) * 100) / 100);
    setQtyInput(formatDecimal(next));
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
            1 {reference.unitLabel} ≈ {Math.round(reference.gramsPerUnit)} g
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

      {/* Saisie libre + stepper ±*/}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => adjustBy(-stepSize)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-lg font-bold text-foreground active:scale-95 active:bg-muted"
          aria-label={`Diminuer de ${stepSize}`}
        >
          −
        </button>
        <input
          type="text"
          inputMode="decimal"
          aria-label="Quantité"
          value={qtyInput}
          onChange={(e) => setQtyInput(e.target.value)}
          autoComplete="off"
          placeholder="ex. 33"
          className={
            "w-20 rounded-lg border bg-card px-2 py-2 text-center text-base font-semibold outline-none focus:border-primary " +
            (errorMsg ? "border-destructive" : "border-border")
          }
        />
        <button
          type="button"
          onClick={() => adjustBy(+stepSize)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-lg font-bold text-foreground active:scale-95 active:bg-muted"
          aria-label={`Augmenter de ${stepSize}`}
        >
          +
        </button>
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

      {/* Raccourcis d'ajustement */}
      {quickScale && (
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "½", f: 0.5 },
            { label: "¾", f: 0.75 },
            { label: "×2", f: 2 },
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => scaleBy(s.f)}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {errorMsg && (
        <p role="alert" className="text-[11px] text-destructive">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
