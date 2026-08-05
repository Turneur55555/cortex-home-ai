import { describe, expect, it } from "vitest";
import {
  WARDROBE_PROCESSING_MAX_DIMENSION,
  computeCenteredFit,
  computeDownscaleDimensions,
  pickDisplayStoragePath,
} from "./imageProcessing";

describe("computeCenteredFit — normalisation (Phase 5 §3)", () => {
  it("centre une image carrée dans un canvas carré avec la marge attendue", () => {
    const rect = computeCenteredFit(500, 500, 1000, 0.1);
    expect(rect.x).toBeCloseTo(rect.y);
    expect(rect.width).toBeCloseTo(rect.height);
    // Marge de 10% de chaque côté → utilisable = 800px.
    expect(rect.width).toBeCloseTo(800, 0);
    expect(rect.x).toBeCloseTo(100, 0);
  });

  it("préserve le ratio d'aspect d'une image portrait (jamais d'étirement)", () => {
    const rect = computeCenteredFit(400, 800, 1000, 0.08);
    const srcRatio = 400 / 800;
    const dstRatio = rect.width / rect.height;
    expect(dstRatio).toBeCloseTo(srcRatio, 5);
  });

  it("préserve le ratio d'aspect d'une image paysage (jamais de recadrage)", () => {
    const rect = computeCenteredFit(1200, 300, 1000, 0.08);
    const srcRatio = 1200 / 300;
    const dstRatio = rect.width / rect.height;
    expect(dstRatio).toBeCloseTo(srcRatio, 5);
  });

  it("le rectangle reste toujours à l'intérieur du canvas", () => {
    for (const [w, h] of [
      [100, 900],
      [900, 100],
      [1, 1],
      [1234, 987],
    ]) {
      const rect = computeCenteredFit(w, h, 1024, 0.08);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(1024 + 0.001);
      expect(rect.y + rect.height).toBeLessThanOrEqual(1024 + 0.001);
    }
  });

  it("retourne un rectangle vide pour des dimensions invalides", () => {
    expect(computeCenteredFit(0, 500, 1000)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(computeCenteredFit(500, 0, 1000)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(computeCenteredFit(500, 500, 0)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it("plafonne une marge déraisonnable plutôt que de produire un rectangle négatif", () => {
    const rect = computeCenteredFit(500, 500, 1000, 0.9);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });
});

describe("computeDownscaleDimensions — perf (Phase 5 §6)", () => {
  it("ne modifie pas une image déjà plus petite que la limite", () => {
    expect(computeDownscaleDimensions(800, 600, WARDROBE_PROCESSING_MAX_DIMENSION)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("réduit une image trop grande en conservant le ratio", () => {
    const result = computeDownscaleDimensions(4000, 3000, 1280);
    expect(result.width).toBe(1280);
    expect(result.height).toBe(960);
  });

  it("ne fait jamais d'agrandissement (upscale)", () => {
    const result = computeDownscaleDimensions(200, 100, 1280);
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
  });

  it("gère les images très hautes (portrait) sans dépasser la limite en hauteur", () => {
    const result = computeDownscaleDimensions(600, 5000, 1280);
    expect(result.height).toBe(1280);
    expect(result.width).toBe(154); // 600 * (1280/5000), arrondi
  });
});

describe("pickDisplayStoragePath — fallback grille (Phase 5 §7)", () => {
  it("préfère l'image détourée/normalisée quand elle existe", () => {
    expect(
      pickDisplayStoragePath({
        storage_path: "u/i/original.jpg",
        processed_storage_path: "u/i/processed.webp",
      }),
    ).toBe("u/i/processed.webp");
  });

  it("retombe automatiquement sur l'original si le traitement n'existe pas", () => {
    expect(
      pickDisplayStoragePath({ storage_path: "u/i/original.jpg", processed_storage_path: null }),
    ).toBe("u/i/original.jpg");
  });

  it("retombe sur l'original si processed_storage_path est absent du payload", () => {
    expect(pickDisplayStoragePath({ storage_path: "u/i/original.jpg" })).toBe("u/i/original.jpg");
  });

  it("retourne null si aucune image n'est disponible", () => {
    expect(pickDisplayStoragePath({ storage_path: null, processed_storage_path: null })).toBeNull();
  });
});
