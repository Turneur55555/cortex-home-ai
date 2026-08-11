/**
 * Outfit Engine — connexion React/Supabase du moteur pur
 * `src/lib/wardrobe/outfitEngine.ts` : lit le dressing réel de l'utilisateur
 * (`useWardrobeItems`, déjà utilisé par la grille Dressing), lance le
 * moteur déterministe, puis persiste une tenue choisie dans `outfits` /
 * `outfit_items` et, en option, un retour 👍/👎 dans `outfit_feedback`.
 *
 * Aucun appel IA dans ce chemin : le score et les combinaisons viennent
 * uniquement de `generateOutfits` (structuré, reproductible) — cf. mission
 * §3/§4 (minimiser/éviter l'IA dans le hot path).
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWardrobeItems, type WardrobeItemView } from "@/hooks/useWardrobe";
import {
  generateOutfits,
  type GenerateOutfitsOptions,
  type GenerateOutfitsResult,
  type GeneratedOutfit,
  type OutfitCategory,
  type OutfitContext,
  type OutfitScoringItem,
} from "@/lib/wardrobe/outfitEngine";
import type { Json } from "@/integrations/supabase/types";

/**
 * `wardrobe_items.category` est déjà la valeur DB canonique
 * (top/bottom/outerwear/shoes/accessory) — c'est exactement la forme
 * attendue par le moteur, aucune reconversion UI nécessaire ici (à la
 * différence de `uiCategory`, dérivé pour l'affichage de la grille).
 */
const KNOWN_CATEGORIES: OutfitCategory[] = ["top", "bottom", "outerwear", "shoes", "accessory"];

export function mapWardrobeItemToScoringItem(item: WardrobeItemView): OutfitScoringItem | null {
  if (!item.category || !KNOWN_CATEGORIES.includes(item.category as OutfitCategory)) return null;
  return {
    id: item.id,
    category: item.category as OutfitCategory,
    subcategory: item.subcategory,
    primary_color: item.primary_color,
    secondary_colors: item.secondary_colors,
    pattern: item.pattern,
    material: item.material,
    fit: item.fit,
    formality: item.formality,
    seasons: item.seasons,
    usage: item.usage,
  };
}

/**
 * Génère des tenues à partir du dressing réel courant. `generate` est pure
 * synchrone (le moteur ne fait aucun appel réseau) — le seul temps d'attente
 * vient du chargement initial de `useWardrobeItems`.
 */
export function useGenerateOutfits() {
  const { data: items, isLoading, isError } = useWardrobeItems();

  const itemById = useMemo(() => new Map((items ?? []).map((item) => [item.id, item])), [items]);

  const generate = useCallback(
    (context: OutfitContext, options?: GenerateOutfitsOptions): GenerateOutfitsResult => {
      const scoringItems = (items ?? [])
        .map(mapWardrobeItemToScoringItem)
        .filter((i): i is OutfitScoringItem => i !== null);
      return generateOutfits(scoringItems, context, options);
    },
    [items],
  );

  /** Retrouve la pièce complète (photo, nom…) affichée derrière un `OutfitScoringItem`. */
  const resolveItem = useCallback(
    (id: string): WardrobeItemView | undefined => itemById.get(id),
    [itemById],
  );

  return { generate, resolveItem, isLoading, isError, wardrobeCount: items?.length ?? 0 };
}

export interface SaveOutfitInput {
  outfit: GeneratedOutfit;
  context: OutfitContext;
  /** "Utiliser cette tenue" (§8) — marque la tenue comme portée maintenant. */
  wornNow?: boolean;
}

/**
 * Persiste une tenue générée : une ligne `outfits` + une ligne `outfit_items`
 * par pièce, toutes référencées par leur `wardrobe_item_id` réel (jamais de
 * pièce inventée — les IDs viennent directement du moteur déterministe).
 * Nettoie l'outfit si l'insert des `outfit_items` échoue (même logique de
 * rollback que `createWardrobeItemRecord`).
 */
export async function saveOutfitRecord(
  authUserId: string,
  input: SaveOutfitInput,
): Promise<string> {
  const outfitId = crypto.randomUUID();
  const { error: outfitError } = await supabase.from("outfits").insert({
    id: outfitId,
    user_id: authUserId,
    occasion: input.context,
    score: input.outfit.score,
    score_breakdown: input.outfit.breakdown as unknown as Json,
    ai_explanation: input.outfit.explanation,
    worn_at: input.wornNow ? new Date().toISOString() : null,
  });
  if (outfitError) throw outfitError;

  const rows = input.outfit.items.map((item, index) => ({
    id: crypto.randomUUID(),
    user_id: authUserId,
    outfit_id: outfitId,
    wardrobe_item_id: item.id,
    position: index,
  }));
  const { error: itemsError } = await supabase.from("outfit_items").insert(rows);
  if (itemsError) {
    await supabase.from("outfits").delete().eq("id", outfitId);
    throw itemsError;
  }

  return outfitId;
}

export function useSaveOutfit() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveOutfitInput) => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Non authentifié.");
      return saveOutfitRecord(authUser.id, input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["outfits", user?.id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Impossible d'enregistrer cette tenue.");
    },
  });
}

export interface SaveOutfitFeedbackInput {
  outfitId: string;
  liked: boolean;
}

/** Persistance simple 👍/👎 — aucun ML, `outfit_feedback` fait juste foi. */
export async function saveOutfitFeedbackRecord(
  authUserId: string,
  input: SaveOutfitFeedbackInput,
): Promise<void> {
  const { error } = await supabase
    .from("outfit_feedback")
    .upsert(
      { user_id: authUserId, outfit_id: input.outfitId, liked: input.liked },
      { onConflict: "user_id,outfit_id" },
    );
  if (error) throw error;
}

export function useOutfitFeedback() {
  return useMutation({
    mutationFn: async (input: SaveOutfitFeedbackInput) => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Non authentifié.");
      await saveOutfitFeedbackRecord(authUser.id, input);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Impossible d'enregistrer ton avis.");
    },
  });
}
