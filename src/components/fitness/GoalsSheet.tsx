import { useEffect, useRef, useState } from "react";
import { Calculator, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { useUpsertNutritionGoals, type NutritionGoals } from "@/hooks/use-fitness";
import { Field, Sheet, SubmitButton } from "@/components/shared/FormComponents";

interface GoalsSheetProps {
  current: NutritionGoals | null;
  onClose: () => void;
}

const GOAL_DELTAS = [
  { value: "seche", label: "Sèche (−300 kcal)", delta: -300 },
  { value: "maintien", label: "Maintien", delta: 0 },
  { value: "prise", label: "Prise de masse (+300 kcal)", delta: 300 },
];

const ACTIVITY_LEVELS = [
  { value: "1.2",   label: "Sédentaire (peu ou pas d'exercice)" },
  { value: "1.375", label: "Légèrement actif (1-3 j/sem)" },
  { value: "1.55",  label: "Modérément actif (3-5 j/sem)" },
  { value: "1.725", label: "Très actif (6-7 j/sem)" },
  { value: "1.9",   label: "Extrêmement actif (sport + travail physique)" },
];

/** Répartition standard : 35% protéines · 32% glucides · 33% lipides */
function computeMacrosFromCalories(kcal: number) {
  return {
    proteins: Math.round((kcal * 0.35) / 4),
    carbs: Math.round((kcal * 0.32) / 4),
    fats: Math.round((kcal * 0.33) / 9),
  };
}

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

  const [showCalc, setShowCalc] = useState(false);
  const [calc, setCalc] = useState({ sex: "homme", age: "", weight: "", height: "", activity: "1.55", goal: "maintien" });
  const [tdeeResult, setTdeeResult] = useState<{ tdee: number; proteins: number; carbs: number; fats: number } | null>(null);

  const computeTDEE = () => {
    const age = Number(calc.age);
    const w = Number(calc.weight);
    const h = Number(calc.height);
    const act = Number(calc.activity);
    if (!age || !w || !h || age <= 0 || w <= 0 || h <= 0) return;
    const bmr = calc.sex === "homme"
      ? 10 * w + 6.25 * h - 5 * age + 5
      : 10 * w + 6.25 * h - 5 * age - 161;
    const delta = GOAL_DELTAS.find((g) => g.value === calc.goal)?.delta ?? 0;
    const tdee = Math.max(1200, Math.round(bmr * act) + delta);
    const proteins = Math.round(w * 1.8);
    const fats = Math.round(w * 1.0);
    const carbs = Math.max(0, Math.round((tdee - proteins * 4 - fats * 9) / 4));
    setTdeeResult({ tdee, proteins, carbs, fats });
  };

  const applyTDEE = () => {
    if (!tdeeResult) return;
    const next = {
      calories: String(tdeeResult.tdee),
      proteins: String(tdeeResult.proteins),
      carbs: String(tdeeResult.carbs),
      fats: String(tdeeResult.fats),
    };
    setForm(next);
    lastAutoRef.current = { proteins: next.proteins, carbs: next.carbs, fats: next.fats };
    setMacrosCustomized(false);
    setShowRecalcPrompt(false);
    setPulseKey((k) => k + 1);
    setShowCalc(false);
    setTdeeResult(null);
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

        {/* Calculateur TDEE */}
        <div className="rounded-xl border border-border bg-surface">
          <button
            type="button"
            onClick={() => setShowCalc((s) => !s)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-xs font-semibold text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Calculator className="h-3.5 w-3.5 text-primary" />
              Calculer mes besoins (TDEE)
            </span>
            {showCalc ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showCalc && (
            <div className="space-y-3 border-t border-border px-3 pb-3 pt-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sexe</label>
                  <select value={calc.sex} onChange={(e) => setCalc({ ...calc, sex: e.target.value })}
                    className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-base outline-none focus:border-primary">
                    <option value="homme">Homme</option>
                    <option value="femme">Femme</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Âge</label>
                  <input type="text" inputMode="numeric" value={calc.age}
                    onChange={(e) => setCalc({ ...calc, age: e.target.value })}
                    autoComplete="off" placeholder="ans" className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-base outline-none focus:border-primary" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Poids (kg)</label>
                  <input type="text" inputMode="decimal" value={calc.weight}
                    onChange={(e) => setCalc({ ...calc, weight: e.target.value })}
                    autoComplete="off" placeholder="kg" className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-base outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Taille (cm)</label>
                  <input type="text" inputMode="numeric" value={calc.height}
                    onChange={(e) => setCalc({ ...calc, height: e.target.value })}
                    autoComplete="off" placeholder="cm" className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-base outline-none focus:border-primary" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Objectif</label>
                <select value={calc.goal} onChange={(e) => setCalc({ ...calc, goal: e.target.value })}
                  className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-base outline-none focus:border-primary">
                  {GOAL_DELTAS.map((g) => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Niveau d'activité</label>
                <select value={calc.activity} onChange={(e) => setCalc({ ...calc, activity: e.target.value })}
                  className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-base outline-none focus:border-primary">
                  {ACTIVITY_LEVELS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>

              {tdeeResult && (
                <div className="rounded-xl bg-primary/10 px-3 py-2 text-center text-xs">
                  <p className="font-bold text-primary text-sm">{tdeeResult.tdee} kcal/j</p>
                  <p className="text-muted-foreground mt-0.5">
                    P{tdeeResult.proteins}g · G{tdeeResult.carbs}g · L{tdeeResult.fats}g
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={computeTDEE}
                  className="flex-1 rounded-xl border border-border bg-card py-2 text-xs font-semibold text-foreground">
                  Calculer
                </button>
                {tdeeResult && (
                  <button type="button" onClick={applyTDEE}
                    className="flex-1 rounded-xl bg-gradient-primary py-2 text-xs font-semibold text-primary-foreground shadow-glow">
                    Appliquer
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

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
              Les macros ont été personnalisées. Souhaitez-vous les recalculer selon votre nouvel objectif calorique ?
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
            label="Prot. (g)"
            type="number"
            step="0.1"
            value={form.proteins}
            onChange={(v) => onMacroChange("proteins", v)}
          />
          <Field
            label="Gluc. (g)"
            type="number"
            step="0.1"
            value={form.carbs}
            onChange={(v) => onMacroChange("carbs", v)}
          />
          <Field
            label="Lip. (g)"
            type="number"
            step="0.1"
            value={form.fats}
            onChange={(v) => onMacroChange("fats", v)}
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
