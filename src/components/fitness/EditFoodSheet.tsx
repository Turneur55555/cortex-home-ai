import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";
import { useAuth } from "@/hooks/use-auth";
import { customFoodsRepo } from "@/hooks/useCustomFoods";
import { parseDecimal, formatDecimal } from "@/lib/nutrition/weight";
import type { FoodSuggestion } from "@/services/foodSuggestion";

const isRealId = (id: string) => !id.startsWith("used:");

const toText = (v: number | null | undefined) => (v == null ? "" : formatDecimal(v));

/**
 * Modification d'un aliment de la bibliothèque (valeurs /100 g).
 * - aliment déjà enregistré (`food_custom_foods`) : mise à jour de la ligne ;
 * - aliment issu de l'historique du journal (id `used:…`) : il est enregistré
 *   dans « Mes aliments » avec les valeurs corrigées (et prime ensuite sur
 *   l'historique dans la liste).
 * Les entrées déjà au journal ne sont pas modifiées (elles gardent leur valeur).
 */
export function EditFoodSheet({ food, onClose }: { food: FoodSuggestion; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    name: food.name,
    calories: toText(food.calories),
    fats: toText(food.fats),
    carbs: toText(food.carbs),
    proteins: toText(food.proteins),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const name = form.name.trim();
    if (name.length < 2) {
      toast.error("Donne un nom à l'aliment.");
      return;
    }
    const values = {
      calories: parseDecimal(form.calories),
      proteins: parseDecimal(form.proteins),
      carbs: parseDecimal(form.carbs),
      fats: parseDecimal(form.fats),
    };
    const outOfRange = (v: number | null, max: number) => v != null && (v < 0 || v > max);
    if (
      outOfRange(values.calories, 1000) ||
      outOfRange(values.proteins, 100) ||
      outOfRange(values.carbs, 100) ||
      outOfRange(values.fats, 100)
    ) {
      toast.error("Valeurs /100 g hors limites (kcal ≤ 1000, macros ≤ 100 g).");
      return;
    }
    const patch = {
      name,
      calories: values.calories ?? 0,
      proteins: values.proteins ?? 0,
      carbs: values.carbs ?? 0,
      fats: values.fats ?? 0,
    };

    setPending(true);
    try {
      if (isRealId(food.id)) {
        await customFoodsRepo.update(food.id, user.id, patch);
      } else {
        const existing = await customFoodsRepo.list(user.id);
        const match = existing.find((r) => r.name.trim().toLowerCase() === name.toLowerCase());
        if (match) await customFoodsRepo.update(match.id, user.id, patch);
        else
          await customFoodsRepo.create(user.id, {
            food_id: null,
            brand: null,
            default_serving_grams: null,
            ...patch,
          });
      }
      await qc.invalidateQueries({ queryKey: ["custom_foods"] });
      toast.success("Aliment modifié");
      onClose();
    } catch {
      toast.error("Impossible d'enregistrer la modification.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet title="Modifier l'aliment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Nom"
          type="text"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
        />
        <p className="text-xs text-muted-foreground">Valeurs pour 100 g</p>
        <Field
          label="Calories (kcal)"
          type="text"
          value={form.calories}
          onChange={(v) => setForm({ ...form, calories: v })}
        />
        <div className="grid grid-cols-3 gap-3">
          <Field
            label="Lip. (g)"
            type="text"
            value={form.fats}
            onChange={(v) => setForm({ ...form, fats: v })}
          />
          <Field
            label="Gluc. (g)"
            type="text"
            value={form.carbs}
            onChange={(v) => setForm({ ...form, carbs: v })}
          />
          <Field
            label="Prot. (g)"
            type="text"
            value={form.proteins}
            onChange={(v) => setForm({ ...form, proteins: v })}
          />
        </div>
        <SubmitButton pending={pending}>Enregistrer</SubmitButton>
      </form>
    </Sheet>
  );
}
