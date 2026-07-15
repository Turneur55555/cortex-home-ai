import { describe, expect, it } from "vitest";
import {
  segmentBaseLabel,
  segmentTypeKey,
  groupByExerciseLabel,
  computeSegmentStats,
  buildSegmentNarrative,
  primaryColumnsForInstances,
  bestMetricValue,
  countNewRecords,
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

describe("groupByExerciseLabel", () => {
  it("regroupe les répétitions d'un même exercice sous une seule carte", () => {
    const items = [
      { label: "400m allure 5 km 1/8" },
      { label: "Récupération trottinée" },
      { label: "400m allure 5 km 2/8" },
      { label: "Récupération trottinée" },
      { label: "Retour au calme" },
    ];
    const groups = groupByExerciseLabel(items);
    expect(groups).toHaveLength(3);
    expect(groups[0].displayLabel).toBe("400m allure 5 km");
    expect(groups[0].instances).toHaveLength(2);
    expect(groups[1].displayLabel).toBe("Récupération trottinée");
    expect(groups[1].instances).toHaveLength(2);
    expect(groups[2].displayLabel).toBe("Retour au calme");
    expect(groups[2].instances).toHaveLength(1);
  });

  it("conserve l'ordre de première apparition de chaque groupe", () => {
    const items = [{ label: "B 1/2" }, { label: "A" }, { label: "B 2/2" }];
    const groups = groupByExerciseLabel(items);
    expect(groups.map((g) => g.displayLabel)).toEqual(["B", "A"]);
  });

  it("ne casse pas sur une liste vide", () => {
    expect(groupByExerciseLabel([])).toEqual([]);
  });
});

describe("computeSegmentStats", () => {
  const make = (
    date: string,
    metrics: Record<string, number | string>,
    completed = true,
    workoutId?: string,
  ): SegmentInstance => ({
    workoutId: workoutId ?? `w-${date}`,
    date,
    label: "400m allure 5 km 1/8",
    metrics,
    completed,
  });

  it("retourne des stats vides sans données fictives quand aucune occurrence", () => {
    const stats = computeSegmentStats("400m allure 5 km", []);
    expect(stats.sessionCount).toBe(0);
    expect(stats.totalReps).toBe(0);
    expect(stats.metrics).toEqual([]);
    expect(stats.estimatedDuration).toBeNull();
    expect(stats.firstDate).toBeNull();
    expect(stats.sessions).toEqual([]);
  });

  it("ignore les segments non complétés dans le comptage", () => {
    const stats = computeSegmentStats("Tempo", [
      make("2026-07-01", { distance_m: 1000 }, false),
      make("2026-07-02", { distance_m: 2000 }, true),
    ]);
    expect(stats.sessionCount).toBe(1);
  });

  it("regroupe plusieurs répétitions de la MÊME séance en UNE seule réalisation", () => {
    // 8 répétitions d'un fractionné, toutes dans la même séance (même
    // workoutId) — doit compter comme 1 séance, 8 répétitions au total,
    // exactement comme musculation compte 1 exercice avec 8 séries (pas
    // 8 exercices). Correction 2026-07-11.
    const reps = Array.from({ length: 8 }, (_, i) =>
      make("2026-07-10", { pace_min_per_km: 4.5 - i * 0.05 }, true, "w-fractionne-1"),
    );
    const stats = computeSegmentStats("400m allure 5 km", reps);
    expect(stats.sessionCount).toBe(1);
    expect(stats.totalReps).toBe(8);
    expect(stats.sessions).toHaveLength(1);
    expect(stats.sessions[0].repCount).toBe(8);
    // Meilleure allure de la séance = la plus rapide (min) des 8 répétitions.
    const pace = stats.metrics.find((m) => m.key === "pace_min_per_km")!;
    expect(pace.best).toBeCloseTo(4.5 - 7 * 0.05, 5);
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

  it("additionne la durée estimée de toutes les répétitions d'une même séance", () => {
    const stats = computeSegmentStats("400m allure 5 km", [
      make("2026-07-01", { distance_m: 400, pace_min_per_km: 4.0 }, true, "w-1"),
      make("2026-07-01", { distance_m: 400, pace_min_per_km: 5.0 }, true, "w-1"),
    ]);
    // (0.4*4.0) + (0.4*5.0) = 1.6 + 2.0 = 3.6
    expect(stats.estimatedDuration!.latest).toBeCloseTo(3.6, 5);
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

  it("mentionne le nombre de séances (pas de répétitions) et la progression réelle", () => {
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

describe("primaryColumnsForInstances", () => {
  it("ne retient que les métriques 'primary' réellement présentes, ordonnées par order", () => {
    const instances: Array<{ metrics: Record<string, number> }> = [
      { metrics: { pace_min_per_km: 5, incline_pct: 8 } },
      { metrics: { distance_m: 3000 } },
    ];
    const columns = primaryColumnsForInstances(instances);
    // distance_m (order 1) avant pace_min_per_km (order 2) ; incline_pct
    // (secondary) n'apparaît jamais comme colonne.
    expect(columns.map((c) => c.key)).toEqual(["distance_m", "pace_min_per_km"]);
    expect(columns[0].label).toBe("Distance");
  });

  it("retourne [] quand aucune métrique n'est primary (ex. Autre, texte libre)", () => {
    expect(primaryColumnsForInstances([{ metrics: { incline_pct: 5 } }])).toEqual([]);
    expect(primaryColumnsForInstances([{}])).toEqual([]);
    expect(primaryColumnsForInstances([])).toEqual([]);
  });
});

describe("bestMetricValue", () => {
  it("retient le minimum pour une métrique 'min' (allure)", () => {
    const instances = [
      { metrics: { pace_min_per_km: 5.2 } },
      { metrics: { pace_min_per_km: 4.8 } },
    ];
    expect(bestMetricValue(instances, "pace_min_per_km")).toEqual({
      value: 4.8,
      formatted: "4:48 min/km",
    });
  });

  it("retient le maximum pour une métrique 'max' (distance)", () => {
    const instances = [{ metrics: { distance_m: 1000 } }, { metrics: { distance_m: 3000 } }];
    const result = bestMetricValue(instances, "distance_m");
    expect(result?.value).toBe(3000);
    expect(result?.formatted).toBe("3.00 km");
  });

  it("retourne null sans donnée inventée quand la métrique est absente partout", () => {
    expect(bestMetricValue([{ metrics: { distance_m: 1000 } }], "pace_min_per_km")).toBeNull();
    expect(bestMetricValue([{}], "distance_m")).toBeNull();
  });

  it("retourne null pour une clé de métrique inconnue", () => {
    expect(bestMetricValue([{ metrics: { foo: 1 } }], "foo")).toBeNull();
  });
});

describe("countNewRecords (Phase C, lot V2 — tuile Records de clôture)", () => {
  it("compte un exercice qui bat strictement le meilleur historique (direction max)", () => {
    const segments = [{ label: "Rameur", metrics: { distance_m: 2500 } }];
    const history = [
      { label: "Rameur", metrics: { distance_m: 2000 } },
      { label: "Rameur", metrics: { distance_m: 2400 } },
    ];
    expect(countNewRecords(segments, history)).toBe(1);
  });

  it("respecte la direction min (allure : plus petit = meilleur)", () => {
    const segments = [{ label: "Tempo", metrics: { pace_min_per_km: 4.5 } }];
    expect(countNewRecords(segments, [{ label: "Tempo", metrics: { pace_min_per_km: 5 } }])).toBe(
      1,
    );
    expect(countNewRecords(segments, [{ label: "Tempo", metrics: { pace_min_per_km: 4 } }])).toBe(
      0,
    );
  });

  it("ne compte JAMAIS une égalité ni un exercice sans historique (pas de record gonflé)", () => {
    const segments = [
      { label: "Rameur", metrics: { distance_m: 2000 } },
      { label: "Vélo", metrics: { distance_m: 10000 } },
    ];
    const history = [{ label: "Rameur", metrics: { distance_m: 2000 } }];
    expect(countNewRecords(segments, history)).toBe(0);
  });

  it("regroupe les répétitions par type (suffixe i/n, accents/casse) avant comparaison", () => {
    const segments = [
      { label: "400m allure 5 km 1/2", metrics: { distance_m: 400 } },
      { label: "400m allure 5 km 2/2", metrics: { distance_m: 450 } },
    ];
    const history = [{ label: "400M ALLURE 5 KM 3/8", metrics: { distance_m: 420 } }];
    expect(countNewRecords(segments, history)).toBe(1);
  });

  it("ignore les groupes sans métrique primary et les valeurs non numériques", () => {
    const segments: Array<{ label: string; metrics: Record<string, number | string> }> = [
      { label: "Yoga", metrics: { note: "zen" } },
      { label: "Rameur", metrics: { distance_m: 2500 } },
    ];
    const history: Array<{ label: string; metrics: Record<string, number | string> }> = [
      { label: "Yoga", metrics: { note: "zen" } },
      { label: "Rameur", metrics: { distance_m: 2000 } },
    ];
    expect(countNewRecords(segments, history)).toBe(1);
  });
});
