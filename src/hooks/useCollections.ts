import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
const supabase = supabaseTyped as any;

/**
 * Collections de recettes (module "Recettes" → gestionnaire complet).
 * Tables : recipe_collections, recipe_collection_recipes (many-to-many, une
 * recette peut appartenir à plusieurs collections).
 *
 * "Favoris" n'est JAMAIS une ligne ici — c'est une collection VIRTUELLE
 * dérivée de `recipes.is_favorite` (déjà câblé, voir useToggleRecipeFavorite
 * dans useRecipes.ts). La dupliquer en vraie collection créerait deux
 * sources de vérité concurrentes pour le même concept.
 *
 * Les 5 autres collections par défaut (Meal Prep, Sèche, Prise de masse,
 * Rapide, À tester) sont semées paresseusement côté client au premier fetch
 * si l'utilisateur n'a encore aucune collection — pas de trigger DB (pattern
 * précédent `home_categories` entièrement retiré, pas de référence active à
 * suivre).
 */
const db = supabase;

export const DEFAULT_COLLECTION_NAMES = [
  "Meal Prep",
  "Sèche",
  "Prise de masse",
  "Rapide",
  "À tester",
] as const;

/** Collection virtuelle "Favoris" — jamais persistée, dérivée de recipes.is_favorite. */
export const FAVORITES_COLLECTION_ID = "__favorites__";

export interface RecipeCollection {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const COLLECTIONS_KEY = ["recipe_collections"] as const;
const membershipKey = (recipeId: string) => ["recipe_collection_recipes", recipeId] as const;

async function seedDefaultCollectionsIfEmpty(userId: string): Promise<void> {
  const { count, error } = await db
    .from("recipe_collections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error || (count ?? 0) > 0) return;
  const rows = DEFAULT_COLLECTION_NAMES.map((name) => ({
    user_id: userId,
    name,
    is_default: true,
  }));
  await db.from("recipe_collections").insert(rows);
}

/** Liste des collections de l'utilisateur — sème les collections par défaut si nécessaire. */
export function useCollections() {
  return useQuery({
    queryKey: COLLECTIONS_KEY,
    queryFn: async (): Promise<RecipeCollection[]> => {
      const {
        data: { user },
      } = await supabaseTyped.auth.getUser();
      if (!user) return [];

      await seedDefaultCollectionsIfEmpty(user.id);

      const { data, error } = await db
        .from("recipe_collections")
        .select("*")
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RecipeCollection[];
    },
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Nom de collection requis");
      const {
        data: { user },
      } = await supabaseTyped.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await db
        .from("recipe_collections")
        .insert({ user_id: user.id, name: trimmed, is_default: false });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Collection créée");
      qc.invalidateQueries({ queryKey: COLLECTIONS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRenameCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Nom de collection requis");
      const { error } = await db.from("recipe_collections").update({ name: trimmed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Collection renommée");
      qc.invalidateQueries({ queryKey: COLLECTIONS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("recipe_collections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Collection supprimée");
      qc.invalidateQueries({ queryKey: COLLECTIONS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Ids des collections (réelles) contenant cette recette. */
export function useRecipeCollectionIds(recipeId: string | null | undefined) {
  return useQuery({
    queryKey: membershipKey(recipeId ?? "none"),
    enabled: !!recipeId,
    queryFn: async (): Promise<string[]> => {
      if (!recipeId) return [];
      const { data, error } = await db
        .from("recipe_collection_recipes")
        .select("collection_id")
        .eq("recipe_id", recipeId);
      if (error) throw error;
      return ((data ?? []) as Array<{ collection_id: string }>).map((r) => r.collection_id);
    },
  });
}

export function useAddRecipeToCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ collectionId, recipeId }: { collectionId: string; recipeId: string }) => {
      const {
        data: { user },
      } = await supabaseTyped.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await db
        .from("recipe_collection_recipes")
        .upsert(
          { collection_id: collectionId, recipe_id: recipeId, user_id: user.id },
          { onConflict: "collection_id,recipe_id" },
        );
      if (error) throw error;
    },
    onSuccess: (_r, { recipeId }) => {
      qc.invalidateQueries({ queryKey: membershipKey(recipeId) });
      qc.invalidateQueries({ queryKey: ["recipe_collection_members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemoveRecipeFromCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ collectionId, recipeId }: { collectionId: string; recipeId: string }) => {
      const { error } = await db
        .from("recipe_collection_recipes")
        .delete()
        .eq("collection_id", collectionId)
        .eq("recipe_id", recipeId);
      if (error) throw error;
    },
    onSuccess: (_r, { recipeId }) => {
      qc.invalidateQueries({ queryKey: membershipKey(recipeId) });
      qc.invalidateQueries({ queryKey: ["recipe_collection_members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Ids des recettes appartenant à une collection donnée (réelle, pas Favoris). */
export function useCollectionRecipeIds(collectionId: string | null | undefined) {
  return useQuery({
    queryKey: ["recipe_collection_members", collectionId ?? "none"],
    enabled: !!collectionId && collectionId !== FAVORITES_COLLECTION_ID,
    queryFn: async (): Promise<string[]> => {
      if (!collectionId) return [];
      const { data, error } = await db
        .from("recipe_collection_recipes")
        .select("recipe_id")
        .eq("collection_id", collectionId);
      if (error) throw error;
      return ((data ?? []) as Array<{ recipe_id: string }>).map((r) => r.recipe_id);
    },
  });
}
