import { useState } from "react";
import { ArrowRightLeft, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MEAL_OPTIONS, type MealSlug } from "@/lib/nutrition/meals";

/**
 * Bouton "Déplacer vers…" — popover listant les autres repas.
 * L'aliment courant est identifié par `currentMeal` (grisé dans la liste).
 *
 * Rendu via Radix Popover (Portal dans document.body) — la ligne parente
 * (SwipeableNutritionItem) a `overflow-hidden` pour l'animation de swipe,
 * ce qui clippait entièrement l'ancienne popover maison en `position: absolute`.
 * Ne JAMAIS revenir à un positionnement absolute non-porté ici — voir
 * docs/architecture/nutrition-meal-slugs.md.
 */
export function MoveMealMenu({
  currentMeal,
  onMove,
  disabled,
}: {
  currentMeal: string | null;
  onMove: (target: MealSlug) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          disabled={disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-muted active:text-foreground disabled:opacity-60"
          aria-label="Déplacer vers un autre repas"
        >
          <ArrowRightLeft className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        role="menu"
        align="end"
        sideOffset={4}
        className="w-52 overflow-hidden rounded-xl border border-border bg-card p-0 shadow-elevated"
      >
        <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Déplacer vers
        </p>
        {MEAL_OPTIONS.map((opt) => {
          const isCurrent = opt.value === currentMeal;
          return (
            <button
              key={opt.value}
              type="button"
              role="menuitem"
              disabled={isCurrent}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                if (!isCurrent) onMove(opt.value);
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              <span className="flex-1">{opt.label}</span>
              {isCurrent && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
