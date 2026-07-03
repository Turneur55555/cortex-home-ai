import { Download, FileText, Loader2, Trash2 } from "lucide-react";
import type { UserPdf } from "@/hooks/use-user-pdfs";
import { fmtDate, fmtSize } from "./helpers";

export function PdfRow({
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
