import { useState, useEffect, useRef, useCallback } from "react";
import {
  Camera,
  X,
  Loader2,
  History,
  Plus,
  Check,
  ChevronRight,
  AlertCircle,
  Package,
  Apple,
} from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { Result } from "@zxing/library";
import { toast } from "sonner";
import { useAddStockItem } from "@/hooks/use-stocks";
import { useAddNutrition } from "@/hooks/use-fitness";
import { Sheet } from "@/components/shared/FormComponents";
import { format } from "date-fns";

const NUTRISCORES: Record<string, { color: string; label: string }> = {
  a: { color: "#1a9851", label: "Excellent" },
  b: { color: "#91cf60", label: "Bon" },
  c: { color: "#fee08b", label: "Moyen" },
  d: { color: "#fc8d59", label: "Médiocre" },
  e: { color: "#d73027", label: "Mauvais" },
};

interface Product {
  barcode: string;
  product_name?: string;
  brands?: string;
  image_front_small_url?: string;
  nutrition_grades?: string;
  quantity?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
  ingredients_text?: string;
  nova_group?: number;
}

export function BarcodeScannerSheet({ roomId = "cuisine", onClose }: { roomId?: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [history, setHistory] = useState<Product[]>([]);
  const [camStatus, setCamStatus] = useState<"idle" | "active" | "denied">("idle");

  const addStock = useAddStockItem();
  const addNutrition = useAddNutrition();

  const stopCamera = useCallback(() => {
    try {
      controlsRef.current?.stop();
    } catch {
      // ignore
    }
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks()?.forEach((t) => t.stop());
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
    setCamStatus("idle");
  }, []);

  const fetchProduct = useCallback(async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;
    setError(null);
    setProduct(null);
    setLoading(true);
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,image_front_small_url,nutrition_grades,nutriments,ingredients_text,nova_group,quantity,categories`,
      );
      const data = await res.json();
      if (data.status !== 1 || !data.product) {
        setError(`Produit introuvable : ${code}`);
        toast.error("Produit introuvable");
      } else {
        const p = { ...data.product, barcode: code };
        setProduct(p);
        setHistory((h) => {
          const filtered = h.filter((x) => x.barcode !== code);
          return [p, ...filtered].slice(0, 8);
        });
      }
    } catch {
      setError("Erreur réseau");
      toast.error("Erreur lors de la récupération du produit");
    } finally {
      setLoading(false);
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

      if (!readerRef.current) {
        readerRef.current = new BrowserMultiFormatReader();
      }

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
    } catch (e) {
      console.error(e);
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
    };
  }, [stopCamera]);

  const handleAddToStock = async () => {
    if (!product) return;
    try {
      await addStock.mutateAsync({
        module: roomId,
        name: product.product_name || "Produit inconnu",
        category: "alimentation",
        quantity: 1,
        unit: product.quantity || null,
        expiration_date: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"), // Default 1 week
        notes: `Code-barres: ${product.barcode}`,
      });
      onClose();
    } catch (e) {
      console.error("Failed to add to stock", e);
    }
  };

  const handleAddToNutrition = async () => {
    if (!product) return;
    try {
      await addNutrition.mutateAsync({
        date: format(new Date(), "yyyy-MM-dd"),
        name: product.product_name || "Produit inconnu",
        meal: "collation",
        calories: product.nutriments?.["energy-kcal_100g"] || null,
        proteins: product.nutriments?.proteins_100g || null,
        carbs: product.nutriments?.carbohydrates_100g || null,
        fats: product.nutriments?.fat_100g || null,
      });
      onClose();
    } catch (e) {
      console.error("Failed to add to nutrition", e);
    }
  };

  return (
    <Sheet title="Scanner un code-barres" onClose={onClose}>
      <div className="flex flex-col gap-5">
        {/* Camera viewport */}
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-black">
          {scanning ? (
            <>
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              <div className="absolute inset-x-[10%] top-1/2 h-0.5 animate-[scan_2s_ease-in-out_infinite] bg-primary shadow-[0_0_8px_var(--color-primary)]" />
              <div className="absolute inset-4 border-2 border-primary/30 rounded-lg pointer-events-none" />
              <p className="absolute bottom-4 inset-x-0 text-center text-[10px] uppercase tracking-widest text-white/70">
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

        {/* Manual entry fallback */}
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

        {/* Loading / Error */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm">Recherche du produit...</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Product Result */}
        {product && !loading && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
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
                    {product.nutrition_grades &&
                      NUTRISCORES[product.nutrition_grades.toLowerCase()] && (
                        <span
                          className="inline-flex h-6 items-center px-2 rounded-md text-[10px] font-black text-white uppercase"
                          style={{
                            background: NUTRISCORES[product.nutrition_grades.toLowerCase()].color,
                          }}
                        >
                          Nutri-Score {product.nutrition_grades}
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

              {/* Macros */}
              <div className="mt-4 grid grid-cols-4 gap-1 overflow-hidden rounded-xl border border-border bg-border">
                {[
                  { label: "Kcal", val: product.nutriments?.["energy-kcal_100g"] },
                  { label: "Prot", val: product.nutriments?.proteins_100g },
                  { label: "Gluc", val: product.nutriments?.carbohydrates_100g },
                  { label: "Lip", val: product.nutriments?.fat_100g },
                ].map((m, i) => (
                  <div key={i} className="bg-surface py-2 text-center">
                    <span className="block text-xs font-bold">
                      {m.val != null ? Math.round(m.val) : "-"}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  onClick={handleAddToStock}
                  className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-elevated py-2.5 text-xs font-bold hover:bg-muted"
                >
                  <Package className="h-4 w-4 text-primary" />+ Stocks
                </button>
                <button
                  onClick={handleAddToNutrition}
                  className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-elevated py-2.5 text-xs font-bold hover:bg-muted"
                >
                  <Apple className="h-4 w-4 text-accent" />+ Nutrition
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center gap-2 mb-2 px-1">
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
                  <div className="h-10 w-10 flex-shrink-0 rounded-lg border border-border bg-white overflow-hidden">
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
          0% { top: 20%; }
          50% { top: 80%; }
          100% { top: 20%; }
        }
      `}</style>
    </Sheet>
  );
}
