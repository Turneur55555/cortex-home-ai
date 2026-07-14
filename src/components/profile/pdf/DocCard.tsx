import { useMemo, useState } from "react";
import { AlertTriangle, Check, FileImage, Sparkles, Trash2 } from "lucide-react";
import { MODULE_LABELS, type DocModule } from "@/hooks/use-documents";
import type { Tables } from "@/integrations/supabase/types";


export function DocCard({
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
