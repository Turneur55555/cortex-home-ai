import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useUpsertNutritionGoals, type NutritionGoals } from "@/hooks/use-fitness";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";

interface GoalsSheetProps {
  current: NutritionGoals | null;
  onClose: () => void;
}

/** Répartition standard : 35% protéines · 32% glucides · 33% lipides */
function computeMacrosFromCalories(kcal: number) {
  return {
    proteins: Math.round((kcal * 0.35) / 4),
    carbs: Math.round((kcal * 0.32) / 4),
    fats: Math.round((kcal * 0.33) / 9),
  };
}

/**
 * Édition MANUELLE des objectifs nutritionnels quotidiens — distincte de la
 * RECOMMANDATION Cortex (section "Stratégie calorique" de Santé
 * nutritionnelle, `lib/fitness/calorieStrategy.ts`, seule source de vérité
 * pour la recommandation calorique personnalisée depuis la Phase 4A/4B).
 * Ne contient plus de calculateur TDEE intégré (retiré en Phase 4B — il
 * produisait une recommandation concurrente basée sur un multiplicateur
 * d'activité classique et des deltas ±300 kcal fixes, jamais Cortex-native).
 */
export function GoalsSheet({ current, onClose }: GoalsSheetProps) {
  const upsert = useUpsertNutritionGoals();
  const [form, setForm] = useState({
    calories: current?.calories != null ? String(current.calories) : "",
    proteins: current?.proteins != null ? String(current.proteins) : "",
    carbs: current?.carbs != null ? String(current.carbs) : "",
    fats: current?.fats != null ? String(current.fats) : "",
  });

  // Suivi de la personnalisation : dès que l'utilisateur modifie une macro à la main,
  // on n'écrase plus ses valeurs sans son accord.
  const [macrosCustomized, setMacrosCustomized] = useState(false);
  const [showRecalcPrompt, setShowRecalcPrompt] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const lastAutoRef = useRef<{ proteins: string; carbs: string; fats: string } | null>(null);

  const applyAutoMacros = (kcalStr: string) => {
    const kcal = Number(kcalStr);
    if (!kcal || kcal <= 0) return;
    const m = computeMacrosFromCalories(kcal);
    const next = { proteins: String(m.proteins), carbs: String(m.carbs), fats: String(m.fats) };
    lastAutoRef.current = next;
    setForm((f) => ({ ...f, ...next }));
    setPulseKey((k) => k + 1);
  };

  const onCaloriesChange = (v: string) => {
    setForm((f) => ({ ...f, calories: v }));
    const kcal = Number(v);
    if (!kcal || kcal <= 0) return;
    if (macrosCustomized) {
      setShowRecalcPrompt(true);
    } else {
      const m = computeMacrosFromCalories(kcal);
      const next = { proteins: String(m.proteins), carbs: String(m.carbs), fats: String(m.fats) };
      lastAutoRef.current = next;
      setForm((f) => ({ ...f, calories: v, ...next }));
      setPulseKey((k) => k + 1);
    }
  };

  const onMacroChange = (key: "proteins" | "carbs" | "fats", v: string) => {
    setForm((f) => ({ ...f, [key]: v }));
    if (!lastAutoRef.current || v !== lastAutoRef.current[key]) {
      setMacrosCustomized(true);
    }
  };

  const recalcNow = () => {
    applyAutoMacros(form.calories);
    setMacrosCustomized(false);
    setShowRecalcPrompt(false);
  };

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

        <div className="space-y-1.5">
          <Field
            label="Calories (kcal)"
            type="number"
            value={form.calories}
            onChange={onCaloriesChange}
          />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Les macros sont calculées automatiquement et peuvent être modifiées à tout moment.
          </p>
        </div>

        {showRecalcPrompt && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 animate-fade-in">
            <p className="text-xs text-foreground">
              Les macros ont été personnalisées. Souhaitez-vous les recalculer selon votre nouvel
              objectif calorique ?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={recalcNow}
                className="flex-1 rounded-lg bg-gradient-primary py-1.5 text-[11px] font-semibold text-primary-foreground shadow-glow"
              >
                Recalculer automatiquement
              </button>
              <button
                type="button"
                onClick={() => setShowRecalcPrompt(false)}
                className="flex-1 rounded-lg border border-border bg-card py-1.5 text-[11px] font-semibold text-foreground"
              >
                Conserver mes valeurs
              </button>
            </div>
          </div>
        )}

        <div
          key={pulseKey}
          className="grid grid-cols-3 gap-3 transition-opacity duration-200 animate-fade-in"
        >
          <Field
            label="Lip. (g)"
            type="number"
            step="0.1"
            value={form.fats}
            onChange={(v) => onMacroChange("fats", v)}
          />
          <Field
            label="Gluc. (g)"
            type="number"
            step="0.1"
            value={form.carbs}
            onChange={(v) => onMacroChange("carbs", v)}
          />
          <Field
            label="Prot. (g)"
            type="number"
            step="0.1"
            value={form.proteins}
            onChange={(v) => onMacroChange("proteins", v)}
          />
        </div>

        <button
          type="button"
          onClick={recalcNow}
          disabled={!Number(form.calories)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RotateCcw className="h-3 w-3" />
          Recalculer automatiquement les macros
        </button>

        <SubmitButton pending={upsert.isPending}>Enregistrer</SubmitButton>
      </form>
    </Sheet>
  );
}
