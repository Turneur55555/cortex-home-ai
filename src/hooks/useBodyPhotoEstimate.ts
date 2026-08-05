import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/db";
import {
  normalizePhotoEstimateResponse,
  PHOTO_BODY_FAT_ENGINE_VERSION,
  type PhotoBodyFatEstimate,
  type RawPhotoEstimateResponse,
} from "@/lib/fitness/bodyFatPhotoEstimate";

export interface PhotoPayload {
  b64: string;
  mime: string;
}

/**
 * Appelle l'edge function `estimate-body-fat-photo` (Gemini 2.5 Flash,
 * pattern IA déjà en production — voir la fonction elle-même) puis
 * normalise TOUJOURS la réponse via `normalizePhotoEstimateResponse` avant
 * de la rendre disponible à l'UI — l'UI ne connaît jamais le JSON brut du
 * provider (§16 du brief Phase 6C).
 */
export function useEstimateBodyFatFromPhotos() {
  return useMutation({
    mutationFn: async (input: {
      front: PhotoPayload;
      side: PhotoPayload;
      back?: PhotoPayload | null;
    }): Promise<PhotoBodyFatEstimate> => {
      const { data, error } = await supabase.functions.invoke("estimate-body-fat-photo", {
        body: {
          front: input.front,
          side: input.side,
          back: input.back ?? undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const raw: RawPhotoEstimateResponse = {
        status: data.status,
        minPercent: data.minPercent ?? null,
        maxPercent: data.maxPercent ?? null,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      };
      return normalizePhotoEstimateResponse(raw);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export interface SaveBodyPhotoAnalysisInput {
  date: string;
  weightKg: number | null;
  estimate: PhotoBodyFatEstimate;
  front: PhotoPayload;
  side: PhotoPayload;
  back?: PhotoPayload | null;
}

/**
 * Persiste une analyse CONFIRMÉE par l'utilisateur (§24 du brief : jamais
 * automatique dès que l'analyse retourne un résultat) :
 *  1. crée la ligne `body_tracking` (méthode `photo_estimate`, fourchette
 *     reprise depuis Phase 6A `body_fat_min_percent`/`body_fat_max_percent`) ;
 *  2. upload les photos dans le bucket PRIVÉ `body-composition-photos`,
 *     chemin `{user_id}/{analysis_id}/{vue}.jpg` (jamais d'URL publique) ;
 *  3. crée la ligne `body_photo_analyses` (métadonnées uniquement — jamais
 *     l'image elle-même dans une table Postgres).
 * En cas d'échec après la création de `body_tracking`, best-effort rollback
 * (supprime la ligne orpheline) — même esprit que `useDeleteDocument`.
 */
export function useSaveBodyPhotoAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveBodyPhotoAnalysisInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      if (
        input.estimate.status !== "success" ||
        input.estimate.minPercent == null ||
        input.estimate.maxPercent == null ||
        input.estimate.referencePercent == null
      ) {
        throw new Error("Estimation invalide — impossible d'enregistrer.");
      }
      const { minPercent, maxPercent, referencePercent } = input.estimate;

      const { data: trackingRow, error: trackingError } = await db
        .from("body_tracking")
        .insert({
          date: input.date,
          weight: input.weightKg,
          body_fat: referencePercent,
          body_fat_min_percent: minPercent,
          body_fat_max_percent: maxPercent,
          body_fat_method: "photo_estimate",
          body_fat_formula: PHOTO_BODY_FAT_ENGINE_VERSION,
          user_id: user.id,
        })
        .select("id")
        .single();
      if (trackingError || !trackingRow)
        throw trackingError ?? new Error("Échec de l'enregistrement.");

      const rollbackTracking = async () => {
        await db
          .from("body_tracking")
          .delete()
          .eq("id", trackingRow.id)
          .eq("user_id", user.id);
      };

      const analysisId = crypto.randomUUID();
      const frontPath = `${user.id}/${analysisId}/front.jpg`;
      const sidePath = `${user.id}/${analysisId}/side.jpg`;
      const backPath = input.back ? `${user.id}/${analysisId}/back.jpg` : null;

      try {
        const uploads = [
          supabase.storage
            .from("body-composition-photos")
            .upload(frontPath, base64ToBlob(input.front.b64, input.front.mime), {
              contentType: "image/jpeg",
              upsert: false,
            }),
          supabase.storage
            .from("body-composition-photos")
            .upload(sidePath, base64ToBlob(input.side.b64, input.side.mime), {
              contentType: "image/jpeg",
              upsert: false,
            }),
        ];
        if (input.back && backPath) {
          uploads.push(
            supabase.storage
              .from("body-composition-photos")
              .upload(backPath, base64ToBlob(input.back.b64, input.back.mime), {
                contentType: "image/jpeg",
                upsert: false,
              }),
          );
        }
        const results = await Promise.all(uploads);
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      } catch (e) {
        // Best-effort : supprime les fichiers déjà uploadés + la ligne body_tracking orpheline.
        await supabase.storage
          .from("body-composition-photos")
          .remove([frontPath, sidePath, ...(backPath ? [backPath] : [])]);
        await rollbackTracking();
        throw e;
      }

      const { error: analysisError } = await db.from("body_photo_analyses").insert({
        user_id: user.id,
        body_tracking_id: trackingRow.id,
        status: "success",
        front_path: frontPath,
        side_path: sidePath,
        back_path: backPath,
        min_percent: minPercent,
        max_percent: maxPercent,
        reference_percent: referencePercent,
        engine_version: PHOTO_BODY_FAT_ENGINE_VERSION,
        warnings: input.estimate.warnings,
      });
      if (analysisError) {
        await supabase.storage
          .from("body-composition-photos")
          .remove([frontPath, sidePath, ...(backPath ? [backPath] : [])]);
        await rollbackTracking();
        throw analysisError;
      }
    },
    onSuccess: () => {
      toast.success("Estimation enregistrée");
      qc.invalidateQueries({ queryKey: ["body_tracking"] });
      qc.invalidateQueries({ queryKey: ["body_photo_analyses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface BodyPhotoAnalysisMeta {
  id: string;
  bodyTrackingId: string;
  frontPath: string;
  sidePath: string;
  backPath: string | null;
}

/** Métadonnées (chemins Storage) des analyses photo de l'utilisateur — jamais les images elles-mêmes. */
export function useBodyPhotoAnalyses() {
  return useQuery({
    queryKey: ["body_photo_analyses"],
    staleTime: 60_000,
    queryFn: async (): Promise<BodyPhotoAnalysisMeta[]> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await db
        .from("body_photo_analyses")
        .select("id, body_tracking_id, front_path, side_path, back_path")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        bodyTrackingId: r.body_tracking_id,
        frontPath: r.front_path,
        sidePath: r.side_path,
        backPath: r.back_path,
      }));
    },
  });
}

/**
 * Supprime une mesure issue d'une analyse photo : fichiers Storage D'ABORD,
 * puis la ligne `body_tracking` (dont la suppression cascade automatiquement
 * vers `body_photo_analyses` via FK ON DELETE CASCADE) — jamais d'orphelins
 * Storage (§37 du brief).
 */
export function useDeleteBodyPhotoAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bodyTrackingId: string; paths: string[] }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      if (input.paths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("body-composition-photos")
          .remove(input.paths);
        if (storageError) throw storageError;
      }
      const { error } = await db
        .from("body_tracking")
        .delete()
        .eq("id", input.bodyTrackingId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Analyse supprimée");
      qc.invalidateQueries({ queryKey: ["body_tracking"] });
      qc.invalidateQueries({ queryKey: ["body_photo_analyses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
