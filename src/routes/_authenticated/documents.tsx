import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  FileImage,
  Files,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Documents — ICORTEX" },
      {
        name: "description",
        content: "Analyse IA de vos PDF et photos, déversés vers les modules.",
      },
    ],
  }),
  validateSearch: z.object({ upload: z.boolean().optional() }),
  component: DocumentsPage,
});

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


// ─── Page ─────────────────────────────────────────────────────────────────────

function DocumentsPage() {
  const { upload: openUploadOnLoad } = Route.useSearch();
  const docs = useDocuments();
  const upload = useUploadAndAnalyze();
  const imageUpload = useImageUpload();
  const remove = useDeleteDocument();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(!!openUploadOnLoad);
  const [module, setModule] = useState<DocModuleSelection>("auto");
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [lastResult, setLastResult] = useState<{
    doc: Tables<"documents">;
    result: AnalysisResult;
  } | null>(null);

  const isWorking = upload.isPending || imageUpload.isUploading;

  const handleSubmit = async () => {
    if (pickedFiles.length === 0) return toast.error("Sélectionne au moins un fichier");
    let last: { doc: Tables<"documents">; result: AnalysisResult } | null = null;
    let ok = 0;

    for (let i = 0; i < pickedFiles.length; i++) {
      setBatchProgress({ current: i + 1, total: pickedFiles.length });
      const file = pickedFiles[i];
      try {
        if (isImageFile(file)) {
          const res = await imageUpload.upload(file, module);
          if (res) {
            last = { doc: res.doc, result: res.result };
            if (res.wasAuto) {
              toast.success(
                `Image analysée — détecté: ${MODULE_LABELS[res.detectedModule as DocModule] ?? res.detectedModule}`,
              );
            } else {
              toast.success("Image analysée");
            }
            ok++;
          }
        } else {
          const res = await upload.mutateAsync({ file, module });
          if (res) {
            last = { doc: res.doc, result: res.result };
            ok++;
          }
        }
      } catch {
        // toast handled in hooks
      }
    }

    setBatchProgress(null);
    setLastResult(last);
    setPickedFiles([]);
    setOpen(false);
    if (pickedFiles.length > 1) toast.success(`${ok}/${pickedFiles.length} fichiers analysés`);
  };

  const submitLabel = () => {
    if (imageUpload.isUploading && imageUpload.stage !== "idle") {
      const stageLabel = STAGE_LABELS[imageUpload.stage] || "Analyse…";
      if (batchProgress) return `${stageLabel} (${batchProgress.current}/${batchProgress.total})`;
      return stageLabel;
    }
    if (upload.isPending) {
      if (batchProgress) return `Analyse ${batchProgress.current}/${batchProgress.total}…`;
      return "Analyse en cours…";
    }
    return pickedFiles.length > 1
      ? `Analyser ${pickedFiles.length} fichiers`
      : "Analyser avec l'IA";
  };

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 pt-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Importe un PDF ou une photo — l'IA détecte le bon module et l'analyse.
          </p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Upload className="h-4 w-4" /> Importer
            </Button>
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
                <Select value={module} onValueChange={(v) => setModule(v as DocModuleSelection)}>
                  <SelectTrigger style={{ WebkitTapHighlightColor: "transparent" }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MODULE_SELECTION_LABELS) as DocModuleSelection[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {MODULE_SELECTION_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Laisse sur « Détection automatique » pour que l'IA choisisse.
                </p>
              </div>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
                  multiple
                  className="hidden"
                  onChange={(e) => setPickedFiles(e.target.files ? Array.from(e.target.files) : [])}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => fileRef.current?.click()}
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
                onClick={() => void handleSubmit()}
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
      </header>

      {/* ── Last result card ───────────────────────────────────────────────── */}
      {lastResult && (
        <ResultCard
          doc={lastResult.doc}
          result={lastResult.result}
          onDismiss={() => setLastResult(null)}
        />
      )}

      {/* ── History ────────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2 pb-6">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Historique
        </h2>
        {docs.isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !docs.data?.length ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted-foreground">
            Aucun document analysé pour l'instant.
          </div>
        ) : (
          docs.data.map((d) => <DocCard key={d.id} doc={d} onDelete={() => remove.mutate(d)} />)
        )}
      </section>
    </main>
  );
}

// ─── Result card (after fresh upload) ─────────────────────────────────────────

function ResultCard({
  doc,
  result,
  onDismiss,
}: {
  doc: Tables<"documents">;
  result: AnalysisResult;
  onDismiss: () => void;
}) {
  const detected = doc.module as DocModule;

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          Analyse IA — détecté : {MODULE_LABELS[detected] ?? detected}
        </span>
      </div>

      {/* Summary */}
      <p className="mt-2 text-sm text-foreground">{result.summary}</p>

      {/* Insights */}
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

      {/* Alerts */}
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




      {/* Dismiss */}
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

// ─── History card ─────────────────────────────────────────────────────────────

function DocCard({ doc, onDelete }: { doc: Tables<"documents">; onDelete: () => void }) {
  const insights = useMemo<string[]>(
    () => (Array.isArray(doc.key_insights) ? (doc.key_insights as string[]) : []),
    [doc.key_insights],
  );
  const alerts = useMemo<string[]>(
    () => (Array.isArray(doc.alerts) ? (doc.alerts as string[]) : []),
    [doc.alerts],
  );
  

  const [open, setOpen] = useState(false);
  const detected = doc.module as DocModule;
  const isImageDoc = /\.(jpe?g|png|webp|heic|heif|jpg)$/i.test(doc.storage_path);

  return (
    <div className="rounded-2xl border border-border bg-surface p-3.5">
      {/* ── Clickable header ─────────────────────────────────────────────── */}
      <button
        type="button"
        className="flex w-full items-start gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          {isImageDoc ? <FileImage className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{doc.name}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {MODULE_LABELS[detected] ?? doc.module} ·{" "}
            {new Date(doc.created_at).toLocaleDateString("fr-FR")}
          </p>
          {doc.summary && (
            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{doc.summary}</p>
          )}
        </div>
      </button>

      {/* ── Expandable insights / alerts ─────────────────────────────────── */}
      {open && (insights.length > 0 || alerts.length > 0) && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          {insights.length > 0 && (
            <ul className="flex flex-col gap-1">
              {insights.map((k, i) => (
                <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" /> {k}
                </li>
              ))}
            </ul>
          )}
          {alerts.length > 0 && (
            <ul className="flex flex-col gap-1">
              {alerts.map((a, i) => (
                <li key={i} className="flex gap-2 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Actions — toujours visibles ───────────────────────────────────── */}
      <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
        <TransferPanel items={extracted} defaultTarget={toTransferTarget(detected)} />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-[2.75rem] gap-1.5 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" /> Supprimer
          </Button>
        </div>
      </div>
    </div>
  );
}
