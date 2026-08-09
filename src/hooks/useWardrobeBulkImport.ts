/**
 * Import massif intelligent (Phase 5.1) — connexion React/Supabase du
 * contrôleur pur `BulkWardrobeImportController` (src/lib/wardrobe/bulkImport.ts).
 *
 * Réutilise EXACTEMENT le pipeline existant :
 * - Vision : même edge function `analyze-wardrobe-item` + même parsing que
 *   `useAnalyzeWardrobePhoto`.
 * - Détourage : `processWardrobePhoto` (Phase 5), inchangé.
 * - Storage + insert `wardrobe_items` : `createWardrobeItemRecord`, extrait
 *   de `useCreateWardrobeItem` sans changement de comportement.
 *
 * Aucun upload Storage n'a lieu avant qu'une pièce soit validée par
 * l'utilisateur (§10) : tant qu'une proposition reste en revue, elle ne vit
 * qu'en mémoire (File/Blob) côté client.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fileToBase64Compressed } from "@/lib/nutrition/utils";
import { processWardrobePhoto } from "@/lib/wardrobe/backgroundRemoval";
import {
  BulkWardrobeImportController,
  proposalToCreateInput,
  type BulkImportProgress,
  type BulkWardrobeProposal,
} from "@/lib/wardrobe/bulkImport";
import {
  WARDROBE_MAX_FILE_SIZE_BYTES,
  createWardrobeItemRecord,
  parseWardrobeAnalysisResponse,
  useWardrobeItems,
  validateWardrobePhotoFile,
} from "@/hooks/useWardrobe";

// Re-export pour les consommateurs (route d'import, tests).
export { WARDROBE_MAX_FILE_SIZE_BYTES };
export type { BulkImportProgress, BulkWardrobeProposal };

/** Concurrence bornée — ne jamais lancer plus de N appels Vision/détourage en parallèle. */
export const WARDROBE_BULK_CONCURRENCY = 3;

/** Import massif conçu pour 20-50+ photos (cf. mission Phase 5.1). */
export const WARDROBE_BULK_MAX_FILES = 80;

export interface BulkFileRejection {
  fileName: string;
  message: string;
}

export function useWardrobeBulkImport() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: existingItems } = useWardrobeItems();

  const controllerRef = useRef<BulkWardrobeImportController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new BulkWardrobeImportController({
      concurrency: WARDROBE_BULK_CONCURRENCY,
      analyzePhoto: async (file) => {
        const { b64, mime } = await fileToBase64Compressed(file);
        const { data, error } = await supabase.functions.invoke("analyze-wardrobe-item", {
          body: { image_base64: b64, mime_type: mime },
        });
        return parseWardrobeAnalysisResponse(data, error);
      },
      cutoutPhoto: (file) => processWardrobePhoto(file),
      createItem: async ({ file, processedFile, proposal }) => {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (!authUser) throw new Error("Non authentifié.");
        const input = proposalToCreateInput(proposal, file, processedFile);
        return createWardrobeItemRecord(authUser.id, input);
      },
    });
  }
  const controller = controllerRef.current;

  const [proposals, setProposals] = useState<BulkWardrobeProposal[]>(() =>
    controller.getProposals(),
  );
  const [progress, setProgress] = useState<BulkImportProgress>(() => controller.getProgress());

  useEffect(() => {
    const sync = () => {
      setProposals(controller.getProposals());
      setProgress(controller.getProgress());
    };
    sync();
    return controller.subscribe(sync);
  }, [controller]);

  // Recalcule les doublons potentiels dès que le dressing existant est
  // connu ou que la revue change (nouvelle pièce analysée, édition…).
  useEffect(() => {
    const candidates = (existingItems ?? []).map((item) => ({
      id: item.id,
      subcategory: item.subcategory,
      primaryColor: item.primary_color,
      brand: item.brand,
    }));
    controller.computeDuplicates(candidates);
    // Le contrôleur notifie déjà ses abonnés si l'état change réellement.
  }, [controller, existingItems, proposals.length, progress.processed]);

  const addFiles = useCallback(
    (fileList: FileList | File[]): { accepted: string[]; rejected: BulkFileRejection[] } => {
      const files = Array.from(fileList);
      const remainingSlots = Math.max(
        0,
        WARDROBE_BULK_MAX_FILES - controller.getProposals().length,
      );
      const accepted: File[] = [];
      const rejected: BulkFileRejection[] = [];

      for (const file of files) {
        if (accepted.length >= remainingSlots) {
          rejected.push({ fileName: file.name, message: "Limite de photos par import atteinte." });
          continue;
        }
        const validation = validateWardrobePhotoFile(file);
        if (!validation.ok) {
          rejected.push({ fileName: file.name, message: validation.message });
          continue;
        }
        accepted.push(file);
      }

      if (rejected.length > 0) {
        toast.error(
          rejected.length === 1
            ? `${rejected[0].fileName} : ${rejected[0].message}`
            : `${rejected.length} photos ignorées (format ou taille invalide).`,
        );
      }

      const ids = controller.addFiles(accepted);
      return { accepted: ids, rejected };
    },
    [controller],
  );

  const retry = useCallback((jobId: string) => controller.retry(jobId), [controller]);
  const skip = useCallback((jobId: string) => controller.skip(jobId), [controller]);
  const updateProposal = useCallback(
    (jobId: string, patch: Partial<BulkWardrobeProposal>) =>
      controller.updateProposal(jobId, patch),
    [controller],
  );
  const setDuplicateIgnored = useCallback(
    (jobId: string, ignored: boolean) => controller.setDuplicateIgnored(jobId, ignored),
    [controller],
  );
  const abandon = useCallback(() => controller.abandon(), [controller]);

  const validate = useCallback(
    async (jobId: string) => {
      const result = await controller.validate(jobId);
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: ["wardrobe-items", user?.id] });
      } else {
        toast.error(result.error || "Impossible d'ajouter cette pièce.");
      }
      return result;
    },
    [controller, queryClient, user?.id],
  );

  const validateAll = useCallback(
    async (jobIds?: readonly string[]) => {
      const result = await controller.validateAll(jobIds);
      if (result.succeeded.length > 0) {
        void queryClient.invalidateQueries({ queryKey: ["wardrobe-items", user?.id] });
        toast.success(
          result.succeeded.length > 1
            ? `${result.succeeded.length} pièces ajoutées à ton dressing.`
            : "Pièce ajoutée à ton dressing.",
        );
      }
      if (result.failed.length > 0) {
        toast.error(
          result.failed.length === 1
            ? "1 pièce n'a pas pu être ajoutée."
            : `${result.failed.length} pièces n'ont pas pu être ajoutées.`,
        );
      }
      return result;
    },
    [controller, queryClient, user?.id],
  );

  return {
    proposals,
    progress,
    addFiles,
    retry,
    skip,
    updateProposal,
    setDuplicateIgnored,
    validate,
    validateAll,
    abandon,
  };
}
