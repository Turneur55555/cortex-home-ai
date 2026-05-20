import { useState } from "react";
import { useUpsertNutritionGoals, type NutritionGoals } from "@/hooks/use-fitness";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";

interface GoalsSheetProps {
  current: NutritionGoals | null;
  onClose: () => void;
}

export function GoalsSheet({ current, onClose }: GoalsSheetProps) {
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
