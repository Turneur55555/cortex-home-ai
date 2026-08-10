import { describe, expect, it } from "vitest";
import {
  BUSTE_ZONE_BY_MUSCLE,
  busteEvolutionFromMuscleRanks,
  influenceForMuscleRank,
} from "./busteEvolution";
import { BUSTE_MUSCLES, type BusteMuscleGroup } from "./cortexPower";
import type { MuscleRankResult } from "./muscleRank";

function evaluated(tierIndex: number): MuscleRankResult {
  return { status: "evaluated", tierIndex, contributingCount: 2 };
}
const notEvaluated: MuscleRankResult = {
  status: "not_evaluated",
  tierIndex: null,
  contributingCount: 1,
};

describe("influenceForMuscleRank", () => {
  it("non évalué → 0 (état minimum, jamais un état inventé)", () => {
    expect(influenceForMuscleRank(notEvaluated)).toBe(0);
  });

  it("tier 0 (Mortel bas) → influence 0", () => {
    expect(influenceForMuscleRank(evaluated(0))).toBe(0);
  });

  it("tier 29 (Titan max) → influence 1", () => {
    expect(influenceForMuscleRank(evaluated(29))).toBe(1);
  });

  it("normalisation linéaire continue sur toute l'échelle 0..29", () => {
    for (let tier = 0; tier <= 29; tier++) {
      const influence = influenceForMuscleRank(evaluated(tier));
      expect(influence).toBeCloseTo(tier / 29, 10);
      expect(influence).toBeGreaterThanOrEqual(0);
      expect(influence).toBeLessThanOrEqual(1);
    }
  });

  it("est monotone croissante (jamais de régression visuelle pour un tier plus haut)", () => {
    let previous = -1;
    for (let tier = 0; tier <= 29; tier++) {
      const influence = influenceForMuscleRank(evaluated(tier));
      expect(influence).toBeGreaterThan(previous);
      previous = influence;
    }
  });
});

describe("BUSTE_ZONE_BY_MUSCLE", () => {
  it("couvre exactement les 8 muscles du buste, un nom de zone par muscle", () => {
    expect(Object.keys(BUSTE_ZONE_BY_MUSCLE).sort()).toEqual([...BUSTE_MUSCLES].sort());
  });

  it("utilise les 8 identifiants EXACTS attendus côté Blender/GLB", () => {
    expect(new Set(Object.values(BUSTE_ZONE_BY_MUSCLE))).toEqual(
      new Set(["chest", "back", "shoulders", "biceps", "triceps", "forearms", "traps", "abs"]),
    );
  });

  it("aucun doublon de nom de zone (chaque muscle a une zone unique)", () => {
    const values = Object.values(BUSTE_ZONE_BY_MUSCLE);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("busteEvolutionFromMuscleRanks", () => {
  it("aucun muscle évalué → les 8 zones à influence 0 (buste au repos, jamais un Titre par défaut)", () => {
    const ranks = Object.fromEntries(
      BUSTE_MUSCLES.map((m) => [m, notEvaluated]),
    ) as Record<BusteMuscleGroup, MuscleRankResult>;
    const evolutions = busteEvolutionFromMuscleRanks(ranks);
    expect(evolutions).toHaveLength(8);
    for (const e of evolutions) {
      expect(e.influence).toBe(0);
      expect(e.tierIndex).toBeNull();
    }
  });

  it("chaque zone reflète UNIQUEMENT son propre Rang musculaire (indépendance stricte)", () => {
    const ranks: Record<BusteMuscleGroup, MuscleRankResult> = {
      dos: evaluated(29), // Titan
      pectoraux: notEvaluated,
      epaules: evaluated(4), // Mortel bas
      abdos: evaluated(15),
      biceps: notEvaluated,
      triceps: evaluated(20),
      trapeze: notEvaluated,
      "avant-bras": evaluated(0),
    };
    const evolutions = busteEvolutionFromMuscleRanks(ranks);
    const byZone = new Map(evolutions.map((e) => [e.zone, e]));

    expect(byZone.get("back")!.influence).toBe(1); // dos Titan → back au max
    expect(byZone.get("chest")!.influence).toBe(0); // pectoraux non évalué → chest au repos
    expect(byZone.get("shoulders")!.influence).toBeCloseTo(4 / 29, 10);
    expect(byZone.get("biceps")!.influence).toBe(0);
    expect(byZone.get("forearms")!.influence).toBe(0); // tier 0 évalué → influence 0, pas non-évalué
    expect(byZone.get("forearms")!.tierIndex).toBe(0);
  });

  it("un Titre global élevé ne fait PAS évoluer une zone dont le muscle est non évalué (garde-fou RPG explicite)", () => {
    // Simule un joueur Titan sur 7 muscles mais jamais entraîné les triceps
    // isolément (< 2 exercices contributeurs) : le Titre global peut être
    // très haut, mais la zone triceps doit rester au minimum tant que SON
    // rang à elle n'est pas évalué.
    const ranks: Record<BusteMuscleGroup, MuscleRankResult> = {
      dos: evaluated(28),
      pectoraux: evaluated(27),
      epaules: evaluated(29),
      abdos: evaluated(26),
      biceps: evaluated(28),
      trapeze: evaluated(27),
      "avant-bras": evaluated(25),
      triceps: notEvaluated,
    };
    const evolutions = busteEvolutionFromMuscleRanks(ranks);
    const triceps = evolutions.find((e) => e.zone === "triceps")!;
    expect(triceps.influence).toBe(0);
    expect(triceps.tierIndex).toBeNull();
  });

  it("retourne exactement 8 zones, jamais plus/moins", () => {
    const ranks = Object.fromEntries(
      BUSTE_MUSCLES.map((m) => [m, evaluated(10)]),
    ) as Record<BusteMuscleGroup, MuscleRankResult>;
    expect(busteEvolutionFromMuscleRanks(ranks)).toHaveLength(8);
  });
});
