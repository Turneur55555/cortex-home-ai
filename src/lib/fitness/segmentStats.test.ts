import { describe, expect, it } from "vitest";
import {
  segmentBaseLabel,
  segmentTypeKey,
  computeSegmentStats,
  buildSegmentNarrative,
  type SegmentInstance,
} from "./segmentStats";

describe("segmentBaseLabel / segmentTypeKey", () => {
  it("retire le suffixe de répétition i/n", () => {
    expect(segmentBaseLabel("400m allure 5 km 3/8")).toBe("400m allure 5 km");
    expect(segmentBaseLabel("Montée 2/6")).toBe("Montée");
  });

  it("laisse inchangé un libellé sans suffixe", () => {
    expect(segmentBaseLabel("Récupération trottinée")).toBe("Récupération trottinée");
    expect(segmentBaseLabel("Tempo")).toBe("Tempo");
  });

  it("normalise accents/casse pour l'identité", () => {
    expect(segmentTypeKey("Récupération trottinée")).toBe(segmentTypeKey("recuperation TROTTINEE"));
    expect(segmentTypeKey("400m allure 5 km 1/8")).toBe(segmentTypeKey("400M Allure 5 KM 7/8"));
  });
});

describe("computeSegmentStats", () => {
  const make = (
    date: string,
    metrics: Record<string, number | string>,
    completed = true,
  ): SegmentInstance => ({
    workoutId: `w-${date}`,
    date,
    label: "400m allure 5 km 1/8",
    metrics,
    completed,
  });

  it("retourne des stats vides sans données fictives quand aucune occurrence", () => {
    const stats = computeSegmentStats("400m allure 5 km", []);
    expect(stats.occurrences).toBe(0);
    expect(stats.metrics).toEqual([]);
    expect(stats.estimatedDuration).toBeNull();
    expect(stats.firstDate).toBeNull();
  });

  it("ignore les segments non complétés dans le comptage", () => {
    const stats = computeSegmentStats("Tempo", [
      make("2026-07-01", { distance_m: 1000 }, false),
      make("2026-07-02", { distance_m: 2000 }, true),
    ]);
    expect(stats.occurrences).toBe(1);
  });

  it("calcule le meilleur/dernier/progression pour l'allure (min = meilleur)", () => {
    const stats = computeSegmentStats("400m allure 5 km", [
      make("2026-07-01", { pace_min_per_km: 5.0 }),
      make("2026-07-05", { pace_min_per_km: 4.5 }),
      make("2026-07-10", { pace_min_per_km: 4.2 }),
    ]);
    const pace = stats.metrics.find((m) => m.key === "pace_min_per_km")!;
    expect(pace.best).toBe(4.2);
    expect(pace.latest).toBe(4.2);
    expect(pace.trend).toBe("up"); // allure plus rapide = amélioration
    expect(pace.progressionPct).toBeGreaterThan(0);
  });

  it("calcule le meilleur pour la distance (max = meilleur)", () => {
    const stats = computeSegmentStats("Sortie longue", [
      make("2026-07-01", { distance_m: 8000 }),
      make("2026-07-08", { distance_m: 12000 }),
    ]);
    const dist = stats.metrics.find((m) => m.key === "distance_m")!;
    expect(dist.best).toBe(12000);
    expect(dist.bestFormatted).toBe("12.00 km");
  });

  it("ignore les clés de métrique inconnues (zone, max_heart_rate)", () => {
    const stats = computeSegmentStats("Seuil", [
      make("2026-07-01", { zone: 4, max_heart_rate: 180 }),
    ]);
    expect(stats.metrics).toEqual([]);
  });

  it("calcule une durée estimée seulement quand distance ET allure existent", () => {
    const stats = computeSegmentStats("400m allure 5 km", [
      make("2026-07-01", { distance_m: 400, pace_min_per_km: 4.0 }),
    ]);
    expect(stats.estimatedDuration).not.toBeNull();
    expect(stats.estimatedDuration!.latest).toBeCloseTo(1.6, 5);
  });

  it("ne calcule pas de durée estimée si une seule des deux métriques est présente", () => {
    const stats = computeSegmentStats("Tempo", [make("2026-07-01", { distance_m: 5000 })]);
    expect(stats.estimatedDuration).toBeNull();
  });
});

describe("buildSegmentNarrative", () => {
  it("annonce l'absence de données sans rien inventer", () => {
    const stats = computeSegmentStats("400m allure 5 km", []);
    expect(buildSegmentNarrative(stats)).toMatch(/Pas encore réalisé/);
  });

  it("mentionne la progression réelle quand elle existe", () => {
    const stats = computeSegmentStats("400m allure 5 km", [
      {
        workoutId: "1",
        date: "2026-07-01",
        label: "x",
        metrics: { pace_min_per_km: 5.0 },
        completed: true,
      },
      {
        workoutId: "2",
        date: "2026-07-08",
        label: "x",
        metrics: { pace_min_per_km: 4.0 },
        completed: true,
      },
    ]);
    const text = buildSegmentNarrative(stats);
    expect(text).toMatch(/Réalisé 2 fois/);
    expect(text).toMatch(/meilleure/);
  });
});
