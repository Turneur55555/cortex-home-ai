import { MEAL_OPTIONS, type MealSlug } from "@/lib/nutrition/meals";

// Sélecteur de repas partagé — unique implémentation utilisée par tout point
// d'entrée qui journalise un aliment (NutritionSheet "Nouvel aliment",
// BarcodeScannerSheet, etc.), pour ne jamais dupliquer ce <select>.
interface MealSelectProps {
  value: MealSlug;
  onChange: (value: MealSlug) => void;
}

export function MealSelect({ value, onChange }: MealSelectProps) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Repas
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as MealSlug)}
        className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
      >
        {MEAL_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
