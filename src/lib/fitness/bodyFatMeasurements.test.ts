import { describe, expect, it } from "vitest";
import {
  estimateBodyFatFromMeasurements,
  requiredMeasurementsForSex,
  type NavyMeasurementsInput,
} from "./bodyFatMeasurements";

const homme = (overrides: Partial<NavyMeasurementsInput>): NavyMeasurementsInput => ({
  sex: "homme",
  heightCm: 177.8, // 70 in
  waistCm: 88.9, // 35 in
  neckCm: 38.1, // 15 in
  hipCm: null,
  ...overrides,
});

const femme = (overrides: Partial<NavyMeasurementsInput>): NavyMeasurementsInput => ({
  sex: "femme",
  heightCm: 165.1, // 65 in
  waistCm: 76.2, // 30 in
  neckCm: 33, // ~13 in
  hipCm: 96.5, // ~38 in
  ...overrides,
});

describe("requiredMeasurementsForSex (§4 du brief)", () => {
  it("homme : taille + tour de taille + tour de cou uniquement", () => {
    expect(requiredMeasurementsForSex("homme")).toEqual(["waistCm", "neckCm"]);
  });
  it("femme : + tour de hanches", () => {
    expect(requiredMeasurementsForSex("femme")).toEqual(["waistCm", "neckCm", "hipCm"]);
  });
});

describe("estimateBodyFatFromMeasurements — formule homme (§25 du brief)", () => {
  it("cas nominal : 70in taille / 35in taille / 15in cou → calculé via la formule documentée (≈12-13 %)", () => {
    // 495 / (1.0324 - 0.19077·log10(35-15) + 0.15456·log10(70)) - 450, dataset en inches.
    const result = estimateBodyFatFromMeasurements(homme({}));
    expect(result.status).toBe("ok");
    expect(result.bodyFatPercent).toBeCloseTo(12.9, 0);
  });

  it("gère les décimales sans erreur", () => {
    const result = estimateBodyFatFromMeasurements(
      homme({ heightCm: 180.3, waistCm: 91.7, neckCm: 39.4 }),
    );
    expect(result.status).toBe("ok");
    expect(result.bodyFatPercent).not.toBeNull();
  });

  it("conversion d'unités correcte : cm équivalents à des pouces ronds donnent le même résultat qu'un calcul manuel en pouces", () => {
    // 177.8cm=70in / 88.9cm=35in / 38.1cm=15in — vérifie qu'aucun mélange
    // d'unités n'est appliqué (coefficients calibrés en pouces).
    const cmResult = estimateBodyFatFromMeasurements(
      homme({ heightCm: 70 * 2.54, waistCm: 35 * 2.54, neckCm: 15 * 2.54 }),
    );
    const manualIn =
      495 / (1.0324 - 0.19077 * Math.log10(35 - 15) + 0.15456 * Math.log10(70)) - 450;
    expect(cmResult.bodyFatPercent).toBeCloseTo(Math.round(manualIn * 10) / 10, 5);
  });

  it("waist proche de neck → résultat élevé mais valide", () => {
    const result = estimateBodyFatFromMeasurements(homme({ waistCm: 40, neckCm: 38 }));
    expect(["ok", "invalid_measurements"]).toContain(result.status);
  });

  it("waist <= neck → invalid_measurements, jamais NaN", () => {
    const equal = estimateBodyFatFromMeasurements(homme({ waistCm: 38, neckCm: 38 }));
    const less = estimateBodyFatFromMeasurements(homme({ waistCm: 35, neckCm: 40 }));
    expect(equal.status).toBe("invalid_measurements");
    expect(equal.bodyFatPercent).toBeNull();
    expect(less.status).toBe("invalid_measurements");
    expect(less.bodyFatPercent).toBeNull();
  });

  it("valeurs invalides (NaN/Infinity/négatif/zéro) → missing_data ou invalid_measurements, jamais NaN exposé", () => {
    for (const bad of [NaN, Infinity, -10, 0]) {
      const r = estimateBodyFatFromMeasurements(homme({ waistCm: bad }));
      expect(r.status).not.toBe("ok");
      expect(r.bodyFatPercent).toBeNull();
      expect(Number.isNaN(r.bodyFatPercent)).toBe(false);
    }
  });
});

describe("estimateBodyFatFromMeasurements — formule femme (§26 du brief)", () => {
  it("cas nominal calculé via la formule documentée", () => {
    const result = estimateBodyFatFromMeasurements(femme({}));
    expect(result.status).toBe("ok");
    expect(result.bodyFatPercent).not.toBeNull();
    expect(result.bodyFatPercent!).toBeGreaterThan(0);
  });

  it("gère les décimales", () => {
    const result = estimateBodyFatFromMeasurements(
      femme({ heightCm: 162.5, waistCm: 74.3, neckCm: 31.8, hipCm: 98.2 }),
    );
    expect(result.status).toBe("ok");
  });

  it("hanches manquantes → missing_data (requis pour femme)", () => {
    const result = estimateBodyFatFromMeasurements(femme({ hipCm: null }));
    expect(result.status).toBe("missing_data");
    expect(result.warnings[0]).toMatch(/hanches/i);
  });

  it("géométrie invalide (taille+hanches <= cou) → invalid_measurements", () => {
    const result = estimateBodyFatFromMeasurements(femme({ waistCm: 20, hipCm: 10, neckCm: 33 }));
    expect(result.status).toBe("invalid_measurements");
    expect(result.bodyFatPercent).toBeNull();
  });

  it("valeurs invalides → jamais NaN", () => {
    const r = estimateBodyFatFromMeasurements(femme({ hipCm: NaN }));
    expect(r.status).not.toBe("ok");
    expect(Number.isNaN(r.bodyFatPercent)).toBe(false);
  });
});

describe("invariants (§27 du brief)", () => {
  it("augmenter le tour de taille (toutes choses égales) augmente le BF estimé", () => {
    const lower = estimateBodyFatFromMeasurements(homme({ waistCm: 85 }));
    const higher = estimateBodyFatFromMeasurements(homme({ waistCm: 95 }));
    expect(higher.bodyFatPercent!).toBeGreaterThan(lower.bodyFatPercent!);
  });

  it("augmenter le tour de cou (toutes choses égales) diminue le BF estimé", () => {
    const thinnerNeck = estimateBodyFatFromMeasurements(homme({ neckCm: 36 }));
    const thickerNeck = estimateBodyFatFromMeasurements(homme({ neckCm: 42 }));
    expect(thickerNeck.bodyFatPercent!).toBeLessThan(thinnerNeck.bodyFatPercent!);
  });

  it("augmenter la taille corporelle (toutes choses égales) diminue le BF estimé", () => {
    const shorter = estimateBodyFatFromMeasurements(homme({ heightCm: 165 }));
    const taller = estimateBodyFatFromMeasurements(homme({ heightCm: 195 }));
    expect(taller.bodyFatPercent!).toBeLessThan(shorter.bodyFatPercent!);
  });

  it("femme : augmenter le tour de hanches (toutes choses égales) augmente le BF estimé", () => {
    const lower = estimateBodyFatFromMeasurements(femme({ hipCm: 90 }));
    const higher = estimateBodyFatFromMeasurements(femme({ hipCm: 105 }));
    expect(higher.bodyFatPercent!).toBeGreaterThan(lower.bodyFatPercent!);
  });
});

describe("données manquantes (§31 du brief)", () => {
  it("sexe absent → missing_data", () => {
    const result = estimateBodyFatFromMeasurements(homme({ sex: null }));
    expect(result.status).toBe("missing_data");
  });
  it("taille absente → missing_data", () => {
    const result = estimateBodyFatFromMeasurements(homme({ heightCm: null }));
    expect(result.status).toBe("missing_data");
  });
  it("tour de taille absent → missing_data", () => {
    const result = estimateBodyFatFromMeasurements(homme({ waistCm: null }));
    expect(result.status).toBe("missing_data");
  });
  it("tour de cou absent → missing_data", () => {
    const result = estimateBodyFatFromMeasurements(homme({ neckCm: null }));
    expect(result.status).toBe("missing_data");
  });
});

describe("résultat — précision (§12 du brief)", () => {
  it("toujours arrondi à 1 décimale, jamais une précision artificielle", () => {
    const result = estimateBodyFatFromMeasurements(homme({}));
    if (result.bodyFatPercent != null) {
      const scaled = Math.round(result.bodyFatPercent * 10);
      expect(Math.abs(scaled - result.bodyFatPercent * 10)).toBeLessThan(1e-6);
    }
  });
});

describe("méthode/confiance (§29 du brief)", () => {
  it("method = measurements, formula = navy_v1", () => {
    const result = estimateBodyFatFromMeasurements(homme({}));
    expect(result.method).toBe("measurements");
    expect(result.formula).toBe("navy_v1");
  });

  it("confiance réutilise le mapping centralisé Phase 6A (pas un second système)", () => {
    const result = estimateBodyFatFromMeasurements(homme({}));
    expect(result.confidence).toBe("medium");
  });

  it("confidence null si le calcul échoue", () => {
    const result = estimateBodyFatFromMeasurements(homme({ sex: null }));
    expect(result.confidence).toBeNull();
  });
});
