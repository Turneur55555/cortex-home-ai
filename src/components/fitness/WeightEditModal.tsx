import { useCallback, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useUpdateNutrition } from "@/hooks/use-fitness";
import { Sheet } from "@/components/shared/FormComponents";
import type { NutritionEntry } from "@/lib/nutrition/utils";
import { WeightSelector, type WeightChange } from "@/components/fitness/WeightSelector";
import { resolveConsumedGrams } from "@/lib/nutrition/weight";
import type { FoodSuggestion } from "@/services/foodSuggestion";

interface WeightEditModalProps {
  item: NutritionEntry;
  date: string;
  onClose: () => void;
}

/**
 * Écran unique d'édition d'un aliment loggé : « Modifier le poids ».
 * Un seul champ (grammes), les macros sont toujours recalculées à partir
 * d'un ratio pour-cent-grammes dérivé des valeurs réellement enregistrées —
 * fonctionne identiquement quelle que soit l'origine historique de la ligne
 * (catalogue, scan, saisie manuelle, ancien mode « portion »/scoop/pot…).
 */
export function WeightEditModal({ item, date, onClose }: WeightEditModalProps) {
  const update = useUpdateNutrition();

  // Poids déjà connu pour cette ligne (ou 100 g par défaut si irrécupérable —
  // seules quelques lignes très anciennes sans grammage exploitable).
  const initialGrams = resolveConsumedGrams(item) ?? 100;

  // Référence /100 g dérivée des valeurs actuellement enregistrées : robuste
  // face à toute ambiguïté historique (aucune dépendance à base_* pour la
  // valeur de départ — base_* est réécrit canoniquement à la sauvegarde).
  const effectivePer100 = useMemo(() => {
    const g = initialGrams > 0 ? initialGrams : 100;
    const per = (v: number | null | undefined) => (v != null ? (v / g) * 100 : null);
    return {
      calories: per(item.calories),
      proteins: per(item.proteins),
      carbs: per(item.carbs),
      fats: per(item.fats),
    };
  }, [item, initialGrams]);

  const pseudoFood: FoodSuggestion = useMemo(
    () => ({
      id: item.id,
      name: item.name ?? "Aliment",
      calories: effectivePer100.calories,
      proteins: effectivePer100.proteins,
      carbs: effectivePer100.carbs,
      fats: effectivePer100.fats,
      source: "custom",
      default_serving: null,
    }),
    [item.id, item.name, effectivePer100],
  );

  const [calc, setCalc] = useState<WeightChange | null>(null);
  const onWeightChange = useCallback((c: WeightChange) => setCalc(c), []);

  const preview = {
    calories: calc?.calories ?? item.calories ?? 0,
    proteins: calc?.proteins ?? item.proteins ?? 0,
    carbs: calc?.carbs ?? item.carbs ?? 0,
    fats: calc?.fats ?? item.fats ?? 0,
  };

  const round1 = (v: number | null) => (v != null ? Math.round(v * 10) / 10 : null);

  const submit = async () => {
    const patch = {
      calories: calc?.calories ?? item.calories,
      proteins: calc?.proteins ?? item.proteins,
      carbs: calc?.carbs ?? item.carbs,
      fats: calc?.fats ?? item.fats,
      consumed_quantity: calc?.grams ?? initialGrams,
      consumed_unit: "g",
      consumed_grams_per_unit: null,
      serving_count: 1,
      percentage_consumed: 100,
      // base_* canonicalisé /100 g à chaque sauvegarde (auto-réparation des
      // lignes historiques ambiguës — plus jamais de double convention).
      base_calories:
        effectivePer100.calories != null
          ? Math.round(effectivePer100.calories)
          : item.base_calories,
      base_proteins: round1(effectivePer100.proteins) ?? item.base_proteins,
      base_carbs: round1(effectivePer100.carbs) ?? item.base_carbs,
      base_fats: round1(effectivePer100.fats) ?? item.base_fats,
    };
    await update.mutateAsync({ id: item.id, date, patch });
    onClose();
  };

  return (
    <Sheet title="Modifier le poids" onClose={onClose}>
      <div className="space-y-5">
        <p className="truncate text-sm font-semibold">{item.name}</p>

        <WeightSelector food={pseudoFood} initialGrams={initialGrams} onChange={onWeightChange} />

        {/* Aperçu macros */}
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Aperçu</p>
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
