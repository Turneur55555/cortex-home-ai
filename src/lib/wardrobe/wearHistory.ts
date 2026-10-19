/**
 * Historique de port (Dressing) — logique pure, zéro import React.
 *
 * Tout ce qui est dérivé de « ce que j'ai porté » se calcule ici, à la
 * lecture, à partir des tenues enregistrées avec un `worn_at` : rien n'est
 * stocké en plus, rien ne peut diverger de la réalité.
 *   - `daysSinceWornMap` : rotation (une pièce portée hier recule) ;
 *   - `likedPairsFrom` : goûts (paires de pièces des tenues aimées 👍) ;
 *   - `findForgottenItems` : pièces oubliées ;
 *   - `groupHistoryByDay` / `summarizeHistory` : le journal de style.
 */
import { localDateYMD } from "@/lib/dates";
import { itemPairKey } from "./outfitEngine";

export interface WornOutfit {
  id: string;
  /** Horodatage ISO du port (`outfits.worn_at`). */
  wornAt: string;
  /** Date locale yyyy-MM-dd du port. */
  date: string;
  occasion: string | null;
  score: number | null;
  /** Pièces de la tenue, dans l'ordre d'affichage. */
  itemIds: string[];
}

/** Date locale d'un horodatage ISO (jamais `toISOString().slice(0, 10)`, décalé en UTC). */
export function wornDateOf(wornAtIso: string): string {
  return localDateYMD(new Date(wornAtIso));
}

/** Nombre de jours entiers entre deux dates locales yyyy-MM-dd (`to - from`). */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Pièce → jours depuis son dernier port (0 = aujourd'hui). Les ports futurs sont ignorés. */
export function daysSinceWornMap(history: WornOutfit[], today: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const outfit of history) {
    const days = daysBetween(outfit.date, today);
    if (days < 0) continue;
    for (const id of outfit.itemIds) {
      const prev = map.get(id);
      if (prev === undefined || days < prev) map.set(id, days);
    }
  }
  return map;
}

/** Toutes les paires de pièces présentes dans au moins une tenue aimée. */
export function likedPairsFrom(likedOutfits: string[][]): Set<string> {
  const pairs = new Set<string>();
  for (const ids of likedOutfits) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (ids[i] !== ids[j]) pairs.add(itemPairKey(ids[i], ids[j]));
      }
    }
  }
  return pairs;
}

/** Une pièce non portée depuis ce nombre de jours est « oubliée ». */
export const FORGOTTEN_AFTER_DAYS = 30;

/**
 * Pièces oubliées : présentes dans le dressing depuis au moins
 * `FORGOTTEN_AFTER_DAYS` jours et non portées depuis.
 *
 * Tant que le suivi n'a pas `FORGOTTEN_AFTER_DAYS` jours d'historique (première
 * tenue portée trop récente, ou aucune), on ne conclut RIEN : sans historique,
 * toutes les pièces auraient l'air oubliées, ce qui serait faux.
 */
export function findForgottenItems(
  items: Array<{ id: string; created_at: string }>,
  history: WornOutfit[],
  today: string,
): string[] {
  if (history.length === 0) return [];
  const firstTracked = history.reduce((min, o) => (o.date < min ? o.date : min), history[0].date);
  if (daysBetween(firstTracked, today) < FORGOTTEN_AFTER_DAYS) return [];

  const lastWorn = daysSinceWornMap(history, today);
  return items
    .filter((item) => daysBetween(wornDateOf(item.created_at), today) >= FORGOTTEN_AFTER_DAYS)
    .filter((item) => {
      const days = lastWorn.get(item.id);
      return days === undefined || days >= FORGOTTEN_AFTER_DAYS;
    })
    .map((item) => item.id);
}

export interface HistoryDay {
  date: string;
  outfits: WornOutfit[];
}

/** Journal : les tenues portées regroupées par jour, du plus récent au plus ancien. */
export function groupHistoryByDay(history: WornOutfit[]): HistoryDay[] {
  const byDate = new Map<string, WornOutfit[]>();
  for (const outfit of history) {
    const list = byDate.get(outfit.date) ?? [];
    list.push(outfit);
    byDate.set(outfit.date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, outfits]) => ({
      date,
      outfits: [...outfits].sort((a, b) => b.wornAt.localeCompare(a.wornAt)),
    }));
}

export interface HistorySummary {
  /** Tenues portées sur les 30 derniers jours (aujourd'hui compris). */
  outfitsLast30Days: number;
  /** Jours distincts avec au moins une tenue notée, sur 30 jours. */
  daysLoggedLast30Days: number;
  /** Pièce la plus portée sur 30 jours (départage par id, déterministe). */
  mostWornItem: { id: string; count: number } | null;
  /** Pièces distinctes portées sur 30 jours. */
  distinctItemsLast30Days: number;
}

export function summarizeHistory(history: WornOutfit[], today: string): HistorySummary {
  const recent = history.filter((o) => {
    const d = daysBetween(o.date, today);
    return d >= 0 && d < 30;
  });
  const counts = new Map<string, number>();
  for (const outfit of recent) {
    for (const id of new Set(outfit.itemIds)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let mostWornItem: HistorySummary["mostWornItem"] = null;
  for (const [id, count] of counts) {
    if (
      !mostWornItem ||
      count > mostWornItem.count ||
      (count === mostWornItem.count && id < mostWornItem.id)
    ) {
      mostWornItem = { id, count };
    }
  }
  return {
    outfitsLast30Days: recent.length,
    daysLoggedLast30Days: new Set(recent.map((o) => o.date)).size,
    mostWornItem,
    distinctItemsLast30Days: counts.size,
  };
}
