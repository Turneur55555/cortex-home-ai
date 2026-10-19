import { describe, expect, it } from "vitest";
import { planWeek, weekDates } from "./weeklyOutfits";
import type { OutfitScoringItem } from "./outfitEngine";
import type { WornOutfit } from "./wearHistory";

function item(overrides: Partial<OutfitScoringItem> & { id: string }): OutfitScoringItem {
  return {
    category: "top",
    subcategory: null,
    primary_color: "noir",
    secondary_colors: [],
    pattern: "uni",
    material: null,
    fit: null,
    formality: "casual",
    seasons: [],
    usage: ["quotidien"],
    ...overrides,
  };
}

const WEEK = "2026-10-19"; // lundi
const tops = Array.from({ length: 8 }, (_, i) => item({ id: `t${i}` }));
const bottoms = Array.from({ length: 8 }, (_, i) => item({ id: `b${i}`, category: "bottom" }));
const ITEMS = [...tops, ...bottoms];

describe("planWeek", () => {
  it("couvre les sept jours, du lundi au dimanche", () => {
    expect(weekDates(WEEK)).toHaveLength(7);
    const days = planWeek({
      weekStart: WEEK,
      today: WEEK,
      items: ITEMS,
      history: [],
      preferences: {},
    });
    expect(days.map((d) => d.status)).toEqual(Array(7).fill("planned"));
    expect(days[0].isToday).toBe(true);
  });

  it("ne répète aucun haut ni bas dans la semaine quand le dressing le permet", () => {
    const days = planWeek({
      weekStart: WEEK,
      today: WEEK,
      items: ITEMS,
      history: [],
      preferences: {},
    });
    const ids = days.flatMap((d) => d.outfit?.items.map((i) => i.id) ?? []);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("accepte une répétition plutôt qu'un jour vide quand le dressing est petit", () => {
    const days = planWeek({
      weekStart: WEEK,
      today: WEEK,
      items: [tops[0], bottoms[0]],
      history: [],
      preferences: {},
    });
    expect(days.every((d) => d.status === "planned")).toBe(true);
  });

  it("un jour porté affiche la tenue réelle ; un jour passé sans tenue reste vide", () => {
    const history: WornOutfit[] = [
      {
        id: "o1",
        wornAt: "2026-10-19T08:00:00",
        date: "2026-10-19",
        occasion: "travail",
        score: 80,
        itemIds: ["t0", "b0"],
      },
    ];
    const days = planWeek({
      weekStart: WEEK,
      today: "2026-10-21",
      items: ITEMS,
      history,
      preferences: {},
    });
    expect(days[0].status).toBe("worn");
    expect(days[0].context).toBe("travail");
    expect(days[1].status).toBe("missed");
    expect(days[2].status).toBe("planned");
    const later = days.slice(2).flatMap((d) => d.outfit?.items.map((i) => i.id) ?? []);
    expect(later).not.toContain("t0");
    expect(later).not.toContain("b0");
  });

  it("« Autre tenue » change la tenue du jour, de façon déterministe", () => {
    const base = planWeek({
      weekStart: WEEK,
      today: WEEK,
      items: ITEMS,
      history: [],
      preferences: {},
    });
    const rerolled = planWeek({
      weekStart: WEEK,
      today: WEEK,
      items: ITEMS,
      history: [],
      preferences: { [WEEK]: { reroll: 1 } },
    });
    expect(rerolled[0].outfit?.items.map((i) => i.id)).not.toEqual(
      base[0].outfit?.items.map((i) => i.id),
    );
    expect(
      planWeek({
        weekStart: WEEK,
        today: WEEK,
        items: ITEMS,
        history: [],
        preferences: { [WEEK]: { reroll: 1 } },
      }),
    ).toEqual(rerolled);
  });

  it("un contexte impossible rend le jour « unavailable » avec une raison", () => {
    const days = planWeek({
      weekStart: WEEK,
      today: WEEK,
      items: ITEMS,
      history: [],
      preferences: { [WEEK]: { context: "baignade" } },
    });
    expect(days[0].status).toBe("unavailable");
    expect(days[0].reason).toMatch(/maillot/);
  });

  it("préfère répéter un bas de saison plutôt que proposer un short hors saison", () => {
    const autumnTops = Array.from({ length: 7 }, (_, i) =>
      item({ id: `at${i}`, seasons: ["automne", "hiver"] }),
    );
    const items = [
      ...autumnTops,
      item({ id: "pantalon1", category: "bottom", seasons: ["automne", "hiver"] }),
      item({ id: "pantalon2", category: "bottom", seasons: ["automne", "hiver"] }),
      item({ id: "short", category: "bottom", seasons: ["printemps", "ete"] }),
    ];
    const days = planWeek({
      weekStart: WEEK,
      today: WEEK,
      items,
      history: [],
      preferences: {},
      engineOptions: { currentSeason: "automne" },
    });
    const ids = days.flatMap((d) => d.outfit?.items.map((i) => i.id) ?? []);
    expect(ids).not.toContain("short");
    const combos = days.map((d) => (d.outfit?.items.map((i) => i.id) ?? []).sort().join("|"));
    expect(new Set(combos).size).toBe(7);
  });

  it("répartit les bas quand il faut en répéter (aucun bas plus de 3 fois sur 7 jours avec 3 bas)", () => {
    const autumnTops = Array.from({ length: 7 }, (_, i) =>
      item({ id: `at${i}`, seasons: ["automne"] }),
    );
    const bottoms3 = ["p1", "p2", "p3"].map((id) =>
      item({ id, category: "bottom", seasons: ["automne"] }),
    );
    const days = planWeek({
      weekStart: WEEK,
      today: WEEK,
      items: [...autumnTops, ...bottoms3],
      history: [],
      preferences: {},
      engineOptions: { currentSeason: "automne" },
    });
    const counts = new Map<string, number>();
    for (const d of days) {
      const b = d.outfit?.items.find((i) => i.category === "bottom");
      if (b) counts.set(b.id, (counts.get(b.id) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
  });
});
