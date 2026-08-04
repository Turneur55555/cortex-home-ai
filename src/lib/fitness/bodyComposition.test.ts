import { describe, expect, it } from "vitest";
import {
  areBodyFatMethodsComparable,
  bodyFatRangeMidpoint,
  computeBodyCompositionSnapshot,
  computeBodyCompositionTrend,
  computeFatMass,
  computeLeanMass,
  getBodyFatConfidence,
  describeBodyFatProvenance,
  isKnownBodyFatMethod,
  isValidBodyFatPercent,
  resolveBodyFatMethod,
  BODY_FAT_METHOD_CONFIDENCE,
  BODY_FAT_METHODS,
  type BodyCompositionMeasurement,
} from "./bodyComposition";

const measurement = (
  overrides: Partial<BodyCompositionMeasurement>,
): BodyCompositionMeasurement => ({
  date: "2026-06-01",
  weightKg: 80,
  bodyFatPercent: 20,
  bodyFatMinPercent: null,
  bodyFatMaxPercent: null,
  method: "bioimpedance",
  ...overrides,
});

describe("computeFatMass / computeLeanMass — calculs de base (§40 du brief)", () => {
  it("80 kg / 20% → 16 kg de masse grasse, 64 kg de masse maigre", () => {
    expect(computeFatMass(80, 20)).toBe(16);
    expect(computeLeanMass(80, 20)).toBe(64);
  });

  it("gère les décimales", () => {
    expect(computeFatMass(73.4, 18.7)).toBeCloseTo(13.73, 1);
    expect(computeLeanMass(73.4, 18.7)).toBeCloseTo(59.67, 1);
  });

  it("poids faible", () => {
    expect(computeFatMass(45, 22)).toBeCloseTo(9.9, 1);
  });

  it("poids élevé", () => {
    expect(computeFatMass(180, 30)).toBe(54);
  });

  it("Body Fat faible (valide, borne basse)", () => {
    expect(computeFatMass(90, 5)).toBe(4.5);
  });

  it("Body Fat élevé valide", () => {
    expect(computeFatMass(90, 45)).toBe(40.5);
  });

  it("valeurs invalides → null, jamais fabriqué", () => {
    expect(computeFatMass(null, 20)).toBeNull();
    expect(computeFatMass(80, null)).toBeNull();
    expect(computeFatMass(0, 20)).toBeNull();
    expect(computeFatMass(-80, 20)).toBeNull();
    expect(computeFatMass(80, -5)).toBeNull();
    expect(computeFatMass(80, 150)).toBeNull(); // hors bornes 1-70
  });

  it("NaN/Infinity → null", () => {
    expect(computeFatMass(NaN, 20)).toBeNull();
    expect(computeFatMass(80, NaN)).toBeNull();
    expect(computeFatMass(Infinity, 20)).toBeNull();
    expect(computeFatMass(80, Infinity)).toBeNull();
    expect(computeLeanMass(NaN, 20)).toBeNull();
  });

  it("leanMass jamais négative pour des entrées plausibles", () => {
    expect(computeLeanMass(70, 65)!).toBeGreaterThan(0);
  });
});

describe("isValidBodyFatPercent", () => {
  it("bornes 1-70 (synchronisées avec le CHECK DB)", () => {
    expect(isValidBodyFatPercent(1)).toBe(true);
    expect(isValidBodyFatPercent(70)).toBe(true);
    expect(isValidBodyFatPercent(0.5)).toBe(false);
    expect(isValidBodyFatPercent(70.5)).toBe(false);
    expect(isValidBodyFatPercent(-5)).toBe(false);
    expect(isValidBodyFatPercent(150)).toBe(false);
    expect(isValidBodyFatPercent(NaN)).toBe(false);
    expect(isValidBodyFatPercent(Infinity)).toBe(false);
    expect(isValidBodyFatPercent(null)).toBe(false);
  });
});

describe("bodyFatRangeMidpoint", () => {
  it("15-17% → 16%", () => {
    expect(bodyFatRangeMidpoint(15, 17)).toBe(16);
  });
  it("un seul bord manquant → null", () => {
    expect(bodyFatRangeMidpoint(15, null)).toBeNull();
    expect(bodyFatRangeMidpoint(null, 17)).toBeNull();
  });
});

describe("mapping confiance centralisé (§43 du brief)", () => {
  it("aucun pourcentage inventé — uniquement high/medium/low", () => {
    for (const level of Object.values(BODY_FAT_METHOD_CONFIDENCE)) {
      expect(["high", "medium", "low"]).toContain(level);
    }
  });

  it("dexa → high", () => {
    expect(getBodyFatConfidence("dexa")).toBe("high");
  });

  it("manual → low (provenance réelle inconnue de Cortex)", () => {
    expect(getBodyFatConfidence("manual")).toBe("low");
  });

  it("bioimpedance et measurements → medium", () => {
    expect(getBodyFatConfidence("bioimpedance")).toBe("medium");
    expect(getBodyFatConfidence("measurements")).toBe("medium");
  });

  it("photo_estimate → low", () => {
    expect(getBodyFatConfidence("photo_estimate")).toBe("low");
  });

  it("méthode inconnue (null/undefined) → low, jamais devinée à la hausse", () => {
    expect(getBodyFatConfidence(null)).toBe("low");
    expect(getBodyFatConfidence(undefined)).toBe("low");
  });

  it("toutes les méthodes supportées ont une confiance mappée (§42)", () => {
    for (const m of BODY_FAT_METHODS) {
      expect(BODY_FAT_METHOD_CONFIDENCE[m]).toBeDefined();
    }
  });
});

describe("isKnownBodyFatMethod", () => {
  it("valide chaque méthode supportée", () => {
    for (const m of BODY_FAT_METHODS) {
      expect(isKnownBodyFatMethod(m)).toBe(true);
    }
  });
  it("rejette une chaîne inconnue", () => {
    expect(isKnownBodyFatMethod("caliper")).toBe(false);
    expect(isKnownBodyFatMethod(null)).toBe(false);
    expect(isKnownBodyFatMethod(undefined)).toBe(false);
  });
});

describe("resolveBodyFatMethod (Phase 10 §1)", () => {
  it("aucune valeur Body Fat saisie → method reste null", () => {
    expect(resolveBodyFatMethod(null, false)).toBeNull();
    expect(resolveBodyFatMethod("dexa", false)).toBeNull();
  });
  it("Body Fat saisi + méthode choisie → méthode conservée telle quelle", () => {
    expect(resolveBodyFatMethod("dexa", true)).toBe("dexa");
    expect(resolveBodyFatMethod("bioimpedance", true)).toBe("bioimpedance");
  });
  it("Body Fat saisi SANS méthode choisie → fallback 'manual', jamais null ni une méthode précise inventée", () => {
    expect(resolveBodyFatMethod(null, true)).toBe("manual");
  });
});

describe("describeBodyFatProvenance (Phase 10 — correctif de clôture §3)", () => {
  it("aucun document source lié → provenance 'direct_entry'", () => {
    expect(describeBodyFatProvenance(false)).toBe("direct_entry");
  });
  it("document source lié → provenance 'imported_document', jamais une marque/appareil inventé", () => {
    expect(describeBodyFatProvenance(true)).toBe("imported_document");
  });
  it("la provenance reste indépendante de la méthode/confiance (Phase 6A inchangée)", () => {
    // Une méthode "manual" peut avoir n'importe quelle provenance sans que
    // la confiance associée (toujours "low" pour manual) ne change.
    expect(getBodyFatConfidence("manual")).toBe("low");
    expect(describeBodyFatProvenance(true)).toBe("imported_document");
    expect(describeBodyFatProvenance(false)).toBe("direct_entry");
  });
});

describe("computeBodyCompositionSnapshot", () => {
  it("Body Fat + poids disponibles → masse grasse/maigre calculées", () => {
    const snap = computeBodyCompositionSnapshot(measurement({}));
    expect(snap.fatMassKg).toBe(16);
    expect(snap.leanMassKg).toBe(64);
    expect(snap.confidence).toBe("medium");
  });

  it("§45 — Body Fat disponible mais poids absent → BF affichable, masses indisponibles", () => {
    const snap = computeBodyCompositionSnapshot(measurement({ weightKg: null }));
    expect(snap.bodyFatPercent).toBe(20);
    expect(snap.fatMassKg).toBeNull();
    expect(snap.leanMassKg).toBeNull();
  });

  it("aucun Body Fat → confidence null, pas de fausse confiance", () => {
    const snap = computeBodyCompositionSnapshot(measurement({ bodyFatPercent: null }));
    expect(snap.confidence).toBeNull();
    expect(snap.fatMassKg).toBeNull();
  });

  it("intervalle (min/max) détecté", () => {
    const snap = computeBodyCompositionSnapshot(
      measurement({
        bodyFatPercent: null,
        bodyFatMinPercent: 15,
        bodyFatMaxPercent: 17,
        method: "photo_estimate",
      }),
    );
    expect(snap.isRange).toBe(true);
    expect(snap.bodyFatMinPercent).toBe(15);
    expect(snap.bodyFatMaxPercent).toBe(17);
  });

  it("méthode null (mesure historique) → confidence low si BF présent", () => {
    const snap = computeBodyCompositionSnapshot(measurement({ method: null }));
    expect(snap.confidence).toBe("low");
  });
});

describe("areBodyFatMethodsComparable (§44 du brief)", () => {
  it("bioimpedance → bioimpedance : comparable", () => {
    expect(areBodyFatMethodsComparable("bioimpedance", "bioimpedance")).toBe(true);
  });
  it("dexa → bioimpedance : non comparable", () => {
    expect(areBodyFatMethodsComparable("dexa", "bioimpedance")).toBe(false);
  });
  it("méthode inconnue des deux côtés : non comparable (jamais présumé fiable)", () => {
    expect(areBodyFatMethodsComparable(null, null)).toBe(false);
  });
  it("une seule méthode connue : non comparable", () => {
    expect(areBodyFatMethodsComparable("dexa", null)).toBe(false);
  });
});

describe("computeBodyCompositionTrend — historique (§41/§44)", () => {
  it("aucune mesure → null", () => {
    expect(computeBodyCompositionTrend([])).toBeNull();
  });

  it("une seule mesure → non comparable, pas de tendance", () => {
    const trend = computeBodyCompositionTrend([measurement({})]);
    expect(trend!.comparable).toBe(false);
    expect(trend!.previous).toBeNull();
  });

  it("plusieurs mesures, même méthode → tendance directe calculée", () => {
    const rows: BodyCompositionMeasurement[] = [
      measurement({
        date: "2026-07-01",
        weightKg: 78,
        bodyFatPercent: 15.9,
        method: "bioimpedance",
      }),
      measurement({
        date: "2026-06-15",
        weightKg: 79,
        bodyFatPercent: 16.5,
        method: "bioimpedance",
      }),
      measurement({
        date: "2026-06-01",
        weightKg: 80,
        bodyFatPercent: 17.2,
        method: "bioimpedance",
      }),
    ];
    const trend = computeBodyCompositionTrend(rows);
    expect(trend!.comparable).toBe(true);
    expect(trend!.bodyFatChangePercent).toBeCloseTo(-0.6, 5);
    expect(trend!.fatMassChangeKg).not.toBeNull();
    expect(trend!.leanMassChangeKg).not.toBeNull();
  });

  it("méthodes différentes entre les deux dernières mesures → non comparable, signalé", () => {
    const rows: BodyCompositionMeasurement[] = [
      measurement({ date: "2026-07-01", method: "dexa", bodyFatPercent: 15 }),
      measurement({ date: "2026-06-01", method: "bioimpedance", bodyFatPercent: 17 }),
    ];
    const trend = computeBodyCompositionTrend(rows);
    expect(trend!.comparable).toBe(false);
    expect(trend!.reason).toMatch(/différentes/);
    expect(trend!.bodyFatChangePercent).toBeNull();
  });

  it("ordre des dates respecté : compare les deux plus RÉCENTES avec BF, ignore les lignes sans BF", () => {
    const rows: BodyCompositionMeasurement[] = [
      measurement({ date: "2026-07-10", bodyFatPercent: null, method: "bioimpedance" }), // ignorée (pas de BF)
      measurement({ date: "2026-07-01", bodyFatPercent: 16, method: "bioimpedance" }),
      measurement({ date: "2026-06-01", bodyFatPercent: 18, method: "bioimpedance" }),
    ];
    const trend = computeBodyCompositionTrend(rows);
    expect(trend!.latest.date).toBe("2026-07-01");
    expect(trend!.previous!.date).toBe("2026-06-01");
  });

  it("robustesse : poids absent sur une des deux mesures → change en masse indisponible mais BF change calculé", () => {
    const rows: BodyCompositionMeasurement[] = [
      measurement({
        date: "2026-07-01",
        weightKg: null,
        bodyFatPercent: 16,
        method: "bioimpedance",
      }),
      measurement({ date: "2026-06-01", weightKg: 80, bodyFatPercent: 18, method: "bioimpedance" }),
    ];
    const trend = computeBodyCompositionTrend(rows);
    expect(trend!.comparable).toBe(true);
    expect(trend!.bodyFatChangePercent).toBe(-2);
    expect(trend!.fatMassChangeKg).toBeNull();
    expect(trend!.leanMassChangeKg).toBeNull();
  });
});
