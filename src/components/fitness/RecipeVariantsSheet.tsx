import { useState } from "react";
import { motion } from "framer-motion";
import { ChefHat, ChevronLeft, Leaf, Loader2, Save, Sparkles } from "lucide-react";
import { FullscreenSheet } from "@/components/shared/FormComponents";
import { useGenerateRecipeVariants, useSaveRecipeVariantAsRecipe } from "@/hooks/useRecipeVariants";
import type { RecipeWithMacros } from "@/hooks/useRecipes";
import {
  RECIPE_VARIANT_CUSTOM_EXAMPLES,
  type RecipeVariant,
  type RecipeVariantRequestType,
} from "@/lib/nutrition/recipeVariants/types";

const PRESS = { scale: 0.97 };

type Step = "choose" | "custom" | "loading" | "results" | "detail";

/**
 * "✨ Proposer des variantes" — génère 3 variantes IA (sans produits
 * laitiers/plus protéiné/demande personnalisée) en UN appel edge function
 * (`useGenerateRecipeVariants`), les présente sous forme de cartes, et
 * permet d'en enregistrer une comme nouvelle recette indépendante
 * (`useSaveRecipeVariantAsRecipe`) sans jamais modifier la recette
 * originale. Ouverte depuis `RecipeDetailSheet`.
 */
export function RecipeVariantsSheet({
  recipe,
  onClose,
}: {
  recipe: RecipeWithMacros;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [customPrompt, setCustomPrompt] = useState("");
  const [variants, setVariants] = useState<RecipeVariant[] | null>(null);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [savedIndex, setSavedIndex] = useState<number | null>(null);

  const generate = useGenerateRecipeVariants();
  const saveVariant = useSaveRecipeVariantAsRecipe();

  async function runGenerate(requestType: RecipeVariantRequestType, prompt?: string) {
    setStep("loading");
    try {
      const result = await generate.mutateAsync({ recipe, requestType, customPrompt: prompt });
      setVariants(result);
      setSavedIndex(null);
      setStep("results");
    } catch {
      // toast déjà affiché par useGenerateRecipeVariants (onError)
      setStep(customPrompt ? "custom" : "choose");
    }
  }

  function saveAsRecipe(index: number) {
    if (!variants) return;
    saveVariant.mutate(
      { sourceRecipeId: recipe.id, variant: variants[index] },
      { onSuccess: () => setSavedIndex(index) },
    );
  }

  return (
    <FullscreenSheet title="Proposer des variantes" subtitle={recipe.name} onClose={onClose}>
      {step === "choose" && (
        <ChooseStep onSelect={(t) => runGenerate(t)} onCustom={() => setStep("custom")} />
      )}

      {step === "custom" && (
        <CustomStep
          value={customPrompt}
          onChange={setCustomPrompt}
          onBack={() => setStep("choose")}
          onSubmit={() => runGenerate("custom", customPrompt)}
        />
      )}

      {step === "loading" && (
        <div className="flex h-56 flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Génération des variantes…</p>
        </div>
      )}

      {step === "results" && variants && (
        <ResultsStep
          variants={variants}
          savedIndex={savedIndex}
          savingIndex={
            saveVariant.isPending
              ? saveVariant.variables?.variant
                ? variants.indexOf(saveVariant.variables.variant)
                : null
              : null
          }
          onView={(i) => {
            setDetailIndex(i);
            setStep("detail");
          }}
          onSave={saveAsRecipe}
        />
      )}

      {step === "detail" && variants && detailIndex != null && (
        <DetailStep
          variant={variants[detailIndex]}
          saved={savedIndex === detailIndex}
          saving={saveVariant.isPending}
          onBack={() => setStep("results")}
          onSave={() => saveAsRecipe(detailIndex)}
        />
      )}
    </FullscreenSheet>
  );
}

function OptionButton({
  icon,
  label,
  onClick,
  indent,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <motion.button
      whileTap={PRESS}
      type="button"
      onClick={onClick}
      className={`flex h-12 w-full items-center gap-2.5 rounded-xl border border-border bg-card px-4 text-left text-sm font-semibold ${
        indent ? "ml-3" : ""
      }`}
    >
      <span className="text-base">{icon}</span>
      {label}
    </motion.button>
  );
}

function ChooseStep({
  onSelect,
  onCustom,
}: {
  onSelect: (t: RecipeVariantRequestType) => void;
  onCustom: () => void;
}) {
  return (
    <div className="space-y-3 pb-4">
      <p className="text-xs text-muted-foreground">
        Choisis une transformation — l'IA génère 3 variantes complètes (ingrédients, instructions et
        macros recalculées) en une seule fois.
      </p>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-bold">🥛 Sans produits laitiers</p>
        <OptionButton
          icon="🌱"
          label="Remplacer par du végétal"
          onClick={() => onSelect("dairy_free_vegan")}
          indent
        />
        <OptionButton
          icon="🚫"
          label="Supprimer les produits laitiers"
          onClick={() => onSelect("dairy_free_remove")}
          indent
        />
      </div>

      <OptionButton icon="💪" label="Plus protéiné" onClick={() => onSelect("more_protein")} />
      <OptionButton icon="✏️" label="Demande personnalisée" onClick={onCustom} />
    </div>
  );
}

function CustomStep({
  value,
  onChange,
  onBack,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4 pb-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Retour
      </button>

      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Ta demande</span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, 500))}
          maxLength={500}
          rows={3}
          placeholder="Ex. Remplace le poulet par du saumon"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Exemples</p>
        <div className="flex flex-wrap gap-1.5">
          {RECIPE_VARIANT_CUSTOM_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => onChange(ex)}
              className="rounded-full border border-dashed border-border px-3 py-1 text-[11px] font-medium text-muted-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <motion.button
        whileTap={PRESS}
        type="button"
        onClick={onSubmit}
        disabled={!value.trim()}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
      >
        <Sparkles className="h-4 w-4" />
        Générer les variantes
      </motion.button>
    </div>
  );
}

function VariantMacroGrid({ variant }: { variant: RecipeVariant }) {
  const p = variant.perServing;
  const cells: Array<[string, number, string?]> = [
    ["kcal", Math.round(p.calories)],
    ["Prot.", p.proteins, "g"],
    ["Gluc.", p.carbs, "g"],
    ["Lip.", p.fats, "g"],
    ["Fibres", p.fiber, "g"],
  ];
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {cells.map(([label, value, suffix]) => (
        <div
          key={label}
          className="rounded-lg border border-border/60 bg-surface px-1.5 py-1.5 text-center"
        >
          <p className="text-xs font-bold tabular-nums">
            {value}
            {suffix}
          </p>
          <p className="mt-0.5 text-[9px] text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}

function ResultsStep({
  variants,
  savedIndex,
  savingIndex,
  onView,
  onSave,
}: {
  variants: RecipeVariant[];
  savedIndex: number | null;
  savingIndex: number | null;
  onView: (i: number) => void;
  onSave: (i: number) => void;
}) {
  return (
    <div className="space-y-3 pb-4">
      <p className="text-xs text-muted-foreground">
        3 variantes générées — la recette originale n'a pas été modifiée.
      </p>
      {variants.map((v, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-bold leading-tight">{v.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{v.explanation}</p>
          <div className="mt-3">
            <VariantMacroGrid variant={v} />
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onView(i)}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-semibold"
            >
              <ChefHat className="h-3.5 w-3.5" />
              Voir la variante
            </button>
            <button
              type="button"
              onClick={() => onSave(i)}
              disabled={savingIndex === i || savedIndex === i}
              className="flex h-10 flex-[1.2] items-center justify-center gap-1.5 rounded-xl bg-gradient-primary text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              {savingIndex === i ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {savedIndex === i ? "Enregistrée" : "Enregistrer comme nouvelle recette"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailStep({
  variant,
  saved,
  saving,
  onBack,
  onSave,
}: {
  variant: RecipeVariant;
  saved: boolean;
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-4 pb-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Retour aux variantes
      </button>

      <div>
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
          <Leaf className="h-3 w-3" />
          Variante
        </p>
        <h3 className="mt-1 text-lg font-bold leading-tight">{variant.name}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {variant.explanation}
        </p>
      </div>

      <VariantMacroGrid variant={variant} />

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Ingrédients ({variant.servings} portion{variant.servings > 1 ? "s" : ""})
        </p>
        <ul className="mt-2.5 divide-y divide-border/60 rounded-xl border border-border/60">
          {variant.ingredients.map((ing, i) => (
            <li key={`${ing.name}-${i}`} className="flex items-center gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{ing.name}</span>
              <span className="font-medium tabular-nums">{ing.quantity}</span>
              <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                {ing.unit}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Instructions
        </p>
        <p className="mt-2 whitespace-pre-line rounded-xl border border-border/60 bg-surface p-3 text-sm leading-relaxed">
          {variant.instructions}
        </p>
      </div>

      <motion.button
        whileTap={PRESS}
        type="button"
        onClick={onSave}
        disabled={saving || saved}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saved ? "Enregistrée comme nouvelle recette" : "Enregistrer comme nouvelle recette"}
      </motion.button>
    </div>
  );
}
