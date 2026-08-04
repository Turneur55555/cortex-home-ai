import { describe, expect, it } from "vitest";
import {
  computeFatMassRange,
  computeLeanMassRange,
  normalizePhotoEstimateResponse,
  PHOTO_ESTIMATE_MIN_RANGE_WIDTH_PERCENT,
  type RawPhotoEstimateResponse,
} from "./bodyFatPhotoEstimate";

const raw = (overrides: Partial<RawPhotoEstimateResponse>): RawPhotoEstimateResponse => ({
  status: "success",
  minPercent: 14,
  maxPercent: 16,
  warnings: [],
  ...overrides,
});

describe("normalizePhotoEstimateResponse — fourchette obligatoire (§17 du brief)", () => {
  it("range valide → min<=max, reference = midpoint déterministe", () => {
    const result = normalizePhotoEstimateResponse(raw({}));
    expect(result.status).toBe("success");
    expect(result.minPercent).not.toBeNull();
    expect(result.maxPercent).not.toBeNull();
    expect(result.minPercent!).toBeLessThanOrEqual(result.maxPercent!);
    expect(result.referencePercent).toBe((result.minPercent! + result.maxPercent!) / 2);
  });

  it("jamais method/engineVersion incorrects", () => {
    const result = normalizePhotoEstimateResponse(raw({}));
    expect(result.method).toBe("photo_estimate");
    expect(result.engineVersion).toBe("photo_body_fat_v1");
  });

  it("min = max (fourchette nulle) → élargie automatiquement à la largeur minimale (§18)", () => {
    const result = normalizePhotoEstimateResponse(raw({ minPercent: 15, maxPercent: 15 }));
    expect(result.status).toBe("success");
    expect(result.maxPercent! - result.minPercent!).toBeGreaterThanOrEqual(
      PHOTO_ESTIMATE_MIN_RANGE_WIDTH_PERCENT - 0.01,
    );
  });

  it("fourchette trop étroite (< largeur minimale) → élargie symétriquement autour du midpoint", () => {
    const result = normalizePhotoEstimateResponse(raw({ minPercent: 15, maxPercent: 15.2 }));
    expect(result.maxPercent! - result.minPercent!).toBeGreaterThanOrEqual(
      PHOTO_ESTIMATE_MIN_RANGE_WIDTH_PERCENT - 0.01,
    );
    // Toujours centrée sur l'estimation d'origine, pas décalée arbitrairement.
    expect(result.referencePercent!).toBeCloseTo(15.1, 0);
  });

  it("min > max (bornes inversées) → failed, jamais de valeur exposée", () => {
    const result = normalizePhotoEstimateResponse(raw({ minPercent: 20, maxPercent: 10 }));
    expect(result.status).toBe("failed");
    expect(result.minPercent).toBeNull();
    expect(result.maxPercent).toBeNull();
    expect(result.referencePercent).toBeNull();
  });

  it("négatif → failed", () => {
    const result = normalizePhotoEstimateResponse(raw({ minPercent: -5, maxPercent: 10 }));
    expect(result.status).toBe("failed");
  });

  it("NaN/Infinity → failed, jamais NaN exposé", () => {
    const nan = normalizePhotoEstimateResponse(raw({ minPercent: NaN }));
    const inf = normalizePhotoEstimateResponse(raw({ maxPercent: Infinity }));
    expect(nan.status).toBe("failed");
    expect(Number.isNaN(nan.minPercent)).toBe(false);
    expect(inf.status).toBe("failed");
  });

  it("hors bornes plausibles (>70) → failed", () => {
    const result = normalizePhotoEstimateResponse(raw({ minPercent: 68, maxPercent: 90 }));
    expect(result.status).toBe("failed");
  });

  it("limite BF (proche de 70) → élargissement ne dépasse jamais 70", () => {
    const result = normalizePhotoEstimateResponse(raw({ minPercent: 69, maxPercent: 69.5 }));
    if (result.status === "success") {
      expect(result.maxPercent!).toBeLessThanOrEqual(70);
    }
  });

  it("statuts d'échec du moteur (insufficient_quality/failed) → aucun Body Fat inventé (§46)", () => {
    const insufficient = normalizePhotoEstimateResponse(
      raw({ status: "insufficient_quality", minPercent: null, maxPercent: null }),
    );
    const failed = normalizePhotoEstimateResponse(
      raw({ status: "failed", minPercent: null, maxPercent: null }),
    );
    for (const r of [insufficient, failed]) {
      expect(r.status).not.toBe("success");
      expect(r.minPercent).toBeNull();
      expect(r.maxPercent).toBeNull();
      expect(r.referencePercent).toBeNull();
      expect(r.confidence).toBeNull();
    }
  });

  it("confiance réutilise le mapping centralisé Phase 6A (low), aucun second système (§20)", () => {
    const result = normalizePhotoEstimateResponse(raw({}));
    expect(result.confidence).toBe("low");
  });

  it("arrondi d'affichage — jamais de décimales multiples", () => {
    const result = normalizePhotoEstimateResponse(raw({ minPercent: 14.137, maxPercent: 16.284 }));
    expect(result.status).toBe("success");
    expect((result.minPercent! * 10) % 5).toBe(0);
    expect((result.maxPercent! * 10) % 5).toBe(0);
  });
});

describe("computeFatMassRange (§41 du brief)", () => {
  it("80 kg / 14-16% → 11.2-12.8 kg", () => {
    const range = computeFatMassRange(80, 14, 16);
    expect(range.minKg).toBeCloseTo(11.2, 5);
    expect(range.maxKg).toBeCloseTo(12.8, 5);
  });

  it("poids absent → indisponible", () => {
    const range = computeFatMassRange(null, 14, 16);
    expect(range.minKg).toBeNull();
    expect(range.maxKg).toBeNull();
  });

  it("range BF invalide → indisponible", () => {
    const range = computeFatMassRange(80, -5, 16);
    expect(range.minKg).toBeNull();
  });
});

describe("computeLeanMassRange — inversion des bornes (§42 du brief)", () => {
  it("80 kg / 14-16% → 67.2-68.8 kg (masse grasse max ⇒ masse maigre min)", () => {
    const range = computeLeanMassRange(80, 14, 16);
    expect(range.minKg).toBeCloseTo(67.2, 5);
    expect(range.maxKg).toBeCloseTo(68.8, 5);
  });

  it("vérifie explicitement l'inversion : leanMin correspond à fatMax", () => {
    const weight = 80;
    const fat = computeFatMassRange(weight, 14, 16);
    const lean = computeLeanMassRange(weight, 14, 16);
    expect(lean.minKg).toBeCloseTo(weight - fat.maxKg!, 5);
    expect(lean.maxKg).toBeCloseTo(weight - fat.minKg!, 5);
  });

  it("poids absent → indisponible", () => {
    const range = computeLeanMassRange(null, 14, 16);
    expect(range.minKg).toBeNull();
    expect(range.maxKg).toBeNull();
  });
});

describe("§43 du brief — range BF disponible mais poids absent", () => {
  it("BF affichable en amont (normalize), mais masses indisponibles séparément", () => {
    const estimate = normalizePhotoEstimateResponse(raw({}));
    expect(estimate.minPercent).not.toBeNull();
    const fat = computeFatMassRange(null, estimate.minPercent, estimate.maxPercent);
    const lean = computeLeanMassRange(null, estimate.minPercent, estimate.maxPercent);
    expect(fat.minKg).toBeNull();
    expect(lean.minKg).toBeNull();
  });
});
