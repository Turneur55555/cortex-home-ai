import { useState } from "react";
import { Leaf, Loader2, Plus, X } from "lucide-react";
import { FoodAutocomplete } from "@/components/FoodAutocomplete";
import { useAddStockItem } from "@/hooks/use-stocks";
import { FormField } from "@/components/stocks/FormField";

// ─── AddItemSheet ─────────────────────────────────────────────────────────────

interface AddItemSheetProps {
  roomId: string;
  compartmentId: string;
  roomName: string;
  compName: string;
  onClose: () => void;
}

export function AddItemSheet({
  roomId,
  compartmentId,
  roomName,
  compName,
  onClose,
}: AddItemSheetProps) {
  const add = useAddStockItem();
  const isCuisine = roomId === "cuisine";

  const [form, setForm] = useState({
    name: "",
    quantity: "1",
    unit: "",
    expiration_date: "",
    alert_days_before: "7",
    notes: "",
    low_stock_threshold: "",
    calories_per_100g: "",
    protein_per_100g: "",
    carbs_per_100g: "",
    fat_per_100g: "",
    fiber_per_100g: "",
    sugar_per_100g: "",
    sodium_per_100g: "",
  });

  const setF = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await add.mutateAsync({
      room: roomId,
      location: compartmentId,
      name: form.name.trim(),
      quantity: Number(form.quantity) || 1,
      unit: form.unit.trim() || null,
      expiration_date: form.expiration_date || null,
      alert_days_before: Math.max(0, Number(form.alert_days_before) || 7),
      notes: form.notes.trim() || null,
      low_stock_threshold: num(form.low_stock_threshold),
      ...(isCuisine && {
        calories_per_100g: num(form.calories_per_100g),
        protein_per_100g: num(form.protein_per_100g),
        carbs_per_100g: num(form.carbs_per_100g),
        fat_per_100g: num(form.fat_per_100g),
        fiber_per_100g: num(form.fiber_per_100g),
        sugar_per_100g: num(form.sugar_per_100g),
        sodium_per_100g: num(form.sodium_per_100g),
      }),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-[430px] max-h-[92vh] overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-elevated">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">{roomName}</p>
            <h2 className="text-lg font-bold leading-tight">{compName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3" data-testid="stocks-add-form">
          {/* Name — FoodAutocomplete for cuisine, plain input otherwise */}
          {isCuisine ? (
            <FoodAutocomplete
              value={form.name}
              onChange={setF("name")}
              onSelect={(f) =>
                setForm((prev) => ({
                  ...prev,
                  name: f.name,
                  calories_per_100g:
                    f.calories != null ? String(f.calories) : prev.calories_per_100g,
                  protein_per_100g:
                    f.proteins != null ? String(f.proteins) : prev.protein_per_100g,
                  carbs_per_100g: f.carbs != null ? String(f.carbs) : prev.carbs_per_100g,
                  fat_per_100g: f.fats != null ? String(f.fats) : prev.fat_per_100g,
                }))
              }
              required
            />
          ) : (
            <FormField
              label="Nom *"
              testId="stocks-field-name"
              value={form.name}
              onChange={setF("name")}
              placeholder="Ex: Shampoing"
              required
            />
          )}

          <div className="grid grid-cols-3 gap-3">
            <FormField
              label="Quantité"
              type="number"
              value={form.quantity}
              onChange={setF("quantity")}
            />
            <FormField
              label="Unité"
              value={form.unit}
              onChange={setF("unit")}
              placeholder="g, L, pcs…"
            />
            <FormField
              label="Expire le"
              type="date"
              testId="stocks-field-expiration"
              value={form.expiration_date}
              onChange={setF("expiration_date")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Alerte (j)"
              type="number"
              value={form.alert_days_before}
              onChange={setF("alert_days_before")}
              placeholder="7"
            />
            <FormField
              label="Alerte stock bas"
              type="number"
              value={form.low_stock_threshold}
              onChange={setF("low_stock_threshold")}
              placeholder="ex: 2"
            />
          </div>

          {/* Nutrition section — cuisine only */}
          {isCuisine && (
            <div className="rounded-2xl border border-accent/20 bg-accent/5 p-3">
              <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
                <Leaf className="h-3.5 w-3.5" />
                Valeurs nutritionnelles /100g
              </p>
              <div className="grid grid-cols-2 gap-2">
                <FormField
                  label="Calories (kcal)"
                  type="number"
                  value={form.calories_per_100g}
                  onChange={setF("calories_per_100g")}
                  placeholder="ex: 130"
                />
                <FormField
                  label="Protéines (g)"
                  type="number"
                  step="0.1"
                  value={form.protein_per_100g}
                  onChange={setF("protein_per_100g")}
                  placeholder="ex: 3"
                />
                <FormField
                  label="Glucides (g)"
                  type="number"
                  step="0.1"
                  value={form.carbs_per_100g}
                  onChange={setF("carbs_per_100g")}
                  placeholder="ex: 28"
                />
                <FormField
                  label="Lipides (g)"
                  type="number"
                  step="0.1"
                  value={form.fat_per_100g}
                  onChange={setF("fat_per_100g")}
                  placeholder="ex: 0.3"
                />
              </div>
              <p className="mb-1.5 mt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Optionnel
              </p>
              <div className="grid grid-cols-3 gap-2">
                <FormField
                  label="Fibres (g)"
                  type="number"
                  step="0.1"
                  value={form.fiber_per_100g}
                  onChange={setF("fiber_per_100g")}
                />
                <FormField
                  label="Sucre (g)"
                  type="number"
                  step="0.1"
                  value={form.sugar_per_100g}
                  onChange={setF("sugar_per_100g")}
                />
                <FormField
                  label="Sodium (mg)"
                  type="number"
                  value={form.sodium_per_100g}
                  onChange={setF("sodium_per_100g")}
                />
              </div>
            </div>
          )}

          <FormField label="Notes" textarea value={form.notes} onChange={setF("notes")} />

          <button
            type="submit"
            data-testid="stocks-submit-add"
            disabled={add.isPending}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            {add.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Enregistrer
          </button>
        </form>
      </div>
    </div>
  );
}
