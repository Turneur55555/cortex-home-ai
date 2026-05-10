import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Trash2,
  AlertTriangle,
  Sparkles,
  Loader2,
  Check,
  ChevronDown,
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
import {
  useDocuments,
  useUploadAndAnalyze,
  useDeleteDocument,
  usePourIntoModule,
  MODULE_LABELS,
  MODULE_SELECTION_LABELS,
  type DocModule,
  type DocModuleSelection,
  type AnalysisResult,
} from "@/hooks/use-documents";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Documents — ICORTEX" },
      { name: "description", content: "Analyse IA de vos PDF, déversés vers les modules." },
    ],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const docs = useDocuments();
  const upload = useUploadAndAnalyze();
  const remove = useDeleteDocument();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [module, setModule] = useState<DocModuleSelection>("auto");
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastResult, setLastResult] = useState<{
    doc: Tables<"documents">;
    result: AnalysisResult;
  } | null>(null);

  const handleSubmit = async () => {
    if (pickedFiles.length === 0) return toast.error("Sélectionne au moins un PDF");
    let last: { doc: Tables<"documents">; result: AnalysisResult } | null = null;
    let ok = 0;
    for (let i = 0; i < pickedFiles.length; i++) {
      setProgress({ current: i + 1, total: pickedFiles.length });
      try {
        last = await upload.mutateAsync({ file: pickedFiles[i], module });
        ok++;
      } catch {
        // toast handled in hook
      }
    }
    setProgress(null);
    setLastResult(last);
    setPickedFiles([]);
    setOpen(false);
    if (pickedFiles.length > 1) toast.success(`${ok}/${pickedFiles.length} PDF analysés`);
  };

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 pt-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Importe un PDF — l'IA détecte le bon module et l'analyse pour toi.
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
              <SheetTitle>Importer un PDF</SheetTitle>
            </SheetHeader>
            <div className="mt-5 flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Module cible
                </label>
                <Select value={module} onValueChange={(v) => setModule(v as DocModuleSelection)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) =>
                    setPickedFiles(e.target.files ? Array.from(e.target.files) : [])
                  }
                />
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => fileRef.current?.click()}
                >
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="truncate">
                    {pickedFiles.length === 0
                      ? "Choisir un ou plusieurs PDF"
                      : pickedFiles.length === 1
                        ? pickedFiles[0].name
                        : `${pickedFiles.length} PDF sélectionnés`}
                  </span>
                </Button>
                <p className="mt-1 text-[11px] text-muted-foreground">PDF, 15 Mo max par fichier.</p>
              </div>
              <Button
                className="gap-1.5"
                onClick={handleSubmit}
                disabled={upload.isPending || pickedFiles.length === 0}
              >
                {upload.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {progress
                      ? `Analyse ${progress.current}/${progress.total}…`
                      : "Analyse en cours…"}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Analyser{pickedFiles.length > 1 ? ` ${pickedFiles.length} PDF` : " avec l'IA"}
                  </>
                )}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {lastResult && (
        <ResultCard
          doc={lastResult.doc}
          result={lastResult.result}
          onDismiss={() => setLastResult(null)}
        />
      )}

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
            Aucun PDF analysé pour l'instant.
          </div>
        ) : (
          docs.data.map((d) => (
            <DocCard key={d.id} doc={d} onDelete={() => remove.mutate(d)} />
          ))
        )}
      </section>
    </main>
  );
}

function ResultCard({
  doc,
  result,
  onDismiss,
}: {
  doc: Tables<"documents">;
  result: AnalysisResult;
  onDismiss: () => void;
}) {
  const pourMut = usePourIntoModule();
  const items = result.extracted_items ?? [];
  const targetModule = doc.module as DocModule;

  const pour = async () => {
    if (targetModule === "documents") return toast.info("Aucun déversement pour ce module.");
    try {
      await pourMut.mutateAsync({ module: targetModule, items });
      onDismiss();
    } catch {
      // toast handled in hook
    }
  };
  const pouring = pourMut.isPending;

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4 shadow-glow">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
          Analyse IA — {MODULE_LABELS[targetModule]}
        </span>
      </div>
      <p className="mt-2 text-sm text-foreground">{result.summary}</p>

      {result.key_insights.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {result.key_insights.map((k, i) => (
            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> <span>{k}</span>
            </li>
          ))}
        </ul>
      )}

      {result.alerts.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 p-2.5">
          {result.alerts.map((a, i) => (
            <li key={i} className="flex gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{a}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 rounded-xl bg-surface px-3 py-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{items.length}</span> élément(s) extrait(s)
        prêt(s) à déverser dans <span className="font-semibold text-foreground">{MODULE_LABELS[targetModule]}</span>.
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          className="flex-1 gap-1.5"
          onClick={pour}
          disabled={pouring || items.length === 0 || targetModule === "documents"}
        >
          {pouring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
          Déverser
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>Fermer</Button>
      </div>
    </div>
  );
}

function DocCard({ doc, onDelete }: { doc: Tables<"documents">; onDelete: () => void }) {
  const insights = useMemo<string[]>(
    () => (Array.isArray(doc.key_insights) ? (doc.key_insights as string[]) : []),
    [doc.key_insights],
  );
  const alerts = useMemo<string[]>(
    () => (Array.isArray(doc.alerts) ? (doc.alerts as string[]) : []),
    [doc.alerts],
  );
  const extracted = useMemo<Array<Record<string, unknown>>>(() => {
    if (!doc.analysis) return [];
    try {
      const p = JSON.parse(doc.analysis);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }, [doc.analysis]);
  const [open, setOpen] = useState(false);
  const pourMut = usePourIntoModule();
  const targetModule = doc.module as DocModule;
  const canPour = targetModule !== "documents" && extracted.length > 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-3.5">
      <button
        className="flex w-full items-start gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{doc.name}</p>
          </div>
          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {MODULE_LABELS[doc.module as DocModule] ?? doc.module} ·{" "}
            {new Date(doc.created_at).toLocaleDateString("fr-FR")}
          </p>
          {doc.summary && (
            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{doc.summary}</p>
          )}
        </div>
      </button>

      {open && (
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
          <div className="flex items-center justify-between gap-2">
            {canPour ? (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => pourMut.mutate({ module: targetModule, items: extracted })}
                disabled={pourMut.isPending}
              >
                {pourMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Déverser ({extracted.length}) vers {MODULE_LABELS[targetModule]}
              </Button>
            ) : <span />}
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" /> Supprimer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
