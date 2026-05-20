import { useState } from "react";
import { Leaf, Loader2, Move, Pencil, Trash2, X } from "lucide-react";
import { useDeleteStockItem } from "@/hooks/use-stocks";
import { useUpdateItemFull } from "@/hooks/use-pantry";
import { useHomeCategories } from "@/hooks/useHomeCategories";
import { getRoomById } from "@/lib/maison/rooms";
import type { Tables } from "@/integrations/supabase/types";
import { FormField } from "@/components/stocks/FormField";

// ─── ItemEditSheet ────────────────────────────────────────────────────────────

interface ItemEditSheetProps {
  item: Tables<"items">;
  onClose: () => void;
}

export function ItemEditSheet({ item, onClose }: ItemEditSheetProps) {
  const updateFull = useUpdateItemFull();
  const del = useDeleteStockItem();
  const isCuisine = item.room === "cuisine";
  const { data: allCategories = [] } = useHomeCategories();

  const [form, setForm] = useState({
    name: item.name,
    quantity: String(item.quantity),
    unit: item.unit ?? "",
    expiration_date: item.expiration_date
      ? (item.expiration_date as unknown as string).slice(0, 10)
      : "",
    notes: item.notes ?? "",
    low_stock_threshold:
      item.low_stock_threshold != null ? String(item.low_stock_threshold) : "",
    alert_days_before:
      item.alert_days_before != null ? String(item.alert_days_before) : "7",
    calories_per_100g:
      item.calories_per_100g != null ? String(item.calories_per_100g) : "",
    protein_per_100g:
      item.protein_per_100g != null ? String(item.protein_per_100g) : "",
    carbs_per_100g: item.carbs_per_100g != null ? String(item.carbs_per_100g) : "",
    fat_per_100g: item.fat_per_100g != null ? String(item.fat_per_100g) : "",
    fiber_per_100g: item.fiber_per_100g != null ? String(item.fiber_per_100g) : "",
    sugar_per_100g: item.sugar_per_100g != null ? String(item.sugar_per_100g) : "",
    sodium_per_100g: item.sodium_per_100g != null ? String(item.sodium_per_100g) : "",
  });

  const [movingTo, setMovingTo] = useState<{ roomId: string; compartmentId: string }>({
    roomId: item.room ?? "cuisine",
    compartmentId: item.location ?? "",
  });

  const moveRoom = getRoomById(movingTo.roomId);
  const setF = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateFull.mutateAsync({
      id: item.id,
      oldRoom: item.room ?? "maison",
      oldQuantity: item.quantity,
      itemName: item.name,
      patch: {
        name: form.name.trim() || item.name,
        quantity: Number(form.quantity) || item.quantity,
        unit: form.unit.trim() || null,
        location: movingTo.compartmentId || null,
        room: movingTo.roomId,
        module: "maison",
        expiration_date: form.expiration_date || null,
        notes: form.notes.trim() || null,
        low_stock_threshold: num(form.low_stock_threshold),
        alert_days_before: form.alert_days_before.trim()
          ? Number(form.alert_days_before)
          : undefined,
        calories_per_100g: num(form.calories_per_100g),
        protein_per_100g: num(form.protein_per_100g),
        carbs_per_100g: num(form.carbs_per_100g),
        fat_per_100g: num(form.fat_per_100g),
        fiber_per_100g: num(form.fiber_per_100g),
        sugar_per_100g: num(form.sugar_per_100g),
        sodium_per_100g: num(form.sodium_per_100g),
      },
    });
    onClose();
  };

  const handleDelete = () => {
    if (!confirm(`Supprimer "${item.name}" ?`)) return;
    del.mutate({ id: item.id, roomId: item.room ?? "maison" });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-[430px] max-h-[92vh] overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-elevated">
        <div className="mb-4 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Modifier l'item</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <FormField label="Nom" value={form.name} onChange={setF("name")} required />
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
                />
                <FormField
                  label="Protéines (g)"
                  type="number"
                  step="0.1"
                  value={form.protein_per_100g}
                  onChange={setF("protein_per_100g")}
                />
                <FormField
                  label="Glucides (g)"
                  type="number"
                  step="0.1"
                  value={form.carbs_per_100g}
                  onChange={setF("carbs_per_100g")}
                />
                <FormField
                  label="Lipides (g)"
                  type="number"
                  step="0.1"
                  value={form.fat_per_100g}
                  onChange={setF("fat_per_100g")}
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

          {/* Move to different room/compartment */}
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Move className="h-3 w-3" />
              Déplacer vers
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={movingTo.roomId}
                onChange={(e) =>
                  setMovingTo({ roomId: e.target.value, compartmentId: "" })
                }
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {allCategories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={movingTo.compartmentId}
                onChange={(e) =>
                  setMovingTo((s) => ({ ...s, compartmentId: e.target.value }))
                }
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">— Aucun —</option>
                {(moveRoom?.compartments ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <FormField label="Notes" textarea value={form.notes} onChange={setF("notes")} />

          <button
            type="submit"
            disabled={updateFull.isPending}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            {updateFull.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pencil className="h-4 w-4" />
            )}
            Enregistrer
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-destructive/40 text-sm font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
            Supprimer l'item
          </button>
        </form>
      </div>
    </div>
  );
}
