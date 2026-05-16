import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import {
  Apple,
  Barcode,
  Calendar,
  Camera,
  ChefHat,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Loader2,
  Scale,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  useAddNutrition,
  useDeleteNutrition,
  useNutrition,
  useNutritionGoals,
  useUpsertNutritionGoals,
  type NutritionGoals,
} from "@/hooks/use-fitness";
import { FabAdd, Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import { BarcodeScannerSheet } from "@/components/BarcodeScannerSheet";
import { FoodAutocomplete } from "@/components/FoodAutocomplete";
import { usePantryItems, useDeductFromStock } from "@/hooks/use-pantry";
import type { PantryItem } from "@/hooks/use-pantry";
import type { FoodSuggestion } from "@/services/openFoodFacts";

type MealPrefill = {
  name: string;
  meal: string;
  calories: string;
  proteins: string;
  carbs: string;
  fats: string;
};

async function fileToBase64Compressed(file: File): Promise<{ b64: string; mime: string }> {
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
  return { b64: out.split(",")[1] ?? "", mime: "image/jpeg" };
}

export function NutritionTab() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data, isLoading } = useNutrition(date);
  const { data: goals } = useNutritionGoals();
  const del = useDeleteNutrition();
  const [open, setOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [prefill, setPrefill] = useState<MealPrefill | null>(null);

  const totals = useMemo(() => {
    return (data ?? []).reduce(
      (acc, m) => ({
        calories: acc.calories + (m.calories ?? 0),
        proteins: acc.proteins + (m.proteins ?? 0),
        carbs: acc.carbs + (m.carbs ?? 0),
        fats: acc.fats + (m.fats ?? 0),
      }),
      { calories: 0, proteins: 0, carbs: 0, fats: 0 },
    );
  }, [data]);

  const grouped = useMemo(() => {
    type Meal = NonNullable<typeof data>[number];
    const order = ["petit-dej", "dejeuner", "diner", "collation"] as const;
    const labels: Record<string, string> = {
      "petit-dej": "Petit-déjeuner",
      dejeuner: "Déjeuner",
      diner: "Dîner",
      collation: "Collation",
    };
    const map = new Map<string, Meal[]>();
    (data ?? []).forEach((m) => {
      const k = m.meal ?? "autre";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    });
    const result: Array<{ key: string; label: string; items: Meal[] }> = [];
    for (const k of order) {
      const items = map.get(k);
      if (items) result.push({ key: k, label: labels[k], items });
    }
    for (const [k, v] of map) {
      if (!order.includes(k as (typeof order)[number])) {
        result.push({ key: k, label: labels[k] ?? "Autre", items: v });
      }
    }
    return result;
  }, [data]);

  const openManual = () => {
    setPrefill(null);
    setOpen(true);
  };

  const handleScanResult = (p: MealPrefill) => {
    setScanOpen(false);
    setPrefill(p);
    setOpen(true);
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => setGoalsOpen(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <Target className="h-3.5 w-3.5" />
          Objectifs
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-surface p-4 shadow-elevated">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Aujourd'hui
          </p>
          <p className="text-2xl font-bold text-primary">
            {totals.calories}
            {goals?.calories ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                / {goals.calories} kcal
              </span>
            ) : (
              <span className="ml-1 text-xs font-normal text-muted-foreground">kcal</span>
            )}
          </p>
        </div>
        {goals?.calories ? (
          <ProgressBar value={totals.calories} target={goals.calories} className="mt-2" />
        ) : null}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MacroProgress
            label="Protéines"
            value={totals.proteins}
            target={goals?.proteins}
            color="text-accent"
            barColor="bg-accent"
          />
          <MacroProgress
            label="Glucides"
            value={totals.carbs}
            target={goals?.carbs}
            color="text-warning"
            barColor="bg-warning"
          />
          <MacroProgress
            label="Lipides"
            value={totals.fats}
            target={goals?.fats}
            color="text-destructive"
            barColor="bg-destructive"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setScanOpen(true)}
          className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 to-transparent p-3 text-left shadow-card transition-all active:scale-[0.98]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold">Scan Repas</span>
            <span className="block truncate text-[10px] text-muted-foreground">Photo → IA</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setBarcodeOpen(true)}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left shadow-card transition-all active:scale-[0.98]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <Barcode className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold">Code-barres</span>
            <span className="block truncate text-[10px] text-muted-foreground">
              Open Food Facts
            </span>
          </span>
        </button>
      </div>

      {isLoading && (
        <div className="flex h-20 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && grouped.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Apple className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Pas de repas enregistré</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Suivez votre alimentation pour atteindre vos objectifs.
          </p>
        </div>
      )}

      {grouped.map((g) => (
        <div key={g.key}>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {g.label}
          </h3>
          <ul className="space-y-2">
            {g.items.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-card"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.calories ?? 0} kcal · P{m.proteins ?? 0} G{m.carbs ?? 0} L{m.fats ?? 0}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => del.mutate(m.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <FabAdd onClick={openManual} label="Ajouter un repas" />
      {open && <NutritionSheet date={date} prefill={prefill} onClose={() => setOpen(false)} />}
      {goalsOpen && <GoalsSheet current={goals ?? null} onClose={() => setGoalsOpen(false)} />}
      {scanOpen && <MealScanSheet onClose={() => setScanOpen(false)} onResult={handleScanResult} />}
      {barcodeOpen && <BarcodeScannerSheet onClose={() => setBarcodeOpen(false)} />}
    </section>
  );
}

function MacroProgress({
  label,
  value,
  target,
  color,
  barColor,
}: {
  label: string;
  value: number;
  target: number | null | undefined;
  color: string;
  barColor: string;
}) {
  const pct = target && target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="rounded-xl bg-surface p-2">
      <p className={`text-base font-bold ${color}`}>
        {Math.round(value)}
        <span className="text-[10px] font-normal text-muted-foreground">
          {target ? ` / ${Math.round(target)}g` : "g"}
        </span>
      </p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {target ? (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-border">
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function ProgressBar({
  value,
  target,
  className = "",
}: {
  value: number;
  target: number;
  className?: string;
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = value > target;
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-border ${className}`}>
      <div
        className={`h-full transition-all ${over ? "bg-destructive" : "bg-gradient-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function GoalsSheet({ current, onClose }: { current: NutritionGoals | null; onClose: () => void }) {
  const upsert = useUpsertNutritionGoals();
  const [form, setForm] = useState({
    calories: current?.calories != null ? String(current.calories) : "",
    proteins: current?.proteins != null ? String(current.proteins) : "",
    carbs: current?.carbs != null ? String(current.carbs) : "",
    fats: current?.fats != null ? String(current.fats) : "",
  });

  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const numInt = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await upsert.mutateAsync({
      calories: numInt(form.calories),
      proteins: num(form.proteins),
      carbs: num(form.carbs),
      fats: num(form.fats),
    });
    onClose();
  };

  return (
    <Sheet title="Mes objectifs quotidiens" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Définis tes cibles. Laisse vide pour ne pas afficher de barre de progression.
        </p>
        <Field
          label="Calories (kcal)"
          type="number"
          value={form.calories}
          onChange={(v) => setForm({ ...form, calories: v })}
        />
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Prot. (g)"
            type="number"
            step="0.1"
            value={form.proteins}
            onChange={(v) => setForm({ ...form, proteins: v })}
          />
          <Field
            label="Gluc. (g)"
            type="number"
            step="0.1"
            value={form.carbs}
            onChange={(v) => setForm({ ...form, carbs: v })}
          />
          <Field
            label="Lip. (g)"
            type="number"
            step="0.1"
            value={form.fats}
            onChange={(v) => setForm({ ...form, fats: v })}
          />
        </div>
        <SubmitButton pending={upsert.isPending}>Enregistrer</SubmitButton>
      </form>
    </Sheet>
  );
}

function MealScanSheet({
  onClose,
  onResult,
}: {
  onClose: () => void;
  onResult: (p: MealPrefill) => void;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const scan = useMutation({
    mutationFn: async (file: File) => {
      const { b64, mime } = await fileToBase64Compressed(file);
      setPreview(`data:${mime};base64,${b64}`);
      const { data, error } = await supabase.functions.invoke("scan-meal", {
        body: { image_base64: b64, mime_type: mime },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as {
        name: string;
        meal?: string;
        calories: number;
        proteins: number;
        carbs: number;
        fats: number;
        confidence?: number;
        details?: string;
      };
    },
    onSuccess: (d) => {
      onResult({
        name: d.name,
        meal: d.meal ?? "dejeuner",
        calories: String(Math.round(d.calories ?? 0)),
        proteins: String(Math.round((d.proteins ?? 0) * 10) / 10),
        carbs: String(Math.round((d.carbs ?? 0) * 10) / 10),
        fats: String(Math.round((d.fats ?? 0) * 10) / 10),
      });
      const conf = d.confidence != null ? ` (${Math.round(d.confidence * 100)}%)` : "";
      toast.success(`Repas analysé${conf} — ajuste si besoin`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPick = (f: File | null | undefined) => {
    if (!f) return;
    scan.mutate(f);
  };

  return (
    <Sheet title="Scanner mon repas" onClose={onClose}>
      <div className="space-y-4">
        {!preview && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow">
              <Sparkles className="h-7 w-7" />
            </div>
            <p className="text-xs text-muted-foreground">
              L'IA estime calories et macros depuis ta photo.
            </p>
          </div>
        )}
        {preview && (
          <div className="overflow-hidden rounded-2xl border border-border">
            <img src={preview} alt="Aperçu" className="max-h-64 w-full object-cover" />
          </div>
        )}
        {scan.isPending && (
          <div className="flex flex-col items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Analyse en cours…
          </div>
        )}

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
      </div>
    </Sheet>
  );
}

function computeMacrosFor(food: FoodSuggestion, grams: number) {
  const r1 = (v: number | null) =>
    v != null ? String(Math.round((v * grams) / 100)) : "";
  const r1d = (v: number | null) =>
    v != null ? String(Math.round((v * grams) / 100 * 10) / 10) : "";
  return {
    calories: r1(food.calories),
    proteins: r1d(food.proteins),
    carbs: r1d(food.carbs),
    fats: r1d(food.fats),
  };
}

function NutritionSheet({
  date,
  onClose,
  prefill,
}: {
  date: string;
  onClose: () => void;
  prefill?: MealPrefill | null;
}) {
  const add = useAddNutrition();
  const deduct = useDeductFromStock();
  const [pantryOpen, setPantryOpen] = useState(false);
  const [pantryItem, setPantryItem] = useState<PantryItem | null>(null);
  const [pantryQty, setPantryQty] = useState("1");

  // Per-100g reference when a known food is selected (from autocomplete or pantry)
  const [baseFood, setBaseFood] = useState<FoodSuggestion | null>(null);
  const [gramQty, setGramQty] = useState("100");

  const [form, setForm] = useState({
    name: prefill?.name ?? "",
    meal: prefill?.meal ?? "petit-dej",
    calories: prefill?.calories ?? "",
    proteins: prefill?.proteins ?? "",
    carbs: prefill?.carbs ?? "",
    fats: prefill?.fats ?? "",
  });

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  // Auto-recompute macros whenever gram quantity changes
  useEffect(() => {
    if (!baseFood) return;
    const grams = Number(gramQty) || 0;
    if (grams <= 0) return;
    setForm((f) => ({ ...f, ...computeMacrosFor(baseFood, grams) }));
  }, [gramQty, baseFood]);

  const selectBaseFood = useCallback((food: FoodSuggestion, grams = 100) => {
    setBaseFood(food);
    setGramQty(String(grams));
    setForm((f) => ({ ...f, name: food.name, ...computeMacrosFor(food, grams) }));
  }, []);

  const handlePantrySelect = (it: PantryItem) => {
    setPantryItem(it);
    setPantryQty("1");
    if (it.calories_per_100g != null) {
      const food: FoodSuggestion = {
        id: it.id,
        name: it.name,
        calories: it.calories_per_100g,
        proteins: it.protein_per_100g,
        carbs: it.carbs_per_100g,
        fats: it.fat_per_100g,
        source: "local",
      };
      selectBaseFood(food, 100);
    } else {
      setForm((f) => ({ ...f, name: it.name }));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    if (pantryItem) {
      const qty = Number(pantryQty) || 1;
      try {
        await deduct.mutateAsync({
          itemId: pantryItem.id,
          quantityUsed: qty,
          mealName: form.name.trim(),
        });
      } catch {
        return;
      }
    }

    await add.mutateAsync({
      date,
      name: form.name.trim(),
      meal: form.meal,
      calories: num(form.calories) as number | null,
      proteins: num(form.proteins),
      carbs: num(form.carbs),
      fats: num(form.fats),
    });
    onClose();
  };

  const busy = add.isPending || deduct.isPending;

  return (
    <Sheet title={prefill ? "Confirmer le repas" : "Nouveau repas"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">

        {/* Pantry picker section */}
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <button
            type="button"
            onClick={() => setPantryOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold"
          >
            <span className="flex items-center gap-2 text-primary">
              <ChefHat className="h-3.5 w-3.5" />
              Depuis ma cuisine
              {pantryItem && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
                  {pantryItem.name}
                </span>
              )}
            </span>
            {pantryOpen ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>

          {pantryOpen && (
            <div className="border-t border-border px-3 pb-3 pt-2">
              <PantryPicker
                selected={pantryItem}
                onSelect={handlePantrySelect}
                onClear={() => { setPantryItem(null); setBaseFood(null); }}
              />
              {pantryItem && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Qté utilisée
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max={pantryItem.quantity}
                    value={pantryQty}
                    onChange={(e) => setPantryQty(e.target.value)}
                    className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-center text-sm outline-none focus:border-primary"
                  />
                  <span className="text-xs text-muted-foreground">
                    / {pantryItem.quantity} {pantryItem.unit ?? ""}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <FoodAutocomplete
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          onSelect={(f) => selectBaseFood(f, 100)}
          required
        />

        {/* Gram portion stepper — shown when a food with known per-100g values is selected */}
        {baseFood && (
          <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
            <Scale className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1 text-xs font-semibold text-primary">Portion</span>
            <input
              type="number"
              min="1"
              step="5"
              value={gramQty}
              onChange={(e) => setGramQty(e.target.value)}
              className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-center text-sm font-semibold outline-none focus:border-primary"
            />
            <span className="text-xs text-muted-foreground">g</span>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Repas
          </label>
          <select
            value={form.meal}
            onChange={(e) => setForm({ ...form, meal: e.target.value })}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="petit-dej">Petit-déjeuner</option>
            <option value="dejeuner">Déjeuner</option>
            <option value="diner">Dîner</option>
            <option value="collation">Collation</option>
          </select>
        </div>
        <Field
          label={baseFood ? "Calories (kcal, auto)" : "Calories (kcal)"}
          type="number"
          value={form.calories}
          onChange={(v) => setForm({ ...form, calories: v })}
        />
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Prot. (g)"
            type="number"
            step="0.1"
            value={form.proteins}
            onChange={(v) => setForm({ ...form, proteins: v })}
          />
          <Field
            label="Gluc. (g)"
            type="number"
            step="0.1"
            value={form.carbs}
            onChange={(v) => setForm({ ...form, carbs: v })}
          />
          <Field
            label="Lip. (g)"
            type="number"
            step="0.1"
            value={form.fats}
            onChange={(v) => setForm({ ...form, fats: v })}
          />
        </div>
        <SubmitButton pending={busy}>Ajouter le repas</SubmitButton>
      </form>
    </Sheet>
  );
}

// ─── PantryPicker ─────────────────────────────────────────────────────────────

function PantryPicker({
  selected,
  onSelect,
  onClear,
}: {
  selected: PantryItem | null;
  onSelect: (item: PantryItem) => void;
  onClear: () => void;
}) {
  const { data: items, isLoading } = usePantryItems();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return (items ?? []).slice(0, 12);
    return (items ?? []).filter((it) => it.name.toLowerCase().includes(needle)).slice(0, 12);
  }, [items, q]);

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher dans ma cuisine…"
        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
      />
      {isLoading && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {!isLoading && filtered.length === 0 && (
        <p className="py-2 text-center text-xs text-muted-foreground">
          Aucun aliment dans la cuisine
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {filtered.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => (selected?.id === it.id ? onClear() : onSelect(it))}
            className={
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors " +
              (selected?.id === it.id
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-foreground hover:border-primary/50")
            }
          >
            {it.name}
            <span className="text-[10px] text-muted-foreground">
              {it.quantity}{it.unit ? ` ${it.unit}` : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
