import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Check } from "lucide-react";
import { MEAL_OPTIONS, type MealSlug } from "@/lib/nutrition/meals";

/**
 * Bouton "Déplacer vers…" — popover listant les autres repas.
 * L'aliment courant est identifié par `currentMeal` (grisé dans la liste).
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setOpen((o) => !o);
        }}
        disabled={disabled}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-muted active:text-foreground disabled:opacity-60"
        aria-label="Déplacer vers un autre repas"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ArrowRightLeft className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-40 w-52 overflow-hidden rounded-xl border border-border bg-card shadow-elevated"
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
        </div>
      )}
    </div>
  );
}
