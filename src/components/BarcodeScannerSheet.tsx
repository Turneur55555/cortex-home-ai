import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Camera,
  X,
  Loader2,
  History,
  Plus,
  Minus,
  Check,
  ChevronRight,
  AlertCircle,
  Package,
  Apple,
  Scale,
  Star,
  Trash2,
} from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { Result } from "@zxing/library";
import { toast } from "sonner";
import { useAddStockItem } from "@/hooks/use-stocks";
import { useAddNutrition } from "@/hooks/use-fitness";
import { Sheet } from "@/components/shared/FormComponents";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  barcode: string;
  product_name?: string;
  brands?: string;
  image_front_small_url?: string;
  nutrition_grades?: string;
  quantity?: string;
  serving_size?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    "energy-kcal_serving"?: number;
    proteins_serving?: number;
    carbohydrates_serving?: number;
    fat_serving?: number;
  };
  nova_group?: number;
}

interface PortionPreset {
  label: string;
  qty: number;
  unit: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const NUTRISCORES: Record<string, { color: string }> = {
  a: { color: "#1a9851" },
  b: { color: "#91cf60" },
  c: { color: "#fee08b" },
  d: { color: "#fc8d59" },
  e: { color: "#d73027" },
};

const UNITS = ["g", "ml", "portion", "unité", "bouteille", "canette", "pot", "sachet"] as const;
type Unit = (typeof UNITS)[number];

const PRESETS_KEY = (barcode: string) => `cortex_portion_${barcode}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseProductQuantity(raw: string | undefined): { qty: number; unit: Unit } {
  if (!raw) return { qty: 100, unit: "g" };
  // Handle "6 x 330ml", "330 ml", "500g", "1 L", "33cl" etc.
  const cleaned = raw.replace(/^\d+\s*[x×]\s*/i, "").trim();
  const m = cleaned.match(/^([\d.,]+)\s*(ml|g|cl|l|kg|oz)?/i);
  if (!m) return { qty: 100, unit: "g" };
  const num = parseFloat(m[1].replace(",", "."));
  const rawUnit = (m[2] ?? "g").toLowerCase();
  switch (rawUnit) {
    case "l":   return { qty: Math.round(num * 1000), unit: "ml" };
    case "kg":  return { qty: Math.round(num * 1000), unit: "g" };
    case "cl":  return { qty: Math.round(num * 10),   unit: "ml" };
    default:    return { qty: Math.round(num), unit: rawUnit as Unit };
  }
}

function computeMacros(product: Product, totalQty: number) {
  const n = product.nutriments;
  const r = (v: number | undefined | null) =>
    v != null ? Math.round((v * totalQty) / 100) : null;
  const r1 = (v: number | undefined | null) =>
    v != null ? Math.round((v * totalQty) / 100 * 10) / 10 : null;
  return {
    calories: r(n?.["energy-kcal_100g"]),
    proteins: r1(n?.proteins_100g),
    carbs:    r1(n?.carbohydrates_100g),
    fats:     r1(n?.fat_100g),
  };
}

function loadPresets(barcode: string): PortionPreset[] {
  try {
    return JSON.parse(localStorage.getItem(PRESETS_KEY(barcode)) ?? "[]");
  } catch {
    return [];
  }
}

function savePresets(barcode: string, presets: PortionPreset[]) {
  localStorage.setItem(PRESETS_KEY(barcode), JSON.stringify(presets));
}

// ─── PortionModal ─────────────────────────────────────────────────────────────

function PortionModal({
  barcode,
  qty,
  unit,
  count,
  onSave,
  onClose,
}: {
  barcode: string;
  qty: number;
  unit: Unit;
  count: number;
  onSave: (qty: number, unit: Unit, count: number) => void;
  onClose: () => void;
}) {
  const [localQty, setLocalQty] = useState(String(qty));
  const [localUnit, setLocalUnit] = useState<Unit>(unit);
  const [localCount, setLocalCount] = useState(count);
  const [presets, setPresets] = useState<PortionPreset[]>(() => loadPresets(barcode));
  const [newLabel, setNewLabel] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);

  const handleSave = () => {
    const q = parseFloat(localQty) || 100;
    onSave(q, localUnit, localCount);
    onClose();
  };

  const addPreset = () => {
    if (!newLabel.trim()) return;
    const q = parseFloat(localQty) || 100;
    const updated = [
      ...presets.filter((p) => p.label !== newLabel.trim()),
      { label: newLabel.trim(), qty: q, unit: localUnit },
    ];
    setPresets(updated);
    savePresets(barcode, updated);
    setNewLabel("");
    setSavingPreset(false);
    toast.success("Favori enregistré");
  };

  const removePreset = (label: string) => {
    const updated = presets.filter((p) => p.label !== label);
    setPresets(updated);
    savePresets(barcode, updated);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] rounded-t-3xl border border-border bg-card p-5 shadow-elevated max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-bold">Modifier la portion</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Quantité + unité */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Quantité par portion
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={localQty}
                onChange={(e) => setLocalQty(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
              <select
                value={localUnit}
                onChange={(e) => setLocalUnit(e.target.value as Unit)}
                className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Nombre de portions */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nombre de portions
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setLocalCount((c) => Math.max(1, c - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-elevated active:scale-90"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="flex-1 text-center text-xl font-bold tabular-nums">{localCount}</span>
              <button
                type="button"
                onClick={() => setLocalCount((c) => c + 1)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-elevated active:scale-90"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Favoris */}
          {presets.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Portions favorites
              </p>
              <div className="space-y-1.5">
                {presets.map((p) => (
                  <div
                    key={p.label}
                    className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2"
                  >
                    <button
                      type="button"
                      onClick={() => { setLocalQty(String(p.qty)); setLocalUnit(p.unit as Unit); }}
                      className="flex-1 text-left text-sm font-medium"
                    >
                      <span className="font-semibold">{p.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{p.qty} {p.unit}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removePreset(p.label)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ajouter un favori */}
          {savingPreset ? (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nom (ex: 1 bouteille)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPreset()}
                className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                autoFocus
              />
              <button
                type="button"
                onClick={addPreset}
                disabled={!newLabel.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSavingPreset(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
            >
              <Star className="h-3.5 w-3.5" />
              Sauvegarder comme favori
            </button>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-semibold"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-[1.5] rounded-xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow"
            >
              Appliquer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function BarcodeScannerSheet({ roomId = "cuisine", onClose }: { roomId?: string; onClose: () => void }) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const readerRef   = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const [scanning,    setScanning]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [product,     setProduct]     = useState<Product | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [manualCode,  setManualCode]  = useState("");
  const [history,     setHistory]     = useState<Product[]>([]);
  const [camStatus,   setCamStatus]   = useState<"idle" | "active" | "denied">("idle");
  const [portionOpen, setPortionOpen] = useState(false);

  // Portion state
  const [portionQty,   setPortionQty]   = useState(100);
  const [portionUnit,  setPortionUnit]  = useState<Unit>("g");
  const [portionCount, setPortionCount] = useState(1);

  const addStock     = useAddStockItem();
  const addNutrition = useAddNutrition();

  // Computed macros based on current portion
  const totalQty = portionQty * portionCount;
  const macros   = useMemo(() => product ? computeMacros(product, totalQty) : null, [product, totalQty]);
  const per100   = useMemo(() => product ? computeMacros(product, 100) : null, [product]);

  // Reset portion when product changes
  useEffect(() => {
    if (!product) return;
    const parsed = parseProductQuantity(product.quantity ?? product.serving_size);
    setPortionQty(parsed.qty);
    setPortionUnit(parsed.unit);
    setPortionCount(1);
  }, [product]);

  const stopCamera = useCallback(() => {
    try { controlsRef.current?.stop(); } catch { /* ignore */ }
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
    setError(null);
    setProduct(null);
    setLoading(true);
    try {
      const res  = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,image_front_small_url,nutrition_grades,nutriments,nova_group,quantity,serving_size`,
      );
      const data = await res.json();
      if (data.status !== 1 || !data.product) {
        setError(`Produit introuvable : ${code}`);
        toast.error("Produit introuvable");
      } else {
        const p = { ...data.product, barcode: code } as Product;
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
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      videoRef.current.setAttribute("playsinline", "true");
      await videoRef.current.play();
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      controlsRef.current = await readerRef.current.decodeFromStream(
        stream, videoRef.current,
        (result: Result | undefined) => {
          if (result) { const code = result.getText(); stopCamera(); fetchProduct(code); }
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
    return () => { stopCamera(); };
  }, [stopCamera]);

  const handleAddToStock = async () => {
    if (!product || !macros) return;
    try {
      const n = product.nutriments;
      await addStock.mutateAsync({
        room:     roomId,
        name:     product.product_name || "Produit inconnu",
        quantity: portionCount,
        unit:     portionUnit === "g" || portionUnit === "ml"
          ? `${portionQty} ${portionUnit}`
          : portionUnit,
        notes:             `Code-barres: ${product.barcode}`,
        calories_per_100g: n?.["energy-kcal_100g"] ?? null,
        protein_per_100g:  n?.proteins_100g ?? null,
        carbs_per_100g:    n?.carbohydrates_100g ?? null,
        fat_per_100g:      n?.fat_100g ?? null,
      });
      toast.success("Ajouté aux stocks");
      onClose();
    } catch (e) {
      console.error("Failed to add to stock", e);
    }
  };

  const handleAddToNutrition = async () => {
    if (!product || !macros) return;
    const baseMacros = computeMacros(product, portionQty);
    try {
      await addNutrition.mutateAsync({
        date:                format(new Date(), "yyyy-MM-dd"),
        name:                `${product.product_name || "Produit"} (${totalQty} ${portionUnit})`,
        meal:                "collation",
        calories:            macros.calories,
        proteins:            macros.proteins,
        carbs:               macros.carbs,
        fats:                macros.fats,
        base_calories:       baseMacros.calories,
        base_proteins:       baseMacros.proteins,
        base_carbs:          baseMacros.carbs,
        base_fats:           baseMacros.fats,
        consumed_quantity:   portionQty,
        consumed_unit:       portionUnit,
        serving_count:       portionCount,
        percentage_consumed: 100,
      });
      toast.success("Ajouté à la nutrition");
      onClose();
    } catch (e) {
      console.error("Failed to add to nutrition", e);
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
        {product && !loading && macros && (
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

            {/* Sélecteur de portion */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  Quantité consommée
                </p>
                <button
                  type="button"
                  onClick={() => setPortionOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                >
                  <Scale className="h-3 w-3" />
                  Modifier portion
                </button>
              </div>

              {/* Gros compteur */}
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setPortionQty((q) => Math.max(1, q - (portionUnit === "g" || portionUnit === "ml" ? 10 : 1)))}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface text-xl font-bold active:scale-90 transition-transform"
                  aria-label="Diminuer"
                >
                  <Minus className="h-5 w-5" />
                </button>

                <div className="flex-1 text-center">
                  <div className="flex items-baseline justify-center gap-1.5">
                    <span className="text-4xl font-black tabular-nums tracking-tight">
                      {portionCount > 1 ? `${portionCount}×` : ""}{portionQty}
                    </span>
                    <select
                      value={portionUnit}
                      onChange={(e) => setPortionUnit(e.target.value as Unit)}
                      className="rounded-lg border border-border bg-surface px-1.5 py-1 text-sm font-bold outline-none focus:border-primary"
                    >
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  {portionCount > 1 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      = {totalQty} {portionUnit} au total
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setPortionQty((q) => q + (portionUnit === "g" || portionUnit === "ml" ? 10 : 1))}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface text-xl font-bold active:scale-90 transition-transform"
                  aria-label="Augmenter"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              {/* Référence 100g */}
              {per100?.calories != null && (
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  Référence : {per100.calories} kcal · {per100.proteins}g prot · {per100.carbs}g gluc · {per100.fats}g lip pour 100 {portionUnit === "ml" ? "ml" : "g"}
                </p>
              )}
            </div>

            {/* Macros recalculées */}
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated">
              <p className="px-4 pt-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Valeurs pour {totalQty} {portionUnit}
              </p>
              <div className="mt-2 grid grid-cols-4 gap-px bg-border">
                {[
                  { label: "Kcal",   val: macros.calories, color: "text-orange-400" },
                  { label: "Prot",   val: macros.proteins, color: "text-blue-400" },
                  { label: "Gluc",   val: macros.carbs,    color: "text-emerald-400" },
                  { label: "Lip",    val: macros.fats,     color: "text-yellow-400" },
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

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleAddToStock}
                disabled={addStock.isPending}
                className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-elevated py-3 text-xs font-bold hover:bg-muted disabled:opacity-60 transition-colors"
              >
                {addStock.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4 text-primary" />}
                + Stocks
              </button>
              <button
                onClick={handleAddToNutrition}
                disabled={addNutrition.isPending}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-primary py-3 text-xs font-bold text-primary-foreground shadow-glow disabled:opacity-60"
              >
                {addNutrition.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Apple className="h-4 w-4" />}
                + Nutrition
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
                      <img src={item.image_front_small_url} alt="" className="h-full w-full object-contain" />
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

      {/* Portion modal */}
      {portionOpen && product && (
        <PortionModal
          barcode={product.barcode}
          qty={portionQty}
          unit={portionUnit}
          count={portionCount}
          onSave={(q, u, c) => { setPortionQty(q); setPortionUnit(u); setPortionCount(c); }}
          onClose={() => setPortionOpen(false)}
        />
      )}

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
