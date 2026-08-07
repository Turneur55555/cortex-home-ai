import { useMemo } from "react";
import { motion } from "framer-motion";
import { Loader2, ShoppingCart } from "lucide-react";
import { FullscreenSheet } from "@/components/shared/FormComponents";
import { useRecipesShoppingPreview, useSaveRecipesShoppingList } from "@/hooks/useShoppingList";
import type { ShoppingLine } from "@/lib/nutrition/shoppingList";

const PRESS = { scale: 0.97 };

function groupByCategory(lines: ShoppingLine[]): Array<[string, ShoppingLine[]]> {
  const map = new Map<string, ShoppingLine[]>();
  for (const line of lines) {
    const cat = line.category ?? "Divers";
    const arr = map.get(cat) ?? [];
    arr.push(line);
    map.set(cat, arr);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "fr"));
}

/**
 * Aperçu de la liste de courses fusionnée (une ou plusieurs recettes) —
 * ingrédients identiques fusionnés + quantités additionnées (buildShoppingList),
 * groupés par rayon. Confirmée -> écrite dans `shopping_list` (persistée).
 */
export function AddToShoppingListSheet({
  recipeIds,
  onClose,
  onDone,
}: {
  recipeIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: lines, isLoading } = useRecipesShoppingPreview(recipeIds);
  const save = useSaveRecipesShoppingList();

  const grouped = useMemo(() => groupByCategory(lines ?? []), [lines]);

  function confirm() {
    if (!lines || lines.length === 0) return;
    save.mutate(lines, { onSuccess: onDone });
  }

  return (
    <FullscreenSheet
      title="Liste de courses"
      subtitle={`${recipeIds.length} recette${recipeIds.length > 1 ? "s" : ""} sélectionnée${recipeIds.length > 1 ? "s" : ""}`}
      onClose={onClose}
    >
      {isLoading && (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (lines?.length ?? 0) === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <ShoppingCart className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Aucun ingrédient</p>
        </div>
      )}

      <div className="space-y-4 pb-4">
        {grouped.map(([category, catLines]) => (
          <div key={category}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {category}
            </p>
            <ul className="mt-2 divide-y divide-border/60 rounded-xl border border-border/60">
              {catLines.map((l) => (
                <li
                  key={`${l.name}-${l.unit}`}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                  <span className="shrink-0 font-medium tabular-nums text-primary">
                    {l.needed}
                    {l.unit ? ` ${l.unit}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {(lines?.length ?? 0) > 0 && (
        <motion.button
          whileTap={PRESS}
          type="button"
          onClick={confirm}
          disabled={save.isPending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShoppingCart className="h-4 w-4" />
          )}
          Ajouter à ma liste de courses
        </motion.button>
      )}
    </FullscreenSheet>
  );
}
