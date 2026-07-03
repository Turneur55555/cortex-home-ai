import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { FileImage, FileText, Files, Loader2, Plus, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useDocuments,
  useUploadAndAnalyze,
  useDeleteDocument,
  MODULE_LABELS,
  MODULE_SELECTION_LABELS,
  type DocModule,
  type DocModuleSelection,
  type AnalysisResult,
} from "@/hooks/use-documents";
import { useImageUpload, isImageFile } from "@/hooks/useImageUpload";
import type { Tables } from "@/integrations/supabase/types";
import {
  useDeletePdf,
  useUploadPdf,
  useUserPdfs,
  getPdfSignedUrl,
  type UserPdf,
} from "@/hooks/use-user-pdfs";
import { STAGE_LABELS } from "./pdf/helpers";
import { PdfSkeleton } from "./pdf/PdfSkeleton";
import { PreviewModal } from "./pdf/PreviewModal";
import { DeleteModal } from "./pdf/DeleteModal";
import { PdfRow } from "./pdf/PdfRow";
import { ResultCard } from "./pdf/ResultCard";
import { DocCard } from "./pdf/DocCard";

// ─── Main panel ───────────────────────────────────────────────────────────────

export function PdfPanel() {
  // ── Simple PDF state ────────────────────────────────────────────────────────
  const { data: pdfs, isLoading: pdfsLoading } = useUserPdfs();
  const pdfUpload = useUploadPdf();
  const pdfRemove = useDeletePdf();
  const pdfFileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<UserPdf | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserPdf | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // ── AI analysis state ────────────────────────────────────────────────────────
  const docs = useDocuments();
  const aiUpload = useUploadAndAnalyze();
  const imageUpload = useImageUpload();
  const aiRemove = useDeleteDocument();
  const aiFileRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [aiModule, setAiModule] = useState<DocModuleSelection>("auto");
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastResult, setLastResult] = useState<{
    doc: Tables<"documents">;
    result: AnalysisResult;
  } | null>(null);

  const isWorking = aiUpload.isPending || imageUpload.isUploading;

  // ── Simple PDF handlers ──────────────────────────────────────────────────────
  const handlePdfFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      const pdf = Array.from(files).find(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
      );
      if (pdf) pdfUpload.mutate(pdf);
    },
    [pdfUpload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handlePdfFiles(e.dataTransfer.files);
    },
    [handlePdfFiles],
  );

  const handleDownload = async (pdf: UserPdf) => {
    if (downloadingId === pdf.id) return;
    setDownloadingId(pdf.id);
    try {
      const url = await getPdfSignedUrl(pdf.file_path);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdf.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // toast géré dans getPdfSignedUrl
    } finally {
      setDownloadingId(null);
    }
  };

  // ── AI analysis handlers ─────────────────────────────────────────────────────
  const handleAiSubmit = async () => {
    if (pickedFiles.length === 0) return toast.error("Sélectionne au moins un fichier");
    let last: { doc: Tables<"documents">; result: AnalysisResult } | null = null;
    let ok = 0;

    for (let i = 0; i < pickedFiles.length; i++) {
      setBatchProgress({ current: i + 1, total: pickedFiles.length });
      const file = pickedFiles[i];
      try {
        if (isImageFile(file)) {
          const res = await imageUpload.upload(file, aiModule);
          if (res) {
            last = { doc: res.doc, result: res.result };
            if (res.wasAuto) {
              toast.success(`Image analysée — détecté : ${MODULE_LABELS[res.detectedModule as DocModule] ?? res.detectedModule}`);
            } else {
              toast.success("Image analysée");
            }
            ok++;
          }
        } else {
          const res = await aiUpload.mutateAsync({ file, module: aiModule });
          if (res) {
            last = { doc: res.doc, result: res.result };
            ok++;
          }
        }
      } catch {
        // toast géré dans les hooks
      }
    }

    setBatchProgress(null);
    setLastResult(last);
    setPickedFiles([]);
    setSheetOpen(false);
    if (pickedFiles.length > 1) toast.success(`${ok}/${pickedFiles.length} fichiers analysés`);
  };

  const submitLabel = () => {
    if (imageUpload.isUploading && imageUpload.stage !== "idle") {
      const stageLabel = STAGE_LABELS[imageUpload.stage] || "Analyse…";
      if (batchProgress) return `${stageLabel} (${batchProgress.current}/${batchProgress.total})`;
      return stageLabel;
    }
    if (aiUpload.isPending) {
      if (batchProgress) return `Analyse ${batchProgress.current}/${batchProgress.total}…`;
      return "Analyse en cours…";
    }
    return pickedFiles.length > 1
      ? `Analyser ${pickedFiles.length} fichiers`
      : "Analyser avec l'IA";
  };

  return (
    <>
      {/* ── Section Docs IA ──────────────────────────────────────────────────── */}
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Docs IA
          </h2>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <Plus className="h-3 w-3" />
                Importer
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl border-border/60">
              <SheetHeader>
                <SheetTitle>Importer un document</SheetTitle>
              </SheetHeader>
              <div className="mt-5 flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Module cible
                  </label>
                  <Select value={aiModule} onValueChange={(v) => setAiModule(v as DocModuleSelection)}>
                    <SelectTrigger style={{ WebkitTapHighlightColor: "transparent" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MODULE_SELECTION_LABELS) as DocModuleSelection[]).map((m) => (
                        <SelectItem key={m} value={m}>{MODULE_SELECTION_LABELS[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Laisse sur « Détection automatique » pour que l'IA choisisse.
                  </p>
                </div>
                <div>
                  <input
                    ref={aiFileRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
                    multiple
                    className="hidden"
                    onChange={(e) =>
                      setPickedFiles(e.target.files ? Array.from(e.target.files) : [])
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => aiFileRef.current?.click()}
                  >
                    {pickedFiles.length === 0 ? (
                      <Files className="h-4 w-4 text-primary" />
                    ) : pickedFiles.length === 1 ? (
                      /\.(jpe?g|png|webp|heic|heif)$/i.test(pickedFiles[0].name) ||
                      pickedFiles[0].type.startsWith("image/") ? (
                        <FileImage className="h-4 w-4 text-primary" />
                      ) : (
                        <FileText className="h-4 w-4 text-primary" />
                      )
                    ) : (
                      <Files className="h-4 w-4 text-primary" />
                    )}
                    <span className="truncate">
                      {pickedFiles.length === 0
                        ? "Choisir un ou plusieurs fichiers"
                        : pickedFiles.length === 1
                          ? pickedFiles[0].name
                          : `${pickedFiles.length} fichiers sélectionnés`}
                    </span>
                  </Button>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    PDF, JPG, PNG, WEBP, HEIC — 15 Mo max. Photos iPhone acceptées.
                  </p>
                </div>
                {imageUpload.isUploading && imageUpload.stage !== "idle" && (
                  <div className="h-1 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700"
                      style={{ width: `${imageUpload.progress}%` }}
                    />
                  </div>
                )}
                <Button
                  type="button"
                  className="gap-1.5"
                  onClick={() => void handleAiSubmit()}
                  disabled={isWorking || pickedFiles.length === 0}
                >
                  {isWorking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {submitLabel()}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      {submitLabel()}
                    </>
                  )}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {lastResult && (
          <ResultCard
            doc={lastResult.doc}
            result={lastResult.result}
            onDismiss={() => setLastResult(null)}
          />
        )}

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
          {docs.isLoading ? (
            <>
              <PdfSkeleton />
              <PdfSkeleton />
            </>
          ) : !docs.data?.length ? (
            <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] text-muted-foreground/60">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Aucun document analysé</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Importe un PDF ou une photo pour que l'IA l'analyse
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 active:scale-95"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                <Upload className="h-3.5 w-3.5" />
                Importer &amp; analyser
              </button>
            </div>
          ) : (
            <div>
              {docs.data.map((d) => (
                <DocCard key={d.id} doc={d} onDelete={() => aiRemove.mutate(d)} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Section Mes PDF ──────────────────────────────────────────────────── */}
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Mes PDF
          </h2>
          <button
            type="button"
            onClick={() => pdfFileRef.current?.click()}
            disabled={pdfUpload.isPending}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            {pdfUpload.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Ajouter
          </button>
        </div>

        <div
          className={cn(
            "overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl transition-colors duration-200",
            isDragging && "border-primary/50 bg-primary/[0.05]",
          )}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
          }}
          onDrop={handleDrop}
        >
          <input
            ref={pdfFileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => handlePdfFiles(e.target.files)}
          />

          {pdfsLoading ? (
            <>
              <PdfSkeleton />
              <PdfSkeleton />
            </>
          ) : !pdfs?.length ? (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] text-muted-foreground/60">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Aucun PDF</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Glisse un fichier ici ou clique sur&nbsp;Ajouter
                </p>
              </div>
              <button
                type="button"
                onClick={() => pdfFileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 active:scale-95"
              >
                <Upload className="h-3.5 w-3.5" />
                Importer un PDF
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {pdfs.map((pdf) => (
                <PdfRow
                  key={pdf.id}
                  pdf={pdf}
                  onPreview={() => setPreviewPdf(pdf)}
                  onDownload={() => handleDownload(pdf)}
                  onDelete={() => setConfirmDelete(pdf)}
                  isDownloading={downloadingId === pdf.id}
                />
              ))}
            </div>
          )}

          {pdfUpload.isPending && (
            <div className="flex items-center gap-3 border-t border-white/5 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Upload en cours…</span>
            </div>
          )}
        </div>
      </section>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {previewPdf && (
        <PreviewModal pdf={previewPdf} onClose={() => setPreviewPdf(null)} />
      )}
      {confirmDelete && (
        <DeleteModal
          pdf={confirmDelete}
          isPending={pdfRemove.isPending}
          onConfirm={() => {
            pdfRemove.mutate(confirmDelete);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
