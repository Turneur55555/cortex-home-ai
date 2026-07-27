import { useMemo, useState } from "react";
import { Apple, Loader2, Plus, Search, Star, Trash2, X } from "lucide-react";
import { FullscreenSheet } from "@/components/shared/FormComponents";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeightSelector } from "@/components/fitness/WeightSelector";
import { MealSelect } from "@/components/fitness/MealSelect";
import { NutritionSheet } from "@/components/fitness/NutritionSheet";
import { SavedMealsList } from "@/components/fitness/SavedMealsList";
import { useFoodSearch, getRecentFoods } from "@/hooks/useFoodSearch";
import { useUsedFoods } from "@/hooks/useUsedFoods";
import { useCustomFoods } from "@/hooks/useCustomFoods";
import {
  useNutritionFavorites,
  useAddFavorite,
  useDeleteFavorite,
  type NutritionFavorite,
} from "@/hooks/use-nutrition-favorites";
import { useSavedMeals, type SavedMeal } from "@/hooks/use-saved-meals";
import { useAddNutrition } from "@/hooks/use-fitness";
import {
  buildGramPresets,
  calculateNutritionFromGrams,
  formatDecimal,
  loadSavedWeight,
  per100FromFood,
  saveLastWeight,
} from "@/lib/nutrition/weight";
import { detectMealFromHour, isMealSlug, type MealSlug } from "@/lib/nutrition/meals";
import type { FoodSuggestion } from "@/services/foodSuggestion";

type LibraryTab = "all" | "mine" | "favorites" | "meals";

interface FoodLibrarySheetProps {
  date: string;
  onClose: () => void;
}

/**
 * Bibliothèque d'aliments — point d'entrée principal du parcours "Ajouter un
 * aliment" : contenu affiché immédiatement (aucune recherche obligatoire),
 * la barre de recherche ne fait que filtrer l'onglet actif. Réutilise le
 * moteur poids/macros (`lib/nutrition/weight`) et les hooks existants
 * (favoris, repas enregistrés, recherche catalogue) — aucune logique
 * métier dupliquée.
 */
export function FoodLibrarySheet({ date, onClose }: FoodLibrarySheetProps) {
  const [tab, setTab] = useState<LibraryTab>("all");
  const [query, setQuery] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  const { data: usedFoods, isLoading: usedLoading } = useUsedFoods();
  const { data: customFoods, isLoading: customLoading } = useCustomFoods();
  const { data: favorites, isLoading: favLoading } = useNutritionFavorites();
  const { data: savedMeals, isLoading: mealsLoading } = useSavedMeals();

  const q = query.trim().toLowerCase();
  const { results: searchResults, loading: searchLoading } = useFoodSearch(
    query,
    tab === "all" && q.length >= 2,
  );

  // "Tous" : par défaut, les aliments déjà utilisés (triés récence puis
  // fréquence par useUsedFoods) — immédiatement consultables, sans saisie.
  // Dès 2 caractères, la recherche catalogue complet (useFoodSearch : local +
  // USDA + aliments personnalisés déjà présents dans `foods`) prend le relais
  // et remplace la liste ; elle redevient la liste des aliments utilisés dès
  // que la recherche est vidée.
  const allFoods = useMemo<FoodSuggestion[]>(() => {
    if (q.length >= 2) return searchResults;
    return usedFoods ?? [];
  }, [q, usedFoods, searchResults]);

  // "Mes aliments" : créés par l'utilisateur (foods.user_id) + récents locaux.
  const mineFoods = useMemo<FoodSuggestion[]>(() => {
    const seen = new Set<string>();
    const list: FoodSuggestion[] = [];
    for (const f of [...(customFoods ?? []), ...getRecentFoods()]) {
      const key = f.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(f);
    }
    return q.length >= 2 ? list.filter((f) => f.name.toLowerCase().includes(q)) : list;
  }, [customFoods, q]);

  const favList = useMemo<NutritionFavorite[]>(() => {
    const list = favorites ?? [];
    return q.length >= 2 ? list.filter((f) => f.name.toLowerCase().includes(q)) : list;
  }, [favorites, q]);

  const mealsList = useMemo<SavedMeal[]>(() => {
    const list = savedMeals ?? [];
    return q.length >= 2 ? list.filter((m) => m.name.toLowerCase().includes(q)) : list;
  }, [savedMeals, q]);

  return (
    <FullscreenSheet title="Mes aliments" subtitle="Bibliothèque d'aliments" onClose={onClose}>
      <div className="space-y-4 pb-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer les aliments…"
            aria-label="Filtrer les aliments"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-9 text-sm outline-none focus:border-primary"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
              aria-label="Effacer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-sm font-semibold text-muted-foreground hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Créer un aliment manuellement
        </button>

        <Tabs value={tab} onValueChange={(v) => setTab(v as LibraryTab)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">Tous</TabsTrigger>
            <TabsTrigger value="mine">Mes aliments</TabsTrigger>
            <TabsTrigger value="favorites">Favoris</TabsTrigger>
            <TabsTrigger value="meals">Repas</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <FoodItemList
              date={date}
              foods={allFoods}
              loading={q.length >= 2 ? searchLoading : usedLoading}
              emptyLabel={
                q.length >= 2
                  ? "Aucun aliment trouvé"
                  : "Aucun aliment utilisé pour l'instant — recherchez-en un pour commencer."
              }
            />
          </TabsContent>

          <TabsContent value="mine">
            <FoodItemList
              date={date}
              foods={mineFoods}
              loading={customLoading}
              emptyLabel="Aucun aliment personnel pour l'instant"
            />
          </TabsContent>

          <TabsContent value="favorites">
            <FavoritesList date={date} favorites={favList} loading={favLoading} />
          </TabsContent>

          <TabsContent value="meals">
            <SavedMealsList date={date} meals={mealsList} loading={mealsLoading} />
          </TabsContent>
        </Tabs>
      </div>

      {manualOpen && (
        <NutritionSheet date={date} prefill={null} onClose={() => setManualOpen(false)} />
      )}
    </FullscreenSheet>
  );
}

// ─── "Tous" / "Mes aliments" : aliments /100g avec sélecteur de poids ──────

function FoodItemList({
  date,
  foods,
  loading,
  emptyLabel,
}: {
  date: string;
  foods: FoodSuggestion[];
  loading: boolean;
  emptyLabel: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [weightText, setWeightText] = useState("");
  const [meal, setMeal] = useState<MealSlug>(detectMealFromHour());
  const addFood = useAddNutrition();
  const addFav = useAddFavorite();

  const expandedFood = foods.find((f) => f.id === expandedId) ?? null;

  const toggle = (food: FoodSuggestion) => {
    if (expandedId === food.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(food.id);
    const saved = loadSavedWeight(food);
    const presets = buildGramPresets(food);
    setWeightText(formatDecimal(saved ?? presets[1]?.grams ?? 100));
    setMeal(detectMealFromHour());
  };

  const calc = expandedFood
    ? calculateNutritionFromGrams(weightText, per100FromFood(expandedFood))
    : null;
  const grams = calc && !calc.error ? calc.totalGrams : null;

  const handleAdd = () => {
    if (!expandedFood || grams == null || !calc) return;
    saveLastWeight(expandedFood, grams);
    addFood.mutate(
      {
        date,
        name: expandedFood.name,
        meal,
        calories: calc.calories,
        proteins: calc.proteins,
        carbs: calc.carbs,
        fats: calc.fats,
        base_calories: expandedFood.calories,
        base_proteins: expandedFood.proteins,
        base_carbs: expandedFood.carbs,
        base_fats: expandedFood.fats,
        serving_count: 1,
        percentage_consumed: 100,
        consumed_quantity: grams,
        consumed_unit: "g",
        consumed_grams_per_unit: null,
      },
      { onSuccess: () => setExpandedId(null) },
    );
  };

  const handleFavorite = () => {
    if (!expandedFood || grams == null || !calc) return;
    addFav.mutate({
      name: expandedFood.name,
      meal,
      calories: calc.calories == null ? null : Math.round(calc.calories),
      proteins: calc.proteins,
      carbs: calc.carbs,
      fats: calc.fats,
    });
  };

  if (loading && foods.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (foods.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center">
        <Apple className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {foods.map((food) => {
        const expanded = expandedId === food.id;
        return (
          <li key={food.id} className="rounded-xl border border-border bg-card p-3">
            <button
              type="button"
              onClick={() => toggle(food)}
              className="flex w-full items-center gap-3 text-left"
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
                  {food.calories ?? "?"} kcal · L{food.fats ?? "?"} G{food.carbs ?? "?"} P
                  {food.proteins ?? "?"} /100g
                </p>
              </div>
            </button>

            {expanded && (
              <div className="mt-3 space-y-3 border-t border-border/50 pt-3">
                <WeightSelector food={food} value={weightText} onChange={setWeightText} />
                <MealSelect value={meal} onChange={setMeal} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleFavorite}
                    disabled={addFav.isPending || grams == null}
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-xs font-semibold text-foreground disabled:opacity-60"
                  >
                    <Star className="h-3.5 w-3.5" />
                    Favoris
                  </button>
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={addFood.isPending || grams == null}
                    className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-foreground text-sm font-semibold text-background disabled:opacity-60"
                  >
                    {addFood.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Ajouter au journal
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── "Mes favoris" ──────────────────────────────────────────────────────────

function FavoritesList({
  date,
  favorites,
  loading,
}: {
  date: string;
  favorites: NutritionFavorite[];
  loading: boolean;
}) {
  const addMeal = useAddNutrition();
  const delFav = useDeleteFavorite();
  const [mealByFav, setMealByFav] = useState<Record<string, MealSlug>>({});

  const mealFor = (fav: NutritionFavorite): MealSlug =>
    mealByFav[fav.id] ?? (isMealSlug(fav.meal ?? "") ? (fav.meal as MealSlug) : "collation");

  const logFavorite = (fav: NutritionFavorite) => {
    addMeal.mutate({
      date,
      name: fav.name,
      meal: mealFor(fav),
      calories: fav.calories,
      proteins: fav.proteins,
      carbs: fav.carbs,
      fats: fav.fats,
      // nutrition_favorites ne stocke que des macros déjà scalés (aucun poids
      // de référence) : base_* reste NULL, comme dans FavoritesSheet.
      base_calories: null,
      base_proteins: null,
      base_carbs: null,
      base_fats: null,
      serving_count: 1,
      percentage_consumed: 100,
    });
  };

  if (loading && favorites.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (favorites.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-6 text-center">
        <Star className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Aucun favori</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ajoute un aliment en favori depuis l'onglet « Tous ».
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {favorites.map((fav) => (
        <li key={fav.id} className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{fav.name}</p>
              <p className="text-xs text-muted-foreground">
                {fav.calories ?? 0} kcal · L{fav.fats ?? 0} G{fav.carbs ?? 0} P{fav.proteins ?? 0}
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
            <MealSelect
              value={mealFor(fav)}
              onChange={(meal) => setMealByFav((m) => ({ ...m, [fav.id]: meal }))}
              label={null}
              className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
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
  );
}

// ─── "Repas" ────────────────────────────────────────────────────────────────
// Rendu par le composant partagé SavedMealsList (@/components/fitness/SavedMealsList),
// seule bibliothèque de repas enregistrés de l'app — voir l'appel dans le JSX ci-dessus.
