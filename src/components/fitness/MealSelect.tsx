import { MEAL_OPTIONS, type MealSlug } from "@/lib/nutrition/meals";

// Sélecteur de repas partagé — unique implémentation utilisée par tout point
// d'entrée qui journalise un aliment (NutritionSheet "Nouvel aliment",
// BarcodeScannerSheet, Favoris, Repas enregistrés, Scan repas, Vocal,
// Recette, Planning...), pour ne jamais dupliquer ce <select>.
interface MealSelectProps {
  value: MealSlug;
  onChange: (value: MealSlug) => void;
  /** Libellé au-dessus du select ; `null` pour un rendu compact sans libellé (lignes de liste). */
  label?: string | null;
  disabled?: boolean;
  /** Classes du <select> ; par défaut le style plein utilisé par "Nouvel aliment". */
  className?: string;
}

const DEFAULT_SELECT_CLASSNAME =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-40";

export function MealSelect({
  value,
  onChange,
  label = "Repas",
  disabled = false,
  className = DEFAULT_SELECT_CLASSNAME,
}: MealSelectProps) {
  const select = (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as MealSlug)}
      disabled={disabled}
      className={className}
    >
      {MEAL_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );

  if (!label) return select;

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {select}
    </div>
  );
}
