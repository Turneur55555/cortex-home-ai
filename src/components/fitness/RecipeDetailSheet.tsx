import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, ExternalLink, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { FullscreenSheet } from "@/components/shared/FormComponents";
import { MealSelect } from "@/components/fitness/MealSelect";
import { useAddNutrition } from "@/hooks/useNutritionData";
import { detectMealFromHour, type MealSlug } from "@/lib/nutrition/meals";
import { scaleServings } from "@/lib/nutrition/recipes";
import { confidenceLabel } from "@/lib/nutrition/recipeImport";
import {
  useRecipe,
  useUpdateRecipe,
  useDeleteRecipe,
  useDuplicateRecipe,
  useToggleRecipeFavorite,
  type RecipeIngredientPatch,
} from "@/hooks/useRecipes";

const PRESS = { scale: 0.97 };

interface EditDraft {
  name: string;
  servings: number;
  calories: number;
  proteins: number;
  carbs: number;
  fats: number;
  fiber: number;
  ingredients: RecipeIngredientPatch[];
}

/**
 * Fiche recette complète — journal / modifier / dupliquer / favori /
 * supprimer. Consommée depuis RecipesListSheet (module "Recettes").
 */
export function RecipeDetailSheet({
  recipeId,
  date,
  onClose,
}: {
  recipeId: string;
  date: string;
  onClose: () => void;
}) {
  const { data: recipe, isLoading } = useRecipe(recipeId);
  const updateRecipe = useUpdateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const duplicateRecipe = useDuplicateRecipe();
  const toggleFavorite = useToggleRecipeFavorite();
  const addNutrition = useAddNutrition();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [meal, setMeal] = useState<MealSlug>(() => detectMealFromHour());
  const [servingsToLog, setServingsToLog] = useState(1);

  function startEditing() {
    if (!recipe) return;
    setDraft({
      name: recipe.name,
      servings: recipe.servings,
      calories: recipe.perServingMacros.calories,
      proteins: recipe.perServingMacros.protein,
      carbs: recipe.perServingMacros.carbs,
      fats: recipe.perServingMacros.fat,
      fiber: recipe.per_serving_fiber ?? 0,
      ingredients: recipe.ingredients.map((i) => ({
        name: i.name,
        quantity: i.quantity ?? 0,
        unit: i.unit ?? "pièce",
        grams: i.grams,
      })),
    });
    setEditing(true);
  }

  function saveEdits() {
    if (!draft) return;
    updateRecipe.mutate(
      {
        id: recipeId,
        name: draft.name,
        servings: draft.servings,
        per_serving_calories: draft.calories,
        per_serving_proteins: draft.proteins,
        per_serving_carbs: draft.carbs,
        per_serving_fats: draft.fats,
        per_serving_fiber: draft.fiber,
        ingredients: draft.ingredients,
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  function logToJournal() {
    if (!recipe) return;
    const s = servingsToLog > 0 ? servingsToLog : 1;
    const p = recipe.perServingMacros;
    const scaled = scaleServings(p, s);
    addNutrition.mutate(
      {
        date,
        meal,
        name: recipe.name,
        calories: Math.round(scaled.calories),
        proteins: Math.round(scaled.protein * 10) / 10,
        carbs: Math.round(scaled.carbs * 10) / 10,
        fats: Math.round(scaled.fat * 10) / 10,
        base_calories: Math.round(p.calories),
        base_proteins: Math.round(p.protein * 10) / 10,
        base_carbs: Math.round(p.carbs * 10) / 10,
        base_fats: Math.round(p.fat * 10) / 10,
        serving_count: s,
        percentage_consumed: 100,
        recipe_id: recipeId,
      },
      { onSuccess: onClose },
    );
  }

  function confirmAndDelete() {
    deleteRecipe.mutate(recipeId, { onSuccess: onClose });
  }

  if (isLoading || !recipe) {
    return (
      <FullscreenSheet title="Fiche recette" onClose={onClose}>
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </FullscreenSheet>
    );
  }

  const conf = confidenceLabel(recipe.confidence ?? 0.5);
  const perS = recipe.perServingMacros;
  const scaled = scaleServings(perS, servingsToLog || 1);

  return (
    <FullscreenSheet title={recipe.name} subtitle="Fiche recette" onClose={onClose}>
      <div className="space-y-4 pb-4">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {recipe.source_image_url && (
            <div className="relative h-44 w-full">
              <img
                src={recipe.source_image_url}
                alt={recipe.name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
              {recipe.confidence != null && (
                <span className="absolute right-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground backdrop-blur">
                  Confiance {conf}
                </span>
              )}
              <button
                type="button"
                onClick={() =>
                  toggleFavorite.mutate({ id: recipe.id, isFavorite: !recipe.is_favorite })
                }
                aria-label={recipe.is_favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 backdrop-blur active:scale-90"
              >
                <Star
                  className={`h-4 w-4 ${recipe.is_favorite ? "fill-primary text-primary" : "text-foreground"}`}
                />
              </button>
            </div>
          )}

          <div className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {editing ? (
                  <input
                    value={draft?.name ?? ""}
                    maxLength={120}
                    onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
                  />
                ) : (
                  <h2 className="text-lg font-bold leading-tight tracking-tight">{recipe.name}</h2>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {recipe.servings} portion{recipe.servings > 1 ? "s" : ""} ·{" "}
                  {Math.round(perS.calories * recipe.servings)} kcal au total
                </p>
              </div>
              {!recipe.source_image_url && (
                <button
                  type="button"
                  onClick={() =>
                    toggleFavorite.mutate({ id: recipe.id, isFavorite: !recipe.is_favorite })
                  }
                  aria-label={recipe.is_favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border"
                >
                  <Star
                    className={`h-4 w-4 ${recipe.is_favorite ? "fill-primary text-primary" : "text-muted-foreground"}`}
                  />
                </button>
              )}
            </div>

            {recipe.source_url && (
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-medium text-primary"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Voir la publication Instagram
              </a>
            )}

            {recipe.source_description && (
              <div className="rounded-xl border border-border/60 bg-surface p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Description originale
                </p>
                <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                  {recipe.source_description}
                </p>
              </div>
            )}

            {editing && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Nombre de portions
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={draft?.servings ?? 1}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, servings: Math.max(1, Number(e.target.value) || 1) } : d,
                    )
                  }
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
                  value={editing ? (draft?.calories ?? 0) : perS.calories}
                  editing={editing}
                  onChange={(v) => setDraft((d) => (d ? { ...d, calories: v } : d))}
                />
                <MacroCell
                  label="Prot."
                  value={editing ? (draft?.proteins ?? 0) : perS.protein}
                  suffix="g"
                  editing={editing}
                  onChange={(v) => setDraft((d) => (d ? { ...d, proteins: v } : d))}
                />
                <MacroCell
                  label="Gluc."
                  value={editing ? (draft?.carbs ?? 0) : perS.carbs}
                  suffix="g"
                  editing={editing}
                  onChange={(v) => setDraft((d) => (d ? { ...d, carbs: v } : d))}
                />
                <MacroCell
                  label="Lip."
                  value={editing ? (draft?.fats ?? 0) : perS.fat}
                  suffix="g"
                  editing={editing}
                  onChange={(v) => setDraft((d) => (d ? { ...d, fats: v } : d))}
                />
                <MacroCell
                  label="Fibres"
                  value={editing ? (draft?.fiber ?? 0) : (recipe.per_serving_fiber ?? 0)}
                  suffix="g"
                  editing={editing}
                  onChange={(v) => setDraft((d) => (d ? { ...d, fiber: v } : d))}
                />
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Ingrédients
              </p>
              <ul className="mt-2.5 divide-y divide-border/60 rounded-xl border border-border/60">
                {(editing ? draft?.ingredients : recipe.ingredients)?.map((ing, i) => (
                  <li key={`${ing.name}-${i}`} className="flex items-center gap-2 px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{ing.name}</span>
                    {editing ? (
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={ing.quantity ?? 0}
                        onChange={(e) => {
                          const q = Number(e.target.value);
                          setDraft((d) => {
                            if (!d) return d;
                            const next = d.ingredients.map((it, idx) =>
                              idx === i ? { ...it, quantity: q } : it,
                            );
                            return { ...d, ingredients: next };
                          });
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

            {recipe.confidence != null && (
              <div className="rounded-xl border border-border/60 bg-surface p-3">
                <p className="text-xs font-semibold">Niveau de confiance : {conf}</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-primary"
                    style={{ width: `${Math.round((recipe.confidence ?? 0) * 100)}%` }}
                  />
                </div>
                {recipe.notes && (
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                    {recipe.notes}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <motion.button
            whileTap={PRESS}
            type="button"
            onClick={editing ? saveEdits : startEditing}
            disabled={updateRecipe.isPending}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold disabled:opacity-60"
          >
            {updateRecipe.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pencil className="h-4 w-4" />
            )}
            {editing ? "Enregistrer" : "Modifier"}
          </motion.button>
          <motion.button
            whileTap={PRESS}
            type="button"
            onClick={() => duplicateRecipe.mutate(recipeId)}
            disabled={duplicateRecipe.isPending || editing}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold disabled:opacity-60"
          >
            {duplicateRecipe.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Dupliquer
          </motion.button>
        </div>

        {!editing && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-bold">Ajouter au journal</p>
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
              {Math.round(scaled.calories)} kcal seront enregistrées.
            </p>
            <motion.button
              whileTap={PRESS}
              type="button"
              onClick={logToJournal}
              disabled={addNutrition.isPending}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
            >
              {addNutrition.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Ajouter au journal
            </motion.button>
          </div>
        )}

        {!editing && (
          <div>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-center justify-center gap-2 py-2 text-xs font-medium text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer cette recette
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
                <p className="flex-1 text-xs text-destructive">
                  Supprimer définitivement cette recette ?
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={confirmAndDelete}
                  disabled={deleteRecipe.isPending}
                  className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground disabled:opacity-60"
                >
                  Supprimer
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </FullscreenSheet>
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
