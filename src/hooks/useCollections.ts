import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getIsOnline } from "@/lib/offline/networkStatus";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";
import { OFFLINE_FIRST_QUERY_OPTIONS } from "@/lib/offline/offlineQuery";
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
 * `recipe_collections` (id + updated_at) est offline-first (cf.
 * src/lib/offline/), même pattern que `useRecipes.ts` : écriture toujours
 * locale (IndexedDB) d'abord, sync en arrière-plan via la sync queue.
 *
 * `recipe_collection_recipes` reste ONLINE-ONLY : table de jointure sans
 * colonne `id` propre (clé composite `collection_id, recipe_id`, voir
 * migration `20260825090000_recipe_collections_and_shopping_categories.sql`)
 * — incompatible avec le repository générique qui suppose une identité par
 * `id` (`syncEngine.ts` fait `.upsert(payload, { onConflict: "id" })` et
 * `.eq("id", ...)` pour update/delete), même raisonnement que
 * `nutrition_goals`/`supplement_logs` exclues en vagues précédentes.
 * Conséquence hors connexion : la liste des collections reste consultable
 * et modifiable (créer/renommer/supprimer), mais ajouter/retirer une recette
 * d'une collection nécessite une connexion.
 *
 * Les 5 autres collections par défaut (Meal Prep, Sèche, Prise de masse,
 * Rapide, À tester) sont semées paresseusement côté client au premier fetch
 * si l'utilisateur n'a encore aucune collection LOCALE (pas seulement
 * serveur, pour rester idempotent hors connexion) — pas de trigger DB
 * (pattern précédent `home_categories` entièrement retiré, pas de référence
 * active à suivre).
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

const collectionsRepo = createOfflineRepository<RecipeCollection>("recipe_collections");

/** Sème les collections par défaut si l'utilisateur n'en a encore aucune EN LOCAL — idempotent hors connexion. */
async function seedDefaultCollectionsIfEmpty(userId: string): Promise<void> {
  const local = await collectionsRepo.list(userId);
  if (local.length > 0) return;
  for (const name of DEFAULT_COLLECTION_NAMES) {
    await collectionsRepo.create(userId, { name, is_default: true });
  }
}

/** Liste des collections de l'utilisateur — sème les collections par défaut si nécessaire. */
export function useCollections() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    ...OFFLINE_FIRST_QUERY_OPTIONS,
    queryKey: [...COLLECTIONS_KEY, userId],
    enabled: !!userId,
    queryFn: async (): Promise<RecipeCollection[]> => {
      if (!userId) return [];

      if (getIsOnline()) {
        try {
          const { data, error } = await db
            .from("recipe_collections")
            .select("*")
            .eq("user_id", userId);
          if (!error && data) {
            await hydrateEntitiesFromServer(
              "recipe_collections",
              userId,
              data as RecipeCollection[],
            );
          }
        } catch {
          // Hors ligne ou erreur réseau : on continue avec le store local.
        }
      }

      await seedDefaultCollectionsIfEmpty(userId);

      const local = await collectionsRepo.list(userId);
      return [...local].sort((a, b) => {
        if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    },
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Nom de collection requis");
      if (!user) throw new Error("Non authentifié");
      await collectionsRepo.create(user.id, { name: trimmed, is_default: false });
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
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Nom de collection requis");
      if (!user) throw new Error("Non authentifié");
      await collectionsRepo.update(id, user.id, { name: trimmed });
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
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Non authentifié");
      await collectionsRepo.remove(id, user.id);
    },
    onSuccess: () => {
      toast.success("Collection supprimée");
      qc.invalidateQueries({ queryKey: COLLECTIONS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/**
 * Ids des collections (réelles) contenant cette recette.
 * `recipe_collection_recipes` reste online-only (cf. note d'en-tête) — cette
 * lecture nécessite donc une connexion.
 */
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

/** `recipe_collection_recipes` reste online-only (cf. note d'en-tête) — nécessite une connexion. */
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

/** `recipe_collection_recipes` reste online-only (cf. note d'en-tête) — nécessite une connexion. */
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
