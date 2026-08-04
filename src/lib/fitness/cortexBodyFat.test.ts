import { describe, expect, it } from "vitest";
import {
  computeCortexBodyFatEstimate,
  describeCortexBodyFatSources,
  selectCortexBodyFatInputs,
  CORTEX_BODY_FAT_THRESHOLDS,
  type CortexBodyFatCandidate,
} from "./cortexBodyFat";

const TODAY = "2026-08-03";
const MAX_AGE_DAYS = 90;

function candidate(
  partial: Partial<CortexBodyFatCandidate> & { date: string },
): CortexBodyFatCandidate {
  return {
    method: null,
    bodyFatPercent: null,
    bodyFatMinPercent: null,
    bodyFatMaxPercent: null,
    ...partial,
  };
}

describe("computeCortexBodyFatEstimate — indépendance vis-à-vis des méthodes externes", () => {
  // A. Aucune mensuration/photo, Visbody/manual disponible → aucun Body Fat Cortex.
  it("A — mensurations et photos absentes → methodCount 0, aucune estimation, même si des méthodes externes existent ailleurs", () => {
    const r = computeCortexBodyFatEstimate({ measurements: null, photo: null });
    expect(r.methodCount).toBe(0);
    expect(r.referencePercent).toBeNull();
    expect(r.usableForRecommendation).toBe(false);
    expect(r.usableForAutomaticAdjustment).toBe(false);
  });

  // B. Mensurations seules.
  it("B — mensurations seules → estimation disponible, source measurements", () => {
    const r = computeCortexBodyFatEstimate({
      measurements: { date: "2026-08-01", bodyFatPercent: 15.2 },
      photo: null,
    });
    expect(r.methodCount).toBe(1);
    expect(r.methodsUsed).toEqual(["measurements"]);
    expect(r.referencePercent).toBe(15.2);
    expect(r.minPercent).toBe(15.2);
    expect(r.maxPercent).toBe(15.2);
    expect(r.usableForRecommendation).toBe(true);
  });

  // C. Photo seule.
  it("C — photo seule → fourchette conservée, automatique interdit (confiance low)", () => {
    const r = computeCortexBodyFatEstimate({
      measurements: null,
      photo: { date: "2026-08-01", minPercent: 14, maxPercent: 17, referencePercent: 15.5 },
    });
    expect(r.methodCount).toBe(1);
    expect(r.methodsUsed).toEqual(["photo_estimate"]);
    expect(r.minPercent).toBe(14);
    expect(r.maxPercent).toBe(17);
    expect(r.confidence).toBe("low");
    expect(r.usableForAutomaticAdjustment).toBe(false);
  });

  // D. Convergence.
  it("D — mensurations 15 % + photos 14–17 % → convergence, estimation dans la zone cohérente", () => {
    const r = computeCortexBodyFatEstimate({
      measurements: { date: "2026-08-01", bodyFatPercent: 15 },
      photo: { date: "2026-08-01", minPercent: 14, maxPercent: 17, referencePercent: 15.5 },
    });
    expect(r.disagreement).toBe(false);
    expect(r.referencePercent).not.toBeNull();
    expect(r.referencePercent!).toBeGreaterThanOrEqual(14);
    expect(r.referencePercent!).toBeLessThanOrEqual(17);
    expect(r.minPercent!).toBeLessThanOrEqual(r.maxPercent!);
    expect(r.confidence).toBe("medium");
    expect(r.usableForAutomaticAdjustment).toBe(true);
  });

  // E. Désaccord.
  it("E — mensurations 12 % + photos 16–19 % → disagreement, fourchette élargie, confiance réduite, automatique interdit", () => {
    const r = computeCortexBodyFatEstimate({
      measurements: { date: "2026-08-01", bodyFatPercent: 12 },
      photo: { date: "2026-08-01", minPercent: 16, maxPercent: 19, referencePercent: 17.5 },
    });
    expect(r.disagreement).toBe(true);
    expect(r.confidence).toBe("low");
    expect(r.usableForAutomaticAdjustment).toBe(false);
    // Fourchette élargie doit couvrir les deux estimations, jamais une moyenne artificielle à 15 %.
    expect(r.minPercent!).toBeLessThanOrEqual(12);
    expect(r.maxPercent!).toBeGreaterThanOrEqual(19);
    expect(r.referencePercent).not.toBe(15);
  });

  it("le désaccord n'est jamais masqué par une moyenne naïve des points médians", () => {
    const r = computeCortexBodyFatEstimate({
      measurements: { date: "2026-08-01", bodyFatPercent: 12 },
      photo: { date: "2026-08-01", minPercent: 16, maxPercent: 19, referencePercent: 17.5 },
    });
    // Une moyenne naïve (12 + 17.5) / 2 = 14.75 masquerait le désaccord — vérifie qu'on ne retombe pas dessus.
    expect(r.referencePercent).not.toBeCloseTo(14.75, 1);
  });

  // N. Concordance mais mesures éloignées dans le temps.
  it("N — concordance mais mensurations/photo éloignées de plus de 30 j → confiance réduite (low), jamais masquée", () => {
    const r = computeCortexBodyFatEstimate({
      measurements: { date: "2026-06-01", bodyFatPercent: 15 },
      photo: { date: "2026-08-01", minPercent: 14, maxPercent: 17, referencePercent: 15.5 },
    });
    expect(r.disagreement).toBe(false);
    expect(r.confidence).toBe("low");
    expect(r.usableForAutomaticAdjustment).toBe(false);
  });

  it("concordance avec mesures rapprochées dans le temps → confiance medium (pas de pénalité injustifiée)", () => {
    const r = computeCortexBodyFatEstimate({
      measurements: { date: "2026-08-01", bodyFatPercent: 15 },
      photo: { date: "2026-08-10", minPercent: 14, maxPercent: 17, referencePercent: 15.5 },
    });
    expect(r.confidence).toBe("medium");
  });
});

describe("selectCortexBodyFatInputs — Visbody/manual/dexa/bioimpedance structurellement exclus", () => {
  // F. TEST CRITIQUE — Visbody/manual n'a aucune contribution.
  it("F — Visbody/manual à 8 % n'affecte AUCUNEMENT le résultat Cortex (mensurations 15 %, photos 14–17 %)", () => {
    const withoutVisbody: CortexBodyFatCandidate[] = [
      candidate({ date: "2026-08-01", method: "measurements", bodyFatPercent: 15 }),
      candidate({
        date: "2026-07-30",
        method: "photo_estimate",
        bodyFatPercent: 15.5,
        bodyFatMinPercent: 14,
        bodyFatMaxPercent: 17,
      }),
    ];
    const withVisbody: CortexBodyFatCandidate[] = [
      candidate({ date: "2026-08-02", method: "manual", bodyFatPercent: 8 }),
      ...withoutVisbody,
    ];

    const inputsWithout = selectCortexBodyFatInputs(withoutVisbody, TODAY, MAX_AGE_DAYS);
    const inputsWith = selectCortexBodyFatInputs(withVisbody, TODAY, MAX_AGE_DAYS);
    const resultWithout = computeCortexBodyFatEstimate(inputsWithout);
    const resultWith = computeCortexBodyFatEstimate(inputsWith);

    expect(resultWith).toEqual(resultWithout);
  });

  // G. Changer la valeur Visbody ne change rien.
  it("G — faire varier Visbody de 8 % à 25 % → résultat Cortex strictement inchangé", () => {
    const base: CortexBodyFatCandidate[] = [
      candidate({ date: "2026-08-01", method: "measurements", bodyFatPercent: 15 }),
      candidate({
        date: "2026-07-30",
        method: "photo_estimate",
        bodyFatPercent: 15.5,
        bodyFatMinPercent: 14,
        bodyFatMaxPercent: 17,
      }),
    ];
    const withVisbody8 = [
      candidate({ date: "2026-08-02", method: "manual", bodyFatPercent: 8 }),
      ...base,
    ];
    const withVisbody25 = [
      candidate({ date: "2026-08-02", method: "manual", bodyFatPercent: 25 }),
      ...base,
    ];

    const r8 = computeCortexBodyFatEstimate(
      selectCortexBodyFatInputs(withVisbody8, TODAY, MAX_AGE_DAYS),
    );
    const r25 = computeCortexBodyFatEstimate(
      selectCortexBodyFatInputs(withVisbody25, TODAY, MAX_AGE_DAYS),
    );
    expect(r8).toEqual(r25);
  });

  // H. Plusieurs Visbody historiques → aucun vote.
  it("H — plusieurs mesures Visbody/externes historiques n'ajoutent aucun vote au consensus", () => {
    const base: CortexBodyFatCandidate[] = [
      candidate({ date: "2026-08-01", method: "measurements", bodyFatPercent: 15 }),
    ];
    const withManyExternals: CortexBodyFatCandidate[] = [
      candidate({ date: "2026-08-02", method: "manual", bodyFatPercent: 8 }),
      candidate({ date: "2026-07-20", method: "dexa", bodyFatPercent: 11 }),
      candidate({ date: "2026-06-15", method: "bioimpedance", bodyFatPercent: 9 }),
      ...base,
    ];
    const rBase = computeCortexBodyFatEstimate(
      selectCortexBodyFatInputs(base, TODAY, MAX_AGE_DAYS),
    );
    const rWithExternals = computeCortexBodyFatEstimate(
      selectCortexBodyFatInputs(withManyExternals, TODAY, MAX_AGE_DAYS),
    );
    expect(rWithExternals).toEqual(rBase);
  });

  // Q. Visbody seul → jamais usableForAutomaticAdjustment.
  it("Q — Visbody/manual seul (aucune mensuration/photo) → jamais usableForAutomaticAdjustment=true, jamais de Body Fat Cortex", () => {
    const onlyExternal: CortexBodyFatCandidate[] = [
      candidate({ date: "2026-08-01", method: "manual", bodyFatPercent: 8 }),
      candidate({ date: "2026-07-01", method: "dexa", bodyFatPercent: 12 }),
    ];
    const r = computeCortexBodyFatEstimate(
      selectCortexBodyFatInputs(onlyExternal, TODAY, MAX_AGE_DAYS),
    );
    expect(r.methodCount).toBe(0);
    expect(r.usableForAutomaticAdjustment).toBe(false);
    expect(r.referencePercent).toBeNull();
  });

  // R. Désaccord → automatique interdit (déjà couvert par E, revérifié via le sélecteur).
  it("R — mensurations + photos discordantes (via le sélecteur) → automatique interdit", () => {
    const rows: CortexBodyFatCandidate[] = [
      candidate({ date: "2026-08-01", method: "measurements", bodyFatPercent: 12 }),
      candidate({
        date: "2026-08-01",
        method: "photo_estimate",
        bodyFatPercent: 17.5,
        bodyFatMinPercent: 16,
        bodyFatMaxPercent: 19,
      }),
    ];
    const r = computeCortexBodyFatEstimate(selectCortexBodyFatInputs(rows, TODAY, MAX_AGE_DAYS));
    expect(r.disagreement).toBe(true);
    expect(r.usableForAutomaticAdjustment).toBe(false);
  });

  // I. Plusieurs mensurations → seule la plus récente contribue.
  it("I — plusieurs mensurations → seule la plus récente exploitable contribue", () => {
    const rows: CortexBodyFatCandidate[] = [
      candidate({ date: "2026-08-01", method: "measurements", bodyFatPercent: 15 }),
      candidate({ date: "2026-07-01", method: "measurements", bodyFatPercent: 20 }),
      candidate({ date: "2026-06-01", method: "measurements", bodyFatPercent: 25 }),
    ];
    const inputs = selectCortexBodyFatInputs(rows, TODAY, MAX_AGE_DAYS);
    expect(inputs.measurements).toEqual({ date: "2026-08-01", bodyFatPercent: 15 });
  });

  // J. Plusieurs photos → seule la plus récente contribue.
  it("J — plusieurs analyses photo → seule la plus récente exploitable contribue", () => {
    const rows: CortexBodyFatCandidate[] = [
      candidate({
        date: "2026-08-01",
        method: "photo_estimate",
        bodyFatPercent: 15.5,
        bodyFatMinPercent: 14,
        bodyFatMaxPercent: 17,
      }),
      candidate({
        date: "2026-06-01",
        method: "photo_estimate",
        bodyFatPercent: 20,
        bodyFatMinPercent: 18,
        bodyFatMaxPercent: 22,
      }),
    ];
    const inputs = selectCortexBodyFatInputs(rows, TODAY, MAX_AGE_DAYS);
    expect(inputs.photo).toEqual({
      date: "2026-08-01",
      minPercent: 14,
      maxPercent: 17,
      referencePercent: 15.5,
    });
  });

  // K. Photo avec fourchette → min/max réellement utilisés.
  it("K — la fourchette photo (min/max) est réellement utilisée, pas seulement le midpoint", () => {
    const rows: CortexBodyFatCandidate[] = [
      candidate({
        date: "2026-08-01",
        method: "photo_estimate",
        bodyFatPercent: 15.5,
        bodyFatMinPercent: 14,
        bodyFatMaxPercent: 17,
      }),
    ];
    const inputs = selectCortexBodyFatInputs(rows, TODAY, MAX_AGE_DAYS);
    const r = computeCortexBodyFatEstimate(inputs);
    expect(r.minPercent).toBe(14);
    expect(r.maxPercent).toBe(17);
  });

  // L. Mensuration hors fenêtre de récence → exclue.
  it("L — mensuration au-delà de la fenêtre de récence → exclue", () => {
    const rows: CortexBodyFatCandidate[] = [
      candidate({ date: "2026-01-01", method: "measurements", bodyFatPercent: 15 }),
    ];
    const inputs = selectCortexBodyFatInputs(rows, TODAY, MAX_AGE_DAYS);
    expect(inputs.measurements).toBeNull();
  });

  // M. Photo hors fenêtre de récence → exclue.
  it("M — photo au-delà de la fenêtre de récence → exclue", () => {
    const rows: CortexBodyFatCandidate[] = [
      candidate({
        date: "2026-01-01",
        method: "photo_estimate",
        bodyFatPercent: 15.5,
        bodyFatMinPercent: 14,
        bodyFatMaxPercent: 17,
      }),
    ];
    const inputs = selectCortexBodyFatInputs(rows, TODAY, MAX_AGE_DAYS);
    expect(inputs.photo).toBeNull();
  });
});

describe("describeCortexBodyFatSources", () => {
  it("aucune méthode → 'Aucune'", () => {
    expect(describeCortexBodyFatSources([])).toBe("Aucune");
  });
  it("mensurations seules → 'Mensurations'", () => {
    expect(describeCortexBodyFatSources(["measurements"])).toBe("Mensurations");
  });
  it("photos seules → 'Photos'", () => {
    expect(describeCortexBodyFatSources(["photo_estimate"])).toBe("Photos");
  });
  it("les deux → 'Mensurations + Photos'", () => {
    expect(describeCortexBodyFatSources(["measurements", "photo_estimate"])).toBe(
      "Mensurations + Photos",
    );
  });
});

describe("CORTEX_BODY_FAT_THRESHOLDS — seuils centralisés et documentés", () => {
  it("les seuils sont des constantes nommées, pas des nombres dispersés", () => {
    expect(CORTEX_BODY_FAT_THRESHOLDS.MEASUREMENTS_CONSENSUS_TOLERANCE_PERCENT).toBe(2.0);
    expect(CORTEX_BODY_FAT_THRESHOLDS.STALE_CROSS_METHOD_GAP_DAYS).toBe(30);
  });
});
