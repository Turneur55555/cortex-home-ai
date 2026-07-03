import { useEffect, useState } from "react";
import { Download, FileText, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPdfSignedUrl, type UserPdf } from "@/hooks/use-user-pdfs";
import { fmtSize } from "./helpers";

export function PreviewModal({ pdf, onClose }: { pdf: UserPdf; onClose: () => void }) {
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
