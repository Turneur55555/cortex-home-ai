import { describe, expect, it } from "vitest";
import { validatePhysicalGoalInput, type PhysicalGoalInput } from "./physicalGoal";

function base(overrides: Partial<PhysicalGoalInput> = {}): PhysicalGoalInput {
  return {
    goal: "fat_loss",
    targetRate: "moderate",
    targets: { targetWeightKg: null, targetBodyFatPercent: null },
    starting: { startingWeightKg: 80, startingBodyFatPercent: 20 },
    ...overrides,
  };
}

describe("validatePhysicalGoalInput — objectifs supportés (§2/§47)", () => {
  it("fat_loss sans cible précise → valide (§3/§30 : Cortex fonctionne sans)", () => {
    expect(validatePhysicalGoalInput(base())).toEqual({ status: "valid" });
  });

  it("maintenance sans rythme ni cible → valide", () => {
    expect(
      validatePhysicalGoalInput(base({ goal: "maintenance", targetRate: null })),
    ).toEqual({ status: "valid" });
  });

  it("muscle_gain avec rythme valide → valide", () => {
    expect(
      validatePhysicalGoalInput(base({ goal: "muscle_gain", targetRate: "slow" })),
    ).toEqual({ status: "valid" });
  });

  it("objectif inconnu → invalide", () => {
    const result = validatePhysicalGoalInput(base({ goal: "unknown" as never }));
    expect(result.status).toBe("invalid");
  });
});

describe("validatePhysicalGoalInput — poids/BF cible (§3/§4/§6)", () => {
  it("poids cible seul → valide", () => {
    expect(
      validatePhysicalGoalInput(
        base({ targets: { targetWeightKg: 72, targetBodyFatPercent: null } }),
      ),
    ).toEqual({ status: "valid" });
  });

  it("BF cible seul → valide", () => {
    expect(
      validatePhysicalGoalInput(
        base({ targets: { targetWeightKg: null, targetBodyFatPercent: 15 } }),
      ),
    ).toEqual({ status: "valid" });
  });

  it("poids ET BF cible → valide", () => {
    expect(
      validatePhysicalGoalInput(base({ targets: { targetWeightKg: 72, targetBodyFatPercent: 15 } })),
    ).toEqual({ status: "valid" });
  });

  it("aucun des deux → valide", () => {
    expect(
      validatePhysicalGoalInput(base({ targets: { targetWeightKg: null, targetBodyFatPercent: null } })),
    ).toEqual({ status: "valid" });
  });
});

describe("validatePhysicalGoalInput — refus propre des données invalides (§7)", () => {
  it("poids cible NaN/Infinity/négatif/hors bornes → invalide", () => {
    for (const targetWeightKg of [NaN, Infinity, -10, 0, 1000]) {
      const result = validatePhysicalGoalInput(base({ targets: { targetWeightKg, targetBodyFatPercent: null } }));
      expect(result.status).toBe("invalid");
    }
  });

  it("BF cible hors bornes 1-70 → invalide", () => {
    for (const targetBodyFatPercent of [0, 90, NaN]) {
      const result = validatePhysicalGoalInput(
        base({ targets: { targetWeightKg: null, targetBodyFatPercent } }),
      );
      expect(result.status).toBe("invalid");
    }
  });

  it("§7 — fat_loss avec poids cible nettement supérieur au poids de départ → contradiction détectée", () => {
    const result = validatePhysicalGoalInput(
      base({ targets: { targetWeightKg: 90, targetBodyFatPercent: null } }),
    );
    expect(result.status).toBe("invalid");
  });

  it("muscle_gain avec poids cible inférieur au poids de départ → contradiction détectée", () => {
    const result = validatePhysicalGoalInput(
      base({ goal: "muscle_gain", targetRate: "slow", targets: { targetWeightKg: 70, targetBodyFatPercent: null } }),
    );
    expect(result.status).toBe("invalid");
  });

  it("fat_loss avec BF cible supérieur au BF de départ → contradiction détectée", () => {
    const result = validatePhysicalGoalInput(
      base({ targets: { targetWeightKg: null, targetBodyFatPercent: 25 } }),
    );
    expect(result.status).toBe("invalid");
  });

  it("rythme incompatible avec l'objectif (fast pour muscle_gain) → invalide", () => {
    const result = validatePhysicalGoalInput(
      base({ goal: "muscle_gain", targetRate: "fast" as never }),
    );
    expect(result.status).toBe("invalid");
  });

  it("maintenance avec un rythme fourni → invalide", () => {
    const result = validatePhysicalGoalInput(base({ goal: "maintenance", targetRate: "moderate" }));
    expect(result.status).toBe("invalid");
  });

  it("poids de départ inconnu → aucune contradiction ne peut être détectée, reste valide", () => {
    const result = validatePhysicalGoalInput(
      base({
        targets: { targetWeightKg: 90, targetBodyFatPercent: null },
        starting: { startingWeightKg: null, startingBodyFatPercent: null },
      }),
    );
    expect(result.status).toBe("valid");
  });
});
