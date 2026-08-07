import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Instagram,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { FullscreenSheet } from "@/components/shared/FormComponents";
import { MealSelect } from "@/components/fitness/MealSelect";
import { useAddNutrition } from "@/hooks/useNutritionData";
import { detectMealFromHour, type MealSlug } from "@/lib/nutrition/meals";
import {
  IMPORT_STAGES,
  RECIPE_IMPORTERS,
  confidenceLabel,
  resolveImporter,
  totalMacros,
  type ImportedRecipe,
} from "@/lib/nutrition/recipeImport";

type Phase = "input" | "running" | "result";

const PRESS = { scale: 0.97 };

export function RecipeImportSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [doneStages, setDoneStages] = useState<string[]>([]);
  const [recipe, setRecipe] = useState<ImportedRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [meal, setMeal] = useState<MealSlug>(() => detectMealFromHour());
  const [servingsToLog, setServingsToLog] = useState(1);
  const cancelled = useRef(false);

  const addNutrition = useAddNutrition();

  const comingSoon = useMemo(() => RECIPE_IMPORTERS.filter((i) => !i.available), []);

  async function analyse() {
    const value = url.trim();
    const importer = resolveImporter({ kind: "url", value });
    if (!importer) {
      setError("Ce lien n'est pas reconnu. Colle un lien Instagram (Reel ou publication).");
      return;
    }
    if (!importer.available) {
      setError(`${importer.label} arrive bientôt. Pour l'instant, seul Instagram est disponible.`);
      return;
    }
    setError(null);
    setDoneStages([]);
    setActiveStage(null);
    setPhase("running");
    cancelled.current = false;
    try {
      const result = await importer.run({ kind: "url", value }, (stageKey) => {
        if (cancelled.current) return;
        setActiveStage((prev) => {
          if (prev) setDoneStages((d) => (d.includes(prev) ? d : [...d, prev]));
          return stageKey;
        });
      });
      if (cancelled.current) return;
      setDoneStages(IMPORT_STAGES.map((s) => s.key));
      setActiveStage(null);
      setRecipe(result);
      setServingsToLog(1);
      setPhase("result");
    } catch {
      if (cancelled.current) return;
      setError("L'analyse a échoué. Réessaie dans un instant.");
      setPhase("input");
    }
  }

  function reset() {
    cancelled.current = true;
    setPhase("input");
    setRecipe(null);
    setEditing(false);
    setActiveStage(null);
    setDoneStages([]);
  }

  function logToJournal() {
    if (!recipe) return;
    const s = servingsToLog > 0 ? servingsToLog : 1;
    const p = recipe.perServing;
    addNutrition.mutate(
      {
        date,
        meal,
        name: recipe.title,
        calories: Math.round(p.calories * s),
        proteins: Math.round(p.proteins * s * 10) / 10,
        carbs: Math.round(p.carbs * s * 10) / 10,
        fats: Math.round(p.fats * s * 10) / 10,
        base_calories: Math.round(p.calories),
        base_proteins: Math.round(p.proteins * 10) / 10,
        base_carbs: Math.round(p.carbs * 10) / 10,
        base_fats: Math.round(p.fats * 10) / 10,
        serving_count: s,
        percentage_consumed: 100,
      },
      { onSuccess: onClose },
    );
  }

  function patchRecipe(patch: Partial<ImportedRecipe>) {
    setRecipe((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  return (
    <FullscreenSheet
      title="Importer une recette"
      subtitle={phase === "result" ? "Fiche générée" : "Instagram · Reel ou publication"}
      onClose={onClose}
    >
      <AnimatePresence mode="wait">
        {phase === "input" && (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-5"
          >
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Instagram className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold">Lien Instagram</p>
                  <p className="text-xs text-muted-foreground">
                    Colle l'adresse d'un Reel ou d'une publication de recette.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={url}
                  maxLength={500}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setError(null);
                  }}
                  placeholder="https://www.instagram.com/reel/…"
                  className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              {error && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}

              <motion.button
                whileTap={PRESS}
                type="button"
                onClick={analyse}
                disabled={url.trim().length === 0}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-40"
              >
                <Sparkles className="h-4 w-4" />
                Analyser
              </motion.button>

              <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
                V1 : l'analyse est simulée. Le téléchargement et l'IA réels arriveront ensuite, sans
                changer cet écran.
              </p>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Bientôt
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {comingSoon.map((imp) => (
                  <span
                    key={imp.kind}
                    className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted-foreground"
                  >
                    {imp.label}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {phase === "running" && (
          <motion.div
            key="running"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <p className="text-sm font-bold">Analyse en cours</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Ne quitte pas cet écran.</p>

            <ul className="mt-5 space-y-3">
              {IMPORT_STAGES.map((stage) => {
                const done = doneStages.includes(stage.key);
                const active = activeStage === stage.key;
                return (
                  <li key={stage.key} className="flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                        done
                          ? "border-primary bg-primary/15 text-primary"
                          : active
                            ? "border-primary text-primary"
                            : "border-border text-muted-foreground"
                      }`}
                    >
                      {done ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : active ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      )}
                    </span>
                    <span
                      className={`text-sm ${done || active ? "font-medium text-foreground" : "text-muted-foreground"}`}
                    >
                      {stage.label}
                    </span>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={reset}
              className="mt-6 w-full rounded-xl border border-border py-2.5 text-sm text-muted-foreground"
            >
              Annuler
            </button>
          </motion.div>
        )}

        {phase === "result" && recipe && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4 pb-4"
          >
            <RecipeResultCard
              recipe={recipe}
              editing={editing}
              onPatch={patchRecipe}
              onToggleEdit={() => setEditing((v) => !v)}
            />

            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-bold">Ajouter à mon journal</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <MealSelect value={meal} onChange={setMeal} />
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    Portions
                  </span>
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={servingsToLog}
                    onChange={(e) => setServingsToLog(Number(e.target.value))}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </label>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {Math.round(recipe.perServing.calories * (servingsToLog || 1))} kcal seront
                enregistrées.
              </p>

              <div className="mt-4 flex gap-2.5">
                <motion.button
                  whileTap={PRESS}
                  type="button"
                  onClick={() => {
                    setEditing((v) => !v);
                    if (!editing) toast.info("Ajuste les valeurs puis valide.");
                  }}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold"
                >
                  <Pencil className="h-4 w-4" />
                  {editing ? "Terminer" : "Modifier"}
                </motion.button>
                <motion.button
                  whileTap={PRESS}
                  type="button"
                  onClick={logToJournal}
                  disabled={addNutrition.isPending}
                  className="flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
                >
                  {addNutrition.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Ajouter à mon journal
                </motion.button>
              </div>

              <button
                type="button"
                onClick={reset}
                className="mt-3 w-full py-2 text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Importer une autre recette
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </FullscreenSheet>
  );
}

function RecipeResultCard({
  recipe,
  editing,
  onPatch,
  onToggleEdit,
}: {
  recipe: ImportedRecipe;
  editing: boolean;
  onPatch: (patch: Partial<ImportedRecipe>) => void;
  onToggleEdit: () => void;
}) {
  const total = totalMacros(recipe);
  const conf = confidenceLabel(recipe.confidence);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      {recipe.imageUrl && (
        <div className="relative h-44 w-full">
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
          <span className="absolute right-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground backdrop-blur">
            Confiance {conf}
          </span>
        </div>
      )}

      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                value={recipe.title}
                maxLength={120}
                onChange={(e) => onPatch({ title: e.target.value })}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
              />
            ) : (
              <h2 className="text-lg font-bold leading-tight tracking-tight">{recipe.title}</h2>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {recipe.servings} portion{recipe.servings > 1 ? "s" : ""} · {total.calories} kcal au
              total
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleEdit}
            aria-label="Modifier la fiche"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>

        {editing && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Nombre de portions
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={recipe.servings}
              onChange={(e) => onPatch({ servings: Math.max(1, Number(e.target.value) || 1) })}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
        )}

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Par portion
          </p>
          <div className="mt-2.5 grid grid-cols-5 gap-2">
            <MacroCell
              label="kcal"
              value={recipe.perServing.calories}
              editing={editing}
              onChange={(v) => onPatch({ perServing: { ...recipe.perServing, calories: v } })}
            />
            <MacroCell
              label="Prot."
              value={recipe.perServing.proteins}
              suffix="g"
              editing={editing}
              onChange={(v) => onPatch({ perServing: { ...recipe.perServing, proteins: v } })}
            />
            <MacroCell
              label="Gluc."
              value={recipe.perServing.carbs}
              suffix="g"
              editing={editing}
              onChange={(v) => onPatch({ perServing: { ...recipe.perServing, carbs: v } })}
            />
            <MacroCell
              label="Lip."
              value={recipe.perServing.fats}
              suffix="g"
              editing={editing}
              onChange={(v) => onPatch({ perServing: { ...recipe.perServing, fats: v } })}
            />
            <MacroCell
              label="Fibres"
              value={recipe.perServing.fiber}
              suffix="g"
              editing={editing}
              onChange={(v) => onPatch({ perServing: { ...recipe.perServing, fiber: v } })}
            />
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Ingrédients
          </p>
          <ul className="mt-2.5 divide-y divide-border/60 rounded-xl border border-border/60">
            {recipe.ingredients.map((ing, i) => (
              <li key={`${ing.name}-${i}`} className="flex items-center gap-2 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">{ing.name}</span>
                {editing ? (
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={ing.quantity}
                    onChange={(e) => {
                      const next = recipe.ingredients.map((it, idx) =>
                        idx === i ? { ...it, quantity: Number(e.target.value) } : it,
                      );
                      onPatch({ ingredients: next });
                    }}
                    className="w-20 rounded-lg border border-border bg-surface px-2 py-1 text-right text-sm outline-none focus:border-primary"
                  />
                ) : (
                  <span className="text-sm font-medium tabular-nums">{ing.quantity}</span>
                )}
                <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                  {ing.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border/60 bg-surface p-3">
          <p className="text-xs font-semibold">Niveau de confiance : {conf}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-primary"
              style={{ width: `${Math.round(recipe.confidence * 100)}%` }}
            />
          </div>
          {recipe.notes && (
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{recipe.notes}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MacroCell({
  label,
  value,
  suffix,
  editing,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  editing: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface px-2 py-2 text-center">
      {editing ? (
        <input
          type="number"
          min={0}
          step={0.1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full bg-transparent text-center text-sm font-bold tabular-nums outline-none"
        />
      ) : (
        <p className="text-sm font-bold tabular-nums">
          {value}
          {suffix}
        </p>
      )}
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
