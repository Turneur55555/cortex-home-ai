import { useMemo, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2, ShoppingCart, Trash2 } from "lucide-react";
import { Sheet, SubmitButton } from "@/components/shared/FormComponents";
import { useRecipes } from "@/hooks/useRecipes";
import {
  useMealPlan,
  useAddMealPlanEntry,
  useDeleteMealPlanEntry,
  useGenerateShoppingList,
  useSaveShoppingList,
} from "@/hooks/useMealPlan";

/**
 * Nutrition V2 — planning de repas sur la semaine + génération de la liste de
 * courses depuis le stock (besoins planning − stock).
 *
 * UI uniquement : logique dans lib/nutrition/* (pur) et hooks/useMealPlan,
 * useRecipes (Supabase). Tokens sémantiques, mobile first.
 */

const MEALS: { value: string; label: string }[] = [
  { value: "petit-dej", label: "Petit-déj" },
  { value: "dejeuner", label: "Déjeuner" },
  { value: "diner", label: "Dîner" },
  { value: "collation", label: "Collation" },
];

const iso = (d: Date) => format(d, "yyyy-MM-dd");

export function MealPlanSheet({ onClose }: { onClose: () => void }) {
  const [weekBase, setWeekBase] = useState(() => new Date());
  const weekStart = useMemo(() => startOfWeek(weekBase, { weekStartsOn: 1 }), [weekBase]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const startStr = iso(weekStart);
  const endStr = iso(addDays(weekStart, 6));

  const { data: recipes } = useRecipes();
  const { data: entries, isLoading } = useMealPlan(startStr, endStr);
  const addEntry = useAddMealPlanEntry();
  const deleteEntry = useDeleteMealPlanEntry();

  const [showShopping, setShowShopping] = useState(false);
  const shopping = useGenerateShoppingList(showShopping ? startStr : null, showShopping ? endStr : null);
  const saveShopping = useSaveShoppingList();

  const [form, setForm] = useState({
    date: iso(new Date()),
    meal: "dejeuner",
    recipeId: "",
    servings: "1",
  });

  const entriesByDay = useMemo(() => {
    const map = new Map<string, typeof entries>();
    for (const e of entries ?? []) {
      const arr = (map.get(e.date) ?? []) as NonNullable<typeof entries>;
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [entries]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.recipeId) return;
    await addEntry.mutateAsync({
      date: form.date,
      meal: form.meal,
      recipe_id: form.recipeId,
      servings: Number(form.servings) || 1,
    });
  };

  return (
    <Sheet title="Nutrition — Planning de la semaine" onClose={onClose}>
      {/* Sélecteur de semaine */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
        <button
          type="button"
          onClick={() => setWeekBase((d) => addDays(d, -7))}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-primary"
          aria-label="Semaine précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {format(weekStart, "d MMM", { locale: fr })} – {format(addDays(weekStart, 6), "d MMM", { locale: fr })}
        </span>
        <button
          type="button"
          onClick={() => setWeekBase((d) => addDays(d, 7))}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-primary"
          aria-label="Semaine suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Formulaire d'ajout */}
      <form onSubmit={submit} className="mb-5 space-y-3 rounded-2xl border border-border bg-surface p-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Jour
            </label>
            <select
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {days.map((d) => (
                <option key={iso(d)} value={iso(d)}>
                  {format(d, "EEEE d", { locale: fr })}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Repas
            </label>
            <select
              value={form.meal}
              onChange={(e) => setForm({ ...form, meal: e.target.value })}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {MEALS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recette
            </label>
            <select
              value={form.recipeId}
              onChange={(e) => setForm({ ...form, recipeId: e.target.value })}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              <option value="">— Choisir —</option>
              {(recipes ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-20">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Portions
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={form.servings}
              onChange={(e) => setForm({ ...form, servings: e.target.value })}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-center text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        <SubmitButton pending={addEntry.isPending}>Ajouter au planning</SubmitButton>
      </form>

      {/* Planning de la semaine */}
      {isLoading && (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="space-y-3">
        {days.map((d) => {
          const dayEntries = (entriesByDay.get(iso(d)) ?? []) as NonNullable<typeof entries>;
          return (
            <div key={iso(d)} className="rounded-2xl border border-border bg-card p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {format(d, "EEEE d MMM", { locale: fr })}
              </div>
              {dayEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground/70">—</p>
              ) : (
                <div className="space-y-1.5">
                  {dayEntries.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 text-sm">
                      <span className="w-16 shrink-0 text-[11px] font-medium text-primary">
                        {MEALS.find((m) => m.value === e.meal)?.label ?? e.meal}
                      </span>
                      <span className="flex-1 truncate">
                        {e.recipes?.name ?? e.custom_name ?? "Repas"}
                        {e.servings > 1 ? ` ×${e.servings}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteEntry.mutate(e.id)}
                        className="rounded-lg p-1 text-muted-foreground hover:text-destructive"
                        aria-label="Retirer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Liste de courses */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowShopping((s) => !s)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/5 py-2.5 text-sm font-semibold text-primary"
        >
          <ShoppingCart className="h-4 w-4" />
          {showShopping ? "Masquer la liste de courses" : "Générer la liste de courses"}
        </button>

        {showShopping && (
          <div className="mt-3 rounded-2xl border border-border bg-surface p-3">
            {shopping.isLoading && (
              <div className="flex justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!shopping.isLoading && (shopping.data ?? []).length === 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">
                Rien à acheter — le stock couvre le planning.
              </p>
            )}
            {!shopping.isLoading && (shopping.data ?? []).length > 0 && (
              <>
                <div className="space-y-1.5">
                  {(shopping.data ?? []).map((l) => (
                    <div
                      key={(l.itemId ?? l.name) + l.unit}
                      className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
                    >
                      <span>{l.name}</span>
                      <span className="text-xs font-semibold text-primary">
                        {l.toBuy}
                        {l.unit ? ` ${l.unit}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={saveShopping.isPending}
                  onClick={() => saveShopping.mutate(shopping.data ?? [])}
                  className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow transition-opacity disabled:opacity-60"
                >
                  {saveShopping.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Ajouter à ma liste de courses
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
