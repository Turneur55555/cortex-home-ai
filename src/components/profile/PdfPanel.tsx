import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

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

// ─── Preview modal ─────────────────────────────────────────────────────────────

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
      {/* Header */}
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

      {/* Body */}
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
            {/* iframe pour desktop — sur iOS cela déclenche le lecteur natif */}
            <iframe
              src={url}
              title={pdf.file_name}
              className="h-full w-full border-0"
              onError={() => setErr(true)}
            />
            {/* Bouton de secours visible sur mobile si l'iframe ne rend pas */}
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

// ─── Delete confirmation ───────────────────────────────────────────────────────

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
          <Button
            variant="destructive"
            className="flex-1"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Supprimer
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── PDF row ──────────────────────────────────────────────────────────────────

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

      {/* Actions — toujours visibles sur mobile, hover sur desktop */}
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

// ─── Main panel ───────────────────────────────────────────────────────────────

export function PdfPanel() {
  const { data: pdfs, isLoading } = useUserPdfs();
  const upload = useUploadPdf();
  const remove = useDeletePdf();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<UserPdf | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserPdf | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      const pdf = Array.from(files).find(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
      );
      if (pdf) upload.mutate(pdf);
    },
    [upload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
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

  return (
    <>
      <section className="mb-5">
        {/* Section header */}
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Mes PDF
          </h2>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            {upload.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Ajouter
          </button>
        </div>

        {/* Card glassmorphism */}
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
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {/* Drag overlay hint */}
          {isDragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary/60">
              <p className="text-sm font-medium text-primary">Déposer le PDF ici</p>
            </div>
          )}

          {/* Content */}
          {isLoading ? (
            <>
              <PdfSkeleton />
              <PdfSkeleton />
            </>
          ) : !pdfs?.length ? (
            /* Empty state */
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
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 active:scale-95"
              >
                <Upload className="h-3.5 w-3.5" />
                Importer un PDF
              </button>
            </div>
          ) : (
            /* PDF list */
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

          {/* Upload progress row */}
          {upload.isPending && (
            <div className="flex items-center gap-3 border-t border-white/5 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Upload en cours…</span>
            </div>
          )}
        </div>
      </section>

      {/* Modals */}
      {previewPdf && (
        <PreviewModal pdf={previewPdf} onClose={() => setPreviewPdf(null)} />
      )}
      {confirmDelete && (
        <DeleteModal
          pdf={confirmDelete}
          isPending={remove.isPending}
          onConfirm={() => {
            remove.mutate(confirmDelete);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
