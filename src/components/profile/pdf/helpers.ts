import type { DocModule } from "@/hooks/use-documents";
import type { UploadStage } from "@/hooks/useImageUpload";
import type { TransferTarget } from "@/features/transfer/types";

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function toTransferTarget(module: DocModule): TransferTarget {
  return module === "documents" ? "nutrition" : (module as TransferTarget);
}

export const STAGE_LABELS: Record<UploadStage, string> = {
  idle: "",
  validating: "Vérification…",
  compressing: "Compression…",
  uploading: "Envoi…",
  ocr: "Lecture IA…",
  parsing: "Extraction…",
  done: "Terminé",
  error: "Erreur",
};

