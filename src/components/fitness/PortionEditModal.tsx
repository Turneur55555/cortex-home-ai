import { useCallback, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useUpdateNutrition } from "@/hooks/use-fitness";
import { Sheet } from "@/components/shared/FormComponents";
import type { NutritionEntry } from "@/lib/nutrition/utils";
import { PortionSelector, type PortionChange } from "@/components/fitness/PortionSelector";
import type { PortionUnit } from "@/lib/nutrition/portions";
import type { FoodSuggestion } from "@/services/foodSuggestion";

interface PortionEditModalProps {
  item: NutritionEntry;
  date: string;
  onClose: () => void;
}

export function PortionEditModal({ item, date, onClose }: PortionEditModalProps) {
  const update = useUpdateNutrition();

  // Modèle "grammes/unité" si une unité réelle est stockée ; sinon "portion" (legacy/manuel).
  const unit = (item.consumed_unit ?? "portion") as PortionUnit | "portion";
  const gramBased = unit !== "portion";

  // ─── Mode grammes / unité : on réutilise le même sélecteur qu'à l'ajout ──────
  const pseudoFood: FoodSuggestion = useMemo(
    () => ({
      id: item.id,
      name: item.name ?? "Aliment",
      calories: item.base_calories, // base_* = valeurs pour 100 g
      proteins: item.base_proteins,
      carbs: item.base_carbs,
      fats: item.base_fats,
      source: "custom",
      default_serving:
        item.consumed_grams_per_unit && unit !== "g" && unit !== "ml"
          ? { unit, grams: item.consumed_grams_per_unit, quantity: 1, label: `1 ${unit}` }
          : null,
    }),
    [item, unit],
  );

  const [calc, setCalc] = useState<PortionChange | null>(null);
  const onPortionChange = useCallback((c: PortionChange) => setCalc(c), []);

  // ─── Mode portion : multiplicateur simple sur base_* (par portion) ───────────
  const basePer = {
    calories: item.base_calories ?? item.calories ?? 0,
    proteins: item.base_proteins ?? item.proteins ?? 0,
    carbs: item.base_carbs ?? item.carbs ?? 0,
    fats: item.base_fats ?? item.fats ?? 0,
  };
  const [count, setCount] = useState<number>(item.consumed_quantity ?? 1);
  const portionPreview = useMemo(
    () => ({
      calories: Math.round(basePer.calories * count),
      proteins: Math.round(basePer.proteins * count * 10) / 10,
      carbs: Math.round(basePer.carbs * count * 10) / 10,
      fats: Math.round(basePer.fats * count * 10) / 10,
    }),
    [basePer.calories, basePer.proteins, basePer.carbs, basePer.fats, count],
  );

  const preview = gramBased
    ? {
        calories: calc?.calories ?? item.calories ?? 0,
        proteins: calc?.proteins ?? item.proteins ?? 0,
        carbs: calc?.carbs ?? item.carbs ?? 0,
        fats: calc?.fats ?? item.fats ?? 0,
      }
    : portionPreview;

  const submit = async () => {
    const patch = gramBased
      ? {
          calories: calc?.calories ?? item.calories,
          proteins: calc?.proteins ?? item.proteins,
          carbs: calc?.carbs ?? item.carbs,
          fats: calc?.fats ?? item.fats,
          consumed_quantity: calc?.quantity ?? item.consumed_quantity,
          consumed_unit: calc?.unit ?? item.consumed_unit,
          consumed_grams_per_unit: calc?.gramsPerUnit ?? item.consumed_grams_per_unit,
          serving_count: 1,
          percentage_consumed: 100,
          // base_* (per 100 g) inchangé
          base_calories: item.base_calories,
          base_proteins: item.base_proteins,
          base_carbs: item.base_carbs,
          base_fats: item.base_fats,
        }
      : {
          calories: portionPreview.calories,
          proteins: portionPreview.proteins,
          carbs: portionPreview.carbs,
          fats: portionPreview.fats,
          consumed_quantity: count,
          consumed_unit: "portion",
          consumed_grams_per_unit: null,
          serving_count: 1,
          percentage_consumed: 100,
          base_calories: basePer.calories,
          base_proteins: basePer.proteins,
          base_carbs: basePer.carbs,
          base_fats: basePer.fats,
        };
    await update.mutateAsync({ id: item.id, date, patch });
    onClose();
  };

  return (
    <Sheet title="Modifier la portion" onClose={onClose}>
      <div className="space-y-5">
        <p className="truncate text-sm font-semibold">{item.name}</p>

        {gramBased ? (
          <PortionSelector
            food={pseudoFood}
            initial={{
              quantity: item.consumed_quantity ?? 1,
              unit: unit as PortionUnit,
              gramsPerUnit: item.consumed_grams_per_unit,
            }}
            onChange={onPortionChange}
          />
        ) : (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nombre de portions
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setCount((c) => Math.max(0.5, Math.round((c - 0.5) * 10) / 10))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-xl font-bold hover:bg-muted"
              >
                −
              </button>
              <span className="w-16 text-center text-xl font-bold tabular-nums">{count}</span>
              <button
                type="button"
                onClick={() => setCount((c) => Math.round((c + 0.5) * 10) / 10)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-xl font-bold hover:bg-muted"
              >
                +
              </button>
            </div>
            <div className="mt-3 flex justify-center gap-1.5">
              {[
                { label: "½", f: 0.5 },
                { label: "¾", f: 0.75 },
                { label: "×2", f: 2 },
              ].map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setCount((c) => Math.max(0.5, Math.round(c * s.f * 10) / 10))}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Aperçu macros */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
            Aperçu
          </p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: "kcal", val: preview.calories, color: "text-primary" },
              { label: "Prot.", val: preview.proteins, color: "text-accent" },
              { label: "Gluc.", val: preview.carbs, color: "text-warning" },
              { label: "Lip.", val: preview.fats, color: "text-destructive" },
            ].map((m) => (
              <div key={m.label}>
                <p className={`text-lg font-bold tabular-nums ${m.color}`}>{m.val ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">{m.label}</p>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={update.isPending}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
        >
          {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Enregistrer
        </button>
      </div>
    </Sheet>
  );
}
