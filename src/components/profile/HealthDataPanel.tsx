import { useRef, useState } from "react";
import { Download, Upload, Loader2, FileJson, FileSpreadsheet, HeartPulse } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { parseAppleHealthZip, type ParseResult } from "@/lib/health/appleHealth";
import { importAppleHealth } from "@/lib/health/importAppleHealth";
import { exportJson, exportCsvZip } from "@/lib/health/exportData";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function HealthDataPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "import" | "json" | "csv">(null);
  const [progress, setProgress] = useState<string>("");
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onPickFile = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) {
      toast.error("Archive trop volumineuse (max 500 Mo).");
      return;
    }
    setBusy("import");
    setProgress("Lecture du fichier…");
    try {
      const parsed = await parseAppleHealthZip(file, (m) => setProgress(m));
      setPreview(parsed);
      setConfirmOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de lecture");
    } finally {
      setBusy(null);
      setProgress("");
    }
  };

  const runImport = async () => {
    if (!preview || !user) return;
    setBusy("import");
    setProgress("Import en cours…");
    try {
      const res = await importAppleHealth(preview, user.id);
      const total = res.body + res.workouts + res.activity;
      if (total === 0) toast.info("Aucune nouvelle donnée à importer.");
      else
        toast.success(
          `Import réussi : ${res.body} mesures, ${res.workouts} séances, ${res.activity} jours d'activité.`,
        );
      if (res.errors.length) console.warn("Import errors:", res.errors);
      await qc.invalidateQueries();
      setConfirmOpen(false);
      setPreview(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d'import");
    } finally {
      setBusy(null);
      setProgress("");
    }
  };

  const doJson = async () => {
    if (!user) return;
    setBusy("json");
    try {
      const n = await exportJson(user.id, user.email);
      toast.success(`Export JSON téléchargé (${n} enregistrements).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur export");
    } finally {
      setBusy(null);
    }
  };

  const doCsv = async () => {
    if (!user) return;
    setBusy("csv");
    try {
      const n = await exportCsvZip(user.id);
      toast.success(`Export CSV téléchargé (${n} enregistrements).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur export");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mb-5">
      <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          onChange={onFile}
          className="hidden"
        />

        <button
          type="button"
          onClick={onPickFile}
          disabled={busy !== null}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] disabled:opacity-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/15 text-red-400">
            {busy === "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HeartPulse className="h-3.5 w-3.5" />}
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium">Importer depuis Apple Santé</span>
            <span className="block text-xs text-muted-foreground">
              {busy === "import" && progress ? progress : "Archive export.zip depuis l'app Santé"}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={doJson}
          disabled={busy !== null}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] disabled:opacity-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
            {busy === "json" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileJson className="h-3.5 w-3.5" />}
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium">Exporter en JSON</span>
            <span className="block text-xs text-muted-foreground">Toutes vos données dans un fichier</span>
          </span>
          <Download className="h-4 w-4 text-muted-foreground" />
        </button>

        <button
          type="button"
          onClick={doCsv}
          disabled={busy !== null}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] disabled:opacity-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            {busy === "csv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium">Exporter en CSV (Excel, Strava…)</span>
            <span className="block text-xs text-muted-foreground">Archive ZIP, un fichier par table</span>
          </span>
          <Download className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <p className="mt-2 px-1 text-[11px] leading-snug text-muted-foreground">
        <Upload className="mr-1 inline h-3 w-3" />
        Pour Apple Santé : app Santé → profil → « Exporter toutes les données santé ». Puis importez le fichier
        <span className="mx-1 font-mono text-[10px]">export.zip</span>ici.
      </p>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer l'import Apple Santé</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-2">
                {preview ? (
                  <ul className="space-y-1 text-sm text-foreground">
                    <li>• {preview.body.length} mesures corporelles (poids, masse grasse, muscle)</li>
                    <li>• {preview.workouts.length} séances</li>
                    <li>• {preview.activity.length} jours d'activité (pas, cardio, calories)</li>
                  </ul>
                ) : null}
                <p className="pt-2 text-xs text-muted-foreground">
                  Les doublons de dates existantes seront ignorés. L'import peut prendre 1-2 minutes.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="rounded-md border border-white/10 px-4 py-2 text-sm"
              disabled={busy === "import"}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={runImport}
              disabled={busy === "import"}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy === "import" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirmer l'import
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
