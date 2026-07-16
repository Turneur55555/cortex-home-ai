import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronUp, Loader2, Plus, Trash2, Utensils, X } from "lucide-react";
import { FullscreenSheet as Sheet, Field, SubmitButton } from "@/components/shared/FormComponents";
import { FoodAutocomplete } from "@/components/FoodAutocomplete";
import { MEAL_LABELS, scalePer100 } from "@/lib/nutrition/meals";
import type { FoodSuggestion } from "@/services/foodSuggestion";
import {
  useSavedMeals,
  useCreateSavedMeal,
  useLogSavedMeal,
  useDeleteSavedMeal,
  type SavedMeal,
} from "@/hooks/use-saved-meals";

type BuilderItem = {
  key: string;
  food_id: string | null;
  name: string;
  grams: number;
  per100: {
    calories: number | null;
    proteins: number | null;
    carbs: number | null;
    fats: number | null;
  };
};

const scale = scalePer100;

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export function SavedMealsSheet({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  const { data: meals, isLoading } = useSavedMeals();
  const create = useCreateSavedMeal();
  const logMeal = useLogSavedMeal();
  const del = useDeleteSavedMeal();

  const [mode, setMode] = useState<"list" | "build">("list");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Moment de journée choisi par repas, au moment de l'ajout au journal.
  const [mealByMeal, setMealByMeal] = useState<Record<string, string>>({});

  // État du builder
  const [name, setName] = useState("");
  const [meal, setMeal] = useState("dejeuner");
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [search, setSearch] = useState("");

  const addFood = (f: FoodSuggestion) => {
    setItems((prev) => [
      ...prev,
      {
        key: `${f.id}-${Date.now()}`,
        food_id: typeof f.id === "string" && isUuid(f.id) ? f.id : null,
        name: f.name,
        grams: 100,
        per100: {
          calories: f.calories,
          proteins: f.proteins,
          carbs: f.carbs,
          fats: f.fats,
        },
      },
    ]);
    setSearch("");
  };

  const setGrams = (key: string, grams: number) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, grams } : it)));
  const removeItem = (key: string) =>
    setItems((prev) => prev.filter((it) => it.key !== key));

  const totals = useMemo(
    () =>
      items.reduce(
        (acc, it) => ({
          calories: acc.calories + (scale(it.per100.calories, it.grams) ?? 0),
          proteins: acc.proteins + (scale(it.per100.proteins, it.grams) ?? 0),
          carbs: acc.carbs + (scale(it.per100.carbs, it.grams) ?? 0),
          fats: acc.fats + (scale(it.per100.fats, it.grams) ?? 0),
        }),
        { calories: 0, proteins: 0, carbs: 0, fats: 0 },
      ),
    [items],
  );

  const resetBuilder = () => {
    setName("");
    setMeal("dejeuner");
    setItems([]);
    setSearch("");
  };

  const saveMeal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || items.length === 0) return;
    create.mutate(
      {
        name: name.trim(),
        meal,
        items: items.map((it) => {
          const kcal = scale(it.per100.calories, it.grams);
          const kcalInt = kcal == null ? null : Math.round(kcal);
          return {
            food_id: it.food_id,
            name: it.name,
            calories: kcalInt,
            proteins: scale(it.per100.proteins, it.grams),
            carbs: scale(it.per100.carbs, it.grams),
            fats: scale(it.per100.fats, it.grams),
            // Convention : base_* = valeurs pour 100 g (bug B1 corrigé).
            base_calories: it.per100.calories,
            base_proteins: it.per100.proteins,
            base_carbs: it.per100.carbs,
            base_fats: it.per100.fats,
            serving_count: 1,
            consumed_quantity: it.grams,
            consumed_unit: "g",
            consumed_grams_per_unit: 1,
          };
        }),
      },
      {
        onSuccess: () => {
          resetBuilder();
          setMode("list");
        },
      },
    );
  };

  const mealTotal = (m: SavedMeal) =>
    m.saved_meal_items.reduce((s, i) => s + (i.calories ?? 0), 0);

  return (
    <Sheet
      title={mode === "build" ? "Composer un repas" : "Mes repas enregistrés"}
      onClose={onClose}
    >
      {mode === "list" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setMode("build")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow"
          >
            <Plus className="h-4 w-4" />
            Composer un repas
          </button>

          {isLoading && (
            <div className="flex h-20 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && (!meals || meals.length === 0) && (
            <div className="rounded-2xl border border-border bg-surface p-6 text-center">
              <Utensils className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Aucun repas enregistré</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Compose un repas une fois, ajoute-le en 1 tap les jours suivants.
              </p>
            </div>
          )}

          <ul className="space-y-2">
            {(meals ?? []).map((m) => (
              <li
                key={m.id}
                className="rounded-xl border border-border bg-card p-3 shadow-card"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedId((id) => (id === m.id ? null : m.id))}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-semibold">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.meal ? `${(MEAL_LABELS as Record<string, string>)[m.meal] ?? m.meal} · ` : ""}
                      {m.saved_meal_items.length} aliment
                      {m.saved_meal_items.length > 1 ? "s" : ""} ·{" "}
                      {Math.round(mealTotal(m))} kcal
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedId((id) => (id === m.id ? null : m.id))}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
                    aria-label="Voir les ingrédients"
                  >
                    {expandedId === m.id ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => del.mutate(m.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Supprimer le repas"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {expandedId === m.id && m.saved_meal_items.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-border pt-2">
                    {m.saved_meal_items
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((item) => (
                        <li key={item.id} className="flex items-center justify-between text-xs">
                          <span className="truncate text-foreground/80">{item.name}</span>
                          <span className="ml-2 shrink-0 text-muted-foreground">
                            {item.calories ?? 0} kcal
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={mealByMeal[m.id] ?? m.meal ?? "dejeuner"}
                    onChange={(e) =>
                      setMealByMeal((prev) => ({ ...prev, [m.id]: e.target.value }))
                    }
                    className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-primary"
                  >
                    {Object.entries(MEAL_LABELS).map(([slug, label]) => (
                      <option key={slug} value={slug}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      logMeal.mutate({
                        id: m.id,
                        date,
                        meal: mealByMeal[m.id] ?? m.meal ?? "dejeuner",
                      })
                    }
                    disabled={logMeal.isPending}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-primary px-3 text-xs font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === "build" && (
        <form onSubmit={saveMeal} className="space-y-4">
          <button
            type="button"
            onClick={() => setMode("list")}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Retour à la liste
          </button>

          <Field
            label="Nom du repas"
            value={name}
            onChange={setName}
            placeholder="Ex : Mon petit-déj"
            required
          />

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Moment par défaut
            </label>
            <select
              value={meal}
              onChange={(e) => setMeal(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {Object.entries(MEAL_LABELS).map(([slug, label]) => (
                <option key={slug} value={slug}>{label}</option>
              ))}
            </select>
          </div>

          <FoodAutocomplete
            value={search}
            onChange={setSearch}
            onSelect={addFood}
            placeholder="Ajouter un aliment…"
          />

          {items.length > 0 && (
            <ul className="space-y-2">
              {items.map((it) => (
                <li
                  key={it.key}
                  className="rounded-xl border border-border bg-surface p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {it.name}
                    </p>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={it.grams}
                      min={0}
                      onChange={(e) => setGrams(it.key, Number(e.target.value) || 0)}
                      className="w-16 rounded-lg border border-border bg-card px-2 py-1 text-right text-sm outline-none focus:border-primary"
                    />
                    <span className="text-xs text-muted-foreground">g</span>
                    <button
                      type="button"
                      onClick={() => removeItem(it.key)}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground active:bg-destructive/10 active:text-destructive"
                      aria-label="Retirer l'aliment"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {Math.round(scale(it.per100.calories, it.grams) ?? 0)} kcal · P
                    {scale(it.per100.proteins, it.grams) ?? 0} G
                    {scale(it.per100.carbs, it.grams) ?? 0} L
                    {scale(it.per100.fats, it.grams) ?? 0}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="rounded-xl bg-surface px-3 py-2 text-center text-xs">
            <span className="font-bold text-primary">
              {Math.round(totals.calories)}
            </span>{" "}
            kcal · P{Math.round(totals.proteins)} G{Math.round(totals.carbs)} L
            {Math.round(totals.fats)}
          </div>

          <SubmitButton pending={create.isPending}>
            Enregistrer le repas
          </SubmitButton>
        </form>
      )}
    </Sheet>
  );
}
