import { useState } from "react";
import { Loader2, Star, Utensils } from "lucide-react";
import { FullscreenSheet } from "@/components/shared/FormComponents";
import { useRecipes, useToggleRecipeFavorite } from "@/hooks/useRecipes";
import { RecipeDetailSheet } from "@/components/fitness/RecipeDetailSheet";

/**
 * Module "Recettes" (liste) — chaque recette (importée ou manuelle) reste
 * accessible ici. Tap sur une carte -> RecipeDetailSheet (journal/modifier/
 * dupliquer/favori/supprimer).
 */
export function RecipesListSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { data: recipes, isLoading } = useRecipes();
  const toggleFavorite = useToggleRecipeFavorite();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const count = recipes?.length ?? 0;

  return (
    <FullscreenSheet
      title="Mes recettes"
      subtitle={count > 0 ? `${count} recette${count > 1 ? "s" : ""}` : undefined}
      onClose={onClose}
    >
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
            Importe une recette depuis Instagram pour la retrouver ici.
          </p>
        </div>
      )}

      <ul className="space-y-2.5">
        {(recipes ?? []).map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
          >
            <button
              type="button"
              onClick={() => setSelectedId(r.id)}
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
          </li>
        ))}
      </ul>

      {selectedId && (
        <RecipeDetailSheet recipeId={selectedId} date={date} onClose={() => setSelectedId(null)} />
      )}
    </FullscreenSheet>
  );
}
