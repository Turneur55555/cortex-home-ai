import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
const supabase = supabaseTyped as any;
import {
  buildShoppingList,
  type PlannedIngredient,
  type ShoppingLine,
} from "@/lib/nutrition/shoppingList";
import { resolveIngredientCategory } from "@/lib/nutrition/ingredientCategory";
import type { IngredientCategory } from "@/lib/nutrition/recipeImport/types";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";
import { getIsOnline } from "@/lib/offline/networkStatus";

/**
 * Liste de courses depuis des recettes sélectionnées (module "Recettes" —
 * distinct du planning hebdo `useMealPlan.ts`, mais réutilise le même
 * domaine pur `buildShoppingList`/table `shopping_list`).
 *
 * Les quantités de `recipe_ingredients` représentent déjà la recette telle
 * qu'écrite (pas "par portion") — `servings: 1` ici, contrairement au
 * planning qui multiplie par les portions planifiées.
 *
 * Offline-first (cf. src/lib/offline/), même pattern que
 * `useNutritionData.ts`/`useRecipes.ts` : lecture/écriture de `shopping_list`
 * toujours locales (IndexedDB) d'abord, synchronisation vers Supabase en
 * arrière-plan via la sync queue.
 */
const db = supabase;

const shoppingListKey = ["shopping_list"] as const;

export interface ShoppingListItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  done: boolean;
  added_at: string;
}

const shoppingListRepo = createOfflineRepository<ShoppingListItem>("shopping_list");

/** Ligne locale d'ingrédient de recette (même table que `useRecipes.ts`, instance dédiée à ce fichier). */
interface RecipeIngredientRow {
  id: string;
  recipe_id: string;
  user_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
}

const recipeIngredientsRepo = createOfflineRepository<RecipeIngredientRow>("recipe_ingredients");

/**
 * Fusionne les ingrédients de plusieurs recettes (dédoublonnage + somme des
 * quantités), groupés par rayon. Lecture locale d'abord (IndexedDB, table
 * `recipe_ingredients` déjà offline via `useRecipes.ts`) avec rafraîchissement
 * serveur si en ligne — cohérent avec le fait que les recettes elles-mêmes
 * peuvent être consultées/éditées hors connexion.
 */
export function useRecipesShoppingPreview(recipeIds: string[]) {
  return useQuery({
    queryKey: ["shopping_list_recipes_preview", [...recipeIds].sort().join(",")],
    enabled: recipeIds.length > 0,
    queryFn: async (): Promise<ShoppingLine[]> => {
      if (recipeIds.length === 0) return [];
      const {
        data: { user },
      } = await supabaseTyped.auth.getUser();
      if (!user) return [];

      if (getIsOnline()) {
        try {
          const { data, error } = await db
            .from("recipe_ingredients")
            .select("*")
            .in("recipe_id", recipeIds);
          if (!error && data) {
            await hydrateEntitiesFromServer(
              "recipe_ingredients",
              user.id,
              data as RecipeIngredientRow[],
            );
          }
        } catch {
          // Hors ligne ou erreur réseau : on continue avec le store local.
        }
      }

      const local = await recipeIngredientsRepo.list(user.id);
      const idSet = new Set(recipeIds);
      const rows = local.filter((ing) => idSet.has(ing.recipe_id));
      const planned: PlannedIngredient[] = rows.map((ing) => ({
        name: ing.name,
        unit: ing.unit,
        quantity: ing.quantity,
        servings: 1,
        category: resolveIngredientCategory(ing.name, ing.category as IngredientCategory | null),
      }));
      return buildShoppingList(planned, [], { includeSatisfied: true });
    },
  });
}

/** Enregistre la liste fusionnée dans `shopping_list` (table existante, catégorie incluse). */
export function useSaveRecipesShoppingList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lines: ShoppingLine[]) => {
      const {
        data: { user },
      } = await supabaseTyped.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const rows = lines.filter((l) => l.needed > 0);
      for (const l of rows) {
        await shoppingListRepo.create(user.id, {
          name: l.name,
          quantity: l.needed,
          unit: l.unit,
          category: l.category ?? null,
          done: false,
          added_at: new Date().toISOString(),
        } as unknown as Omit<ShoppingListItem, "id" | "user_id" | "created_at" | "updated_at">);
      }
      return { inserted: rows.length };
    },
    onSuccess: ({ inserted }: { inserted: number }) => {
      qc.invalidateQueries({ queryKey: shoppingListKey });
      toast.success(`${inserted} article(s) ajouté(s) à la liste de courses`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Liste de courses persistée de l'utilisateur, groupable par catégorie côté UI. */
export function useShoppingList() {
  return useQuery({
    queryKey: shoppingListKey,
    queryFn: async (): Promise<ShoppingListItem[]> => {
      const {
        data: { user },
      } = await supabaseTyped.auth.getUser();
      if (!user) return [];

      if (getIsOnline()) {
        try {
          const { data, error } = await db
            .from("shopping_list")
            .select("*")
            .order("done", { ascending: true })
            .order("added_at", { ascending: false });
          if (!error && data) {
            await hydrateEntitiesFromServer("shopping_list", user.id, data as ShoppingListItem[]);
          }
        } catch {
          // Hors ligne ou erreur réseau : on continue avec le store local.
        }
      }

      const local = await shoppingListRepo.list(user.id);
      return [...local].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return b.added_at.localeCompare(a.added_at);
      });
    },
  });
}

export function useToggleShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const {
        data: { user },
      } = await supabaseTyped.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      await shoppingListRepo.update(id, user.id, { done });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: shoppingListKey }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteShoppingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const {
        data: { user },
      } = await supabaseTyped.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      await shoppingListRepo.remove(id, user.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: shoppingListKey }),
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Retire toutes les lignes cochées (achetées) d'un coup. */
export function useClearBoughtItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabaseTyped.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const local = await shoppingListRepo.list(user.id);
      const bought = local.filter((r) => r.done);
      for (const r of bought) {
        await shoppingListRepo.remove(r.id, user.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shoppingListKey });
      toast.success("Articles achetés retirés");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
