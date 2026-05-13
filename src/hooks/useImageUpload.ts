import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { DocModuleSelection, AnalysisResult } from "@/hooks/use-documents";

export type UploadStage =
  | "idle"
  | "validating"
  | "compressing"
  | "uploading"
  | "ocr"
  | "parsing"
  | "done"
  | "error";

export type ImageUploadResult = {
  doc: Tables<"documents">;
  result: AnalysisResult;
  detectedModule: string;
  wasAuto: boolean;
};

type UploadState = {
  isUploading: boolean;
  stage: UploadStage;
  progress: number;
  result: ImageUploadResult | null;
  error: string | null;
};

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

// Extension-based check is primary — MIME alone is unreliable on iOS Safari
export function isImageFile(file: File): boolean {
  if (IMAGE_EXTENSIONS.test(file.name)) return true;
  const mime = file.type.toLowerCase();
  return (
    mime.startsWith("image/") &&
    !mime.includes("svg") &&
    !mime.includes("gif")
  );
}

// Canvas compression — skips HEIC/HEIF since browsers can't draw them to canvas
async function compressIfNeeded(file: File): Promise<Blob> {
  const isHeic = /\.(heic|heif)$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
  // Return HEIC as-is; the edge function handles it via magic bytes
  if (isHeic) return file;

  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("Lecture du fichier échouée"));
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Image invalide ou format non supporté"));
    i.src = dataUrl;
  });

  const MAX = 1400;
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
      0.82,
    );
  });
}

export function useImageUpload() {
  const [state, setState] = useState<UploadState>({
    isUploading: false,
    stage: "idle",
    progress: 0,
    result: null,
    error: null,
  });

  const setStage = (stage: UploadStage, progress: number) =>
    setState((s) => ({ ...s, stage, progress }));

  const upload = useCallback(
    async (file: File, module: DocModuleSelection): Promise<ImageUploadResult | null> => {
      setState({ isUploading: true, stage: "validating", progress: 5, result: null, error: null });

      try {
        // Validate by extension (primary) — never reject by MIME alone
        if (!isImageFile(file)) {
          throw new Error("Format non supporté. Utilise JPG, PNG, WEBP ou HEIC.");
        }
        if (file.size > 15 * 1024 * 1024) {
          throw new Error("Fichier trop volumineux (max 15 Mo)");
        }

        setStage("compressing", 15);
        const compressed = await compressIfNeeded(file);

        // Normalize HEIC filename → .jpg for display
        let finalName = file.name;
        if (/\.(heic|heif)$/i.test(finalName)) {
          finalName = finalName.replace(/\.(heic|heif)$/i, ".jpg");
        }

        setStage("uploading", 30);

        // Simulate OCR/parsing stages while request is in flight
        const stageTimer = setTimeout(() => setStage("ocr", 55), 3000);
        const stageTimer2 = setTimeout(() => setStage("parsing", 80), 7000);

        const formData = new FormData();
        formData.append("image", compressed, finalName);
        formData.append("module", module);
        formData.append("name", finalName);

        let response: { data: unknown; error: unknown };
        try {
          response = await supabase.functions.invoke("analyze-image", { body: formData });
        } finally {
          clearTimeout(stageTimer);
          clearTimeout(stageTimer2);
        }

        if (response.error) {
          // Supabase wraps non-2xx as generic error — try to unwrap
          const raw = (response.error as { message?: string })?.message ?? "";
          const msg = raw.includes("non-2xx")
            ? "L'analyse IA a échoué. Vérifie que l'image est lisible et réessaie."
            : raw || "Erreur lors de l'analyse";
          throw new Error(msg);
        }

        const data = response.data as {
          success: boolean;
          user_message?: string;
          doc?: Tables<"documents">;
          result?: AnalysisResult;
          detected_module?: string;
          was_auto?: boolean;
        };

        if (!data?.success) {
          throw new Error(data?.user_message ?? "L'analyse IA a échoué. Réessaie.");
        }

        if (!data.doc || !data.result) {
          throw new Error("Réponse incomplète du serveur. Réessaie.");
        }

        const imageResult: ImageUploadResult = {
          doc: data.doc,
          result: data.result,
          detectedModule: data.detected_module ?? "documents",
          wasAuto: data.was_auto ?? false,
        };

        setState({ isUploading: false, stage: "done", progress: 100, result: imageResult, error: null });
        return imageResult;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erreur inconnue";
        setState({ isUploading: false, stage: "error", progress: 0, result: null, error: msg });
        throw e;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setState({ isUploading: false, stage: "idle", progress: 0, result: null, error: null });
  }, []);

  return { ...state, upload, reset };
}
