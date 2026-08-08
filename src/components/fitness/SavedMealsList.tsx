import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { MealSelect } from "@/components/fitness/MealSelect";
import { MealEditor } from "@/components/fitness/MealEditor";
import {
  useLogSavedMeal,
  useDeleteSavedMeal,
  useDuplicateSavedMeal,
  type SavedMeal,
} from "@/hooks/use-saved-meals";
import { isMealSlug, type MealSlug } from "@/lib/nutrition/meals";

/**
 * Liste "Repas enregistrés" — unique implémentation, seule source de vérité
 * pour la bibliothèque des repas (Nutrition → Mes aliments → Repas). Porte
 * aussi la création ("Composer un repas") et l'édition d'un repas existant
 * via le même composant `MealEditor` (mode create/edit).
 */
export function SavedMealsList({
  date,
  meals,
  loading,
}: {
  date: string;
  meals: SavedMeal[];
  loading: boolean;
}) {
  const logMeal = useLogSavedMeal();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mealByMeal, setMealByMeal] = useState<Record<string, MealSlug>>({});
  const [editorMeal, setEditorMeal] = useState<SavedMeal | null | "new">(null);

  const mealFor = (m: SavedMeal): MealSlug =>
    mealByMeal[m.id] ?? (isMealSlug(m.meal ?? "") ? (m.meal as MealSlug) : "dejeuner");

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setEditorMeal("new")}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow"
      >
        <Plus className="h-4 w-4" />
        Composer un repas
      </button>

      {loading && meals.length === 0 && (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && meals.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center">
          <Bookmark className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">Aucun repas enregistré</p>
        </div>
      )}

      {meals.length > 0 && (
        <ul className="space-y-2">
          {meals.map((meal) => {
            const items = meal.saved_meal_items ?? [];
            const kcal = items.reduce(
              (sum, i) => sum + (i.calories ?? 0) * (i.serving_count ?? 1),
              0,
            );
            const expanded = expandedId === meal.id;
            return (
              <li key={meal.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : meal.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                      <Bookmark className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{meal.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {Math.round(kcal)} kcal · {items.length} aliment
                        {items.length > 1 ? "s" : ""}
                      </p>
                    </div>
                    {expanded ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                  <SavedMealActionMenu meal={meal} onEdit={() => setEditorMeal(meal)} />
                </div>

                {expanded && items.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-border/50 pt-2">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between text-xs text-muted-foreground"
                      >
                        <span className="truncate">{item.name}</span>
                        <span className="shrink-0">{item.calories ?? 0} kcal</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-2 flex items-center gap-2">
                  <MealSelect
                    value={mealFor(meal)}
                    onChange={(m) => setMealByMeal((prev) => ({ ...prev, [meal.id]: m }))}
                    label={null}
                    className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => logMeal.mutate({ id: meal.id, date, meal: mealFor(meal) })}
                    disabled={logMeal.isPending}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-60"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editorMeal !== null && (
        <MealEditor
          mode={editorMeal === "new" ? "create" : "edit"}
          meal={editorMeal === "new" ? null : editorMeal}
          onClose={() => setEditorMeal(null)}
        />
      )}
    </div>
  );
}

function SavedMealActionMenu({ meal, onEdit }: { meal: SavedMeal; onEdit: () => void }) {
  const delMeal = useDeleteSavedMeal();
  const dupMeal = useDuplicateSavedMeal();
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
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`Actions du repas ${meal.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-30 w-48 overflow-hidden rounded-xl border border-border bg-card shadow-elevated"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">Modifier</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              dupMeal.mutate(meal.id);
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Copy className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">Dupliquer</span>
          </button>
          <div className="h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              delMeal.mutate(meal.id);
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            <span className="flex-1">Supprimer</span>
          </button>
        </div>
      )}
    </div>
  );
}
