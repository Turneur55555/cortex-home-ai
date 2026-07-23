import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Camera, Loader2, History, ChevronRight, AlertCircle, Package, Apple } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { Result } from "@zxing/library";
import { toast } from "sonner";
// useAddStockItem removed: Maison/stocks module deleted.
import { useAddNutrition } from "@/hooks/use-fitness";
import { FullscreenSheet as Sheet } from "@/components/shared/FormComponents";
import { format } from "date-fns";
import { computeMacros, type ProductNutriments } from "@/lib/nutrition/macros";
import { lookupBarcode } from "@/services/foodCatalog";
import { WeightSelector, type WeightChange } from "@/components/fitness/WeightSelector";
import type { FoodSuggestion } from "@/services/foodSuggestion";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  barcode: string;
  product_name?: string;
  brands?: string;
  image_front_small_url?: string;
  nutrition_grades?: string;
  quantity?: string;
  serving_size?: string;
  nutriments?: ProductNutriments;
  nova_group?: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const NUTRISCORES: Record<string, { color: string }> = {
  a: { color: "#1a9851" },
  b: { color: "#91cf60" },
  c: { color: "#fee08b" },
  d: { color: "#fc8d59" },
  e: { color: "#d73027" },
};

/**
 * Grammage suggéré à l'ouverture d'un produit — dérivé de la mention
 * fabricant (« 330 ml », « 500 g », « 6 x 33 cl »…). Purement une valeur de
 * départ pour le sélecteur de poids ; jamais une unité proposée à l'utilisateur.
 */
function suggestInitialGrams(raw: string | undefined): number {
  if (!raw) return 100;
  const cleaned = raw.replace(/^\d+\s*[x×]\s*/i, "").trim();
  const m = cleaned.match(/^([\d.,]+)\s*(ml|g|cl|l|kg|oz)?/i);
  if (!m) return 100;
  const num = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(num) || num <= 0) return 100;
  const unit = (m[2] ?? "g").toLowerCase();
  switch (unit) {
    case "l":
      return Math.round(num * 1000);
    case "kg":
      return Math.round(num * 1000);
    case "cl":
      return Math.round(num * 10);
    default:
      return Math.round(num);
  }
}

// ─── Main component ────────────────────────────────────────────────────────────

export function BarcodeScannerSheet({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [history, setHistory] = useState<Product[]>([]);
  const [camStatus, setCamStatus] = useState<"idle" | "active" | "denied">("idle");

  const [weight, setWeight] = useState<WeightChange | null>(null);

  const addNutrition = useAddNutrition();

  // Référence /100 g — toujours correcte quel que soit le poids consommé
  // (corrige l'ancien bug où base_* dépendait de la portion sélectionnée).
  const per100 = useMemo(
    () => (product ? computeMacros(product.nutriments, 100) : null),
    [product],
  );

  const pseudoFood: FoodSuggestion | null = useMemo(() => {
    if (!product || !per100) return null;
    const initialGrams = suggestInitialGrams(product.quantity ?? product.serving_size);
    return {
      id: product.barcode,
      name: product.product_name || "Produit",
      calories: per100.calories,
      proteins: per100.proteins,
      carbs: per100.carbs,
      fats: per100.fats,
      source: "custom",
      default_serving:
        initialGrams !== 100 ? { label: "", unit: "g", quantity: 1, grams: initialGrams } : null,
    };
  }, [product, per100]);

  const stopCamera = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      /* ignore */
    }
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks()?.forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
    setCamStatus("idle");
  }, []);

  const fetchProduct = useCallback(async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;

    // Annuler tout fetch précédent encore en cours
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setError(null);
    setProduct(null);
    setWeight(null);
    setLoading(true);
    try {
      const result = await lookupBarcode(code);
      if (controller.signal.aborted) return;
      if (!result) {
        setError(`Produit introuvable : ${code}`);
        toast.error("Produit introuvable");
      } else {
        const p: Product = {
          barcode: code,
          product_name: result.name,
          brands: result.brand,
          image_front_small_url: result.image_url,
          nutriments: result.nutriments as ProductNutriments | undefined,
        };
        setProduct(p);
        setHistory((h) => {
          const filtered = h.filter((x) => x.barcode !== code);
          return [p, ...filtered].slice(0, 8);
        });
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError("Erreur réseau");
      toast.error("Erreur lors de la récupération du produit");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  const handleManual = () => {
    if (manualCode.trim()) {
      stopCamera();
      fetchProduct(manualCode.trim());
      setManualCode("");
    }
  };

  const startCamera = useCallback(async () => {
    setError(null);
    setProduct(null);
    try {
      setCamStatus("active");
      setScanning(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      videoRef.current.setAttribute("playsinline", "true");
      await videoRef.current.play();
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      controlsRef.current = await readerRef.current.decodeFromStream(
        stream,
        videoRef.current,
        (result: Result | undefined) => {
          if (result) {
            const code = result.getText();
            stopCamera();
            fetchProduct(code);
          }
        },
      );
    } catch {
      setCamStatus("denied");
      setScanning(false);
      setError("Accès caméra refusé");
      toast.error("Accès caméra refusé");
    }
  }, [fetchProduct, stopCamera]);

  useEffect(() => {
    readerRef.current = new BrowserMultiFormatReader();
    return () => {
      stopCamera();
      fetchAbortRef.current?.abort(); // Annuler tout fetch en cours au démontage
    };
  }, [stopCamera]);

  // handleAddToStock removed: Maison/stocks module deleted.

  const handleAddToNutrition = async () => {
    if (!product || !per100 || !weight) return;
    try {
      await addNutrition.mutateAsync({
        date: format(new Date(), "yyyy-MM-dd"),
        name: `${product.product_name || "Produit"} (${Math.round(weight.grams)} g)`,
        meal: "collation",
        calories: weight.calories,
        proteins: weight.proteins,
        carbs: weight.carbs,
        fats: weight.fats,
        base_calories: per100.calories,
        base_proteins: per100.proteins,
        base_carbs: per100.carbs,
        base_fats: per100.fats,
        consumed_quantity: weight.grams,
        consumed_unit: "g",
        consumed_grams_per_unit: null,
        serving_count: 1,
        percentage_consumed: 100,
      });
      toast.success("Ajouté à la nutrition");
      onClose();
    } catch {
      // error handled via toast in mutateAsync
    }
  };

  const scoreKey = product?.nutrition_grades?.toLowerCase() ?? "";

  return (
    <Sheet title="Scanner un code-barres" onClose={onClose}>
      <div className="flex flex-col gap-5">
        {/* Camera viewport */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-black">
          {scanning ? (
            <>
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <div className="absolute inset-x-[10%] top-1/2 h-0.5 animate-[scan_2s_ease-in-out_infinite] bg-primary shadow-[0_0_8px_var(--color-primary)]" />
              <div className="absolute inset-4 rounded-lg border-2 border-primary/30 pointer-events-none" />
              <p className="absolute inset-x-0 bottom-4 text-center text-[10px] uppercase tracking-widest text-white/70">
                Pointez le code-barres
              </p>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-elevated">
                <Camera className="h-8 w-8" />
              </div>
              <p className="text-sm font-medium">
                {camStatus === "denied" ? "Caméra non autorisée" : "Caméra inactive"}
              </p>
              <button
                onClick={startCamera}
                className="mt-2 rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow active:scale-95 transition-transform"
              >
                Activer le scan
              </button>
            </div>
          )}
        </div>

        {/* Manual entry */}
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Saisie manuelle (ex: 3017624010701)"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManual()}
            className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={handleManual}
            className="rounded-xl border border-border bg-surface-elevated px-4 py-2 text-xs font-bold hover:bg-muted"
          >
            OK
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm">Recherche du produit…</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Product card */}
        {product && !loading && pseudoFood && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-3">
            {/* Header produit */}
            <div className="rounded-2xl border border-border bg-surface p-4 shadow-elevated">
              <div className="flex gap-4">
                {product.image_front_small_url ? (
                  <img
                    src={product.image_front_small_url}
                    alt={product.product_name}
                    className="h-16 w-16 rounded-xl border border-border bg-white object-contain"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-muted">
                    <Package className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold leading-tight truncate">
                    {product.product_name || "Nom inconnu"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {product.brands || "Marque inconnue"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {scoreKey && NUTRISCORES[scoreKey] && (
                      <span
                        className="inline-flex h-6 items-center px-2 rounded-md text-[10px] font-black text-white uppercase"
                        style={{ background: NUTRISCORES[scoreKey].color }}
                      >
                        Nutri-Score {product.nutrition_grades!.toUpperCase()}
                      </span>
                    )}
                    {product.nova_group && (
                      <span className="inline-flex h-6 items-center px-2 rounded-md bg-secondary text-[10px] font-bold text-secondary-foreground uppercase">
                        Nova {product.nova_group}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Sélecteur de poids — même moteur que la saisie manuelle */}
            <WeightSelector food={pseudoFood} onChange={setWeight} />

            {/* Référence 100g */}
            {per100?.calories != null && (
              <p className="text-center text-[10px] text-muted-foreground">
                Référence : {per100.calories} kcal · {per100.proteins}g prot · {per100.carbs}g gluc
                · {per100.fats}g lip pour 100 g
              </p>
            )}

            {/* Macros recalculées */}
            {weight && (
              <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated">
                <p className="px-4 pt-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Valeurs pour {Math.round(weight.grams)} g
                </p>
                <div className="mt-2 grid grid-cols-4 gap-px bg-border">
                  {[
                    { label: "Kcal", val: weight.calories, color: "text-orange-400" },
                    { label: "Prot", val: weight.proteins, color: "text-blue-400" },
                    { label: "Gluc", val: weight.carbs, color: "text-emerald-400" },
                    { label: "Lip", val: weight.fats, color: "text-yellow-400" },
                  ].map((m, i) => (
                    <div key={i} className="bg-surface py-3 text-center">
                      <span className={`block text-lg font-black tabular-nums ${m.color}`}>
                        {m.val != null ? m.val : "—"}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                        {m.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div>
              <button
                onClick={handleAddToNutrition}
                disabled={addNutrition.isPending || !weight}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary py-3 text-xs font-bold text-primary-foreground shadow-glow disabled:opacity-60"
              >
                {addNutrition.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Apple className="h-4 w-4" />
                )}
                + Ajouter à la nutrition
              </button>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="mt-2">
            <div className="mb-2 flex items-center gap-2 px-1">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Historique récent
              </h3>
            </div>
            <div className="space-y-2">
              {history.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => setProduct(item)}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface/50 p-2 text-left hover:border-primary/50 transition-colors"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border bg-white">
                    {item.image_front_small_url ? (
                      <img
                        src={item.image_front_small_url}
                        alt=""
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted">
                        <Package className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{item.product_name || "Produit"}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{item.barcode}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scan {
          0%   { top: 20%; }
          50%  { top: 80%; }
          100% { top: 20%; }
        }
      `}</style>
    </Sheet>
  );
}
