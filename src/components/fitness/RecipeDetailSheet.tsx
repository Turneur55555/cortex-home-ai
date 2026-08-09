import { useState } from "react";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Calendar,
  ChefHat,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Star,
  Trash2,
  User,
  X,
} from "lucide-react";
import { FullscreenSheet } from "@/components/shared/FormComponents";
import { MealSelect } from "@/components/fitness/MealSelect";
import { AddToShoppingListSheet } from "@/components/fitness/AddToShoppingListSheet";
import { RecipeVariantsSheet } from "@/components/fitness/RecipeVariantsSheet";
import { useAddNutrition } from "@/hooks/useNutritionData";
import {
  useCollections,
  useRecipeCollectionIds,
  useAddRecipeToCollection,
  useRemoveRecipeFromCollection,
} from "@/hooks/useCollections";
import { detectMealFromHour, type MealSlug } from "@/lib/nutrition/meals";
import { scaleServings } from "@/lib/nutrition/recipes";
import {
  confidenceLabel,
  RECIPE_TAGS,
  type ImportedRecipe,
  type RecipeSourceKind,
} from "@/lib/nutrition/recipeImport";
import {
  useRecipe,
  useUpdateRecipe,
  useDeleteRecipe,
  useDuplicateRecipe,
  useToggleRecipeFavorite,
  useReanalyzeRecipe,
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

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Recalcule proportionnellement les macros/portion selon la variation de la masse totale d'ingrédients. */
function rescaleAfterGramsChange(
  draft: EditDraft,
  prevIngredients: RecipeIngredientPatch[],
): EditDraft {
  const prevTotal = prevIngredients.reduce((s, i) => s + (i.grams ?? 0), 0);
  const nextTotal = draft.ingredients.reduce((s, i) => s + (i.grams ?? 0), 0);
  if (prevTotal <= 0 || nextTotal <= 0) return draft;
  const ratio = nextTotal / prevTotal;
  return {
    ...draft,
    calories: Math.round(draft.calories * ratio),
    proteins: round1(draft.proteins * ratio),
    carbs: round1(draft.carbs * ratio),
    fats: round1(draft.fats * ratio),
    fiber: round1(draft.fiber * ratio),
  };
}

function formatImportDate(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy", { locale: fr });
  } catch {
    return iso;
  }
}

/**
 * Fiche recette premium — bibliothèque personnelle enrichie par l'IA. En-tête
 * (miniature/auteur/lien/date/confiance), description originale + résumé IA
 * (jamais fusionnés), infos recette, ingrédients éditables (recalcul macros
 * proportionnel), tags modifiables, actions (journal/modifier/dupliquer/
 * favori/supprimer/réanalyser) + historique. Consommée depuis
 * RecipesListSheet (module "Recettes").
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
  const reanalyze = useReanalyzeRecipe();
  const addNutrition = useAddNutrition();
  const { data: collections } = useCollections();
  const { data: memberCollectionIds } = useRecipeCollectionIds(recipeId);
  const addToCollection = useAddRecipeToCollection();
  const removeFromCollection = useRemoveRecipeFromCollection();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [meal, setMeal] = useState<MealSlug>(() => detectMealFromHour());
  const [servingsToLog, setServingsToLog] = useState(1);
  const [comparison, setComparison] = useState<ImportedRecipe | null>(null);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);

  function toggleCollection(collectionId: string) {
    const isMember = (memberCollectionIds ?? []).includes(collectionId);
    if (isMember) removeFromCollection.mutate({ collectionId, recipeId });
    else addToCollection.mutate({ collectionId, recipeId });
  }

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
        category: i.category,
      })),
    });
    setEditing(true);
  }

  function updateIngredientGrams(idx: number, grams: number | null) {
    setDraft((d) => {
      if (!d) return d;
      const nextIngredients = d.ingredients.map((it, i) => (i === idx ? { ...it, grams } : it));
      return rescaleAfterGramsChange({ ...d, ingredients: nextIngredients }, d.ingredients);
    });
  }

  function updateIngredientQuantity(idx: number, quantity: number) {
    setDraft((d) => {
      if (!d) return d;
      const nextIngredients = d.ingredients.map((it, i) => (i === idx ? { ...it, quantity } : it));
      return { ...d, ingredients: nextIngredients };
    });
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

  function toggleTag(tag: string) {
    if (!recipe) return;
    const current = recipe.tags ?? [];
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    updateRecipe.mutate({ id: recipeId, tags: next });
  }

  async function runReanalysis() {
    if (!recipe || !recipe.source_url || !recipe.source_kind) return;
    try {
      const fresh = await reanalyze.mutateAsync({
        recipeId,
        sourceKind: recipe.source_kind as RecipeSourceKind,
        sourceUrl: recipe.source_url,
      });
      setComparison(fresh);
    } catch {
      // toast déjà affiché par useReanalyzeRecipe (onError)
    }
  }

  function applyReanalysis() {
    if (!comparison) return;
    updateRecipe.mutate(
      {
        id: recipeId,
        name: comparison.title,
        servings: comparison.servings,
        per_serving_calories: comparison.perServing.calories,
        per_serving_proteins: comparison.perServing.proteins,
        per_serving_carbs: comparison.perServing.carbs,
        per_serving_fats: comparison.perServing.fats,
        per_serving_fiber: comparison.perServing.fiber,
        tags: comparison.tags,
        ai_summary: comparison.aiSummary,
        prep_minutes: comparison.prepMinutes,
        cook_minutes: comparison.cookMinutes,
        ingredients: comparison.ingredients.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          grams: i.grams,
          category: i.category,
        })),
      },
      { onSuccess: () => setComparison(null) },
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
  const canReanalyze = !!recipe.source_url && !!recipe.source_kind;
  const availableTags = RECIPE_TAGS.filter((t) => !(recipe.tags ?? []).includes(t));

  return (
    <FullscreenSheet title={recipe.name} subtitle="Fiche recette" onClose={onClose}>
      <div className="space-y-4 pb-4">
        {/* ─── En-tête ────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {recipe.source_image_url && (
            <div className="relative h-48 w-full">
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
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {recipe.source_author && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />@{recipe.source_author}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Importée le {formatImportDate(recipe.created_at)}
                  </span>
                </div>
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
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-primary"
              >
                <ExternalLink className="h-4 w-4" />
                Voir le Reel Instagram
              </a>
            )}

            {/* ─── Description ─────────────────────────────────────────── */}
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

            {recipe.ai_summary && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                  <Sparkles className="h-3 w-3" />
                  Résumé IA
                </p>
                <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-foreground/90">
                  {recipe.ai_summary}
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

            {/* ─── Infos recette ────────────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Par portion
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {recipe.servings} portion{recipe.servings > 1 ? "s" : ""} ·{" "}
                  {Math.round(perS.calories * recipe.servings)} kcal au total
                </p>
              </div>
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
              {(recipe.prep_minutes != null || recipe.cook_minutes != null) && (
                <div className="mt-2.5 flex gap-2">
                  {recipe.prep_minutes != null && (
                    <span className="flex items-center gap-1.5 rounded-full border border-border/60 bg-surface px-3 py-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Préparation {recipe.prep_minutes} min
                    </span>
                  )}
                  {recipe.cook_minutes != null && (
                    <span className="flex items-center gap-1.5 rounded-full border border-border/60 bg-surface px-3 py-1 text-[11px] text-muted-foreground">
                      <Flame className="h-3 w-3" />
                      Cuisson {recipe.cook_minutes} min
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ─── Ingrédients ──────────────────────────────────────────── */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Ingrédients
              </p>
              <ul className="mt-2.5 divide-y divide-border/60 rounded-xl border border-border/60">
                {(editing ? draft?.ingredients : recipe.ingredients)?.map((ing, i) => (
                  <li key={`${ing.name}-${i}`} className="flex items-center gap-2 px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{ing.name}</span>
                    {editing ? (
                      <>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={ing.quantity ?? 0}
                          onChange={(e) => updateIngredientQuantity(i, Number(e.target.value))}
                          aria-label={`Quantité de ${ing.name}`}
                          className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-right text-sm outline-none focus:border-primary"
                        />
                        <span className="shrink-0 text-xs text-muted-foreground">{ing.unit}</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={ing.grams ?? ""}
                          placeholder="—"
                          onChange={(e) =>
                            updateIngredientGrams(
                              i,
                              e.target.value === "" ? null : Number(e.target.value),
                            )
                          }
                          aria-label={`Masse en grammes de ${ing.name}`}
                          className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-right text-sm outline-none focus:border-primary"
                        />
                        <span className="shrink-0 text-xs text-muted-foreground">g</span>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-medium tabular-nums">{ing.quantity}</span>
                        <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                          {ing.unit}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {editing && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Modifier les grammes recalcule automatiquement les macros par portion.
                </p>
              )}
            </div>

            {/* ─── Tags ─────────────────────────────────────────────────── */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Tags
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {(recipe.tags ?? []).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                  >
                    {tag}
                    <X className="h-3 w-3" />
                  </button>
                ))}
                {availableTags.length > 0 && (
                  <details className="relative">
                    <summary className="flex cursor-pointer list-none items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                      <Plus className="h-3 w-3" />
                      Ajouter
                    </summary>
                    <div className="absolute left-0 top-full z-10 mt-1.5 flex w-48 flex-wrap gap-1.5 rounded-xl border border-border bg-card p-2 shadow-elevated">
                      {availableTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>

            {/* ─── Collections ──────────────────────────────────────────── */}
            {!editing && (collections?.length ?? 0) > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Collections
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {(collections ?? []).map((c) => {
                    const active = (memberCollectionIds ?? []).includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCollection(c.id)}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          active
                            ? "bg-primary/10 text-primary"
                            : "border border-dashed border-border text-muted-foreground"
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {recipe.confidence != null && recipe.notes && (
              <div className="rounded-xl border border-border/60 bg-surface p-3">
                <p className="text-xs font-semibold">Niveau de confiance : {conf}</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-primary"
                    style={{ width: `${Math.round((recipe.confidence ?? 0) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  {recipe.notes}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ─── Comparaison de réanalyse ─────────────────────────────────── */}
        {comparison && (
          <ReanalysisComparison
            oldConfidence={recipe.confidence ?? 0.5}
            oldCalories={perS.calories}
            oldIngredientCount={recipe.ingredients.length}
            fresh={comparison}
            onApply={applyReanalysis}
            onDismiss={() => setComparison(null)}
            applying={updateRecipe.isPending}
          />
        )}

        {/* ─── Actions ──────────────────────────────────────────────────── */}
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
          <motion.button
            whileTap={PRESS}
            type="button"
            onClick={() => setShoppingOpen(true)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-primary"
          >
            <ShoppingCart className="h-4 w-4" />
            Ajouter à la liste de courses
          </motion.button>
        )}

        {!editing && (
          <motion.button
            whileTap={PRESS}
            type="button"
            onClick={() => setVariantsOpen(true)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 text-sm font-semibold text-primary"
          >
            <span aria-hidden>✨</span>
            Proposer des variantes
          </motion.button>
        )}

        {canReanalyze && !editing && (
          <motion.button
            whileTap={PRESS}
            type="button"
            onClick={runReanalysis}
            disabled={reanalyze.isPending || !!comparison}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-semibold text-muted-foreground disabled:opacity-60"
          >
            {reanalyze.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Réanalyser la recette
          </motion.button>
        )}

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

        {/* ─── Historique ───────────────────────────────────────────────── */}
        {!editing && (
          <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            <History className="h-3 w-3 shrink-0" />
            <span>
              Importée le {formatImportDate(recipe.created_at)}
              {recipe.last_reanalyzed_at &&
                ` · Réanalysée le ${formatImportDate(recipe.last_reanalyzed_at)} (${recipe.reanalysis_count}×)`}
            </span>
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

      {shoppingOpen && (
        <AddToShoppingListSheet
          recipeIds={[recipeId]}
          onClose={() => setShoppingOpen(false)}
          onDone={() => setShoppingOpen(false)}
        />
      )}

      {variantsOpen && (
        <RecipeVariantsSheet recipe={recipe} onClose={() => setVariantsOpen(false)} />
      )}
    </FullscreenSheet>
  );
}

function ReanalysisComparison({
  oldConfidence,
  oldCalories,
  oldIngredientCount,
  fresh,
  onApply,
  onDismiss,
  applying,
}: {
  oldConfidence: number;
  oldCalories: number;
  oldIngredientCount: number;
  fresh: ImportedRecipe;
  onApply: () => void;
  onDismiss: () => void;
  applying: boolean;
}) {
  const freshCalories = fresh.perServing.calories;
  const better = fresh.confidence > oldConfidence + 0.02;
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <p className="flex items-center gap-1.5 text-sm font-bold text-primary">
        <ChefHat className="h-4 w-4" />
        Nouvelle analyse disponible
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {better
          ? "Elle semble plus fiable que l'actuelle."
          : "Résultat comparable à l'analyse actuelle."}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-border/60 bg-surface p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Actuelle</p>
          <p className="mt-1 font-semibold">{Math.round(oldCalories)} kcal</p>
          <p className="text-muted-foreground">
            Confiance {confidenceLabelInline(oldConfidence)} · {oldIngredientCount} ingr.
          </p>
        </div>
        <div className="rounded-xl border border-primary/40 bg-card p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-primary">Nouvelle</p>
          <p className="mt-1 font-semibold">{Math.round(freshCalories)} kcal</p>
          <p className="text-muted-foreground">
            Confiance {confidenceLabelInline(fresh.confidence)} · {fresh.ingredients.length} ingr.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2.5">
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border text-xs font-semibold text-muted-foreground"
        >
          Garder l'actuelle
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          className="flex h-10 flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-gradient-primary text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Mettre à jour la recette
        </button>
      </div>
    </div>
  );
}

function confidenceLabelInline(c: number): string {
  if (c >= 0.8) return "Élevée";
  if (c >= 0.55) return "Moyenne";
  return "Faible";
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
