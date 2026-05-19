import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Download,
  FileImage,
  Files,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
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
import { useImageUpload, isImageFile, type UploadStage } from "@/hooks/useImageUpload";
import type { Tables } from "@/integrations/supabase/types";
import { TransferPanel } from "@/features/transfer/components/TransferPanel";
import { parseDocAnalysis } from "@/features/transfer/utils/detectContent";
import type { TransferTarget } from "@/features/transfer/types";
import {
  getPdfSignedUrl,
  useDeletePdf,
  useUploadPdf,
  useUserPdfs,
  type UserPdf,
} from "@/hooks/use-user-pdfs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toTransferTarget(module: DocModule): TransferTarget {
  return module === "documents" ? "nutrition" : (module as TransferTarget);
}

const STAGE_LABELS: Record<UploadStage, string> = {
  idle: "",
  validating: "Vérification…",
  compressing: "Compression…",
  uploading: "Envoi…",
  ocr: "Lecture IA…",
  parsing: "Extraction…",
  done: "Terminé",
  error: "Erreur",
};

// ─── Simple PDF sub-components ────────────────────────────────────────────────

function PdfSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-3 px-4 py-3">
      <div className="h-9 w-9 shrink-0 rounded-xl bg-white/[0.07]" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-3/5 rounded bg-white/[0.07]" />
        <div className="h-2.5 w-2/5 rounded bg-white/[0.05]" />
      </div>
    </div>
  );
}

function PreviewModal({ pdf, onClose }: { pdf: UserPdf; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let active = true;
    getPdfSignedUrl(pdf.file_path)
      .then((u) => { if (active) { setUrl(u); setLoading(false); } })
      .catch(() => { if (active) { setErr(true); setLoading(false); } });
    return () => { active = false; };
  }, [pdf.file_path]);

  const openExternal = () => url && window.open(url, "_blank", "noopener,noreferrer");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/98 backdrop-blur-2xl">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 safe-top">
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-xl hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{pdf.file_name}</p>
          <p className="text-[11px] text-muted-foreground">{fmtSize(pdf.file_size)}</p>
        </div>
        {url && (
          <button
            type="button"
            onClick={openExternal}
            className="flex h-8 w-8 items-center justify-center rounded-xl hover:bg-white/10 transition-colors"
            title="Ouvrir dans l'onglet"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="relative flex-1 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {err && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Aperçu indisponible</p>
            <Button variant="outline" size="sm" onClick={openExternal}>
              Ouvrir dans le navigateur
            </Button>
          </div>
        )}
        {url && !loading && !err && (
          <>
            <iframe
              src={url}
              title={pdf.file_name}
              className="h-full w-full border-0"
              onError={() => setErr(true)}
            />
            <div className="absolute bottom-4 inset-x-0 flex justify-center sm:hidden">
              <button
                type="button"
                onClick={openExternal}
                className="rounded-2xl border border-white/10 bg-card/80 px-4 py-2 text-xs font-medium backdrop-blur"
              >
                Ouvrir dans Safari
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DeleteModal({
  pdf,
  onConfirm,
  onCancel,
  isPending,
}: {
  pdf: UserPdf;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-t-3xl border border-white/10 bg-card p-6 sm:rounded-3xl">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <Trash2 className="h-5 w-5" />
        </div>
        <p className="font-semibold">Supprimer ce PDF ?</p>
        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{pdf.file_name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Cette action est irréversible.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isPending}>
            Annuler
          </Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm} disabled={isPending}>
            {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Supprimer
          </Button>
        </div>
      </div>
    </div>
  );
}

function PdfRow({
  pdf,
  onPreview,
  onDownload,
  onDelete,
  isDownloading,
}: {
  pdf: UserPdf;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
  isDownloading: boolean;
}) {
  return (
    <div className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]">
      <button
        type="button"
        onClick={onPreview}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{pdf.file_name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {fmtSize(pdf.file_size)} · {fmtDate(pdf.created_at)}
          </p>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <button
          type="button"
          onClick={onDownload}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          title="Télécharger"
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
          title="Supprimer"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── AI doc sub-components ────────────────────────────────────────────────────

function ResultCard({
  doc,
  result,
  onDismiss,
}: {
  doc: Tables<"documents">;
  result: AnalysisResult;
  onDismiss: () => void;
}) {
  const items = result.extracted_items ?? [];
  const detected = doc.module as DocModule;

  return (
    <div className="mb-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          Analyse IA — détecté : {MODULE_LABELS[detected] ?? detected}
        </span>
      </div>
      <p className="mt-2 text-sm text-foreground">{result.summary}</p>
      {result.key_insights.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {result.key_insights.map((k, i) => (
            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{k}</span>
            </li>
          ))}
        </ul>
      )}
      {result.alerts.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 p-2.5">
          {result.alerts.map((a, i) => (
            <li key={i} className="flex gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}
      <TransferPanel
        items={items}
        defaultTarget={toTransferTarget(detected)}
        onSuccess={onDismiss}
        className="mt-4"
      />
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDismiss}
          className="min-h-[2.75rem] px-4"
        >
          Fermer
        </Button>
      </div>
    </div>
  );
}

function DocCard({
  doc,
  onDelete,
}: {
  doc: Tables<"documents">;
  onDelete: () => void;
}) {
  const insights = useMemo<string[]>(
    () => (Array.isArray(doc.key_insights) ? (doc.key_insights as string[]) : []),
    [doc.key_insights],
  );
  const alerts = useMemo<string[]>(
    () => (Array.isArray(doc.alerts) ? (doc.alerts as string[]) : []),
    [doc.alerts],
  );
  const extracted = useMemo(() => parseDocAnalysis(doc.analysis), [doc.analysis]);
  const [open, setOpen] = useState(false);
  const detected = doc.module as DocModule;
  const isImageDoc = /\.(jpe?g|png|webp|heic|heif|jpg)$/i.test(doc.storage_path);

  return (
    <div className="border-t border-white/5 first:border-t-0">
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        onClick={() => setOpen((v) => !v)}
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {isImageDoc ? <FileImage className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{doc.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {MODULE_LABELS[detected] ?? doc.module} ·{" "}
            {new Date(doc.created_at).toLocaleDateString("fr-FR")}
          </p>
          {doc.summary && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{doc.summary}</p>
          )}
        </div>
      </button>

      {open && (insights.length > 0 || alerts.length > 0) && (
        <div className="mx-4 mb-2 flex flex-col gap-1.5">
          {insights.map((k, i) => (
            <div key={i} className="flex gap-2 text-xs text-muted-foreground">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" /> {k}
            </div>
          ))}
          {alerts.map((a, i) => (
            <div key={i} className="flex gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {a}
            </div>
          ))}
        </div>
      )}

      <div className="mx-4 mb-3 flex flex-col gap-2">
        <TransferPanel items={extracted} defaultTarget={toTransferTarget(detected)} />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDelete}
            className="flex min-h-[2.75rem] items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

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
