import { describe, expect, it } from "vitest";
import {
  FORGOTTEN_AFTER_DAYS,
  daysBetween,
  daysSinceWornMap,
  findForgottenItems,
  groupHistoryByDay,
  likedPairsFrom,
  summarizeHistory,
  type WornOutfit,
} from "./wearHistory";
import { itemPairKey } from "./outfitEngine";
import { addDaysYMD } from "@/lib/dates";

const TODAY = "2026-10-19";

function worn(id: string, date: string, itemIds: string[], hour = "09"): WornOutfit {
  return {
    id,
    wornAt: `${date}T${hour}:00:00`,
    date,
    occasion: "quotidien",
    score: 80,
    itemIds,
  };
}

describe("daysBetween", () => {
  it("compte les jours calendaires, changement d'heure compris", () => {
    expect(daysBetween("2026-10-19", "2026-10-19")).toBe(0);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2); // passage à l'heure d'hiver
  });
});

describe("daysSinceWornMap", () => {
  it("garde le port le plus récent de chaque pièce et ignore les dates futures", () => {
    const map = daysSinceWornMap(
      [
        worn("o1", "2026-10-10", ["a", "b"]),
        worn("o2", "2026-10-18", ["a"]),
        worn("o3", "2026-10-25", ["c"]),
      ],
      TODAY,
    );
    expect(map.get("a")).toBe(1);
    expect(map.get("b")).toBe(9);
    expect(map.has("c")).toBe(false);
  });
});

describe("likedPairsFrom", () => {
  it("produit toutes les paires de chaque tenue aimée", () => {
    const pairs = likedPairsFrom([["a", "b", "c"]]);
    expect(pairs.size).toBe(3);
    expect(pairs.has(itemPairKey("c", "a"))).toBe(true);
  });
});

describe("findForgottenItems", () => {
  const old = `${addDaysYMD(TODAY, -60)}T10:00:00`;
  const items = [
    { id: "a", created_at: old },
    { id: "b", created_at: old },
    { id: "recent", created_at: `${addDaysYMD(TODAY, -5)}T10:00:00` },
  ];

  it("sans historique, aucune pièce n'est déclarée oubliée", () => {
    expect(findForgottenItems(items, [], TODAY)).toEqual([]);
  });

  it(`tant que le suivi a moins de ${FORGOTTEN_AFTER_DAYS} jours, on ne conclut rien`, () => {
    const history = [worn("o1", addDaysYMD(TODAY, -10), ["a"])];
    expect(findForgottenItems(items, history, TODAY)).toEqual([]);
  });

  it("une pièce ancienne jamais portée depuis le début du suivi est oubliée ; une pièce récente non", () => {
    const history = [
      worn("o1", addDaysYMD(TODAY, -45), ["b"]),
      worn("o2", addDaysYMD(TODAY, -2), ["a"]),
    ];
    expect(findForgottenItems(items, history, TODAY)).toEqual(["b"]);
  });
});

describe("journal", () => {
  const history = [
    worn("o1", "2026-10-18", ["a", "b"], "08"),
    worn("o2", "2026-10-18", ["a", "c"], "19"),
    worn("o3", "2026-10-15", ["a"]),
    worn("o4", "2026-08-01", ["z"]),
  ];

  it("regroupe par jour, du plus récent au plus ancien", () => {
    const days = groupHistoryByDay(history);
    expect(days.map((d) => d.date)).toEqual(["2026-10-18", "2026-10-15", "2026-08-01"]);
    expect(days[0].outfits.map((o) => o.id)).toEqual(["o2", "o1"]);
  });

  it("résume les 30 derniers jours et trouve la pièce fétiche", () => {
    const summary = summarizeHistory(history, TODAY);
    expect(summary.outfitsLast30Days).toBe(3);
    expect(summary.daysLoggedLast30Days).toBe(2);
    expect(summary.distinctItemsLast30Days).toBe(3);
    expect(summary.mostWornItem).toEqual({ id: "a", count: 3 });
  });
});
