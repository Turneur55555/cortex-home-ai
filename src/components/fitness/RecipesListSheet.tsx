import { useMemo, useState } from "react";
import { Check, FolderCog, Loader2, ShoppingCart, Star, Utensils, X } from "lucide-react";
import { FullscreenSheet } from "@/components/shared/FormComponents";
import { useRecipes, useToggleRecipeFavorite } from "@/hooks/useRecipes";
import {
  useCollections,
  useCollectionRecipeIds,
  FAVORITES_COLLECTION_ID,
} from "@/hooks/useCollections";
import { RecipeDetailSheet } from "@/components/fitness/RecipeDetailSheet";
import { CollectionsListSheet } from "@/components/fitness/CollectionsListSheet";
import { AddToShoppingListSheet } from "@/components/fitness/AddToShoppingListSheet";

/**
 * Module "Recettes" (liste) — chaque recette (importée ou manuelle) reste
 * accessible ici. Tap sur une carte -> RecipeDetailSheet (journal/modifier/
 * dupliquer/favori/supprimer). Filtrage par collection (chips, "Favoris" est
 * virtuel) + sélection multiple pour ajouter plusieurs recettes à la liste
 * de courses en une fois.
 */
export function RecipesListSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { data: recipes, isLoading } = useRecipes();
  const { data: collections } = useCollections();
  const toggleFavorite = useToggleRecipeFavorite();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [managingCollections, setManagingCollections] = useState(false);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const { data: collectionRecipeIds } = useCollectionRecipeIds(
    activeCollection && activeCollection !== FAVORITES_COLLECTION_ID ? activeCollection : null,
  );

  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [shoppingOpen, setShoppingOpen] = useState(false);

  const filteredRecipes = useMemo(() => {
    const all = recipes ?? [];
    if (!activeCollection) return all;
    if (activeCollection === FAVORITES_COLLECTION_ID) return all.filter((r) => r.is_favorite);
    const ids = new Set(collectionRecipeIds ?? []);
    return all.filter((r) => ids.has(r.id));
  }, [recipes, activeCollection, collectionRecipeIds]);

  const count = filteredRecipes.length;

  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setCheckedIds(new Set());
  }

  return (
    <FullscreenSheet
      title="Mes recettes"
      subtitle={count > 0 ? `${count} recette${count > 1 ? "s" : ""}` : undefined}
      onClose={onClose}
      actions={
        selectMode ? (
          <button
            type="button"
            onClick={exitSelectMode}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground"
            aria-label="Annuler la sélection"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setManagingCollections(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground"
            aria-label="Gérer les collections"
          >
            <FolderCog className="h-4 w-4" />
          </button>
        )
      }
    >
      {/* ─── Filtre collections ──────────────────────────────────────────── */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setActiveCollection(null)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
            activeCollection === null
              ? "bg-primary text-primary-foreground"
              : "border border-border text-muted-foreground"
          }`}
        >
          Toutes
        </button>
        <button
          type="button"
          onClick={() => setActiveCollection(FAVORITES_COLLECTION_ID)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
            activeCollection === FAVORITES_COLLECTION_ID
              ? "bg-primary text-primary-foreground"
              : "border border-border text-muted-foreground"
          }`}
        >
          Favoris
        </button>
        {(collections ?? []).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveCollection(c.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              activeCollection === c.id
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {!selectMode && (recipes?.length ?? 0) > 0 && (
        <button
          type="button"
          onClick={() => setSelectMode(true)}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-2 text-xs font-semibold text-muted-foreground"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Sélectionner des recettes pour la liste de courses
        </button>
      )}

      {isLoading && (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && count === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Utensils className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Aucune recette</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeCollection
              ? "Aucune recette dans cette collection pour l'instant."
              : "Importe une recette depuis Instagram pour la retrouver ici."}
          </p>
        </div>
      )}

      <ul className="space-y-2.5">
        {filteredRecipes.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
          >
            {selectMode && (
              <button
                type="button"
                onClick={() => toggleChecked(r.id)}
                aria-label={checkedIds.has(r.id) ? "Désélectionner" : "Sélectionner"}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                  checkedIds.has(r.id)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border"
                }`}
              >
                {checkedIds.has(r.id) && <Check className="h-3.5 w-3.5" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => (selectMode ? toggleChecked(r.id) : setSelectedId(r.id))}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface">
                {r.source_image_url ? (
                  <img
                    src={r.source_image_url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Utensils className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.servings} portion{r.servings > 1 ? "s" : ""}
                  {r.per_serving_calories != null
                    ? ` · ${Math.round(r.per_serving_calories)} kcal/portion`
                    : ""}
                </p>
              </div>
            </button>
            {!selectMode && (
              <button
                type="button"
                onClick={() => toggleFavorite.mutate({ id: r.id, isFavorite: !r.is_favorite })}
                aria-label={r.is_favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:scale-90"
              >
                <Star
                  className={`h-4 w-4 ${r.is_favorite ? "fill-primary text-primary" : "text-muted-foreground"}`}
                />
              </button>
            )}
          </li>
        ))}
      </ul>

      {selectMode && checkedIds.size > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-background/95 p-4 backdrop-blur-md"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            onClick={() => setShoppingOpen(true)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow"
          >
            <ShoppingCart className="h-4 w-4" />
            Ajouter {checkedIds.size} recette{checkedIds.size > 1 ? "s" : ""} à la liste de courses
          </button>
        </div>
      )}

      {selectedId && (
        <RecipeDetailSheet recipeId={selectedId} date={date} onClose={() => setSelectedId(null)} />
      )}

      {managingCollections && (
        <CollectionsListSheet onClose={() => setManagingCollections(false)} />
      )}

      {shoppingOpen && (
        <AddToShoppingListSheet
          recipeIds={[...checkedIds]}
          onClose={() => setShoppingOpen(false)}
          onDone={() => {
            setShoppingOpen(false);
            exitSelectMode();
          }}
        />
      )}
    </FullscreenSheet>
  );
}
