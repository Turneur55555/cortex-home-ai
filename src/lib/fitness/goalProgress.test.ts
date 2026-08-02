import { describe, expect, it } from "vitest";
import {
  evaluateGoalProgress,
  GOAL_PROGRESS_MIN_MEASUREMENTS,
  GOAL_PROGRESS_MIN_WINDOW_DAYS,
  GOAL_PROGRESS_TOLERANCE_PERCENT,
  isWeightGoalLikelyReached,
  type GoalProgressInput,
} from "./goalProgress";

function base(overrides: Partial<GoalProgressInput> = {}): GoalProgressInput {
  return {
    goal: "fat_loss",
    weeklyTargetChangeKg: -0.5,
    maintenanceToleranceKg: null,
    observedWeeklyTrendKg: -0.5,
    measurementCount: GOAL_PROGRESS_MIN_MEASUREMENTS,
    windowCalendarDays: GOAL_PROGRESS_MIN_WINDOW_DAYS,
    ...overrides,
  };
}

describe("evaluateGoalProgress — données insuffisantes (§26/§51)", () => {
  it("mesures insuffisantes → insufficient_data, jamais fabriqué en on_track", () => {
    const result = evaluateGoalProgress(base({ measurementCount: GOAL_PROGRESS_MIN_MEASUREMENTS - 1 }));
    expect(result.state).toBe("insufficient_data");
  });

  it("fenêtre trop courte → insufficient_data (§27/§52 : pas de jugement sur 24h/quelques jours)", () => {
    const result = evaluateGoalProgress(base({ windowCalendarDays: GOAL_PROGRESS_MIN_WINDOW_DAYS - 1 }));
    expect(result.state).toBe("insufficient_data");
  });

  it("§52 — tendance lissée null (une seule pesée isolée n'a pas encore produit de régression) → insufficient_data", () => {
    const result = evaluateGoalProgress(base({ observedWeeklyTrendKg: null }));
    expect(result.state).toBe("insufficient_data");
  });

  it("rythme cible indisponible → insufficient_data", () => {
    const result = evaluateGoalProgress(base({ weeklyTargetChangeKg: null }));
    expect(result.state).toBe("insufficient_data");
  });
});

describe("evaluateGoalProgress — fat_loss/muscle_gain (§25/§51)", () => {
  it("progression exactement au rythme visé → on_track", () => {
    expect(evaluateGoalProgress(base()).state).toBe("on_track");
  });

  it(`§25 — écart de ${GOAL_PROGRESS_TOLERANCE_PERCENT - 5}% (dans la tolérance) → on_track, pas "behind"`, () => {
    const result = evaluateGoalProgress(
      base({ weeklyTargetChangeKg: -0.5, observedWeeklyTrendKg: -0.48 }),
    );
    expect(result.state).toBe("on_track");
  });

  it("progression nettement plus rapide que la cible → ahead", () => {
    const result = evaluateGoalProgress(
      base({ weeklyTargetChangeKg: -0.5, observedWeeklyTrendKg: -0.9 }),
    );
    expect(result.state).toBe("ahead");
  });

  it("progression nettement plus lente que la cible (mais bon sens) → behind", () => {
    const result = evaluateGoalProgress(
      base({ weeklyTargetChangeKg: -0.5, observedWeeklyTrendKg: -0.1 }),
    );
    expect(result.state).toBe("behind");
  });

  it("tendance dans le sens opposé à l'objectif → behind", () => {
    const result = evaluateGoalProgress(
      base({ goal: "fat_loss", weeklyTargetChangeKg: -0.5, observedWeeklyTrendKg: 0.3 }),
    );
    expect(result.state).toBe("behind");
  });

  it("muscle_gain : mêmes règles avec des signes positifs", () => {
    const result = evaluateGoalProgress(
      base({ goal: "muscle_gain", weeklyTargetChangeKg: 0.25, observedWeeklyTrendKg: 0.25 }),
    );
    expect(result.state).toBe("on_track");
  });

  it("plateau quasi-nul → maintaining, pas 'behind' punitif", () => {
    const result = evaluateGoalProgress(
      base({ weeklyTargetChangeKg: -0.5, observedWeeklyTrendKg: 0.01 }),
    );
    expect(result.state).toBe("maintaining");
  });
});

describe("evaluateGoalProgress — maintenance (§12/§44/§51)", () => {
  it("poids stable dans la zone → maintaining", () => {
    const result = evaluateGoalProgress(
      base({ goal: "maintenance", weeklyTargetChangeKg: null, maintenanceToleranceKg: 1, observedWeeklyTrendKg: 0.3 }),
    );
    expect(result.state).toBe("maintaining");
  });

  it("dérive hors zone → état distinct de maintaining, jamais un faux on_track", () => {
    const result = evaluateGoalProgress(
      base({ goal: "maintenance", weeklyTargetChangeKg: null, maintenanceToleranceKg: 1, observedWeeklyTrendKg: 2 }),
    );
    expect(result.state).not.toBe("maintaining");
    expect(result.state).not.toBe("on_track");
  });
});

describe("evaluateGoalProgress — fluctuation isolée (§52)", () => {
  it("une variation ponctuelle ne suffit pas à faire basculer l'état si measurementCount reste faible", () => {
    // Une seule pesée extrême, mais measurementCount encore sous le seuil.
    const result = evaluateGoalProgress(
      base({ measurementCount: 1, observedWeeklyTrendKg: -3 }),
    );
    expect(result.state).toBe("insufficient_data");
  });
});

describe("evaluateGoalProgress — pureté (§54/§55/§57)", () => {
  it("fonction pure : mêmes entrées → même sortie, aucun effet de bord observable", () => {
    const input = base();
    const a = evaluateGoalProgress(input);
    const b = evaluateGoalProgress(input);
    expect(a).toEqual(b);
  });
});

describe("isWeightGoalLikelyReached — complétion (§43)", () => {
  it("poids lissé proche de la cible avec assez de mesures → true", () => {
    expect(
      isWeightGoalLikelyReached({
        targetWeightKg: 75,
        smoothedCurrentWeightKg: 75.2,
        measurementCount: GOAL_PROGRESS_MIN_MEASUREMENTS,
      }),
    ).toBe(true);
  });

  it("§43 — écart encore important → false, jamais atteint sur une pesée isolée favorable", () => {
    expect(
      isWeightGoalLikelyReached({
        targetWeightKg: 75,
        smoothedCurrentWeightKg: 78,
        measurementCount: GOAL_PROGRESS_MIN_MEASUREMENTS,
      }),
    ).toBe(false);
  });

  it("pas assez de mesures même si le poids lissé est proche → false", () => {
    expect(
      isWeightGoalLikelyReached({
        targetWeightKg: 75,
        smoothedCurrentWeightKg: 75.1,
        measurementCount: 1,
      }),
    ).toBe(false);
  });

  it("cible ou poids lissé absent → false", () => {
    expect(
      isWeightGoalLikelyReached({
        targetWeightKg: null,
        smoothedCurrentWeightKg: 75,
        measurementCount: 10,
      }),
    ).toBe(false);
  });
});
