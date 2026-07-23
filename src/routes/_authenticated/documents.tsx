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
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  useDocuments,
  useDeposeDocument,
  useDeleteDocument,
  MODULE_LABELS,
  type DocModule,
  type DepositResult,
  type FitnessJournalEntry,
} from "@/hooks/use-documents";
import { useAddWorkout } from "@/hooks/use-fitness";
import type { Tables } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Documents — ICORTEX" },
      {
        name: "description",
        content: "Analyse IA de vos PDF et photos, déversés automatiquement vers les bons modules.",
      },
    ],
  }),
  validateSearch: z.object({ upload: z.boolean().optional() }),
  component: DocumentsPage,
});

function isImageName(nameOrType: string): boolean {
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(nameOrType) || nameOrType.startsWith("image/");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function DocumentsPage() {
  const { upload: openUploadOnLoad } = Route.useSearch();
  const docs = useDocuments();
  const depose = useDeposeDocument();
  const remove = useDeleteDocument();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(!!openUploadOnLoad);
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [reports, setReports] = useState<Array<{ fileName: string; result: DepositResult }>>([]);

  const handleDeposer = async () => {
    if (pickedFiles.length === 0) return toast.error("Sélectionne au moins un fichier");
    const total = pickedFiles.length;
    const newReports: Array<{ fileName: string; result: DepositResult }> = [];
    let ok = 0;

    for (let i = 0; i < total; i++) {
      setBatchProgress({ current: i + 1, total });
      const file = pickedFiles[i];
      try {
        const result = await depose.mutateAsync(file);
        newReports.push({ fileName: file.name, result });
        ok++;
      } catch {
        // toast d'erreur déjà déclenché par onError du hook — on continue les fichiers suivants
      }
    }

    setBatchProgress(null);
    setReports((prev) => [...newReports, ...prev]);
    if (ok > 0) {
      setPickedFiles([]);
      setOpen(false);
    }
    if (total > 1) toast.success(`${ok}/${total} fichiers déversés`);
  };

  const submitLabel = () => {
    if (depose.isPending && batchProgress) {
      return `Déversement ${batchProgress.current}/${batchProgress.total}…`;
    }
    if (depose.isPending) return "Déversement en cours…";
    return pickedFiles.length > 1 ? `Déverser ${pickedFiles.length} fichiers` : "Déverser";
  };

  return (
    <main className="flex flex-1 flex-col gap-4 px-4 pt-[max(1.75rem,calc(env(safe-area-inset-top)+0.5rem))]">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Importe un PDF ou une photo — l'IA détecte le(s) module(s) concerné(s) et déverse les
            données automatiquement.
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
                    isImageName(pickedFiles[0].name) || pickedFiles[0].type.startsWith("image/") ? (
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

              {/* Le bouton reste toujours visible et cliquable — jamais remplacé
                  par la barre de progression (régression corrigée : voir historique
                  du module). */}
              <Button
                type="button"
                className="gap-1.5"
                onClick={() => void handleDeposer()}
                disabled={depose.isPending || pickedFiles.length === 0}
              >
                {depose.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {submitLabel()}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* ── Rapports de déversement (les plus récents en premier) ────────────── */}
      {reports.length > 0 && (
        <section className="flex flex-col gap-3">
          {reports.map((r, i) => (
            <DepositReportCard
              key={`${r.fileName}-${i}`}
              fileName={r.fileName}
              result={r.result}
              onDismiss={() => setReports((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
        </section>
      )}

      {/* ── Historique ─────────────────────────────────────────────────────── */}
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

// ─── Rapport de déversement (après clic sur "Déverser") ───────────────────────

const MODULE_TABLE_LABELS: Record<string, string> = {
  body: "Mesures corporelles",
  nutrition: "Nutrition",
  supplements: "Santé (compléments)",
  fitness_template: "Séances (modèle)",
};

function DepositReportCard({
  fileName,
  result,
  onDismiss,
}: {
  fileName: string;
  result: DepositResult;
  onDismiss: () => void;
}) {
  const { analysis, report } = result;
  const addWorkout = useAddWorkout();
  const [confirmedJournal, setConfirmedJournal] = useState<Set<number>>(new Set());

  const touchedModules = Object.keys(report) as Array<keyof typeof report>;
  const detectedLabels = (analysis.detected_modules ?? [])
    .map((m) => MODULE_LABELS[m as DocModule] ?? m)
    .join(", ");
  const journalEntries: FitnessJournalEntry[] = analysis.modules?.fitness_journal ?? [];

  const handleConfirmJournal = async (entry: FitnessJournalEntry, idx: number) => {
    try {
      await addWorkout.mutateAsync({
        name: entry.name,
        date: entry.date ?? new Date().toISOString().slice(0, 10),
        duration_minutes: entry.duration_minutes ?? null,
        notes: entry.notes ?? null,
        exercises: (entry.exercises ?? []).map((ex) => ({
          name: ex.name,
          sets: ex.sets ?? null,
          reps: ex.reps ?? null,
          weight: ex.weight ?? null,
        })),
      });
      setConfirmedJournal((prev) => new Set(prev).add(idx));
      toast.success("Séance ajoutée à l'historique");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de créer la séance");
    }
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {fileName}
            </p>
            {detectedLabels && (
              <p className="text-[11px] text-muted-foreground">Classé : {detectedLabels}</p>
            )}
          </div>
        </div>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onDismiss}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <p className="mt-2 text-sm text-foreground">{analysis.summary}</p>

      {analysis.key_insights.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {analysis.key_insights.map((k, i) => (
            <li key={i} className="flex gap-2 text-xs text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{k}</span>
            </li>
          ))}
        </ul>
      )}

      {analysis.alerts.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 rounded-xl border border-destructive/30 bg-destructive/5 p-2.5">
          {analysis.alerts.map((a, i) => (
            <li key={i} className="flex gap-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}

      {/* ── Détail du déversement, module par module ───────────────────────── */}
      {touchedModules.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Déversement
          </p>
          {touchedModules.map((mod) => {
            const modReport = report[mod];
            if (!modReport) return null;
            return (
              <div key={mod} className="rounded-xl bg-white/[0.03] p-2.5">
                <p className="text-xs font-semibold text-foreground">
                  {MODULE_TABLE_LABELS[mod] ?? mod}
                </p>
                {modReport.written.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {modReport.written.map((w, i) => (
                      <li key={i} className="flex gap-1.5 text-xs text-muted-foreground">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                        <span>
                          {(w.name as string) ?? (w.date as string) ?? "Ligne créée"}
                          {w.table ? ` (${w.table})` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {modReport.skipped.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {modReport.skipped.map((s, i) => (
                      <li key={i} className="flex gap-1.5 text-xs text-amber-500">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{s.reason as string}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Journal de séance détecté : jamais auto-inséré, confirmation requise ── */}
      {journalEntries.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Séance réalisée détectée — à confirmer
          </p>
          {journalEntries.map((entry, idx) => (
            <div key={idx} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] p-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">{entry.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {entry.date ? `${entry.date} · ` : ""}
                  {(entry.exercises ?? []).length} exercice(s)
                </p>
              </div>
              {confirmedJournal.has(idx) ? (
                <span className="shrink-0 text-xs text-primary">Ajoutée ✓</span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={addWorkout.isPending}
                  onClick={() => void handleConfirmJournal(entry, idx)}
                >
                  Créer cette séance
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {touchedModules.length === 0 && journalEntries.length === 0 && (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          Aucun module métier dédié pour ce contenu — document classé et archivé, aucune donnée
          déversée.
        </p>
      )}
    </div>
  );
}

// ─── Historique ─────────────────────────────────────────────────────────────

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
  const isImageDoc = isImageName(doc.storage_path);

  return (
    <div className="rounded-2xl border border-border bg-surface p-3.5">
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

      <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
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
