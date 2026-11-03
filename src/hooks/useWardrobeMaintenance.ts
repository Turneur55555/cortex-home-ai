import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/db";
import { useAuth } from "@/hooks/use-auth";
import type { WardrobeItemView } from "@/hooks/useWardrobe";
import type { WardrobePatch } from "@/lib/wardrobe/dataQuality";
import { runSequentialBatch, type BatchProgress } from "@/lib/wardrobe/sequentialBatch";
import { canonicalWardrobeColor, canonicalWardrobeSubcategory } from "@/lib/wardrobe/taxonomy";

/**
 * Remise à niveau du Dressing (Refonte, étape 0) : corrections acceptées par
 * le joueur et détourage en lot des photos existantes.
 */

/** Écrit UNIQUEMENT les champs fournis (à la différence de `updateWardrobeItemRecord`). */
export async function patchWardrobeItemRecord(
  authUserId: string,
  itemId: string,
  patch: WardrobePatch & { processed_storage_path?: string },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim() || null;
  if (patch.subcategory !== undefined)
    row.subcategory = canonicalWardrobeSubcategory(patch.subcategory);
  if (patch.primary_color !== undefined)
    row.primary_color = canonicalWardrobeColor(patch.primary_color);
  if (patch.secondary_colors !== undefined)
    row.secondary_colors = patch.secondary_colors
      .map((c) => canonicalWardrobeColor(c))
      .filter((c): c is string => !!c);
  if (patch.seasons !== undefined) row.seasons = patch.seasons;
  if (patch.processed_storage_path !== undefined)
    row.processed_storage_path = patch.processed_storage_path;
  if (Object.keys(row).length === 0) return;
  const { error } = await db
    .from("wardrobe_items")
    .update(row)
    .eq("id", itemId)
    .eq("user_id", authUserId);
  if (error) throw error;
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");
  return user.id;
}

export interface WardrobeFixToApply {
  itemId: string;
  patch: WardrobePatch;
}

/** Applique des corrections, une pièce après l'autre (plusieurs corrections d'une même pièce fusionnées). */
export function useApplyWardrobeFixes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fixes: WardrobeFixToApply[]) => {
      const userId = await requireUserId();
      const merged = new Map<string, WardrobePatch>();
      for (const fix of fixes) merged.set(fix.itemId, { ...merged.get(fix.itemId), ...fix.patch });
      for (const [itemId, patch] of merged) await patchWardrobeItemRecord(userId, itemId, patch);
      return merged.size;
    },
    onSuccess: (count) => {
      toast.success(count > 1 ? `${count} pièces corrigées.` : "Pièce corrigée.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Impossible d'appliquer la correction.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["wardrobe-items", user?.id] });
    },
  });
}

/** Télécharge l'original, le détoure dans le navigateur, publie `processed.webp`. */
export async function detourWardrobeItem(
  authUserId: string,
  item: Pick<WardrobeItemView, "id" | "storage_path">,
): Promise<void> {
  if (!item.storage_path) throw new Error("Pièce sans photo.");
  const { data: original, error: downloadError } = await supabase.storage
    .from("wardrobe")
    .download(item.storage_path);
  if (downloadError || !original) throw downloadError ?? new Error("Photo introuvable.");
  const { processWardrobePhoto } = await import("@/lib/wardrobe/backgroundRemoval");
  const file = new File([original], "original", { type: original.type || "image/jpeg" });
  const processed = await processWardrobePhoto(file);
  const processedPath = `${authUserId}/${item.id}/processed.webp`;
  const { error: uploadError } = await supabase.storage
    .from("wardrobe")
    .upload(processedPath, processed, { contentType: "image/webp", upsert: true });
  if (uploadError) throw uploadError;
  await patchWardrobeItemRecord(authUserId, item.id, { processed_storage_path: processedPath });
}

const IDLE: BatchProgress = { total: 0, done: 0, failed: [], currentId: null };

/** Détourage en lot : séquentiel, interruptible, une pièce échouée n'arrête pas le lot. */
export function useBatchDetourage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<BatchProgress>(IDLE);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const run = useCallback(
    async (items: Array<Pick<WardrobeItemView, "id" | "storage_path">>) => {
      if (running || items.length === 0) return;
      stopRef.current = false;
      setRunning(true);
      try {
        const userId = await requireUserId();
        const result = await runSequentialBatch(
          items,
          (item) => detourWardrobeItem(userId, item),
          setProgress,
          () => stopRef.current,
        );
        if (result.failed.length > 0) {
          toast.error(
            `${result.failed.length} photo${result.failed.length > 1 ? "s" : ""} n'a pas pu être détourée : l'original reste affiché.`,
          );
        } else if (result.done > 0) {
          toast.success(
            `${result.done} photo${result.done > 1 ? "s" : ""} détourée${result.done > 1 ? "s" : ""}.`,
          );
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Détourage interrompu.");
      } finally {
        setRunning(false);
        void queryClient.invalidateQueries({ queryKey: ["wardrobe-items", user?.id] });
      }
    },
    [running, queryClient, user?.id],
  );

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  return { run, stop, running, progress };
}
