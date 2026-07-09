import { useRef, useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { Camera, ImageIcon, Loader2, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FullscreenSheet as Sheet } from "@/components/shared/FormComponents";
import { fileToBase64Compressed } from "@/lib/nutrition/utils";
import { MEAL_LABELS, clampMacroSet, isMealSlug } from "@/lib/nutrition/meals";
import { formatDecimal, parseDecimal } from "@/lib/nutrition/portions";
import { useAddNutritionBatch } from "@/hooks/use-fitness";

interface ScanItem {
  name: string;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
}

interface ScanResponse {
  items: ScanItem[];
  meal?: string;
  confidence?: number;
  details?: string;
}

interface MealScanSheetProps {
  onClose: () => void;
  date: string;
}

export function MealScanSheet({ onClose, date }: MealScanSheetProps) {
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [items, setItems] = useState<ScanItem[]>([]);
  const [meal, setMeal] = useState("dejeuner");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const addBatch = useAddNutritionBatch();

  const scan = useMutation({
    mutationFn: async (file: File) => {
      const { b64, mime } = await fileToBase64Compressed(file);
      setPreview(`data:${mime};base64,${b64}`);
      if (!b64 || b64.length < 100) throw new Error("Image vide ou illisible. Réessaie.");
      const { data, error } = await supabase.functions.invoke("scan-meal", {
        body: { image_base64: b64, mime_type: mime },
      });
      if (error) {
        let detail = "";
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            detail = body?.error ?? "";
          }
        } catch {/* ignore */}
        throw new Error(detail || "Erreur de connexion au service IA. Vérifie ta connexion et réessaie.");
      }
      if (data?.error) throw new Error(data.error as string);
      return data as ScanResponse;
    },
    onSuccess: (d) => {
      setScanResult(d);
      setItems(d.items ?? []);
      const detectedMeal = d.meal ?? "";
      setMeal(isMealSlug(detectedMeal) ? detectedMeal : "dejeuner");
      const n = (d.items ?? []).length;
      const conf = d.confidence != null ? ` (${Math.round(d.confidence * 100)}%)` : "";
      toast.success(`${n} aliment${n > 1 ? "s" : ""} détecté${n > 1 ? "s" : ""}${conf}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPick = (f: File | null | undefined) => {
    if (!f) return;
    lastFileRef.current = f;
    setScanResult(null);
    setItems([]);
    setEditingIdx(null);
    scan.mutate(f);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) { setEditingIdx(null); setEditDraft(null); }
  };

  const updateItem = (idx: number, patch: Partial<ScanItem>) =>
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));

  // Brouillon d'édition en chaînes : accepte « 12,5 » (parseDecimal) et
  // n'écrase l'item qu'à la validation, bornes DB appliquées (bugs B4/B9).
  const [editDraft, setEditDraft] = useState<{
    name: string; calories: string; proteins: string; carbs: string; fats: string;
  } | null>(null);

  const startEdit = (idx: number) => {
    const it = items[idx];
    if (!it) return;
    setEditingIdx(idx);
    setEditDraft({
      name: it.name,
      calories: formatDecimal(it.calories),
      proteins: formatDecimal(it.proteins),
      carbs: formatDecimal(it.carbs),
      fats: formatDecimal(it.fats),
    });
  };

  const commitEdit = (idx: number) => {
    if (editDraft) {
      const macros = clampMacroSet({
        calories: parseDecimal(editDraft.calories) ?? 0,
        proteins: parseDecimal(editDraft.proteins) ?? 0,
        carbs: parseDecimal(editDraft.carbs) ?? 0,
        fats: parseDecimal(editDraft.fats) ?? 0,
      });
      updateItem(idx, { name: editDraft.name.trim() || "Aliment", ...macros });
    }
    setEditingIdx(null);
    setEditDraft(null);
  };

  const confirm = () => {
    if (items.length === 0) return;
    addBatch.mutate(
      items.map((item) => {
        // B9 : borne aux contraintes DB avant insertion (l'IA peut halluciner).
        const m = clampMacroSet(item);
        return {
          date,
          meal,
          name: item.name,
          calories: Math.round(m.calories),
          proteins: Math.round(m.proteins * 10) / 10,
          carbs: Math.round(m.carbs * 10) / 10,
          fats: Math.round(m.fats * 10) / 10,
          base_calories: Math.round(m.calories),
          base_proteins: Math.round(m.proteins * 10) / 10,
          base_carbs: Math.round(m.carbs * 10) / 10,
          base_fats: Math.round(m.fats * 10) / 10,
          serving_count: 1,
          percentage_consumed: 100,
        };
      }),
      { onSuccess: () => onClose() },
    );
  };

  const totals = items.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      proteins: acc.proteins + i.proteins,
      carbs: acc.carbs + i.carbs,
      fats: acc.fats + i.fats,
    }),
    { calories: 0, proteins: 0, carbs: 0, fats: 0 },
  );

  return (
    <Sheet title="Scanner mon repas" onClose={onClose}>
      <div className="space-y-4">
        {/* Preview image */}
        {preview && (
          <div className="overflow-hidden rounded-2xl border border-border">
            <img src={preview} alt="Aperçu" className="max-h-64 w-full object-cover" />
          </div>
        )}

        {/* Spinner while scanning */}
        {scan.isPending && (
          <div className="flex flex-col items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Analyse en cours…
          </div>
        )}

        {/* Erreur + retry */}
        {scan.isError && !scan.isPending && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-center">
            <p className="text-sm text-destructive">{(scan.error as Error).message}</p>
            {lastFileRef.current && (
              <button
                type="button"
                onClick={() => { if (lastFileRef.current) scan.mutate(lastFileRef.current); }}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-destructive/10 px-4 text-sm font-semibold text-destructive active:scale-95"
              >
                Réessayer
              </button>
            )}
          </div>
        )}

        {/* Initial state — no preview yet */}
        {!preview && !scan.isPending && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow">
              <Sparkles className="h-7 w-7" />
            </div>
            <p className="text-xs text-muted-foreground">
              L'IA identifie chaque aliment séparément et estime ses macros.
            </p>
          </div>
        )}

        {/* Review panel — detected items */}
        {scanResult && !scan.isPending && items.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              {scanResult.details && (
                <p className="flex-1 text-[11px] italic text-muted-foreground">{scanResult.details}</p>
              )}
              {scanResult.confidence != null && (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  scanResult.confidence >= 0.75
                    ? "bg-green-500/15 text-green-600"
                    : scanResult.confidence >= 0.5
                    ? "bg-yellow-500/15 text-yellow-600"
                    : "bg-red-500/15 text-red-600"
                }`}>
                  {Math.round(scanResult.confidence * 100)}% confiance
                </span>
              )}
            </div>

            <ul className="space-y-2">
              {items.map((item, idx) => (
                <li key={idx} className="rounded-xl border border-border bg-card">
                  {editingIdx === idx ? (
                    <div className="space-y-2 p-3">
                      <input
                        type="text"
                        value={editDraft?.name ?? item.name}
                        onChange={(e) => setEditDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                        autoComplete="off"
                        className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-base outline-none focus:border-primary"
                      />
                      <div className="grid grid-cols-4 gap-1.5">
                        {(["calories", "proteins", "carbs", "fats"] as const).map((field) => (
                          <div key={field}>
                            <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              {field === "calories" ? "kcal" : field === "proteins" ? "prot" : field === "carbs" ? "gluc" : "lip"}
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editDraft?.[field] ?? ""}
                              onChange={(e) => setEditDraft((d) => (d ? { ...d, [field]: e.target.value } : d))}
                              autoComplete="off"
                              className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-base outline-none focus:border-primary"
                            />
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => commitEdit(idx)}
                        className="w-full rounded-lg bg-primary/10 py-3 text-sm font-semibold text-primary active:scale-[0.98]"
                      >
                        Valider
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {Math.round(item.calories)} kcal · P
                          {Math.round(item.proteins * 10) / 10} G
                          {Math.round(item.carbs * 10) / 10} L
                          {Math.round(item.fats * 10) / 10}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEdit(idx)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
                        aria-label="Modifier"
                      >
                        <span className="text-sm">✎</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-destructive/10 active:text-destructive"
                        aria-label="Retirer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {/* Totals */}
            <div className="rounded-xl bg-surface px-3 py-2 text-center text-xs">
              <span className="font-bold text-primary">{Math.round(totals.calories)}</span>{" "}
              kcal · P{Math.round(totals.proteins * 10) / 10} G
              {Math.round(totals.carbs * 10) / 10} L
              {Math.round(totals.fats * 10) / 10}
            </div>

            {/* Meal selector */}
            <select
              value={meal}
              onChange={(e) => setMeal(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {Object.entries(MEAL_LABELS).map(([slug, label]) => (
                <option key={slug} value={slug}>
                  {label}
                </option>
              ))}
            </select>

            {/* Confirm */}
            <button
              type="button"
              onClick={confirm}
              disabled={addBatch.isPending}
              className="inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
            >
              {addBatch.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Ajouter {items.length} aliment{items.length > 1 ? "s" : ""}
            </button>
          </>
        )}

        {/* All items removed */}
        {scanResult && !scan.isPending && items.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            Tous les aliments ont été retirés.
          </p>
        )}

        {/* Hidden file inputs */}
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />

        {/* Photo / Gallery buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={scan.isPending}
            onClick={() => camRef.current?.click()}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            <Camera className="h-4 w-4" />
            {scanResult ? "Nouvelle photo" : "Photo"}
          </button>
          <button
            type="button"
            disabled={scan.isPending}
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface text-xs font-semibold disabled:opacity-60"
          >
            <ImageIcon className="h-4 w-4" />
            Galerie
          </button>
        </div>
      </div>
    </Sheet>
  );
}
