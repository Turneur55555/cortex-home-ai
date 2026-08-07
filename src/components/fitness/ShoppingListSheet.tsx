import { useMemo } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, ShoppingCart, Trash2 } from "lucide-react";
import { FullscreenSheet } from "@/components/shared/FormComponents";
import {
  useShoppingList,
  useToggleShoppingItem,
  useClearBoughtItems,
  type ShoppingListItem,
} from "@/hooks/useShoppingList";

const PRESS = { scale: 0.97 };

function groupByCategory(items: ShoppingListItem[]): Array<[string, ShoppingListItem[]]> {
  const map = new Map<string, ShoppingListItem[]>();
  for (const item of items) {
    const cat = item.category ?? "Divers";
    const arr = map.get(cat) ?? [];
    arr.push(item);
    map.set(cat, arr);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "fr"));
}

/**
 * Liste de courses persistée — regroupée par rayon, cases à cocher pour
 * marquer les articles achetés. Alimentée par le module "Recettes" (bouton
 * "Ajouter à la liste de courses") ou le planning hebdo (MealPlanSheet).
 */
export function ShoppingListSheet({ onClose }: { onClose: () => void }) {
  const { data: items, isLoading } = useShoppingList();
  const toggle = useToggleShoppingItem();
  const clearBought = useClearBoughtItems();

  const pending = useMemo(() => (items ?? []).filter((i) => !i.done), [items]);
  const bought = useMemo(() => (items ?? []).filter((i) => i.done), [items]);
  const groupedPending = useMemo(() => groupByCategory(pending), [pending]);

  return (
    <FullscreenSheet
      title="Liste de courses"
      subtitle={
        pending.length > 0
          ? `${pending.length} article${pending.length > 1 ? "s" : ""} à acheter`
          : undefined
      }
      onClose={onClose}
    >
      {isLoading && (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (items?.length ?? 0) === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <ShoppingCart className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Liste vide</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajoute des ingrédients depuis une recette ou le planning de la semaine.
          </p>
        </div>
      )}

      <div className="space-y-4 pb-4">
        {groupedPending.map(([category, catItems]) => (
          <div key={category}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {category}
            </p>
            <ul className="mt-2 divide-y divide-border/60 rounded-xl border border-border/60">
              {catItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggle.mutate({ id: item.id, done: true })}
                    aria-label={`Marquer ${item.name} comme acheté`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                  {item.quantity != null && (
                    <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                      {item.quantity}
                      {item.unit ? ` ${item.unit}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {bought.length > 0 && (
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Achetés
              </p>
              <motion.button
                whileTap={PRESS}
                type="button"
                onClick={() => clearBought.mutate()}
                disabled={clearBought.isPending}
                className="flex items-center gap-1 text-[11px] font-medium text-destructive disabled:opacity-60"
              >
                <Trash2 className="h-3 w-3" />
                Vider
              </motion.button>
            </div>
            <ul className="mt-2 divide-y divide-border/60 rounded-xl border border-border/60 opacity-60">
              {bought.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => toggle.mutate({ id: item.id, done: false })}
                    aria-label={`Marquer ${item.name} comme non acheté`}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm line-through">{item.name}</span>
                  {item.quantity != null && (
                    <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                      {item.quantity}
                      {item.unit ? ` ${item.unit}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </FullscreenSheet>
  );
}
