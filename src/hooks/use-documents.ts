import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type DocModule =
  | "alimentation"
  | "pharmacie"
  | "habits"
  | "menager"
  | "nutrition"
  | "fitness"
  | "body"
  | "documents";

export type DocModuleSelection = DocModule | "auto";

export const MODULE_LABELS: Record<DocModule, string> = {
  alimentation: "Alimentation",
  pharmacie: "Pharmacie",
  habits: "Garde-robe",
  menager: "Ménager",
  nutrition: "Nutrition",
  fitness: "Séances",
  body: "Mesures corporelles",
  documents: "Document seul",
};

export const MODULE_SELECTION_LABELS: Record<DocModuleSelection, string> = {
  auto: "Détection automatique",
  ...MODULE_LABELS,
};

export type AnalysisResult = {
  summary: string;
  key_insights: string[];
  alerts: string[];
  extracted_items: Array<Record<string, unknown>>;
  detected_module?: DocModule | null;
};

export function useDocuments() {
  return useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Tables<"documents">[];
    },
  });
}

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function isImageFile(file: File): boolean {
  if (ACCEPTED_IMAGE_TYPES.has(file.type)) return true;
  // iOS Safari may report HEIC as "" — fallback to extension
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

async function compressImage(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("Lecture de l'image échouée"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Image invalide ou format non supporté"));
    i.src = dataUrl;
  });
  const MAX = 1600;
  const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((res, rej) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) rej(new Error("Compression échouée"));
        else res(blob);
      },
      "image/jpeg",
      0.85,
    );
  });
}

export function useUploadAndAnalyze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, module }: { file: File; module: DocModuleSelection }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const isImage = isImageFile(file);
      const isPdf = file.type === "application/pdf";
      if (!isImage && !isPdf) {
        throw new Error("Format non supporté (PDF, JPG, PNG, WEBP, HEIC)");
      }
      if (file.size > 15 * 1024 * 1024) throw new Error("Fichier trop volumineux (max 15 Mo)");

      let uploadBlob: Blob = file;
      let contentType = file.type || "application/pdf";
      // Normalize filename: replace HEIC/HEIF with .jpg since we compress to JPEG
      let displayName = file.name.replace(/\.(heic|heif)$/i, ".jpg");

      if (isImage) {
        uploadBlob = await compressImage(file);
        contentType = "image/jpeg";
      }

      const path = `${user.id}/${Date.now()}-${displayName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("pdf-documents")
        .upload(path, uploadBlob, { contentType, upsert: false });
      if (upErr) throw upErr;

      const { data: ai, error: fnErr } = await supabase.functions.invoke("analyze-pdf", {
        body: { storage_path: path, module, name: displayName, content_type: contentType },
      });
      if (fnErr) {
        let friendlyMsg = isImage
          ? "Impossible d'analyser cette image. Essayez un format JPG ou PNG clair."
          : "Impossible d'analyser ce PDF. Vérifiez que le fichier n'est pas corrompu.";
        try {
          const body = await (fnErr as { context?: { json?: () => Promise<Record<string, unknown>> } }).context?.json?.();
          if (body?.error && typeof body.error === "string") friendlyMsg = body.error;
        } catch { /* keep default */ }
        throw new Error(friendlyMsg);
      }
      if (ai?.error) throw new Error(ai.error);

      const result = ai as AnalysisResult;
      const finalModule: DocModule =
        module === "auto" ? (result.detected_module ?? "documents") : module;

      const { data: doc, error: insErr } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          name: displayName,
          module: finalModule,
          storage_path: path,
          summary: result.summary,
          key_insights: result.key_insights,
          alerts: result.alerts,
          analysis: JSON.stringify(result.extracted_items),
        })
        .select()
        .single();
      if (insErr) throw insErr;

      return { doc, result, detectedModule: finalModule, wasAuto: module === "auto", isImage };
    },
    onSuccess: ({ wasAuto, detectedModule }) => {
      toast.success(
        wasAuto
          ? `Document analysé — détecté: ${MODULE_LABELS[detectedModule]}`
          : "Document analysé",
      );
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: Tables<"documents">) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      await supabase.storage.from("pdf-documents").remove([doc.storage_path]);
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document supprimé");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
