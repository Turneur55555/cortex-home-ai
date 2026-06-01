import { describe, expect, it } from "vitest";
import { resolveScanModule } from "./rooms";

describe("resolveScanModule", () => {
  it("mappe les pièces alimentation", () => {
    expect(resolveScanModule("cuisine")).toBe("alimentation");
    expect(resolveScanModule("Cuisine")).toBe("alimentation");
    expect(resolveScanModule("cave")).toBe("alimentation");
    expect(resolveScanModule("food")).toBe("alimentation");
    expect(resolveScanModule("grocery")).toBe("alimentation");
    expect(resolveScanModule("pantry")).toBe("alimentation");
  });

  it("mappe les pièces pharmacie", () => {
    expect(resolveScanModule("salle-de-bain")).toBe("pharmacie");
    expect(resolveScanModule("Salle de bain")).toBe("pharmacie");
    expect(resolveScanModule("pharmacie")).toBe("pharmacie");
  });

  it("mappe les pièces habits", () => {
    expect(resolveScanModule("dressing")).toBe("habits");
    expect(resolveScanModule("vêtement")).toBe("habits");
    expect(resolveScanModule("vêtements")).toBe("habits");
    expect(resolveScanModule("entree")).toBe("habits");
    expect(resolveScanModule("entrée")).toBe("habits");
  });

  it("mappe les pièces menager", () => {
    expect(resolveScanModule("buanderie")).toBe("menager");
    expect(resolveScanModule("ménage")).toBe("menager");
    expect(resolveScanModule("salon")).toBe("menager");
    expect(resolveScanModule("garage")).toBe("menager");
  });

  it("retombe sur menager pour les valeurs inconnues", () => {
    expect(resolveScanModule("inconnu")).toBe("menager");
    expect(resolveScanModule("")).toBe("menager");
    expect(resolveScanModule(null)).toBe("menager");
    expect(resolveScanModule(undefined)).toBe("menager");
  });

  it("est insensible à la casse, accents et espaces", () => {
    expect(resolveScanModule("  CUISINE  ")).toBe("alimentation");
    expect(resolveScanModule("SALLE DE BAIN")).toBe("pharmacie");
  });
});
