import { describe, expect, it } from "vitest";
import { computeMuscleRank } from "./muscleRank";

const ex = (key: string, tierIndex: number) => ({ key, tierIndex });

describe("computeMuscleRank — Méthode C (hybride)", () => {
  it("Cas 1 : Titan/Mortel/Mortel ne doit PAS produire Titan", () => {
    const r = computeMuscleRank([ex("a", 27), ex("b", 2), ex("c", 2)]);
    expect(r.status).toBe("evaluated");
    expect(r.tierIndex).toBeLessThan(25); // largement en dessous de la bande Titan
  });

  it("Cas 4 : Titan/Titan/Colosse produit Titan ou en est extrêmement proche", () => {
    const r = computeMuscleRank([ex("a", 27), ex("b", 27), ex("c", 17)]);
    expect(r.status).toBe("evaluated");
    expect(r.tierIndex).toBeGreaterThanOrEqual(20); // Olympien haut au minimum
  });

  it("Cas 5 : trois exercices Héros homogènes → Héros", () => {
    const r = computeMuscleRank([ex("a", 12), ex("b", 12), ex("c", 12)]);
    expect(r).toEqual({ status: "evaluated", tierIndex: 12, contributingCount: 3 });
  });

  it("Cas 8 : un seul exercice disponible → non évalué (règle absolue)", () => {
    const r = computeMuscleRank([ex("a", 12)]);
    expect(r).toEqual({ status: "not_evaluated", tierIndex: null, contributingCount: 1 });
  });

  it("aucun exercice → non évalué", () => {
    const r = computeMuscleRank([]);
    expect(r).toEqual({ status: "not_evaluated", tierIndex: null, contributingCount: 0 });
  });

  it("deux exercices exactement → couverture minimale atteinte, évalué", () => {
    const r = computeMuscleRank([ex("a", 12), ex("b", 12)]);
    expect(r.status).toBe("evaluated");
  });

  it("homogénéité : N exercices à la même valeur X → résultat = X, pour X = 0..29", () => {
    for (let x = 0; x <= 29; x++) {
      const r = computeMuscleRank([ex("a", x), ex("b", x), ex("c", x)]);
      expect(r).toEqual({ status: "evaluated", tierIndex: x, contributingCount: 3 });
    }
  });

  it("le résultat reste toujours dans [min, max] des exercices évalués", () => {
    const samples: number[][] = [
      [0, 29],
      [27, 7, 7, 7],
      [0, 0, 29, 29],
      [2, 27, 2, 27, 2],
      [17, 17, 12],
    ];
    for (const tiers of samples) {
      const r = computeMuscleRank(tiers.map((t, i) => ex(`e${i}`, t)));
      if (r.status === "evaluated") {
        expect(r.tierIndex).toBeGreaterThanOrEqual(Math.min(...tiers));
        expect(r.tierIndex).toBeLessThanOrEqual(Math.max(...tiers));
      }
    }
  });

  it("un exercice à poids nominal élevé est plafonné à 50 % du poids total", () => {
    // Un exercice "primaire" (poids 3) très fort face à deux "secondaires"
    // (poids 1 chacun) faibles : sans plafond, il dominerait presque
    // entièrement le résultat. Avec plafond à 50 %, son influence est bornée.
    const withoutDominance = computeMuscleRank([
      { key: "a", tierIndex: 27, weight: 1 },
      { key: "b", tierIndex: 2, weight: 1 },
      { key: "c", tierIndex: 2, weight: 1 },
    ]);
    const withDominance = computeMuscleRank([
      { key: "a", tierIndex: 27, weight: 3 },
      { key: "b", tierIndex: 2, weight: 1 },
      { key: "c", tierIndex: 2, weight: 1 },
    ]);
    // Le poids plafonné (50% de 5 = 2.5) reste supérieur au cas équi-pondéré,
    // mais très inférieur à ce que donnerait un poids non plafonné (3/5=60%).
    expect(withDominance.tierIndex!).toBeGreaterThan(withoutDominance.tierIndex!);
    expect(withDominance.tierIndex!).toBeLessThan(20);
  });
});
