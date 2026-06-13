/**
 * Liste de courses depuis le planning — domaine pur (zéro React).
 *
 * À partir des ingrédients requis par le planning de repas (multipliés par les
 * portions) et du stock courant (table items), calcule ce qu'il reste à acheter.
 *
 * Agrégation : on regroupe par item_id quand il existe, sinon par couple
 * (nom normalisé, unité). Les quantités d'unités différentes ne sont jamais
 * additionnées entre elles.
 */

export interface PlannedIngredient {
  itemId?: string | null;
  name: string;
  unit?: string | null;
  /** Quantité requise par portion de recette. */
  quantity?: number | null;
  /** Nombre de portions planifiées de la recette contenant cet ingrédient. */
  servings?: number | null;
}

export interface StockLevel {
  itemId?: string | null;
  name: string;
  unit?: string | null;
  quantity?: number | null;
}

export interface NeededIngredient {
  itemId: string | null;
  name: string;
  unit: string | null;
  needed: number;
}

export interface ShoppingLine {
  itemId: string | null;
  name: string;
  unit: string | null;
  needed: number;
  inStock: number;
  toBuy: number;
}

const num = (v: number | null | undefined): number => (v != null && Number.isFinite(v) && v > 0 ? v : 0);
const norm = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Clé d'agrégation : item_id prioritaire, sinon nom+unité normalisés. */
function keyOf(itemId: string | null | undefined, name: string, unit: string | null | undefined): string {
  if (itemId) return `id:${itemId}`;
  return `nu:${norm(name)}|${norm(unit)}`;
}

/**
 * Agrège les ingrédients planifiés en besoins totaux.
 * needed = quantity × servings, sommé par clé.
 */
export function aggregateNeeds(planned: ReadonlyArray<PlannedIngredient> | null | undefined): NeededIngredient[] {
  const map = new Map<string, NeededIngredient>();
  for (const p of planned ?? []) {
    const qty = num(p.quantity) * (p.servings == null ? 1 : num(p.servings));
    if (qty === 0) continue;
    const key = keyOf(p.itemId, p.name, p.unit);
    const existing = map.get(key);
    if (existing) {
      existing.needed = r2(existing.needed + qty);
    } else {
      map.set(key, { itemId: p.itemId ?? null, name: p.name, unit: p.unit ?? null, needed: r2(qty) });
    }
  }
  return Array.from(map.values());
}

/**
 * Construit la liste de courses : besoins − stock, en ne gardant (par défaut)
 * que les lignes où il reste quelque chose à acheter.
 */
export function buildShoppingList(
  planned: ReadonlyArray<PlannedIngredient> | null | undefined,
  stock: ReadonlyArray<StockLevel> | null | undefined,
  options?: { includeSatisfied?: boolean },
): ShoppingLine[] {
  const stockMap = new Map<string, number>();
  for (const s of stock ?? []) {
    const key = keyOf(s.itemId, s.name, s.unit);
    stockMap.set(key, r2((stockMap.get(key) ?? 0) + num(s.quantity)));
  }

  const lines = aggregateNeeds(planned).map<ShoppingLine>((n) => {
    const key = keyOf(n.itemId, n.name, n.unit);
    const inStock = stockMap.get(key) ?? 0;
    const toBuy = r2(Math.max(0, n.needed - inStock));
    return { itemId: n.itemId, name: n.name, unit: n.unit, needed: n.needed, inStock, toBuy };
  });

  const filtered = options?.includeSatisfied ? lines : lines.filter((l) => l.toBuy > 0);
  return filtered.sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
