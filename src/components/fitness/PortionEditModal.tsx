import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useUpdateNutrition } from "@/hooks/use-fitness";
import { Sheet } from "@/components/shared/FormComponents";
import type { NutritionEntry } from "@/lib/nutrition/utils";

interface PortionEditModalProps {
  item: NutritionEntry;
  date: string;
  onClose: () => void;
}

export function PortionEditModal({ item, date, onClose }: PortionEditModalProps) {
  const update = useUpdateNutrition();

  const baseCal = item.base_calories ?? item.calories ?? 0;
  const basePro = item.base_proteins ?? item.proteins ?? 0;
  const baseCar = item.base_carbs ?? item.carbs ?? 0;
  const baseFat = item.base_fats ?? item.fats ?? 0;

  const [pct, setPct] = useState(item.percentage_consumed ?? 100);
  const [count, setCount] = useState(item.serving_count ?? 1);

  const PRESETS = [25, 50, 75, 100, 150, 200];

  const preview = useMemo(
    () => ({
      calories: Math.round((baseCal * pct * count) / 100),
      proteins: Math.round(((basePro * pct * count) / 100) * 10) / 10,
      carbs: Math.round(((baseCar * pct * count) / 100) * 10) / 10,
      fats: Math.round(((baseFat * pct * count) / 100) * 10) / 10,
    }),
    [baseCal, basePro, baseCar, baseFat, pct, count],
  );

  const submit = async () => {
    await update.mutateAsync({
      id: item.id,
      date,
      patch: {
        percentage_consumed: pct,
        serving_count: count,
        calories: preview.calories,
        proteins: preview.proteins,
        carbs: preview.carbs,
        fats: preview.fats,
        base_calories: baseCal,
        base_proteins: basePro,
        base_carbs: baseCar,
        base_fats: baseFat,
      },
    });
    onClose();
  };

  return (
    <Sheet title="Modifier la portion" onClose={onClose}>
      <div className="space-y-5">
        <p className="truncate text-sm font-semibold">{item.name}</p>

        {/* Presets pourcentage */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Portion consommée
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPct(p)}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                  pct === p
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "border border-border bg-surface text-foreground hover:border-primary/50"
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
          <input
            type="range"
            min="10"
            max="200"
            step="5"
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            className="mt-3 w-full accent-primary"
          />
          <p className="mt-1 text-center text-lg font-bold text-primary">{pct}%</p>
        </div>

        {/* Stepper nombre de portions */}
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
        </div>

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
                <p className={`text-lg font-bold tabular-nums ${m.color}`}>{m.val}</p>
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
