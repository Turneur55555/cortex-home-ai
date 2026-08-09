import { describe, expect, it } from "vitest";
import {
  computeCortexPower,
  BUSTE_MUSCLES,
  BUSTE_MUSCLE_WEIGHTS,
  type CortexPowerMuscleInput,
  type BusteMuscleGroup,
} from "./cortexPower";

function allMuscles(tierIndex: number): CortexPowerMuscleInput[] {
  return BUSTE_MUSCLES.map((muscle) => ({ muscle, tierIndex }));
}

function muscles(values: Partial<Record<BusteMuscleGroup, number>>): CortexPowerMuscleInput[] {
  return BUSTE_MUSCLES.map((muscle) => ({ muscle, tierIndex: values[muscle] ?? null }));
}

describe("computeCortexPower — Option 1 verrouillée (max(round(2G-A), min))", () => {
  it("seuil de complétude : moins de 5/8 muscles évalués → partiel", () => {
    const r = computeCortexPower(muscles({ dos: 12, pectoraux: 12, epaules: 12, abdos: 12 }));
    expect(r).toEqual({ status: "partial", evaluatedCount: 4 });
  });

  it("exactement 5/8 → calcul possible", () => {
    const r = computeCortexPower(
      muscles({ dos: 12, pectoraux: 12, epaules: 12, abdos: 12, biceps: 12 }),
    );
    expect(r.status).toBe("complete");
  });

  // Audit RPG V2 Phase H (30/08/2026) : couverture explicite 6/7/8 muscles
  // évalués (le seuil 5/8 était déjà couvert, mais pas ces paliers précis).
  it("6/8 muscles évalués → calcul possible", () => {
    const r = computeCortexPower(
      muscles({ dos: 10, pectoraux: 11, epaules: 12, abdos: 13, biceps: 14, triceps: 15 }),
    );
    expect(r.status).toBe("complete");
    expect((r as { evaluatedCount: number }).evaluatedCount).toBe(6);
  });

  it("7/8 muscles évalués → calcul possible", () => {
    const r = computeCortexPower(
      muscles({
        dos: 10,
        pectoraux: 11,
        epaules: 12,
        abdos: 13,
        biceps: 14,
        triceps: 15,
        trapeze: 16,
      }),
    );
    expect(r.status).toBe("complete");
    expect((r as { evaluatedCount: number }).evaluatedCount).toBe(7);
  });

  it("8/8 muscles évalués → calcul possible, evaluatedCount = 8", () => {
    const r = computeCortexPower(allMuscles(15));
    expect(r).toEqual({ status: "complete", tierIndex: 15, evaluatedCount: 8 });
  });

  it("données manquantes : 0 muscle évalué → partiel, evaluatedCount = 0", () => {
    const r = computeCortexPower(muscles({}));
    expect(r).toEqual({ status: "partial", evaluatedCount: 0 });
  });

  it("données manquantes : 1 muscle évalué → partiel, evaluatedCount = 1", () => {
    const r = computeCortexPower(muscles({ dos: 12 }));
    expect(r).toEqual({ status: "partial", evaluatedCount: 1 });
  });

  it("Propriété D — homogénéité : 8 muscles à X → Puissance = X, pour X=0..29", () => {
    for (let x = 0; x <= 29; x++) {
      const r = computeCortexPower(allMuscles(x));
      expect(r).toEqual({ status: "complete", tierIndex: x, evaluatedCount: 8 });
    }
  });

  it("Propriété A/B — le résultat reste toujours dans [min, max] des muscles évalués (recherche exhaustive sur les coins, 2^8 configurations)", () => {
    const n = BUSTE_MUSCLES.length;
    for (let mask = 0; mask < 1 << n; mask++) {
      const inputs: CortexPowerMuscleInput[] = BUSTE_MUSCLES.map((muscle, i) => ({
        muscle,
        tierIndex: (mask >> i) & 1 ? 29 : 0,
      }));
      const r = computeCortexPower(inputs);
      if (r.status === "complete") {
        const values = inputs.map((i) => i.tierIndex as number);
        expect(r.tierIndex).toBeGreaterThanOrEqual(Math.min(...values));
        expect(r.tierIndex).toBeLessThanOrEqual(Math.max(...values));
        expect(r.tierIndex).toBeGreaterThanOrEqual(0);
        expect(r.tierIndex).toBeLessThanOrEqual(29);
      }
    }
  });

  it("Profil G — un muscle Titan (dos, poids le plus élevé), reste Guerrier : ne devient jamais Titan", () => {
    const r = computeCortexPower(
      muscles({
        dos: 27,
        pectoraux: 7,
        epaules: 7,
        abdos: 7,
        biceps: 7,
        triceps: 7,
        trapeze: 7,
        "avant-bras": 7,
      }),
    );
    expect(r.status).toBe("complete");
    expect((r as { tierIndex: number }).tierIndex).toBeLessThan(15); // reste sous Colosse
  });

  it("Profil H — deux muscles Titan (35% du poids), reste Héros : plafonne à Colosse", () => {
    const r = computeCortexPower(
      muscles({
        dos: 27,
        pectoraux: 27,
        epaules: 12,
        abdos: 12,
        biceps: 12,
        triceps: 12,
        trapeze: 12,
        "avant-bras": 12,
      }),
    );
    expect(r.status).toBe("complete");
    const tier = (r as { tierIndex: number }).tierIndex;
    expect(tier).toBeGreaterThanOrEqual(15);
    expect(tier).toBeLessThan(20); // ne franchit pas Olympien
  });

  it("Profil K — un seul muscle Titan (pectoraux) sur fond Héros : ne fait pas franchir la frontière Héros→Colosse", () => {
    const r = computeCortexPower(
      muscles({
        pectoraux: 27,
        dos: 12,
        epaules: 12,
        abdos: 12,
        biceps: 12,
        triceps: 12,
        trapeze: 12,
        "avant-bras": 12,
      }),
    );
    expect(r.status).toBe("complete");
    expect((r as { tierIndex: number }).tierIndex).toBeLessThan(15);
  });

  it("Cas 9 (rapport de validation) — 5 muscles évalués en forte dispersion (2/27 alterné) : ne descend plus sous le minimum", () => {
    const r = computeCortexPower(
      muscles({ dos: 2, pectoraux: 27, epaules: 2, abdos: 27, biceps: 2 }),
    );
    expect(r.status).toBe("complete");
    expect((r as { tierIndex: number }).tierIndex).toBeGreaterThanOrEqual(2); // >= min réel, F3 seule donnait 0.66
  });

  it("tous les muscles Titan → Titan", () => {
    const r = computeCortexPower(allMuscles(27));
    expect(r).toEqual({ status: "complete", tierIndex: 27, evaluatedCount: 8 });
  });

  it("les poids musculaires somment à 1 (hypothèse de calibration Cortex, non scientifique)", () => {
    const total = Object.values(BUSTE_MUSCLE_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});
