import { useMemo } from "react";
import { Scale } from "lucide-react";
import {
  buildGramPresets,
  calculateNutritionFromGrams,
  formatDecimal,
  parseDecimal,
  per100FromFood,
  type WeightPreset,
} from "@/lib/nutrition/weight";
import type { FoodSuggestion } from "@/services/foodSuggestion";

interface Props {
  food: FoodSuggestion;
  /** Saisie brute du poids (grammes) — unique source de vérité, possédée par l'appelant. */
  value: string;
  onChange: (value: string) => void;
  /** Afficher les raccourcis ½ / ¾ / ×2 (défaut : true). */
  quickScale?: boolean;
}

/**
 * Sélecteur de poids — composant entièrement contrôlé, sans état propre.
 * `value` (texte saisi) est l'unique source de vérité, possédée par l'appelant.
 * Preset actif, macros, erreurs : tout est dérivé de `value` à chaque rendu,
 * jamais stocké séparément — aucun risque de désynchronisation.
 */
export function WeightSelector({ food, value, onChange, quickScale = true }: Props) {
  const presets = useMemo(() => buildGramPresets(food), [food]);

  const parsed = parseDecimal(value);
  const errorMsg =
    value.trim() === ""
      ? null
      : parsed == null
        ? "Saisissez un nombre (ex. 33 ou 33,5)"
        : parsed <= 0
          ? "Le poids doit être supérieur à 0"
          : null;

  const calc = calculateNutritionFromGrams(value, per100FromFood(food));

  const applyPreset = (p: WeightPreset) => onChange(formatDecimal(p.grams));

  const scaleBy = (factor: number) => {
    if (parsed == null || parsed <= 0) return;
    onChange(formatDecimal(Math.round(parsed * factor * 10) / 10));
  };

  const adjustBy = (delta: number) => {
    const cur = parsed ?? 0;
    const next = Math.max(10, Math.round((cur + delta) * 10) / 10);
    onChange(formatDecimal(next));
  };

  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">Poids</span>
      </div>

      {/* Chips de poids suggéré — le preset actif est calculé, jamais stocké */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const active = parsed === p.grams;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              title={p.hint}
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

      {/* Saisie libre + stepper ± */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => adjustBy(-10)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-lg font-bold text-foreground active:scale-95 active:bg-muted"
          aria-label="Diminuer de 10 g"
        >
          −
        </button>
        <input
          type="text"
          inputMode="decimal"
          aria-label="Poids en grammes"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          placeholder="ex. 100"
          className={
            "w-20 rounded-lg border bg-card px-2 py-2 text-center text-base font-semibold outline-none focus:border-primary " +
            (errorMsg ? "border-destructive" : "border-border")
          }
        />
        <span className="text-sm font-semibold text-muted-foreground">g</span>
        <button
          type="button"
          onClick={() => adjustBy(10)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-lg font-bold text-foreground active:scale-95 active:bg-muted"
          aria-label="Augmenter de 10 g"
        >
          +
        </button>
        {!errorMsg && calc.totalGrams > 0 && (
          <span className="text-[11px] text-muted-foreground">{calc.calories ?? "?"} kcal</span>
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
