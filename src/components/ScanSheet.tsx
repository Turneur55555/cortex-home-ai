import { useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, Sparkles, Trash2, X, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STOCK_MODULE_LABELS, type StockModule } from "@/hooks/use-stocks";

type DetectedItem = {
  name: string;
  category?: string;
  quantity?: number;
  unit?: string;
  location?: string;
  expiration_date?: string;
  confidence?: number;
};

async function fileToBase64(file: File): Promise<{ b64: string; mime: string }> {
  // Compress: load into canvas, max 1600px, JPEG q 0.85
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const max = 1600;
  const ratio = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", 0.85);
  const b64 = out.split(",")[1] ?? "";
  return { b64, mime: "image/jpeg" };
}

export function ScanSheet({ module, onClose }: { module: StockModule; onClose: () => void }) {
  const qc = useQueryClient();
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [items, setItems] = useState<DetectedItem[] | null>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  const scan = useMutation({
    mutationFn: async (file: File) => {
      const { b64, mime } = await fileToBase64(file);
      setPreview(`data:${mime};base64,${b64}`);
      const { data, error } = await supabase.functions.invoke("scan-fridge", {
        body: { image_base64: b64, mime_type: mime, module },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return (data?.extracted_items ?? []) as DetectedItem[];
    },
    onSuccess: (list) => {
      setItems(list);
      setSkipped(new Set());
      if (list.length === 0) toast.info("Aucun item détecté sur la photo");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!items) return 0;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const rows = items
        .map((it, idx) => ({ it, idx }))
        .filter(({ idx }) => !skipped.has(idx))
        .map(({ it }) => ({
          user_id: user.id,
          module,
          name: it.name,
          category: (it.category ?? "autre").toString(),
          quantity: Math.max(1, Math.round(it.quantity ?? 1)),
          unit: it.unit ?? null,
          location: it.location ?? null,
          expiration_date: it.expiration_date ?? null,
        }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("items").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      if (n > 0) {
        toast.success(`${n} item(s) ajouté(s)`);
        qc.invalidateQueries({ queryKey: ["items", module] });
        qc.invalidateQueries({ queryKey: ["alerts_items"] });
        qc.invalidateQueries({ queryKey: ["dashboard_stats"] });
        onClose();
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPick = (f: File | null | undefined) => {
    if (!f) return;
    setItems(null);
    scan.mutate(f);
  };

  const updateItem = (idx: number, patch: Partial<DetectedItem>) => {
    setItems((cur) => (cur ? cur.map((it, i) => (i === idx ? { ...it, ...patch } : it)) : cur));
  };
  const toggleSkip = (idx: number) =>
    setSkipped((s) => {
      const n = new Set(s);
      if (n.has(idx)) n.delete(idx);
      else n.add(idx);
      return n;
    });

  const keptCount = items ? items.length - skipped.size : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-[430px] flex-col rounded-t-3xl border border-border bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Scanner IA
            </p>
            <h2 className="text-lg font-bold">{STOCK_MODULE_LABELS[module]}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!preview && !items && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow">
                <Sparkles className="h-9 w-9" />
              </div>
              <div>
                <p className="text-sm font-semibold">Prends une photo de ton frigo</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  L'IA identifie automatiquement les produits visibles.
                </p>
              </div>
            </div>
          )}

          {preview && (
            <div className="mb-4 overflow-hidden rounded-2xl border border-border">
              <img src={preview} alt="Aperçu" className="max-h-64 w-full object-cover" />
            </div>
          )}

          {scan.isPending && (
            <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Analyse en cours…
            </div>
          )}

          {items && items.length > 0 && (
            <div className="space-y-2">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {keptCount} / {items.length} à ajouter
              </p>
              {items.map((it, idx) => {
                const skip = skipped.has(idx);
                return (
                  <div
                    key={idx}
                    className={
                      "rounded-2xl border p-3 transition-opacity " +
                      (skip ? "border-border bg-surface opacity-50" : "border-border bg-card")
                    }
                  >
                    <div className="flex items-start gap-2">
                      <input
                        value={it.name}
                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                        disabled={skip}
                        className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm font-semibold outline-none focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => toggleSkip(idx)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={skip ? "Réinclure" : "Exclure"}
                      >
                        {skip ? <Plus className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <input
                        value={it.category ?? ""}
                        onChange={(e) => updateItem(idx, { category: e.target.value })}
                        disabled={skip}
                        placeholder="Catégorie"
                        className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
                      />
                      <input
                        type="number"
                        min={1}
                        value={it.quantity ?? 1}
                        onChange={(e) =>
                          updateItem(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })
                        }
                        disabled={skip}
                        placeholder="Qté"
                        className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
                      />
                      <input
                        type="date"
                        value={it.expiration_date ?? ""}
                        onChange={(e) => updateItem(idx, { expiration_date: e.target.value })}
                        disabled={skip}
                        className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    {it.confidence != null && (
                      <p className="mt-1.5 text-[10px] text-muted-foreground">
                        Confiance : {Math.round((it.confidence ?? 0) * 100)}%
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {items && items.length === 0 && !scan.isPending && (
            <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted-foreground">
              Aucun item identifié. Réessaie avec une meilleure photo.
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
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

          {items && items.length > 0 ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setItems(null);
                  setPreview(null);
                  camRef.current?.click();
                }}
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface text-xs font-semibold"
              >
                <Camera className="h-4 w-4" />
                Nouvelle photo
              </button>
              <button
                type="button"
                disabled={save.isPending || keptCount === 0}
                onClick={() => save.mutate()}
                className="inline-flex h-11 flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
              >
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Ajouter {keptCount}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={scan.isPending}
                onClick={() => camRef.current?.click()}
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
              >
                <Camera className="h-4 w-4" />
                Photo
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
          )}
        </div>
      </div>
    </div>
  );
}
