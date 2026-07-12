import { useState } from "react";
import { Loader2, Plus, Star, Trash2, X } from "lucide-react";
import { FullscreenSheet as Sheet, Field } from "@/components/shared/FormComponents";
import { FoodAutocomplete } from "@/components/FoodAutocomplete";
import { MEAL_LABELS, MEAL_SLUGS, scalePer100 } from "@/lib/nutrition/meals";
import { parseDecimal } from "@/lib/nutrition/portions";
import type { FoodSuggestion } from "@/services/foodSuggestion";
import {
  useNutritionFavorites,
  useAddFavorite,
  useDeleteFavorite,
  type NutritionFavorite,
} from "@/hooks/use-nutrition-favorites";
import { useAddNutrition } from "@/hooks/use-fitness";

const MEALS: Array<{ slug: string; label: string }> = MEAL_SLUGS.map((slug) => ({
  slug,
  label: MEAL_LABELS[slug],
}));

const scale = scalePer100;

export function FavoritesSheet({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  const { data: favorites, isLoading } = useNutritionFavorites();
  const addFav = useAddFavorite();
  const delFav = useDeleteFavorite();
  const addMeal = useAddNutrition();

  // Repas choisi pour chaque favori (au moment de l'ajout au journal)
  const [mealByFav, setMealByFav] = useState<Record<string, string>>({});

  // Formulaire "ajouter un favori"
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<FoodSuggestion | null>(null);
  const [grams, setGrams] = useState("100");
  const [newMeal, setNewMeal] = useState("collation");

  // parseDecimal accepte « 12,5 » ; quantité invalide => 0 (bouton désactivé).
  const g = parseDecimal(grams) ?? 0;

  const logFavorite = (fav: NutritionFavorite) => {
    const meal = mealByFav[fav.id] ?? fav.meal ?? "collation";
    // Favoris créés depuis cette évolution : grammes/unité connus (base_* = /100 g,
    // consumed_* = portion réelle) → éditable en mode grammes ensuite. Favoris
    // legacy (colonnes NULL) : comportement strictement inchangé (mode "portion").
    const hasGrams = fav.consumed_unit != null && fav.consumed_quantity != null;
    addMeal.mutate({
      date,
      name: fav.name,
      meal,
      calories: fav.calories,
      proteins: fav.proteins,
      carbs: fav.carbs,
      fats: fav.fats,
      base_calories: hasGrams ? fav.base_calories : fav.calories,
      base_proteins: hasGrams ? fav.base_proteins : fav.proteins,
      base_carbs: hasGrams ? fav.base_carbs : fav.carbs,
      base_fats: hasGrams ? fav.base_fats : fav.fats,
      serving_count: 1,
      percentage_consumed: 100,
      consumed_quantity: hasGrams ? fav.consumed_quantity : 1,
      consumed_unit: hasGrams ? fav.consumed_unit : "portion",
      consumed_grams_per_unit: hasGrams ? fav.consumed_grams_per_unit : null,
    });
  };

  const resetAdd = () => {
    setShowAdd(false);
    setPicked(null);
    setSearch("");
    setGrams("100");
    setNewMeal("collation");
  };

  const saveNewFavorite = () => {
    if (!picked || g <= 0) return;
    const kcal = scale(picked.calories, g);
    addFav.mutate(
      {
        name: picked.name,
        meal: newMeal,
        calories: kcal == null ? null : Math.round(kcal),
        proteins: scale(picked.proteins, g),
        carbs: scale(picked.carbs, g),
        fats: scale(picked.fats, g),
        // picked.* est déjà /100 g (FoodSuggestion) — aucune conversion nécessaire.
        base_calories: picked.calories,
        base_proteins: picked.proteins,
        base_carbs: picked.carbs,
        base_fats: picked.fats,
        consumed_quantity: g,
        consumed_unit: "g",
        consumed_grams_per_unit: 1,
      },
      { onSuccess: resetAdd },
    );
  };

  return (
    <Sheet title="Favoris" onClose={onClose}>
      <div className="space-y-3">
        {!showAdd ? (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background"
          >
            <Plus className="h-4 w-4" />
            Ajouter un favori
          </button>
        ) : (
          <div className="space-y-3 rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nouveau favori
              </p>
              <button
                type="button"
                onClick={resetAdd}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
                aria-label="Annuler"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <FoodAutocomplete
              value={search}
              onChange={setSearch}
              onSelect={(f) => {
                setPicked(f);
                setSearch(f.name);
              }}
              placeholder="Rechercher un aliment…"
            />

            {picked && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Quantité (g)" value={grams} onChange={setGrams} type="text" />
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Repas
                    </label>
                    <select
                      value={newMeal}
                      onChange={(e) => setNewMeal(e.target.value)}
                      className="w-full rounded-xl border border-border bg-transparent px-3 py-2.5 text-sm outline-none focus:border-foreground/30"
                    >
                      {MEALS.map((m) => (
                        <option key={m.slug} value={m.slug}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {Math.round(scale(picked.calories, g) ?? 0)} kcal · P
                  {scale(picked.proteins, g) ?? 0} G{scale(picked.carbs, g) ?? 0} L
                  {scale(picked.fats, g) ?? 0}
                </p>
                <button
                  type="button"
                  onClick={saveNewFavorite}
                  disabled={addFav.isPending || g <= 0}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background disabled:opacity-60"
                >
                  {addFav.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enregistrer le favori
                </button>
              </>
            )}
          </div>
        )}

        {isLoading && (
          <div className="flex h-20 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && (!favorites || favorites.length === 0) && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <Star className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Aucun favori</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ajoute tes aliments fréquents pour les logger en 1 tap.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {(favorites ?? []).map((fav) => (
            <li
              key={fav.id}
              className="rounded-xl border border-border bg-card p-3"
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{fav.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fav.calories ?? 0} kcal · P{fav.proteins ?? 0} G{fav.carbs ?? 0} L
                    {fav.fats ?? 0}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => delFav.mutate(fav.id)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground active:text-destructive"
                  aria-label="Supprimer le favori"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={mealByFav[fav.id] ?? fav.meal ?? "collation"}
                  onChange={(e) =>
                    setMealByFav((m) => ({ ...m, [fav.id]: e.target.value }))
                  }
                  className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-foreground/30"
                >
                  {MEALS.map((m) => (
                    <option key={m.slug} value={m.slug}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => logFavorite(fav)}
                  disabled={addMeal.isPending}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background disabled:opacity-60"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
