import { useEffect, useRef, useState } from "react";
import { Apple, Loader2, Search, X } from "lucide-react";
import { useFoodSearch, getRecentFoods, pushRecentFood } from "@/hooks/useFoodSearch";
import type { FoodSuggestion } from "@/services/openFoodFacts";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelect: (f: FoodSuggestion) => void;
  placeholder?: string;
  required?: boolean;
}

export function FoodAutocomplete({ value, onChange, onSelect, placeholder, required }: Props) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<FoodSuggestion[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { results, loading, error } = useFoodSearch(value, open);

  useEffect(() => {
    setRecent(getRecentFoods());
  }, [open]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pick = (f: FoodSuggestion) => {
    pushRecentFood(f);
    onSelect(f);
    setOpen(false);
  };

  const showRecent = value.trim().length < 2 && recent.length > 0;
  const showResults = value.trim().length >= 2;

  return (
    <div ref={wrapRef} className="relative">
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Nom
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={value}
          required={required}
          placeholder={placeholder ?? "Rechercher un aliment…"}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-9 text-sm outline-none focus:border-primary"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Effacer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (showRecent || showResults) && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover shadow-elevated">
          {showRecent && (
            <>
              <p className="px-3 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Récents
              </p>
              {recent.map((f) => (
                <SuggestionRow key={`r-${f.id}`} food={f} onPick={pick} />
              ))}
            </>
          )}
          {showResults && (
            <>
              {loading && (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Recherche…
                </div>
              )}
              {!loading && error && (
                <p className="px-3 py-3 text-xs text-destructive">{error}</p>
              )}
              {!loading && !error && results.length === 0 && (
                <p className="px-3 py-3 text-xs text-muted-foreground">Aucun aliment trouvé</p>
              )}
              {!loading &&
                results.map((f) => <SuggestionRow key={f.id} food={f} onPick={pick} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SuggestionRow({
  food,
  onPick,
}: {
  food: FoodSuggestion;
  onPick: (f: FoodSuggestion) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(food)}
      className="flex w-full items-center gap-3 border-t border-border/50 px-3 py-2 text-left first:border-t-0 hover:bg-muted/50 active:bg-muted"
    >
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-border bg-white">
        {food.image ? (
          <img src={food.image} alt="" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Apple className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{food.name}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {food.brand ? `${food.brand} · ` : ""}
          {food.calories ?? "?"} kcal · P{food.proteins ?? "?"} G{food.carbs ?? "?"} L
          {food.fats ?? "?"} /100g
        </p>
      </div>
    </button>
  );
}
