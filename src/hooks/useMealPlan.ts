import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
const supabase = supabaseTyped as any;
import {
  buildShoppingList,
  type PlannedIngredient,
  type ShoppingLine,
  type StockLevel,
} from "@/lib/nutrition/shoppingList";
import { getIsOnline } from "@/lib/offline/networkStatus";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";

/**
 * Planning de repas Nutrition V2 + génération de liste de courses depuis le
 * stock. Offline-first (cf. src/lib/offline/), même pattern que
 * `useRecipes.ts`/`useShoppingList.ts` : lecture/écriture de `meal_plans`
 * toujours locales (IndexedDB) d'abord, synchronisation vers Supabase en
 * arrière-plan via la sync queue.
 *
 * La génération + sauvegarde de la liste de courses (`useGenerateShoppingList`
 * / `useSaveShoppingList`) réutilise les repositories génériques déjà
 * migrés `recipe_ingredients` (via `useRecipes.ts`) et `shopping_list` (via
 * `useShoppingList.ts`), avec des instances locales dédiées à ce fichier —
 * même choix que `useShoppingList.ts` pour `recipe_ingredients`.
 */
const db = supabase;

export interface MealPlanEntry {
  id: string;
  user_id: string;
  date: string;
  meal: string;
  recipe_id: string | null;
  custom_name: string | null;
  servings: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** Jointure recette — disponible en ligne (select `recipes(...)`) et
   * reconstituée localement hors ligne depuis le repository `recipes` déjà
   * offline (voir `useRecipes.ts`). `null`/`undefined` si la recette n'a
   * pas (encore) été synchronisée localement. */
  recipes?: { id: string; name: string; servings: number } | null;
}

/** Ligne locale brute (sans jointure) — ce qui est réellement stocké/synchronisé. */
type MealPlanRow = Omit<MealPlanEntry, "recipes">;

const mealPlansRepo = createOfflineRepository<MealPlanRow>("meal_plans");

/** Instance locale minimale du repository `recipes` (déjà offline via
 * `useRecipes.ts`) — sert uniquement à reconstituer le nom/portions de la
 * recette liée quand on lit le planning hors connexion. */
interface RecipeMiniRow {
  id: string;
  name: string;
  servings: number;
}
const recipesRepo = createOfflineRepository<RecipeMiniRow>("recipes");

/** Instance locale du repository `recipe_ingredients` (déjà offline via
 * `useRecipes.ts`/`useShoppingList.ts`) pour générer la liste de courses. */
interface RecipeIngredientRow {
  id: string;
  recipe_id: string;
  item_id: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
}
const recipeIngredientsRepo = createOfflineRepository<RecipeIngredientRow>("recipe_ingredients");

/** Instance locale du repository `shopping_list` (déjà offline via `useShoppingList.ts`). */
interface ShoppingListRow {
  id: string;
  user_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  item_id: string | null;
  category: string | null;
  done: boolean;
  added_at: string;
}
const shoppingListRepo = createOfflineRepository<ShoppingListRow>("shopping_list");

const planKey = (start: string, end: string) => ["meal_plans", start, end] as const;

/** Planning sur une plage de dates (incluses), trié par date puis ordre. */
export function useMealPlan(startDate: string | null | undefined, endDate: string | null | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: [...planKey(startDate ?? "none", endDate ?? "none"), userId],
    enabled: !!startDate && !!endDate && !!userId,
    queryFn: async (): Promise<MealPlanEntry[]> => {
      if (!startDate || !endDate || !userId) return [];

      if (getIsOnline()) {
        try {
          const { data, error } = await db
            .from("meal_plans")
            .select("*, recipes(id, name, servings)")
            .eq("user_id", userId)
            .gte("date", startDate)
            .lte("date", endDate)
            .order("date", { ascending: true })
            .order("sort_order", { ascending: true });
          if (!error && data) {
            const rows = (data as Array<MealPlanRow & { recipes?: unknown }>).map(
              ({ recipes: _recipes, ...rest }) => rest,
            );
            await hydrateEntitiesFromServer("meal_plans", userId, rows);
          }
        } catch {
          // Hors ligne ou erreur réseau : on continue avec le store local.
        }
      }

      const local = await mealPlansRepo.list(userId);
      const inRange = local.filter((e) => e.date >= startDate && e.date <= endDate);
      const withRecipes: MealPlanEntry[] = await Promise.all(
        inRange.map(async (e): Promise<MealPlanEntry> => {
          if (!e.recipe_id) return e;
          const r = await recipesRepo.get(e.recipe_id);
          return { ...e, recipes: r ? { id: r.id, name: r.name, servings: r.servings } : null };
        }),
      );
      return withRecipes.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.sort_order - b.sort_order;
      });
    },
  });
}

export interface AddMealPlanInput {
  date: string;
  meal: string;
  recipe_id?: string | null;
  custom_name?: string | null;
  servings?: number;
  sort_order?: number;
}

export function useAddMealPlanEntry() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: AddMealPlanInput) => {
      if (!user) throw new Error("Non authentifié");
      await mealPlansRepo.create(user.id, {
        date: input.date,
        meal: input.meal,
        recipe_id: input.recipe_id ?? null,
        custom_name: input.custom_name ?? null,
        servings: input.servings ?? 1,
        sort_order: input.sort_order ?? 0,
      } as Omit<MealPlanRow, "id" | "user_id" | "created_at" | "updated_at">);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meal_plans"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteMealPlanEntry() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Non authentifié");
      await mealPlansRepo.remove(id, user.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meal_plans"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Calcule la liste de courses pour une plage de dates : ingrédients requis par
 * le planning (quantité × portions) moins le stock courant (items), via le
 * domaine pur buildShoppingList. Lecture seule (n'écrit rien) — lecture
 * locale d'abord (IndexedDB, `meal_plans`/`recipe_ingredients` déjà offline)
 * avec rafraîchissement serveur si en ligne.
 */
export function useGenerateShoppingList(startDate: string | null | undefined, endDate: string | null | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["shopping_list_preview", startDate ?? "none", endDate ?? "none", userId],
    enabled: !!startDate && !!endDate && !!userId,
    queryFn: async (): Promise<ShoppingLine[]> => {
      if (!startDate || !endDate || !userId) return [];

      if (getIsOnline()) {
        try {
          const { data, error } = await db
            .from("meal_plans")
            .select("*")
            .eq("user_id", userId)
            .gte("date", startDate)
            .lte("date", endDate)
            .not("recipe_id", "is", null);
          if (!error && data) {
            await hydrateEntitiesFromServer("meal_plans", userId, data as MealPlanRow[]);
          }
        } catch {
          // Hors ligne ou erreur réseau : on continue avec le store local.
        }
      }

      // 1. Repas planifiés liés à une recette sur la plage (local d'abord).
      const localPlans = await mealPlansRepo.list(userId);
      const plans = localPlans.filter(
        (p) => p.recipe_id != null && p.date >= startDate && p.date <= endDate,
      );
      if (plans.length === 0) return [];

      // 2. Ingrédients de toutes les recettes concernées (local d'abord).
      const recipeIds = new Set(plans.map((p) => p.recipe_id as string));
      if (getIsOnline()) {
        try {
          const { data, error } = await db
            .from("recipe_ingredients")
            .select("*")
            .in("recipe_id", Array.from(recipeIds));
          if (!error && data) {
            await hydrateEntitiesFromServer("recipe_ingredients", userId, data as RecipeIngredientRow[]);
          }
        } catch {
          // Hors ligne ou erreur réseau : on continue avec le store local.
        }
      }
      const localIngredients = await recipeIngredientsRepo.list(userId);
      const ingredients = localIngredients.filter((ing) => recipeIds.has(ing.recipe_id));

      // 3. Multiplie chaque ingrédient par les portions planifiées de sa recette.
      const planned: PlannedIngredient[] = [];
      for (const plan of plans) {
        const servings = plan.servings ?? 1;
        for (const ing of ingredients) {
          if (ing.recipe_id !== plan.recipe_id) continue;
          planned.push({
            itemId: ing.item_id,
            name: ing.name,
            unit: ing.unit,
            quantity: ing.quantity,
            servings,
          });
        }
      }

      // 4. Stock courant — module Maison supprimé, on calcule sans déduction.
      const stock: StockLevel[] = [];

      return buildShoppingList(planned, stock);
    },
  });
}

/** Écrit les lignes « à acheter » dans shopping_list (table déjà offline via `useShoppingList.ts`). */
export function useSaveShoppingList() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (lines: ShoppingLine[]) => {
      if (!user) throw new Error("Non authentifié");
      const rows = lines.filter((l) => l.toBuy > 0);
      for (const l of rows) {
        await shoppingListRepo.create(user.id, {
          name: l.name,
          quantity: l.toBuy,
          unit: l.unit,
          item_id: l.itemId,
          category: null,
          done: false,
          added_at: new Date().toISOString(),
        } as unknown as Omit<ShoppingListRow, "id" | "user_id" | "created_at" | "updated_at">);
      }
      return { inserted: rows.length };
    },
    onSuccess: ({ inserted }: { inserted: number }) => {
      qc.invalidateQueries({ queryKey: ["shopping_list"] });
      toast.success(`${inserted} article(s) ajouté(s) à la liste de courses`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
